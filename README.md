# Sistema Jersey Club

ERP ligero para Jersey Club: inventario por variante exacta, ventas con ganancia real y clientes con identificación ecuatoriana. Reemplaza el control de stock en Excel (`STOCK 2026 21-11-2026.xlsx`) por un sistema accesible desde móvil y PC.

El MVP está compuesto por **3 mini-microservicios desacoplados**, un gateway y un frontend web mobile-first:

| Servicio | Responsabilidad |
|---|---|
| `ms-inventario` | Catálogo generalizado (`productos`, `variantes`), stock en tiempo real y Kardex (`movimientos_stock`). |
| `ms-ventas` | Ventas, detalle con costo congelado, métodos de pago, ganancia real y `outbox_eventos`. |
| `ms-clientes` | Datos de contacto, identificación tributaria y despacho (Servientrega / Laar Courier). |
| `gateway` | Punto de entrada único: enrutamiento, CORS y `X-Correlation-Id`. |
| `frontend-web` | Interfaz mobile-first y dashboard ejecutivo. |

---

## Directrices arquitectónicas

1. **Arquitectura modular.** Cada servicio es dueño de su esquema (`ms_inventario`, `ms_ventas`, `ms_clientes`). Cero `FOREIGN KEY` o `JOIN` entre esquemas: las referencias son `UUID` lógicos y los datos ajenos se guardan como snapshots `JSONB`. Preparado para sumar `ms-compras` y `ms-rrhh`.
2. **Integridad del inventario.** Ninguna venta se procesa sin stock de la variante exacta (Producto + Talla/Medida + Versión/Modelo + Parche + Dorsal). El descuento es atómico y transaccional, y cada movimiento queda en el Kardex.
3. **Trazabilidad de costos.** `valor_jersey_club` (costo de llegada) vive en la variante y se congela en `detalle_ventas` al vender, lo que permite calcular el margen neto real. Queda listo para el prorrateo de importaciones desde China en `ms-compras`.
4. **Flujo comercial cerrado.** Validación de `CEDULA`, `RUC`, `PASAPORTE` y `CONSUMIDOR_FINAL`. Cierre de venta en un clic: descuenta stock, registra el pago (`TRANSFERENCIA`, `EFECTIVO`, `TARJETA`) y deja `vendedor_id` y `outbox_eventos` listos para comisiones en RRHH.

El detalle normativo (convenciones, formatos de respuesta, cabeceras) está en [CLAUDE.md](CLAUDE.md). El contexto de negocio y las decisiones están en [docs/](docs/).

---

## Tecnologías utilizadas

| Capa | Tecnología | Uso |
|---|---|---|
| Backend | Node.js + NestJS + TypeScript | Microservicios y gateway |
| ORM | TypeORM | Entidades, repositorios y migraciones |
| Base de datos | PostgreSQL 16 | Un esquema por microservicio |
| Contenedores | Docker y Docker Compose | Entorno local reproducible |
| Contratos | Swagger / OpenAPI 3.0 | Diseño API-First en `contracts/` y documentación en `/api/docs` |
| Validación | class-validator + class-transformer | DTOs con `ValidationPipe` global |
| ETL | Python + Pandas / Openpyxl | Depuración y migración del Excel legado |
| Frontend (proyectado) | Next.js + Tailwind CSS | Interfaz mobile-first y dashboard |
| Despliegue (proyectado) | Azure Container Apps + Azure Static Web Apps | Microservicios en contenedores y frontend estático |
| Base gestionada (proyectada) | Supabase / PostgreSQL gestionado | Base de datos en la nube |

---

## Estructura del monorepo

```text
sistema-jersey-club/
├── CLAUDE.md              # Constitución técnica (reglas obligatorias)
├── README.md
├── docker-compose.yml     # PostgreSQL 16 (pg-jersey-club, puerto 5436)
├── .env.example           # Credenciales de ejemplo del contenedor
├── docs/                  # Decisiones, auditoría, patrones y Excel fuente
├── contracts/             # Contratos OpenAPI 3.0 por servicio (API-First)
├── database/              # SQL de esquemas y scripts de inicialización
├── scripts-migracion/     # ETL Python del Excel legado
├── ms-inventario/         # Microservicio NestJS de inventario
├── ms-ventas/             # Microservicio NestJS de ventas
├── ms-clientes/           # Microservicio NestJS de clientes
├── gateway/               # API Gateway NestJS (JWT + enrutamiento)
├── pruebas-e2e/           # Prueba end-to-end del flujo comercial
└── frontend-web/          # Next.js + Tailwind CSS
```

---

## Puertos locales asignados

Elegidos para no chocar con otros proyectos de la máquina de desarrollo. No se reutilizan ni se liberan puertos ajenos.

| Componente | URL local |
|---|---|
| PostgreSQL 16 | `localhost:5436` |
| `gateway` | `http://localhost:3010` |
| `ms-inventario` | `http://localhost:3011/api/v1` · Swagger: `/api/docs` |
| `ms-ventas` | `http://localhost:3012/api/v1` · Swagger: `/api/docs` |
| `ms-clientes` | `http://localhost:3013/api/v1` · Swagger: `/api/docs` |
| `frontend-web` | `http://localhost:3014` |

---

## Puesta en marcha local

> Estado actual: los 3 microservicios, el gateway con usuarios y roles reales (`ms_auth`), el frontend web mobile-first y los `Dockerfile` de los 4 servicios, verificados con la prueba end-to-end y con una prueba de la interfaz.

### Arranque rápido de todo el sistema

Con los `.env` ya creados (paso 1), las dependencias instaladas (`npm install` en cada proyecto) y **al menos un usuario creado** (paso 2b), desde la raíz del repositorio en Git Bash:

```bash
docker compose up -d pg-jersey-club && \
for s in ms-inventario ms-clientes ms-ventas gateway; do (cd $s && npm run build >/dev/null && (node dist/main > ../$s.log 2>&1 &)); done && \
cd frontend-web && npm run dev
```

Abre `http://localhost:3014` e inicia sesión con tu usuario (o tu correo). El rol del usuario (**Administrador** o **Vendedor**) decide lo que ves y puedes hacer. Los logs de cada servicio quedan en `<servicio>.log` en la raíz (ignorados por git). Para detenerlos: `Ctrl+C` en el frontend y cierra los procesos `node` de los puertos 3010–3013.

### Requisitos

- Node.js 20 LTS o superior y npm
- Python 3.11 o superior con `openpyxl` (solo para regenerar el seed)
- Docker Desktop con Docker Compose v2

### 1. Variables de entorno

Copia cada `.env.example` como `.env` y pon la misma contraseña de base de datos en todos (los `.env` nunca se versionan):

```bash
cp .env.example               .env            # credenciales del contenedor PostgreSQL
cp ms-inventario/.env.example ms-inventario/.env
cp ms-ventas/.env.example     ms-ventas/.env
cp ms-clientes/.env.example   ms-clientes/.env
cp gateway/.env.example       gateway/.env
```

Cada servicio usa `DB_SCHEMA` para conectarse solo a su esquema (`ms_inventario`, `ms_ventas`, `ms_clientes`; el gateway usa `ms_auth`). `ms-ventas` además define `INVENTARIO_URL` y `CLIENTES_URL`.

`gateway/.env` ya **no** lleva usuario ni contraseña de administrador: los usuarios viven en la base (`ms_auth.usuarios`). Solo necesita la conexión a PostgreSQL y el secreto de firma del JWT:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # valor para JWT_SECRET (mínimo 32 caracteres)
```

### 2. Levantar PostgreSQL y cargar datos

```bash
docker compose up -d pg-jersey-club
docker compose ps            # esperar estado "healthy"
```

En el primer arranque (volumen `pg_jersey_club_data` vacío) el contenedor aplica en orden `database/01_schema_mvp_jersey_club.sql` y `database/02_seed_inventario.sql`. Ambos scripts son idempotentes y se pueden reaplicar a mano:

```bash
set -a; . ./.env; set +a
docker exec -i pg-jersey-club psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < database/01_schema_mvp_jersey_club.sql
docker exec -i pg-jersey-club psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < database/02_seed_inventario.sql
```

### 2b. Crear usuarios (no hay usuarios por defecto)

Con la base arriba y el esquema aplicado, crea cada usuario con su rol. La contraseña se guarda con `bcrypt`; si el `username` ya existe, se actualiza (útil para cambiar la clave):

```bash
cd gateway
npm run crear-usuario -- <username> <email> "<Nombre Completo>" <ADMIN|VENDEDOR> "<contraseña de 10+ caracteres>"

# ejemplos
npm run crear-usuario -- sebas sebas@ejemplo.com "Sebastián Pérez" ADMIN "una-clave-larga-y-segura"
npm run crear-usuario -- valeria valeria@ejemplo.com "Valeria Mora" VENDEDOR "otra-clave-larga-y-segura"
```

Para no dejar la contraseña en el historial de la terminal usa `CREAR_USUARIO_PASSWORD=...` en lugar del quinto argumento.

| Rol | Puede |
|---|---|
| `ADMIN` | Todo: costos y márgenes, precios, productos y variantes, ajustes de stock, ventas, clientes y **anular ventas**. |
| `VENDEDOR` | Registrar ventas (queda como `vendedor_id` de la venta), consultar stock, clientes e historial. **No recibe costos ni ganancias** en ninguna respuesta y no puede editar precios, catálogo, stock ni anular. |

La restricción la aplica el gateway (no solo la pantalla). Los usuarios se desactivan con `UPDATE ms_auth.usuarios SET activo = FALSE WHERE username = '...'`.

### 3. Regenerar la migración del Excel (opcional)

`02_seed_inventario.sql` se genera desde `docs/STOCK 2026 21-11-2026.xlsx`; no se edita a mano.

```bash
python -I scripts-migracion/limpiar_y_migrar_excel.py
```

Produce `scripts-migracion/STOCK_LIMPIO_2026.xlsx` (datos depurados más la hoja `REPORTE_DEPURACION` con cada corrección aplicada) y vuelve a escribir el seed. Los UUID son deterministas: regenerar no duplica datos.

### 4. Compilar y arrancar los microservicios y el gateway

```bash
for s in ms-inventario ms-ventas ms-clientes gateway; do (cd $s && npm install && npm run build); done
```

En terminales separadas:

```bash
cd ms-inventario && npm run start:dev
cd ms-ventas     && npm run start:dev
cd ms-clientes   && npm run start:dev
cd gateway       && npm run start:dev
```

### 5. Verificar

- `GET http://localhost:3010/api/v1/salud` muestra el estado del gateway y de los 3 servicios.
- `POST http://localhost:3010/api/v1/auth/login` con `{ "usuario": "<username o correo>", "contrasena": "..." }` devuelve el JWT (con `sub`, `username`, `email`, `nombre` y `role`); el resto de rutas exige `Authorization: Bearer <token>`. Tras 5 intentos fallidos desde una IP, el sexto se bloquea 15 minutos.
- Swagger de cada componente en `http://localhost:<puerto>/api/docs`.

### 6. Prueba end-to-end

Con PostgreSQL arriba (esquema aplicado), los 4 proyectos compilados y los puertos 3010–3013 libres:

```bash
node pruebas-e2e/flujo-venta.e2e.mjs
```

No necesita credenciales: crea sus propios usuarios temporales (admin, vendedor e inactivo) con el script `crear-usuario` y los borra al terminar. Levanta los 4 procesos y recorre todo el flujo a través del gateway: login por usuario y por correo, JWT con rol, permisos de ADMIN y VENDEDOR (el vendedor no recibe costos y recibe `403` en operaciones de administración), filtros y KPIs, alta de productos, variantes y clientes, venta, reintento idempotente, `409` sin stock, dos ventas simultáneas por la última unidad, compensación, dashboard, venta con `ms-clientes` caído, `vendedor_id` automático (no falseable), **anulación de ventas** (incluida la simultánea) y bloqueo de login. Comprueba cada efecto en PostgreSQL, borra los datos de prueba y verifica que la base quedó idéntica (huella antes/después).

---

## Endpoints (vía gateway `http://localhost:3010/api/v1`)

| Método y ruta | Servicio | Uso |
|---|---|---|
| `POST /auth/login` · `GET /salud` | gateway | JWT con el rol del usuario (`ms_auth`) · estado de los servicios (públicos) |
| `GET /variantes` | inventario | Filtros (`categoria`, `marca_equipo`, `temporada`, `talla_medida`, `version_modelo`, `adicional_parche`, `adicional_dorsal`, `busqueda`, `solo_disponibles`, `sin_costo`) + KPIs |
| `POST /productos` · `POST /variantes` · `PATCH /variantes/:id` | inventario | Catálogo, respetando el índice único de la variante exacta |
| `PATCH /variantes/:id/precios` | inventario | Carga ágil de `valor_jersey_club` y `pvp_sugerido` |
| `POST /stock/ajustes` · `GET /stock/movimientos` | inventario | Entradas y ajustes manuales · Kardex |
| `POST /stock/descuentos` · `POST /stock/reversiones` | inventario | Descuento atómico y compensación (usados por ms-ventas) |
| `GET /clientes?busqueda=` · `GET /clientes/identificacion/:id` · `POST` · `PATCH` | clientes | Búsqueda y alta con validación ecuatoriana |
| `POST /ventas` | ventas | Cierre en un clic (requiere `Idempotency-Key`); `vendedor_id` = usuario autenticado |
| `POST /ventas/:id/anular` | ventas | Anula una venta confirmada, devuelve el stock al Kardex y registra `VentaAnulada` (solo `ADMIN`; requiere `motivo`) |
| `GET /ventas` · `GET /ventas/:id` · `GET /ventas/dashboard` | ventas | Historial y KPIs del dashboard (las anuladas no cuentan) |

Detalle completo en [contracts/](contracts/), incluida la tabla de permisos por rol en `gateway.openapi.yaml`.

---

## Docker: stack completo y despliegue

Cada servicio tiene un `Dockerfile` multi-etapa (compila, instala solo dependencias de producción, corre con un usuario sin privilegios y trae `HEALTHCHECK`). `docker-compose.yml` mantiene **la base de datos como único servicio por defecto** y agrega el resto bajo el perfil `stack`:

```bash
# solo la base (uso diario con los servicios en start:dev)
docker compose up -d pg-jersey-club

# todo el stack en contenedores (misma topología que producción)
export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"
docker compose --profile stack up -d --build

# crear el primer usuario dentro del contenedor
docker compose exec -e CREAR_USUARIO_PASSWORD="una-clave-larga-y-segura" gateway \
  node scripts/crear-usuario.mjs sebas sebas@ejemplo.com "Sebastián Pérez" ADMIN
```

En el perfil `stack` **solo el gateway publica puerto (3010)**: los microservicios quedan en la red interna, porque confían en las cabeceras `X-User-Id` y `X-User-Role` que pone el gateway. El frontend (`frontend-web`) se publica aparte como sitio estático (`npm run build` genera `out/`).

---

## Convenciones de API (resumen)

- Prefijo `/api/v1`, recursos en español y plural.
- Respuesta: `{ status, message, data }`. Error: `{ status, error, details[], error_code, correlation_id }`.
- Cabeceras `X-Correlation-Id` (trazabilidad) e `Idempotency-Key` (operaciones que mueven stock o crean ventas).
- Stock insuficiente: `409` con `error_code: STOCK_INSUFICIENTE`.
