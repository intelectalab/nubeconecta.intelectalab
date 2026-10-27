# syntax=docker/dockerfile:1
# Imagen web de producción: compila el admin y el portal con Vite y los sirve
# con nginx bajo /admin/ y /portal/ junto con backend/public (index.php → app:9000).
FROM node:22-alpine AS frontend-build
WORKDIR /workspace
COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY frontend/apps/admin/package.json ./frontend/apps/admin/package.json
COPY frontend/apps/portal/package.json ./frontend/apps/portal/package.json
COPY frontend/packages/api/package.json ./frontend/packages/api/package.json
COPY frontend/packages/ui/package.json ./frontend/packages/ui/package.json
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
ARG VITE_ADMIN_BASE=/admin/
ARG VITE_PORTAL_BASE=/portal/
RUN cd frontend/apps/admin && VITE_BASE_PATH="$VITE_ADMIN_BASE" npm run build
RUN cd frontend/apps/portal && VITE_BASE_PATH="$VITE_PORTAL_BASE" npm run build

FROM nginx:alpine
COPY infra/docker/nginx/production.conf /etc/nginx/conf.d/default.conf
COPY backend/public /var/www/html/public
COPY --from=frontend-build /workspace/frontend/apps/admin/dist/ /srv/admin/
COPY --from=frontend-build /workspace/frontend/apps/portal/dist/ /srv/portal/
