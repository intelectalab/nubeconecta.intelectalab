# AlojamientoPlus — Hub Central (Plataforma de Hosting & Gestión)

Bienvenido al repositorio central de **AlojamientoPlus**. Este proyecto es una plataforma completa de facturación, aprovisionamiento, soporte y CRM para servicios de hosting, dominios y servidores cloud.

---

## 👥 División del Trabajo en el Equipo (4 Desarrolladores)

El proyecto está diseñado como un **monorepo** para que podamos trabajar los 4 en paralelo sin pisarnos el código:

| Rol | Área | Carpeta asignada | Tareas principales |
| :--- | :--- | :--- | :--- |
| **Dev 1** | **UI Compartida** | `frontend/packages/ui/` | Componentes reutilizables (botones, tablas, inputs, modales, iconos SVG). |
| **Dev 2** | **Panel Admin (NOC)** | `frontend/apps/admin/` | Pantallas de administración: Monitoreo de servidores, CRM Kanban, SLA, catálogo. |
| **Dev 3** | **Portal Cliente** | `frontend/apps/portal/` | Pantallas del cliente: Mis servicios, facturación/pagos bimoneda, tickets, respaldos. |
| **Dev 4** | **Backend & BD** | `backend/` y `infra/` | API REST en Laravel, conexión a PostgreSQL 16, colas Redis, módulos de negocio. |

---

## 📁 ¿Dónde está cada cosa?

```text
├── frontend/             # Código de React + TypeScript + Vite
│   ├── apps/admin/       # Panel administrativo (corre en http://localhost:3000)
│   ├── apps/portal/      # Portal del cliente (corre en http://localhost:3001)
│   ├── packages/ui/      # Librería de componentes comunes compartida (@hub/ui)
│   └── packages/api/     # Cliente de la API para admin y portal (@hub/api)
├── backend/              # API REST modular en Laravel (PHP 8.3): backend/app/Modules/*
├── database/             # Esquema oficial PostgreSQL 16 (schema.sql) y semillas
├── api/                  # Contrato OpenAPI de la API (openapi.yaml)
├── plugins/hub-connector/# Plugin de WordPress que conecta la web comercial con el sistema
├── infra/                # Docker Compose de desarrollo y de producción, imágenes y scripts
├── prototipo/            # Prototipos HTML de referencia (diseño original de la UI)
├── backlog/              # Matriz de requerimientos e historias para Jira
└── docs/                 # Arquitectura, reglas de negocio y fichas de módulos (docs/modulos)
```

> 💡 **Guía visual:** Si tienes dudas de cómo debe verse una pantalla, abre con dos clics los archivos de la carpeta `prototipo/` en tu navegador (`portal.html` y `panel.html`).

---

## 🚀 Cómo empezar a trabajar en tu computadora

### 1. Clonar el repositorio
```bash
git clone https://github.com/Mbachi258/AlojamientoPlus-lINTELECTALAB.git
cd AlojamientoPlus-lINTELECTALAB
```

### 2. Levantar el Frontend (React + Vite)
Requisitos: Tener instalado **Node.js** (v20 o superior).

```bash
# Entrar a la carpeta frontend
cd frontend

# Instalar todas las dependencias del monorepo
npm install

# Para trabajar en el Panel Admin (puerto 3000)
npm run dev:admin

# Para trabajar en el Portal de Clientes (puerto 3001)
npm run dev:portal

# Para validar que no haya errores de TypeScript antes de subir
npm run build
```

### 3. Levantar la Base de Datos y Servicios (Docker)
Requisitos: Tener instalado y abierto **Docker Desktop**.

```bash
# Entrar a la carpeta infra
cd infra

# Levantar todo el sistema (carga automáticamente el schema.sql)
docker compose up -d
```
* **API (Laravel):** http://localhost:8080
* **Web comercial (WordPress):** http://localhost:8000 — la primera carga tras encender puede tardar casi un minuto
* **Correos de prueba (Mailpit):** http://localhost:8025 — nada sale a Internet
* **PostgreSQL:** `localhost:5432` (Usuario: `hub_owner`, Pass: `hub_secret_password`, BD: `hub`; solo desarrollo)
* **Redis:** `localhost:6379`

Producción: ver `infra/docker-compose.production.yml` e `infra/.env.production.example` (los secretos se generan en el servidor, nunca en el repo).

---

## 🌿 Reglas de Trabajo con Git (Muy Importante)

Para evitar borrar o sobreescribir el trabajo de los demás, seguimos esta regla estricta:

1. **NUNCA hagas cambios directamente en la rama `main`**.
2. **Crea tu propia rama** antes de empezar cualquier tarea:
   ```bash
   git checkout -b feature/nombre-de-tu-tarea
   # Ejemplo: git checkout -b feature/pantalla-tickets
   ```
3. Trabaja en tus archivos, guarda y haz commit:
   ```bash
   git add .
   git commit -m "feat(portal): agregar tabla de tickets y detalle"
   ```
4. Sube tu rama a GitHub:
   ```bash
   git push origin feature/nombre-de-tu-tarea
   ```
5. En GitHub, entra al repositorio y dale al botón verde **"Compare & pull request"**. Tus compañeros revisan el código, le dan "Aprobar", y se une al proyecto general.
