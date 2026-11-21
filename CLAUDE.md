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
- Cada servicio es dueño exclusivo de su esquema PostgreSQL: `ms_inventario`, `ms_ventas`, `ms_clientes` (luego `ms_compras`, `ms_rrhh`).
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
- Cada venta guarda `vendedor_id` (`UUID` nullable, sin FK) para futuras comisiones en RRHH.
- `ms-ventas` escribe en `outbox_eventos` (evento `VentaConfirmada`) en la misma transacción que confirma la venta. En el MVP no hay relay.
- Estados de venta: `PENDIENTE` → `CONFIRMADA` | `RECHAZADA` | `FALLIDA` (con compensación vía `POST /api/v1/stock/reversiones`).

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

## 6. Versiones de Dependencias

- NestJS 11 (generado por `@nestjs/cli@11`). `@nestjs/swagger` está fijado a `^11` porque la serie 12 exige NestJS 12; no usar `--force` ni `--legacy-peer-deps` para saltarse conflictos de peers.
- TypeORM 1.x, `pg` 8.x, TypeScript con `strict: true`.

---

## 7. Seguridad y Git

- Nunca se versionan `.env`, credenciales ni datos personales reales de clientes.
- `.env.example` documenta cada variable con valores ficticios.
- Commits pequeños y descriptivos en español.
