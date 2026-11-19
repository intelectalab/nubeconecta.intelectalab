-- =====================================================================
-- hub — Plataforma de gestión de hosting, cloud, dominios y servicios
-- Esquema PostgreSQL 16+
--
-- Fuente de negocio : `docs/00-requerimientos.md` (secciones 4 y 7; las secciones 13 a 27 prevalecen)
-- Fuente de nombres : `docs/01-contrato-de-nombres.md` (tablas canónicas, estados, convenciones)
--
-- Convenciones aplicadas:
--   * Claves uuid (UUID v7 generado por la aplicación; gen_random_uuid() como respaldo).
--   * Toda tabla de negocio: id, organization_id, created_at, updated_at,
--     created_by, updated_by. Baja lógica con deleted_at. Campos personalizados en custom.
--   * Dinero: <campo>_minor bigint + currency char(3) IN ('PEN','USD').
--     Costos de proveedores: cost_currency con cualquier código ISO 4217.
--   * Estados: text + CHECK. Las transiciones viven en el código (una clase por entidad).
--   * Tablas solo de inserción: audit_events, secret_access_logs, setting_changes,
--     notification_deliveries, webhook_events, más dos auxiliares agregadas
--     (notification_delivery_events, webhook_event_processings) que guardan el
--     estado cambiante de avisos y webhooks sin modificar las filas originales,
    --     y ai_messages (registro de conversaciones del asistente, docs/00 §25),
--     legal_acceptances (aceptación de documentos legales), lead_stage_changes
--     (historial de etapas del CRM) y complaint_deletions (bitácora de hojas de
--     prueba eliminadas del Libro de Reclamaciones) y rich_text_versions (historial
--     del editor de textos enriquecido, docs/00 §27). Todas llevan REVOKE
--     UPDATE/DELETE a hub_app y un trigger que lo impide. complaint_responses
--     tampoco se edita; solo se borra junto con una hoja marcada como prueba.
--   * created_by / updated_by guardan users.id sin clave foránea (pueden ser
--     procesos del sistema, jobs o conectores).
--   * Ningún monto, plazo, porcentaje ni texto de aviso queda fijo aquí:
--     viven en settings o en tablas de configuración.
--
-- Este archivo debe ejecutarlo el usuario dueño del esquema (migraciones),
-- NO el rol de la aplicación hub_app: un dueño de tabla ignora los REVOKE.
-- =====================================================================

SET client_min_messages = warning;

-- ---------------------------------------------------------------------
-- Funciones de apoyo
-- ---------------------------------------------------------------------

-- Bloquea UPDATE, DELETE y TRUNCATE en tablas solo de inserción.
CREATE OR REPLACE FUNCTION hub_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'La tabla % es solo de inserción: % no permitido', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

COMMENT ON FUNCTION hub_forbid_mutation() IS
    'Impide UPDATE, DELETE y TRUNCATE en tablas solo de inserción (auditoría, bitácoras, avisos, webhooks).';

-- ===== Módulo Identity (IDN) =====

CREATE TABLE organizations (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name             text NOT NULL,
    slug             text NOT NULL UNIQUE,
    country          char(2) NOT NULL DEFAULT 'PE',
    default_currency char(3) NOT NULL DEFAULT 'PEN' CHECK (default_currency IN ('PEN','USD')),
    default_locale   text NOT NULL DEFAULT 'es',
    default_timezone text NOT NULL DEFAULT 'America/Lima',
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL
);
COMMENT ON TABLE organizations IS 'Empresa operadora dueña de los datos. Hoy existe una sola fila; prepara el sistema para SaaS (docs/00 §19).';

CREATE TABLE users (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    type                text NOT NULL CHECK (type IN ('staff','customer')),
    name                text NOT NULL,
    email               text NOT NULL,
    email_verified_at   timestamptz NULL,
    password_hash       text NULL,                -- Argon2id
    password_changed_at timestamptz NULL,
    mfa_secret          text NULL,                -- secreto TOTP cifrado por la aplicación
    mfa_enabled_at      timestamptz NULL,
    mfa_method          text NULL CHECK (mfa_method IN ('totp','email')),   -- segundo factor elegido (security.mfa.*)
    failed_login_count  smallint NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    locked_until        timestamptz NULL,         -- bloqueo por intentos (security.login_max_attempts, security.login_lockout_minutes)
    must_change_password boolean NOT NULL DEFAULT false,   -- contraseña vencida (security.password.expiry_days) o restablecida por el administrador
    locale              text NOT NULL DEFAULT 'es',
    timezone            text NOT NULL DEFAULT 'America/Lima',
    status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    last_login_at       timestamptz NULL,
    disabled_at     timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    -- El segundo factor activo tiene método; TOTP exige su secreto.
    CHECK ((mfa_method IS NULL) = (mfa_enabled_at IS NULL)),
    CHECK (mfa_method IS DISTINCT FROM 'totp' OR mfa_secret IS NOT NULL)
);
CREATE UNIQUE INDEX users_org_email_uq ON users (organization_id, lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX ON users (organization_id, type, status);
COMMENT ON TABLE users IS 'Usuarios del personal y de clientes (portal). Segundo factor por aplicación TOTP o por código al correo, obligatorio u opcional según la política de seguridad administrable (security.*).';

CREATE TABLE user_tokens (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    user_id         uuid NOT NULL REFERENCES users(id),
    purpose         text NOT NULL CHECK (purpose IN ('invitation','password_reset')),
    token_hash      char(64) NOT NULL UNIQUE,   -- sha256; el valor plano solo viaja en el correo
    expires_at      timestamptz NOT NULL,       -- invitación 72 h, restablecimiento 60 min (config hub.auth.*)
    consumed_at     timestamptz NULL,           -- un solo uso
    revoked_at      timestamptz NULL,           -- reemplazado por uno nuevo del mismo usuario y propósito
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON user_tokens (user_id, purpose) WHERE consumed_at IS NULL AND revoked_at IS NULL;
COMMENT ON TABLE user_tokens IS 'Tokens de un solo uso del portal: invitación para fijar la contraseña y restablecimiento de contraseña (solo hash, caducidad corta, uno vigente por usuario y propósito).';

CREATE TABLE roles (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    code            text NOT NULL,      -- admin, sales, finance, support, documentation, external_accountant, temp_technician, customer_admin, customer_user, o personalizados
    name            text NOT NULL,
    description     text NULL,
    audience        text NOT NULL CHECK (audience IN ('staff','customer')),
    is_system       boolean NOT NULL DEFAULT false,   -- roles del seeder: no se pueden borrar ni cambiar de código o audiencia
    copied_from_role_id uuid NULL REFERENCES roles(id),  -- rol tomado como base al copiar
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code)
);
COMMENT ON TABLE roles IS 'Roles por organización: iniciales del sistema (seeder, no borrables) y personalizados creados o copiados desde el panel.';

-- Los roles del sistema no se borran ni cambian de código, audiencia o marca de sistema; un rol personalizado no se vuelve de sistema.
CREATE OR REPLACE FUNCTION hub_role_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_system THEN
            RAISE EXCEPTION 'El rol % es del sistema y no se puede borrar', OLD.code USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.is_system IS DISTINCT FROM OLD.is_system
       OR (OLD.is_system AND (NEW.code <> OLD.code OR NEW.audience <> OLD.audience)) THEN
        RAISE EXCEPTION 'El rol % es del sistema: su código, audiencia y marca de sistema no cambian', OLD.code USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER roles_guard BEFORE UPDATE OR DELETE ON roles
    FOR EACH ROW EXECUTE FUNCTION hub_role_guard();

CREATE TABLE permissions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code         text NOT NULL UNIQUE CHECK (code ~ '^[a-z_]+\.[a-z_]+\.[a-z_]+$'),
    module       text NOT NULL,
    entity       text NOT NULL,
    action       text NOT NULL,
    description  text NULL,
    is_sensitive boolean NOT NULL DEFAULT false,   -- exige MFA reciente (reveal, execute, refund)
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
COMMENT ON TABLE permissions IS 'Catálogo global de permisos <modulo>.<entidad>.<accion>, definido por el código (sin organization_id).';

CREATE TABLE role_permissions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    role_id         uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   uuid NOT NULL REFERENCES permissions(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (role_id, permission_id)
);
COMMENT ON TABLE role_permissions IS 'Permisos asignados a cada rol (N:M); la matriz por módulo y acción del panel escribe aquí.';

-- Un rol de cliente solo recibe permisos portal.*; un rol del personal nunca los recibe.
CREATE OR REPLACE FUNCTION hub_role_permission_audience() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE aud text; pcode text;
BEGIN
    SELECT audience INTO aud FROM roles WHERE id = NEW.role_id;
    SELECT code INTO pcode FROM permissions WHERE id = NEW.permission_id;
    IF (aud = 'customer') <> (pcode LIKE 'portal.%') THEN
        RAISE EXCEPTION 'El permiso % no corresponde a un rol de audiencia %', pcode, aud USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER role_permissions_audience BEFORE INSERT OR UPDATE ON role_permissions
    FOR EACH ROW EXECUTE FUNCTION hub_role_permission_audience();

CREATE TABLE user_roles (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         uuid NOT NULL REFERENCES roles(id),
    expires_at      timestamptz NULL,   -- técnico temporal: acceso con vencimiento
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (user_id, role_id)
);
CREATE INDEX ON user_roles (organization_id, role_id);
COMMENT ON TABLE user_roles IS 'Roles de cada usuario (N:M), con vencimiento opcional para técnicos temporales.';

CREATE TABLE user_sessions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash text NOT NULL UNIQUE,
    ip                 inet NULL,
    user_agent         text NULL,
    device_label       text NULL,
    mfa_verified_at    timestamptz NULL,   -- "MFA reciente" para acciones sensibles
    last_activity_at   timestamptz NOT NULL DEFAULT now(),
    expires_at         timestamptz NOT NULL,
    revoked_at         timestamptz NULL,   -- cierre remoto
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON user_sessions (organization_id, user_id) WHERE revoked_at IS NULL;
COMMENT ON TABLE user_sessions IS 'Sesiones y dispositivos de cada usuario, con cierre remoto y marca de MFA reciente.';

CREATE TABLE mfa_recovery_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash       text NOT NULL,
    used_at         timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (user_id, code_hash)
);
COMMENT ON TABLE mfa_recovery_codes IS 'Códigos de recuperación de MFA (solo hash), de un solo uso.';

CREATE TABLE email_login_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose         text NOT NULL CHECK (purpose IN ('login','step_up','enroll')),
    code_hash       char(64) NOT NULL,           -- sha256 del código enviado; el código no se guarda
    sent_to         text NOT NULL,               -- correo de destino (el del usuario al enviar)
    expires_at      timestamptz NOT NULL,        -- según security.mfa.email_code_ttl_minutes
    max_attempts    smallint NOT NULL CHECK (max_attempts >= 1),   -- copia de security.mfa.email_code_max_attempts
    attempts        smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    consumed_at     timestamptz NULL,            -- usado: no vale otra vez
    invalidated_at  timestamptz NULL,            -- reemplazado por un código nuevo o agotados los intentos
    ip_hash         char(64) NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (expires_at > created_at),
    CHECK (attempts <= max_attempts),
    CHECK (consumed_at IS NULL OR invalidated_at IS NULL)
);
-- A lo sumo un código vigente por usuario y propósito.
CREATE UNIQUE INDEX email_login_codes_one_open_uq ON email_login_codes (user_id, purpose) WHERE consumed_at IS NULL AND invalidated_at IS NULL;
COMMENT ON TABLE email_login_codes IS 'Códigos de segundo factor enviados al correo (solo hash): vencen, admiten pocos intentos y se usan una sola vez.';

-- Un código consumido o invalidado no vuelve a valer, y no se consume vencido.
CREATE OR REPLACE FUNCTION hub_email_login_code_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.consumed_at IS NOT NULL OR OLD.invalidated_at IS NOT NULL THEN
        RAISE EXCEPTION 'El código de acceso ya se usó o fue invalidado' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.code_hash <> OLD.code_hash OR NEW.expires_at <> OLD.expires_at OR NEW.user_id <> OLD.user_id THEN
        RAISE EXCEPTION 'El código de acceso no se modifica: se emite uno nuevo' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.consumed_at IS NOT NULL AND NEW.consumed_at > OLD.expires_at THEN
        RAISE EXCEPTION 'El código de acceso venció' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER email_login_codes_guard BEFORE UPDATE ON email_login_codes
    FOR EACH ROW EXECUTE FUNCTION hub_email_login_code_guard();

CREATE TABLE trusted_devices (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_token_hash  char(64) NOT NULL UNIQUE,   -- sha256 de la cookie del dispositivo; el valor no se guarda
    label              text NULL,                  -- navegador y sistema reconocidos
    user_agent         text NULL,
    ip_hash            char(64) NULL,
    trusted_until      timestamptz NOT NULL,       -- según security.trusted_device_days
    last_used_at       timestamptz NULL,
    revoked_at         timestamptz NULL,
    revoked_by         uuid NULL REFERENCES users(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (trusted_until > created_at),
    CHECK (revoked_by IS NULL OR revoked_at IS NOT NULL)
);
CREATE INDEX ON trusted_devices (organization_id, user_id) WHERE revoked_at IS NULL;
COMMENT ON TABLE trusted_devices IS 'Dispositivos de confianza: dentro del plazo no piden el segundo factor al iniciar sesión (nunca para acciones sensibles); el usuario o el administrador los revoca.';

CREATE TABLE password_histories (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash   text NOT NULL,               -- Argon2id de una contraseña anterior
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON password_histories (organization_id, user_id, created_at DESC);
COMMENT ON TABLE password_histories IS 'Contraseñas anteriores (solo hash) para impedir reutilizar las últimas security.password.history_count; se depuran las que exceden ese número.';

CREATE TABLE audit_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    chain_seq       bigint NOT NULL,               -- posición en la cadena de la organización (la asigna el trigger)
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    actor_type      text NOT NULL CHECK (actor_type IN ('user','system','connector','api')),
    actor_id        uuid NULL,
    action          text NOT NULL,                 -- p. ej. invoice.issued, secret.revealed, setting.updated
    entity_type     text NOT NULL,
    entity_id       uuid NULL,
    customer_id     uuid NULL,                     -- para el historial del cliente (sin FK: la auditoría no se bloquea)
    ip              inet NULL,
    user_agent      text NULL,
    request_id      text NULL,
    before          jsonb NULL,
    after           jsonb NULL,
    metadata        jsonb NOT NULL DEFAULT '{}',
    prev_hash       char(64) NULL,                 -- hash del evento anterior de la organización
    hash            char(64) NOT NULL,             -- sha256(prev_hash || contenido canónico)
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid NULL,
    UNIQUE (organization_id, chain_seq)
);
CREATE INDEX ON audit_events (organization_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX ON audit_events (organization_id, actor_id, occurred_at DESC);
CREATE INDEX ON audit_events (organization_id, customer_id, occurred_at DESC) WHERE customer_id IS NOT NULL;
COMMENT ON TABLE audit_events IS 'Auditoría de solo inserción con encadenamiento por hash para detectar manipulación (docs/00 §4, §8).';

-- Contenido canónico de un evento (independiente de la zona horaria de la sesión).
CREATE OR REPLACE FUNCTION hub_audit_payload(e audit_events) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_build_object(
        'id', e.id, 'organization_id', e.organization_id, 'chain_seq', e.chain_seq,
        'occurred_at', to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'actor_type', e.actor_type, 'actor_id', e.actor_id, 'action', e.action,
        'entity_type', e.entity_type, 'entity_id', e.entity_id, 'customer_id', e.customer_id,
        'ip', host(e.ip), 'request_id', e.request_id,
        'before', e.before, 'after', e.after, 'metadata', e.metadata
    )::text
$$;

-- Asigna chain_seq, prev_hash y hash. Serializa por organización con un bloqueo
-- de transacción, de modo que la cadena sigue el orden real de confirmación.
CREATE OR REPLACE FUNCTION hub_audit_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    last_seq  bigint;
    last_hash char(64);
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('audit_events:' || NEW.organization_id::text, 0));
    SELECT a.chain_seq, a.hash INTO last_seq, last_hash
      FROM audit_events a
     WHERE a.organization_id = NEW.organization_id
     ORDER BY a.chain_seq DESC
     LIMIT 1;
    NEW.chain_seq := COALESCE(last_seq, 0) + 1;
    NEW.prev_hash := last_hash;
    NEW.hash := encode(sha256(convert_to(COALESCE(last_hash, '') || hub_audit_payload(NEW), 'UTF8')), 'hex');
    RETURN NEW;
END;
$$;

CREATE TRIGGER audit_events_chain BEFORE INSERT ON audit_events
    FOR EACH ROW EXECUTE FUNCTION hub_audit_chain();

-- Verifica la cadena de una organización. Devuelve el primer chain_seq roto o NULL si está íntegra.
CREATE OR REPLACE FUNCTION hub_audit_verify(p_organization_id uuid) RETURNS bigint
LANGUAGE plpgsql STABLE AS $$
DECLARE
    r        audit_events;
    expected char(64);
    prev     char(64) := NULL;
    n        bigint := 0;
BEGIN
    FOR r IN SELECT * FROM audit_events WHERE organization_id = p_organization_id ORDER BY chain_seq LOOP
        n := n + 1;
        expected := encode(sha256(convert_to(COALESCE(prev, '') || hub_audit_payload(r), 'UTF8')), 'hex');
        IF r.chain_seq <> n OR r.prev_hash IS DISTINCT FROM prev OR r.hash <> expected THEN
            RETURN r.chain_seq;
        END IF;
        prev := r.hash;
    END LOOP;
    RETURN NULL;
END;
$$;
COMMENT ON FUNCTION hub_audit_verify(uuid) IS 'Recorre la cadena de auditoría de una organización; devuelve el primer eslabón alterado o NULL.';

CREATE TABLE personal_access_tokens (
    id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,   -- tabla estándar de Laravel Sanctum
    organization_id  uuid NOT NULL REFERENCES organizations(id),             -- la fija el modelo al crear el token
    tokenable_type   text NOT NULL,                                          -- App\\Modules\\Identity\\Models\\User
    tokenable_id     uuid NOT NULL,
    name             text NOT NULL,
    token            char(64) NOT NULL UNIQUE,                               -- hash SHA-256; el valor plano se muestra una sola vez
    abilities        text NULL,                                              -- JSON: services:read, domains:read, invoices:read, tickets:read, tickets:write
    customer_id      uuid NULL,                                              -- FK al final (customers): token limitado a un cliente
    last_used_at     timestamptz NULL,
    expires_at       timestamptz NULL,
    created_at       timestamptz NULL DEFAULT now(),
    updated_at       timestamptz NULL DEFAULT now()
);
CREATE INDEX personal_access_tokens_tokenable_idx ON personal_access_tokens (tokenable_type, tokenable_id);
CREATE INDEX ON personal_access_tokens (organization_id, customer_id);
COMMENT ON TABLE personal_access_tokens IS 'Tokens bearer de la API pública (Laravel Sanctum). Expuesta como /admin/api-tokens con permisos identity.api_token.*; columnas organization_id y customer_id agregadas a la tabla estándar.';

CREATE TABLE idempotency_keys (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    key              text NOT NULL,
    scope            text NOT NULL,              -- método + ruta de la operación
    user_id          uuid NULL REFERENCES users(id),
    request_hash     char(64) NOT NULL,          -- misma clave con otro cuerpo => 422
    response_status  smallint NULL,
    response_body    jsonb NULL,
    locked_until     timestamptz NULL,
    completed_at     timestamptz NULL,
    expires_at       timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, scope, key)
);
CREATE INDEX ON idempotency_keys (expires_at);
COMMENT ON TABLE idempotency_keys IS 'Cabecera Idempotency-Key: hash de la petición y respuesta guardada para repeticiones (docs/00 §10).';

CREATE TABLE files (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    disk             text NOT NULL DEFAULT 's3',
    path             text NOT NULL,              -- incluye organization_id en la ruta
    original_name    text NOT NULL,
    mime_type        text NOT NULL,
    size_bytes       bigint NOT NULL CHECK (size_bytes >= 0),
    checksum_sha256  char(64) NULL,
    scan_status      text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','infected','failed')),
    visibility       text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','customer')),
    attachable_type  text NULL,
    attachable_id    uuid NULL,
    retention_until  date NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    UNIQUE (disk, path)
);
CREATE INDEX ON files (organization_id, attachable_type, attachable_id);
COMMENT ON TABLE files IS 'Archivos en almacenamiento S3: PDF, XML, CDR, vouchers, contratos, evidencias. Análisis antivirus en cola.';

CREATE TABLE tags (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    name            text NOT NULL,
    slug            text NOT NULL,
    color           text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, slug)
);
COMMENT ON TABLE tags IS 'Etiquetas libres de la organización.';

CREATE TABLE taggables (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    tag_id          uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    taggable_type   text NOT NULL,
    taggable_id     uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (tag_id, taggable_type, taggable_id)
);
CREATE INDEX ON taggables (organization_id, taggable_type, taggable_id);
COMMENT ON TABLE taggables IS 'Asignación polimórfica de etiquetas a cualquier entidad.';

CREATE TABLE custom_field_definitions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    entity_type         text NOT NULL,           -- customers, services, domains, ...
    key                 text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    label               jsonb NOT NULL,          -- {"es": "...", "en": "..."}
    field_type          text NOT NULL CHECK (field_type IN ('text','number','date','boolean','select','multiselect','url')),
    options             jsonb NOT NULL DEFAULT '[]',
    is_required         boolean NOT NULL DEFAULT false,
    visible_to_customer boolean NOT NULL DEFAULT false,
    sort_order          integer NOT NULL DEFAULT 0,
    filterable      boolean NOT NULL DEFAULT false,
    exportable      boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, entity_type, key)
);
COMMENT ON TABLE custom_field_definitions IS 'Definición de campos personalizados; los valores van en la columna custom (JSONB) de cada entidad.';

CREATE TABLE code_sequences (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    entity          text NOT NULL,              -- customer, ticket, quote, contract, order, task, ...
    prefix          text NOT NULL,              -- CLI, TKT, COT, CTR, PED, TAR, ...
    padding         smallint NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 12),
    next_value      bigint NOT NULL DEFAULT 1 CHECK (next_value >= 1),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, entity)
);
COMMENT ON TABLE code_sequences IS 'Correlativos legibles por tipo de entidad (CLI-000123). No aplica a comprobantes fiscales, que usan document_series.';

-- Toma el siguiente correlativo legible con bloqueo de fila (dentro de la transacción del llamador).
CREATE OR REPLACE FUNCTION hub_next_code(p_organization_id uuid, p_entity text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v bigint; p text; pad smallint;
BEGIN
    UPDATE code_sequences SET next_value = next_value + 1, updated_at = now()
     WHERE organization_id = p_organization_id AND entity = p_entity
     RETURNING next_value - 1, prefix, padding INTO v, p, pad;
    IF v IS NULL THEN
        RAISE EXCEPTION 'No existe correlativo para % en la organización %', p_entity, p_organization_id;
    END IF;
    RETURN p || '-' || lpad(v::text, pad, '0');
END;
$$;

-- ===== Módulo Settings (CFG) =====

CREATE TABLE settings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    key             text NOT NULL,              -- p. ej. billing.invoice_generation_days, services.suspension.days_after_due
    scope_type      text NOT NULL CHECK (scope_type IN ('global','brand','product','customer','contract')),
    scope_id        uuid NULL,
    value           jsonb NOT NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK ((scope_type = 'global') = (scope_id IS NULL)),
    UNIQUE NULLS NOT DISTINCT (organization_id, key, scope_type, scope_id)
);
CREATE INDEX ON settings (organization_id, scope_type, scope_id);
COMMENT ON TABLE settings IS 'Centro de configuración: cada ajuste a nivel general y sobrescribible por marca, producto, cliente o contrato; gana el más específico (docs/00 §23).';

CREATE TABLE setting_changes (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    setting_id         uuid NULL REFERENCES settings(id) ON DELETE SET NULL,
    key                text NOT NULL,
    scope_type         text NOT NULL CHECK (scope_type IN ('global','brand','product','customer','contract')),
    scope_id           uuid NULL,
    old_value          jsonb NULL,
    new_value          jsonb NULL,
    reason             text NULL,
    reverts_change_id  uuid NULL REFERENCES setting_changes(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid NULL
);
CREATE INDEX ON setting_changes (organization_id, key, created_at DESC);
COMMENT ON TABLE setting_changes IS 'Historial de solo inserción de cambios de ajustes: quién, cuándo, valor anterior y nuevo; permite revertir.';

CREATE TABLE holidays (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    country         char(2) NOT NULL DEFAULT 'PE',
    date            date NOT NULL,
    name            text NOT NULL,
    recurring       boolean NOT NULL DEFAULT false,  -- se repite cada año en la misma fecha
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, country, date)
);
COMMENT ON TABLE holidays IS 'Feriados por país; el SLA y la cobranza los descuentan.';

CREATE TABLE business_hours (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    calendar        text NOT NULL DEFAULT 'default',
    timezone        text NOT NULL DEFAULT 'America/Lima',
    weekday         smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),  -- ISO: 1 lunes … 7 domingo
    opens_at        time NOT NULL,
    closes_at       time NOT NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (closes_at > opens_at),
    UNIQUE (organization_id, calendar, weekday, opens_at)
);
COMMENT ON TABLE business_hours IS 'Horario de atención por día de la semana; el SLA corre solo dentro de él.';

-- ===== Módulo Brands (BRD) =====

CREATE TABLE legal_entities (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL REFERENCES organizations(id),
    legal_name           text NOT NULL,
    tax_id_type          text NOT NULL DEFAULT 'ruc',
    tax_id               text NOT NULL,
    country              char(2) NOT NULL DEFAULT 'PE',
    currency             char(3) NOT NULL DEFAULT 'PEN' CHECK (currency IN ('PEN','USD')),
    fiscal_address       text NULL,
    is_services_exporter boolean NOT NULL DEFAULT false,   -- Registro de Exportadores de Servicios
    einvoice_provider_ref text NULL,  -- identificador del emisor ante el OSE/PSE
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, country, tax_id)
);
COMMENT ON TABLE legal_entities IS 'Entidad que emite los comprobantes (un solo RUC hoy) con sus series, impuestos y cuentas bancarias.';

CREATE TABLE brands (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         uuid NOT NULL REFERENCES organizations(id),
    code                    text NOT NULL,
    name                    text NOT NULL,
    domain                  text NULL,
    portal_domain           text NULL,
    theme                   jsonb NOT NULL DEFAULT '{}',   -- caché de los tokens publicados en brand_theme_versions (portal, panel y correos)
    logo_file_id            uuid NULL REFERENCES files(id),
    default_legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
    email_from              text NULL,
    support_email           text NULL,
    status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    locale          text NOT NULL DEFAULT 'es',      -- idioma por defecto de plantillas y portal de la marca,
    email_from_name text NULL,
    status_page_slug text NULL,  -- portal de estado público de la marca
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    UNIQUE (organization_id, code)
);
COMMENT ON TABLE brands IS 'Marcas comerciales (4 hoy) bajo la misma entidad emisora; cambian catálogo, plantillas, portal y correos.';

CREATE TABLE bank_accounts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    legal_entity_id  uuid NOT NULL REFERENCES legal_entities(id),
    brand_id         uuid NULL REFERENCES brands(id),
    bank_name        text NOT NULL,
    account_type     text NOT NULL CHECK (account_type IN ('checking','savings','detraction')),  -- detraction: Banco de la Nación
    account_number   text NOT NULL,
    cci              text NULL,
    currency         char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    show_on_invoice  boolean NOT NULL DEFAULT true,
    is_active        boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, bank_name, account_number)
);
COMMENT ON TABLE bank_accounts IS 'Cuentas bancarias de la entidad emisora, incluida la cuenta de detracciones del Banco de la Nación.';

CREATE TABLE document_series (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
    document_type   text NOT NULL CHECK (document_type IN ('invoice','receipt','credit_note','debit_note')),
    series          text NOT NULL CHECK (series ~ '^[A-Z0-9]{4}$'),   -- F001, B001, FC01, ...
    next_number     integer NOT NULL DEFAULT 1 CHECK (next_number >= 1),
    is_active       boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, legal_entity_id, series)
);
COMMENT ON TABLE document_series IS 'Series de comprobantes por entidad emisora; la numeración se toma con bloqueo de esta fila dentro de la transacción de emisión.';

-- Toma el siguiente número de una serie. El UPDATE bloquea la fila hasta el fin
-- de la transacción, así dos emisiones simultáneas nunca obtienen el mismo número.
CREATE OR REPLACE FUNCTION hub_take_document_number(p_series_id uuid) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
    UPDATE document_series SET next_number = next_number + 1, updated_at = now()
     WHERE id = p_series_id AND is_active
     RETURNING next_number - 1 INTO n;
    IF n IS NULL THEN
        RAISE EXCEPTION 'Serie % inexistente o inactiva', p_series_id;
    END IF;
    RETURN n;
END;
$$;

-- ===== Módulo Customers (CUS) =====

CREATE TABLE customers (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES organizations(id),
    code                  text NOT NULL,                 -- CLI-000123
    type                  text NOT NULL CHECK (type IN ('company','individual')),
    legal_name            text NOT NULL,
    trade_name            text NULL,
    normalized_name       text NOT NULL,                 -- para deduplicación
    tax_id_type           text NULL CHECK (tax_id_type IN ('ruc','dni','ce','passport','foreign_tax_id','other')),
    tax_id                text NULL,
    country               char(2) NOT NULL,
    currency              char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    locale                text NOT NULL DEFAULT 'es',
    timezone              text NOT NULL DEFAULT 'America/Lima',
    email                 text NULL,
    phone                 text NULL,
    address               text NULL,
    status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    tax_treatment         text NOT NULL DEFAULT 'taxed' CHECK (tax_treatment IN ('taxed','export')),
    is_withholding_agent  boolean NOT NULL DEFAULT false,  -- agente de retención de IGV
    invoice_consolidation text NOT NULL DEFAULT 'consolidated' CHECK (invoice_consolidation IN ('consolidated','per_service')),
    origin_brand_id       uuid NOT NULL REFERENCES brands(id),
    account_manager_id    uuid NULL REFERENCES users(id),
    custom                jsonb NOT NULL DEFAULT '{}',
    merged_into_id  uuid NULL REFERENCES customers(id),  -- fusión de duplicados
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    UNIQUE (organization_id, code)
);
CREATE UNIQUE INDEX customers_org_taxid_uq ON customers (organization_id, tax_id_type, tax_id)
    WHERE deleted_at IS NULL AND tax_id IS NOT NULL;
CREATE INDEX ON customers (organization_id, normalized_name);
CREATE INDEX ON customers (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ON customers (organization_id, lower(email));
COMMENT ON TABLE customers IS 'Cliente único en todo el sistema; puede tener servicios de varias marcas. Dedupe por documento fiscal, correo y nombre normalizado.';

CREATE TABLE contacts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    customer_id     uuid NOT NULL REFERENCES customers(id),
    name            text NOT NULL,
    email           text NULL,
    phone           text NULL,
    whatsapp        text NULL,
    roles           text[] NOT NULL DEFAULT '{}'
                    CHECK (roles <@ ARRAY['billing','administrative','technical','authorized']::text[]),
    is_primary      boolean NOT NULL DEFAULT false,
    locale          text NULL,
    user_id         uuid NULL UNIQUE REFERENCES users(id),   -- acceso al portal por contacto
    custom          jsonb NOT NULL DEFAULT '{}',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL
);
CREATE INDEX ON contacts (organization_id, customer_id) WHERE deleted_at IS NULL;
CREATE INDEX ON contacts (organization_id, lower(email));
CREATE INDEX ON contacts USING gin (roles);
COMMENT ON TABLE contacts IS 'Contactos del cliente por rol (facturación, administrativo, técnico, autorizado); cada aviso va al rol que corresponde.';

CREATE TABLE communication_consents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    contact_id      uuid NULL REFERENCES contacts(id),
    lead_id         uuid NULL,                       -- FK al final (leads se define en Sales)
    email           text NULL,
    phone           text NULL,
    channel         text NOT NULL CHECK (channel IN ('all','email','whatsapp','sms','phone')),
    purpose         text NOT NULL CHECK (purpose IN ('marketing','terms','privacy')),
    granted         boolean NOT NULL,
    source          text NOT NULL CHECK (source IN ('portal','form','elastic_email','whatsapp','manual','import','checkout')),
    evidence        jsonb NOT NULL DEFAULT '{}',     -- versión de términos, IP, formulario
    recorded_at     timestamptz NOT NULL DEFAULT now(),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (contact_id IS NOT NULL OR lead_id IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX ON communication_consents (organization_id, contact_id, purpose, recorded_at DESC);
CREATE INDEX ON communication_consents (organization_id, lower(email));
COMMENT ON TABLE communication_consents IS 'Consentimientos y bajas de comunicaciones comerciales y aceptación de términos; una baja se respeta en todos los canales.';

CREATE TABLE customer_notes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    customer_id     uuid NOT NULL REFERENCES customers(id),
    body            text NOT NULL,
    is_pinned       boolean NOT NULL DEFAULT false,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL
);
CREATE INDEX ON customer_notes (organization_id, customer_id, created_at DESC);
COMMENT ON TABLE customer_notes IS 'Notas internas sobre el cliente; nunca viajan en la API del portal.';

-- ===== Módulo Catalog (CAT) =====

CREATE TABLE product_categories (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    parent_id       uuid NULL REFERENCES product_categories(id),
    code            text NOT NULL,
    name            text NOT NULL,
    kind            text NOT NULL DEFAULT 'custom' CHECK (kind IN ('shared_hosting','reseller_hosting','vps','dedicated_server','cloud','domain','ssl','email','website','online_store','moodle','license','support','custom_development','custom')),
    shortcode_type  text NULL,                   -- valor del atributo tipo de [hub_planes] y [hub_comparador] (hosting, reseller, vps, ...)
    is_system       boolean NOT NULL DEFAULT false,   -- categorías iniciales del catálogo completo: no se borran ni cambian de tipo
    sort_order      integer NOT NULL DEFAULT 0,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code),
    CHECK (shortcode_type IS NULL OR shortcode_type ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CHECK (NOT is_system OR kind <> 'custom')
);
-- Una sola categoría raíz por tipo fijo; las categorías nuevas que crea el administrador son de tipo custom.
CREATE UNIQUE INDEX product_categories_kind_uq ON product_categories (organization_id, kind) WHERE kind <> 'custom' AND parent_id IS NULL;
CREATE UNIQUE INDEX product_categories_shortcode_uq ON product_categories (organization_id, shortcode_type) WHERE shortcode_type IS NOT NULL;
COMMENT ON TABLE product_categories IS 'Categorías del catálogo completo (docs/00 §26): hosting compartido y reseller, VPS, servidores dedicados, cloud, dominios, SSL, correo corporativo, páginas web, tiendas virtuales, Moodle, licencias, soporte y mantenimiento, desarrollo a medida y categorías personalizadas.';

CREATE TABLE products (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    code                text NOT NULL,
    category_id         uuid NOT NULL REFERENCES product_categories(id),
    brand_id            uuid NULL REFERENCES brands(id),     -- NULL: disponible en todas las marcas
    name                text NOT NULL,
    description         text NULL,
    billing_type        text NOT NULL CHECK (billing_type IN ('recurring','one_time')),
    provisioning_rule   text NOT NULL DEFAULT 'manual' CHECK (provisioning_rule IN ('manual','automatic')),
    connector           text NULL,
    requires_contract   boolean NOT NULL DEFAULT false,      -- no se activa sin contrato vigente
    export_eligible     boolean NOT NULL DEFAULT false,      -- califica como exportación de servicios (según contador)
    tax_code            text NULL,
    welcome_template_id uuid NULL,                           -- FK al final (notification_templates)
    is_active           boolean NOT NULL DEFAULT true,
    sellable_online     boolean NOT NULL DEFAULT false,      -- "venta en línea": se compra desde la web de la marca (docs/00 §25); el resto pide cotización
    service_type_id     uuid NULL,                           -- FK al final (service_types): producto de un tipo de servicio personalizado
    custom              jsonb NOT NULL DEFAULT '{}',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    UNIQUE (organization_id, code)
);
CREATE INDEX ON products (organization_id, category_id, is_active);
CREATE INDEX ON products (organization_id, brand_id) WHERE sellable_online AND is_active AND deleted_at IS NULL;
COMMENT ON TABLE products IS 'Productos del catálogo con tipo de cobro, regla de aprovisionamiento, marca "requiere contrato", condición de exportación y marca "venta en línea".';

CREATE TABLE plans (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    product_id      uuid NOT NULL REFERENCES products(id),
    code            text NOT NULL,
    name            text NOT NULL,
    cycle           text NOT NULL CHECK (cycle IN ('monthly','quarterly','semiannual','annual','biennial','triennial','one_time')),
    cost_minor      bigint NULL CHECK (cost_minor >= 0),
    cost_currency   char(3) NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    tax_code        text NULL,
    limits          jsonb NOT NULL DEFAULT '{}',         -- espacio, cuentas, usuarios, buzones
    is_active       boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK ((cost_minor IS NULL) = (cost_currency IS NULL)),
    UNIQUE (organization_id, code)
);
CREATE INDEX ON plans (organization_id, product_id);
COMMENT ON TABLE plans IS 'Planes de un producto: ciclo, costo de referencia y límites. Los precios de venta viven en plan_prices.';

CREATE TABLE plan_prices (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    plan_id          uuid NOT NULL REFERENCES plans(id),
    currency         char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    price_minor      bigint NOT NULL CHECK (price_minor >= 0),
    setup_fee_minor  bigint NOT NULL DEFAULT 0 CHECK (setup_fee_minor >= 0),
    effective_from   date NOT NULL,
    effective_to     date NULL,
    customers_notified_at timestamptz NULL,     -- ajuste masivo con aviso antes de la siguiente renovación
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (effective_to IS NULL OR effective_to > effective_from),
    UNIQUE (plan_id, currency, effective_from)
);
CREATE INDEX ON plan_prices (organization_id, plan_id, currency, effective_from DESC);
COMMENT ON TABLE plan_prices IS 'Precio de venta de un plan por moneda y vigencia; permite ajustes masivos con aviso.';

CREATE TABLE product_addons (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    product_id       uuid NOT NULL REFERENCES products(id),
    addon_product_id uuid NOT NULL REFERENCES products(id),
    is_required      boolean NOT NULL DEFAULT false,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (product_id <> addon_product_id),
    UNIQUE (product_id, addon_product_id)
);
COMMENT ON TABLE product_addons IS 'Complementos que se pueden agregar a un producto.';

CREATE TABLE bundle_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    bundle_plan_id  uuid NOT NULL REFERENCES plans(id),
    item_plan_id    uuid NOT NULL REFERENCES plans(id),
    quantity        numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (bundle_plan_id <> item_plan_id),
    UNIQUE (bundle_plan_id, item_plan_id)
);
COMMENT ON TABLE bundle_items IS 'Composición de paquetes: planes incluidos en un plan paquete.';

-- ===== Módulo Providers (PRV) =====

CREATE TABLE providers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    code            text NOT NULL,
    name            text NOT NULL,
    type            text NOT NULL CHECK (type IN ('hosting','server','cloud','registrar','email','ssl','cdn','bulk_email','payment','einvoice','saas','dns','ai','other')),
    origin          text NOT NULL DEFAULT 'company' CHECK (origin IN ('company','customer')),  -- propio o aportado por el cliente
    portal_url      text NULL,
    cost_currency   char(3) NOT NULL DEFAULT 'USD' CHECK (cost_currency ~ '^[A-Z]{3}$'),
    connector       text NULL,                          -- NULL: proveedor en modo manual
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    notes_internal  text NULL,
    custom          jsonb NOT NULL DEFAULT '{}',
    sla_notes       text NULL,
    customer_id     uuid NULL REFERENCES customers(id),  -- proveedor aportado por el cliente
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    UNIQUE (organization_id, code)
);
COMMENT ON TABLE providers IS 'Cualquier proveedor, propio o traído por el cliente; los proveedores son datos, no código (docs/00 §20).';

CREATE TABLE provider_accounts (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    provider_id       uuid NOT NULL REFERENCES providers(id),
    label             text NOT NULL,
    external_account_id text NULL,
    owner             text NOT NULL DEFAULT 'company' CHECK (owner IN ('company','customer')),
    customer_id       uuid NULL REFERENCES customers(id),
    connector         text NULL,
    connector_enabled boolean NOT NULL DEFAULT false,
    write_enabled     boolean NOT NULL DEFAULT false,   -- solo lectura primero; escritura por cuenta y con permiso
    capabilities      jsonb NOT NULL DEFAULT '{}',      -- resultado de capabilities()
    renewal_date      date NULL,
    cost_minor        bigint NULL CHECK (cost_minor >= 0),
    cost_currency     char(3) NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    billing_cycle     text NULL,
    status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
    last_synced_at    timestamptz NULL,
    custom            jsonb NOT NULL DEFAULT '{}',
    last_tested_at  timestamptz NULL,
    last_test_result jsonb NULL,  -- resultado de testConnection()
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK (owner = 'company' OR customer_id IS NOT NULL),
    CHECK ((cost_minor IS NULL) = (cost_currency IS NULL))
);
CREATE INDEX ON provider_accounts (organization_id, provider_id);
CREATE INDEX ON provider_accounts (organization_id, renewal_date) WHERE deleted_at IS NULL;
COMMENT ON TABLE provider_accounts IS 'Cuentas en cada proveedor (reseller, registrador, nube...): conector, permisos de escritura, costo y renovación.';

CREATE TABLE provider_contacts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    provider_id     uuid NOT NULL REFERENCES providers(id),
    name            text NOT NULL,
    email           text NULL,
    phone           text NULL,
    role            text NULL,
    notes           text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON provider_contacts (organization_id, provider_id);
COMMENT ON TABLE provider_contacts IS 'Contactos comerciales y de soporte de cada proveedor.';

-- ===== Módulo Vault (VLT) =====

CREATE TABLE secrets (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         uuid NOT NULL REFERENCES organizations(id),
    kind                    text NOT NULL CHECK (kind IN ('ssh','sftp','ftp','cpanel','whm','plesk','panel','cloud','registrar','database','app_admin','api_token','private_key','other')),
    name                    text NOT NULL,
    owner_type              text NOT NULL CHECK (owner_type IN ('provider_account','server','hosting_account','cloud_account','domain','resource','saas_instance','service','customer','webhook_endpoint','wp_site')),
    owner_id                uuid NOT NULL,
    customer_id             uuid NULL REFERENCES customers(id),
    is_connector_credential boolean NOT NULL DEFAULT false,  -- llave API usada por un conector
    username                text NULL,
    host                    text NULL,
    port                    integer NULL CHECK (port BETWEEN 1 AND 65535),
    ciphertext              bytea NOT NULL,                  -- AES-256-GCM; la clave vive fuera de la base
    nonce                   bytea NOT NULL,
    key_version             integer NOT NULL,
    metadata                jsonb NOT NULL DEFAULT '{}',     -- solo datos no sensibles
    rotates_at              date NULL,
    last_rotated_at         timestamptz NULL,
    expires_at              timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL
);
CREATE INDEX ON secrets (organization_id, owner_type, owner_id) WHERE deleted_at IS NULL;
CREATE INDEX ON secrets (organization_id, customer_id) WHERE deleted_at IS NULL;
CREATE INDEX ON secrets (organization_id, rotates_at) WHERE deleted_at IS NULL;
COMMENT ON TABLE secrets IS 'Bóveda: accesos de clientes administrados y llaves API de proveedores, cifrados con AES-256-GCM. El listado nunca devuelve valores.';

CREATE TABLE secret_grants (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    secret_id       uuid NOT NULL REFERENCES secrets(id),
    user_id         uuid NULL REFERENCES users(id),
    role_id         uuid NULL REFERENCES roles(id),
    reason          text NULL,
    starts_at       timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NULL,      -- concesiones temporales caducan solas
    revoked_at      timestamptz NULL,      -- revocar surte efecto inmediato
    revoked_by      uuid NULL REFERENCES users(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK ((user_id IS NULL) <> (role_id IS NULL)),
    CHECK (expires_at IS NULL OR expires_at > starts_at)
);
CREATE INDEX ON secret_grants (organization_id, secret_id) WHERE revoked_at IS NULL;
CREATE INDEX ON secret_grants (organization_id, user_id) WHERE revoked_at IS NULL;
COMMENT ON TABLE secret_grants IS 'Concesiones de acceso a un secreto por usuario o rol, con vencimiento opcional y revocación inmediata.';

CREATE TABLE secret_access_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    secret_id       uuid NOT NULL REFERENCES secrets(id),
    user_id         uuid NULL REFERENCES users(id),          -- NULL cuando lo usa un conector
    action          text NOT NULL CHECK (action IN ('reveal','copy','connector_use','reveal_denied','one_time_link')),
    reason          text NULL,
    ip              inet NULL,
    user_agent      text NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid NULL
);
CREATE INDEX ON secret_access_logs (organization_id, secret_id, created_at DESC);
CREATE INDEX ON secret_access_logs (organization_id, user_id, created_at DESC);
COMMENT ON TABLE secret_access_logs IS 'Bitácora de solo inserción de cada revelación o uso de un secreto: usuario, motivo, IP y fecha. El valor nunca se registra.';

CREATE TABLE one_time_links (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    purpose            text NOT NULL CHECK (purpose IN ('credential_delivery','domain_auth_code','welcome_access','account_handover')),
    secret_id          uuid NULL REFERENCES secrets(id),
    payload_ciphertext bytea NULL,
    payload_nonce      bytea NULL,
    key_version        integer NULL,
    token_hash         char(64) NOT NULL UNIQUE,
    recipient_email    text NULL,
    contact_id         uuid NULL REFERENCES contacts(id),
    max_views          smallint NOT NULL DEFAULT 1 CHECK (max_views >= 1),
    views_count        smallint NOT NULL DEFAULT 0 CHECK (views_count >= 0),
    expires_at         timestamptz NOT NULL,
    consumed_at        timestamptz NULL,
    revoked_at         timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (secret_id IS NOT NULL OR payload_ciphertext IS NOT NULL),
    CHECK (views_count <= max_views)
);
CREATE INDEX ON one_time_links (organization_id, expires_at) WHERE consumed_at IS NULL AND revoked_at IS NULL;
COMMENT ON TABLE one_time_links IS 'Enlaces de un solo uso con vencimiento para entregar accesos o códigos de autorización al cliente.';

-- ===== Módulo Catalog (CAT, continuación: requiere providers) =====

CREATE TABLE domain_extensions (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    tld                    text NOT NULL CHECK (tld ~ '^[a-z0-9.-]+$'),   -- sin punto inicial: com, pe, com.pe
    default_registrar_id   uuid NOT NULL REFERENCES providers(id),       -- registrador por defecto para registrar y renovar
    min_margin_percent     numeric(5,2) NULL CHECK (min_margin_percent >= 0),   -- NULL: hereda catalog.domain_prices.min_margin_percent
    sellable_online        boolean NOT NULL DEFAULT false,               -- se registra o transfiere desde la web de la marca
    allows_transfer_in     boolean NOT NULL DEFAULT true,
    is_featured            boolean NOT NULL DEFAULT false,               -- destacada en el verificador de dominio de la web
    sort_order             integer NOT NULL DEFAULT 0,
    is_active              boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, tld)
);
CREATE INDEX ON domain_extensions (organization_id, sort_order) WHERE is_active AND sellable_online;
COMMENT ON TABLE domain_extensions IS 'Extensión de dominio del catálogo (docs/00 §25): registrador por defecto, margen mínimo con alerta, venta en línea y orden en la web. Costos y precios por operación en domain_tld_prices; reglas del registro en tld_rules.';

CREATE TABLE domain_tld_prices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    tld             text NOT NULL CHECK (tld ~ '^[a-z0-9.-]+$'),   -- sin punto inicial: com, pe, com.pe
    provider_id     uuid NOT NULL REFERENCES providers(id),       -- registrador
    operation       text NOT NULL CHECK (operation IN ('register','renew','transfer','restore')),
    years           smallint NOT NULL DEFAULT 1 CHECK (years BETWEEN 1 AND 10),
    cost_minor      bigint NOT NULL CHECK (cost_minor >= 0),
    cost_currency   char(3) NOT NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    price_minor     bigint NOT NULL CHECK (price_minor >= 0),
    currency        char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    effective_from  date NOT NULL,
    effective_to    date NULL,
    domain_extension_id   uuid NULL REFERENCES domain_extensions(id),   -- ficha comercial de la extensión
    customers_notified_at timestamptz NULL,     -- cambio de precio de renovación avisado a clientes con dominios activos
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (effective_to IS NULL OR effective_to > effective_from),
    UNIQUE (organization_id, tld, provider_id, operation, years, currency, effective_from)
);
CREATE INDEX ON domain_tld_prices (organization_id, tld, operation);
COMMENT ON TABLE domain_tld_prices IS 'Costo y precio de venta por extensión, registrador, operación (registro, renovación, transferencia, restauración), plazo y moneda, con vigencia; el margen mínimo sale de domain_extensions o de settings.';

-- ===== Módulo Services (SRV) =====

CREATE TABLE service_modalities (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    code                text NOT NULL,     -- dedicated_company_account, managed_customer_account, shared_saas, managed_new_account_handover, ...
    name                text NOT NULL,
    account_owner       text NOT NULL CHECK (account_owner IN ('company','customer','company_then_customer')),
    billing_mode        text NOT NULL CHECK (billing_mode IN ('plan','provider_cost_plus_fee','fee_only','usage_plan')),
    customer_visibility text NOT NULL CHECK (customer_visibility IN ('own_resources','own_resources_and_cost','instance_only')),
    is_active           boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code)
);
COMMENT ON TABLE service_modalities IS 'Catálogo configurable de modalidades de servicio: titular de la cuenta, forma de facturar y qué ve el cliente (docs/00 §20).';

CREATE TABLE services (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    code                text NOT NULL,
    customer_id         uuid NOT NULL REFERENCES customers(id),
    brand_id            uuid NOT NULL REFERENCES brands(id),
    product_id          uuid NOT NULL REFERENCES products(id),
    plan_id             uuid NULL REFERENCES plans(id),
    service_modality_id uuid NULL REFERENCES service_modalities(id),
    contract_id         uuid NULL,                      -- FK al final (contracts)
    label               text NOT NULL,
    status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','terminated','cancelled','handed_over')),
    activated_at        timestamptz NULL,
    suspended_at        timestamptz NULL,
    terminated_at       timestamptz NULL,
    cancelled_at        timestamptz NULL,
    handed_over_at      timestamptz NULL,
    commercial_due_date date NULL,                      -- vencimiento pactado con el cliente
    auto_renew          boolean NOT NULL DEFAULT true,
    show_provider       boolean NULL,                   -- NULL: hereda portal.show_provider_name; true/false: sobrescritura por servicio
    notes_internal      text NULL,
    custom              jsonb NOT NULL DEFAULT '{}',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    UNIQUE (organization_id, code),
    CHECK (status <> 'active' OR activated_at IS NOT NULL)
);
CREATE INDEX ON services (organization_id, customer_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ON services (organization_id, status, commercial_due_date) WHERE deleted_at IS NULL;
CREATE INDEX ON services (organization_id, brand_id);
CREATE INDEX ON services (organization_id, product_id);
COMMENT ON TABLE services IS 'Servicio contratado: el centro del modelo. Lo que se cobra; apunta a uno o varios recursos técnicos.';

CREATE TABLE subscriptions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    service_id        uuid NOT NULL REFERENCES services(id),
    cycle             text NOT NULL CHECK (cycle IN ('monthly','quarterly','semiannual','annual','biennial','triennial')),
    quantity          numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    price_minor       bigint NOT NULL CHECK (price_minor >= 0),
    currency          char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    next_invoice_date date NOT NULL,
    starts_on         date NOT NULL,
    ends_on           date NULL,
    status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
    paused_at         timestamptz NULL,
    cancelled_at      timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE UNIQUE INDEX subscriptions_one_active_per_service ON subscriptions (service_id) WHERE status = 'active';
CREATE INDEX ON subscriptions (organization_id, status, next_invoice_date);
COMMENT ON TABLE subscriptions IS 'Cómo se factura un servicio: ciclo, precio, moneda y próxima fecha de facturación. Un servicio activo sin suscripción es un servicio sin facturar.';

CREATE TABLE service_status_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    service_id      uuid NOT NULL REFERENCES services(id),
    from_status     text NULL CHECK (from_status IN ('pending','active','suspended','terminated','cancelled','handed_over')),
    to_status       text NOT NULL CHECK (to_status IN ('pending','active','suspended','terminated','cancelled','handed_over')),
    reason          text NULL,
    trigger_source  text NOT NULL DEFAULT 'manual' CHECK (trigger_source IN ('manual','dunning','payment','order','handover','system')),
    approved_by     uuid NULL REFERENCES users(id),     -- suspensiones y bajas aprobadas por el administrador
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON service_status_history (organization_id, service_id, occurred_at DESC);
COMMENT ON TABLE service_status_history IS 'Historial de cambios de estado del servicio, con motivo, origen y aprobador.';

CREATE TABLE customer_action_flags (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    customer_id     uuid NULL REFERENCES customers(id),   -- NULL: interruptor general
    action          text NOT NULL CHECK (action IN ('cpanel_login','usage_view','dns_change','server_reboot')),
    enabled         boolean NOT NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE NULLS NOT DISTINCT (organization_id, customer_id, action)
);
COMMENT ON TABLE customer_action_flags IS 'Interruptores de acciones del panel del cliente, a nivel general y por cliente; activarlos queda en auditoría.';

-- ===== Módulo Inventory (INV) =====

CREATE TABLE resources (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    type                text NOT NULL CHECK (type IN ('hosting_node','hosting_account','server','cloud_resource','domain','mail_service','ssl_certificate','cdn_zone','bulk_email_account','dns_zone','saas_instance','database','storage','license','other')),
    provider_account_id uuid NULL REFERENCES provider_accounts(id),
    external_id         text NULL,
    name                text NOT NULL,
    status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','stopped','terminated','not_found')),
    specs               jsonb NOT NULL DEFAULT '{}',
    cost_minor          bigint NULL CHECK (cost_minor >= 0),
    cost_currency       char(3) NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    renewal_date        date NULL,
    sync_mode           text NOT NULL DEFAULT 'manual' CHECK (sync_mode IN ('api','manual')),
    last_synced_at      timestamptz NULL,
    not_found_at        timestamptz NULL,      -- desapareció en el proveedor: nunca se borra
    custom              jsonb NOT NULL DEFAULT '{}',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK ((cost_minor IS NULL) = (cost_currency IS NULL))
);
CREATE UNIQUE INDEX resources_external_uq ON resources (organization_id, provider_account_id, type, external_id)
    WHERE external_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ON resources (organization_id, type, status) WHERE deleted_at IS NULL;
CREATE INDEX ON resources (organization_id, renewal_date) WHERE deleted_at IS NULL;
CREATE INDEX ON resources (organization_id, lower(name));
COMMENT ON TABLE resources IS 'Tabla base de todo activo técnico en un proveedor. Un recurso sin service_resources es infraestructura sin cliente.';

-- ===== Módulo Services (SRV, continuación: requiere resources) =====

CREATE TABLE service_resources (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    service_id      uuid NOT NULL REFERENCES services(id),
    resource_id     uuid NOT NULL REFERENCES resources(id),
    role            text NULL,                      -- papel del recurso en el servicio: principal, dns, correo, respaldo ...
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (service_id, resource_id)
);
CREATE INDEX ON service_resources (organization_id, resource_id);
COMMENT ON TABLE service_resources IS 'Enlace N:M entre lo que se cobra (services) y lo que existe en el proveedor (resources). Pertenece al módulo Services.';

-- ===== Módulo Inventory (INV, continuación) =====

CREATE TABLE servers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    resource_id     uuid NOT NULL UNIQUE REFERENCES resources(id),
    hostname        text NOT NULL,
    os              text NULL,
    public_ip       inet NULL,
    private_ip      inet NULL,
    cpu             smallint NULL CHECK (cpu > 0),
    ram_mb          integer NULL CHECK (ram_mb > 0),
    disk_gb         integer NULL CHECK (disk_gb > 0),
    region          text NULL,
    tenancy         text NOT NULL DEFAULT 'dedicated' CHECK (tenancy IN ('dedicated','shared')),
    custom          jsonb NOT NULL DEFAULT '{}',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON servers (organization_id, hostname);
CREATE INDEX ON servers (organization_id, public_ip);
COMMENT ON TABLE servers IS 'Ficha técnica de VPS y dedicados (Contabo, DigitalOcean, nubes): SO, IP, CPU, memoria, disco y región.';

CREATE TABLE hosting_nodes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    resource_id     uuid NOT NULL UNIQUE REFERENCES resources(id),
    kind            text NOT NULL CHECK (kind IN ('reseller','own_vps')),
    server_id       uuid NULL REFERENCES servers(id),       -- VPS propio con WHM
    panel           text NOT NULL DEFAULT 'whm' CHECK (panel IN ('whm','plesk','other')),
    hostname        text NOT NULL,
    ip              inet NULL,
    disk_quota_mb   bigint NULL CHECK (disk_quota_mb >= 0),
    disk_used_mb    bigint NULL CHECK (disk_used_mb >= 0),
    accounts_limit  integer NULL CHECK (accounts_limit >= 0),
    accounts_used   integer NULL CHECK (accounts_used >= 0),
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','migrating_out','retired')),
    last_synced_at  timestamptz NULL,
    accepts_new_accounts boolean NOT NULL DEFAULT true,  -- false: nodo en retiro o lleno, no recibe cuentas nuevas
    capacity_thresholds  jsonb NULL,             -- override por nodo de inventory.capacity_thresholds (ej. [70,85,95])
    cpanel_license_tier  text NULL,              -- tramo de licencia cPanel (por cantidad de cuentas),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (kind <> 'own_vps' OR server_id IS NOT NULL)
);
COMMENT ON TABLE hosting_nodes IS 'Nodo de hosting: cuenta reseller (BanaHosting) o VPS propio con WHM, con su capacidad y uso (docs/00 §17).';

CREATE TABLE hosting_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    hosting_node_id uuid NOT NULL REFERENCES hosting_nodes(id),
    resource_id     uuid NULL UNIQUE REFERENCES resources(id),
    username        text NOT NULL,
    primary_domain  text NOT NULL,
    disk_quota_mb   bigint NULL CHECK (disk_quota_mb >= 0),
    disk_used_mb    bigint NULL CHECK (disk_used_mb >= 0),
    service_id      uuid NULL REFERENCES services(id),     -- NULL: cuenta no registrada (detección)
    customer_id     uuid NULL REFERENCES customers(id),
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','terminated','not_found')),
    last_synced_at  timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (hosting_node_id, username)
);
CREATE INDEX ON hosting_accounts (organization_id, lower(primary_domain));
CREATE INDEX ON hosting_accounts (organization_id, service_id);
CREATE INDEX ON hosting_accounts (organization_id, hosting_node_id) WHERE service_id IS NULL;
COMMENT ON TABLE hosting_accounts IS 'Cuentas cPanel/Plesk de cada nodo; sin service_id son cuentas no registradas que alimentan la detección.';

CREATE TABLE server_software (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    server_id       uuid NOT NULL REFERENCES servers(id),
    kind            text NOT NULL CHECK (kind IN ('os','panel','web_server','database','runtime','application','agent','other')),
    name            text NOT NULL,
    installed_version text NULL,
    end_of_life     date NULL,
    detected_at     timestamptz NULL,
    license_expires_at date NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (server_id, kind, name)
);
COMMENT ON TABLE server_software IS 'Software instalado en cada servidor (panel, motor web, base de datos, aplicaciones) con su versión.';

CREATE TABLE maintenances (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    resource_id     uuid NOT NULL REFERENCES resources(id),
    kind            text NOT NULL CHECK (kind IN ('update','security_patch','os_upgrade','backup_check','reputation_check','other')),
    status          text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','skipped')),
    scheduled_for   timestamptz NULL,
    performed_at    timestamptz NULL,
    performed_by    uuid NULL REFERENCES users(id),
    task_id         uuid NULL,                     -- FK al final (tasks)
    notes           text NULL,
    recurring_rule  text NULL,                      -- regla de recurrencia (RRULE) para mantenimientos periódicos,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON maintenances (organization_id, resource_id, scheduled_for DESC);
COMMENT ON TABLE maintenances IS 'Bitácora técnica de mantenimientos por recurso (actualizaciones, parches, revisiones); en nodos propios es responsabilidad de la empresa.';

CREATE TABLE migration_batches (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    name            text NOT NULL,
    source_node_id  uuid NOT NULL REFERENCES hosting_nodes(id),
    target_node_id  uuid NOT NULL REFERENCES hosting_nodes(id),
    status          text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
    started_at      timestamptz NULL,
    completed_at    timestamptz NULL,
    planned_at      timestamptz NULL,               -- fecha planificada del lote,
    owner_id        uuid NULL REFERENCES users(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (source_node_id <> target_node_id)
);
COMMENT ON TABLE migration_batches IS 'Lote de migración de cuentas desde un reseller hacia un nodo propio, con validación de capacidad del destino.';

CREATE TABLE migration_items (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    migration_batch_id uuid NOT NULL REFERENCES migration_batches(id),
    hosting_account_id uuid NOT NULL REFERENCES hosting_accounts(id),
    position           integer NOT NULL,                -- orden por tamaño y riesgo
    size_mb            bigint NULL CHECK (size_mb >= 0),
    risk               text NOT NULL DEFAULT 'medium' CHECK (risk IN ('low','medium','high')),
    status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','copied','testing','dns_changed','verified','closed','reverted')),
    status_changed_at  timestamptz NULL,
    backup_reference   text NULL,
    notes              text NULL,
    last_error      text NULL,                      -- último error del paso automático,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (migration_batch_id, hosting_account_id),
    UNIQUE (migration_batch_id, position)
);
CREATE INDEX ON migration_items (organization_id, status);
COMMENT ON TABLE migration_items IS 'Cuenta dentro de un lote de migración con su estado propio; el mapa de servicios se actualiza solo al cerrarla.';

CREATE TABLE resource_dependencies (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    from_resource_id uuid NOT NULL REFERENCES resources(id),
    to_resource_id   uuid NOT NULL REFERENCES resources(id),
    kind             text NOT NULL CHECK (kind IN ('hosted_on','depends_on','resolves_via','delivers_via','sends_via','secured_by','backs_up_to','other')),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (from_resource_id <> to_resource_id),
    UNIQUE (from_resource_id, to_resource_id, kind)
);
CREATE INDEX ON resource_dependencies (organization_id, to_resource_id);
COMMENT ON TABLE resource_dependencies IS 'Grafo de la CMDB entre recursos técnicos; sirve para calcular impacto.';

-- ===== Módulo Cloud (CLD) =====

CREATE TABLE cloud_accounts (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES organizations(id),
    provider_account_id   uuid NOT NULL UNIQUE REFERENCES provider_accounts(id),
    platform              text NOT NULL CHECK (platform IN ('aws','azure','gcp','digitalocean','other')),
    external_account_id   text NOT NULL,          -- cuenta AWS, suscripción Azure, cuenta de facturación GCP
    owner                 text NOT NULL CHECK (owner IN ('company','customer')),
    modality              text NOT NULL CHECK (modality IN ('dedicated_company_account','managed_customer_account','shared_saas','managed_new_account_handover')),
    customer_id           uuid NULL REFERENCES customers(id),
    authorization_file_id uuid NULL REFERENCES files(id),   -- autorización expresa del cliente
    access_reference      text NULL,              -- ARN del rol, id de la entidad de servicio, cuenta de servicio
    period_start          date NULL,              -- cuenta nueva con entrega al final del periodo
    period_end            date NULL,
    tagging_status        text NOT NULL DEFAULT 'pending' CHECK (tagging_status IN ('pending','in_progress','done')),
    access_revoked_at     timestamptz NULL,       -- el cliente puede revocar la lectura
    status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','access_revoked','handed_over','closed')),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK (owner <> 'customer' OR authorization_file_id IS NOT NULL),
    CHECK (owner <> 'customer' OR customer_id IS NOT NULL),
    CHECK (modality <> 'managed_new_account_handover' OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_end > period_start)),
    UNIQUE (organization_id, platform, external_account_id)
);
CREATE INDEX ON cloud_accounts (organization_id, customer_id);
COMMENT ON TABLE cloud_accounts IS 'Cuentas AWS/Azure/GCP con titular y modalidad. Una cuenta del cliente no se registra sin su autorización adjunta.';

CREATE TABLE cloud_projects (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    cloud_account_id    uuid NOT NULL REFERENCES cloud_accounts(id),
    customer_id         uuid NULL REFERENCES customers(id),
    name                text NOT NULL,
    external_id         text NULL,             -- grupo de recursos, proyecto GCP, conjunto de etiquetas
    environment         text NOT NULL DEFAULT 'production' CHECK (environment IN ('production','staging','testing','development')),
    region              text NULL,
    visible_to_customer boolean NOT NULL DEFAULT true,
    tags                jsonb NOT NULL DEFAULT '{}',
    is_shared       boolean NOT NULL DEFAULT false,  -- arquitectura compartida (SaaS) con costo repartido
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL
);
CREATE INDEX ON cloud_projects (organization_id, cloud_account_id);
CREATE INDEX ON cloud_projects (organization_id, customer_id);
COMMENT ON TABLE cloud_projects IS 'Proyecto cloud (cuenta, grupo de recursos o proyecto según la nube) por ambiente; se puede ocultar al cliente.';

CREATE TABLE cloud_resources (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL REFERENCES organizations(id),
    cloud_project_id     uuid NOT NULL REFERENCES cloud_projects(id),
    resource_id          uuid NULL UNIQUE REFERENCES resources(id),
    parent_id            uuid NULL REFERENCES cloud_resources(id),
    resource_type        text NOT NULL,          -- ec2, rds, s3, vm, cloud_sql, route53_zone, ...
    external_id          text NOT NULL,
    name                 text NULL,
    region               text NULL,
    tags                 jsonb NOT NULL DEFAULT '{}',   -- cliente, proyecto, ambiente
    assigned_customer_id uuid NULL REFERENCES customers(id),  -- NULL: "sin cliente asignado"
    monthly_cost_minor   bigint NULL CHECK (monthly_cost_minor >= 0),
    cost_currency        char(3) NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active','stopped','terminated','not_found')),
    last_synced_at       timestamptz NULL,
    kind            text NOT NULL DEFAULT 'other' CHECK (kind IN ('server','database','storage','dns','network','load_balancer','other')),  -- tipo normalizado entre nubes
    is_shared       boolean NOT NULL DEFAULT false,
    assignment_status text NOT NULL DEFAULT 'unassigned' CHECK (assignment_status IN ('assigned','unassigned')),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK ((monthly_cost_minor IS NULL) = (cost_currency IS NULL)),
    UNIQUE (cloud_project_id, external_id)
);
CREATE INDEX ON cloud_resources (organization_id, assigned_customer_id);
CREATE INDEX ON cloud_resources (organization_id, resource_type);
CREATE INDEX ON cloud_resources USING gin (tags);
COMMENT ON TABLE cloud_resources IS 'Árbol de recursos de cada proyecto cloud descubiertos por API (solo lectura) con etiquetas y costo mensual.';

CREATE TABLE cloud_budgets (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    cloud_project_id uuid NOT NULL REFERENCES cloud_projects(id),
    period_month     date NOT NULL CHECK (extract(day FROM period_month) = 1),
    amount_minor     bigint NOT NULL CHECK (amount_minor > 0),
    cost_currency    char(3) NOT NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    actual_minor     bigint NOT NULL DEFAULT 0 CHECK (actual_minor >= 0),
    last_alerted_pct smallint NULL,          -- umbrales (80 y 100 % por defecto) en settings
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (cloud_project_id, period_month)
);
COMMENT ON TABLE cloud_budgets IS 'Presupuesto mensual por proyecto cloud y gasto real, para alertas por umbral.';

-- ===== Módulo Domains (DOM) =====

CREATE TABLE domains (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    name                   text NOT NULL CHECK (name = lower(name)),
    tld                    text NOT NULL,
    resource_id            uuid NULL UNIQUE REFERENCES resources(id),
    provider_account_id    uuid NULL REFERENCES provider_accounts(id),   -- cuenta del registrador
    customer_id            uuid NULL REFERENCES customers(id),           -- NULL: dominio huérfano (detección)
    service_id             uuid NULL REFERENCES services(id),            -- vencimiento comercial en services.commercial_due_date
    holder                 text NOT NULL CHECK (holder IN ('company','customer')),
    registered_at          date NULL,
    registry_expires_at    date NULL,                                    -- fecha real en el registrador
    auto_renew             boolean NOT NULL DEFAULT false,
    lock                   boolean NOT NULL DEFAULT true,
    dnssec                 boolean NOT NULL DEFAULT false,
    privacy                boolean NOT NULL DEFAULT false,
    nameservers            jsonb NOT NULL DEFAULT '[]',
    transfer_locked_until  date NULL,                                    -- 60 días tras registro o transferencia
    status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','redemption','pending_transfer','transferred_out','not_found')),
    sync_mode              text NOT NULL DEFAULT 'manual' CHECK (sync_mode IN ('api','manual')),
    last_synced_at         timestamptz NULL,
    custom                 jsonb NOT NULL DEFAULT '{}',
    last_transfer_at timestamptz NULL,  -- base de transfer_locked_until
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL
);
CREATE UNIQUE INDEX domains_org_name_uq ON domains (organization_id, name) WHERE deleted_at IS NULL;
CREATE INDEX ON domains (organization_id, registry_expires_at) WHERE deleted_at IS NULL;
CREATE INDEX ON domains (organization_id, customer_id) WHERE deleted_at IS NULL;
CREATE INDEX ON domains (organization_id, holder) WHERE deleted_at IS NULL;
CREATE INDEX ON domains (organization_id, tld);
CREATE INDEX domains_org_status_idx ON domains (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX domains_org_provider_account_idx ON domains (organization_id, provider_account_id) WHERE deleted_at IS NULL;
COMMENT ON TABLE domains IS 'Dominios con dos fechas distintas: registry_expires_at (registrador) y la fecha comercial de su servicio; titular empresa o cliente.';

CREATE TABLE domain_contacts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    domain_id        uuid NOT NULL REFERENCES domains(id),
    role             text NOT NULL CHECK (role IN ('registrant','admin','tech','billing')),
    name             text NOT NULL,
    company          text NULL,
    email            text NOT NULL,
    phone            text NULL,
    address          jsonb NOT NULL DEFAULT '{}',
    synced_at        timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (domain_id, role)
);
COMMENT ON TABLE domain_contacts IS 'Contactos del dominio en el registrador (titular, administrativo, técnico, facturación).';

CREATE TABLE tld_rules (
    id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id                   uuid NOT NULL REFERENCES organizations(id),
    tld                               text NOT NULL,
    country                           char(2) NULL,
    allows_contact_change             boolean NOT NULL DEFAULT true,
    allows_owner_change               boolean NOT NULL DEFAULT true,
    allows_transfer_out               boolean NOT NULL DEFAULT true,
    transfer_lock_days_after_register integer NULL CHECK (transfer_lock_days_after_register >= 0),
    transfer_lock_days_after_transfer integer NULL CHECK (transfer_lock_days_after_transfer >= 0),
    owner_change_lock_days            integer NULL CHECK (owner_change_lock_days >= 0),
    requires_documents                boolean NOT NULL DEFAULT false,
    rules_documented                  boolean NOT NULL DEFAULT false,   -- las operaciones del cliente se habilitan solo con reglas documentadas
    customer_operations_enabled       boolean NOT NULL DEFAULT false,
    notes                             text NULL,
    owner_change_requirements text NULL,           -- requisitos documentados del registro para cambio de titular
    renewal_rules             text NULL,
    docs_url                  text NULL,
    verified_at     timestamptz NULL,  -- última verificación de las reglas con el registro
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (NOT customer_operations_enabled OR rules_documented),
    UNIQUE (organization_id, tld)
);
COMMENT ON TABLE tld_rules IS 'Reglas por extensión (.pe, .cl, .mx, .co, genéricos) para transferencia, cambio de titular y renovación.';

CREATE TABLE domain_operations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         uuid NOT NULL REFERENCES organizations(id),
    domain_id               uuid NOT NULL REFERENCES domains(id),
    type                    text NOT NULL CHECK (type IN ('contact_change','owner_change','nameserver_change','transfer_out','transfer_in','renewal')),
    status                  text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','email_confirmed','in_review','sent','completed','rejected','cancelled')),
    requested_by_user_id    uuid NULL REFERENCES users(id),
    requested_by_contact_id uuid NULL REFERENCES contacts(id),
    payload                 jsonb NOT NULL DEFAULT '{}',     -- contactos o nameservers nuevos
    idempotency_key         text NULL,
    confirmation_token_hash char(64) NULL,
    confirmation_expires_at timestamptz NULL,
    email_confirmed_at      timestamptz NULL,
    reviewed_by             uuid NULL REFERENCES users(id),
    reviewed_at             timestamptz NULL,
    sent_at                 timestamptz NULL,
    completed_at            timestamptz NULL,
    rejection_reason        text NULL,
    one_time_link_id        uuid NULL REFERENCES one_time_links(id),   -- entrega del código de autorización
    task_id                 uuid NULL,                                 -- FK al final (tasks): sin API, tarea manual
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
    UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX ON domain_operations (organization_id, domain_id, created_at DESC);
CREATE INDEX ON domain_operations (organization_id, status);
COMMENT ON TABLE domain_operations IS 'Operaciones de dominio iniciadas por el cliente con confirmación por correo y revisión de soporte (docs/00 §16).';

CREATE TABLE domain_regularizations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    domain_id       uuid NOT NULL REFERENCES domains(id),
    target_holder   text NOT NULL DEFAULT 'customer' CHECK (target_holder IN ('company','customer')),
    status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
    started_at      timestamptz NULL,
    completed_at    timestamptz NULL,
    task_id         uuid NULL,                     -- FK al final (tasks)
    notes           text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE UNIQUE INDEX domain_regularizations_open_uq ON domain_regularizations (domain_id) WHERE status IN ('pending','in_progress');
CREATE INDEX ON domain_regularizations (organization_id, status);
COMMENT ON TABLE domain_regularizations IS 'Proyecto de regularización de titularidad: estado por dominio que debe pasar a nombre del cliente.';

-- ===== Módulo Mail (MAI) =====

CREATE TABLE mail_services (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    domain_id           uuid NOT NULL REFERENCES domains(id),
    service_id          uuid NULL REFERENCES services(id),
    resource_id         uuid NULL UNIQUE REFERENCES resources(id),
    provider_kind       text NOT NULL CHECK (provider_kind IN ('cpanel','google_workspace','microsoft_365','other')),
    provider_account_id uuid NULL REFERENCES provider_accounts(id),
    hosting_account_id  uuid NULL REFERENCES hosting_accounts(id),   -- correo en cPanel
    tenant_id           text NULL,                                   -- inquilino M365 o cliente Workspace
    plan                text NULL,                                   -- edición o plan
    account_owner       text NOT NULL DEFAULT 'company' CHECK (account_owner IN ('company','customer')),
    seats_purchased     integer NULL CHECK (seats_purchased >= 0),
    seats_used          integer NULL CHECK (seats_used >= 0),
    seats_billed        integer NULL CHECK (seats_billed >= 0),      -- alerta si seats_used > seats_billed
    mailboxes_count     integer NULL CHECK (mailboxes_count >= 0),
    storage_used_mb     bigint NULL CHECK (storage_used_mb >= 0),
    renewal_date        date NULL,
    status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
    sync_mode           text NOT NULL DEFAULT 'manual' CHECK (sync_mode IN ('api','manual')),
    last_synced_at      timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL
);
CREATE INDEX ON mail_services (organization_id, domain_id);
CREATE INDEX ON mail_services (organization_id, renewal_date) WHERE deleted_at IS NULL;
COMMENT ON TABLE mail_services IS 'Correo corporativo por dominio (cPanel, Google Workspace, Microsoft 365) con titular de la cuenta y licencias. No se guardan contraseñas de buzones.';

CREATE TABLE mail_dns_checks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    mail_service_id uuid NOT NULL REFERENCES mail_services(id),
    record_type     text NOT NULL CHECK (record_type IN ('MX','SPF','DKIM','DMARC')),
    expected        text NULL,
    observed        text NULL,
    result          text NOT NULL CHECK (result IN ('ok','missing','changed','invalid')),
    checked_at      timestamptz NOT NULL DEFAULT now(),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON mail_dns_checks (organization_id, mail_service_id, record_type, checked_at DESC);
COMMENT ON TABLE mail_dns_checks IS 'Verificación diaria de MX, SPF, DKIM y DMARC con aviso si cambian o faltan.';

CREATE TABLE seat_licenses (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    mail_service_id     uuid NULL REFERENCES mail_services(id),
    provider_account_id uuid NULL REFERENCES provider_accounts(id),
    service_id          uuid NULL REFERENCES services(id),
    sku                 text NOT NULL,           -- Business Standard, Microsoft 365 Business Basic, ...
    purchased           integer NOT NULL DEFAULT 0 CHECK (purchased >= 0),
    assigned            integer NOT NULL DEFAULT 0 CHECK (assigned >= 0),
    billed              integer NOT NULL DEFAULT 0 CHECK (billed >= 0),
    renewal_date        date NULL,
    cost_minor          bigint NULL CHECK (cost_minor >= 0),    -- costo unitario
    cost_currency       char(3) NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    last_synced_at      timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (mail_service_id IS NOT NULL OR service_id IS NOT NULL),
    CHECK ((cost_minor IS NULL) = (cost_currency IS NULL))
);
CREATE INDEX ON seat_licenses (organization_id, mail_service_id);
CREATE INDEX ON seat_licenses (organization_id) WHERE assigned > billed;
COMMENT ON TABLE seat_licenses IS 'Licencias por usuario por SKU: compradas, asignadas y facturadas al cliente; alerta cuando asignadas > facturadas.';

CREATE TABLE ssl_certificates (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id            uuid NOT NULL REFERENCES organizations(id),
    resource_id                uuid NULL UNIQUE REFERENCES resources(id),
    service_id                 uuid NULL REFERENCES services(id),
    domain_id                  uuid NULL REFERENCES domains(id),
    common_name                text NOT NULL,
    covered_names              text[] NOT NULL DEFAULT '{}',
    is_wildcard                boolean NOT NULL DEFAULT false,
    issuer                     text NULL,
    kind                       text NOT NULL CHECK (kind IN ('free_auto','paid')),
    purchase_provider_account_id uuid NULL REFERENCES provider_accounts(id),
    cost_minor                 bigint NULL CHECK (cost_minor >= 0),
    cost_currency              char(3) NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    price_minor                bigint NULL CHECK (price_minor >= 0),
    currency                   char(3) NULL CHECK (currency IN ('PEN','USD')),
    issued_at                  date NULL,
    expires_at                 date NULL,
    installed_on_type          text NULL CHECK (installed_on_type IN ('server','hosting_account','cdn','load_balancer','other')),
    installed_on_id            uuid NULL,
    renewal_mode               text NOT NULL CHECK (renewal_mode IN ('automatic','manual')),
    responsible_user_id        uuid NULL REFERENCES users(id),
    is_published               boolean NOT NULL DEFAULT true,   -- false: registro manual de un certificado no publicado
    last_checked_at            timestamptz NULL,
    status                     text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expiring','expired','revoked','unknown')),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK ((cost_minor IS NULL) = (cost_currency IS NULL)),
    CHECK ((price_minor IS NULL) = (currency IS NULL)),
    CHECK (kind = 'paid' OR purchase_provider_account_id IS NULL)
);
CREATE INDEX ON ssl_certificates (organization_id, expires_at) WHERE deleted_at IS NULL;
CREATE INDEX ON ssl_certificates (organization_id, domain_id);
COMMENT ON TABLE ssl_certificates IS 'Certificados SSL: dominios cubiertos, emisor, tipo, fechas, dónde está instalado y modo de renovación.';

-- ===== Módulo Saas (SAA) =====

CREATE TABLE saas_platforms (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    code                   text NOT NULL,
    name                   text NOT NULL,
    product_kind           text NOT NULL CHECK (product_kind IN ('moodle','wordpress','custom','other')),
    cloud_project_id       uuid NULL REFERENCES cloud_projects(id),
    server_id              uuid NULL REFERENCES servers(id),
    cost_allocation_method text NOT NULL DEFAULT 'active_users' CHECK (cost_allocation_method IN ('active_users','storage','fixed_percent')),
    status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    base_version    text NULL,
    owner_user_id   uuid NULL REFERENCES users(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code)
);
COMMENT ON TABLE saas_platforms IS 'Producto SaaS que corre sobre un proyecto cloud o servidor y atiende a varios clientes.';

CREATE TABLE saas_instances (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    saas_platform_id   uuid NULL REFERENCES saas_platforms(id),   -- NULL: instancia independiente (p. ej. Moodle en su propio servidor)
    service_id         uuid NOT NULL REFERENCES services(id),
    customer_id        uuid NOT NULL REFERENCES customers(id),
    resource_id        uuid NULL UNIQUE REFERENCES resources(id),
    product_kind       text NOT NULL CHECK (product_kind IN ('moodle','wordpress','custom','other')),
    url                text NOT NULL,
    domain_id          uuid NULL REFERENCES domains(id),
    server_id          uuid NULL REFERENCES servers(id),
    hosting_account_id uuid NULL REFERENCES hosting_accounts(id),
    app_version     text NULL,
    users_limit        integer NULL CHECK (users_limit >= 0),
    users_active       integer NULL CHECK (users_active >= 0),
    storage_limit_mb   bigint NULL CHECK (storage_limit_mb >= 0),
    storage_used_mb    bigint NULL CHECK (storage_used_mb >= 0),
    plugins            jsonb NOT NULL DEFAULT '[]',
    renewal_date       date NULL,
    status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','terminated')),
    last_synced_at     timestamptz NULL,
    institution     text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL
);
CREATE INDEX ON saas_instances (organization_id, customer_id);
CREATE INDEX ON saas_instances (organization_id, saas_platform_id);
COMMENT ON TABLE saas_instances IS 'Instancia de un cliente (Moodle u otro): plan, usuarios, almacenamiento, complementos y renovación; alerta al superar límites.';

-- ===== Módulo ServiceMap (MAP) =====

CREATE TABLE client_projects (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    customer_id        uuid NOT NULL REFERENCES customers(id),
    name               text NOT NULL,
    description        text NULL,
    status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
    technical_owner_id uuid NULL REFERENCES users(id),
    custom             jsonb NOT NULL DEFAULT '{}',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL
);
CREATE INDEX ON client_projects (organization_id, customer_id) WHERE deleted_at IS NULL;
COMMENT ON TABLE client_projects IS 'Proyecto del cliente (p. ej. "Web de turismo") que agrupa todos sus componentes: núcleo del mapa de servicios.';

CREATE TABLE project_components (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    client_project_id   uuid NOT NULL REFERENCES client_projects(id),
    kind                text NOT NULL CHECK (kind IN ('server','hosting','domain','dns','cdn','email','bulk_email','ssl_certificate','database','storage','wordpress_site','custom_system','moodle_platform','license','other')),
    public_label        text NOT NULL,                  -- lo que ve el cliente
    internal_name       text NULL,
    resource_id         uuid NULL REFERENCES resources(id),
    provider_account_id uuid NULL REFERENCES provider_accounts(id),
    service_id          uuid NULL REFERENCES services(id),
    environment         text NOT NULL DEFAULT 'production' CHECK (environment IN ('production','staging','testing','development')),
    visible_to_customer boolean NOT NULL DEFAULT true,
    sync_mode           text NOT NULL DEFAULT 'manual' CHECK (sync_mode IN ('api','manual')),
    last_reviewed_at    timestamptz NULL,               -- componentes sin API: fecha de la última revisión
    usage_info          jsonb NOT NULL DEFAULT '{}',    -- plan, consumo y límite en unidades del proveedor (servicios no infraestructura)
    notes_internal      text NULL,
    sort_order          integer NOT NULL DEFAULT 0,
    custom              jsonb NOT NULL DEFAULT '{}',
    technical_data  jsonb NOT NULL DEFAULT '{}',  -- datos técnicos no sensibles (nunca accesos)
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL
);
CREATE INDEX ON project_components (organization_id, client_project_id) WHERE deleted_at IS NULL;
CREATE INDEX ON project_components (organization_id, resource_id);
CREATE INDEX ON project_components (organization_id, service_id);
CREATE INDEX ON project_components (organization_id, kind);
COMMENT ON TABLE project_components IS 'Cada pieza del proyecto: qué es, en qué proveedor y cuenta está, a qué servicio se cobra; dos vistas (soporte y cliente) desde una sola fuente.';

CREATE TABLE component_dependencies (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    from_component_id uuid NOT NULL REFERENCES project_components(id),
    to_component_id   uuid NOT NULL REFERENCES project_components(id),
    kind              text NOT NULL CHECK (kind IN ('hosted_on','depends_on','resolves_via','delivers_via','sends_via','secured_by','other')),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (from_component_id <> to_component_id),
    UNIQUE (from_component_id, to_component_id, kind)
);
CREATE INDEX ON component_dependencies (organization_id, to_component_id);
COMMENT ON TABLE component_dependencies IS 'Dependencias entre componentes ("el sitio depende del DNS"); se usan para mostrar el impacto de un ticket o incidente.';

CREATE TABLE component_metrics (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL REFERENCES organizations(id),
    project_component_id uuid NOT NULL REFERENCES project_components(id),
    metric               text NOT NULL,        -- disk_used, traffic, mailboxes, emails_sent, ...
    value                numeric(20,4) NOT NULL,
    unit                 text NOT NULL,
    is_public            boolean NOT NULL DEFAULT false,   -- solo las públicas viajan al portal
    source               text NOT NULL DEFAULT 'api' CHECK (source IN ('api','manual')),
    measured_at          timestamptz NOT NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON component_metrics (organization_id, project_component_id, metric, measured_at DESC);
COMMENT ON TABLE component_metrics IS 'Consumo leído por API para cada componente (espacio, tráfico, buzones, envíos); el panel muestra el último valor y su fecha.';

CREATE TABLE project_procedures (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    client_project_id   uuid NOT NULL REFERENCES client_projects(id),
    title               text NOT NULL,
    kind                text NOT NULL DEFAULT 'maintenance' CHECK (kind IN ('maintenance','emergency','deployment','handover','other')),
    body                text NOT NULL,
    visible_to_customer boolean NOT NULL DEFAULT false,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL
);
CREATE INDEX ON project_procedures (organization_id, client_project_id);
COMMENT ON TABLE project_procedures IS 'Procedimientos por proyecto del cliente (mantenimiento, emergencia, despliegue, entrega).';

CREATE TABLE handover_documents (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    customer_id       uuid NOT NULL REFERENCES customers(id),
    client_project_id uuid NULL REFERENCES client_projects(id),   -- NULL: todos los proyectos del cliente
    status            text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','delivered','superseded')),
    snapshot          jsonb NOT NULL,           -- componentes, proveedores y configuración no sensible
    file_id           uuid NULL REFERENCES files(id),
    delivered_at      timestamptz NULL,
    locale          text NOT NULL DEFAULT 'es',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON handover_documents (organization_id, customer_id, created_at DESC);
COMMENT ON TABLE handover_documents IS 'Ficha de traspaso en PDF con todos los componentes del cliente; los accesos se entregan aparte por canal seguro.';

-- ===== Módulo Sales (SAL) =====

CREATE TABLE lead_channels (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    code            text NOT NULL,
    name            text NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('web_form','whatsapp','mailing','social','referral','call','event','assistant','other')),
    brand_id        uuid NULL REFERENCES brands(id),
    is_active       boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code)
);
COMMENT ON TABLE lead_channels IS 'Canales de captación administrables desde el panel (web, WhatsApp, mailing, redes, referidos, llamadas, eventos).';

CREATE TABLE lead_forms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    lead_channel_id uuid NOT NULL REFERENCES lead_channels(id),
    brand_id        uuid NOT NULL REFERENCES brands(id),
    name            text NOT NULL,
    public_key      text NOT NULL UNIQUE,         -- clave por formulario para el endpoint público
    allowed_origins text[] NOT NULL DEFAULT '{}',
    fields          jsonb NOT NULL DEFAULT '[]',
    antispam        jsonb NOT NULL DEFAULT '{}',
    is_active       boolean NOT NULL DEFAULT true,
    success_message jsonb NOT NULL DEFAULT '{}',  -- texto por idioma
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
COMMENT ON TABLE lead_forms IS 'Formularios insertables (script o iframe) de las landings de cada marca, con clave y anti-spam.';

CREATE TABLE pipeline_stages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    code            text NOT NULL,
    name            text NOT NULL,
    outcome         text NOT NULL DEFAULT 'open' CHECK (outcome IN ('open','won','lost')),
    sort_order      integer NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    probability     smallint NULL CHECK (probability BETWEEN 0 AND 100),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code)
);
COMMENT ON TABLE pipeline_stages IS 'Etapas administrables del embudo (nuevo, contactado, propuesta enviada, negociación, ganado, perdido).';

CREATE TABLE referral_links (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    customer_id     uuid NOT NULL REFERENCES customers(id),    -- cliente que refiere
    code            text NOT NULL,
    commission_rate numeric(6,3) NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
    is_active       boolean NOT NULL DEFAULT true,
    expires_at      timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code)
);
COMMENT ON TABLE referral_links IS 'Enlaces de referido (afiliados) de clientes, con comisión configurable.';

CREATE TABLE leads (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    code                   text NOT NULL,
    name                   text NOT NULL,
    company_name           text NULL,
    email                  text NULL,
    phone                  text NULL,
    brand_id               uuid NOT NULL REFERENCES brands(id),
    lead_channel_id        uuid NOT NULL REFERENCES lead_channels(id),
    lead_form_id           uuid NULL REFERENCES lead_forms(id),
    referral_link_id       uuid NULL REFERENCES referral_links(id),
    pipeline_stage_id      uuid NOT NULL REFERENCES pipeline_stages(id),
    status                 text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
    lost_reason            text NULL,
    interest_product_id    uuid NULL REFERENCES products(id),
    estimated_amount_minor bigint NULL CHECK (estimated_amount_minor >= 0),
    currency               char(3) NULL CHECK (currency IN ('PEN','USD')),
    owner_id               uuid NULL REFERENCES users(id),
    customer_id            uuid NULL REFERENCES customers(id),  -- oportunidad sobre cliente existente o cliente convertido
    converted_at           timestamptz NULL,
    attribution            jsonb NOT NULL DEFAULT '{}',         -- página, campaña, UTM, página/formulario de redes
    marketing_consent      boolean NOT NULL DEFAULT false,
    last_activity_at       timestamptz NULL,
    next_follow_up_at      timestamptz NULL,
    custom                 jsonb NOT NULL DEFAULT '{}',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK ((estimated_amount_minor IS NULL) = (currency IS NULL)),
    CHECK (status <> 'lost' OR lost_reason IS NOT NULL),
    CHECK (status <> 'won' OR customer_id IS NOT NULL),
    UNIQUE (organization_id, code)
);
CREATE INDEX ON leads (organization_id, status, pipeline_stage_id) WHERE deleted_at IS NULL;
CREATE INDEX ON leads (organization_id, owner_id, next_follow_up_at) WHERE status = 'open';
CREATE INDEX ON leads (organization_id, lead_channel_id, created_at);
CREATE INDEX ON leads (organization_id, lower(email));
COMMENT ON TABLE leads IS 'Prospectos y oportunidades del CRM básico con canal de origen, etapa, responsable y conversión a cliente.';

CREATE TABLE lead_stage_changes (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    lead_id          uuid NOT NULL REFERENCES leads(id),
    from_stage_id    uuid NULL REFERENCES pipeline_stages(id),   -- NULL: etapa inicial al crear el prospecto
    to_stage_id      uuid NOT NULL REFERENCES pipeline_stages(id),
    source           text NOT NULL CHECK (source IN ('board_drag','form','created','conversion','automation','api')),   -- arrastre en el Kanban, formulario de edición, alta, conversión, regla, API
    changed_by       uuid NULL REFERENCES users(id),             -- NULL: sistema o automatización
    note             text NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid NULL,
    CHECK (from_stage_id IS DISTINCT FROM to_stage_id),
    CHECK (source NOT IN ('board_drag','form') OR changed_by IS NOT NULL)
);
CREATE INDEX ON lead_stage_changes (organization_id, lead_id, created_at);
COMMENT ON TABLE lead_stage_changes IS 'Historial de solo inserción de cada cambio de etapa de un prospecto (también al arrastrarlo en el Kanban): de qué etapa a cuál, quién, cuándo y desde dónde.';

CREATE TABLE lead_activities (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    lead_id         uuid NOT NULL REFERENCES leads(id),
    type            text NOT NULL CHECK (type IN ('call','whatsapp','email','meeting','note','follow_up')),
    subject         text NULL,
    notes           text NULL,
    due_at          timestamptz NULL,
    reminder_at     timestamptz NULL,
    completed_at    timestamptz NULL,
    assigned_to     uuid NULL REFERENCES users(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON lead_activities (organization_id, lead_id, created_at DESC);
CREATE INDEX ON lead_activities (organization_id, assigned_to, due_at) WHERE completed_at IS NULL;
COMMENT ON TABLE lead_activities IS 'Seguimientos de cada prospecto con fecha y recordatorio.';

CREATE TABLE assignment_rules (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    name            text NOT NULL,
    brand_id        uuid NULL REFERENCES brands(id),
    lead_channel_id uuid NULL REFERENCES lead_channels(id),
    strategy        text NOT NULL DEFAULT 'fixed' CHECK (strategy IN ('fixed','round_robin')),
    assignee_ids    uuid[] NOT NULL,             -- vendedores candidatos
    priority        integer NOT NULL DEFAULT 100,
    is_active       boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (cardinality(assignee_ids) >= 1)
);
COMMENT ON TABLE assignment_rules IS 'Reglas para asignar prospectos al vendedor según marca o canal, con aviso inmediato.';

CREATE TABLE whatsapp_numbers (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    brand_id          uuid NOT NULL REFERENCES brands(id),
    phone_number      text NOT NULL,
    display_name      text NULL,
    provider_phone_id text NULL,                 -- id del número en WhatsApp Business Platform
    business_account_id text NULL,
    is_active         boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, phone_number)
);
COMMENT ON TABLE whatsapp_numbers IS 'Números de WhatsApp Business por marca.';

CREATE TABLE whatsapp_conversations (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    whatsapp_number_id uuid NOT NULL REFERENCES whatsapp_numbers(id),
    contact_phone      text NOT NULL,
    contact_name       text NULL,
    customer_id        uuid NULL REFERENCES customers(id),
    contact_id         uuid NULL REFERENCES contacts(id),
    lead_id            uuid NULL REFERENCES leads(id),
    ticket_id          uuid NULL,                -- FK al final (tickets)
    assigned_to        uuid NULL REFERENCES users(id),
    status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    last_message_at    timestamptz NULL,
    window_expires_at  timestamptz NULL,         -- ventana de 24 h para mensajes libres
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON whatsapp_conversations (organization_id, status, last_message_at DESC);
CREATE INDEX ON whatsapp_conversations (organization_id, contact_phone);
COMMENT ON TABLE whatsapp_conversations IS 'Bandeja compartida: conversación desde la que se crea prospecto, ticket o se vincula a un cliente.';

CREATE TABLE whatsapp_messages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    conversation_id     uuid NOT NULL REFERENCES whatsapp_conversations(id),
    direction           text NOT NULL CHECK (direction IN ('inbound','outbound')),
    external_message_id text NULL,
    type                text NOT NULL CHECK (type IN ('text','image','document','audio','video','template','other')),
    body                text NULL,
    template_name       text NULL,
    file_id             uuid NULL REFERENCES files(id),
    status              text NOT NULL CHECK (status IN ('received','sent','delivered','read','failed')),
    sent_by             uuid NULL REFERENCES users(id),
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    template_vars   jsonb NOT NULL DEFAULT '{}',   -- variables usadas en la plantilla aprobada,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, external_message_id)
);
CREATE INDEX ON whatsapp_messages (organization_id, conversation_id, occurred_at);
COMMENT ON TABLE whatsapp_messages IS 'Mensajes entrantes y salientes de WhatsApp; el id externo evita duplicados.';

CREATE TABLE mailing_lists (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    brand_id         uuid NOT NULL REFERENCES brands(id),
    name             text NOT NULL,
    provider_list_id text NULL,                  -- lista en Elastic Email
    criteria         jsonb NOT NULL DEFAULT '{}',-- marca, servicio, estado
    last_synced_at   timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, brand_id, name)
);
COMMENT ON TABLE mailing_lists IS 'Listas de mailing sincronizadas con Elastic Email por marca, servicio y estado.';

CREATE TABLE mailing_list_members (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    mailing_list_id  uuid NOT NULL REFERENCES mailing_lists(id),
    contact_id       uuid NULL REFERENCES contacts(id),
    lead_id          uuid NULL REFERENCES leads(id),
    email            text NOT NULL,
    status           text NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed','unsubscribed','bounced','complained')),
    status_changed_at timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE UNIQUE INDEX mailing_list_members_uq ON mailing_list_members (mailing_list_id, lower(email));
COMMENT ON TABLE mailing_list_members IS 'Miembros de cada lista con su estado; bajas y rebotes llegan desde Elastic Email.';

CREATE TABLE quotes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    number          text NOT NULL,
    brand_id        uuid NOT NULL REFERENCES brands(id),
    customer_id     uuid NULL REFERENCES customers(id),
    lead_id         uuid NULL REFERENCES leads(id),
    owner_id        uuid NULL REFERENCES users(id),
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired')),
    current_version integer NOT NULL DEFAULT 1 CHECK (current_version >= 1),
    currency        char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    valid_until     date NULL,
    sent_at         timestamptz NULL,
    accepted_at     timestamptz NULL,
    rejected_at     timestamptz NULL,
    rejection_reason text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK (customer_id IS NOT NULL OR lead_id IS NOT NULL),
    UNIQUE (organization_id, number)
);
CREATE INDEX ON quotes (organization_id, status, valid_until);
CREATE INDEX ON quotes (organization_id, customer_id);
COMMENT ON TABLE quotes IS 'Cotización con cargos únicos y recurrentes; cada cambio genera una versión. Se convierte en contrato o pedido.';

CREATE TABLE quote_versions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    quote_id        uuid NOT NULL REFERENCES quotes(id),
    version_number  integer NOT NULL CHECK (version_number >= 1),
    locale          text NOT NULL DEFAULT 'es',
    currency        char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    valid_until     date NULL,
    one_time_total_minor  bigint NOT NULL DEFAULT 0 CHECK (one_time_total_minor >= 0),
    recurring_total_minor bigint NOT NULL DEFAULT 0 CHECK (recurring_total_minor >= 0),
    tax_minor       bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
    terms           text NULL,
    change_note     text NULL,
    pdf_file_id     uuid NULL REFERENCES files(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (quote_id, version_number)
);
COMMENT ON TABLE quote_versions IS 'Versiones de una cotización; se conserva el historial completo.';

CREATE TABLE quote_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    quote_version_id uuid NOT NULL REFERENCES quote_versions(id),
    product_id       uuid NULL REFERENCES products(id),
    plan_id          uuid NULL REFERENCES plans(id),
    description      text NOT NULL,
    charge_type      text NOT NULL CHECK (charge_type IN ('one_time','recurring')),
    cycle            text NULL CHECK (cycle IN ('monthly','quarterly','semiannual','annual','biennial','triennial')),
    quantity         numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
    discount_minor   bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    total_minor      bigint NOT NULL CHECK (total_minor >= 0),
    currency         char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    sort_order       integer NOT NULL DEFAULT 0,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (charge_type = 'one_time' OR cycle IS NOT NULL)
);
CREATE INDEX ON quote_items (organization_id, quote_version_id);
COMMENT ON TABLE quote_items IS 'Líneas de una versión de cotización: únicas o recurrentes.';

-- ===== Módulo Contracts (CTR) =====

CREATE TABLE contract_templates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    brand_id        uuid NULL REFERENCES brands(id),
    product_category_id uuid NULL REFERENCES product_categories(id),   -- tipo de servicio
    name            text NOT NULL,
    locale          text NOT NULL DEFAULT 'es',
    body            text NOT NULL,                -- HTML del editor enriquecido con variables
    variables       jsonb NOT NULL DEFAULT '[]',
    is_active       boolean NOT NULL DEFAULT true,
    clause_ids      uuid[] NOT NULL DEFAULT '{}',  -- cláusulas sugeridas
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
COMMENT ON TABLE contract_templates IS 'Plantillas de contrato por tipo de servicio y marca, con variables.';

CREATE TABLE contract_clauses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    code            text NOT NULL,
    title           text NOT NULL,
    category        text NOT NULL CHECK (category IN ('confidentiality','sla','foreign_taxes','late_fee','account_handover','cloud_access_authorization','other')),
    locale          text NOT NULL DEFAULT 'es',
    body            text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code, locale)
);
COMMENT ON TABLE contract_clauses IS 'Biblioteca de cláusulas reutilizables administrada por documentación.';

CREATE TABLE contracts (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           uuid NOT NULL REFERENCES organizations(id),
    number                    text NOT NULL,
    customer_id               uuid NOT NULL REFERENCES customers(id),
    brand_id                  uuid NOT NULL REFERENCES brands(id),
    contract_template_id      uuid NULL REFERENCES contract_templates(id),
    quote_id                  uuid NULL REFERENCES quotes(id),
    status                    text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','sent','signed_active','expired','terminated')),
    current_version           integer NOT NULL DEFAULT 1 CHECK (current_version >= 1),
    starts_on                 date NULL,
    ends_on                   date NULL,
    currency                  char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    management_fee_percent    numeric(6,3) NULL CHECK (management_fee_percent >= 0),   -- refacturación: % sobre el monto del proveedor antes de impuestos
    management_fee_min_minor  bigint NULL CHECK (management_fee_min_minor >= 0),       -- mínimo mensual opcional
    included_hours            numeric(8,2) NULL CHECK (included_hours >= 0),           -- bolsa de horas por periodo
    approved_by               uuid NULL REFERENCES users(id),
    approved_at               timestamptz NULL,
    sent_at                   timestamptz NULL,
    signed_at                 timestamptz NULL,
    terminated_at             timestamptz NULL,
    termination_reason        text NULL,
    custom                    jsonb NOT NULL DEFAULT '{}',
    kind            text NOT NULL DEFAULT 'contract' CHECK (kind IN ('contract','terms')),  -- terms: términos aceptados en el portal; las adendas son contract_versions
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
    CHECK (status NOT IN ('approved','sent','signed_active') OR approved_at IS NOT NULL),
    CHECK (status <> 'signed_active' OR signed_at IS NOT NULL),
    UNIQUE (organization_id, number)
);
CREATE INDEX ON contracts (organization_id, customer_id, status);
CREATE INDEX ON contracts (organization_id, status, ends_on);
COMMENT ON TABLE contracts IS 'Contrato del cliente; aprobado por el administrador antes de enviarse. Firmado no se edita: los cambios van como adenda (nueva versión).';

CREATE TABLE contract_versions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    contract_id        uuid NOT NULL REFERENCES contracts(id),
    version_number     integer NOT NULL CHECK (version_number >= 1),
    kind               text NOT NULL DEFAULT 'original' CHECK (kind IN ('original','addendum')),
    body               text NOT NULL,
    variables_snapshot jsonb NOT NULL DEFAULT '{}',
    clause_ids         uuid[] NOT NULL DEFAULT '{}',
    change_summary     text NULL,
    locked_at          timestamptz NULL,       -- se fija al firmar
    file_id            uuid NULL REFERENCES files(id),  -- PDF de la versión,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (contract_id, version_number)
);
COMMENT ON TABLE contract_versions IS 'Versiones del contrato (original y adendas) con historial de cambios.';

CREATE TABLE contract_comments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    contract_id         uuid NOT NULL REFERENCES contracts(id),
    contract_version_id uuid NULL REFERENCES contract_versions(id),
    body                text NOT NULL,
    resolved_at         timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON contract_comments (organization_id, contract_id);
COMMENT ON TABLE contract_comments IS 'Comentarios internos durante la redacción del contrato.';

CREATE TABLE contract_signatures (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    contract_id         uuid NOT NULL REFERENCES contracts(id),
    contract_version_id uuid NOT NULL REFERENCES contract_versions(id),
    signer_party        text NOT NULL CHECK (signer_party IN ('customer','company')),
    signer_name         text NOT NULL,
    signer_email        text NULL,
    method              text NOT NULL CHECK (method IN ('scanned_upload','digital_certificate','esign_provider')),
    provider_reference  text NULL,
    status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','declined')),
    signed_at           timestamptz NULL,
    file_id             uuid NULL REFERENCES files(id),
    user_id         uuid NULL REFERENCES users(id),  -- usuario del portal que aceptó
    ip              inet NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (status <> 'signed' OR signed_at IS NOT NULL)
);
CREATE INDEX ON contract_signatures (organization_id, contract_id);
COMMENT ON TABLE contract_signatures IS 'Firmas del contrato: documento escaneado, firma digital o servicio de firma electrónica.';

CREATE TABLE account_handovers (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           uuid NOT NULL REFERENCES organizations(id),
    customer_id               uuid NOT NULL REFERENCES customers(id),
    contract_id               uuid NULL REFERENCES contracts(id),
    service_id                uuid NOT NULL REFERENCES services(id),
    cloud_account_id          uuid NULL REFERENCES cloud_accounts(id),
    status                    text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed')),
    scheduled_for             date NOT NULL,
    checklist                 jsonb NOT NULL DEFAULT '[]',
    holder_changed_at         timestamptz NULL,
    payment_method_changed_at timestamptz NULL,
    company_access_removed_at timestamptz NULL,
    credentials_rotated_at    timestamptz NULL,
    act_file_id               uuid NULL REFERENCES files(id),   -- acta de entrega firmada
    continue_as_managed       boolean NOT NULL DEFAULT false,
    completed_at              timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND act_file_id IS NOT NULL))
);
CREATE INDEX ON account_handovers (organization_id, status, scheduled_for);
COMMENT ON TABLE account_handovers IS 'Flujo de entrega de una cuenta al cliente al final del periodo: cambio de titular, retiro de accesos, rotación y acta firmada.';

-- ===== Módulo Orders (ORD) =====

CREATE TABLE orders (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL REFERENCES organizations(id),
    number               text NOT NULL,
    customer_id          uuid NOT NULL REFERENCES customers(id),
    brand_id             uuid NOT NULL REFERENCES brands(id),
    lead_id              uuid NULL REFERENCES leads(id),
    quote_id             uuid NULL REFERENCES quotes(id),
    contract_id          uuid NULL REFERENCES contracts(id),
    status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','payment_validated','provisioning','testing','active','manual_review','failed','cancelled')),
    currency             char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    total_minor          bigint NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
    idempotency_key      text NULL,
    requested_by         uuid NULL REFERENCES users(id),
    approved_by          uuid NULL REFERENCES users(id),
    approved_at          timestamptz NULL,
    payment_validated_at timestamptz NULL,
    manual_review_reason text NULL,
    notes                text NULL,
    invoice_id      uuid NULL,  -- FK al final (invoices): factura del pedido
    activated_at    timestamptz NULL,
    channel         text NOT NULL DEFAULT 'sales' CHECK (channel IN ('sales','online')),   -- registrado por ventas o generado por la compra en línea
    checkout_session_id uuid NULL,  -- FK al final (checkout_sessions): compra en línea que lo generó
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, number),
    UNIQUE (organization_id, idempotency_key),
    UNIQUE (organization_id, checkout_session_id),   -- una compra en línea genera un solo pedido
    CHECK (channel <> 'online' OR checkout_session_id IS NOT NULL)
);
CREATE INDEX ON orders (organization_id, status, created_at DESC);
CREATE INDEX ON orders (organization_id, customer_id);
COMMENT ON TABLE orders IS 'Pedido de cliente nuevo o adicional registrado por ventas o generado por una compra en línea pagada; máquina de estados con revisión humana y validación de pago.';

CREATE TABLE order_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    order_id         uuid NOT NULL REFERENCES orders(id),
    product_id       uuid NOT NULL REFERENCES products(id),
    plan_id          uuid NULL REFERENCES plans(id),
    service_id       uuid NULL REFERENCES services(id),   -- servicio creado al aprovisionar
    description      text NOT NULL,
    quantity         numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
    currency         char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    config           jsonb NOT NULL DEFAULT '{}',          -- dominio, nodo destino, opciones
    bundle_parent_item_id uuid NULL REFERENCES order_items(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON order_items (organization_id, order_id);
COMMENT ON TABLE order_items IS 'Líneas del pedido; cada una genera un servicio al aprovisionarse.';

CREATE TABLE provisioning_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    order_id        uuid NULL REFERENCES orders(id),
    order_item_id   uuid NULL REFERENCES order_items(id),
    service_id      uuid NULL REFERENCES services(id),
    connector       text NULL,                 -- NULL: tarea manual asistida
    operation       text NOT NULL,             -- create_account, suspend, unsuspend, renew, terminate, ...
    attempt         smallint NOT NULL CHECK (attempt >= 1),
    idempotency_key text NOT NULL,
    status          text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
    external_id     text NULL,
    request         jsonb NOT NULL DEFAULT '{}',   -- sin secretos
    response        jsonb NULL,
    error_class     text NULL CHECK (error_class IN ('transient','credentials','validation','unknown')),
    last_error      text NULL,
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (order_item_id IS NOT NULL OR service_id IS NOT NULL),
    CHECK (status = 'running' OR finished_at IS NOT NULL),
    UNIQUE (organization_id, idempotency_key, attempt)
);
CREATE INDEX ON provisioning_runs (organization_id, status, started_at DESC);
CREATE INDEX ON provisioning_runs (organization_id, service_id);
COMMENT ON TABLE provisioning_runs IS 'Un intento de aprovisionamiento por fila; antes de reintentar una creación se consulta al proveedor.';

-- ===== Módulo Billing (BIL) =====

CREATE TABLE tax_rates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    code            text NOT NULL,                 -- igv, ...
    name            text NOT NULL,
    country         char(2) NOT NULL DEFAULT 'PE',
    rate_percent    numeric(7,4) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
    effective_from  date NOT NULL,
    effective_to    date NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (effective_to IS NULL OR effective_to > effective_from),
    UNIQUE (organization_id, code, effective_from)
);
COMMENT ON TABLE tax_rates IS 'Tasas de impuesto (IGV) con fecha de vigencia; nunca fijas en el código.';

CREATE TABLE exchange_rates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    rate_date       date NOT NULL,
    base_currency   char(3) NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
    quote_currency  char(3) NOT NULL CHECK (quote_currency ~ '^[A-Z]{3}$'),
    rate            numeric(18,8) NOT NULL CHECK (rate > 0),
    source          text NOT NULL DEFAULT 'sunat',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (base_currency <> quote_currency),
    UNIQUE (organization_id, rate_date, base_currency, quote_currency, source)
);
COMMENT ON TABLE exchange_rates IS 'Tipo de cambio diario; los reportes consolidados convierten a la fecha del documento. Admite monedas de proveedores.';

CREATE TABLE payment_methods (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    code                   text NOT NULL,
    name                   text NOT NULL,
    kind                   text NOT NULL CHECK (kind IN ('bank_transfer','paypal','global66','card_gateway','other')),
    connector              text NULL,               -- NULL: medio manual con voucher
    bank_account_id        uuid NULL REFERENCES bank_accounts(id),
    fee_percent            numeric(6,3) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0 AND fee_percent <= 100),
    fee_fixed_minor        bigint NOT NULL DEFAULT 0 CHECK (fee_fixed_minor >= 0),
    fee_currency           char(3) NULL CHECK (fee_currency IN ('PEN','USD')),
    pass_to_customer       boolean NOT NULL DEFAULT false,   -- la comisión se traslada al cliente como línea aparte
    requires_proof         boolean NOT NULL DEFAULT true,
    available_in_portal    boolean NOT NULL DEFAULT true,
    instructions           jsonb NOT NULL DEFAULT '{}',
    is_active              boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (fee_fixed_minor = 0 OR fee_currency IS NOT NULL),
    UNIQUE (organization_id, code)
);
COMMENT ON TABLE payment_methods IS 'Medios de pago configurables (transferencia, tarjeta mediante pasarela local, PayPal, Global66...) con comisión porcentual y fija y si se traslada al cliente.';

CREATE TABLE invoices (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    legal_entity_id        uuid NOT NULL REFERENCES legal_entities(id),
    brand_id               uuid NOT NULL REFERENCES brands(id),
    customer_id            uuid NOT NULL REFERENCES customers(id),
    type                   text NOT NULL CHECK (type IN ('invoice','receipt','credit_note','debit_note')),
    status                 text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partially_paid','paid','overdue','void')),
    fiscal_status          text NOT NULL DEFAULT 'pending' CHECK (fiscal_status IN ('not_applicable','pending','accepted','rejected','voided')),
    tax_treatment          text NOT NULL DEFAULT 'taxed' CHECK (tax_treatment IN ('taxed','export')),
    document_series_id     uuid NULL REFERENCES document_series(id),
    series                 text NULL,
    number                 integer NULL CHECK (number >= 1),
    currency               char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    issue_date             date NULL,
    due_date               date NULL,
    subtotal_minor         bigint NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
    discount_minor         bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    tax_minor              bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
    total_minor            bigint NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
    balance_minor          bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
    detraction_percent     numeric(6,3) NULL CHECK (detraction_percent >= 0 AND detraction_percent <= 100),
    detraction_minor       bigint NULL CHECK (detraction_minor >= 0),
    references_invoice_id  uuid NULL REFERENCES invoices(id),   -- documento que corrige una nota
    note_reason            text NULL,
    pdf_file_id            uuid NULL REFERENCES files(id),
    issued_at              timestamptz NULL,
    issued_by              uuid NULL REFERENCES users(id),
    paid_at                timestamptz NULL,
    voided_at              timestamptz NULL,
    void_reason            text NULL,
    notes                  text NULL,
    custom                 jsonb NOT NULL DEFAULT '{}',
    locale          text NOT NULL DEFAULT 'es',  -- idioma del PDF
    billing_window_key text NULL,  -- ventana de consolidación (billing.consolidation_window_days)
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    -- numeración única por entidad emisora y serie
    UNIQUE (organization_id, legal_entity_id, series, number),
    CHECK (total_minor = subtotal_minor - discount_minor + tax_minor),
    CHECK (balance_minor <= total_minor),
    -- un borrador no tiene número; un documento emitido sí
    CHECK (status = 'draft' OR (series IS NOT NULL AND number IS NOT NULL AND issue_date IS NOT NULL AND issued_at IS NOT NULL)),
    CHECK ((series IS NULL) = (number IS NULL)),
    CHECK (type NOT IN ('credit_note','debit_note') OR references_invoice_id IS NOT NULL),
    CHECK (tax_treatment <> 'export' OR tax_minor = 0),
    CHECK (tax_treatment <> 'export' OR detraction_minor IS NULL),   -- sin detracción fuera de Perú
    CHECK (status <> 'paid' OR balance_minor = 0),
    CHECK (status <> 'void' OR voided_at IS NOT NULL)
);
CREATE INDEX ON invoices (organization_id, customer_id, status);
CREATE INDEX ON invoices (organization_id, status, due_date) WHERE status IN ('issued','partially_paid','overdue');
CREATE INDEX ON invoices (organization_id, fiscal_status) WHERE fiscal_status IN ('pending','rejected');
CREATE INDEX ON invoices (organization_id, issue_date);
COMMENT ON TABLE invoices IS 'Facturas, boletas y notas. Emitida no se edita (se corrige con nota). Numeración única por (organización, entidad emisora, serie, número).';

CREATE TABLE invoice_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    invoice_id       uuid NOT NULL REFERENCES invoices(id),
    kind             text NOT NULL CHECK (kind IN ('service','one_time','rebilling','payment_surcharge','late_fee','adjustment')),
    service_id       uuid NULL REFERENCES services(id),
    subscription_id  uuid NULL REFERENCES subscriptions(id),
    product_id       uuid NULL REFERENCES products(id),
    description      text NOT NULL,
    period_start     date NULL,
    period_end       date NULL,
    quantity         numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
    discount_minor   bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    subtotal_minor   bigint NOT NULL CHECK (subtotal_minor >= 0),
    tax_rate_id      uuid NULL REFERENCES tax_rates(id),
    tax_minor        bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
    total_minor      bigint NOT NULL CHECK (total_minor >= 0),
    currency         char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    sort_order       integer NOT NULL DEFAULT 0,
    provider_bill_id uuid NULL,                     -- FK al final (provider_bills): línea de refacturación,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (total_minor = subtotal_minor + tax_minor),
    CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
CREATE INDEX ON invoice_items (organization_id, invoice_id);
CREATE INDEX ON invoice_items (organization_id, service_id);
COMMENT ON TABLE invoice_items IS 'Líneas del comprobante: una por servicio con el importe total; la comisión por medio de pago y el recargo por mora van como líneas aparte.';

CREATE TABLE einvoice_submissions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    invoice_id       uuid NOT NULL REFERENCES invoices(id),
    provider         text NOT NULL,             -- OSE/PSE elegido
    operation        text NOT NULL CHECK (operation IN ('issue','void','status_query','resend')),
    attempt          smallint NOT NULL DEFAULT 1 CHECK (attempt >= 1),
    status           text NOT NULL CHECK (status IN ('queued','sent','accepted','rejected','error')),
    provider_reference text NULL,
    response_code    text NULL,
    response_message text NULL,
    xml_file_id      uuid NULL REFERENCES files(id),
    cdr_file_id      uuid NULL REFERENCES files(id),
    pdf_file_id      uuid NULL REFERENCES files(id),
    sent_at          timestamptz NULL,
    responded_at     timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (invoice_id, operation, attempt)
);
CREATE INDEX ON einvoice_submissions (organization_id, status, created_at DESC);
COMMENT ON TABLE einvoice_submissions IS 'Envíos al proveedor de facturación electrónica (OSE/PSE) con XML, CDR, PDF y respuesta, por intento.';

CREATE TABLE payments (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL REFERENCES organizations(id),
    customer_id          uuid NOT NULL REFERENCES customers(id),
    payment_method_id    uuid NOT NULL REFERENCES payment_methods(id),
    kind                 text NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','igv_withholding')),  -- retención registrada como pago parcial
    status               text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','validated','rejected','refunded','charged_back')),
    amount_minor         bigint NOT NULL CHECK (amount_minor > 0),
    currency             char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    fee_minor            bigint NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),   -- comisión real cobrada por el medio (gasto)
    external_id          text NULL,                 -- id de captura PayPal, id de transacción de la pasarela de tarjetas, número de operación, ...
    bank_account_id      uuid NULL REFERENCES bank_accounts(id),
    proof_file_id        uuid NULL REFERENCES files(id),   -- voucher o comprobante de retención
    reported_via         text NOT NULL CHECK (reported_via IN ('portal','sales','finance','webhook','import')),
    reported_by          uuid NULL REFERENCES users(id),
    received_at          timestamptz NULL,
    validated_by         uuid NULL REFERENCES users(id),
    validated_at         timestamptz NULL,
    rejection_reason     text NULL,
    refunded_at          timestamptz NULL,
    refund_authorized_by uuid NULL REFERENCES users(id),
    notes                text NULL,
    checkout_session_id  uuid NULL,   -- FK al final (checkout_sessions): pago de una compra en línea antes de existir la factura
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    -- un mismo cobro externo no se registra dos veces por medio de pago
    UNIQUE (organization_id, payment_method_id, external_id),
    CHECK (status NOT IN ('validated','refunded','charged_back') OR (validated_at IS NOT NULL AND (validated_by IS NOT NULL OR reported_via = 'webhook'))),
    CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
    CHECK (status <> 'refunded' OR (refunded_at IS NOT NULL AND refund_authorized_by IS NOT NULL))
);
CREATE INDEX ON payments (organization_id, status, created_at DESC);
CREATE INDEX ON payments (organization_id, customer_id, created_at DESC);
CREATE INDEX payments_org_received_validated_idx ON payments (organization_id, received_at) WHERE status = 'validated';
COMMENT ON TABLE payments IS 'Pagos y vouchers. Un voucher crea un pago "reported"; solo finanzas lo valida. PayPal y la pasarela de tarjetas se validan con su webhook firmado e importe coincidente. Un contracargo lo deja en "charged_back".';

CREATE TABLE payment_allocations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    payment_id      uuid NOT NULL REFERENCES payments(id),
    invoice_id      uuid NOT NULL REFERENCES invoices(id),
    amount_minor    bigint NOT NULL CHECK (amount_minor > 0),
    currency        char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (payment_id, invoice_id)
);
CREATE INDEX ON payment_allocations (organization_id, invoice_id);
COMMENT ON TABLE payment_allocations IS 'Aplicación de un pago a una o varias facturas; el saldo de la factura se recalcula con ellas.';

CREATE TABLE payment_checkouts (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         uuid NOT NULL REFERENCES organizations(id),
    customer_id             uuid NOT NULL REFERENCES customers(id),
    payment_method_id       uuid NOT NULL REFERENCES payment_methods(id),
    invoice_ids             uuid[] NOT NULL DEFAULT '{}',   -- una o varias facturas de la misma moneda (vacío en una compra en línea)
    checkout_session_id     uuid NULL,      -- FK al final (checkout_sessions): pago de una compra en línea
    amount_minor            bigint NOT NULL CHECK (amount_minor > 0),              -- saldo de las facturas más el recargo
    surcharge_minor         bigint NOT NULL DEFAULT 0 CHECK (surcharge_minor >= 0),  -- comisión trasladada al cliente
    currency                char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    status                  text NOT NULL DEFAULT 'created' CHECK (status IN ('created','approved','declined','expired','cancelled')),
    external_session_id     text NULL,      -- sesión, orden o token del formulario alojado por la pasarela
    external_transaction_id text NULL,      -- transacción aprobada informada por el webhook
    payment_id              uuid NULL REFERENCES payments(id),
    decline_reason          text NULL,      -- código y mensaje de la pasarela; nunca datos de la tarjeta
    expires_at              timestamptz NOT NULL,
    completed_at            timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, payment_method_id, external_session_id),
    -- paga facturas emitidas o una compra en línea, nunca ambas cosas ni ninguna
    CHECK ((cardinality(invoice_ids) >= 1 AND checkout_session_id IS NULL) OR (cardinality(invoice_ids) = 0 AND checkout_session_id IS NOT NULL)),
    CHECK (surcharge_minor < amount_minor),
    CHECK (status <> 'approved' OR (payment_id IS NOT NULL AND external_transaction_id IS NOT NULL AND completed_at IS NOT NULL)),
    CHECK (status <> 'declined' OR decline_reason IS NOT NULL)
);
CREATE INDEX ON payment_checkouts (organization_id, customer_id, created_at DESC);
CREATE INDEX ON payment_checkouts (organization_id, status, expires_at) WHERE status = 'created';
COMMENT ON TABLE payment_checkouts IS 'Intentos de pago con tarjeta desde el portal: facturas o compra en línea, importe con recargo y sesión del formulario alojado por la pasarela. El sistema nunca recibe ni guarda datos de tarjeta.';

CREATE TABLE payment_refunds (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    payment_id       uuid NOT NULL REFERENCES payments(id),
    amount_minor     bigint NOT NULL CHECK (amount_minor > 0),   -- total o parcial
    currency         char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    status           text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','succeeded','failed')),
    reason           text NOT NULL,
    external_id      text NULL,              -- id del reembolso en la pasarela o PayPal; número de operación si es manual
    credit_note_id   uuid NULL REFERENCES invoices(id),
    requested_by     uuid NULL REFERENCES users(id),
    authorized_by    uuid NULL REFERENCES users(id),
    authorized_at    timestamptz NULL,
    completed_at     timestamptz NULL,
    failure_reason   text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    -- un mismo reembolso externo no se registra dos veces
    UNIQUE (organization_id, payment_id, external_id),
    CHECK (status = 'requested' OR (authorized_by IS NOT NULL AND authorized_at IS NOT NULL)),
    CHECK (status <> 'succeeded' OR completed_at IS NOT NULL),
    CHECK (status <> 'failed' OR failure_reason IS NOT NULL)
);
CREATE INDEX ON payment_refunds (organization_id, payment_id);
CREATE INDEX ON payment_refunds (organization_id, status, created_at DESC);
COMMENT ON TABLE payment_refunds IS 'Reembolsos totales o parciales de un pago: solicitud, autorización con MFA, ejecución por API (pasarela, PayPal) o registro manual, y nota de crédito enlazada.';

CREATE TABLE payment_disputes (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES organizations(id),
    payment_id            uuid NOT NULL REFERENCES payments(id),
    customer_id           uuid NOT NULL REFERENCES customers(id),
    external_id           text NOT NULL,          -- id del contracargo en la pasarela
    reason_code           text NULL,              -- motivo informado por la pasarela o el emisor
    amount_minor          bigint NOT NULL CHECK (amount_minor > 0),
    currency              char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','evidence_submitted','won','lost')),
    reported_via          text NOT NULL CHECK (reported_via IN ('webhook','finance')),
    opened_at             timestamptz NOT NULL,
    respond_by            date NULL,              -- fecha límite para presentar descargos
    evidence_file_id      uuid NULL REFERENCES files(id),
    evidence_submitted_at timestamptz NULL,
    resolved_at           timestamptz NULL,
    alert_id              uuid NULL,              -- FK al final (alerts): alerta abierta para finanzas
    notes                 text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    -- un mismo contracargo no se registra dos veces
    UNIQUE (organization_id, payment_id, external_id),
    CHECK (status <> 'evidence_submitted' OR evidence_submitted_at IS NOT NULL),
    CHECK (status NOT IN ('won','lost') OR resolved_at IS NOT NULL)
);
CREATE INDEX ON payment_disputes (organization_id, status, respond_by);
COMMENT ON TABLE payment_disputes IS 'Contracargos de pagos con tarjeta: abren una alerta para finanzas, revierten la aplicación (la factura vuelve a tener saldo) y se cierran ganados o perdidos.';

CREATE TABLE payment_promises (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    invoice_id      uuid NOT NULL REFERENCES invoices(id),
    customer_id     uuid NOT NULL REFERENCES customers(id),
    promised_date   date NOT NULL,
    amount_minor    bigint NULL CHECK (amount_minor > 0),
    currency        char(3) NULL CHECK (currency IN ('PEN','USD')),
    status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','kept','broken')),
    resolved_at     timestamptz NULL,
    notes           text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK ((amount_minor IS NULL) = (currency IS NULL))
);
CREATE UNIQUE INDEX payment_promises_one_open ON payment_promises (invoice_id) WHERE status = 'open';
CREATE INDEX ON payment_promises (organization_id, status, promised_date);
COMMENT ON TABLE payment_promises IS 'Compromisos de pago: postergan la suspensión hasta la fecha comprometida; si vence sin pago, la cobranza continúa.';

CREATE TABLE credit_balances (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    customer_id     uuid NOT NULL REFERENCES customers(id),
    direction       text NOT NULL CHECK (direction IN ('credit','debit')),
    amount_minor    bigint NOT NULL CHECK (amount_minor > 0),
    currency        char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    source_type     text NOT NULL CHECK (source_type IN ('overpayment','credit_note','manual','invoice_application')),
    source_id       uuid NULL,
    invoice_id      uuid NULL REFERENCES invoices(id),
    notes           text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON credit_balances (organization_id, customer_id, currency);
COMMENT ON TABLE credit_balances IS 'Movimientos de saldo a favor del cliente por moneda; el saldo es la suma de créditos menos débitos.';

CREATE TABLE coupons (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    code            text NOT NULL,
    description     text NULL,
    discount_type   text NOT NULL CHECK (discount_type IN ('percent','fixed')),
    discount_percent numeric(6,3) NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
    discount_minor  bigint NULL CHECK (discount_minor > 0),
    currency        char(3) NULL CHECK (currency IN ('PEN','USD')),
    brand_id        uuid NULL REFERENCES brands(id),
    product_id      uuid NULL REFERENCES products(id),
    valid_from      date NULL,
    valid_until     date NULL,
    max_uses        integer NULL CHECK (max_uses > 0),
    uses_count      integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
    is_active       boolean NOT NULL DEFAULT true,
    is_public       boolean NOT NULL DEFAULT false,   -- solo los públicos se exponen en el bloque 'promocion' del widget
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (discount_type <> 'percent' OR discount_percent IS NOT NULL),
    CHECK (discount_type <> 'fixed' OR (discount_minor IS NOT NULL AND currency IS NOT NULL)),
    CHECK (max_uses IS NULL OR uses_count <= max_uses)
);
CREATE UNIQUE INDEX coupons_org_code_uq ON coupons (organization_id, upper(code));
COMMENT ON TABLE coupons IS 'Cupones y promociones (porcentaje o monto fijo) por marca o producto.';

CREATE TABLE provider_bills (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    provider_account_id uuid NOT NULL REFERENCES provider_accounts(id),
    cloud_account_id    uuid NULL REFERENCES cloud_accounts(id),
    customer_id         uuid NULL REFERENCES customers(id),
    service_id          uuid NULL REFERENCES services(id),
    contract_id         uuid NULL REFERENCES contracts(id),
    bill_number         text NULL,
    period_start        date NULL,
    period_end          date NULL,
    issue_date          date NOT NULL,
    amount_minor        bigint NOT NULL CHECK (amount_minor >= 0),
    cost_currency       char(3) NOT NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    source              text NOT NULL CHECK (source IN ('api','upload')),
    file_id             uuid NULL REFERENCES files(id),      -- sustento visible al cliente
    status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rebilled','not_rebillable')),
    rebilled_invoice_id uuid NULL REFERENCES invoices(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (status <> 'rebilled' OR rebilled_invoice_id IS NOT NULL),
    UNIQUE (organization_id, provider_account_id, bill_number)
);
CREATE INDEX ON provider_bills (organization_id, status, issue_date);
CREATE INDEX ON provider_bills (organization_id, customer_id);
COMMENT ON TABLE provider_bills IS 'Facturas de proveedor para refacturar (importe + % de administración del contrato + impuestos) y detectar meses sin cobrar.';

CREATE TABLE dunning_sequences (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    name            text NOT NULL,
    scope_type      text NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global','brand','product','customer','contract')),
    scope_id        uuid NULL,
    is_active       boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK ((scope_type = 'global') = (scope_id IS NULL)),
    UNIQUE NULLS NOT DISTINCT (organization_id, scope_type, scope_id)
);
COMMENT ON TABLE dunning_sequences IS 'Secuencia de cobranza por nivel (general, marca, producto, cliente, contrato); gana la más específica.';

CREATE TABLE dunning_stages (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES organizations(id),
    dunning_sequence_id      uuid NOT NULL REFERENCES dunning_sequences(id) ON DELETE CASCADE,
    offset_days              integer NOT NULL,     -- negativo: antes del vencimiento; 0: el día; positivo: después
    action                   text NOT NULL CHECK (action IN ('send_notice','create_finance_task','suspend_service')),
    channels                 text[] NOT NULL DEFAULT '{email,portal}'
                             CHECK (channels <@ ARRAY['email','portal','whatsapp']::text[]),
    notification_template_code text NULL,          -- se resuelve por marca e idioma en notification_templates
    recipient_contact_role   text NOT NULL DEFAULT 'billing' CHECK (recipient_contact_role IN ('billing','administrative','technical')),
    internal_copy            text NOT NULL DEFAULT 'none' CHECK (internal_copy IN ('finance','account_manager','none')),
    send_time                time NOT NULL DEFAULT '09:00',   -- en la zona del cliente
    non_business_day         text NOT NULL DEFAULT 'send_anyway' CHECK (non_business_day IN ('send_anyway','next_business_day')),
    is_active                boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (dunning_sequence_id, offset_days, action)
);
COMMENT ON TABLE dunning_stages IS 'Etapas de la secuencia de cobranza: momento, acción, canales, plantilla, destinatario, copia interna, hora y días no hábiles.';

CREATE TABLE dunning_events (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES organizations(id),
    invoice_id               uuid NOT NULL REFERENCES invoices(id),
    service_id               uuid NULL REFERENCES services(id),
    dunning_stage_id         uuid NOT NULL REFERENCES dunning_stages(id),
    action                   text NOT NULL CHECK (action IN ('send_notice','create_finance_task','suspend_service')),
    status                   text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','skipped_promise','skipped_exempt','skipped_paid','failed')),
    scheduled_for            timestamptz NOT NULL,
    executed_at              timestamptz NULL,
    detail                   jsonb NOT NULL DEFAULT '{}',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (invoice_id, dunning_stage_id)
);
CREATE INDEX ON dunning_events (organization_id, status, scheduled_for);
COMMENT ON TABLE dunning_events IS 'Ejecución de cada etapa de cobranza por factura: alimenta la bandeja diaria de finanzas.';

-- ===== Módulo Finance (FIN) =====

CREATE TABLE costs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    kind                text NOT NULL CHECK (kind IN ('provider_recurring','provider_one_time','license','payment_fee','other')),
    resource_id         uuid NULL REFERENCES resources(id),
    provider_account_id uuid NULL REFERENCES provider_accounts(id),
    provider_bill_id    uuid NULL REFERENCES provider_bills(id),
    payment_id          uuid NULL REFERENCES payments(id),      -- comisión real del medio de pago
    period_month        date NOT NULL CHECK (extract(day FROM period_month) = 1),
    amount_minor        bigint NOT NULL CHECK (amount_minor >= 0),
    cost_currency       char(3) NOT NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    allocation_method   text NOT NULL DEFAULT 'manual' CHECK (allocation_method IN ('resources','percentage','usage','manual','none')),
    description         text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON costs (organization_id, period_month);
CREATE INDEX ON costs (organization_id, resource_id, period_month);
COMMENT ON TABLE costs IS 'Costos por periodo (proveedor, licencias, comisiones de pago) que se reparten entre servicios.';

CREATE TABLE cost_allocations (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    cost_id          uuid NOT NULL REFERENCES costs(id) ON DELETE CASCADE,
    service_id       uuid NOT NULL REFERENCES services(id),
    saas_instance_id uuid NULL REFERENCES saas_instances(id),
    share_percent    numeric(9,6) NULL CHECK (share_percent >= 0 AND share_percent <= 100),
    amount_minor     bigint NOT NULL CHECK (amount_minor >= 0),
    cost_currency    char(3) NOT NULL CHECK (cost_currency ~ '^[A-Z]{3}$'),
    basis            jsonb NOT NULL DEFAULT '{}',   -- usuarios activos, MB, cuentas usadas para el reparto
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (cost_id, service_id)
);
CREATE INDEX ON cost_allocations (organization_id, service_id);
COMMENT ON TABLE cost_allocations IS 'Reparto de un costo entre servicios (por recursos, porcentaje, consumo o manual) para la rentabilidad.';

-- ===== Módulo Helpdesk (HLP) =====

CREATE TABLE sla_policies (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL REFERENCES organizations(id),
    name                 text NOT NULL,
    scope_type           text NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global','product','contract')),
    scope_id             uuid NULL,
    business_calendar    text NOT NULL DEFAULT 'default',   -- business_hours.calendar
    holiday_country      char(2) NOT NULL DEFAULT 'PE',
    warn_at_percent      smallint NOT NULL DEFAULT 75 CHECK (warn_at_percent BETWEEN 1 AND 100),
    alert_recipients     jsonb NOT NULL DEFAULT '[]',
    is_active            boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK ((scope_type = 'global') = (scope_id IS NULL)),
    UNIQUE NULLS NOT DISTINCT (organization_id, scope_type, scope_id)
);
COMMENT ON TABLE sla_policies IS 'Política de SLA general, por producto o por contrato: calendario, feriados y alertas al 75 % y al incumplir.';

CREATE TABLE sla_targets (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    sla_policy_id          uuid NOT NULL REFERENCES sla_policies(id) ON DELETE CASCADE,
    priority               text NOT NULL CHECK (priority IN ('critical','high','medium','low')),
    first_response_minutes integer NOT NULL CHECK (first_response_minutes > 0),   -- en tiempo hábil
    resolution_minutes     integer NOT NULL CHECK (resolution_minutes > 0),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (resolution_minutes >= first_response_minutes),
    UNIQUE (sla_policy_id, priority)
);
COMMENT ON TABLE sla_targets IS 'Tiempos de primera respuesta y solución por prioridad dentro de una política de SLA.';

CREATE TABLE tickets (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES organizations(id),
    number                   text NOT NULL,
    customer_id              uuid NULL REFERENCES customers(id),
    contact_id               uuid NULL REFERENCES contacts(id),
    brand_id                 uuid NULL REFERENCES brands(id),
    type                     text NOT NULL DEFAULT 'request' CHECK (type IN ('incident','request','question','billing','complaint','security')),
    status                   text NOT NULL DEFAULT 'new' CHECK (status IN ('new','open','in_progress','waiting_customer','waiting_provider','escalated','resolved','closed','reopened')),
    priority                 text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
    channel                  text NOT NULL CHECK (channel IN ('email','portal','whatsapp','phone','internal','monitoring','assistant','web_form')),
    subject                  text NOT NULL,
    assignee_id              uuid NULL REFERENCES users(id),
    sla_policy_id            uuid NULL REFERENCES sla_policies(id),
    first_response_due_at    timestamptz NULL,
    first_responded_at       timestamptz NULL,
    resolution_due_at        timestamptz NULL,
    sla_paused_since         timestamptz NULL,     -- en espera de cliente o proveedor
    sla_paused_minutes       integer NOT NULL DEFAULT 0 CHECK (sla_paused_minutes >= 0),
    sla_breached             boolean NOT NULL DEFAULT false,
    whatsapp_conversation_id uuid NULL REFERENCES whatsapp_conversations(id),
    resolved_at              timestamptz NULL,
    closed_at                timestamptz NULL,
    reopened_count           smallint NOT NULL DEFAULT 0 CHECK (reopened_count >= 0),
    last_customer_activity_at timestamptz NULL,
    custom                   jsonb NOT NULL DEFAULT '{}',
    department      text NULL,                      -- valor de helpdesk.departments
    category        text NULL,
    level           smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3),  -- nivel de soporte (escalamiento)
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK (status NOT IN ('resolved','closed') OR resolved_at IS NOT NULL),
    UNIQUE (organization_id, number)
);
CREATE INDEX ON tickets (organization_id, status, priority) WHERE deleted_at IS NULL;
CREATE INDEX ON tickets (organization_id, customer_id, created_at DESC);
CREATE INDEX ON tickets (organization_id, assignee_id, status);
CREATE INDEX ON tickets (organization_id, resolution_due_at) WHERE status NOT IN ('resolved','closed');
COMMENT ON TABLE tickets IS 'Help desk: cada pedido del cliente, también por WhatsApp, es un ticket con SLA que corre en horario hábil y se pausa en espera.';

CREATE TABLE ticket_messages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    ticket_id           uuid NOT NULL REFERENCES tickets(id),
    author_type         text NOT NULL CHECK (author_type IN ('staff','customer','system')),
    author_user_id      uuid NULL REFERENCES users(id),
    author_contact_id   uuid NULL REFERENCES contacts(id),
    channel             text NOT NULL CHECK (channel IN ('email','portal','whatsapp','phone','internal')),
    body                text NOT NULL,
    is_internal         boolean NOT NULL DEFAULT false,   -- nota interna: no se muestra al cliente; solo la escribe el personal
    external_message_id text NULL,
    in_reply_to     text NULL,  -- Message-ID del correo respondido
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, external_message_id),
    CHECK (NOT is_internal OR (author_type = 'staff' AND channel = 'internal'))
);
CREATE INDEX ON ticket_messages (organization_id, ticket_id, created_at);
COMMENT ON TABLE ticket_messages IS 'Mensajes y notas internas del ticket; adjuntos en files.';

CREATE TABLE ticket_links (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    linkable_type   text NOT NULL CHECK (linkable_type IN ('service','domain','server','saas_instance','project_component','resource','hosting_account','incident','problem','change_request','task')),
    linkable_id     uuid NOT NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (ticket_id, linkable_type, linkable_id)
);
CREATE INDEX ON ticket_links (organization_id, linkable_type, linkable_id);
COMMENT ON TABLE ticket_links IS 'Enlace polimórfico del ticket a servicio, dominio, servidor, plataforma o componente.';

CREATE TABLE kb_categories (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    parent_id       uuid NULL REFERENCES kb_categories(id),
    name            text NOT NULL,
    slug            text NOT NULL,
    visibility      text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','internal')),
    sort_order      integer NOT NULL DEFAULT 0,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, slug)
);
COMMENT ON TABLE kb_categories IS 'Categorías de la base de conocimientos.';

CREATE TABLE kb_articles (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    kb_category_id  uuid NULL REFERENCES kb_categories(id),
    brand_id        uuid NULL REFERENCES brands(id),
    locale          text NOT NULL DEFAULT 'es',
    title           text NOT NULL,
    slug            text NOT NULL,
    body            text NOT NULL,
    visibility      text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('public','internal')),
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
    published_at    timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    UNIQUE (organization_id, locale, slug)
);
CREATE INDEX ON kb_articles (organization_id, status, visibility);
COMMENT ON TABLE kb_articles IS 'Artículos de la base de conocimientos del sistema, públicos (portal y asistente) o internos para soporte, por idioma y marca. El blog y la base de conocimientos de las webs viven en WordPress (docs/00 §26) y no se copian aquí.';

CREATE TABLE satisfaction_surveys (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    ticket_id       uuid NOT NULL UNIQUE REFERENCES tickets(id),
    customer_id     uuid NULL REFERENCES customers(id),
    contact_id      uuid NULL REFERENCES contacts(id),
    token_hash      char(64) NOT NULL UNIQUE,
    sent_at         timestamptz NOT NULL DEFAULT now(),
    answered_at     timestamptz NULL,
    score           smallint NULL CHECK (score BETWEEN 1 AND 5),
    comment         text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK ((answered_at IS NULL) = (score IS NULL))
);
COMMENT ON TABLE satisfaction_surveys IS 'Encuesta de satisfacción enviada al cerrar un ticket.';

-- ===== Módulo Work (WRK) =====

CREATE TABLE work_projects (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    code              text NOT NULL,
    name              text NOT NULL,
    customer_id       uuid NULL REFERENCES customers(id),
    client_project_id uuid NULL REFERENCES client_projects(id),
    owner_id          uuid NULL REFERENCES users(id),
    status            text NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','on_hold','completed','cancelled')),
    starts_on         date NULL,
    due_on            date NULL,
    hours_budget    numeric(8,2) NULL CHECK (hours_budget >= 0),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code)
);
COMMENT ON TABLE work_projects IS 'Proyectos internos (migraciones, regularizaciones, implementaciones) que agrupan tareas.';

CREATE TABLE problems (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    number          text NOT NULL,
    title           text NOT NULL,
    description     text NULL,
    status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','known_error','resolved','closed')),
    root_cause      text NULL,
    workaround      text NULL,
    owner_id        uuid NULL REFERENCES users(id),
    resolved_at     timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, number)
);
COMMENT ON TABLE problems IS 'Problemas: causa raíz común de varios incidentes o tickets, con solución temporal.';

CREATE TABLE change_requests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    number          text NOT NULL,
    title           text NOT NULL,
    description     text NULL,
    customer_id     uuid NULL REFERENCES customers(id),
    service_id      uuid NULL REFERENCES services(id),
    problem_id      uuid NULL REFERENCES problems(id),
    risk            text NOT NULL DEFAULT 'medium' CHECK (risk IN ('low','medium','high')),
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','scheduled','implemented','failed','closed')),
    rollback_plan   text NULL,
    requested_by    uuid NULL REFERENCES users(id),
    approved_by     uuid NULL REFERENCES users(id),
    approved_at     timestamptz NULL,
    scheduled_for   timestamptz NULL,
    implemented_at  timestamptz NULL,
    kind            text NOT NULL DEFAULT 'normal' CHECK (kind IN ('standard','normal','emergency','server_reboot','dns_change')),
    target_type     text NULL,                      -- server, domain, service, resource ...
    target_id       uuid NULL,
    plan            text NULL,
    scheduled_until timestamptz NULL,  -- fin de la ventana de cambio
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (status NOT IN ('approved','scheduled','implemented') OR approved_at IS NOT NULL),
    UNIQUE (organization_id, number)
);
CREATE INDEX ON change_requests (organization_id, status);
COMMENT ON TABLE change_requests IS 'Solicitudes de cambio con riesgo, aprobación y plan de reversión (máquina de estados).';

CREATE TABLE tasks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    number          text NOT NULL,
    work_project_id uuid NULL REFERENCES work_projects(id),
    title           text NOT NULL,
    description     text NULL,
    status          text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','in_review','done','cancelled')),
    priority        text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
    assignee_id     uuid NULL REFERENCES users(id),
    due_at          timestamptz NULL,
    source_type     text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','ticket','alert','renewal','order','dunning','domain_operation','secret_rotation','certificate','maintenance','migration','change_request','handover','sync','procedure','restore_request')),
    source_id       uuid NULL,
    customer_id     uuid NULL REFERENCES customers(id),
    service_id      uuid NULL REFERENCES services(id),
    is_billable     boolean NOT NULL DEFAULT false,
    completed_at    timestamptz NULL,
    custom          jsonb NOT NULL DEFAULT '{}',
    parent_id       uuid NULL REFERENCES tasks(id),
    requires_approval boolean NOT NULL DEFAULT false,
    approved_by     uuid NULL REFERENCES users(id),
    approved_at     timestamptz NULL,
    is_template     boolean NOT NULL DEFAULT false,
    recurrence      text NULL,  -- regla RRULE de tareas recurrentes
    template_id     uuid NULL REFERENCES tasks(id),
    is_sensitive    boolean NOT NULL DEFAULT false,  -- tareas de rotación de accesos
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK (status <> 'done' OR completed_at IS NOT NULL),
    UNIQUE (organization_id, number)
);
CREATE INDEX ON tasks (organization_id, assignee_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ON tasks (organization_id, status, due_at) WHERE status NOT IN ('done','cancelled');
CREATE INDEX ON tasks (organization_id, source_type, source_id);
COMMENT ON TABLE tasks IS 'Tareas de soporte y operación; nacen de tickets, alertas, renovaciones, pedidos o a mano (incluye tareas manuales asistidas de conectores).';

CREATE TABLE task_checklist_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    task_id         uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label           text NOT NULL,
    is_done         boolean NOT NULL DEFAULT false,
    done_by         uuid NULL REFERENCES users(id),
    done_at         timestamptz NULL,
    sort_order      integer NOT NULL DEFAULT 0,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (NOT is_done OR done_at IS NOT NULL)
);
CREATE INDEX ON task_checklist_items (organization_id, task_id);
COMMENT ON TABLE task_checklist_items IS 'Lista de verificación de una tarea (pasos del procedimiento manual asistido).';

CREATE TABLE task_dependencies (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    task_id            uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (task_id <> depends_on_task_id),
    UNIQUE (task_id, depends_on_task_id)
);
COMMENT ON TABLE task_dependencies IS 'Dependencias entre tareas.';

CREATE TABLE time_entries (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    user_id          uuid NOT NULL REFERENCES users(id),
    task_id          uuid NULL REFERENCES tasks(id),
    ticket_id        uuid NULL REFERENCES tickets(id),
    customer_id      uuid NULL REFERENCES customers(id),
    service_id       uuid NULL REFERENCES services(id),
    contract_id      uuid NULL REFERENCES contracts(id),     -- consumo de bolsa de horas
    started_at       timestamptz NOT NULL,
    ended_at         timestamptz NULL,
    minutes          integer NOT NULL CHECK (minutes > 0),
    is_billable      boolean NOT NULL DEFAULT false,
    invoice_item_id  uuid NULL REFERENCES invoice_items(id), -- horas facturadas vs. registradas
    notes            text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (task_id IS NOT NULL OR ticket_id IS NOT NULL),
    CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX ON time_entries (organization_id, user_id, started_at);
CREATE INDEX ON time_entries (organization_id, customer_id, started_at);
COMMENT ON TABLE time_entries IS 'Horas registradas por técnico; base de la rentabilidad por técnico y de las horas no facturadas.';

-- ===== Módulo Monitoring (MON) =====

CREATE TABLE monitors (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL REFERENCES organizations(id),
    name                 text NOT NULL,
    type                 text NOT NULL CHECK (type IN ('http','keyword','ping','port','dns','ssl','heartbeat','mail_reputation','external')),
    target               text NOT NULL,
    interval_seconds     integer NOT NULL CHECK (interval_seconds >= 30),
    external_reference   text NULL,                         -- id en la herramienta de monitoreo integrada
    resource_id          uuid NULL REFERENCES resources(id),
    project_component_id uuid NULL REFERENCES project_components(id),
    service_id           uuid NULL REFERENCES services(id),
    status               text NOT NULL DEFAULT 'unknown' CHECK (status IN ('up','down','degraded','paused','unknown')),
    last_checked_at      timestamptz NULL,
    is_active            boolean NOT NULL DEFAULT true,
    authorized_by   uuid NULL REFERENCES users(id),  -- quien autorizó monitorear un sitio del cliente
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON monitors (organization_id, status) WHERE is_active;
COMMENT ON TABLE monitors IS 'Chequeos de disponibilidad, DNS, SSL y reputación de IP sobre recursos y componentes.';

CREATE TABLE monitor_results (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    monitor_id      uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    checked_at      timestamptz NOT NULL,
    status          text NOT NULL CHECK (status IN ('up','down','degraded')),
    response_ms     integer NULL CHECK (response_ms >= 0),
    detail          jsonb NOT NULL DEFAULT '{}',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON monitor_results (organization_id, monitor_id, checked_at DESC);
COMMENT ON TABLE monitor_results IS 'Resultados de cada chequeo de un monitor.';

CREATE TABLE incidents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    number          text NOT NULL,
    title           text NOT NULL,
    kind            text NOT NULL DEFAULT 'availability' CHECK (kind IN ('availability','performance','security','data','other')),
    severity        text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
    status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','monitoring','resolved')),
    started_at      timestamptz NOT NULL,
    resolved_at     timestamptz NULL,
    is_public       boolean NOT NULL DEFAULT false,     -- portal de estado
    public_summary  text NULL,
    root_cause      text NULL,
    problem_id      uuid NULL REFERENCES problems(id),
    owner_id        uuid NULL REFERENCES users(id),
    notes_internal  text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (status <> 'resolved' OR resolved_at IS NOT NULL),
    UNIQUE (organization_id, number)
);
CREATE INDEX ON incidents (organization_id, status, started_at DESC);
COMMENT ON TABLE incidents IS 'Incidentes técnicos y de seguridad; en un recurso compartido listan automáticamente instancias y clientes afectados.';

CREATE TABLE incident_affected (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    incident_id     uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    affected_type   text NOT NULL CHECK (affected_type IN ('resource','service','project_component','saas_instance','customer')),
    affected_id     uuid NOT NULL,
    customer_id     uuid NULL REFERENCES customers(id),
    auto_detected   boolean NOT NULL DEFAULT true,
    notified_at     timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (incident_id, affected_type, affected_id)
);
CREATE INDEX ON incident_affected (organization_id, customer_id);
COMMENT ON TABLE incident_affected IS 'Elementos y clientes afectados por un incidente (N:M), calculados con el grafo de dependencias.';

CREATE TABLE maintenance_windows (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    title            text NOT NULL,
    description      text NULL,
    resource_id      uuid NULL REFERENCES resources(id),
    starts_at        timestamptz NOT NULL,
    ends_at          timestamptz NOT NULL,
    status           text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
    notify_customers boolean NOT NULL DEFAULT true,
    is_public        boolean NOT NULL DEFAULT true,
    change_request_id uuid NULL REFERENCES change_requests(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (ends_at > starts_at)
);
CREATE INDEX ON maintenance_windows (organization_id, starts_at);
COMMENT ON TABLE maintenance_windows IS 'Ventanas de mantenimiento programadas que se avisan a los clientes afectados y se ven en el portal.';

CREATE TABLE backup_tool_accounts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    hosting_node_id     uuid NOT NULL REFERENCES hosting_nodes(id),
    tool                text NOT NULL CHECK (tool IN ('jetbackup','cpanel_backup','other')),   -- herramienta del servidor cPanel (por confirmar)
    provider_account_id uuid NULL REFERENCES provider_accounts(id),   -- credencial de la API en la bóveda
    api_enabled         boolean NOT NULL DEFAULT false,   -- false: lectura y restauración como tarea asistida
    capabilities        jsonb NOT NULL DEFAULT '[]',      -- lo que la API permite en este nodo (listar, restaurar archivos, bases, buzones)
    status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    last_synced_at      timestamptz NULL,
    notes               text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, hosting_node_id, tool),
    CHECK (NOT api_enabled OR provider_account_id IS NOT NULL)
);
COMMENT ON TABLE backup_tool_accounts IS 'Herramienta de respaldos de cada nodo cPanel (por ejemplo JetBackup, por confirmar): si tiene API, lectura de respaldos reales y restauración; si no, tarea asistida.';

CREATE TABLE backup_policies (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    resource_id     uuid NOT NULL REFERENCES resources(id),
    service_id      uuid NULL REFERENCES services(id),
    name            text NOT NULL,
    responsibility  text NOT NULL DEFAULT 'company' CHECK (responsibility IN ('company','provider','customer')),
    frequency       text NOT NULL CHECK (frequency IN ('hourly','daily','weekly','monthly')),
    retention_days  integer NOT NULL CHECK (retention_days > 0),
    rpo_minutes     integer NULL CHECK (rpo_minutes > 0),
    rto_minutes     integer NULL CHECK (rto_minutes > 0),
    encrypted       boolean NOT NULL DEFAULT true,
    destination     text NULL,
    is_active       boolean NOT NULL DEFAULT true,
    responsible_user_id uuid NULL REFERENCES users(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON backup_policies (organization_id, resource_id);
COMMENT ON TABLE backup_policies IS 'Política de respaldo por recurso: frecuencia, retención, RPO, RTO, cifrado y responsable.';

CREATE TABLE backup_runs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    backup_policy_id uuid NOT NULL REFERENCES backup_policies(id),
    status           text NOT NULL CHECK (status IN ('running','succeeded','failed','partial')),
    started_at       timestamptz NOT NULL,
    finished_at      timestamptz NULL,
    size_bytes       bigint NULL CHECK (size_bytes >= 0),
    location         text NULL,
    error            text NULL,
    backup_tool_account_id uuid NULL REFERENCES backup_tool_accounts(id),   -- leído de la herramienta del nodo
    external_id      text NULL,              -- id del respaldo o punto de restauración en la herramienta
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, backup_tool_account_id, external_id),
    CHECK ((backup_tool_account_id IS NULL) = (external_id IS NULL))
);
CREATE INDEX ON backup_runs (organization_id, backup_policy_id, started_at DESC);
CREATE INDEX ON backup_runs (organization_id, status) WHERE status = 'failed';
COMMENT ON TABLE backup_runs IS 'Ejecuciones de respaldo, registradas a mano o leídas de la herramienta de respaldos del nodo (sin duplicados por id externo); un fallo emite BackupFailed.';

CREATE TABLE restore_tests (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    backup_policy_id uuid NOT NULL REFERENCES backup_policies(id),
    backup_run_id    uuid NULL REFERENCES backup_runs(id),
    tested_at        timestamptz NOT NULL,
    tested_by        uuid NULL REFERENCES users(id),
    result           text NOT NULL CHECK (result IN ('passed','failed')),
    duration_minutes integer NULL CHECK (duration_minutes >= 0),
    task_id          uuid NULL REFERENCES tasks(id),
    notes            text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON restore_tests (organization_id, backup_policy_id, tested_at DESC);
COMMENT ON TABLE restore_tests IS 'Pruebas periódicas de restauración y su resultado.';

CREATE TABLE alerts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    type            text NOT NULL CHECK (type IN ('capacity','sync_failure','connector_error','credential_error','not_found','orphan','ssl_expiring','dns_change','budget','license_overuse','plan_limit','sla','security','reveal_limit','margin','chargeback','other')),
    severity        text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
    source_type     text NULL,
    source_id       uuid NULL,
    customer_id     uuid NULL REFERENCES customers(id),
    title           text NOT NULL,
    detail          jsonb NOT NULL DEFAULT '{}',
    dedupe_key      text NOT NULL,
    status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
    acknowledged_by uuid NULL REFERENCES users(id),
    acknowledged_at timestamptz NULL,
    resolved_at     timestamptz NULL,
    task_id         uuid NULL REFERENCES tasks(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (status <> 'resolved' OR resolved_at IS NOT NULL)
);
CREATE UNIQUE INDEX alerts_open_dedupe_uq ON alerts (organization_id, dedupe_key) WHERE status <> 'resolved';
CREATE INDEX ON alerts (organization_id, status, severity, created_at DESC);
COMMENT ON TABLE alerts IS 'Alertas técnicas y operativas (capacidad, sincronización, huérfanos, SSL, presupuestos, licencias, contracargos); una sola abierta por dedupe_key.';

-- ===== Módulo Automation (AUT) =====

CREATE TABLE automation_rules (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    name            text NOT NULL,
    event           text NOT NULL,                 -- InvoicePaid, ServiceSuspended, DomainExpiring, BackupFailed, ...
    conditions      jsonb NOT NULL DEFAULT '{}',
    actions         jsonb NOT NULL DEFAULT '[]',
    priority        integer NOT NULL DEFAULT 100,
    is_active       boolean NOT NULL DEFAULT true,
    brand_id        uuid NULL REFERENCES brands(id),  -- regla limitada a una marca (NULL: todas)
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON automation_rules (organization_id, event) WHERE is_active;
COMMENT ON TABLE automation_rules IS 'Reglas del motor de automatizaciones: evento de dominio, condiciones y acciones.';

CREATE TABLE automation_runs (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    automation_rule_id uuid NOT NULL REFERENCES automation_rules(id),
    event              text NOT NULL,
    entity_type        text NULL,
    entity_id          uuid NULL,
    status             text NOT NULL CHECK (status IN ('running','succeeded','failed','skipped')),
    started_at         timestamptz NOT NULL DEFAULT now(),
    finished_at        timestamptz NULL,
    output             jsonb NOT NULL DEFAULT '{}',
    error              text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON automation_runs (organization_id, automation_rule_id, started_at DESC);
COMMENT ON TABLE automation_runs IS 'Ejecuciones de cada regla de automatización con su resultado.';

CREATE TABLE notification_templates (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    code                   text NOT NULL,          -- dunning.renewal_notice, service.welcome, domain.expiring, ...
    channel                text NOT NULL CHECK (channel IN ('email','portal','whatsapp')),
    brand_id               uuid NULL REFERENCES brands(id),
    locale                 text NOT NULL DEFAULT 'es',
    country                char(2) NULL,
    subject                text NULL,
    body                   text NOT NULL,          -- variables: cliente, servicio, monto, fecha, enlace de pago
    whatsapp_template_name text NULL,              -- plantilla aprobada por Meta
    variables              jsonb NOT NULL DEFAULT '[]',
    is_active              boolean NOT NULL DEFAULT true,
    category               text NOT NULL DEFAULT 'notice' CHECK (category IN ('notice','canned_reply','complaint_response','form_confirmation')),   -- aviso, respuesta predefinida de ticket, carta de respuesta del Libro o confirmación de formulario (docs/00 §27)
    content_format         text NOT NULL DEFAULT 'html' CHECK (content_format IN ('html','plain')),   -- html: editor enriquecido saneado (editor.html.allowed_tags); plain: WhatsApp y SMS
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (channel <> 'whatsapp' OR whatsapp_template_name IS NOT NULL),
    CHECK (channel <> 'whatsapp' OR content_format = 'plain'),
    CHECK (category <> 'complaint_response' OR (channel = 'email' AND content_format = 'html')),
    -- Defensa en profundidad: el saneado lo hace la aplicación; la base rechaza lo evidente.
    CHECK (content_format <> 'html' OR body !~* '<\s*(script|iframe|object|embed|style)|javascript:|\son[a-z]+\s*='),
    UNIQUE NULLS NOT DISTINCT (organization_id, code, channel, brand_id, locale, country)
);
COMMENT ON TABLE notification_templates IS 'Plantillas de aviso por canal, marca, idioma y país; ningún texto de aviso vive en el código.';

-- Feed in-app por usuario del personal (campana del header); cada usuario lee solo lo suyo.
CREATE TABLE user_notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            text NOT NULL,
    title           text NOT NULL,
    body            text NULL,
    link            text NULL,
    read_at         timestamptz NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON user_notifications (organization_id, user_id, created_at);
CREATE INDEX ON user_notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE notification_deliveries (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES organizations(id),
    dedupe_key               text NOT NULL,      -- evento + destinatario + entidad + periodo
    event                    text NOT NULL,
    notification_template_id uuid NULL REFERENCES notification_templates(id),
    channel                  text NOT NULL CHECK (channel IN ('email','portal','whatsapp')),
    customer_id              uuid NULL REFERENCES customers(id),
    recipient_contact_id     uuid NULL REFERENCES contacts(id),
    recipient_user_id        uuid NULL REFERENCES users(id),
    recipient_address        text NOT NULL,      -- correo, teléfono o id de usuario del portal
    entity_type              text NULL,
    entity_id                uuid NULL,
    subject                  text NULL,
    body_snapshot            text NULL,
    resend_of_id             uuid NULL REFERENCES notification_deliveries(id),  -- reenvío manual de finanzas
    is_manual                boolean NOT NULL DEFAULT false,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid NULL,
    UNIQUE (organization_id, dedupe_key)
);
CREATE INDEX ON notification_deliveries (organization_id, customer_id, created_at DESC);
CREATE INDEX ON notification_deliveries (organization_id, entity_type, entity_id);
COMMENT ON TABLE notification_deliveries IS 'Registro de solo inserción de cada aviso enviado; dedupe_key único evita duplicados. El estado de entrega va en notification_delivery_events.';

CREATE TABLE notification_delivery_events (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id            uuid NOT NULL REFERENCES organizations(id),
    notification_delivery_id   uuid NOT NULL REFERENCES notification_deliveries(id),
    status                     text NOT NULL CHECK (status IN ('queued','sent','delivered','opened','bounced','failed','complained')),
    provider_message_id        text NULL,
    provider_event_id          text NULL,
    detail                     jsonb NOT NULL DEFAULT '{}',
    occurred_at                timestamptz NOT NULL DEFAULT now(),
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid NULL,
    UNIQUE (organization_id, provider_event_id)
);
CREATE INDEX ON notification_delivery_events (organization_id, notification_delivery_id, occurred_at);
COMMENT ON TABLE notification_delivery_events IS 'Estados de entrega de un aviso (enviado, entregado, abierto, rebotado) como eventos de solo inserción. Tabla agregada al contrato.';

CREATE TABLE webhook_endpoints (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    direction       text NOT NULL CHECK (direction IN ('inbound','outbound')),
    provider        text NULL CHECK (provider IN ('paypal','card_gateway','whatsapp','meta_leads','elastic_email','einvoice')),  -- solo entrantes
    url             text NULL,                  -- salientes: destino del cliente o integrador
    customer_id     uuid NULL REFERENCES customers(id),
    events          text[] NOT NULL DEFAULT '{}',
    secret_id       uuid NULL REFERENCES secrets(id),   -- secreto de firma en la bóveda
    is_active       boolean NOT NULL DEFAULT true,
    description     text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (direction <> 'inbound' OR provider IS NOT NULL),
    CHECK (direction <> 'outbound' OR url IS NOT NULL)
);
COMMENT ON TABLE webhook_endpoints IS 'Webhooks entrantes por proveedor (firma en la bóveda) y salientes suscritos por clientes o integradores.';

CREATE TABLE webhook_events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    webhook_endpoint_id uuid NULL REFERENCES webhook_endpoints(id),
    provider            text NOT NULL CHECK (provider IN ('paypal','card_gateway','whatsapp','meta_leads','elastic_email','einvoice')),
    external_event_id   text NOT NULL,
    event_type          text NOT NULL,
    signature_valid     boolean NOT NULL,
    payload             jsonb NOT NULL,
    headers             jsonb NOT NULL DEFAULT '{}',   -- con redacción de authorization/token/secret
    received_at         timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid NULL,
    -- un evento repetido se confirma y se descarta
    UNIQUE (organization_id, provider, external_event_id)
);
CREATE INDEX ON webhook_events (organization_id, provider, received_at DESC);
COMMENT ON TABLE webhook_events IS 'Eventos crudos de webhooks entrantes, de solo inserción, con identificador externo único por proveedor.';

CREATE TABLE webhook_event_processings (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    webhook_event_id uuid NOT NULL REFERENCES webhook_events(id),
    attempt          smallint NOT NULL CHECK (attempt >= 1),
    status           text NOT NULL CHECK (status IN ('processed','ignored','failed')),
    error            text NULL,
    processed_at     timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid NULL,
    UNIQUE (webhook_event_id, attempt)
);
CREATE INDEX ON webhook_event_processings (organization_id, status, processed_at DESC);
COMMENT ON TABLE webhook_event_processings IS 'Resultado de cada intento de procesar un webhook en cola (solo inserción). Tabla agregada al contrato.';

CREATE TABLE outbound_webhook_deliveries (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    webhook_endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id),
    event_id            uuid NOT NULL,             -- identificador estable del evento enviado
    event_type          text NOT NULL,
    payload             jsonb NOT NULL,
    attempt             smallint NOT NULL DEFAULT 1 CHECK (attempt >= 1),
    status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
    response_status     smallint NULL,
    response_excerpt    text NULL,
    next_retry_at       timestamptz NULL,
    delivered_at        timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (webhook_endpoint_id, event_id, attempt)
);
CREATE INDEX ON outbound_webhook_deliveries (organization_id, status, next_retry_at);
COMMENT ON TABLE outbound_webhook_deliveries IS 'Envíos de webhooks salientes con reintentos.';

CREATE TABLE sync_runs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    provider_account_id uuid NULL REFERENCES provider_accounts(id),
    connector           text NOT NULL,
    kind                text NOT NULL,      -- accounts, domains, servers, cloud_resources, component_metrics, licenses, ...
    status              text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','partial','failed')),
    started_at          timestamptz NOT NULL DEFAULT now(),
    finished_at         timestamptz NULL,
    records_read        integer NOT NULL DEFAULT 0 CHECK (records_read >= 0),
    records_created     integer NOT NULL DEFAULT 0 CHECK (records_created >= 0),
    records_updated     integer NOT NULL DEFAULT 0 CHECK (records_updated >= 0),
    records_not_found   integer NOT NULL DEFAULT 0 CHECK (records_not_found >= 0),
    errors_count        integer NOT NULL DEFAULT 0 CHECK (errors_count >= 0),
    error_detail        jsonb NOT NULL DEFAULT '[]',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (status = 'running' OR finished_at IS NOT NULL)
);
CREATE INDEX ON sync_runs (organization_id, provider_account_id, started_at DESC);
COMMENT ON TABLE sync_runs IS 'Una fila por sincronización: inicio, fin, leídos, creados, actualizados, no encontrados y errores. Nunca borra.';

CREATE TABLE imports (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL REFERENCES organizations(id),
    entity               text NOT NULL CHECK (entity IN ('customers','contacts','services','domains','hosting_accounts','servers','cloud_accounts','costs','bank_statement_lines','payment_settlement_lines')),
    file_id              uuid NOT NULL REFERENCES files(id),
    mapping              jsonb NOT NULL DEFAULT '{}',
    dry_run              boolean NOT NULL DEFAULT true,     -- vista previa
    status               text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','validating','validated','importing','completed','failed','cancelled')),
    rows_total           integer NOT NULL DEFAULT 0 CHECK (rows_total >= 0),
    rows_valid           integer NOT NULL DEFAULT 0 CHECK (rows_valid >= 0),
    rows_error           integer NOT NULL DEFAULT 0 CHECK (rows_error >= 0),
    error_report_file_id uuid NULL REFERENCES files(id),
    started_at           timestamptz NULL,
    finished_at          timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL
);
CREATE INDEX ON imports (organization_id, status, created_at DESC);
COMMENT ON TABLE imports IS 'Asistente de importación por CSV con vista previa, validación fila por fila y reporte de errores descargable.';

CREATE TABLE exports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    report          text NOT NULL CHECK (report IN ('customers','leads','quotes','services','client_projects','resources','cloud_resources','domains',
                                                  'mail_services','ssl_certificates','saas_instances','providers','products','contracts','orders',
                                                  'invoices','payments','costs','tickets','tasks','time_entries','users','audit_events','setting_changes',
                                                  'complaints','legal_acceptances','kpi_values','kpi_records')),
    filters         jsonb NOT NULL DEFAULT '{}',
    format          text NOT NULL CHECK (format IN ('csv','xlsx','pdf')),
    status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','expired')),
    file_id         uuid NULL REFERENCES files(id),
    expires_at      timestamptz NULL,
    error           text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (status <> 'completed' OR file_id IS NOT NULL)
);
CREATE INDEX ON exports (organization_id, created_by, created_at DESC);
COMMENT ON TABLE exports IS 'Trabajos de exportación en cola; al terminar entregan un enlace firmado. No existe exportación de secretos.';

-- ===== Módulo Billing (BIL, continuación: requiere imports) =====

CREATE TABLE bank_statement_lines (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    import_id          uuid NULL REFERENCES imports(id),         -- extracto cargado por el asistente de importación
    bank_account_id    uuid NOT NULL REFERENCES bank_accounts(id),
    transaction_date   date NOT NULL,
    amount_minor       bigint NOT NULL,                          -- positivo: abono; negativo: cargo
    currency           char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    reference          text NULL,                                -- número de operación o glosa del banco
    matched_payment_id uuid NULL REFERENCES payments(id),
    status             text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','difference')),
    version            integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (status = 'unmatched' OR matched_payment_id IS NOT NULL)
);
CREATE INDEX ON bank_statement_lines (organization_id, bank_account_id, transaction_date);
CREATE INDEX ON bank_statement_lines (organization_id, status);
COMMENT ON TABLE bank_statement_lines IS 'Líneas del extracto bancario para la conciliación: cada abono se empareja con un pago (matched) o queda con diferencia.';

CREATE TABLE payment_settlement_lines (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    payment_method_id      uuid NOT NULL REFERENCES payment_methods(id),
    import_id              uuid NULL REFERENCES imports(id),          -- reporte de liquidación cargado en CSV
    sync_run_id            uuid NULL REFERENCES sync_runs(id),        -- o leído por API del conector
    settlement_date        date NOT NULL,                             -- fecha de liquidación o abono
    transaction_type       text NOT NULL CHECK (transaction_type IN ('charge','refund','chargeback','adjustment')),
    external_id            text NOT NULL,                             -- id de la transacción en la pasarela
    gross_minor            bigint NOT NULL,                           -- positivo: cobro; negativo: reembolso o contracargo
    fee_minor              bigint NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),   -- comisión real retenida por la pasarela
    net_minor              bigint NOT NULL,                           -- lo abonado en banco
    currency               char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    payout_reference       text NULL,                                 -- referencia del abono en el banco
    matched_payment_id     uuid NULL REFERENCES payments(id),
    bank_statement_line_id uuid NULL REFERENCES bank_statement_lines(id),
    status                 text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','difference')),
    version            integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    -- una transacción de la pasarela se carga una sola vez por tipo (API o CSV repetidos no duplican)
    UNIQUE (organization_id, payment_method_id, external_id, transaction_type),
    CHECK (net_minor = gross_minor - fee_minor),
    CHECK (status = 'unmatched' OR matched_payment_id IS NOT NULL)
);
CREATE INDEX ON payment_settlement_lines (organization_id, payment_method_id, settlement_date);
CREATE INDEX ON payment_settlement_lines (organization_id, status);
COMMENT ON TABLE payment_settlement_lines IS 'Líneas del reporte de liquidación de la pasarela de tarjetas: cada transacción con importe bruto, comisión real y neto abonado se concilia con su pago y con el abono del banco.';

-- ===== Módulo WebConnector (WCN) =====
-- Las webs públicas de las marcas se hacen en WordPress Multisite (docs/00 §26). El sistema no tiene CMS:
-- registra los sitios WordPress conectados, emite sus tokens de solo lectura, avisa al plugin "Hub Connector"
-- cuando cambia lo que muestra (webhook de invalidación de caché), y guarda los formularios, los datos de
-- contacto por marca y los documentos legales versionados que el plugin muestra por shortcode.

CREATE TABLE wp_sites (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    brand_id           uuid NOT NULL REFERENCES brands(id),
    name               text NOT NULL,
    base_url           text NOT NULL,                  -- URL pública del sitio (https://www.servercreativo.com)
    network_site_id    integer NULL CHECK (network_site_id >= 1),   -- id del sitio dentro de WordPress Multisite (blog_id)
    kind               text NOT NULL DEFAULT 'wordpress' CHECK (kind IN ('wordpress','embed')),
    status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
    webhook_url        text NULL,                      -- ruta REST del plugin que recibe la invalidación (…/wp-json/hub-connector/v1/invalidate)
    webhook_secret_id  uuid NULL REFERENCES secrets(id),   -- secreto HMAC de la firma en la bóveda (owner_type wp_site)
    allowed_origins    text[] NOT NULL DEFAULT '{}',   -- orígenes CORS para los envíos públicos desde el navegador
    thank_you_url      text NULL,                      -- página de agradecimiento en WordPress tras una compra (conversión de píxeles)
    plugin_version     text NULL,                      -- última versión del plugin informada en la cabecera X-Hub-Plugin-Version
    wordpress_version  text NULL,
    last_seen_at       timestamptz NULL,               -- última lectura del plugin con un token vigente
    last_invalidation_at timestamptz NULL,
    disabled_reason    text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK (base_url ~ '^https://[a-z0-9.-]+(:[0-9]+)?(/.*)?$'),
    CHECK (webhook_url IS NULL OR webhook_url ~ '^https://'),
    CHECK (thank_you_url IS NULL OR thank_you_url ~ '^https://'),
    -- Un sitio activo recibe avisos: necesita la ruta del plugin y el secreto de firma.
    CHECK (status <> 'active' OR kind = 'embed' OR (webhook_url IS NOT NULL AND webhook_secret_id IS NOT NULL)),
    CHECK (kind <> 'embed' OR (cardinality(allowed_origins) >= 1 AND webhook_url IS NULL)),
    CHECK (status <> 'disabled' OR disabled_reason IS NOT NULL)
);
CREATE UNIQUE INDEX wp_sites_base_url_uq ON wp_sites (lower(base_url)) WHERE deleted_at IS NULL;
CREATE INDEX ON wp_sites (organization_id, brand_id) WHERE deleted_at IS NULL;
COMMENT ON TABLE wp_sites IS 'Sitio de WordPress Multisite conectado por marca (uno por dominio): URL, ruta del plugin para el webhook firmado de invalidación, orígenes permitidos, página de agradecimiento y última actividad del plugin.';

CREATE TABLE wp_site_tokens (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    wp_site_id        uuid NOT NULL REFERENCES wp_sites(id),
    name              text NOT NULL,
    token_hash        char(64) NOT NULL UNIQUE,        -- sha256 del token; el valor plano se muestra una sola vez
    token_last_four   char(4) NOT NULL,                -- para reconocerlo en el panel
    scope             text NOT NULL DEFAULT 'read' CHECK (scope IN ('read','embed')),
    expires_at        timestamptz NULL,                -- según web_connector.token_expiry_days
    last_used_at      timestamptz NULL,
    last_used_ip_hash char(64) NULL,
    revoked_at        timestamptz NULL,
    revoked_by        uuid NULL REFERENCES users(id),
    revoke_reason     text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
    CHECK (revoked_at IS NULL OR revoke_reason IS NOT NULL),
    CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX ON wp_site_tokens (organization_id, wp_site_id) WHERE revoked_at IS NULL;
COMMENT ON TABLE wp_site_tokens IS 'Tokens de solo lectura del plugin por sitio (solo hash): se crean en el panel, se pueden revocar y vencen según el ajuste; uno revocado o vencido responde 401.';

-- Una vez revocado, un token no vuelve a valer ni cambia de sitio.
CREATE OR REPLACE FUNCTION hub_wp_site_token_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS NULL OR NEW.token_hash <> OLD.token_hash) THEN
        RAISE EXCEPTION 'Un token revocado no se reactiva' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.wp_site_id <> OLD.wp_site_id OR NEW.token_hash <> OLD.token_hash THEN
        RAISE EXCEPTION 'El token no cambia de sitio ni de valor: se emite uno nuevo' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER wp_site_tokens_guard BEFORE UPDATE ON wp_site_tokens
    FOR EACH ROW EXECUTE FUNCTION hub_wp_site_token_guard();

CREATE TABLE wp_cache_invalidations (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    wp_site_id       uuid NOT NULL REFERENCES wp_sites(id),
    event_id         uuid NOT NULL,                   -- identificador estable del aviso (el plugin descarta repetidos)
    scope            text NOT NULL CHECK (scope IN ('catalog','plan','bundle','domain_prices','promotion','contact','legal_document','form','service_status','all')),
    keys             text[] NOT NULL DEFAULT '{}',    -- ids o claves afectadas (plan, tipo de documento, formulario)
    trigger_event    text NULL,                       -- evento de dominio que lo originó; NULL si fue manual
    status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
    attempts         smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_retry_at    timestamptz NULL,
    response_status  smallint NULL,
    last_error       text NULL,
    delivered_at     timestamptz NULL,
    requested_by     uuid NULL REFERENCES users(id),  -- invalidación manual desde el panel
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (wp_site_id, event_id),
    CHECK (status <> 'delivered' OR (delivered_at IS NOT NULL AND attempts >= 1)),
    CHECK (status <> 'failed' OR last_error IS NOT NULL)
);
CREATE INDEX ON wp_cache_invalidations (organization_id, status, next_retry_at);
CREATE INDEX ON wp_cache_invalidations (organization_id, wp_site_id, created_at DESC);
COMMENT ON TABLE wp_cache_invalidations IS 'Avisos firmados al plugin de cada sitio cuando cambia un precio, un plan, un dato de contacto, un documento legal o un formulario, con reintentos; si fallan, el plugin igual renueva su caché al vencer.';

CREATE TABLE web_forms (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    brand_id          uuid NOT NULL REFERENCES brands(id),
    code              text NOT NULL,                  -- identificador del shortcode [hub_formulario id="..."]
    name              text NOT NULL,
    status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','inactive')),
    destination       text NOT NULL CHECK (destination IN ('lead','ticket','email')),
    lead_channel_id   uuid NULL REFERENCES lead_channels(id),   -- destino prospecto: canal de captación
    ticket_type       text NULL CHECK (ticket_type IN ('incident','request','question','billing','complaint','security')),
    ticket_department text NULL,                      -- valor de helpdesk.departments
    notify_email      text NULL,                      -- destino correo, o copia del aviso en los otros destinos
    owner_user_id     uuid NULL REFERENCES users(id), -- responsable: prospecto o ticket asignado a esta persona
    consent_required  boolean NOT NULL DEFAULT true,  -- casilla de consentimiento obligatoria
    consent_purpose   text NULL CHECK (consent_purpose IN ('marketing','privacy')),
    consent_text      jsonb NOT NULL DEFAULT '{}',    -- texto de la casilla por idioma, con enlace a la política vigente
    captcha_required  boolean NOT NULL DEFAULT true,  -- según web_connector.forms.captcha_required (sobrescribible por formulario)
    success_message   jsonb NOT NULL DEFAULT '{}',    -- mensaje de confirmación por idioma
    redirect_url      text NULL,                      -- página de WordPress a la que se lleva tras enviar
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CHECK (destination <> 'lead' OR lead_channel_id IS NOT NULL),
    CHECK (destination <> 'ticket' OR ticket_type IS NOT NULL),
    CHECK (destination <> 'email' OR notify_email IS NOT NULL),
    CHECK (NOT consent_required OR (consent_purpose IS NOT NULL AND consent_text <> '{}'::jsonb)),
    CHECK (status <> 'active' OR success_message <> '{}'::jsonb),
    CHECK (redirect_url IS NULL OR redirect_url ~ '^https://')
);
CREATE UNIQUE INDEX web_forms_code_uq ON web_forms (organization_id, brand_id, code) WHERE deleted_at IS NULL;
COMMENT ON TABLE web_forms IS 'Formularios armados en el panel (constructor) que el plugin muestra con [hub_formulario]: destino prospecto, ticket o correo, responsable, consentimiento, captcha y mensaje de confirmación.';

CREATE TABLE web_form_fields (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    web_form_id      uuid NOT NULL REFERENCES web_forms(id) ON DELETE CASCADE,
    key              text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    label            jsonb NOT NULL,                  -- {"es": "...", "en": "..."}
    help_text        jsonb NOT NULL DEFAULT '{}',
    field_type       text NOT NULL CHECK (field_type IN ('text','textarea','email','phone','select','checkboxes','file')),
    is_required      boolean NOT NULL DEFAULT false,
    options          jsonb NOT NULL DEFAULT '[]',     -- lista y casillas: [{"value": "...", "label": {...}}]
    validation       jsonb NOT NULL DEFAULT '{}',     -- min_length, max_length, pattern, max_file_mb, allowed_mime
    maps_to          text NULL CHECK (maps_to IN ('name','email','phone','company','subject','message')),   -- campo del prospecto o del ticket
    position         smallint NOT NULL CHECK (position >= 0),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (web_form_id, key),
    UNIQUE (web_form_id, position),
    CHECK (field_type NOT IN ('select','checkboxes') OR jsonb_array_length(options) >= 1),
    CHECK (field_type <> 'email' OR maps_to IS NULL OR maps_to = 'email')
);
COMMENT ON TABLE web_form_fields IS 'Campos de cada formulario: texto, correo, teléfono, lista, casillas o archivo, con obligatoriedad, validaciones y el dato del prospecto o ticket al que corresponde.';

CREATE TABLE web_form_submissions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    web_form_id       uuid NOT NULL REFERENCES web_forms(id),
    brand_id          uuid NOT NULL REFERENCES brands(id),
    wp_site_id        uuid NULL REFERENCES wp_sites(id),   -- sitio WordPress desde donde se envió
    idempotency_key   text NOT NULL,                  -- generado por el navegador o el plugin: un doble clic no duplica
    payload           jsonb NOT NULL,                 -- valores validados contra los campos (los archivos van en files)
    file_ids          uuid[] NOT NULL DEFAULT '{}',
    consent_given     boolean NOT NULL DEFAULT false,
    consent_text      text NULL,                      -- copia del texto aceptado
    captcha_verified_at timestamptz NULL,
    page_url          text NULL,
    attribution       jsonb NOT NULL DEFAULT '{}',    -- campaña y UTM
    status            text NOT NULL DEFAULT 'received' CHECK (status IN ('received','routed','failed','spam')),
    lead_id           uuid NULL REFERENCES leads(id),
    ticket_id         uuid NULL REFERENCES tickets(id),
    emailed_at        timestamptz NULL,
    routed_at         timestamptz NULL,
    last_error        text NULL,
    ip_hash           char(64) NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, web_form_id, idempotency_key),
    CHECK (status <> 'routed' OR (routed_at IS NOT NULL AND (lead_id IS NOT NULL OR ticket_id IS NOT NULL OR emailed_at IS NOT NULL))),
    CHECK (status <> 'failed' OR last_error IS NOT NULL)
);
CREATE INDEX ON web_form_submissions (organization_id, web_form_id, created_at DESC);
CREATE INDEX ON web_form_submissions (organization_id, status) WHERE status IN ('received','failed');
COMMENT ON TABLE web_form_submissions IS 'Envíos recibidos de los formularios de las webs (WordPress no guarda nada): consentimiento, captcha, página de origen y a qué prospecto, ticket o correo se derivó.';

CREATE TABLE brand_contact_points (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    brand_id        uuid NOT NULL REFERENCES brands(id),
    kind            text NOT NULL CHECK (kind IN ('phone','email','whatsapp','address','hours')),
    label           jsonb NOT NULL DEFAULT '{}',      -- "Ventas", "Soporte" por idioma
    value           text NOT NULL,                    -- número E.164, correo, dirección u horario en texto
    is_primary      boolean NOT NULL DEFAULT false,   -- el que muestra [hub_contacto campo="..."] sin etiqueta
    is_public       boolean NOT NULL DEFAULT true,
    position        smallint NOT NULL DEFAULT 0,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK (value <> ''),
    CHECK (kind NOT IN ('phone','whatsapp') OR value ~ '^\+[1-9][0-9]{6,14}$'),
    CHECK (kind <> 'email' OR value ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
CREATE UNIQUE INDEX brand_contact_points_primary_uq ON brand_contact_points (organization_id, brand_id, kind) WHERE is_primary AND deleted_at IS NULL;
COMMENT ON TABLE brand_contact_points IS 'Teléfonos, correos, WhatsApp, dirección y horario de cada marca, editables en el panel y mostrados en todas sus webs con [hub_contacto].';

CREATE TABLE legal_documents (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL REFERENCES organizations(id),
    brand_id             uuid NOT NULL REFERENCES brands(id),
    kind                 text NOT NULL CHECK (kind IN ('terms','privacy','refunds','sla','acceptable_use','legal_notice')),
    product_category_id  uuid NULL REFERENCES product_categories(id),   -- términos por tipo de servicio; NULL: generales de la marca
    locale               text NOT NULL DEFAULT 'es',
    title                text NOT NULL,
    slug                 text NOT NULL,              -- identificador estable (enlaces del checkout y del portal)
    published_version_id uuid NULL,                  -- FK al final (legal_document_versions): versión vigente
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CHECK (kind = 'terms' OR product_category_id IS NULL)
);
CREATE UNIQUE INDEX legal_documents_kind_uq ON legal_documents (organization_id, brand_id, kind, locale, product_category_id) NULLS NOT DISTINCT WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX legal_documents_slug_uq ON legal_documents (organization_id, brand_id, locale, slug) WHERE deleted_at IS NULL;
COMMENT ON TABLE legal_documents IS 'Documentos legales por marca (términos y condiciones por tipo de servicio, privacidad, reembolsos y cancelaciones, SLA, uso aceptable, aviso legal): se redactan y versionan en el sistema porque el carrito registra qué versión aceptó cada cliente; WordPress los muestra con [hub_documento_legal]. La política de cookies vive en WordPress.';

CREATE TABLE legal_document_versions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    legal_document_id   uuid NOT NULL REFERENCES legal_documents(id),
    version_number      integer NOT NULL CHECK (version_number >= 1),
    version_label       text NOT NULL,               -- versión visible (por ejemplo 2026-10)
    body                text NOT NULL,               -- HTML saneado
    change_summary      text NULL,
    legal_reviewed_by   text NULL,                   -- asesoría legal que validó el texto
    legal_reviewed_at   timestamptz NULL,
    effective_at        timestamptz NULL,            -- desde cuándo rige
    status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','superseded')),
    published_at        timestamptz NULL,
    published_by        uuid NULL REFERENCES users(id),
    superseded_at       timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (legal_document_id, version_number),
    UNIQUE (legal_document_id, version_label),
    -- Solo se publica un texto validado por la asesoría legal y con fecha de vigencia.
    CHECK (status = 'draft' OR (legal_reviewed_by IS NOT NULL AND legal_reviewed_at IS NOT NULL AND effective_at IS NOT NULL
                                AND published_at IS NOT NULL AND published_by IS NOT NULL)),
    CHECK (status <> 'superseded' OR superseded_at IS NOT NULL)
);
CREATE UNIQUE INDEX legal_document_versions_one_published_uq ON legal_document_versions (legal_document_id) WHERE status = 'published';
COMMENT ON TABLE legal_document_versions IS 'Versiones con fecha de los documentos legales: borrador, publicada (una sola vigente por documento) y reemplazada; nunca se borran.';

-- ===== Módulo Brands (BRD, continuación: apariencia del portal, el panel y los correos) =====
-- Tokens de diseño por marca con vista previa, historial y reversión (docs/00 §25, "Apariencia administrable").
-- Desde docs/00 §26 el tema de la web pública vive en WordPress: estos temas solo aplican al portal y carrito,
-- al panel interno y a los correos y comprobantes.

CREATE TABLE brand_themes (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL REFERENCES organizations(id),
    brand_id             uuid NOT NULL REFERENCES brands(id),
    name                 text NOT NULL,
    published_version_id uuid NULL,              -- FK al final (brand_theme_versions): lo que ven el portal, el panel y los correos
    published_at         timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, brand_id),          -- un tema por marca; sus cambios son versiones
    CHECK ((published_version_id IS NULL) = (published_at IS NULL))
);
COMMENT ON TABLE brand_themes IS 'Tema de una marca (uno por marca) para el portal y el carrito, el panel y los correos: agrupa las versiones de sus tokens de diseño y apunta a la publicada.';

CREATE TABLE brand_theme_versions (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES organizations(id),
    brand_theme_id           uuid NOT NULL REFERENCES brand_themes(id),
    brand_id                 uuid NOT NULL REFERENCES brands(id),       -- copia de la marca del tema para el índice de publicada
    version_number           integer NOT NULL CHECK (version_number >= 1),
    tokens                   jsonb NOT NULL,         -- colores principal, secundario y de acento (claro/oscuro), tipografías, botones, radios, encabezado y pie
    surfaces                 text[] NOT NULL DEFAULT ('{portal}'::text[])
                             CHECK (surfaces <@ ARRAY['portal','admin','email']::text[] AND cardinality(surfaces) >= 1),
    logo_file_id             uuid NULL REFERENCES files(id),
    favicon_file_id          uuid NULL REFERENCES files(id),
    status                   text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
    change_note              text NULL,
    restored_from_version_id uuid NULL REFERENCES brand_theme_versions(id),   -- reversión: copia de una versión anterior
    contrast_min_ratio       numeric(4,2) NULL CHECK (contrast_min_ratio >= 1),   -- copia de brands.theme.min_contrast_ratio al verificar
    contrast_lowest_ratio    numeric(4,2) NULL CHECK (contrast_lowest_ratio >= 1), -- peor par texto/fondo medido
    contrast_report          jsonb NOT NULL DEFAULT '[]',   -- pares texto/fondo con su relación de contraste
    contrast_checked_at      timestamptz NULL,
    preview_token_hash       char(64) NULL,          -- enlace firmado de vista previa
    preview_expires_at       timestamptz NULL,
    published_at             timestamptz NULL,
    published_by             uuid NULL REFERENCES users(id),
    archived_at              timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (brand_theme_id, version_number),
    -- Solo se publica con el contraste verificado y por encima del mínimo copiado de los ajustes.
    CHECK (status <> 'published' OR (published_at IS NOT NULL AND published_by IS NOT NULL AND contrast_checked_at IS NOT NULL
                                     AND contrast_lowest_ratio IS NOT NULL AND contrast_min_ratio IS NOT NULL
                                     AND contrast_lowest_ratio >= contrast_min_ratio)),
    CHECK (status <> 'archived' OR archived_at IS NOT NULL),
    CHECK ((preview_token_hash IS NULL) = (preview_expires_at IS NULL))
);
-- Un solo tema publicado por marca: publicar una versión archiva la anterior en la misma transacción.
CREATE UNIQUE INDEX brand_theme_versions_one_published_uq ON brand_theme_versions (organization_id, brand_id) WHERE status = 'published';
CREATE INDEX ON brand_theme_versions (organization_id, brand_theme_id, version_number DESC);
COMMENT ON TABLE brand_theme_versions IS 'Versiones de los tokens de diseño de una marca para el portal y el carrito, el panel interno y los correos y comprobantes; vista previa, verificación de contraste mínimo, publicación e historial para revertir.';

-- ===== Módulo Orders (ORD, continuación: compra en línea; requiere payments y wp_sites) =====

CREATE TABLE carts (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES organizations(id),
    brand_id              uuid NOT NULL REFERENCES brands(id),     -- marca de origen (web donde se armó el carrito)
    wp_site_id            uuid NULL REFERENCES wp_sites(id),        -- sitio WordPress donde se pulsó "Contratar"
    token_hash            char(64) NOT NULL UNIQUE,                -- sha256 del token del carrito (cookie); el token no se guarda
    customer_id           uuid NULL REFERENCES customers(id),      -- al iniciar sesión
    user_id               uuid NULL REFERENCES users(id),
    currency              char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','abandoned','converted','expired')),
    coupon_id             uuid NULL REFERENCES coupons(id),
    subtotal_minor        bigint NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
    discount_minor        bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    tax_minor             bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
    total_minor           bigint NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
    contact_email         text NULL,                               -- solo para el aviso de carrito abandonado, con consentimiento
    attribution           jsonb NOT NULL DEFAULT '{}',             -- página de origen, campaña, UTM
    last_activity_at      timestamptz NOT NULL DEFAULT now(),
    abandoned_at          timestamptz NULL,
    abandoned_notice_sent_at timestamptz NULL,
    expires_at            timestamptz NOT NULL,
    converted_at          timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (total_minor = subtotal_minor - discount_minor + tax_minor),
    CHECK (status <> 'abandoned' OR abandoned_at IS NOT NULL),
    CHECK (status <> 'converted' OR (converted_at IS NOT NULL AND customer_id IS NOT NULL)),
    CHECK (abandoned_notice_sent_at IS NULL OR contact_email IS NOT NULL)
);
CREATE INDEX ON carts (organization_id, status, last_activity_at) WHERE status IN ('open','abandoned');
CREATE INDEX ON carts (organization_id, customer_id);
COMMENT ON TABLE carts IS 'Carrito de la compra en línea: marca de origen, cupón, totales en PEN o USD y estado (abierto, abandonado, convertido, vencido). Anónimo hasta que el cliente inicia sesión.';

CREATE TABLE cart_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    cart_id          uuid NOT NULL REFERENCES carts(id),
    product_id       uuid NOT NULL REFERENCES products(id),     -- solo productos con sellable_online
    plan_id          uuid NULL REFERENCES plans(id),            -- plan y ciclo elegidos
    parent_item_id   uuid NULL REFERENCES cart_items(id),       -- dominio, SSL o correo ligado al hosting
    quantity         numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),   -- precio vigente de plan_prices o domain_tld_prices
    currency         char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    domain_name      text NULL,
    domain_action    text NULL CHECK (domain_action IN ('register','transfer','existing')),
    availability_checked_at timestamptz NULL,                   -- consulta al registrador en el momento de agregar
    config           jsonb NOT NULL DEFAULT '{}',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK ((domain_action IS NULL) = (domain_name IS NULL)),
    CHECK (domain_action <> 'register' OR availability_checked_at IS NOT NULL)
);
CREATE INDEX ON cart_items (organization_id, cart_id);
COMMENT ON TABLE cart_items IS 'Líneas del carrito: plan y ciclo, y el dominio a registrar (con consulta de disponibilidad), transferir o propio.';

CREATE TABLE checkout_sessions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    cart_id             uuid NOT NULL REFERENCES carts(id),
    customer_id         uuid NOT NULL REFERENCES customers(id),
    user_id             uuid NOT NULL REFERENCES users(id),
    brand_id            uuid NOT NULL REFERENCES brands(id),     -- marca de origen: pasa al pedido y a la factura
    idempotency_key     text NOT NULL,
    status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','manual_review','awaiting_payment','awaiting_validation','paid','completed','expired','cancelled')),
    currency            char(3) NOT NULL CHECK (currency IN ('PEN','USD')),
    total_minor         bigint NOT NULL CHECK (total_minor > 0),  -- total congelado al confirmar
    snapshot            jsonb NOT NULL,                           -- líneas, precios, cupón e impuestos al confirmar
    terms_contract_id   uuid NULL REFERENCES contracts(id),       -- términos aceptados (contracts.kind = terms)
    terms_accepted_at   timestamptz NOT NULL,
    email_verified_at   timestamptz NULL,
    captcha_verified_at timestamptz NOT NULL,
    risk_flags          jsonb NOT NULL DEFAULT '[]',             -- motivos de revisión manual detectados
    review_reason       text NULL,
    reviewed_by         uuid NULL REFERENCES users(id),
    reviewed_at         timestamptz NULL,
    payment_method_id   uuid NULL REFERENCES payment_methods(id),
    payment_id          uuid NULL REFERENCES payments(id),
    order_id            uuid NULL REFERENCES orders(id),
    ip_hash             char(64) NULL,
    expires_at          timestamptz NOT NULL,
    paid_at             timestamptz NULL,
    completed_at        timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, idempotency_key),
    UNIQUE (organization_id, order_id),
    CHECK (status NOT IN ('awaiting_payment','awaiting_validation','paid','completed') OR email_verified_at IS NOT NULL),
    CHECK (status <> 'manual_review' OR review_reason IS NOT NULL),
    CHECK (status NOT IN ('paid','completed') OR (payment_id IS NOT NULL AND paid_at IS NOT NULL)),
    CHECK (status <> 'completed' OR (order_id IS NOT NULL AND completed_at IS NOT NULL))
);
-- Un carrito tiene a lo sumo una compra en curso.
CREATE UNIQUE INDEX checkout_sessions_one_active_per_cart ON checkout_sessions (cart_id)
    WHERE status IN ('open','manual_review','awaiting_payment','awaiting_validation','paid');
CREATE INDEX ON checkout_sessions (organization_id, status, created_at DESC);
CREATE INDEX ON checkout_sessions (organization_id, customer_id, created_at DESC);
COMMENT ON TABLE checkout_sessions IS 'Compra en línea confirmada por un cliente con sesión: total congelado, términos, verificación de correo y captcha, revisión manual de compras atípicas, pago y el único pedido que genera.';

-- ===== Módulo WebConnector (WCN, continuación: aceptación de documentos legales; requiere checkout_sessions) =====

CREATE TABLE legal_acceptances (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           uuid NOT NULL REFERENCES organizations(id),
    legal_document_version_id uuid NOT NULL REFERENCES legal_document_versions(id),
    customer_id               uuid NULL REFERENCES customers(id),
    user_id                   uuid NOT NULL REFERENCES users(id),
    context                   text NOT NULL CHECK (context IN ('checkout','signup','portal')),
    checkout_session_id       uuid NULL REFERENCES checkout_sessions(id),
    ip_hash                   char(64) NULL,
    user_agent_hash           char(64) NULL,
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid NULL,
    CHECK (context <> 'checkout' OR checkout_session_id IS NOT NULL)
);
CREATE UNIQUE INDEX legal_acceptances_checkout_uq ON legal_acceptances (checkout_session_id, legal_document_version_id) WHERE checkout_session_id IS NOT NULL;
CREATE INDEX ON legal_acceptances (organization_id, customer_id, created_at DESC);
COMMENT ON TABLE legal_acceptances IS 'Registro de solo inserción de la aceptación de una versión vigente de términos y condiciones (o de otro documento legal) por un usuario: al comprar, al crear la cuenta o en el portal.';

-- ===== Módulo Assistant (AIA) =====
-- Asistente con IA (API de Claude) en la web de cada marca y en el portal (docs/00 §25).

CREATE TABLE ai_assistant_profiles (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    brand_id         uuid NOT NULL REFERENCES brands(id),
    channel          text NOT NULL CHECK (channel IN ('website','portal')),
    display_name     text NOT NULL,                     -- nombre con que se presenta (siempre como asistente automático)
    instructions     jsonb NOT NULL DEFAULT '{}',       -- instrucciones por idioma (copia de assistant.instructions de la marca)
    greeting         jsonb NOT NULL DEFAULT '{}',       -- saludo por idioma con el aviso de asistente automático
    enabled_tools    text[] NOT NULL DEFAULT '{}' CHECK (enabled_tools <@ ARRAY['recommend_plan','check_domain','create_lead','create_ticket','handoff']::text[]),
    knowledge_sources text[] NOT NULL DEFAULT ('{kb_articles,catalog,brand_info}'::text[]) CHECK (knowledge_sources <@ ARRAY['kb_articles','catalog','brand_info','customer_services']::text[]),   -- brand_info: contacto y documentos legales vigentes de la marca
    handoff_whatsapp_number_id uuid NULL REFERENCES whatsapp_numbers(id),
    is_active        boolean NOT NULL DEFAULT false,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, brand_id, channel),
    -- En la web pública el asistente nunca lee servicios de clientes.
    CHECK (channel = 'portal' OR NOT ('customer_services' = ANY (knowledge_sources)))
);
COMMENT ON TABLE ai_assistant_profiles IS 'Configuración del asistente por marca y canal (web o portal): nombre, instrucciones y saludo por idioma, herramientas habilitadas, fuentes y número de WhatsApp para derivar.';

CREATE TABLE ai_conversations (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    ai_assistant_profile_id uuid NOT NULL REFERENCES ai_assistant_profiles(id),
    brand_id               uuid NOT NULL REFERENCES brands(id),
    channel                text NOT NULL CHECK (channel IN ('website','portal')),
    wp_site_id             uuid NULL REFERENCES wp_sites(id),   -- sitio WordPress donde se abrió [hub_asistente]
    visitor_token_hash     char(64) NULL,                -- visitante anónimo de la web
    customer_id            uuid NULL REFERENCES customers(id),
    user_id                uuid NULL REFERENCES users(id),
    lead_id                uuid NULL REFERENCES leads(id),
    ticket_id              uuid NULL REFERENCES tickets(id),
    whatsapp_conversation_id uuid NULL REFERENCES whatsapp_conversations(id),
    locale                 text NOT NULL DEFAULT 'es',
    model                  text NOT NULL,                -- modelo usado (assistant.model vigente al empezar)
    status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active','handed_off','limit_reached','closed')),
    handoff_channel        text NULL CHECK (handoff_channel IN ('agent','whatsapp')),
    messages_count         integer NOT NULL DEFAULT 0 CHECK (messages_count >= 0),
    input_tokens           bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens          bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    ip_hash                char(64) NULL,
    started_at             timestamptz NOT NULL DEFAULT now(),
    last_message_at        timestamptz NULL,
    handed_off_at          timestamptz NULL,
    closed_at              timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    -- En el portal la conversación pertenece a un cliente con sesión; en la web, a un visitante.
    CHECK (channel <> 'portal' OR (customer_id IS NOT NULL AND user_id IS NOT NULL)),
    CHECK (channel <> 'website' OR visitor_token_hash IS NOT NULL),
    CHECK (status <> 'handed_off' OR (handoff_channel IS NOT NULL AND handed_off_at IS NOT NULL)),
    CHECK (status <> 'closed' OR closed_at IS NOT NULL)
);
CREATE INDEX ON ai_conversations (organization_id, brand_id, started_at DESC);
CREATE INDEX ON ai_conversations (organization_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX ON ai_conversations (organization_id, lead_id) WHERE lead_id IS NOT NULL;
COMMENT ON TABLE ai_conversations IS 'Conversación con el asistente en la web o en el portal, enlazada al prospecto, cliente o ticket que generó; guarda consumo y derivación.';

CREATE TABLE ai_messages (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    ai_conversation_id uuid NOT NULL REFERENCES ai_conversations(id),
    role               text NOT NULL CHECK (role IN ('user','assistant','tool')),
    content            text NOT NULL,
    tool_name          text NULL CHECK (tool_name IN ('recommend_plan','check_domain','create_lead','create_ticket','handoff')),
    tool_input         jsonb NULL,
    tool_result        jsonb NULL,                -- resumen sin datos de otros clientes ni secretos
    input_tokens       integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens      integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    injection_flagged  boolean NOT NULL DEFAULT false,   -- el filtro detectó intento de inyección de instrucciones
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid NULL,
    CHECK (role <> 'tool' OR tool_name IS NOT NULL)
);
CREATE INDEX ON ai_messages (organization_id, ai_conversation_id, created_at);
COMMENT ON TABLE ai_messages IS 'Registro de solo inserción de cada mensaje de la conversación (visitante o cliente, asistente y llamadas a herramientas) con su consumo.';

CREATE TABLE ai_usage (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    brand_id         uuid NOT NULL REFERENCES brands(id),
    period_month     date NOT NULL,                   -- primer día del mes
    conversations_count integer NOT NULL DEFAULT 0 CHECK (conversations_count >= 0),
    messages_count   integer NOT NULL DEFAULT 0 CHECK (messages_count >= 0),
    input_tokens     bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens    bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    cost_minor       bigint NOT NULL DEFAULT 0 CHECK (cost_minor >= 0),   -- costo estimado del proveedor de IA
    cost_currency    char(3) NOT NULL DEFAULT 'USD',
    limit_reached_at timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, brand_id, period_month),
    CHECK (period_month = date_trunc('month', period_month)::date),
    CHECK (cost_currency ~ '^[A-Z]{3}$')
);
COMMENT ON TABLE ai_usage IS 'Consumo mensual del asistente por marca (conversaciones, mensajes, tokens y costo estimado) para aplicar el tope mensual.';

-- ===== Módulo Monitoring (MON, continuación: restauraciones y plan de recuperación) =====

CREATE TABLE restore_requests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    code                text NOT NULL,                       -- RST-000123
    customer_id         uuid NOT NULL REFERENCES customers(id),
    service_id          uuid NOT NULL REFERENCES services(id),
    hosting_account_id  uuid NULL REFERENCES hosting_accounts(id),
    target_kind         text NOT NULL CHECK (target_kind IN ('website','database','mailbox','full_account')),
    target_name         text NOT NULL,                       -- carpeta, base de datos o buzón
    restore_point_at    timestamptz NOT NULL,                -- fecha a la que se restaura
    backup_run_id       uuid NULL REFERENCES backup_runs(id),
    requested_via       text NOT NULL CHECK (requested_via IN ('portal','support')),
    requested_by        uuid NOT NULL REFERENCES users(id),
    overwrite_confirmed boolean NOT NULL DEFAULT false,      -- el cliente aceptó que se sobrescriba lo actual
    status              text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','in_progress','completed','failed','cancelled')),
    ticket_id           uuid NOT NULL REFERENCES tickets(id),
    approved_by         uuid NULL REFERENCES users(id),
    approved_at         timestamptz NULL,
    rejection_reason    text NULL,
    execution_mode      text NULL CHECK (execution_mode IN ('api','assisted')),
    backup_tool_account_id uuid NULL REFERENCES backup_tool_accounts(id),
    external_job_id     text NULL,
    task_id             uuid NULL REFERENCES tasks(id),      -- restauración asistida
    started_at          timestamptz NULL,
    completed_at        timestamptz NULL,
    evidence_file_id    uuid NULL REFERENCES files(id),
    result_notes        text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code),
    CHECK (overwrite_confirmed),
    CHECK (status NOT IN ('approved','in_progress','completed','failed') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
    CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
    CHECK (status NOT IN ('in_progress','completed','failed') OR (execution_mode IS NOT NULL AND started_at IS NOT NULL)),
    CHECK (execution_mode <> 'assisted' OR task_id IS NOT NULL),
    CHECK (status <> 'completed' OR (evidence_file_id IS NOT NULL AND completed_at IS NOT NULL)),
    CHECK (status <> 'failed' OR result_notes IS NOT NULL)
);
-- Una sola restauración abierta por objeto restaurado.
CREATE UNIQUE INDEX restore_requests_open_uq ON restore_requests (organization_id, service_id, target_kind, target_name)
    WHERE status IN ('requested','approved','in_progress');
CREATE INDEX ON restore_requests (organization_id, status, created_at DESC);
CREATE INDEX ON restore_requests (organization_id, customer_id, created_at DESC);
COMMENT ON TABLE restore_requests IS 'Solicitudes de restauración de un sitio, base de datos o buzón a una fecha: las pide el cliente o soporte, soporte aprueba, se ejecuta por API o como tarea asistida y se cierra con evidencia en el ticket.';

CREATE TABLE dr_tests (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES organizations(id),
    tested_at             timestamptz NOT NULL,
    performed_by          uuid NOT NULL REFERENCES users(id),
    procedure_version     text NOT NULL,                  -- versión del procedimiento de recuperación usado
    target_environment    text NOT NULL,                  -- servidor aislado donde se levantó el sistema
    backup_object_key     text NOT NULL,                  -- respaldo de S3 usado
    backup_taken_at       timestamptz NOT NULL,
    restore_started_at    timestamptz NOT NULL,
    restore_completed_at  timestamptz NULL,
    data_loss_minutes     integer NULL CHECK (data_loss_minutes >= 0),   -- pérdida medida (RPO real)
    recovery_minutes      integer NULL CHECK (recovery_minutes >= 0),    -- tiempo medido (RTO real)
    rpo_target_minutes    integer NOT NULL CHECK (rpo_target_minutes > 0),   -- copia de system.backup.rpo_minutes al probar
    rto_target_minutes    integer NOT NULL CHECK (rto_target_minutes > 0),   -- copia de system.backup.rto_minutes al probar
    result                text NOT NULL CHECK (result IN ('passed','failed','partial')),
    checklist             jsonb NOT NULL DEFAULT '[]',   -- pasos verificados (base, archivos, colas, inicio de sesión, conectores apagados)
    evidence_file_id      uuid NULL REFERENCES files(id),
    task_id               uuid NULL REFERENCES tasks(id),
    notes                 text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (restore_started_at >= backup_taken_at),
    -- Una prueba solo se aprueba si cumple ambos objetivos y tiene evidencia.
    CHECK (result <> 'passed' OR (restore_completed_at IS NOT NULL AND evidence_file_id IS NOT NULL
                                  AND data_loss_minutes <= rpo_target_minutes AND recovery_minutes <= rto_target_minutes))
);
CREATE INDEX ON dr_tests (organization_id, tested_at DESC);
COMMENT ON TABLE dr_tests IS 'Pruebas periódicas del plan de recuperación del propio sistema desde AWS S3 en otro servidor, con pérdida de datos y tiempo de recuperación medidos contra los objetivos administrables.';

-- ===== Módulo Complaints (LRC) =====
-- Libro de Reclamaciones virtual y solicitudes de derechos sobre datos personales (docs/00 §25, Ley 29733).

CREATE TABLE complaints (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    brand_id               uuid NOT NULL REFERENCES brands(id),
    wp_site_id             uuid NULL REFERENCES wp_sites(id),    -- web WordPress donde se registró ([hub_libro_reclamaciones])
    number                 integer NOT NULL CHECK (number >= 1),   -- correlativo por marca
    code                   text NOT NULL,                -- número visible en la constancia (prefijo de la marca + correlativo)
    complaint_type         text NOT NULL CHECK (complaint_type IN ('claim','grievance')),   -- reclamo o queja
    consumer_name          text NOT NULL,
    consumer_document_type text NOT NULL CHECK (consumer_document_type IN ('dni','ce','passport','ruc')),
    consumer_document_number text NOT NULL,
    consumer_address       text NOT NULL,
    consumer_email         text NOT NULL,
    consumer_phone         text NULL,
    is_minor               boolean NOT NULL DEFAULT false,
    guardian_name          text NULL,                    -- padre, madre o representante si el consumidor es menor de edad
    customer_id            uuid NULL REFERENCES customers(id),
    service_id             uuid NULL REFERENCES services(id),
    service_description    text NOT NULL,                -- servicio contratado tal como lo describe el consumidor
    amount_minor           bigint NULL CHECK (amount_minor >= 0),
    currency               char(3) NULL CHECK (currency IN ('PEN','USD')),
    detail                 text NOT NULL,
    consumer_request       text NOT NULL,                -- pedido del consumidor
    status                 text NOT NULL DEFAULT 'received' CHECK (status IN ('received','in_progress','answered','closed')),
    received_at            timestamptz NOT NULL DEFAULT now(),
    response_days          integer NOT NULL CHECK (response_days > 0),   -- copia de complaints.response_days al registrar
    due_at                 timestamptz NOT NULL,          -- vencimiento del plazo de respuesta
    ticket_id              uuid NOT NULL REFERENCES tickets(id),   -- ticket interno con el plazo
    acknowledgement_file_id uuid NULL REFERENCES files(id),   -- constancia en PDF enviada al consumidor
    acknowledgement_sent_at timestamptz NULL,
    sheet_token_hash       char(64) NULL UNIQUE,         -- sha256 del token del enlace a la hoja de reclamación (constancia pública, docs/00 §27); el token no se guarda
    answered_at            timestamptz NULL,
    closed_at              timestamptz NULL,
    ip_hash                char(64) NULL,
    is_test                boolean NOT NULL DEFAULT false,   -- hoja de prueba: la única que se puede eliminar
    test_marked_at         timestamptz NULL,
    test_marked_by         uuid NULL REFERENCES users(id),
    test_reason            text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (NOT is_test OR (test_marked_at IS NOT NULL AND test_marked_by IS NOT NULL AND test_reason IS NOT NULL)),
    -- Correlativo único por marca: no se reutiliza ni se salta.
    UNIQUE (organization_id, brand_id, number),
    UNIQUE (organization_id, code),
    CHECK (due_at > received_at),
    CHECK ((amount_minor IS NULL) = (currency IS NULL)),
    CHECK (NOT is_minor OR guardian_name IS NOT NULL),
    CHECK (status NOT IN ('answered','closed') OR answered_at IS NOT NULL),
    CHECK (status <> 'closed' OR closed_at IS NOT NULL)
);
CREATE INDEX ON complaints (organization_id, status, due_at) WHERE status IN ('received','in_progress');
CREATE INDEX ON complaints (organization_id, brand_id, received_at DESC);
COMMENT ON TABLE complaints IS 'Libro de Reclamaciones virtual por marca: hoja de reclamo o queja con número correlativo por marca, constancia al consumidor, ticket interno con plazo de respuesta y registro conservado para fiscalización. Una hoja real no se borra; solo se eliminan las marcadas como prueba, y queda constancia en complaint_deletions.';

CREATE TABLE complaint_deletions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    complaint_id     uuid NOT NULL,               -- sin FK: la hoja ya no existe
    brand_id         uuid NOT NULL REFERENCES brands(id),
    number           integer NOT NULL,            -- correlativo que queda sin hoja (hueco justificado)
    code             text NOT NULL,
    test_reason      text NOT NULL,
    test_marked_by   uuid NOT NULL REFERENCES users(id),
    test_marked_at   timestamptz NOT NULL,
    deleted_by       uuid NULL,                   -- usuario de la sesión (hub.actor_id) que eliminó la hoja
    snapshot         jsonb NOT NULL,              -- copia de la hoja eliminada
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid NULL,
    UNIQUE (organization_id, complaint_id)
);
CREATE INDEX ON complaint_deletions (organization_id, brand_id, number);
COMMENT ON TABLE complaint_deletions IS 'Bitácora de solo inserción de las hojas de prueba eliminadas del Libro de Reclamaciones: número, quién la marcó como prueba y por qué, quién la eliminó y una copia; justifica el hueco del correlativo ante una fiscalización.';

-- Solo se elimina una hoja marcada como prueba; al hacerlo queda su constancia en complaint_deletions.
-- Una hoja con respuesta enviada al consumidor no se marca como prueba.
CREATE OR REPLACE FUNCTION hub_complaint_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF NOT OLD.is_test THEN
            RAISE EXCEPTION 'La hoja % es real: el Libro de Reclamaciones se conserva', OLD.code USING ERRCODE = 'insufficient_privilege';
        END IF;
        INSERT INTO complaint_deletions (organization_id, complaint_id, brand_id, number, code, test_reason, test_marked_by, test_marked_at, deleted_by, snapshot)
        VALUES (OLD.organization_id, OLD.id, OLD.brand_id, OLD.number, OLD.code, OLD.test_reason, OLD.test_marked_by, OLD.test_marked_at,
                NULLIF(current_setting('hub.actor_id', true), '')::uuid, to_jsonb(OLD));
        RETURN OLD;
    END IF;
    IF NEW.is_test AND NOT OLD.is_test AND OLD.status IN ('answered','closed') THEN
        RAISE EXCEPTION 'La hoja % ya fue respondida al consumidor: no se marca como prueba', OLD.code USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.is_test AND NOT NEW.is_test THEN
        RAISE EXCEPTION 'Una hoja marcada como prueba no vuelve a ser real' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER complaints_guard BEFORE UPDATE OR DELETE ON complaints
    FOR EACH ROW EXECUTE FUNCTION hub_complaint_guard();

CREATE TABLE complaint_responses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    complaint_id    uuid NOT NULL REFERENCES complaints(id),
    body            text NOT NULL,                    -- texto plano de la carta (exportación para fiscalización)
    body_html       text NOT NULL,                    -- carta en HTML saneado del editor enriquecido (docs/00 §27)
    template_id     uuid NULL REFERENCES notification_templates(id),   -- plantilla de partida (category = complaint_response)
    previewed_at    timestamptz NOT NULL,             -- vista previa de la carta antes del envío
    preview_sha256  char(64) NOT NULL,                -- hash del HTML previsualizado: se envía exactamente lo que se vio
    responded_by    uuid NOT NULL REFERENCES users(id),   -- responsable que firma y envía
    sent_to_email   text NOT NULL,
    sent_at         timestamptz NOT NULL DEFAULT now(),   -- fecha de envío al correo del consumidor
    file_id         uuid NULL REFERENCES files(id),   -- respuesta en PDF
    is_final        boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid NULL,
    CHECK (previewed_at <= sent_at),
    CHECK (preview_sha256 = encode(sha256(convert_to(body_html, 'UTF8')), 'hex')),
    CHECK (body_html !~* '<\s*(script|iframe|object|embed|style)|javascript:|\son[a-z]+\s*=')
);
CREATE INDEX ON complaint_responses (organization_id, complaint_id, sent_at);
COMMENT ON TABLE complaint_responses IS 'Respuestas enviadas al consumidor por cada hoja del Libro de Reclamaciones; no se editan, y solo se borran junto con una hoja marcada como prueba.';

-- Las respuestas no se editan; solo se borran si su hoja es de prueba (al eliminarla).
CREATE OR REPLACE FUNCTION hub_complaint_response_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM complaints c WHERE c.id = OLD.complaint_id AND c.is_test) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'La tabla % es solo de inserción: % no permitido', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER complaint_responses_no_mutation BEFORE UPDATE OR DELETE ON complaint_responses
    FOR EACH ROW EXECUTE FUNCTION hub_complaint_response_guard();
CREATE TRIGGER complaint_responses_no_truncate BEFORE TRUNCATE ON complaint_responses
    FOR EACH STATEMENT EXECUTE FUNCTION hub_forbid_mutation();

CREATE TABLE privacy_requests (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid NOT NULL REFERENCES organizations(id),
    brand_id               uuid NOT NULL REFERENCES brands(id),
    code                   text NOT NULL,                -- PRV-000123
    request_type           text NOT NULL CHECK (request_type IN ('access','rectification','cancellation','opposition')),
    requester_name         text NOT NULL,
    requester_email        text NOT NULL,
    requester_document_type text NOT NULL CHECK (requester_document_type IN ('dni','ce','passport','ruc')),
    requester_document_number text NOT NULL,
    customer_id            uuid NULL REFERENCES customers(id),
    detail                 text NOT NULL,
    status                 text NOT NULL DEFAULT 'received' CHECK (status IN ('received','in_progress','answered','rejected')),
    received_at            timestamptz NOT NULL DEFAULT now(),
    due_at                 timestamptz NOT NULL,          -- según complaints.privacy_response_days
    identity_verified_at   timestamptz NULL,
    identity_verified_by   uuid NULL REFERENCES users(id),
    ticket_id              uuid NOT NULL REFERENCES tickets(id),
    response_summary       text NULL,
    response_file_id       uuid NULL REFERENCES files(id),
    answered_at            timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code),
    CHECK (due_at > received_at),
    -- No se responde ni se rechaza sin verificar la identidad del titular.
    CHECK (status NOT IN ('answered','rejected') OR (identity_verified_at IS NOT NULL AND answered_at IS NOT NULL AND response_summary IS NOT NULL))
);
CREATE INDEX ON privacy_requests (organization_id, status, due_at) WHERE status IN ('received','in_progress');
COMMENT ON TABLE privacy_requests IS 'Solicitudes del titular de datos personales (acceso, rectificación, cancelación u oposición, Ley 29733) recibidas por el canal de la política de privacidad, con verificación de identidad, plazo y respuesta.';

-- ===== Módulo Catalog (CAT, continuación: ficha por marca y fichas técnicas; requiere hosting_nodes) =====
-- Administración de paquetes de hosting, VPS y dominios (docs/00 §25). Un producto es el paquete o plan;
-- sus planes son los ciclos de cobro con su costo (plans) y su precio por moneda y vigencia (plan_prices).

CREATE TABLE product_listings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    product_id      uuid NOT NULL REFERENCES products(id),
    brand_id        uuid NOT NULL REFERENCES brands(id),
    display_name    jsonb NOT NULL,                     -- nombre comercial por idioma en esa marca
    tagline         jsonb NOT NULL DEFAULT '{}',
    highlights      jsonb NOT NULL DEFAULT '[]',        -- características destacadas por idioma
    sellable_online boolean NOT NULL DEFAULT false,     -- requiere además products.sellable_online
    is_featured     boolean NOT NULL DEFAULT false,
    sort_order      integer NOT NULL DEFAULT 0,
    visible_from    date NULL,                          -- vigencia en la web
    visible_until   date NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    deleted_at timestamptz NULL,
    CHECK (display_name <> '{}'::jsonb),
    CHECK (visible_until IS NULL OR visible_from IS NULL OR visible_until > visible_from)
);
CREATE UNIQUE INDEX product_listings_product_brand_uq ON product_listings (organization_id, product_id, brand_id) WHERE deleted_at IS NULL;
CREATE INDEX ON product_listings (organization_id, brand_id, sort_order) WHERE deleted_at IS NULL;
COMMENT ON TABLE product_listings IS 'Ficha comercial de un producto en una marca: nombre por marca, venta en línea, orden, destacado y vigencia en las webs WordPress de la marca (shortcodes de catálogo). El SEO de las páginas vive en WordPress.';

CREATE TABLE hosting_package_specs (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    product_id        uuid NOT NULL UNIQUE REFERENCES products(id),
    disk_mb           bigint NULL CHECK (disk_mb > 0),           -- NULL: sin límite
    bandwidth_mb      bigint NULL CHECK (bandwidth_mb > 0),
    email_accounts    integer NULL CHECK (email_accounts >= 0),
    databases         integer NULL CHECK (databases >= 0),
    websites          integer NULL CHECK (websites >= 1),        -- dominios o sitios por cuenta
    whm_package       text NOT NULL,                             -- nombre exacto del paquete en WHM
    preferred_node_id uuid NULL REFERENCES hosting_nodes(id),    -- si no tiene capacidad, se usa otro nodo con capacidad
    extra_resources   jsonb NOT NULL DEFAULT '{}',
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (whm_package <> '')
);
CREATE INDEX ON hosting_package_specs (organization_id, preferred_node_id);
COMMENT ON TABLE hosting_package_specs IS 'Ficha técnica de un paquete de hosting: recursos, paquete de WHM asociado y nodo preferido para crear la cuenta.';

CREATE TABLE vps_plan_specs (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    product_id        uuid NOT NULL UNIQUE REFERENCES products(id),
    vcpu              smallint NOT NULL CHECK (vcpu >= 1),
    ram_mb            integer NOT NULL CHECK (ram_mb > 0),
    disk_gb           integer NOT NULL CHECK (disk_gb > 0),
    transfer_gb       integer NULL CHECK (transfer_gb > 0),      -- NULL: sin límite
    os_options        text[] NOT NULL DEFAULT '{}',              -- sistemas operativos ofrecidos
    is_managed        boolean NOT NULL DEFAULT false,            -- administrado por la empresa
    location          text NULL,                                 -- ubicación del centro de datos que ve el visitante ([hub_servidores], docs/00 §27)
    cpu_model         text NULL,                                 -- procesador (servidores dedicados)
    disk_type         text NULL CHECK (disk_type IN ('ssd','nvme','hdd')),
    provider_id       uuid NOT NULL REFERENCES providers(id),    -- proveedor de origen (Contabo, DigitalOcean...)
    provider_plan_ref text NOT NULL,                             -- plan de origen en el proveedor; su costo por ciclo va en plans.cost_minor
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (provider_plan_ref <> '')
);
CREATE INDEX ON vps_plan_specs (organization_id, provider_id);
COMMENT ON TABLE vps_plan_specs IS 'Ficha técnica de un plan VPS: CPU, RAM, disco, transferencia, sistemas operativos, administrado o no, proveedor y plan de origen.';

-- ===== Módulo Catalog (CAT, continuación: servicios personalizados; requiere providers, brands y files) =====
-- Tipos de servicio que el administrador crea sin programar (docs/00 §26): identidad, campos propios,
-- entrega, componente del mapa, datos visibles en el portal y modo de venta. Su precio y ciclo viven en
-- products, plans y plan_prices como en cualquier producto (products.service_type_id).

CREATE TABLE service_types (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES organizations(id),
    code                  text NOT NULL,                  -- también es el tipo de [hub_planes tipo="..."] si no hereda el de la categoría
    name                  jsonb NOT NULL,                 -- {"es": "...", "en": "..."}
    description           jsonb NOT NULL DEFAULT '{}',
    icon                  text NULL,                      -- nombre de icono de la lista permitida
    category_id           uuid NOT NULL REFERENCES product_categories(id),   -- categoría existente o nueva (kind = custom)
    brand_ids             uuid[] NOT NULL DEFAULT '{}',   -- marcas donde se ofrece
    status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
    sale_mode             text NOT NULL DEFAULT 'quote_only' CHECK (sale_mode IN ('online','quote_only')),   -- venta en línea o solo cotización
    requires_contract     boolean NOT NULL DEFAULT false,
    default_provider_id   uuid NULL REFERENCES providers(id),   -- proveedor opcional; el costo va en plans.cost_minor
    component_kind        text NULL CHECK (component_kind IN ('server','hosting','domain','dns','cdn','email','bulk_email','ssl_certificate','database','storage','wordpress_site','custom_system','moodle_platform','license','other')),   -- componente que crea en el mapa de servicios del cliente
    delivery_tasks        jsonb NOT NULL DEFAULT '[]',    -- lista de tareas plantilla de entrega: [{"title": {...}, "role": "support", "due_days": 2, "checklist": [...]}]
    portal_fields         text[] NOT NULL DEFAULT '{}',   -- claves de service_type_fields que el cliente ve en el portal
    activated_at          timestamptz NULL,
    archived_at           timestamptz NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code),
    CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CHECK (name <> '{}'::jsonb),
    CHECK (jsonb_typeof(delivery_tasks) = 'array'),
    CHECK (status <> 'active' OR (activated_at IS NOT NULL AND cardinality(brand_ids) >= 1)),
    CHECK (status <> 'archived' OR archived_at IS NOT NULL)
);
CREATE INDEX ON service_types (organization_id, category_id, status);
COMMENT ON TABLE service_types IS 'Tipos de servicio personalizados creados desde el panel sin programar: identidad, categoría, marcas, campos propios, tareas plantilla de entrega, contrato obligatorio, componente del mapa, datos visibles en el portal y venta en línea o solo cotización.';

CREATE TABLE service_type_fields (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    service_type_id  uuid NOT NULL REFERENCES service_types(id),
    key              text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    label            jsonb NOT NULL,
    help_text        jsonb NOT NULL DEFAULT '{}',
    field_type       text NOT NULL CHECK (field_type IN ('text','number','select','date','file','checkbox')),
    options          jsonb NOT NULL DEFAULT '[]',     -- lista: [{"value": "...", "label": {...}}]
    validation       jsonb NOT NULL DEFAULT '{}',     -- min, max, max_length, pattern, max_file_mb, allowed_mime
    is_required      boolean NOT NULL DEFAULT false,
    filled_by        text NOT NULL DEFAULT 'customer' CHECK (filled_by IN ('customer','staff')),   -- se pide al contratar o lo completa soporte
    position         smallint NOT NULL CHECK (position >= 0),
    is_active        boolean NOT NULL DEFAULT true,   -- un campo con valores no se borra: se desactiva
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (service_type_id, key),
    UNIQUE (id, field_type),                         -- destino de la FK compuesta de service_field_values
    CHECK (field_type <> 'select' OR jsonb_array_length(options) >= 1),
    CHECK (field_type = 'select' OR options = '[]'::jsonb)
);
CREATE INDEX ON service_type_fields (organization_id, service_type_id, position);
COMMENT ON TABLE service_type_fields IS 'Campos propios de un tipo de servicio personalizado (texto, número, lista, fecha, archivo o casilla), con obligatoriedad, validación y quién los completa.';

-- El tipo de un campo con valores no cambia (los valores guardados dejarían de ser coherentes).
CREATE OR REPLACE FUNCTION hub_service_type_field_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.field_type <> OLD.field_type THEN
        RAISE EXCEPTION 'El campo % ya existe: su tipo no cambia; desactívelo y cree otro', OLD.key USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER service_type_fields_guard BEFORE UPDATE ON service_type_fields
    FOR EACH ROW EXECUTE FUNCTION hub_service_type_field_guard();

-- ===== Módulo Services (SRV, continuación: valores de los campos de servicios personalizados) =====

CREATE TABLE service_field_values (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES organizations(id),
    service_id            uuid NOT NULL REFERENCES services(id),
    service_type_field_id uuid NOT NULL,
    field_type            text NOT NULL CHECK (field_type IN ('text','number','select','date','file','checkbox')),   -- copia del tipo del campo (FK compuesta)
    value_text            text NULL,                  -- text y select (valor de la opción)
    value_number          numeric NULL,
    value_date            date NULL,
    value_boolean         boolean NULL,
    value_file_id         uuid NULL REFERENCES files(id),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (service_id, service_type_field_id),
    FOREIGN KEY (service_type_field_id, field_type) REFERENCES service_type_fields (id, field_type),
    -- Exactamente la columna que corresponde al tipo del campo.
    CHECK (
        (field_type IN ('text','select') AND value_text IS NOT NULL AND num_nonnulls(value_number, value_date, value_boolean, value_file_id) = 0)
     OR (field_type = 'number'   AND value_number  IS NOT NULL AND num_nonnulls(value_text, value_date, value_boolean, value_file_id) = 0)
     OR (field_type = 'date'     AND value_date    IS NOT NULL AND num_nonnulls(value_text, value_number, value_boolean, value_file_id) = 0)
     OR (field_type = 'checkbox' AND value_boolean IS NOT NULL AND num_nonnulls(value_text, value_number, value_date, value_file_id) = 0)
     OR (field_type = 'file'     AND value_file_id IS NOT NULL AND num_nonnulls(value_text, value_number, value_date, value_boolean) = 0)
    )
);
CREATE INDEX ON service_field_values (organization_id, service_id);
COMMENT ON TABLE service_field_values IS 'Valores de los campos propios de cada servicio de un tipo personalizado, con el tipo del campo copiado por clave foránea compuesta para que el valor siempre sea coherente con su tipo.';

-- Un valor de lista debe ser una de las opciones del campo.
CREATE OR REPLACE FUNCTION hub_service_field_value_option() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.field_type = 'select' AND NOT EXISTS (
        SELECT 1 FROM service_type_fields f, jsonb_array_elements(f.options) o
         WHERE f.id = NEW.service_type_field_id AND o->>'value' = NEW.value_text) THEN
        RAISE EXCEPTION 'El valor % no es una opción del campo', NEW.value_text USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER service_field_values_option BEFORE INSERT OR UPDATE ON service_field_values
    FOR EACH ROW EXECUTE FUNCTION hub_service_field_value_option();

-- ===== Módulo Automation (AUT, continuación: historial del editor de textos enriquecido) =====
-- Los textos que redacta el equipo se escriben con el editor enriquecido y se guardan saneados (docs/00 §27).
-- Los documentos legales (legal_document_versions), los contratos (contract_versions) y las cotizaciones
-- (quote_versions) ya tienen sus versiones; esta tabla guarda el historial del resto donde aplica.
CREATE TABLE rich_text_versions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id),
    owner_type       text NOT NULL CHECK (owner_type IN ('notification_template','contract_template','contract_clause','kb_article','web_form','product','service_type')),
    owner_id         uuid NOT NULL,                -- fila dueña del texto (sin FK: varias tablas)
    field            text NOT NULL,                -- columna del texto: body, success_message, description
    locale           text NOT NULL DEFAULT 'es',
    version_number   integer NOT NULL CHECK (version_number >= 1),
    html             text NOT NULL,                -- HTML ya saneado con la lista editor.html.allowed_tags vigente
    html_sha256      char(64) NOT NULL,
    sanitizer_profile text NOT NULL,               -- huella de la lista de etiquetas y atributos aplicada
    change_summary   text NULL,
    restored_from_id uuid NULL REFERENCES rich_text_versions(id),   -- versión anterior que se restauró
    author_id        uuid NOT NULL REFERENCES users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid NULL,
    UNIQUE (organization_id, owner_type, owner_id, field, locale, version_number),
    CHECK (field ~ '^[a-z_]+$'),
    CHECK (html_sha256 = encode(sha256(convert_to(html, 'UTF8')), 'hex')),
    CHECK (html !~* '<\s*(script|iframe|object|embed|style)|javascript:|\son[a-z]+\s*=')
);
CREATE INDEX ON rich_text_versions (organization_id, owner_type, owner_id, field, locale, version_number DESC);
COMMENT ON TABLE rich_text_versions IS 'Historial de solo inserción de los textos del editor enriquecido (plantillas de correo y avisos, respuestas predefinidas, plantillas y cláusulas de contrato, artículos, mensajes de confirmación de formularios, descripciones de productos y servicios personalizados): HTML saneado, autor y fecha; restaurar crea una versión nueva.';

-- ===== Módulo Domains (DOM, continuación: consultas WHOIS y de disponibilidad desde la web) =====
-- [hub_whois] consulta en el sistema contra los registradores conectados, con límite por visitante y captcha
-- ante abuso (docs/00 §27). La IP del visitante no se guarda: solo su HMAC.
CREATE TABLE whois_lookups (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES organizations(id),
    brand_id              uuid NOT NULL REFERENCES brands(id),
    wp_site_id            uuid NULL REFERENCES wp_sites(id),     -- sitio WordPress desde donde llegó la consulta
    visitor_hash          char(64) NOT NULL,                      -- HMAC-SHA256 de la IP del visitante con clave del sistema
    query_kind            text NOT NULL CHECK (query_kind IN ('availability','whois','suggestions')),
    domain_name           text NOT NULL,                          -- en minúsculas y punycode
    tld                   text NOT NULL CHECK (tld ~ '^[a-z0-9]+(\.[a-z0-9]+)*$'),
    result                text NOT NULL CHECK (result IN ('available','registered','reserved','unsupported','unknown','rate_limited','captcha_required')),
    registrar_provider_id uuid NULL REFERENCES providers(id),     -- registrador consultado (NULL si no se consultó)
    captcha_verified      boolean NOT NULL DEFAULT false,
    served_from_cache     boolean NOT NULL DEFAULT false,
    response_ms           integer NULL CHECK (response_ms >= 0),
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid NULL,
    CHECK (domain_name ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'),
    CHECK (right(domain_name, length(tld) + 1) = '.' || tld),
    -- Una consulta frenada por el límite o por el captcha no llega al registrador.
    CHECK (result NOT IN ('rate_limited','captcha_required') OR (registrar_provider_id IS NULL AND NOT served_from_cache))
);
CREATE INDEX ON whois_lookups (organization_id, visitor_hash, created_at DESC);
CREATE INDEX ON whois_lookups (organization_id, brand_id, created_at DESC);
COMMENT ON TABLE whois_lookups IS 'Consultas de disponibilidad, WHOIS público y sugerencias hechas desde [hub_whois] y [hub_buscar_dominio]: base del límite por visitante y hora, del captcha ante abuso y de los indicadores de búsquedas de dominio. Sin IP ni datos del titular; la aplicación no la edita y se purga según web_connector.whois.retention_days.';

-- Consultas de un visitante en los últimos minutos (respaldo del contador en Redis para el límite y el captcha).
CREATE OR REPLACE FUNCTION hub_whois_recent_count(p_org uuid, p_visitor char(64), p_minutes integer)
RETURNS integer LANGUAGE sql STABLE AS $$
    SELECT count(*)::integer FROM whois_lookups
     WHERE organization_id = p_org AND visitor_hash = p_visitor
       AND result NOT IN ('rate_limited','captcha_required')
       AND created_at > now() - make_interval(mins => p_minutes);
$$;
COMMENT ON FUNCTION hub_whois_recent_count(uuid, char, integer) IS
    'Cuenta las consultas WHOIS efectivas de un visitante en los últimos minutos (límite web_connector.whois.limit_per_visitor_per_hour y captcha tras web_connector.whois.captcha_after_lookups).';

-- ===== Módulo Dashboard (DSH): panel de indicadores (docs/00 §27) =====
-- El dashboard no escribe en las tablas de otros módulos: guarda el catálogo de indicadores (sembrado desde
-- database/seeds/kpis.json), las metas administrables y los valores calculados por periodo y dimensión.
CREATE TABLE kpi_definitions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL REFERENCES organizations(id),
    code               text NOT NULL CHECK (code ~ '^KPI-(COM|CRM|FIN|COB|OPE|SOP|REC|WEB)-[0-9]{2}$'),
    kpi_group          text NOT NULL CHECK (kpi_group IN ('commercial','crm','finance','collections','operations','support','complaints','web')),
    name               jsonb NOT NULL,              -- {"es": "...", "en": "..."}
    definition         jsonb NOT NULL,              -- qué mide, en lenguaje del negocio
    formula            text NOT NULL,               -- fórmula exacta sobre tablas y columnas de schema.sql (docs/14)
    source_columns     text[] NOT NULL DEFAULT '{}',   -- tabla.columna que lee
    unit               text NOT NULL CHECK (unit IN ('money','count','percent','days','hours','minutes','score')),
    direction          text NOT NULL CHECK (direction IN ('up','down')),   -- dirección deseada
    frequency          text NOT NULL CHECK (frequency IN ('intraday','daily','monthly')),
    dimensions         text[] NOT NULL DEFAULT '{}' CHECK (dimensions <@ ARRAY['brand','currency','product_category','owner']::text[]),
    target_setting_key text NULL,                   -- meta por defecto en settings (dashboard.targets.*); NULL: solo kpi_targets
    detail_screen      text NOT NULL CHECK (detail_screen ~ '^P-[A-Z]{3}-[0-9]{2}$'),   -- pantalla del módulo dueño que abre el detalle
    is_active          boolean NOT NULL DEFAULT true,
    sort_order         integer NOT NULL DEFAULT 0,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    UNIQUE (organization_id, code),
    CHECK (name <> '{}'::jsonb AND definition <> '{}'::jsonb AND formula <> ''),
    CHECK (target_setting_key IS NULL OR target_setting_key ~ '^dashboard\.targets\.[a-z0-9_]+$'),
    -- El prefijo del código corresponde al grupo.
    CHECK (substring(code from 5 for 3) = CASE kpi_group
        WHEN 'commercial' THEN 'COM' WHEN 'crm' THEN 'CRM' WHEN 'finance' THEN 'FIN' WHEN 'collections' THEN 'COB'
        WHEN 'operations' THEN 'OPE' WHEN 'support' THEN 'SOP' WHEN 'complaints' THEN 'REC' ELSE 'WEB' END),
    -- Un indicador en dinero siempre se filtra o consolida por moneda.
    CHECK (unit <> 'money' OR 'currency' = ANY (dimensions))
);
COMMENT ON TABLE kpi_definitions IS 'Catálogo de indicadores del panel (docs/14): código, grupo, definición, fórmula exacta, unidad, dirección deseada, frecuencia de cálculo, dimensiones de filtro, meta por defecto y pantalla de detalle. Lo siembra el seeder desde database/seeds/kpis.json; el administrador solo activa, desactiva u ordena.';

CREATE TABLE kpi_targets (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id),
    kpi_definition_id uuid NOT NULL REFERENCES kpi_definitions(id),
    brand_id          uuid NULL REFERENCES brands(id),     -- NULL: todas las marcas
    period_type       text NOT NULL CHECK (period_type IN ('month','quarter','year')),
    period_start      date NOT NULL,
    target_value      numeric(18,4) NULL,                  -- meta en la unidad del indicador (porcentaje, días, cantidad…)
    target_minor      bigint NULL CHECK (target_minor >= 0),   -- meta en dinero (indicadores money)
    currency          char(3) NULL CHECK (currency IN ('PEN','USD')),
    notes             text NULL,
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- concurrencia optimista: PATCH con versión vieja responde 409
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK ((target_value IS NULL) <> (target_minor IS NULL)),
    CHECK ((target_minor IS NULL) = (currency IS NULL)),
    CHECK (extract(day from period_start) = 1),
    CHECK (period_type <> 'quarter' OR extract(month from period_start) IN (1,4,7,10)),
    CHECK (period_type <> 'year' OR extract(month from period_start) = 1),
    UNIQUE NULLS NOT DISTINCT (organization_id, kpi_definition_id, brand_id, period_type, period_start, currency)
);
CREATE INDEX ON kpi_targets (organization_id, kpi_definition_id, period_start);
COMMENT ON TABLE kpi_targets IS 'Metas administrables por indicador, marca (o todas) y periodo (mes, trimestre o año). Sin meta propia, el panel usa la key dashboard.targets.* del indicador; si también es null, muestra "sin meta".';

-- La meta usa la unidad del indicador: dinero en unidades menores con moneda; porcentaje entre 0 y 100.
CREATE OR REPLACE FUNCTION hub_kpi_target_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_unit text;
BEGIN
    SELECT unit INTO v_unit FROM kpi_definitions WHERE id = NEW.kpi_definition_id;
    IF v_unit = 'money' AND NEW.target_minor IS NULL THEN
        RAISE EXCEPTION 'El indicador es en dinero: la meta va en target_minor con moneda' USING ERRCODE = 'check_violation';
    ELSIF v_unit <> 'money' AND NEW.target_value IS NULL THEN
        RAISE EXCEPTION 'El indicador no es en dinero: la meta va en target_value' USING ERRCODE = 'check_violation';
    ELSIF v_unit = 'percent' AND (NEW.target_value < 0 OR NEW.target_value > 100) THEN
        RAISE EXCEPTION 'Una meta en porcentaje va de 0 a 100' USING ERRCODE = 'check_violation';
    ELSIF v_unit <> 'money' AND NEW.target_value < 0 THEN
        RAISE EXCEPTION 'La meta no puede ser negativa' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER kpi_targets_guard BEFORE INSERT OR UPDATE ON kpi_targets
    FOR EACH ROW EXECUTE FUNCTION hub_kpi_target_guard();

CREATE TABLE kpi_snapshots (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    kpi_definition_id   uuid NOT NULL REFERENCES kpi_definitions(id),
    period_type         text NOT NULL CHECK (period_type IN ('day','month')),
    period_start        date NOT NULL,
    period_end          date NOT NULL,
    brand_id            uuid NULL REFERENCES brands(id),               -- NULL: todas las marcas
    currency            char(3) NULL CHECK (currency IN ('PEN','USD')), -- NULL en dinero: consolidado (dashboard.consolidation_currency)
    product_category_id uuid NULL REFERENCES product_categories(id),   -- NULL: todas las categorías
    owner_user_id       uuid NULL REFERENCES users(id),                -- responsable; NULL: todos
    value               numeric(20,4) NULL,       -- valor en la unidad del indicador (no dinero)
    value_minor         bigint NULL,              -- valor en dinero (unidades menores); puede ser negativo (margen)
    numerator           numeric(20,4) NULL,       -- partes de una razón, para reagregar periodos sin promediar promedios
    denominator         numeric(20,4) NULL CHECK (denominator >= 0),
    sample_count        integer NULL CHECK (sample_count >= 0),
    is_partial          boolean NOT NULL DEFAULT false,   -- periodo en curso
    computed_at         timestamptz NOT NULL DEFAULT now(),
    version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),   -- el job lo reemplaza al recalcular
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL, updated_by uuid NULL,
    CHECK (NOT (value IS NOT NULL AND value_minor IS NOT NULL)),
    CHECK (period_type <> 'day' OR period_end = period_start),
    CHECK (period_type <> 'month' OR (extract(day from period_start) = 1
                                      AND period_end = (date_trunc('month', period_start) + interval '1 month - 1 day')::date)),
    UNIQUE NULLS NOT DISTINCT (organization_id, kpi_definition_id, period_type, period_start, brand_id, currency, product_category_id, owner_user_id)
);
CREATE INDEX ON kpi_snapshots (organization_id, kpi_definition_id, period_type, period_start DESC);
COMMENT ON TABLE kpi_snapshots IS 'Valores calculados de cada indicador por día o mes y por dimensión (marca, moneda, categoría, responsable), con numerador y denominador de las razones. Los recalcula el job ComputeKpiSnapshots con la frecuencia de dashboard.calculation.*; nunca se editan a mano.';

-- =====================================================================
-- Claves foráneas diferidas (tablas definidas después de quien las referencia)
-- =====================================================================

ALTER TABLE communication_consents ADD CONSTRAINT communication_consents_lead_fk
    FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE products ADD CONSTRAINT products_welcome_template_fk
    FOREIGN KEY (welcome_template_id) REFERENCES notification_templates(id);
ALTER TABLE services ADD CONSTRAINT services_contract_fk
    FOREIGN KEY (contract_id) REFERENCES contracts(id);
ALTER TABLE whatsapp_conversations ADD CONSTRAINT whatsapp_conversations_ticket_fk
    FOREIGN KEY (ticket_id) REFERENCES tickets(id);
ALTER TABLE maintenances ADD CONSTRAINT maintenances_task_fk
    FOREIGN KEY (task_id) REFERENCES tasks(id);
ALTER TABLE domain_operations ADD CONSTRAINT domain_operations_task_fk
    FOREIGN KEY (task_id) REFERENCES tasks(id);
ALTER TABLE domain_regularizations ADD CONSTRAINT domain_regularizations_task_fk
    FOREIGN KEY (task_id) REFERENCES tasks(id);
ALTER TABLE personal_access_tokens ADD CONSTRAINT personal_access_tokens_customer_fk
    FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE orders ADD CONSTRAINT orders_invoice_fk
    FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_provider_bill_fk
    FOREIGN KEY (provider_bill_id) REFERENCES provider_bills(id);
ALTER TABLE payment_disputes ADD CONSTRAINT payment_disputes_alert_fk
    FOREIGN KEY (alert_id) REFERENCES alerts(id);
ALTER TABLE orders ADD CONSTRAINT orders_checkout_session_fk
    FOREIGN KEY (checkout_session_id) REFERENCES checkout_sessions(id);
ALTER TABLE payments ADD CONSTRAINT payments_checkout_session_fk
    FOREIGN KEY (checkout_session_id) REFERENCES checkout_sessions(id);
ALTER TABLE payment_checkouts ADD CONSTRAINT payment_checkouts_checkout_session_fk
    FOREIGN KEY (checkout_session_id) REFERENCES checkout_sessions(id);
ALTER TABLE brand_themes ADD CONSTRAINT brand_themes_published_version_fk
    FOREIGN KEY (published_version_id) REFERENCES brand_theme_versions(id);
ALTER TABLE legal_documents ADD CONSTRAINT legal_documents_published_version_fk
    FOREIGN KEY (published_version_id) REFERENCES legal_document_versions(id);
ALTER TABLE products ADD CONSTRAINT products_service_type_fk
    FOREIGN KEY (service_type_id) REFERENCES service_types(id);

CREATE INDEX ON services (organization_id, contract_id);

-- =====================================================================
-- Tablas solo de inserción: bloqueo por trigger (también para el dueño)
-- =====================================================================

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'audit_events','secret_access_logs','setting_changes','notification_deliveries','webhook_events',
        'notification_delivery_events','webhook_event_processings','ai_messages',
        'legal_acceptances','lead_stage_changes','complaint_deletions','rich_text_versions'
    ] LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION hub_forbid_mutation()',
                       t || '_no_mutation', t);
        EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION hub_forbid_mutation()',
                       t || '_no_truncate', t);
    END LOOP;
END;
$$;

-- =====================================================================
-- Rol de la aplicación
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_app') THEN
        CREATE ROLE hub_app NOLOGIN;   -- el usuario de conexión de Laravel hereda de este rol
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO hub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hub_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hub_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO hub_app;

-- Solo inserción: el usuario de la aplicación no puede actualizar ni borrar.
REVOKE UPDATE, DELETE, TRUNCATE ON
    audit_events, secret_access_logs, setting_changes, notification_deliveries, webhook_events,
    notification_delivery_events, webhook_event_processings, ai_messages,
    legal_acceptances, lead_stage_changes, complaint_deletions, rich_text_versions
FROM hub_app;

-- Las consultas WHOIS no se editan; solo las borra la purga por retención (web_connector.whois.retention_days).
REVOKE UPDATE, TRUNCATE ON whois_lookups FROM hub_app;

-- Las respuestas del Libro se escriben una vez; el catálogo de indicadores lo siembra el seeder (dueño) y la
-- aplicación solo cambia is_active y sort_order (la política lo exige; aquí se impide borrarlo).
REVOKE DELETE, TRUNCATE ON kpi_definitions FROM hub_app;

-- Las respuestas del Libro no se editan (el trigger además solo deja borrar las de hojas de prueba).
REVOKE UPDATE, TRUNCATE ON complaint_responses FROM hub_app;

-- El Libro de Reclamaciones se conserva para fiscalización: la aplicación solo borra hojas de prueba
-- (trigger complaints_guard) y nunca vacía la tabla.
REVOKE TRUNCATE ON complaints FROM hub_app;

-- El catálogo de permisos lo carga el seeder (dueño); la aplicación solo lo lee.
REVOKE INSERT, UPDATE, DELETE ON permissions FROM hub_app;
