#!/usr/bin/env bash
# Despliegue de Jersey Club en Azure (Container Apps + Static Web Apps) con base en Supabase.
#
# Ejecutar DESDE LA RAÍZ del repositorio, paso a paso:
#   source deploy/variables.sh
#   bash deploy/desplegar.sh infra        # 1. proveedores, grupo de recursos, ACR, entorno
#   DOCKER=docker.exe bash deploy/desplegar.sh imagenes   # 2. docker build/push de las 4 imágenes al ACR (en WSL usa el Docker de Windows)
#   bash deploy/desplegar.sh servicios    # 3. microservicios internos + gateway público
#   bash deploy/desplegar.sh frontend     # 4. frontend: Static Web App o, si la política la bloquea, Container App con Nginx (ajusta CORS solo)
#   bash deploy/desplegar.sh cors         # 5. (opcional) fija CORS a mano con FRONTEND_URL
#
# Requisitos: `az login` hecho, `source deploy/variables.sh` en la misma terminal, Node 22 para el frontend.
# Antes: aplicar database/01_schema_mvp_jersey_club.sql y 02_seed_inventario.sql en Supabase.
set -euo pipefail

requeridas=(RG LOC ACR CAE SWA TAG DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD DB_SSL JWT_SECRET)
for v in "${requeridas[@]}"; do
  [[ -n "${!v:-}" ]] || { echo "Falta la variable $v. Ejecuta: source deploy/variables.sh" >&2; exit 1; }
done
[[ "${#JWT_SECRET}" -ge 32 ]] || { echo "JWT_SECRET debe tener al menos 32 caracteres." >&2; exit 1; }

ACR_SRV="$ACR.azurecr.io"
LIMITES=(--min-replicas 0 --max-replicas 1 --cpu 0.5 --memory 1.0Gi)

credenciales_acr() {
  ACR_USER=$(az acr credential show -n "$ACR" --query username -o tsv)
  ACR_PASS=$(az acr credential show -n "$ACR" --query "passwords[0].value" -o tsv)
}

paso_infra() {
  az extension add --name containerapp --upgrade --only-show-errors
  az provider register --namespace Microsoft.App --wait
  az provider register --namespace Microsoft.OperationalInsights --wait
  az provider register --namespace Microsoft.ContainerRegistry --wait
  [[ "$(az group exists -n "$RG")" == "true" ]] || az group create -n "$RG" -l "$LOC"
  az acr create -n "$ACR" -g "$RG" --sku Basic --admin-enabled true
  # Entorno estándar en modo WorkloadProfiles (perfil Consumption): admite ingreso interno
  # entre servicios y allowInsecure. NO usar entornos "express": no sirven para esto.
  az containerapp env create -n "$CAE" -g "$RG" -l "$LOC" --environment-mode WorkloadProfiles
}

# Construye con Docker y sube al ACR. No usa `az acr build` porque ACR Tasks está bloqueado en las
# suscripciones de estudiante (TasksOperationsNotAllowed). En WSL sin Docker propio se usa el de
# Windows: DOCKER=docker.exe bash deploy/desplegar.sh imagenes
paso_imagenes() {
  local docker="${DOCKER:-docker}"
  command -v "$docker" >/dev/null || { echo "No se encuentra '$docker'. Define DOCKER=docker.exe si usas WSL." >&2; exit 1; }
  credenciales_acr
  # La contraseña viaja por stdin: no queda en el historial ni en la salida.
  az acr credential show -n "$ACR" --query "passwords[0].value" -o tsv | tr -d '
'     | "$docker" login "$ACR_SRV" -u "$ACR_USER" --password-stdin
  for s in ms-inventario ms-ventas ms-clientes gateway; do
    "$docker" build --platform linux/amd64 -t "$ACR_SRV/$s:$TAG" "./$s"
    "$docker" push "$ACR_SRV/$s:$TAG"
  done
}

# Variables comunes de base de datos para cada servicio (el secreto va como secretref).
vars_db() { # $1 = esquema
  echo "DB_HOST=$DB_HOST" "DB_PORT=$DB_PORT" "DB_NAME=$DB_NAME" "DB_USER=$DB_USER" \
    "DB_PASSWORD=secretref:db-pass" "DB_SCHEMA=$1" "DB_SSL=$DB_SSL"
}

crear_interno() { # nombre puerto esquema [vars extra...]
  local nombre=$1 puerto=$2 esquema=$3; shift 3
  az containerapp create -n "$nombre" -g "$RG" --environment "$CAE" \
    --image "$ACR_SRV/$nombre:$TAG" --registry-server "$ACR_SRV" \
    --registry-username "$ACR_USER" --registry-password "$ACR_PASS" \
    --ingress internal --target-port "$puerto" "${LIMITES[@]}" \
    --secrets "db-pass=$DB_PASSWORD" \
    --env-vars "PORT=$puerto" $(vars_db "$esquema") "$@"
  # Los servicios son internos: se permite http dentro del entorno (http://<nombre>).
  # (Azure puede tardar unos segundos en registrar la app recién creada: se reintenta.)
  local i
  for i in 1 2 3 4 5 6; do
    az containerapp ingress update -n "$nombre" -g "$RG" --allow-insecure >/dev/null 2>&1 && return 0
    sleep 10
  done
  echo "No se pudo activar allowInsecure en $nombre" >&2; return 1
}

paso_servicios() {
  credenciales_acr
  # Microservicios: ingreso INTERNO (no accesibles desde internet).
  crear_interno ms-inventario 3011 ms_inventario
  crear_interno ms-clientes 3013 ms_clientes
  crear_interno ms-ventas 3012 ms_ventas \
    "INVENTARIO_URL=http://ms-inventario/api/v1" "CLIENTES_URL=http://ms-clientes/api/v1"

  # Gateway: único endpoint público.
  az containerapp create -n gateway -g "$RG" --environment "$CAE" \
    --image "$ACR_SRV/gateway:$TAG" --registry-server "$ACR_SRV" \
    --registry-username "$ACR_USER" --registry-password "$ACR_PASS" \
    --ingress external --target-port 3010 "${LIMITES[@]}" \
    --secrets "db-pass=$DB_PASSWORD" "jwt-secret=$JWT_SECRET" \
    --env-vars PORT=3010 \
      INVENTARIO_URL=http://ms-inventario VENTAS_URL=http://ms-ventas CLIENTES_URL=http://ms-clientes \
      JWT_SECRET=secretref:jwt-secret JWT_EXPIRES_IN_SEGUNDOS="${JWT_EXPIRES_IN_SEGUNDOS:-28800}" \
      CORS_ORIGINS="${FRONTEND_URL:-http://localhost:3014}" \
      $(vars_db ms_auth)

  GW=$(az containerapp show -n gateway -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)
  echo "Gateway público: https://$GW/api/v1/salud"
}

# CORS del gateway con el origen exacto del frontend (sin barra final).
aplicar_cors() {
  local origen="${1%/}"
  az containerapp update -n gateway -g "$RG" --set-env-vars "CORS_ORIGINS=$origen" >/dev/null
  echo "CORS_ORIGINS del gateway = $origen"
}

# Intenta Azure Static Web Apps en cada región de SWA_LOCS (por defecto: centralus westeurope).
# Devuelve 0 si se creó, 2 si la política de la suscripción la bloquea en todas (RequestDisallowedByAzure)
# y 1 ante cualquier otro error (que sí se muestra).
crear_swa() {
  local loc salida bloqueadas=0 total=0
  for loc in ${SWA_LOCS:-centralus westeurope}; do
    total=$((total + 1))
    if salida=$(az staticwebapp create -n "$SWA" -g "$RG" -l "$loc" --sku Free 2>&1); then
      echo "Static Web App creada en $loc"; return 0
    fi
    if grep -q "RequestDisallowedByAzure" <<<"$salida"; then
      echo "Static Web Apps bloqueada por política en $loc"; bloqueadas=$((bloqueadas + 1))
    else
      echo "$salida" >&2; return 1
    fi
  done
  [[ $bloqueadas -eq $total ]] && return 2
  return 1
}

frontend_swa() {
  local api=$1 host token
  host=$(az staticwebapp show -n "$SWA" -g "$RG" --query defaultHostname -o tsv | tr -d '')
  aplicar_cors "https://$host"
  (cd frontend-web && npm ci && NEXT_PUBLIC_API_URL="$api" npm run build)
  token=$(az staticwebapp secrets list -n "$SWA" -g "$RG" --query properties.apiKey -o tsv | tr -d '')
  npx --yes @azure/static-web-apps-cli deploy ./frontend-web/out --deployment-token "$token" --env production
  echo "URL pública del frontend: https://$host"
}

# Plan B: Nginx sirviendo la exportación estática, como una Container App más del entorno.
frontend_contenedor() {
  local api=$1 docker="${DOCKER:-docker}" host
  command -v "$docker" >/dev/null || { echo "No se encuentra '$docker'. Define DOCKER=docker.exe si usas WSL." >&2; exit 1; }
  credenciales_acr
  az acr credential show -n "$ACR" --query "passwords[0].value" -o tsv | tr -d '
'     | "$docker" login "$ACR_SRV" -u "$ACR_USER" --password-stdin
  "$docker" build --platform linux/amd64 --build-arg "NEXT_PUBLIC_API_URL=$api" -t "$ACR_SRV/frontend-web:$TAG" ./frontend-web
  "$docker" push "$ACR_SRV/frontend-web:$TAG"
  if az containerapp show -n frontend-web -g "$RG" >/dev/null 2>&1; then
    az containerapp update -n frontend-web -g "$RG" --image "$ACR_SRV/frontend-web:$TAG" >/dev/null
  else
    az containerapp create -n frontend-web -g "$RG" --environment "$CAE"       --image "$ACR_SRV/frontend-web:$TAG" --registry-server "$ACR_SRV"       --registry-username "$ACR_USER" --registry-password "$ACR_PASS"       --ingress external --target-port 80 --min-replicas 0 --max-replicas 1 --cpu 0.25 --memory 0.5Gi >/dev/null
  fi
  host=$(az containerapp show -n frontend-web -g "$RG" --query properties.configuration.ingress.fqdn -o tsv | tr -d '')
  aplicar_cors "https://$host"
  echo "URL pública del frontend: https://$host"
}

paso_frontend() {
  local gw api rc=0
  gw=$(az containerapp show -n gateway -g "$RG" --query properties.configuration.ingress.fqdn -o tsv | tr -d '')
  api="https://$gw/api/v1"   # se graba en el build del frontend
  crear_swa || rc=$?
  case $rc in
    0) frontend_swa "$api" ;;
    2) echo "Plan B: frontend-web como Container App (Nginx) en $LOC"; frontend_contenedor "$api" ;;
    *) echo "No se pudo crear la Static Web App (ver el error arriba)." >&2; exit 1 ;;
  esac
}

paso_cors() {
  [[ -n "${FRONTEND_URL:-}" ]] || { echo "Define FRONTEND_URL." >&2; exit 1; }
  aplicar_cors "$FRONTEND_URL"
}

case "${1:-}" in
  infra) paso_infra ;;
  imagenes) paso_imagenes ;;
  servicios) paso_servicios ;;
  frontend) paso_frontend ;;
  cors) paso_cors ;;
  *) echo "Uso: bash deploy/desplegar.sh {infra|imagenes|servicios|frontend|cors}" >&2; exit 1 ;;
esac
