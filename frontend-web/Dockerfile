# syntax=docker/dockerfile:1.7
# Imagen de frontend-web: exportación estática de Next.js servida por Nginx.
# Se usa cuando Azure Static Web Apps no está disponible (política de regiones de la suscripción).
# La URL del gateway se graba al compilar:
#   docker build --build-arg NEXT_PUBLIC_API_URL=https://<gateway>/api/v1 -t jersey-club/frontend-web ./frontend-web
ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.27-alpine

# ---- 1) compilación (genera /app/out)
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL
RUN test -n "$NEXT_PUBLIC_API_URL" || (echo "Falta --build-arg NEXT_PUBLIC_API_URL" >&2; exit 1)
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 2) servidor estático
FROM ${NGINX_IMAGE} AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
