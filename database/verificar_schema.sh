#!/usr/bin/env bash
# =====================================================================
# verificar_schema.sh — carga schema.sql en una base temporal y ejecuta
# pruebas mínimas de integridad.
#
# Uso:
#   ./verificar_schema.sh                 # usa PGHOST/PGPORT/PGUSER si hay servidor;
#                                         # si no, levanta un PostgreSQL 16 temporal en /tmp
#   PG_BIN=/usr/lib/postgresql/16/bin ./verificar_schema.sh
#
# Requisitos: psql y, para el servidor temporal, initdb y pg_ctl de PostgreSQL 16+.
# Si se ejecuta como root, el servidor temporal corre como el usuario "postgres"
# (o se crea el usuario "hubtest").
# Sale con código 0 solo si la carga es limpia y todas las pruebas pasan.
# =====================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA="$HERE/schema.sql"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PSQL="$(command -v psql || echo "$PG_BIN/psql")"
DB="hub_verify_$$"
TMP_CLUSTER=""
PASS=0; FAIL=0

log()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS+1)); printf '  [OK]    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  [FALLA] %s\n' "$1"; [ -n "${2:-}" ] && printf '          %s\n' "$2"; }

# ---------------------------------------------------------------------
# 1. Servidor: existente o temporal
# ---------------------------------------------------------------------
as_owner() {   # ejecuta un comando como el dueño del clúster temporal
    if [ "$(id -u)" = "0" ]; then runuser -u "$CLUSTER_USER" -- "$@"; else "$@"; fi
}

start_temp_cluster() {
    TMP_CLUSTER="$(mktemp -d /tmp/hub_pg_XXXXXX)"
    if [ "$(id -u)" = "0" ]; then
        if id postgres >/dev/null 2>&1; then CLUSTER_USER=postgres
        else id hubtest >/dev/null 2>&1 || useradd -M -s /usr/sbin/nologin hubtest; CLUSTER_USER=hubtest; fi
        chown "$CLUSTER_USER" "$TMP_CLUSTER"
    else
        CLUSTER_USER="$(id -un)"
    fi
    local port=$(( 54000 + RANDOM % 1000 ))
    as_owner "$PG_BIN/initdb" -D "$TMP_CLUSTER/data" -A trust -U postgres -E UTF8 >/dev/null || { log "initdb falló"; exit 2; }
    as_owner "$PG_BIN/pg_ctl" -D "$TMP_CLUSTER/data" -l "$TMP_CLUSTER/server.log" -w \
        -o "-p $port -k $TMP_CLUSTER -c listen_addresses=''" start >/dev/null || { log "pg_ctl start falló"; cat "$TMP_CLUSTER/server.log"; exit 2; }
    export PGHOST="$TMP_CLUSTER" PGPORT="$port" PGUSER=postgres
    log "Servidor temporal PostgreSQL en $TMP_CLUSTER (puerto $port)"
}

cleanup() {
    "$PSQL" -q -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1
    if [ -n "$TMP_CLUSTER" ]; then
        as_owner "$PG_BIN/pg_ctl" -D "$TMP_CLUSTER/data" -m fast stop >/dev/null 2>&1
        rm -rf "$TMP_CLUSTER"
    fi
}
trap cleanup EXIT

if "$PSQL" -d postgres -Atqc 'select 1' >/dev/null 2>&1 && [ -z "${HUB_FORCE_TEMP:-}" ]; then
    log "Usando servidor existente (${PGHOST:-socket por defecto}:${PGPORT:-5432})"
else
    start_temp_cluster
fi
log "Versión: $("$PSQL" -d postgres -Atqc 'show server_version')"

# ---------------------------------------------------------------------
# 2. Carga del esquema
# ---------------------------------------------------------------------
"$PSQL" -q -d postgres -c "CREATE DATABASE $DB" >/dev/null || { log "No se pudo crear la base"; exit 2; }
log ""
log "== Carga de schema.sql"
if out="$("$PSQL" -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$SCHEMA" 2>&1)" && [ -z "$out" ]; then
    ok "schema.sql carga sin errores ni avisos"
else
    bad "schema.sql no carga limpio" "$out"; log ""; log "RESULTADO: FALLA"; exit 1
fi

TABLES=$("$PSQL" -X -d "$DB" -Atqc "select count(*) from pg_tables where schemaname='public'")
NOCOMMENT=$("$PSQL" -X -d "$DB" -Atqc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and obj_description(c.oid,'pg_class') is null")
NOORG=$("$PSQL" -X -d "$DB" -Atqc "select string_agg(tablename, ',') from pg_tables t where schemaname='public' and tablename not in ('organizations','permissions') and not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=t.tablename and c.column_name='organization_id')")
log "  Tablas creadas: $TABLES"
[ "$NOCOMMENT" = "0" ] && ok "todas las tablas tienen COMMENT ON TABLE" || bad "$NOCOMMENT tablas sin comentario"
[ -z "$NOORG" ] && ok "toda tabla de negocio tiene organization_id" || bad "tablas sin organization_id: $NOORG"

# ---------------------------------------------------------------------
# 3. Utilidades de prueba
# ---------------------------------------------------------------------
# Ejecuta SQL como el rol de la aplicación (hub_app) salvo que AS_OWNER=1.
run_sql() {
    local prefix="SET ROLE hub_app;"
    [ "${AS_OWNER:-0}" = "1" ] && prefix=""
    "$PSQL" -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -d "$DB" -At -c "\\set VERBOSITY verbose" -c "$prefix $1" 2>&1
}
expect_ok() {    # $1 descripción, $2 sql
    local out; if out="$(run_sql "$2")"; then ok "$1"; else bad "$1" "$out"; fi
}
expect_fail() {  # $1 descripción, $2 SQLSTATE o texto esperado, $3 sql
    local out; if out="$(run_sql "$3")"; then bad "$1 (se esperaba error $2 y no lo hubo)"
    elif grep -q "$2" <<<"$out"; then ok "$1 -> rechazado ($2)"
    else bad "$1 (error distinto al esperado $2)" "$(head -2 <<<"$out")"; fi
}
q() { run_sql "$1" | tail -1; }

ORG=00000000-0000-0000-0000-0000000000a1
ORG2=00000000-0000-0000-0000-0000000000a2

# ---------------------------------------------------------------------
# 4. Datos base: organización, marca, cliente, servicio, factura
# ---------------------------------------------------------------------
log ""
log "== Alta de datos mínimos (como hub_app)"
expect_ok "insertar organización" "
INSERT INTO organizations (id, name, slug) VALUES ('$ORG','Empresa Demo SAC','demo'), ('$ORG2','Otra Empresa','otra');"

expect_ok "insertar usuario, entidad emisora, marca y serie F001" "
INSERT INTO users (id, organization_id, type, name, email) VALUES
  ('00000000-0000-0000-0000-0000000000b1','$ORG','staff','Ana Finanzas','ana@demo.test');
INSERT INTO legal_entities (id, organization_id, legal_name, tax_id) VALUES
  ('00000000-0000-0000-0000-0000000000c1','$ORG','Empresa Demo SAC','20100000001');
INSERT INTO brands (id, organization_id, code, name, default_legal_entity_id) VALUES
  ('00000000-0000-0000-0000-0000000000d1','$ORG','marca1','Marca Uno','00000000-0000-0000-0000-0000000000c1');
INSERT INTO document_series (id, organization_id, legal_entity_id, document_type, series) VALUES
  ('00000000-0000-0000-0000-0000000000e1','$ORG','00000000-0000-0000-0000-0000000000c1','invoice','F001');
INSERT INTO code_sequences (organization_id, entity, prefix) VALUES ('$ORG','customer','CLI');"

expect_ok "insertar cliente con correlativo CLI-000001 y contacto de facturación" "
INSERT INTO customers (id, organization_id, code, type, legal_name, normalized_name, tax_id_type, tax_id, country, currency, origin_brand_id)
VALUES ('00000000-0000-0000-0000-0000000000f1','$ORG', hub_next_code('$ORG','customer'), 'company',
        'Turismo Andino SAC','turismo andino','ruc','20600000002','PE','PEN','00000000-0000-0000-0000-0000000000d1');
INSERT INTO contacts (organization_id, customer_id, name, email, roles)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000f1','Luis Pagos','pagos@turismo.test','{billing,administrative}');"
[ "$(q "select code from customers where id='00000000-0000-0000-0000-0000000000f1'")" = "CLI-000001" ] \
    && ok "correlativo legible generado: CLI-000001" || bad "correlativo legible incorrecto"

expect_ok "insertar catálogo, servicio activo, suscripción y recurso enlazado" "
INSERT INTO product_categories (id, organization_id, code, name) VALUES ('00000000-0000-0000-0000-000000000101','$ORG','hosting','Hosting');
INSERT INTO products (id, organization_id, code, category_id, name, billing_type)
  VALUES ('00000000-0000-0000-0000-000000000102','$ORG','HOST-PLUS','00000000-0000-0000-0000-000000000101','Hosting Plus','recurring');
INSERT INTO plans (id, organization_id, product_id, code, name, cycle)
  VALUES ('00000000-0000-0000-0000-000000000103','$ORG','00000000-0000-0000-0000-000000000102','HOST-PLUS-A','Hosting Plus anual','annual');
INSERT INTO plan_prices (organization_id, plan_id, currency, price_minor, effective_from)
  VALUES ('$ORG','00000000-0000-0000-0000-000000000103','PEN',36000,'2026-01-01');
INSERT INTO services (id, organization_id, code, customer_id, brand_id, product_id, plan_id, label, status, activated_at, commercial_due_date)
  VALUES ('00000000-0000-0000-0000-000000000104','$ORG','SRV-000001','00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000103',
          'Hosting turismoandino.test','active', now(), '2027-01-15');
INSERT INTO subscriptions (organization_id, service_id, cycle, price_minor, currency, next_invoice_date, starts_on)
  VALUES ('$ORG','00000000-0000-0000-0000-000000000104','annual',36000,'PEN','2026-12-16','2026-01-15');
INSERT INTO resources (id, organization_id, type, name) VALUES ('00000000-0000-0000-0000-000000000105','$ORG','hosting_account','cpanel turismo');
INSERT INTO service_resources (organization_id, service_id, resource_id)
  VALUES ('$ORG','00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000105');"

expect_ok "crear factura en borrador y emitirla tomando número con bloqueo de la serie" "
BEGIN;
INSERT INTO invoices (id, organization_id, legal_entity_id, brand_id, customer_id, type, currency,
                      subtotal_minor, tax_minor, total_minor, balance_minor)
VALUES ('00000000-0000-0000-0000-000000000201','$ORG','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000f1','invoice','PEN', 36000, 6480, 42480, 42480);
INSERT INTO invoice_items (organization_id, invoice_id, kind, service_id, description, unit_price_minor, subtotal_minor, tax_minor, total_minor, currency)
VALUES ('$ORG','00000000-0000-0000-0000-000000000201','service','00000000-0000-0000-0000-000000000104','Hosting Plus anual',36000,36000,6480,42480,'PEN');
UPDATE invoices SET status='issued', document_series_id='00000000-0000-0000-0000-0000000000e1', series='F001',
       number = hub_take_document_number('00000000-0000-0000-0000-0000000000e1'),
       issue_date=current_date, due_date=current_date + 15, issued_at=now()
 WHERE id='00000000-0000-0000-0000-000000000201';
COMMIT;"
[ "$(q "select series||'-'||number from invoices where id='00000000-0000-0000-0000-000000000201'")" = "F001-1" ] \
    && ok "factura emitida como F001-1" || bad "numeración de la primera factura incorrecta"

# ---------------------------------------------------------------------
# 5. Reglas del esquema
# ---------------------------------------------------------------------
log ""
log "== Unicidad de numeración de comprobantes"
expect_fail "segunda factura con el mismo (organización, entidad, serie, número)" "23505" "
INSERT INTO invoices (organization_id, legal_entity_id, brand_id, customer_id, type, status, currency, series, number, issue_date, issued_at)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f1',
        'invoice','issued','PEN','F001',1,current_date,now());"
expect_fail "factura emitida sin número" "23514" "
INSERT INTO invoices (organization_id, legal_entity_id, brand_id, customer_id, type, status, currency, issue_date, issued_at)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f1',
        'invoice','issued','PEN',current_date,now());"
expect_fail "UPDATE que repite el número en otra factura" "23505" "
INSERT INTO invoices (id, organization_id, legal_entity_id, brand_id, customer_id, type, currency)
VALUES ('00000000-0000-0000-0000-000000000202','$ORG','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f1','invoice','PEN');
UPDATE invoices SET status='issued', series='F001', number=1, issue_date=current_date, issued_at=now() WHERE id='00000000-0000-0000-0000-000000000202';"

# Emisión concurrente: 2 sesiones x 100 facturas sobre la misma serie.
emit_batch() {
    run_sql "
DO \$\$
DECLARE i int; inv uuid;
BEGIN
  FOR i IN 1..100 LOOP
    INSERT INTO invoices (organization_id, legal_entity_id, brand_id, customer_id, type, currency)
    VALUES ('$ORG','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f1','invoice','PEN')
    RETURNING id INTO inv;
    UPDATE invoices SET status='issued', series='F001', issue_date=current_date, issued_at=now(),
           number = hub_take_document_number('00000000-0000-0000-0000-0000000000e1')
     WHERE id = inv;
  END LOOP;
END \$\$;" >/dev/null 2>"$1"
}
E1="$(mktemp)"; E2="$(mktemp)"
emit_batch "$E1" & P1=$!; emit_batch "$E2" & P2=$!
wait $P1; R1=$?; wait $P2; R2=$?
CNT=$(q "select count(*)||'/'||count(distinct number)||'/'||max(number) from invoices where series='F001' and status='issued'")
if [ $R1 -eq 0 ] && [ $R2 -eq 0 ] && [ "$CNT" = "201/201/201" ]; then
    ok "emisión concurrente (2 sesiones x 100): 201 facturas, 201 números distintos, sin huecos"
else
    bad "emisión concurrente: total/distintos/máximo = $CNT" "$(cat "$E1" "$E2" | head -3)"
fi
rm -f "$E1" "$E2"

log ""
log "== Tablas solo de inserción y auditoría encadenada"
expect_ok "insertar 3 eventos de auditoría" "
INSERT INTO audit_events (organization_id, actor_type, actor_id, action, entity_type, entity_id, after) VALUES
 ('$ORG','user','00000000-0000-0000-0000-0000000000b1','customer.created','customer','00000000-0000-0000-0000-0000000000f1','{\"code\":\"CLI-000001\"}'),
 ('$ORG','user','00000000-0000-0000-0000-0000000000b1','invoice.issued','invoice','00000000-0000-0000-0000-000000000201','{\"number\":\"F001-1\"}'),
 ('$ORG','system',NULL,'service.suspended','service','00000000-0000-0000-0000-000000000104','{\"status\":\"suspended\"}');
INSERT INTO audit_events (organization_id, actor_type, action, entity_type) VALUES ('$ORG2','system','org.created','organization');"
[ "$(q "select string_agg(chain_seq::text, ',' order by chain_seq) from audit_events where organization_id='$ORG'")" = "1,2,3" ] \
    && ok "cadena por organización: chain_seq 1,2,3 (otra organización empieza su propia cadena)" || bad "chain_seq incorrecto"
[ "$(q "select count(*) from audit_events a join audit_events b on b.organization_id=a.organization_id and b.chain_seq=a.chain_seq+1 where b.prev_hash = a.hash and a.organization_id='$ORG'")" = "2" ] \
    && ok "cada evento guarda el hash del anterior (prev_hash)" || bad "prev_hash no encadena"
[ "$(q "select coalesce(hub_audit_verify('$ORG')::text,'integra')")" = "integra" ] \
    && ok "hub_audit_verify: cadena íntegra" || bad "hub_audit_verify reporta rotura en cadena sana"

expect_fail "UPDATE en audit_events como hub_app" "42501" "UPDATE audit_events SET action='x' WHERE organization_id='$ORG';"
expect_fail "DELETE en audit_events como hub_app" "42501" "DELETE FROM audit_events WHERE organization_id='$ORG';"
AS_OWNER=1 expect_fail "UPDATE en audit_events como dueño del esquema (trigger)" "solo de inserción" "UPDATE audit_events SET action='x' WHERE organization_id='$ORG';"
AS_OWNER=1 expect_fail "TRUNCATE de audit_events como dueño (trigger)" "solo de inserción" "TRUNCATE audit_events;"
for t in secret_access_logs setting_changes notification_deliveries webhook_events; do
    expect_fail "DELETE en $t como hub_app" "42501" "DELETE FROM $t;"
done
# Manipulación: un superusuario desactiva el trigger y altera un evento -> la verificación lo detecta.
AS_OWNER=1 run_sql "ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_mutation;
UPDATE audit_events SET after='{\"number\":\"F001-999\"}' WHERE organization_id='$ORG' AND chain_seq=2;
ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_mutation;" >/dev/null
[ "$(q "select hub_audit_verify('$ORG')")" = "2" ] \
    && ok "manipulación simulada del evento 2 detectada por hub_audit_verify" || bad "la manipulación no fue detectada"

log ""
log "== Idempotencia y deduplicación"
expect_ok "registrar medio PayPal y un pago con external_id" "
INSERT INTO payment_methods (id, organization_id, code, name, kind, fee_percent, fee_fixed_minor, fee_currency, pass_to_customer)
VALUES ('00000000-0000-0000-0000-000000000301','$ORG','paypal','PayPal','paypal',5.4,30,'USD',true);
INSERT INTO payments (organization_id, customer_id, payment_method_id, amount_minor, currency, external_id, reported_via, status, validated_at)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000301',42480,'USD','CAPTURE-123','webhook','validated',now());"
expect_fail "mismo cobro de PayPal registrado dos veces" "23505" "
INSERT INTO payments (organization_id, customer_id, payment_method_id, amount_minor, currency, external_id, reported_via)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000301',42480,'USD','CAPTURE-123','webhook');"
expect_fail "voucher validado sin quién lo validó" "23514" "
INSERT INTO payments (organization_id, customer_id, payment_method_id, amount_minor, currency, reported_via, status, validated_at)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000301',100,'PEN','portal','validated',now());"
expect_ok "registrar webhook de PayPal" "
INSERT INTO webhook_events (organization_id, provider, external_event_id, event_type, signature_valid, payload)
VALUES ('$ORG','paypal','WH-EVT-1','PAYMENT.CAPTURE.COMPLETED',true,'{}');"
expect_fail "mismo webhook recibido otra vez" "23505" "
INSERT INTO webhook_events (organization_id, provider, external_event_id, event_type, signature_valid, payload)
VALUES ('$ORG','paypal','WH-EVT-1','PAYMENT.CAPTURE.COMPLETED',true,'{}');"
log ""
log "== Pago con tarjeta (pasarela local)"
expect_ok "registrar medio de tarjeta, intento aprobado y pago validado por webhook" "
INSERT INTO payment_methods (id, organization_id, code, name, kind, fee_percent, fee_fixed_minor, fee_currency, pass_to_customer, requires_proof)
VALUES ('00000000-0000-0000-0000-000000000311','$ORG','card','Tarjeta','card_gateway',3.5,50,'PEN',true,false);
INSERT INTO payments (id, organization_id, customer_id, payment_method_id, amount_minor, currency, external_id, reported_via, status, validated_at)
VALUES ('00000000-0000-0000-0000-000000000312','$ORG','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000311',12218,'PEN','TX-900','webhook','validated',now());
INSERT INTO payment_checkouts (organization_id, customer_id, payment_method_id, invoice_ids, amount_minor, surcharge_minor, currency, status, external_session_id, external_transaction_id, payment_id, expires_at, completed_at)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000311',ARRAY[gen_random_uuid()],12218,418,'PEN','approved','SES-1','TX-900','00000000-0000-0000-0000-000000000312',now()+interval '30 minutes',now());
INSERT INTO webhook_events (organization_id, provider, external_event_id, event_type, signature_valid, payload)
VALUES ('$ORG','card_gateway','CG-EVT-1','payment.approved',true,'{}');"
expect_fail "mismo webhook de la pasarela de tarjetas recibido otra vez" "23505" "
INSERT INTO webhook_events (organization_id, provider, external_event_id, event_type, signature_valid, payload)
VALUES ('$ORG','card_gateway','CG-EVT-1','payment.approved',true,'{}');"
expect_fail "intento de pago aprobado sin pago enlazado" "23514" "
INSERT INTO payment_checkouts (organization_id, customer_id, payment_method_id, invoice_ids, amount_minor, currency, status, external_session_id, expires_at)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000311',ARRAY[gen_random_uuid()],100,'PEN','approved','SES-2',now());"
expect_fail "reembolso en proceso sin autorización registrada" "23514" "
INSERT INTO payment_refunds (organization_id, payment_id, amount_minor, currency, status, reason)
VALUES ('$ORG','00000000-0000-0000-0000-000000000312',5000,'PEN','processing','Devolución parcial');"
expect_fail "mismo contracargo registrado dos veces" "23505" "
INSERT INTO payment_disputes (organization_id, payment_id, customer_id, external_id, amount_minor, currency, reported_via, opened_at)
VALUES ('$ORG','00000000-0000-0000-0000-000000000312','00000000-0000-0000-0000-0000000000f1','CB-1',12218,'PEN','webhook',now()),
       ('$ORG','00000000-0000-0000-0000-000000000312','00000000-0000-0000-0000-0000000000f1','CB-1',12218,'PEN','webhook',now());"
expect_fail "línea de liquidación con neto distinto de bruto menos comisión" "23514" "
INSERT INTO payment_settlement_lines (organization_id, payment_method_id, settlement_date, transaction_type, external_id, gross_minor, fee_minor, net_minor, currency)
VALUES ('$ORG','00000000-0000-0000-0000-000000000311','2026-10-01','charge','TX-900',12218,478,12000,'PEN');"

expect_ok "registrar aviso con dedupe_key" "
INSERT INTO notification_deliveries (organization_id, dedupe_key, event, channel, recipient_address)
VALUES ('$ORG','renewal_notice:pagos@turismo.test:invoice:201:D-30','renewal_notice','email','pagos@turismo.test');"
expect_fail "mismo aviso dos veces (dedupe_key)" "23505" "
INSERT INTO notification_deliveries (organization_id, dedupe_key, event, channel, recipient_address)
VALUES ('$ORG','renewal_notice:pagos@turismo.test:invoice:201:D-30','renewal_notice','email','pagos@turismo.test');"
expect_fail "segunda clave de idempotencia igual en el mismo alcance" "23505" "
INSERT INTO idempotency_keys (organization_id, key, scope, request_hash, expires_at)
VALUES ('$ORG','k1','POST /admin/payments',repeat('a',64),now()+interval '1 day'),
       ('$ORG','k1','POST /admin/payments',repeat('b',64),now()+interval '1 day');"

log ""
log "== Otras reglas de negocio"
expect_fail "importe en moneda no admitida (EUR)" "23514" "
INSERT INTO subscriptions (organization_id, service_id, cycle, price_minor, currency, next_invoice_date, starts_on, status)
VALUES ('$ORG','00000000-0000-0000-0000-000000000104','annual',100,'EUR','2027-01-01','2026-01-01','paused');"
expect_fail "estado de servicio fuera del contrato" "23514" "
UPDATE services SET status='deleted' WHERE id='00000000-0000-0000-0000-000000000104';"
expect_fail "segunda suscripción activa para el mismo servicio" "23505" "
INSERT INTO subscriptions (organization_id, service_id, cycle, price_minor, currency, next_invoice_date, starts_on)
VALUES ('$ORG','00000000-0000-0000-0000-000000000104','annual',100,'PEN','2027-01-01','2026-01-01');"
expect_fail "nota de crédito sin documento de referencia" "23514" "
INSERT INTO invoices (organization_id, legal_entity_id, brand_id, customer_id, type, currency)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f1','credit_note','PEN');"
expect_fail "factura de exportación con IGV" "23514" "
INSERT INTO invoices (organization_id, legal_entity_id, brand_id, customer_id, type, currency, tax_treatment, subtotal_minor, tax_minor, total_minor)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f1','invoice','USD','export',100,18,118);"
expect_fail "cuenta cloud del cliente sin autorización adjunta" "23514" "
INSERT INTO providers (id, organization_id, code, name, type) VALUES ('00000000-0000-0000-0000-000000000401','$ORG','aws','AWS','cloud');
INSERT INTO provider_accounts (id, organization_id, provider_id, label, owner, customer_id)
VALUES ('00000000-0000-0000-0000-000000000402','$ORG','00000000-0000-0000-0000-000000000401','AWS cliente','customer','00000000-0000-0000-0000-0000000000f1');
INSERT INTO cloud_accounts (organization_id, provider_account_id, platform, external_account_id, owner, modality, customer_id)
VALUES ('$ORG','00000000-0000-0000-0000-000000000402','aws','123456789012','customer','managed_customer_account','00000000-0000-0000-0000-0000000000f1');"
expect_fail "settings: ajuste global repetido" "23505" "
INSERT INTO settings (organization_id, key, scope_type, value) VALUES
 ('$ORG','services.suspend_after_days','global','1'), ('$ORG','services.suspend_after_days','global','2');"
expect_ok "settings: el mismo ajuste por cliente sobrescribe al global" "
INSERT INTO settings (organization_id, key, scope_type, value) VALUES ('$ORG','services.suspend_after_days','global','1');
INSERT INTO settings (organization_id, key, scope_type, scope_id, value) VALUES ('$ORG','services.suspend_after_days','customer','00000000-0000-0000-0000-0000000000f1','3');"
[ "$(q "select count(*) from services s where s.status='active' and not exists (select 1 from subscriptions x where x.service_id=s.id and x.status='active')")" = "0" ] \
    && ok "consulta de detección 'servicio activo sin suscripción' funciona (0 casos)" || bad "detección de servicios sin facturar"
[ "$(q "select count(*) from resources r where not exists (select 1 from service_resources sr where sr.resource_id=r.id)")" = "0" ] \
    && ok "consulta de detección 'recurso sin cliente' funciona (0 casos)" || bad "detección de recursos sin cliente"

log ""
log "== Sitios WordPress conectados (WebConnector)"
expect_ok "sitio WordPress de la marca activo con secreto de firma en la bóveda, token de solo lectura y aviso de invalidación entregado" "
INSERT INTO secrets (id, organization_id, kind, name, owner_type, owner_id, ciphertext, nonce, key_version)
VALUES ('00000000-0000-0000-0000-000000000500','$ORG','api_token','Firma webhook Marca Uno','wp_site','00000000-0000-0000-0000-000000000501','\x00','\x00',1);
INSERT INTO wp_sites (id, organization_id, brand_id, name, base_url, network_site_id, status, webhook_url, webhook_secret_id, allowed_origins)
VALUES ('00000000-0000-0000-0000-000000000501','$ORG','00000000-0000-0000-0000-0000000000d1','Marca Uno','https://www.marcauno.test',2,'active',
        'https://www.marcauno.test/wp-json/hub-connector/v1/invalidate','00000000-0000-0000-0000-000000000500','{https://www.marcauno.test}');
INSERT INTO wp_site_tokens (id, organization_id, wp_site_id, name, token_hash, token_last_four, expires_at)
VALUES ('00000000-0000-0000-0000-000000000502','$ORG','00000000-0000-0000-0000-000000000501','Producción',repeat('1',64),'a1b2',now()+interval '365 days');
INSERT INTO wp_cache_invalidations (organization_id, wp_site_id, event_id, scope, keys, trigger_event, status, attempts, delivered_at, response_status)
VALUES ('$ORG','00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000503','plan','{HOST-PLUS-A}','PlanPriceChanged','delivered',1,now(),204);"
expect_fail "segundo sitio con la misma URL en otra organización" "23505" "
INSERT INTO legal_entities (id, organization_id, legal_name, tax_id) VALUES ('00000000-0000-0000-0000-0000000000c2','$ORG2','Otra Empresa','20100000009');
INSERT INTO brands (id, organization_id, code, name, default_legal_entity_id) VALUES ('00000000-0000-0000-0000-0000000000d2','$ORG2','otra','Otra','00000000-0000-0000-0000-0000000000c2');
INSERT INTO wp_sites (organization_id, brand_id, name, base_url) VALUES ('$ORG2','00000000-0000-0000-0000-0000000000d2','Copia','https://www.marcauno.test');"
expect_fail "sitio WordPress sin HTTPS" "23514" "
INSERT INTO wp_sites (organization_id, brand_id, name, base_url) VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','Inseguro','http://www.marcados.test');"
expect_fail "sitio activo sin ruta del plugin ni secreto de firma" "23514" "
INSERT INTO wp_sites (organization_id, brand_id, name, base_url, status) VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','Marca','https://www.marcados.test','active');"
expect_ok "revocar el token del plugin con motivo" "
UPDATE wp_site_tokens SET revoked_at=now(), revoked_by='00000000-0000-0000-0000-0000000000b1', revoke_reason='Rotación'
 WHERE id='00000000-0000-0000-0000-000000000502';"
expect_fail "reactivar un token revocado" "23514" "
UPDATE wp_site_tokens SET revoked_at=NULL, revoked_by=NULL, revoke_reason=NULL WHERE id='00000000-0000-0000-0000-000000000502';"
expect_fail "token revocado sin quién lo revocó" "23514" "
INSERT INTO wp_site_tokens (organization_id, wp_site_id, name, token_hash, token_last_four, revoked_at, revoke_reason)
VALUES ('$ORG','00000000-0000-0000-0000-000000000501','Otro',repeat('2',64),'c3d4',now(),'x');"
expect_fail "token con permiso de escritura" "23514" "
INSERT INTO wp_site_tokens (organization_id, wp_site_id, name, token_hash, token_last_four, scope)
VALUES ('$ORG','00000000-0000-0000-0000-000000000501','Escritura',repeat('3',64),'e5f6','write');"
expect_fail "el mismo aviso de invalidación dos veces al mismo sitio" "23505" "
INSERT INTO wp_cache_invalidations (organization_id, wp_site_id, event_id, scope)
VALUES ('$ORG','00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000503','catalog');"
expect_fail "aviso de invalidación fallido sin error registrado" "23514" "
INSERT INTO wp_cache_invalidations (organization_id, wp_site_id, event_id, scope, status, attempts)
VALUES ('$ORG','00000000-0000-0000-0000-000000000501',gen_random_uuid(),'contact','failed',5);"

log ""
log "== Compra en línea (carrito y checkout)"
expect_ok "carrito con hosting en venta en línea y dominio consultado; compra pagada por webhook genera un pedido" "
UPDATE products SET sellable_online = true WHERE id='00000000-0000-0000-0000-000000000102';
INSERT INTO carts (id, organization_id, brand_id, wp_site_id, token_hash, customer_id, currency, subtotal_minor, total_minor, expires_at)
VALUES ('00000000-0000-0000-0000-000000000601','$ORG','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000501',repeat('c',64),
        '00000000-0000-0000-0000-0000000000f1','PEN',40000,40000,now()+interval '30 days');
INSERT INTO cart_items (id, organization_id, cart_id, product_id, plan_id, unit_price_minor, currency)
VALUES ('00000000-0000-0000-0000-000000000602','$ORG','00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000103',36000,'PEN');
INSERT INTO cart_items (organization_id, cart_id, product_id, parent_item_id, unit_price_minor, currency, domain_name, domain_action, availability_checked_at)
VALUES ('$ORG','00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000602',4000,'PEN','turismoandino.test','register',now());
INSERT INTO checkout_sessions (id, organization_id, cart_id, customer_id, user_id, brand_id, idempotency_key, currency, total_minor, snapshot,
                               terms_accepted_at, email_verified_at, captcha_verified_at, expires_at)
VALUES ('00000000-0000-0000-0000-000000000603','$ORG','00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-0000000000f1',
        '00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','chk-1','PEN',40000,'{}',now(),now(),now(),now()+interval '2 days');
INSERT INTO payments (id, organization_id, customer_id, payment_method_id, amount_minor, currency, external_id, reported_via, status, validated_at, checkout_session_id)
VALUES ('00000000-0000-0000-0000-000000000604','$ORG','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000311',40000,'PEN','TX-901','webhook','validated',now(),'00000000-0000-0000-0000-000000000603');
UPDATE checkout_sessions SET status='paid', payment_id='00000000-0000-0000-0000-000000000604', paid_at=now() WHERE id='00000000-0000-0000-0000-000000000603';
INSERT INTO orders (id, organization_id, number, customer_id, brand_id, currency, total_minor, channel, checkout_session_id)
VALUES ('00000000-0000-0000-0000-000000000605','$ORG','PED-000901','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000d1','PEN',40000,'online','00000000-0000-0000-0000-000000000603');
UPDATE checkout_sessions SET status='completed', order_id='00000000-0000-0000-0000-000000000605', completed_at=now() WHERE id='00000000-0000-0000-0000-000000000603';
UPDATE carts SET status='converted', converted_at=now() WHERE id='00000000-0000-0000-0000-000000000601';"
expect_fail "la misma compra en línea genera un segundo pedido" "23505" "
INSERT INTO orders (organization_id, number, customer_id, brand_id, currency, channel, checkout_session_id)
VALUES ('$ORG','PED-000902','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000d1','PEN','online','00000000-0000-0000-0000-000000000603');"
expect_fail "pedido en línea sin compra en línea enlazada" "23514" "
INSERT INTO orders (organization_id, number, customer_id, brand_id, currency, channel)
VALUES ('$ORG','PED-000903','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000d1','PEN','online');"
expect_fail "segunda compra en curso sobre el mismo carrito" "23505" "
INSERT INTO carts (id, organization_id, brand_id, token_hash, customer_id, currency, expires_at)
VALUES ('00000000-0000-0000-0000-000000000611','$ORG','00000000-0000-0000-0000-0000000000d1',repeat('d',64),'00000000-0000-0000-0000-0000000000f1','PEN',now()+interval '30 days');
INSERT INTO checkout_sessions (organization_id, cart_id, customer_id, user_id, brand_id, idempotency_key, currency, total_minor, snapshot, terms_accepted_at, captcha_verified_at, expires_at)
VALUES ('$ORG','00000000-0000-0000-0000-000000000611','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','chk-2','PEN',100,'{}',now(),now(),now()+interval '1 day'),
       ('$ORG','00000000-0000-0000-0000-000000000611','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','chk-3','PEN',100,'{}',now(),now(),now()+interval '1 day');"
expect_fail "compra en línea que pasa a pago sin correo verificado" "23514" "
INSERT INTO checkout_sessions (organization_id, cart_id, customer_id, user_id, brand_id, idempotency_key, status, currency, total_minor, snapshot, terms_accepted_at, captcha_verified_at, expires_at)
VALUES ('$ORG','00000000-0000-0000-0000-000000000611','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','chk-4','awaiting_payment','PEN',100,'{}',now(),now(),now()+interval '1 day');"
expect_fail "compra en línea sin aceptación de términos" "23502" "
INSERT INTO checkout_sessions (organization_id, cart_id, customer_id, user_id, brand_id, idempotency_key, currency, total_minor, snapshot, captcha_verified_at, expires_at)
VALUES ('$ORG','00000000-0000-0000-0000-000000000611','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','chk-5','PEN',100,'{}',now(),now()+interval '1 day');"
expect_fail "dominio a registrar sin consulta de disponibilidad" "23514" "
INSERT INTO cart_items (organization_id, cart_id, product_id, unit_price_minor, currency, domain_name, domain_action)
VALUES ('$ORG','00000000-0000-0000-0000-000000000611','00000000-0000-0000-0000-000000000102',4000,'PEN','nuevo.test','register');"
expect_fail "intento de pago con tarjeta para facturas y compra en línea a la vez" "23514" "
INSERT INTO payment_checkouts (organization_id, customer_id, payment_method_id, invoice_ids, checkout_session_id, amount_minor, currency, external_session_id, expires_at)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000311',ARRAY[gen_random_uuid()],'00000000-0000-0000-0000-000000000603',100,'PEN','SES-9',now());"

log ""
log "== Asistente con IA"
expect_ok "perfil del asistente por marca, conversación en la web y mensajes registrados" "
INSERT INTO ai_assistant_profiles (id, organization_id, brand_id, channel, display_name, enabled_tools, is_active)
VALUES ('00000000-0000-0000-0000-000000000701','$ORG','00000000-0000-0000-0000-0000000000d1','website','Asistente automático','{recommend_plan,check_domain,create_lead,handoff}',true);
INSERT INTO ai_conversations (id, organization_id, ai_assistant_profile_id, brand_id, channel, wp_site_id, visitor_token_hash, model)
VALUES ('00000000-0000-0000-0000-000000000702','$ORG','00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-0000000000d1','website',
        '00000000-0000-0000-0000-000000000501',repeat('e',64),'modelo-de-prueba');
INSERT INTO ai_messages (organization_id, ai_conversation_id, role, content, tool_name, tool_input) VALUES
 ('$ORG','00000000-0000-0000-0000-000000000702','user','Necesito hosting para mi web',NULL,NULL),
 ('$ORG','00000000-0000-0000-0000-000000000702','tool','Planes recomendados','recommend_plan','{\"need\":\"web\"}'),
 ('$ORG','00000000-0000-0000-0000-000000000702','assistant','Soy un asistente automático; te recomiendo Hosting Plus.',NULL,NULL);"
expect_fail "perfil del asistente en la web que lee servicios de clientes" "23514" "
INSERT INTO ai_assistant_profiles (organization_id, brand_id, channel, display_name, knowledge_sources)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','website','Otro','{kb_articles,customer_services}');"
expect_fail "asistente que lee páginas de un CMS que ya no existe" "23514" "
INSERT INTO ai_assistant_profiles (organization_id, brand_id, channel, display_name, knowledge_sources)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','portal','Otro','{kb_articles,cms_pages}');"
expect_fail "herramienta del asistente fuera de la lista permitida" "23514" "
INSERT INTO ai_assistant_profiles (organization_id, brand_id, channel, display_name, enabled_tools)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','portal','Portal','{create_ticket,suspend_service}');"
expect_fail "conversación del portal sin cliente ni usuario" "23514" "
INSERT INTO ai_conversations (organization_id, ai_assistant_profile_id, brand_id, channel, model)
VALUES ('$ORG','00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-0000000000d1','portal','modelo-de-prueba');"
expect_fail "mensaje de herramienta sin nombre de herramienta" "23514" "
INSERT INTO ai_messages (organization_id, ai_conversation_id, role, content) VALUES ('$ORG','00000000-0000-0000-0000-000000000702','tool','x');"
expect_fail "UPDATE en ai_messages como hub_app" "42501" "UPDATE ai_messages SET content='otro' WHERE organization_id='$ORG';"
AS_OWNER=1 expect_fail "DELETE en ai_messages como dueño del esquema (trigger)" "solo de inserción" "DELETE FROM ai_messages WHERE organization_id='$ORG';"
expect_fail "consumo mensual repetido para la misma marca y mes" "23505" "
INSERT INTO ai_usage (organization_id, brand_id, period_month) VALUES
 ('$ORG','00000000-0000-0000-0000-0000000000d1','2026-10-01'), ('$ORG','00000000-0000-0000-0000-0000000000d1','2026-10-01');"
expect_fail "consumo mensual con periodo que no es el primer día del mes" "23514" "
INSERT INTO ai_usage (organization_id, brand_id, period_month) VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','2026-10-15');"

log ""
log "== Respaldos, restauraciones y plan de recuperación"
expect_ok "herramienta de respaldos del nodo, respaldo leído y solicitud de restauración desde el portal con ticket" "
INSERT INTO resources (id, organization_id, type, name) VALUES ('00000000-0000-0000-0000-000000000801','$ORG','hosting_node','nodo 1');
INSERT INTO hosting_nodes (id, organization_id, resource_id, kind, hostname)
VALUES ('00000000-0000-0000-0000-000000000802','$ORG','00000000-0000-0000-0000-000000000801','reseller','nodo1.test');
INSERT INTO backup_tool_accounts (id, organization_id, hosting_node_id, tool)
VALUES ('00000000-0000-0000-0000-000000000803','$ORG','00000000-0000-0000-0000-000000000802','jetbackup');
INSERT INTO backup_policies (id, organization_id, resource_id, service_id, name, frequency, retention_days)
VALUES ('00000000-0000-0000-0000-000000000804','$ORG','00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000104','Diario cPanel','daily',14);
INSERT INTO backup_runs (id, organization_id, backup_policy_id, status, started_at, finished_at, backup_tool_account_id, external_id)
VALUES ('00000000-0000-0000-0000-000000000805','$ORG','00000000-0000-0000-0000-000000000804','succeeded',now()-interval '1 day',now()-interval '23 hours',
        '00000000-0000-0000-0000-000000000803','JB-1');
INSERT INTO tickets (id, organization_id, number, customer_id, brand_id, channel, subject)
VALUES ('00000000-0000-0000-0000-000000000806','$ORG','TKT-000901','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000d1','portal','Restaurar buzón');
INSERT INTO restore_requests (id, organization_id, code, customer_id, service_id, target_kind, target_name, restore_point_at, backup_run_id,
                              requested_via, requested_by, overwrite_confirmed, ticket_id)
VALUES ('00000000-0000-0000-0000-000000000807','$ORG','RST-000001','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000104',
        'mailbox','ventas@turismoandino.test',now()-interval '1 day','00000000-0000-0000-0000-000000000805','portal','00000000-0000-0000-0000-0000000000b1',true,
        '00000000-0000-0000-0000-000000000806');"
expect_fail "mismo respaldo leído dos veces de la herramienta (id externo)" "23505" "
INSERT INTO backup_runs (organization_id, backup_policy_id, status, started_at, backup_tool_account_id, external_id)
VALUES ('$ORG','00000000-0000-0000-0000-000000000804','succeeded',now(),'00000000-0000-0000-0000-000000000803','JB-1');"
expect_fail "segunda restauración abierta del mismo buzón" "23505" "
INSERT INTO restore_requests (organization_id, code, customer_id, service_id, target_kind, target_name, restore_point_at, requested_via, requested_by, overwrite_confirmed, ticket_id)
VALUES ('$ORG','RST-000002','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000104','mailbox','ventas@turismoandino.test',now(),'portal',
        '00000000-0000-0000-0000-0000000000b1',true,'00000000-0000-0000-0000-000000000806');"
expect_fail "restauración sin confirmar que se sobrescribe lo actual" "23514" "
INSERT INTO restore_requests (organization_id, code, customer_id, service_id, target_kind, target_name, restore_point_at, requested_via, requested_by, ticket_id)
VALUES ('$ORG','RST-000003','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000104','website','public_html',now(),'portal',
        '00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000806');"
expect_fail "restauración aprobada sin quién la aprobó" "23514" "
UPDATE restore_requests SET status='approved' WHERE id='00000000-0000-0000-0000-000000000807';"
expect_fail "restauración completada sin evidencia" "23514" "
UPDATE restore_requests SET status='completed', approved_by='00000000-0000-0000-0000-0000000000b1', approved_at=now(),
       execution_mode='api', started_at=now(), completed_at=now() WHERE id='00000000-0000-0000-0000-000000000807';"
expect_fail "prueba del plan de recuperación aprobada que excede el tiempo de recuperación objetivo" "23514" "
INSERT INTO files (id, organization_id, path, original_name, mime_type, size_bytes)
VALUES ('00000000-0000-0000-0000-000000000901','$ORG','org/dr/evidencia.pdf','evidencia.pdf','application/pdf',1024);
INSERT INTO dr_tests (organization_id, tested_at, performed_by, procedure_version, target_environment, backup_object_key, backup_taken_at,
                      restore_started_at, restore_completed_at, data_loss_minutes, recovery_minutes, rpo_target_minutes, rto_target_minutes, result, evidence_file_id)
VALUES ('$ORG',now(),'00000000-0000-0000-0000-0000000000b1','v1','vps-aislado','backups/2026-10-07.dump',now()-interval '6 hours',
        now()-interval '5 hours',now(),60,300,1440,240,'passed','00000000-0000-0000-0000-000000000901');"
expect_ok "prueba del plan de recuperación aprobada dentro de los objetivos y con evidencia" "
INSERT INTO files (id, organization_id, path, original_name, mime_type, size_bytes)
VALUES ('00000000-0000-0000-0000-000000000902','$ORG','org/dr/evidencia-2.pdf','evidencia-2.pdf','application/pdf',1024);
INSERT INTO dr_tests (organization_id, tested_at, performed_by, procedure_version, target_environment, backup_object_key, backup_taken_at,
                      restore_started_at, restore_completed_at, data_loss_minutes, recovery_minutes, rpo_target_minutes, rto_target_minutes, result, evidence_file_id)
VALUES ('$ORG',now(),'00000000-0000-0000-0000-0000000000b1','v1','vps-aislado','backups/2026-10-07.dump',now()-interval '6 hours',
        now()-interval '2 hours',now(),60,120,1440,240,'passed','00000000-0000-0000-0000-000000000902');"

log ""
log "== Apariencia del portal, el panel y los correos (temas por marca)"
expect_ok "tema de la marca con una versión publicada con contraste verificado y un borrador nuevo" "
INSERT INTO brand_themes (id, organization_id, brand_id, name) VALUES ('00000000-0000-0000-0000-000000000a01','$ORG','00000000-0000-0000-0000-0000000000d1','Tema Marca Uno');
INSERT INTO brand_theme_versions (id, organization_id, brand_theme_id, brand_id, version_number, tokens, surfaces, status,
                                  contrast_min_ratio, contrast_lowest_ratio, contrast_checked_at, published_at, published_by)
VALUES ('00000000-0000-0000-0000-000000000a02','$ORG','00000000-0000-0000-0000-000000000a01','00000000-0000-0000-0000-0000000000d1',1,
        '{\"color\":{\"primary\":\"#0B5FFF\",\"secondary\":\"#1F2937\",\"accent\":\"#F59E0B\"},\"radius\":\"8px\"}','{portal,admin,email}','published',
        4.5,5.1,now(),now(),'00000000-0000-0000-0000-0000000000b1');
UPDATE brand_themes SET published_version_id='00000000-0000-0000-0000-000000000a02', published_at=now() WHERE id='00000000-0000-0000-0000-000000000a01';
INSERT INTO brand_theme_versions (organization_id, brand_theme_id, brand_id, version_number, tokens)
VALUES ('$ORG','00000000-0000-0000-0000-000000000a01','00000000-0000-0000-0000-0000000000d1',2,'{\"color\":{\"primary\":\"#FFFF00\"}}');"
expect_fail "segundo tema para la misma marca" "23505" "
INSERT INTO brand_themes (organization_id, brand_id, name) VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','Otro tema');"
expect_fail "segunda versión publicada a la vez para la misma marca (un solo tema publicado por marca)" "23505" "
UPDATE brand_theme_versions SET status='published', contrast_min_ratio=4.5, contrast_lowest_ratio=4.8, contrast_checked_at=now(),
       published_at=now(), published_by='00000000-0000-0000-0000-0000000000b1'
 WHERE brand_theme_id='00000000-0000-0000-0000-000000000a01' AND version_number=2;"
expect_fail "publicar una versión sin verificar el contraste" "23514" "
UPDATE brand_theme_versions SET status='published', published_at=now(), published_by='00000000-0000-0000-0000-0000000000b1'
 WHERE brand_theme_id='00000000-0000-0000-0000-000000000a01' AND version_number=2;"
expect_fail "publicar una versión con contraste por debajo del mínimo" "23514" "
UPDATE brand_theme_versions SET status='archived', archived_at=now() WHERE id='00000000-0000-0000-0000-000000000a02';
UPDATE brand_theme_versions SET status='published', contrast_min_ratio=4.5, contrast_lowest_ratio=1.9, contrast_checked_at=now(),
       published_at=now(), published_by='00000000-0000-0000-0000-0000000000b1'
 WHERE brand_theme_id='00000000-0000-0000-0000-000000000a01' AND version_number=2;"
expect_fail "versión del tema para una superficie desconocida" "23514" "
INSERT INTO brand_theme_versions (organization_id, brand_theme_id, brand_id, version_number, tokens, surfaces)
VALUES ('$ORG','00000000-0000-0000-0000-000000000a01','00000000-0000-0000-0000-0000000000d1',3,'{}','{portal,kiosk}');"
expect_fail "versión del tema para la web pública (vive en WordPress)" "23514" "
INSERT INTO brand_theme_versions (organization_id, brand_theme_id, brand_id, version_number, tokens, surfaces)
VALUES ('$ORG','00000000-0000-0000-0000-000000000a01','00000000-0000-0000-0000-0000000000d1',4,'{}','{website}');"

log ""
log "== Catálogo de hosting, VPS y dominios"
expect_ok "ficha por marca, ficha técnica de hosting con paquete WHM y nodo preferido, plan VPS y extensión de dominio con precios" "
INSERT INTO product_listings (organization_id, product_id, brand_id, display_name, sellable_online, is_featured, sort_order)
VALUES ('$ORG','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-0000000000d1','{\"es\":\"Hosting Plus\",\"en\":\"Hosting Plus\"}',true,true,1);
INSERT INTO hosting_package_specs (organization_id, product_id, disk_mb, email_accounts, databases, websites, whm_package, preferred_node_id)
VALUES ('$ORG','00000000-0000-0000-0000-000000000102',10240,20,5,1,'reseller_plus','00000000-0000-0000-0000-000000000802');
INSERT INTO providers (id, organization_id, code, name, type) VALUES
 ('00000000-0000-0000-0000-000000000b01','$ORG','contabo','Contabo','server'),
 ('00000000-0000-0000-0000-000000000b02','$ORG','namecheap','Namecheap','registrar');
INSERT INTO products (id, organization_id, code, category_id, name, billing_type)
VALUES ('00000000-0000-0000-0000-000000000b03','$ORG','vps-2','00000000-0000-0000-0000-000000000101','VPS 2','recurring');
INSERT INTO vps_plan_specs (organization_id, product_id, vcpu, ram_mb, disk_gb, os_options, is_managed, provider_id, provider_plan_ref)
VALUES ('$ORG','00000000-0000-0000-0000-000000000b03',4,8192,200,'{ubuntu-24.04,almalinux-9}',true,'00000000-0000-0000-0000-000000000b01','VPS-M-SSD');
INSERT INTO domain_extensions (id, organization_id, tld, default_registrar_id, min_margin_percent, sellable_online)
VALUES ('00000000-0000-0000-0000-000000000b04','$ORG','com','00000000-0000-0000-0000-000000000b02',15,true);
INSERT INTO domain_tld_prices (organization_id, tld, provider_id, operation, cost_minor, cost_currency, price_minor, currency, effective_from, domain_extension_id)
VALUES ('$ORG','com','00000000-0000-0000-0000-000000000b02','register',1100,'USD',1800,'USD','2026-01-01','00000000-0000-0000-0000-000000000b04'),
       ('$ORG','com','00000000-0000-0000-0000-000000000b02','renew',1300,'USD',2000,'USD','2026-01-01','00000000-0000-0000-0000-000000000b04'),
       ('$ORG','com','00000000-0000-0000-0000-000000000b02','transfer',1100,'USD',1800,'USD','2026-01-01','00000000-0000-0000-0000-000000000b04');"
expect_fail "segunda ficha del mismo producto en la misma marca" "23505" "
INSERT INTO product_listings (organization_id, product_id, brand_id, display_name)
VALUES ('$ORG','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-0000000000d1','{\"es\":\"Copia\"}');"
expect_fail "paquete de hosting sin paquete de WHM" "23514" "
INSERT INTO hosting_package_specs (organization_id, product_id, whm_package) VALUES ('$ORG','00000000-0000-0000-0000-000000000b03','');"
expect_fail "plan VPS sin plan de origen del proveedor" "23514" "
INSERT INTO products (id, organization_id, code, category_id, name, billing_type)
VALUES ('00000000-0000-0000-0000-000000000b05','$ORG','vps-4','00000000-0000-0000-0000-000000000101','VPS 4','recurring');
INSERT INTO vps_plan_specs (organization_id, product_id, vcpu, ram_mb, disk_gb, provider_id, provider_plan_ref)
VALUES ('$ORG','00000000-0000-0000-0000-000000000b05',2,4096,80,'00000000-0000-0000-0000-000000000b01','');"
expect_fail "extensión de dominio repetida en el catálogo" "23505" "
INSERT INTO domain_extensions (organization_id, tld, default_registrar_id) VALUES ('$ORG','com','00000000-0000-0000-0000-000000000b02');"
expect_fail "precio por extensión con vigencia que termina antes de empezar" "23514" "
INSERT INTO domain_tld_prices (organization_id, tld, provider_id, operation, cost_minor, cost_currency, price_minor, currency, effective_from, effective_to)
VALUES ('$ORG','com','00000000-0000-0000-0000-000000000b02','renew',1300,'USD',2100,'USD','2026-06-01','2026-05-01');"

log ""
log "== Formularios, contacto por marca y documentos legales (WebConnector)"
expect_ok "formulario de contacto con destino prospecto, campos, envío derivado; contacto de la marca; términos publicados y aceptados en una compra" "
INSERT INTO lead_channels (id, organization_id, code, name, kind) VALUES ('00000000-0000-0000-0000-000000000c00','$ORG','web','Web','web_form');
INSERT INTO web_forms (id, organization_id, brand_id, code, name, status, destination, lead_channel_id, owner_user_id, consent_purpose, consent_text, success_message)
VALUES ('00000000-0000-0000-0000-000000000c01','$ORG','00000000-0000-0000-0000-0000000000d1','contacto-ventas','Contacto ventas','active','lead',
        '00000000-0000-0000-0000-000000000c00','00000000-0000-0000-0000-0000000000b1','privacy','{\"es\":\"Acepto la política de privacidad\"}','{\"es\":\"Gracias, te escribiremos pronto\"}');
INSERT INTO web_form_fields (organization_id, web_form_id, key, label, field_type, is_required, maps_to, position) VALUES
 ('$ORG','00000000-0000-0000-0000-000000000c01','nombre','{\"es\":\"Nombre\"}','text',true,'name',0),
 ('$ORG','00000000-0000-0000-0000-000000000c01','correo','{\"es\":\"Correo\"}','email',true,'email',1);
INSERT INTO web_form_fields (organization_id, web_form_id, key, label, field_type, options, position) VALUES
 ('$ORG','00000000-0000-0000-0000-000000000c01','servicio','{\"es\":\"Servicio\"}','select','[{\"value\":\"hosting\",\"label\":{\"es\":\"Hosting\"}}]',2);
INSERT INTO pipeline_stages (id, organization_id, code, name, sort_order) VALUES
 ('00000000-0000-0000-0000-000000000c02','$ORG','nuevo','Nuevo',1), ('00000000-0000-0000-0000-000000000c03','$ORG','contactado','Contactado',2);
INSERT INTO leads (id, organization_id, code, name, email, brand_id, lead_channel_id, pipeline_stage_id)
VALUES ('00000000-0000-0000-0000-000000000c04','$ORG','PRO-000001','Prospecto Web','prospecto@correo.test','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-000000000c00','00000000-0000-0000-0000-000000000c02');
INSERT INTO web_form_submissions (organization_id, web_form_id, brand_id, wp_site_id, idempotency_key, payload, consent_given, consent_text, captcha_verified_at,
                                  status, lead_id, routed_at)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000501','sub-1',
        '{\"nombre\":\"Prospecto Web\",\"correo\":\"prospecto@correo.test\"}',true,'Acepto la política de privacidad',now(),'routed','00000000-0000-0000-0000-000000000c04',now());
INSERT INTO brand_contact_points (organization_id, brand_id, kind, label, value, is_primary) VALUES
 ('$ORG','00000000-0000-0000-0000-0000000000d1','whatsapp','{\"es\":\"Ventas\"}','+51900000000',true),
 ('$ORG','00000000-0000-0000-0000-0000000000d1','email','{\"es\":\"Soporte\"}','soporte@marcauno.test',true);
INSERT INTO legal_documents (id, organization_id, brand_id, kind, title, slug)
VALUES ('00000000-0000-0000-0000-000000000c10','$ORG','00000000-0000-0000-0000-0000000000d1','terms','Términos y condiciones','terminos-y-condiciones');
INSERT INTO legal_document_versions (id, organization_id, legal_document_id, version_number, version_label, body, legal_reviewed_by, legal_reviewed_at,
                                     effective_at, status, published_at, published_by)
VALUES ('00000000-0000-0000-0000-000000000c11','$ORG','00000000-0000-0000-0000-000000000c10',1,'2026-10','<p>Términos</p>','Asesoría legal',now(),now(),
        'published',now(),'00000000-0000-0000-0000-0000000000b1');
UPDATE legal_documents SET published_version_id='00000000-0000-0000-0000-000000000c11' WHERE id='00000000-0000-0000-0000-000000000c10';
INSERT INTO legal_acceptances (organization_id, legal_document_version_id, customer_id, user_id, context, checkout_session_id)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c11','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1','checkout',
        '00000000-0000-0000-0000-000000000603');"
expect_fail "formulario con destino prospecto sin canal de captación" "23514" "
INSERT INTO web_forms (organization_id, brand_id, code, name, destination, consent_required) VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','sin-canal','X','lead',false);"
expect_fail "formulario con consentimiento obligatorio sin texto de la casilla" "23514" "
INSERT INTO web_forms (organization_id, brand_id, code, name, destination, notify_email, consent_purpose)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','sin-texto','X','email','ventas@marcauno.test','privacy');"
expect_fail "campo de lista sin opciones" "23514" "
INSERT INTO web_form_fields (organization_id, web_form_id, key, label, field_type, position)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c01','plan','{\"es\":\"Plan\"}','select',3);"
expect_fail "dos campos con la misma clave en el formulario" "23505" "
INSERT INTO web_form_fields (organization_id, web_form_id, key, label, field_type, position)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c01','correo','{\"es\":\"Otro correo\"}','email',4);"
expect_fail "el mismo envío del formulario recibido dos veces (doble clic)" "23505" "
INSERT INTO web_form_submissions (organization_id, web_form_id, brand_id, idempotency_key, payload)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-0000000000d1','sub-1','{}');"
expect_fail "envío marcado como derivado sin prospecto, ticket ni correo" "23514" "
INSERT INTO web_form_submissions (organization_id, web_form_id, brand_id, idempotency_key, payload, status, routed_at)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-0000000000d1','sub-2','{}','routed',now());"
expect_fail "segundo WhatsApp principal de la misma marca" "23505" "
INSERT INTO brand_contact_points (organization_id, brand_id, kind, value, is_primary) VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','whatsapp','+51911111111',true);"
expect_fail "teléfono de contacto sin formato internacional" "23514" "
INSERT INTO brand_contact_points (organization_id, brand_id, kind, value) VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','phone','01-555-1234');"
expect_fail "versión de términos publicada sin validación de la asesoría legal" "23514" "
INSERT INTO legal_document_versions (organization_id, legal_document_id, version_number, version_label, body, effective_at, status, published_at, published_by)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c10',2,'2026-11','<p>Nuevos</p>',now(),'published',now(),'00000000-0000-0000-0000-0000000000b1');"
expect_fail "segunda versión vigente del mismo documento legal" "23505" "
INSERT INTO legal_document_versions (organization_id, legal_document_id, version_number, version_label, body, legal_reviewed_by, legal_reviewed_at,
                                     effective_at, status, published_at, published_by)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c10',3,'2026-12','<p>Otros</p>','Asesoría legal',now(),now(),'published',now(),'00000000-0000-0000-0000-0000000000b1');"
expect_fail "documento legal de cookies en el sistema (la política de cookies vive en WordPress)" "23514" "
INSERT INTO legal_documents (organization_id, brand_id, kind, title, slug) VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','cookies','Cookies','cookies');"
expect_fail "aceptación de términos en una compra sin la compra enlazada" "23514" "
INSERT INTO legal_acceptances (organization_id, legal_document_version_id, user_id, context)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c11','00000000-0000-0000-0000-0000000000b1','checkout');"
expect_fail "UPDATE de una aceptación de términos como hub_app" "42501" "
UPDATE legal_acceptances SET context='portal' WHERE organization_id='$ORG';"
AS_OWNER=1 expect_fail "DELETE de una aceptación de términos como dueño del esquema (trigger)" "solo de inserción" "DELETE FROM legal_acceptances WHERE organization_id='$ORG';"

log ""
log "== Libro de Reclamaciones y solicitudes de datos personales"
expect_ok "hoja de reclamación con correlativo por marca, ticket con plazo, constancia y respuesta registrada" "
INSERT INTO tickets (id, organization_id, number, brand_id, channel, type, subject)
VALUES ('00000000-0000-0000-0000-000000000c20','$ORG','TKT-000950','00000000-0000-0000-0000-0000000000d1','web_form','complaint','Libro de Reclamaciones LR1-000001');
INSERT INTO complaints (id, organization_id, brand_id, wp_site_id, number, code, complaint_type, consumer_name, consumer_document_type, consumer_document_number,
                        consumer_address, consumer_email, service_description, amount_minor, currency, detail, consumer_request, response_days, due_at, ticket_id)
VALUES ('00000000-0000-0000-0000-000000000c21','$ORG','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000501',1,'LR1-000001','claim',
        'Consumidor de Prueba','dni','00000000','Av. Ficticia 123','consumidor@correo.test','Hosting Plus anual',40000,'PEN','Servicio caído','Compensación',
        15,now()+interval '15 days','00000000-0000-0000-0000-000000000c20');
INSERT INTO complaint_responses (organization_id, complaint_id, body, body_html, previewed_at, preview_sha256, responded_by, sent_to_email)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c21','Respuesta','<p>Respuesta</p>',now(),encode(sha256(convert_to('<p>Respuesta</p>','UTF8')),'hex'),
        '00000000-0000-0000-0000-0000000000b1','consumidor@correo.test');
UPDATE complaints SET status='answered', answered_at=now() WHERE id='00000000-0000-0000-0000-000000000c21';"
expect_fail "correlativo de reclamo repetido en la misma marca" "23505" "
INSERT INTO complaints (organization_id, brand_id, number, code, complaint_type, consumer_name, consumer_document_type, consumer_document_number,
                        consumer_address, consumer_email, service_description, detail, consumer_request, response_days, due_at, ticket_id)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1',1,'LR1-000001-B','grievance','Otro','dni','11111111','Calle 1','otro@correo.test','Dominio',
        'Mala atención','Disculpas',15,now()+interval '15 days','00000000-0000-0000-0000-000000000c20');"
expect_fail "reclamo de un menor de edad sin representante" "23514" "
INSERT INTO complaints (organization_id, brand_id, number, code, complaint_type, consumer_name, consumer_document_type, consumer_document_number,
                        consumer_address, consumer_email, is_minor, service_description, detail, consumer_request, response_days, due_at, ticket_id)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1',2,'LR1-000002','claim','Menor','dni','22222222','Calle 2','menor@correo.test',true,'Hosting',
        'Detalle','Pedido',15,now()+interval '15 days','00000000-0000-0000-0000-000000000c20');"
expect_fail "borrar una hoja del Libro de Reclamaciones como hub_app" "42501" "
DELETE FROM complaints WHERE id='00000000-0000-0000-0000-000000000c21';"
expect_fail "UPDATE de una respuesta enviada al consumidor como hub_app" "42501" "
UPDATE complaint_responses SET body='otra' WHERE organization_id='$ORG';"
expect_fail "solicitud de datos personales respondida sin verificar la identidad del titular" "23514" "
INSERT INTO privacy_requests (organization_id, brand_id, code, request_type, requester_name, requester_email, requester_document_type, requester_document_number,
                              detail, status, due_at, ticket_id, response_summary, answered_at)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1','PRV-000001','cancellation','Titular','titular@correo.test','dni','33333333','Eliminar mis datos','answered',
        now()+interval '20 days','00000000-0000-0000-0000-000000000c20','Datos eliminados',now());"

expect_ok "hoja marcada como prueba y eliminada: queda su constancia con número y motivo" "
INSERT INTO complaints (id, organization_id, brand_id, number, code, complaint_type, consumer_name, consumer_document_type, consumer_document_number,
                        consumer_address, consumer_email, service_description, detail, consumer_request, response_days, due_at, ticket_id)
VALUES ('00000000-0000-0000-0000-000000000c22','$ORG','00000000-0000-0000-0000-0000000000d1',2,'LR1-000002','claim','Prueba interna','dni','99999999',
        'Av. Prueba 1','prueba@marcauno.test','Prueba del formulario','Prueba','Prueba',15,now()+interval '15 days','00000000-0000-0000-0000-000000000c20');
UPDATE complaints SET is_test=true, test_marked_at=now(), test_marked_by='00000000-0000-0000-0000-0000000000b1', test_reason='Prueba del plugin en staging'
 WHERE id='00000000-0000-0000-0000-000000000c22';
BEGIN;
SET LOCAL hub.actor_id = '00000000-0000-0000-0000-0000000000b1';
DELETE FROM complaints WHERE id='00000000-0000-0000-0000-000000000c22';
COMMIT;"
[ "$(q "select number||':'||code||':'||deleted_by from complaint_deletions where complaint_id='00000000-0000-0000-0000-000000000c22'")" = "2:LR1-000002:00000000-0000-0000-0000-0000000000b1" ] \
    && ok "la eliminación de la hoja de prueba quedó en complaint_deletions con número, código y usuario" || bad "falta la constancia de la hoja de prueba eliminada"
expect_fail "eliminar una hoja real (no marcada como prueba)" "42501" "
DELETE FROM complaints WHERE id='00000000-0000-0000-0000-000000000c21';"
expect_fail "marcar como prueba una hoja ya respondida al consumidor" "23514" "
UPDATE complaints SET is_test=true, test_marked_at=now(), test_marked_by='00000000-0000-0000-0000-0000000000b1', test_reason='x'
 WHERE id='00000000-0000-0000-0000-000000000c21';"
expect_fail "marcar como prueba sin motivo ni responsable" "23514" "
UPDATE complaints SET is_test=true WHERE id='00000000-0000-0000-0000-000000000c21';"
expect_fail "borrar la respuesta de una hoja real como hub_app" "42501" "
DELETE FROM complaint_responses WHERE complaint_id='00000000-0000-0000-0000-000000000c21';"
expect_fail "UPDATE de la bitácora de hojas de prueba eliminadas como hub_app" "42501" "
UPDATE complaint_deletions SET test_reason='otra' WHERE organization_id='$ORG';"

log ""
log "== Política de seguridad: código al correo, dispositivos de confianza y contraseñas"
expect_ok "código de acceso al correo emitido y usado una vez; dispositivo de confianza; historial de contraseña; segundo factor por correo" "
INSERT INTO email_login_codes (id, organization_id, user_id, purpose, code_hash, sent_to, expires_at, max_attempts)
VALUES ('00000000-0000-0000-0000-000000000d01','$ORG','00000000-0000-0000-0000-0000000000b1','login',repeat('4',64),'ana@demo.test',now()+interval '10 minutes',5);
UPDATE email_login_codes SET attempts=1, consumed_at=now() WHERE id='00000000-0000-0000-0000-000000000d01';
INSERT INTO trusted_devices (organization_id, user_id, device_token_hash, label, trusted_until)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000b1',repeat('5',64),'Firefox en Linux',now()+interval '30 days');
INSERT INTO password_histories (organization_id, user_id, password_hash) VALUES ('$ORG','00000000-0000-0000-0000-0000000000b1','argon2id-ficticio');
UPDATE users SET mfa_method='email', mfa_enabled_at=now() WHERE id='00000000-0000-0000-0000-0000000000b1';"
expect_fail "usar dos veces el mismo código de acceso al correo" "23514" "
UPDATE email_login_codes SET consumed_at=now() WHERE id='00000000-0000-0000-0000-000000000d01';"
expect_fail "usar un código de acceso al correo vencido" "23514" "
INSERT INTO email_login_codes (id, organization_id, user_id, purpose, code_hash, sent_to, expires_at, max_attempts, created_at)
VALUES ('00000000-0000-0000-0000-000000000d02','$ORG','00000000-0000-0000-0000-0000000000b1','login',repeat('6',64),'ana@demo.test',now()-interval '1 minute',5,now()-interval '11 minutes');
UPDATE email_login_codes SET consumed_at=now() WHERE id='00000000-0000-0000-0000-000000000d02';"
expect_fail "dos códigos vigentes a la vez para el mismo usuario y propósito" "23505" "
INSERT INTO email_login_codes (organization_id, user_id, purpose, code_hash, sent_to, expires_at, max_attempts) VALUES
 ('$ORG','00000000-0000-0000-0000-0000000000b1','step_up',repeat('7',64),'ana@demo.test',now()+interval '10 minutes',5),
 ('$ORG','00000000-0000-0000-0000-0000000000b1','step_up',repeat('8',64),'ana@demo.test',now()+interval '10 minutes',5);"
expect_fail "más intentos que los permitidos para un código" "23514" "
INSERT INTO email_login_codes (organization_id, user_id, purpose, code_hash, sent_to, expires_at, max_attempts, attempts)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000b1','enroll',repeat('9',64),'ana@demo.test',now()+interval '10 minutes',3,4);"
expect_fail "segundo factor por aplicación sin secreto TOTP" "23514" "
UPDATE users SET mfa_method='totp' WHERE id='00000000-0000-0000-0000-0000000000b1';"
expect_fail "dispositivo de confianza con vencimiento en el pasado" "23514" "
INSERT INTO trusted_devices (organization_id, user_id, device_token_hash, trusted_until)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000b1',repeat('a',64),now()-interval '1 day');"

log ""
log "== Roles personalizados y matriz de permisos"
AS_OWNER=1 expect_ok "catálogo de permisos cargado por el seeder (dueño)" "
INSERT INTO permissions (id, code, module, entity, action) VALUES
 ('00000000-0000-0000-0000-000000000e01','sales.lead.view','SAL','lead','view'),
 ('00000000-0000-0000-0000-000000000e02','portal.service.view','PRT','service','view');"
expect_ok "rol del sistema, rol personalizado copiado de él y permiso asignado desde la matriz" "
INSERT INTO roles (id, organization_id, code, name, audience, is_system) VALUES
 ('00000000-0000-0000-0000-000000000e10','$ORG','sales','Ventas','staff',true);
INSERT INTO roles (id, organization_id, code, name, audience, copied_from_role_id) VALUES
 ('00000000-0000-0000-0000-000000000e11','$ORG','ventas_junior','Ventas junior','staff','00000000-0000-0000-0000-000000000e10');
INSERT INTO role_permissions (organization_id, role_id, permission_id) VALUES
 ('$ORG','00000000-0000-0000-0000-000000000e11','00000000-0000-0000-0000-000000000e01');"
expect_fail "borrar un rol del sistema" "42501" "
DELETE FROM roles WHERE id='00000000-0000-0000-0000-000000000e10';"
expect_fail "cambiar el código de un rol del sistema" "42501" "
UPDATE roles SET code='ventas' WHERE id='00000000-0000-0000-0000-000000000e10';"
expect_fail "convertir un rol personalizado en rol del sistema" "42501" "
UPDATE roles SET is_system=true WHERE id='00000000-0000-0000-0000-000000000e11';"
expect_fail "asignar un permiso del portal a un rol del personal" "23514" "
INSERT INTO role_permissions (organization_id, role_id, permission_id) VALUES
 ('$ORG','00000000-0000-0000-0000-000000000e11','00000000-0000-0000-0000-000000000e02');"
expect_ok "borrar un rol personalizado con sus permisos" "
DELETE FROM roles WHERE id='00000000-0000-0000-0000-000000000e11';"

log ""
log "== Catálogo completo y servicios personalizados"
expect_ok "categoría fija de páginas web, tipo de servicio personalizado activo con campos y valores coherentes en un servicio" "
UPDATE product_categories SET kind='shared_hosting', shortcode_type='hosting', is_system=true WHERE id='00000000-0000-0000-0000-000000000101';
INSERT INTO product_categories (id, organization_id, code, name, kind, shortcode_type, is_system)
VALUES ('00000000-0000-0000-0000-000000000f01','$ORG','paginas-web','Páginas web','website','web',true);
INSERT INTO service_types (id, organization_id, code, name, category_id, brand_ids, status, activated_at, sale_mode, requires_contract, component_kind,
                           delivery_tasks, portal_fields)
VALUES ('00000000-0000-0000-0000-000000000f02','$ORG','landing-page','{\"es\":\"Landing page\"}','00000000-0000-0000-0000-000000000f01',
        '{00000000-0000-0000-0000-0000000000d1}','active',now(),'quote_only',true,'wordpress_site',
        '[{\"title\":{\"es\":\"Diseño\"},\"role\":\"support\",\"due_days\":3}]','{paginas}');
INSERT INTO service_type_fields (id, organization_id, service_type_id, key, label, field_type, options, is_required, position) VALUES
 ('00000000-0000-0000-0000-000000000f03','$ORG','00000000-0000-0000-0000-000000000f02','paginas','{\"es\":\"Páginas\"}','number','[]',true,0),
 ('00000000-0000-0000-0000-000000000f04','$ORG','00000000-0000-0000-0000-000000000f02','estilo','{\"es\":\"Estilo\"}','select','[{\"value\":\"moderno\",\"label\":{\"es\":\"Moderno\"}}]',false,1),
 ('00000000-0000-0000-0000-000000000f05','$ORG','00000000-0000-0000-0000-000000000f02','entrega','{\"es\":\"Fecha de entrega\"}','date','[]',false,2);
INSERT INTO products (id, organization_id, code, category_id, name, billing_type, service_type_id)
VALUES ('00000000-0000-0000-0000-000000000f06','$ORG','LANDING','00000000-0000-0000-0000-000000000f01','Landing page','one_time','00000000-0000-0000-0000-000000000f02');
INSERT INTO services (id, organization_id, code, customer_id, brand_id, product_id, label)
VALUES ('00000000-0000-0000-0000-000000000f07','$ORG','SRV-000777','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-000000000f06','Landing turismoandino.test');
INSERT INTO service_field_values (organization_id, service_id, service_type_field_id, field_type, value_number) VALUES
 ('$ORG','00000000-0000-0000-0000-000000000f07','00000000-0000-0000-0000-000000000f03','number',5);
INSERT INTO service_field_values (organization_id, service_id, service_type_field_id, field_type, value_text) VALUES
 ('$ORG','00000000-0000-0000-0000-000000000f07','00000000-0000-0000-0000-000000000f04','select','moderno');"
expect_fail "valor de texto en un campo de fecha" "23514" "
INSERT INTO service_field_values (organization_id, service_id, service_type_field_id, field_type, value_text)
VALUES ('$ORG','00000000-0000-0000-0000-000000000f07','00000000-0000-0000-0000-000000000f05','date','mañana');"
expect_fail "valor declarado con un tipo distinto al del campo" "23503" "
INSERT INTO service_field_values (organization_id, service_id, service_type_field_id, field_type, value_text)
VALUES ('$ORG','00000000-0000-0000-0000-000000000f07','00000000-0000-0000-0000-000000000f05','text','mañana');"
expect_fail "valor de lista que no es una de sus opciones" "23514" "
UPDATE service_field_values SET value_text='clasico' WHERE service_type_field_id='00000000-0000-0000-0000-000000000f04';"
expect_fail "cambiar el tipo de un campo ya definido" "23514" "
UPDATE service_type_fields SET field_type='text' WHERE id='00000000-0000-0000-0000-000000000f03';"
expect_fail "segunda categoría raíz de páginas web" "23505" "
INSERT INTO product_categories (organization_id, code, name, kind) VALUES ('$ORG','webs-2','Webs','website');"
expect_fail "categoría con tipo fuera del catálogo" "23514" "
INSERT INTO product_categories (organization_id, code, name, kind) VALUES ('$ORG','kioscos','Kioscos','kiosk');"
expect_fail "tipo de servicio activo sin marcas donde se ofrece" "23514" "
INSERT INTO service_types (organization_id, code, name, category_id, status, activated_at)
VALUES ('$ORG','sin-marca','{\"es\":\"Sin marca\"}','00000000-0000-0000-0000-000000000f01','active',now());"
expect_fail "tipo de servicio con componente del mapa desconocido" "23514" "
INSERT INTO service_types (organization_id, code, name, category_id, component_kind)
VALUES ('$ORG','raro','{\"es\":\"Raro\"}','00000000-0000-0000-0000-000000000f01','spaceship');"

log ""
log "== CRM: historial de etapas (Kanban) y bandeja de soporte"
expect_ok "cambio de etapa por arrastre en el Kanban registrado en el historial" "
UPDATE leads SET pipeline_stage_id='00000000-0000-0000-0000-000000000c03' WHERE id='00000000-0000-0000-0000-000000000c04';
INSERT INTO lead_stage_changes (organization_id, lead_id, from_stage_id, to_stage_id, source, changed_by)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c04','00000000-0000-0000-0000-000000000c02','00000000-0000-0000-0000-000000000c03','board_drag',
        '00000000-0000-0000-0000-0000000000b1');"
expect_fail "arrastre en el Kanban sin el usuario que lo hizo" "23514" "
INSERT INTO lead_stage_changes (organization_id, lead_id, from_stage_id, to_stage_id, source)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c04','00000000-0000-0000-0000-000000000c03','00000000-0000-0000-0000-000000000c02','board_drag');"
expect_fail "cambio de etapa a la misma etapa" "23514" "
INSERT INTO lead_stage_changes (organization_id, lead_id, from_stage_id, to_stage_id, source, changed_by)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c04','00000000-0000-0000-0000-000000000c03','00000000-0000-0000-0000-000000000c03','form','00000000-0000-0000-0000-0000000000b1');"
expect_fail "UPDATE del historial de etapas como hub_app" "42501" "
UPDATE lead_stage_changes SET source='api' WHERE organization_id='$ORG';"
expect_fail "nota interna del ticket escrita como cliente" "23514" "
INSERT INTO ticket_messages (organization_id, ticket_id, author_type, channel, body, is_internal)
VALUES ('$ORG','00000000-0000-0000-0000-000000000806','customer','portal','No debería ser interna',true);"
expect_ok "nota interna del personal en el ticket" "
INSERT INTO ticket_messages (organization_id, ticket_id, author_type, author_user_id, channel, body, is_internal)
VALUES ('$ORG','00000000-0000-0000-0000-000000000806','staff','00000000-0000-0000-0000-0000000000b1','internal','Revisar respaldo JB-1',true);"

log ""
log "== Panel de indicadores (KPI): catálogo, metas y valores calculados"
AS_OWNER=1 expect_ok "catálogo de indicadores sembrado por el seeder (dueño): uno en dinero y uno en porcentaje" "
INSERT INTO kpi_definitions (id, organization_id, code, kpi_group, name, definition, formula, source_columns, unit, direction, frequency, dimensions,
                             target_setting_key, detail_screen, sort_order) VALUES
 ('00000000-0000-0000-0000-000000027001','$ORG','KPI-COM-01','commercial','{\"es\":\"Ingreso recurrente mensual\"}','{\"es\":\"Suma mensualizada de suscripciones activas\"}',
  'SUM(subscriptions.price_minor * subscriptions.quantity / meses del ciclo)','{subscriptions.price_minor,subscriptions.quantity}','money','up','daily',
  '{brand,currency,product_category,owner}','dashboard.targets.mrr_growth_percent','P-SRV-01',1),
 ('00000000-0000-0000-0000-000000027002','$ORG','KPI-SOP-04','support','{\"es\":\"Cumplimiento de SLA\"}','{\"es\":\"Tickets resueltos sin incumplir el SLA\"}',
  'COUNT(tickets WHERE NOT sla_breached) / COUNT(tickets resueltos)','{tickets.sla_breached,tickets.resolved_at}','percent','up','intraday',
  '{brand,owner}','dashboard.targets.sla_compliance_percent','P-HLP-01',2);"
expect_ok "metas por indicador: dinero con moneda por marca y porcentaje para todas las marcas; valor mensual calculado" "
INSERT INTO kpi_targets (organization_id, kpi_definition_id, brand_id, period_type, period_start, target_minor, currency)
VALUES ('$ORG','00000000-0000-0000-0000-000000027001','00000000-0000-0000-0000-0000000000d1','month','2026-10-01',5000000,'PEN');
INSERT INTO kpi_targets (organization_id, kpi_definition_id, period_type, period_start, target_value)
VALUES ('$ORG','00000000-0000-0000-0000-000000027002','quarter','2026-10-01',95);
INSERT INTO kpi_snapshots (organization_id, kpi_definition_id, period_type, period_start, period_end, currency, value_minor, is_partial)
VALUES ('$ORG','00000000-0000-0000-0000-000000027001','month','2026-10-01','2026-10-31','PEN',4250000,true);
INSERT INTO kpi_snapshots (organization_id, kpi_definition_id, period_type, period_start, period_end, value, numerator, denominator, sample_count)
VALUES ('$ORG','00000000-0000-0000-0000-000000027002','day','2026-10-07','2026-10-07',92.5,37,40,40);"
AS_OWNER=1 expect_fail "código de indicador cuyo prefijo no corresponde a su grupo" "23514" "
INSERT INTO kpi_definitions (organization_id, code, kpi_group, name, definition, formula, unit, direction, frequency, detail_screen)
VALUES ('$ORG','KPI-FIN-01','commercial','{\"es\":\"x\"}','{\"es\":\"x\"}','x','count','up','daily','P-DSH-04');"
AS_OWNER=1 expect_fail "indicador en dinero sin la dimensión moneda" "23514" "
INSERT INTO kpi_definitions (organization_id, code, kpi_group, name, definition, formula, unit, direction, frequency, dimensions, detail_screen)
VALUES ('$ORG','KPI-FIN-01','finance','{\"es\":\"Facturado\"}','{\"es\":\"x\"}','x','money','up','daily','{brand}','P-BIL-01');"
AS_OWNER=1 expect_fail "indicador con una dimensión de filtro fuera de lista" "23514" "
INSERT INTO kpi_definitions (organization_id, code, kpi_group, name, definition, formula, unit, direction, frequency, dimensions, detail_screen)
VALUES ('$ORG','KPI-WEB-01','web','{\"es\":\"Pedidos\"}','{\"es\":\"x\"}','x','count','up','daily','{country}','P-ORD-01');"
AS_OWNER=1 expect_fail "código de indicador fuera del formato KPI-GRP-NN" "23514" "
INSERT INTO kpi_definitions (organization_id, code, kpi_group, name, definition, formula, unit, direction, frequency, detail_screen)
VALUES ('$ORG','KPI-COM-1','commercial','{\"es\":\"x\"}','{\"es\":\"x\"}','x','count','up','daily','P-CUS-01');"
expect_fail "meta en porcentaje mayor que 100" "23514" "
INSERT INTO kpi_targets (organization_id, kpi_definition_id, period_type, period_start, target_value)
VALUES ('$ORG','00000000-0000-0000-0000-000000027002','month','2026-11-01',120);"
expect_fail "meta de un indicador en dinero sin importe ni moneda" "23514" "
INSERT INTO kpi_targets (organization_id, kpi_definition_id, period_type, period_start, target_value)
VALUES ('$ORG','00000000-0000-0000-0000-000000027001','month','2026-11-01',50000);"
expect_fail "segunda meta del mismo indicador, marca, periodo y moneda" "23505" "
INSERT INTO kpi_targets (organization_id, kpi_definition_id, brand_id, period_type, period_start, target_minor, currency)
VALUES ('$ORG','00000000-0000-0000-0000-000000027001','00000000-0000-0000-0000-0000000000d1','month','2026-10-01',6000000,'PEN');"
expect_fail "meta trimestral que no empieza al inicio de un trimestre" "23514" "
INSERT INTO kpi_targets (organization_id, kpi_definition_id, period_type, period_start, target_value)
VALUES ('$ORG','00000000-0000-0000-0000-000000027002','quarter','2026-11-01',90);"
expect_fail "valor calculado repetido para el mismo periodo y las mismas dimensiones (todas las marcas)" "23505" "
INSERT INTO kpi_snapshots (organization_id, kpi_definition_id, period_type, period_start, period_end, currency, value_minor)
VALUES ('$ORG','00000000-0000-0000-0000-000000027001','month','2026-10-01','2026-10-31','PEN',4300000);"
expect_fail "valor mensual cuyo fin no es el último día del mes" "23514" "
INSERT INTO kpi_snapshots (organization_id, kpi_definition_id, period_type, period_start, period_end, value)
VALUES ('$ORG','00000000-0000-0000-0000-000000027002','month','2026-09-01','2026-09-29',90);"
expect_fail "borrar un indicador del catálogo como hub_app" "42501" "
DELETE FROM kpi_definitions WHERE id='00000000-0000-0000-0000-000000027002';"

log ""
log "== Editor de textos enriquecido: plantillas saneadas e historial de versiones"
expect_ok "plantilla de respuesta del Libro (correo HTML), respuesta predefinida por WhatsApp en texto y dos versiones del historial" "
INSERT INTO notification_templates (id, organization_id, code, channel, brand_id, locale, subject, body, variables, category, content_format)
VALUES ('00000000-0000-0000-0000-000000027101','$ORG','complaint.response.default','email','00000000-0000-0000-0000-0000000000d1','es',
        'Respuesta a su hoja {{complaint.code}}','<p>Estimado(a) <strong>{{consumer.name}}</strong>:</p><ul><li>Hoja {{complaint.code}}</li></ul>',
        '[\"complaint.code\",\"consumer.name\"]','complaint_response','html');
INSERT INTO notification_templates (organization_id, code, channel, locale, body, whatsapp_template_name, category, content_format)
VALUES ('$ORG','ticket.reply.received','whatsapp','es','Recibimos su consulta {{ticket.number}}','ticket_received','canned_reply','plain');
INSERT INTO rich_text_versions (organization_id, owner_type, owner_id, field, version_number, html, html_sha256, sanitizer_profile, author_id)
VALUES ('$ORG','notification_template','00000000-0000-0000-0000-000000027101','body',1,'<p>v1</p>',encode(sha256(convert_to('<p>v1</p>','UTF8')),'hex'),'p1',
        '00000000-0000-0000-0000-0000000000b1'),
       ('$ORG','notification_template','00000000-0000-0000-0000-000000027101','body',2,'<p>v2 <a href=\"https://marcauno.test\">enlace</a></p>',
        encode(sha256(convert_to('<p>v2 <a href=\"https://marcauno.test\">enlace</a></p>','UTF8')),'hex'),'p1','00000000-0000-0000-0000-0000000000b1');"
expect_fail "plantilla HTML con un script incrustado" "23514" "
INSERT INTO notification_templates (organization_id, code, channel, locale, body)
VALUES ('$ORG','service.welcome.x','email','es','<p>Hola</p><script>alert(1)</script>');"
expect_fail "plantilla de WhatsApp en formato HTML" "23514" "
INSERT INTO notification_templates (organization_id, code, channel, locale, body, whatsapp_template_name, content_format)
VALUES ('$ORG','ticket.reply.html','whatsapp','es','<p>Hola</p>','tpl','html');"
expect_fail "plantilla de respuesta del Libro por un canal distinto del correo" "23514" "
INSERT INTO notification_templates (organization_id, code, channel, locale, body, category)
VALUES ('$ORG','complaint.response.portal','portal','es','<p>Respuesta</p>','complaint_response');"
expect_fail "versión del editor con un atributo de evento (onerror)" "23514" "
INSERT INTO rich_text_versions (organization_id, owner_type, owner_id, field, version_number, html, html_sha256, sanitizer_profile, author_id)
VALUES ('$ORG','kb_article','00000000-0000-0000-0000-000000027199','body',1,'<img src=x onerror=alert(1)>',
        encode(sha256(convert_to('<img src=x onerror=alert(1)>','UTF8')),'hex'),'p1','00000000-0000-0000-0000-0000000000b1');"
expect_fail "versión cuyo hash no corresponde al HTML guardado" "23514" "
INSERT INTO rich_text_versions (organization_id, owner_type, owner_id, field, version_number, html, html_sha256, sanitizer_profile, author_id)
VALUES ('$ORG','kb_article','00000000-0000-0000-0000-000000027199','body',1,'<p>texto</p>',repeat('0',64),'p1','00000000-0000-0000-0000-0000000000b1');"
expect_fail "número de versión repetido para el mismo texto" "23505" "
INSERT INTO rich_text_versions (organization_id, owner_type, owner_id, field, version_number, html, html_sha256, sanitizer_profile, author_id)
VALUES ('$ORG','notification_template','00000000-0000-0000-0000-000000027101','body',2,'<p>otra</p>',encode(sha256(convert_to('<p>otra</p>','UTF8')),'hex'),'p1',
        '00000000-0000-0000-0000-0000000000b1');"
expect_fail "UPDATE del historial del editor como hub_app" "42501" "
UPDATE rich_text_versions SET change_summary='x' WHERE organization_id='$ORG';"
AS_OWNER=1 expect_fail "DELETE del historial del editor como dueño del esquema (trigger)" "solo de inserción" "DELETE FROM rich_text_versions WHERE organization_id='$ORG';"

log ""
log "== Libro de Reclamaciones: hoja pública y respuesta con editor"
expect_ok "hoja con enlace a su constancia y respuesta desde plantilla con vista previa, responsable y fecha" "
UPDATE complaints SET sheet_token_hash=repeat('c',64), acknowledgement_sent_at=now() WHERE id='00000000-0000-0000-0000-000000000c21';
INSERT INTO complaint_responses (organization_id, complaint_id, body, body_html, template_id, previewed_at, preview_sha256, responded_by, sent_to_email, sent_at, is_final)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c21','Complemento','<p>Complemento de la <em>respuesta</em></p>','00000000-0000-0000-0000-000000027101',
        now()-interval '5 minutes',encode(sha256(convert_to('<p>Complemento de la <em>respuesta</em></p>','UTF8')),'hex'),
        '00000000-0000-0000-0000-0000000000b1','consumidor@correo.test',now(),false);"
expect_fail "respuesta cuyo HTML enviado no es el que se previsualizó" "23514" "
INSERT INTO complaint_responses (organization_id, complaint_id, body, body_html, previewed_at, preview_sha256, responded_by, sent_to_email)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c21','x','<p>Texto cambiado</p>',now(),encode(sha256(convert_to('<p>Texto previsto</p>','UTF8')),'hex'),
        '00000000-0000-0000-0000-0000000000b1','consumidor@correo.test');"
expect_fail "respuesta enviada antes de su vista previa" "23514" "
INSERT INTO complaint_responses (organization_id, complaint_id, body, body_html, previewed_at, preview_sha256, responded_by, sent_to_email, sent_at)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c21','x','<p>x</p>',now(),encode(sha256(convert_to('<p>x</p>','UTF8')),'hex'),
        '00000000-0000-0000-0000-0000000000b1','consumidor@correo.test',now()-interval '1 hour');"
expect_fail "respuesta con código peligroso en la carta" "23514" "
INSERT INTO complaint_responses (organization_id, complaint_id, body, body_html, previewed_at, preview_sha256, responded_by, sent_to_email)
VALUES ('$ORG','00000000-0000-0000-0000-000000000c21','x','<a href=\"javascript:alert(1)\">x</a>',now(),
        encode(sha256(convert_to('<a href=\"javascript:alert(1)\">x</a>','UTF8')),'hex'),'00000000-0000-0000-0000-0000000000b1','consumidor@correo.test');"
expect_fail "dos hojas con el mismo enlace a la constancia" "23505" "
INSERT INTO complaints (organization_id, brand_id, number, code, complaint_type, consumer_name, consumer_document_type, consumer_document_number,
                        consumer_address, consumer_email, service_description, detail, consumer_request, response_days, due_at, ticket_id, sheet_token_hash)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1',3,'LR1-000003','grievance','Otra persona','dni','44444444','Calle 4','otra@correo.test','Correo',
        'Detalle','Pedido',15,now()+interval '15 days','00000000-0000-0000-0000-000000000c20',repeat('c',64));"

log ""
log "== Consultas WHOIS y de disponibilidad desde [hub_whois]"
expect_ok "consultas de un visitante: disponible, WHOIS de un dominio registrado y una frenada por captcha" "
INSERT INTO whois_lookups (organization_id, brand_id, wp_site_id, visitor_hash, query_kind, domain_name, tld, result, registrar_provider_id, response_ms) VALUES
 ('$ORG','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000501',repeat('e',64),'availability','miempresa.com.pe','com.pe','available','00000000-0000-0000-0000-000000000b02',320),
 ('$ORG','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000501',repeat('e',64),'whois','ejemplo.com','com','registered','00000000-0000-0000-0000-000000000b02',410);
INSERT INTO whois_lookups (organization_id, brand_id, visitor_hash, query_kind, domain_name, tld, result)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1',repeat('e',64),'availability','otra.com','com','captcha_required');"
[ "$(q "select hub_whois_recent_count('$ORG',repeat('e',64),60)")" = "2" ] \
    && ok "hub_whois_recent_count cuenta solo las consultas efectivas del visitante en la ventana" || bad "conteo de consultas WHOIS por visitante"
expect_fail "consulta con un nombre de dominio inválido (mayúsculas y sin extensión)" "23514" "
INSERT INTO whois_lookups (organization_id, brand_id, visitor_hash, query_kind, domain_name, tld, result)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1',repeat('e',64),'availability','MiEmpresa','com','unknown');"
expect_fail "consulta cuya extensión no corresponde al dominio" "23514" "
INSERT INTO whois_lookups (organization_id, brand_id, visitor_hash, query_kind, domain_name, tld, result)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1',repeat('e',64),'availability','miempresa.pe','com','available');"
expect_fail "consulta frenada por el límite que figura como enviada al registrador" "23514" "
INSERT INTO whois_lookups (organization_id, brand_id, visitor_hash, query_kind, domain_name, tld, result, registrar_provider_id)
VALUES ('$ORG','00000000-0000-0000-0000-0000000000d1',repeat('e',64),'whois','abc.com','com','rate_limited','00000000-0000-0000-0000-000000000b02');"
expect_fail "UPDATE de una consulta WHOIS como hub_app" "42501" "
UPDATE whois_lookups SET result='available' WHERE organization_id='$ORG';"
expect_ok "purga por retención de consultas WHOIS antiguas como hub_app" "
DELETE FROM whois_lookups WHERE organization_id='$ORG' AND created_at < now() - interval '30 days';"

log ""
log "== Servidores VPS y dedicados para [hub_servidores]"
expect_ok "servidor dedicado con procesador, disco NVMe y ubicación" "
INSERT INTO product_categories (id, organization_id, code, name, kind, shortcode_type, is_system)
VALUES ('00000000-0000-0000-0000-000000027301','$ORG','dedicados','Servidores dedicados','dedicated_server','dedicado',true);
INSERT INTO products (id, organization_id, code, category_id, name, billing_type)
VALUES ('00000000-0000-0000-0000-000000027302','$ORG','ded-1','00000000-0000-0000-0000-000000027301','Dedicado 1','recurring');
INSERT INTO vps_plan_specs (organization_id, product_id, vcpu, ram_mb, disk_gb, transfer_gb, os_options, is_managed, location, cpu_model, disk_type, provider_id, provider_plan_ref)
VALUES ('$ORG','00000000-0000-0000-0000-000000027302',8,65536,1000,20000,'{almalinux-9}',true,'Lima, Perú','AMD EPYC 4244P','nvme',
        '00000000-0000-0000-0000-000000000b01','DED-EPYC-1');"
expect_fail "ficha de servidor con un tipo de disco fuera de lista" "23514" "
UPDATE vps_plan_specs SET disk_type='tape' WHERE product_id='00000000-0000-0000-0000-000000027302';"

# ---------------------------------------------------------------------
log ""
log "RESUMEN: $PASS pruebas OK, $FAIL fallidas, $TABLES tablas"
if [ "$FAIL" -eq 0 ]; then log "RESULTADO: OK"; exit 0; else log "RESULTADO: FALLA"; exit 1; fi
