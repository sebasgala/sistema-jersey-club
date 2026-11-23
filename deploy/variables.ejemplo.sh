#!/usr/bin/env bash
# Variables de despliegue de Jersey Club (Supabase + Azure).
#
# Uso:
#   cp deploy/variables.ejemplo.sh deploy/variables.sh   # variables.sh está en .gitignore
#   nano deploy/variables.sh                             # reemplaza los placeholders
#
# NUNCA subas deploy/variables.sh a git: contiene secretos.

# ---------- Azure ----------
export RG="rg-jersey-club"
export LOC="eastus2"                       # región permitida por tu cuenta de estudiante
export ACR="acrjerseyclubCAMBIAME"         # nombre GLOBAL único: solo minúsculas y números, 5-50 caracteres
export CAE="cae-jersey-club"               # entorno de Container Apps
export SWA="swa-jersey-club"               # Static Web App
export TAG="v1"                            # etiqueta de las imágenes

# ---------- Base de datos (Supabase, Session pooler) ----------
export DB_HOST="aws-0-REGION.pooler.supabase.com"
export DB_PORT="5432"
export DB_NAME="postgres"
export DB_USER="postgres.REF_DEL_PROYECTO"
export DB_PASSWORD="REEMPLAZA-CONTRASENA-DE-SUPABASE"   # sin caracteres especiales de shell ($ @ ! etc.)
export DB_SSL="true"

# ---------- Seguridad ----------
# Mínimo 32 caracteres. Genera uno con:  openssl rand -base64 48 | tr '+/' '-_' | tr -d '='
export JWT_SECRET="REEMPLAZA-POR-UN-SECRETO-ALEATORIO-DE-AL-MENOS-32-CARACTERES"
export JWT_EXPIRES_IN_SEGUNDOS="28800"

# ---------- Frontend ----------
# URL final del sitio (la imprime `az staticwebapp show`). Se usa para CORS del gateway.
export FRONTEND_URL="https://REEMPLAZA.azurestaticapps.net"
