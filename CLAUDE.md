# CLAUDE.md — Constitución Técnica del Sistema Jersey Club

Este archivo es de cumplimiento obligatorio para cualquier persona o agente que modifique este repositorio. Ante conflicto entre una petición puntual y estas reglas, se detiene el trabajo y se consulta antes de romperlas.

Documentos de contexto (leer antes de diseñar o cambiar contratos):

- [docs/Desisiones contexto actual.md](docs/Desisiones%20contexto%20actual.md): alcance del MVP y modelo de datos.
- [docs/00_Informe_Auditoria_Fase0.md](docs/00_Informe_Auditoria_Fase0.md): brechas entre el Excel y el Modelo Semifinal v5.0.0.
- [docs/04_Patrones_Integracion_Obsidian.md](docs/04_Patrones_Integracion_Obsidian.md): patrones de integración, saga orquestada e idempotencia.
- `docs/STOCK 2026 21-11-2026.xlsx`: fuente de datos legada (solo lectura; nunca se modifica).

---

## 1. Las 4 Directrices Obligatorias

### Directriz 1 — Arquitectura Modular

- El sistema se compone de bloques independientes: hoy `ms-inventario`, `ms-ventas` y `ms-clientes`; preparados para `ms-compras` y `ms-rrhh`.
- Cada servicio es dueño exclusivo de su esquema PostgreSQL: `ms_inventario`, `ms_ventas`, `ms_clientes` (luego `ms_compras`, `ms_rrhh`). El gateway es dueño de `ms_auth` (usuarios y roles): ningún microservicio lo lee; `vendedor_id` y `anulada_por` son UUID lógicos hacia `ms_auth.usuarios.id`, sin FK.
- **Prohibido:** `FOREIGN KEY` entre esquemas, `JOIN` SQL entre esquemas y que un servicio lea o escriba tablas de otro.
- Las referencias entre servicios son **`UUID` lógicos sin constraint** más **snapshots `JSONB`** con los datos congelados en el momento de la operación (cliente, variante, precio, costo).
- La comunicación entre servicios es solo por HTTP contra los contratos de `contracts/`. Si un servicio cae, los demás siguen operando con sus snapshots.
- Todas las claves primarias son `UUID` (`uuid_generate_v4()`, extensión `uuid-ossp`).

### Directriz 2 — Integridad del Inventario (Regla Crítica)

- **Ninguna venta se procesa sin stock disponible de la variante exacta:** `Producto + Talla/Medida + Versión/Modelo + Adicional Parche + Adicional Dorsal`.
- La verificación y el descuento ocurren en **una sola transacción** en `ms-inventario`: `SELECT ... FOR UPDATE` sobre la variante, `CHECK (stock_actual >= 0)` en la tabla y registro en el Kardex en la misma transacción.
- Todo cambio de stock genera una fila en `movimientos_stock` (tipos: `SALDO_INICIAL`, `VENTA`, `REVERSION_VENTA`, `AJUSTE_ENTRADA`, `AJUSTE_SALIDA`; `cantidad` siempre positiva y un `CHECK` obliga a que `stock_nuevo` cuadre con `stock_anterior`). Nunca se modifica `stock_actual` sin su movimiento.
- Stock insuficiente responde **`409 Conflict`** con `error_code: STOCK_INSUFICIENTE`. Nunca se permite stock negativo.
- Descuentos y reversiones son idempotentes por `Idempotency-Key`.

### Directriz 3 — Trazabilidad de Costos

- `variantes.valor_jersey_club` (`numeric(10,2)`) es el costo de llegada (landed cost) entregado por contabilidad.
- Al vender, el costo unitario se **congela** en `detalle_ventas.valor_jersey_club_unitario` junto al precio de venta. La ganancia histórica no cambia si el costo de la variante cambia después.
- Margen neto real = `precio_venta_unitario − valor_jersey_club_unitario` (por línea y agregado por venta o periodo).
- Se reserva `origen_costo` (`LEGADO_EXCEL` / `IMPORTACION`) para que `ms-compras` alimente el prorrateo de importaciones desde China sin romper el contrato.
- El dinero siempre es `numeric(10,2)` en base de datos (con `transformer` en TypeORM). Nunca `float`.

### Directriz 4 — Flujo Comercial Cerrado

- `ms-clientes` valida la identificación ecuatoriana por tipo:
  - `CEDULA`: 10 dígitos (con dígito verificador módulo 10).
  - `RUC`: 13 dígitos.
  - `PASAPORTE`: alfanumérico, 5 a 20 caracteres.
  - `CONSUMIDOR_FINAL`: `9999999999999`; registro único precargado con id fijo `00000000-0000-4000-8000-000000000001`; teléfono, provincia y ciudad opcionales.
- El cierre de venta es **un solo clic** orquestado por `ms-ventas`: descuenta stock en `ms-inventario`, registra el método de pago (`TRANSFERENCIA`, `EFECTIVO`, `TARJETA`) y confirma la venta.
- Cada venta guarda `vendedor_id` (`UUID` nullable, sin FK) para futuras comisiones en RRHH. Lo asigna el servidor: es el usuario autenticado (`X-User-Id` que pone el gateway); el valor que envíe el cliente se ignora.
- `ms-ventas` escribe en `outbox_eventos` (evento `VentaConfirmada`) en la misma transacción que confirma la venta. En el MVP no hay relay.
- Estados de venta: `PENDIENTE` → `CONFIRMADA` | `RECHAZADA` | `FALLIDA` (con compensación vía `POST /api/v1/stock/reversiones`). Una venta `CONFIRMADA` puede pasar a `ANULADA` con `POST /api/v1/ventas/:id/anular` (devuelve el stock exacto al Kardex como `REVERSION_VENTA`, guarda motivo y usuario, y registra `VentaAnulada` en el outbox); es idempotente y las anuladas no cuentan en el dashboard.

### Visión objetivo de las directrices (reglas inquebrantables de diseño, validación y despliegue)

Las cuatro directrices rigen también lo que aún no está construido. Todo servicio futuro nace bajo ellas; en el MVP se implementa lo descrito arriba.

1. **Arquitectura Modular:** bloques independientes e interconectados: `Inventario`, `Ventas/Facturación`, `Compras/Logística`, `RRHH` y `Clientes`. El fallo, mantenimiento o redespliegue de un módulo no detiene a los demás ni acopla sus bases de datos (sin FK ni JOIN entre esquemas; UUID lógicos y snapshots).
2. **Integridad del Inventario:** ninguna venta o factura se procesa ni se confirma con stock insuficiente de la variante exacta (camiseta, talla, versión, parches). Stock y Kardex se actualizan de forma atómica y en tiempo real ante toda compra, venta o anulación (hoy: venta, anulación y ajustes; las compras llegarán con `ms-compras`).
3. **Trazabilidad de Costos en Compras:** `ms-compras` prorrateará los costos de importación internacional (flete por volumen o libra, manejo de courier) y los indexará al costo base unitario de cada camiseta, de modo que el margen real de cada venta se calcule automáticamente. El contrato ya lo prevé con `origen_costo` (`IMPORTACION`) sin romper `v1`.
4. **Flujo Comercial Cerrado:** la facturación está acoplada al módulo de ventas: registra los datos del cliente según la normativa de Ecuador (cédula, RUC, pasaporte, consumidor final) y dispara en una sola operación la baja de inventario y, cuando exista `ms-rrhh`, el cálculo y registro de la comisión del vendedor (hoy se guarda `vendedor_id` y el evento `VentaConfirmada` en el outbox).

Ante cualquier conflicto entre una petición y estas directrices se detiene el trabajo y se consulta, como indica el encabezado de este archivo.


---

## 2. Puertos Locales (asignados el 2026-11-21)

Elegidos tras auditar `docker ps -a`, `netstat -ano` y prueba de bind. **Prohibido** detener, modificar o reutilizar puertos de otros proyectos (en esta máquina corren contenedores `cozy_v2_*` en 3001–3006, 3080, 5435, 5672, 5675, 15672, 15675; contenedores detenidos reservan 5433 y 5532).

| Componente | Puerto host |
|---|---|
| PostgreSQL 16 (contenedor `pg-jersey-club`) | `5436` → 5432 interno |
| `gateway` | `3010` |
| `ms-inventario` | `3011` |
| `ms-ventas` | `3012` |
| `ms-clientes` | `3013` |
| `frontend-web` | `3014` |

Si alguno se ocupa en el futuro, se elige otro libre y se actualiza esta tabla y el `README.md`; nunca se libera un puerto ajeno.

---

## 3. Convenciones de Código (NestJS + TypeScript)

### Nombres

- Dominio, recursos, tablas y columnas en **español**; recursos REST y tablas en **plural** (`productos`, `variantes`, `ventas`, `clientes`).
- Archivos en kebab-case con sufijo de rol: `productos.controller.ts`, `productos.service.ts`, `producto.entity.ts`, `crear-producto.dto.ts`.
- Tablas y columnas en `snake_case`; propiedades TypeScript en `camelCase` mapeadas con `name:` en la entidad.
- Enums en `MAYUSCULAS_CON_GUION_BAJO`.

### Estructura de cada microservicio

```text
ms-<nombre>/
  src/
    main.ts
    app.module.ts
    common/            # filtros, interceptores, middleware de correlation id
    <recurso>/         # <recurso>.module.ts · .controller.ts · .service.ts · entities/ · dto/
  test/
  .env.example         # versionado; .env nunca se versiona
```

### Arranque obligatorio (`main.ts`)

- Prefijo global `app.setGlobalPrefix('api/v1')`.
- `ValidationPipe` global con `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- Swagger/OpenAPI en `/api/docs`, coherente con el contrato de `contracts/`.
- Filtro global de excepciones que produce el formato de error uniforme.
- Logs en JSON que incluyen `correlation_id`.

### Formato de respuesta

Éxito:

```json
{ "status": 200, "message": "Variante encontrada", "data": { } }
```

Error:

```json
{
  "status": 409,
  "error": "Conflict",
  "details": ["Stock insuficiente para la variante 3f2c..."],
  "error_code": "STOCK_INSUFICIENTE",
  "correlation_id": "b7e1..."
}
```

### Cabeceras

- `X-Correlation-Id`: se acepta o se genera en el gateway, se propaga en toda llamada entre servicios y se devuelve en la respuesta.
- `Idempotency-Key`: obligatoria en toda operación que mueve stock o crea una venta. Repetir la misma clave devuelve el mismo resultado sin efectos duplicados.

### HTTP

- `GET` lee (`200`), `POST` crea (`201` + `Location`), `PATCH` parcial (`200`), `PUT`/`DELETE` idempotentes (`204`).
- `400` validación, `404` no existe, `409` conflicto (stock, duplicados), `503` dependencia caída. Nunca `500` para un caso de negocio.
- Sin verbos en las URIs.
- Llamadas entre servicios con timeout (3 s inventario, 2 s clientes) y como máximo 2 reintentos con backoff, solo en operaciones idempotentes.

---

## 4. API-First y Evolución de Contratos

1. El contrato OpenAPI 3.0 de cada servicio vive en `contracts/` y se escribe y revisa **antes** del código.
2. Dentro de `v1` solo se permiten cambios aditivos (campos opcionales, endpoints nuevos).
3. Quitar o renombrar campos, o cambiar tipos, exige `/api/v2` manteniendo `v1` vigente.
4. El código se ajusta al contrato, nunca al revés.

---

## 5. Base de Datos y Migraciones

- Una instancia PostgreSQL 16 local con un esquema por servicio; en producción cada servicio puede apuntar a su propia base sin cambios de código.
- El esquema lo gobierna `database/` (SQL versionado e idempotente, aplicado en orden numérico). TypeORM nunca crea tablas: `synchronize: false` siempre.
- Cada servicio se conecta con `schema` y `search_path` limitados a su propio esquema (`DB_SCHEMA`).
- `database/02_seed_inventario.sql` es **generado**: no se edita a mano; se regenera con `scripts-migracion/limpiar_y_migrar_excel.py` (solo openpyxl), que es determinista (UUID v5) y nunca modifica el Excel original.

### Reglas de implementación vigentes

- **Idempotencia en ms-inventario:** `Idempotency-Key` de 8 a 48 caracteres (se compone como `<clave>:<variante_id>` dentro de `VARCHAR(100)`). ms-ventas usa el id de la venta como clave.
- **Bloqueos:** toda operación de stock bloquea las variantes con `SELECT ... FOR UPDATE` **en orden de id** para evitar interbloqueos.
- **Kardex valorizado:** cada movimiento guarda `costo_unitario`; una repetición idempotente devuelve el costo original.
- **Dinero:** se calcula en centavos enteros (`common/dinero.util.ts`), nunca con `number` de punto flotante.
- **Gateway:** único punto público (JWT obligatorio salvo `/auth/login` y `/salud`). Los microservicios no validan JWT ni roles: confían en `X-User-Id` y `X-User-Role` (el gateway descarta las que envíe el cliente), así que en producción no deben exponerse fuera de la red interna.
- **Usuarios y roles:** viven en `ms_auth.usuarios` (bcrypt, rol `ADMIN` | `VENDEDOR`). **No hay usuarios por defecto**: se crean con `npm run crear-usuario` en `gateway/`. El login busca por `username` o `email` sin distinguir mayúsculas y bloquea tras 5 intentos fallidos por IP. `gateway/.env` no contiene credenciales de administrador.
- **Permisos (los aplica el gateway, no solo la pantalla):** `VENDEDOR` puede leer, registrar ventas y gestionar clientes; recibe `403 ROL_NO_AUTORIZADO` al crear/editar productos o variantes, cambiar precios, ajustar stock o anular ventas, y el gateway elimina de todas sus respuestas los campos de costo y ganancia. Todo cambio de permisos se refleja en `contracts/gateway.openapi.yaml` y en la prueba E2E.
- **Contenedores:** cada servicio tiene su `Dockerfile` multi-etapa y `docker-compose.yml` levanta todo con `--profile stack` (solo el gateway publica puerto).
- **Cambios de esquema:** solo aditivos e idempotentes en `01_schema_mvp_jersey_club.sql` (`ADD COLUMN IF NOT EXISTS`), reaplicables sobre una base existente.
- **Antes de dar por terminada una funcionalidad** se ejecuta `pruebas-e2e/flujo-venta.e2e.mjs` (no necesita credenciales: crea y borra sus propios usuarios en `ms_auth`); debe terminar con todas las verificaciones OK y la huella de la base intacta.

## 6. Versiones de Dependencias

- NestJS 11 (generado por `@nestjs/cli@11`). `@nestjs/swagger` está fijado a `^11` porque la serie 12 exige NestJS 12; no usar `--force` ni `--legacy-peer-deps` para saltarse conflictos de peers.
- TypeORM 1.x, `pg` 8.x, TypeScript con `strict: true`.

---

## 7. Seguridad y Git

- Nunca se versionan `.env`, credenciales ni datos personales reales de clientes.
- `.env.example` documenta cada variable con valores ficticios.
- Commits pequeños y descriptivos en español.
