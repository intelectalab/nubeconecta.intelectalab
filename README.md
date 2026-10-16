# Hub — Plataforma de Gestión de Hosting, Cloud, Dominios y Servicios

Plataforma empresarial de facturación, aprovisionamiento, CRM y soporte para servicios web y cloud (AlojamientoPlus y marcas asociadas).

## 📁 Estructura del Repositorio

```text
/hub
├── backend/                # Monolito modular en Laravel (PHP 8.3+)
│   ├── app/
│   │   ├── Modules/        # 23 módulos de negocio independientes (Contracts, Domain, Application, Http)
│   │   └── Shared/         # Núcleo compartido (Value Object Money, auditoría inmutable, idempotencia)
│   └── database/           # Migraciones y seeders
├── frontend/               # Monorepo React + TypeScript + Vite + Tailwind
│   ├── apps/
│   │   ├── admin/          # Panel administrativo interno
│   │   └── portal/         # Portal de autoservicio del cliente
│   └── packages/
│       ├── ui/             # Librería compartida de componentes base
│       └── api/            # Cliente HTTP generado desde OpenAPI
├── database/               # Esquema canónico PostgreSQL 16 (203 tablas) y semillas
├── infra/                  # Docker Compose, Nginx y pipelines CI/CD
├── prototipo/              # Prototipos interactivos de alta fidelidad
├── backlog/                # Backlog estructurado para Jira (sas.txt)
└── docs/                   # Especificaciones funcionales, técnicas y contratos
```

## 🚀 Inicio Rápido con Docker

```bash
cd infra
docker compose up -d
```

Esto levantará automáticamente:
- **PostgreSQL 16**: `localhost:5432` (cargando las 203 tablas de `schema.sql`)
- **Redis 7**: `localhost:6379`
- **Backend (PHP 8.3)**: `localhost:9000`
- **Web (Nginx)**: `localhost:8080`
- **Worker (Horizon)**: Procesamiento de colas asíncronas
- **Scheduler**: Planificador de tareas en segundo plano
