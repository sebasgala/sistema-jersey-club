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
├── gateway/               # API Gateway NestJS
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

> Estado actual: contratos, esquema SQL, migración del Excel, PostgreSQL en Docker y los 3 microservicios con su configuración base y entidades (sin endpoints de negocio todavía). `gateway` y `frontend-web` están pendientes.

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
```

Cada servicio usa `DB_SCHEMA` para conectarse solo a su esquema (`ms_inventario`, `ms_ventas`, `ms_clientes`). `ms-ventas` además define `INVENTARIO_URL` y `CLIENTES_URL`.

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

### 3. Regenerar la migración del Excel (opcional)

`02_seed_inventario.sql` se genera desde `docs/STOCK 2026 21-11-2026.xlsx`; no se edita a mano.

```bash
python -I scripts-migracion/limpiar_y_migrar_excel.py
```

Produce `scripts-migracion/STOCK_LIMPIO_2026.xlsx` (datos depurados más la hoja `REPORTE_DEPURACION` con cada corrección aplicada) y vuelve a escribir el seed. Los UUID son deterministas: regenerar no duplica datos.

### 4. Compilar y arrancar los microservicios

```bash
cd ms-inventario && npm install && npm run build && cd ..
cd ms-ventas     && npm install && npm run build && cd ..
cd ms-clientes   && npm install && npm run build && cd ..
```

En terminales separadas:

```bash
cd ms-inventario && npm run start:dev
cd ms-ventas     && npm run start:dev
cd ms-clientes   && npm run start:dev
```

### 5. Verificar

- `GET http://localhost:<puerto>/api/v1/salud` devuelve el servicio y el esquema conectado.
- Swagger de cada servicio en `http://localhost:<puerto>/api/docs`.

---

## Convenciones de API (resumen)

- Prefijo `/api/v1`, recursos en español y plural.
- Respuesta: `{ status, message, data }`. Error: `{ status, error, details[], error_code, correlation_id }`.
- Cabeceras `X-Correlation-Id` (trazabilidad) e `Idempotency-Key` (operaciones que mueven stock o crean ventas).
- Stock insuficiente: `409` con `error_code: STOCK_INSUFICIENTE`.
