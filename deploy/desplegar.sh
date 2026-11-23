#!/usr/bin/env bash
# Despliegue de Jersey Club en Azure (Container Apps + Static Web Apps) con base en Supabase.
#
# Ejecutar DESDE LA RAÍZ del repositorio, paso a paso:
#   source deploy/variables.sh
#   bash deploy/desplegar.sh infra        # 1. proveedores, grupo de recursos, ACR, entorno
#   bash deploy/desplegar.sh imagenes     # 2. construye las 4 imágenes en Azure (sin Docker local)
#   bash deploy/desplegar.sh servicios    # 3. microservicios internos + gateway público
#   bash deploy/desplegar.sh frontend     # 4. Static Web App y publicación de frontend-web/out
#   bash deploy/desplegar.sh cors         # 5. ajusta CORS del gateway con FRONTEND_URL
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
  [[ "$(az group exists -n "$RG")" == "true" ]] || az group create -n "$RG" -l "$LOC"
  az acr create -n "$ACR" -g "$RG" --sku Basic --admin-enabled true
  az containerapp env create -n "$CAE" -g "$RG" -l "$LOC"
}

paso_imagenes() {
  for s in ms-inventario ms-ventas ms-clientes gateway; do
    az acr build -r "$ACR" -g "$RG" -t "$s:$TAG" "./$s"
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

paso_frontend() {
  az staticwebapp create -n "$SWA" -g "$RG" -l "$LOC" --sku Free || true
  GW=$(az containerapp show -n gateway -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)
  # La URL del gateway se graba al compilar.
  (cd frontend-web && npm ci && NEXT_PUBLIC_API_URL="https://$GW/api/v1" npm run build)
  TOKEN=$(az staticwebapp secrets list -n "$SWA" -g "$RG" --query properties.apiKey -o tsv)
  npx --yes @azure/static-web-apps-cli deploy ./frontend-web/out --deployment-token "$TOKEN" --env production
  echo "Sitio: https://$(az staticwebapp show -n "$SWA" -g "$RG" --query defaultHostname -o tsv)"
  echo "Copia esa URL en FRONTEND_URL (deploy/variables.sh) y ejecuta: bash deploy/desplegar.sh cors"
}

paso_cors() {
  [[ -n "${FRONTEND_URL:-}" ]] || { echo "Define FRONTEND_URL." >&2; exit 1; }
  az containerapp update -n gateway -g "$RG" --set-env-vars "CORS_ORIGINS=$FRONTEND_URL"
}

case "${1:-}" in
  infra) paso_infra ;;
  imagenes) paso_imagenes ;;
  servicios) paso_servicios ;;
  frontend) paso_frontend ;;
  cors) paso_cors ;;
  *) echo "Uso: bash deploy/desplegar.sh {infra|imagenes|servicios|frontend|cors}" >&2; exit 1 ;;
esac
