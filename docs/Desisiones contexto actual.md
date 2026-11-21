# Decisiones de Contexto Actual — MVP Sistema Jersey Club

Documento de decisiones arquitectónicas, funcionales y de alcance del MVP. Cruza tres fuentes: [[00_Informe_Auditoria_Fase0]], [[RoadMap]] y el Modelo Semifinal v5.0.0 (53 tablas).

---

## 1. Contexto y Propósito del MVP (Mini-Microservicios vs. Monolito de 53 Tablas)

### 1.1 Por qué se recorta el alcance

El Modelo Semifinal v5.0.0 es un diseño completo de ERP: 53 entidades en 8 módulos, con serialización por prenda, doble modalidad de personalización, landed cost prorrateado, comisiones, contabilidad de partida doble y tesorería. Es correcto como visión final, pero como primer entregable tiene problemas concretos que la auditoría dejó a la vista:

- **Los datos reales no alimentan la mayor parte del modelo.** El Excel `STOCK 2026 21-11-2026.xlsx` solo tiene stock por talla, equipo, versión y parches. No trae clientes, vendedores, bodegas, fechas ni desglose de costos. Casi todo Compras, RRHH, Contabilidad y Tesorería quedaría sin datos de origen.
- **El acoplamiento actual impide partir el sistema.** El modelo tiene varias FK cruzadas (por ejemplo `PEDIDO_VENTA` hacia `EMPLEADO`, `GASTO_PUBLICITARIO_DIARIO` y `COURIER`; `UNIDAD_FISICA` hacia `ORDEN_IMPORTACION`). Cada una habría que deshacer antes de separar servicios.
- **Tiempo hasta el primer valor.** El objetivo operativo inmediato es dejar de depender del Excel: ver stock exacto, registrar ventas y conocer la ganancia real, desde el celular o el PC.

Decisión: reducir el MVP a **3 mini-microservicios independientes**, cada uno con su propio esquema, y dejar el resto del Modelo Semifinal como documento de referencia para fases posteriores.

| Microservicio | Responsabilidad |
|---|---|
| `ms-inventario` | Catálogo generalizado, variantes, stock en tiempo real, Kardex ligero |
| `ms-ventas` | Pedidos, detalle de venta, métodos de pago, ganancia real |
| `ms-clientes` | Datos generales de contacto y despacho |

Nota sobre el [[RoadMap]]: el roadmap original preveía `ms-inventario` + `ms-ventas` en la Fase 1. Esta decisión agrega `ms-clientes` como tercer servicio propio, para no mezclar datos personales con ventas ni inventario.

### 1.2 Dentro del alcance actual

- Control de stock generalizado: camisetas y otros productos, con stock por variante.
- Filtros rápidos de inventario por categoría, equipo, temporada, talla, versión, parche y dorsal.
- Registro de ventas con método de pago: **Transferencia, Efectivo o Tarjeta**.
- Cálculo de **ganancia real** por venta: precio de venta frente a `valor_jersey_club` (costo de llegada).
- Datos generales de clientes para envíos por **Servientrega o Laar Courier**.
- Dashboard ejecutivo accesible por URL desde móvil y PC (diseño mobile-first).

### 1.3 Fuera de esta primera versión (preparado para escalar)

| Elemento diferido | Cómo queda preparado en el MVP |
|---|---|
| Módulo de Compras y prorrateo de fletes China-Ecuador | `valor_jersey_club` entra como dato entregado por contabilidad. Cuando exista Compras, ese campo pasará a alimentarse de él. |
| Módulo de RRHH y comisiones | `vendedor_id` (UUID nullable) reservado en la venta. |
| Códigos QR individuales por prenda (serialización) | El stock se lleva por contador de variante. Se puede añadir una tabla de unidades después sin tocar el contrato de variantes. |
| Múltiples direcciones de envío por cliente | La tabla base de `ms-clientes` ya separa contacto de despacho y se puede ampliar. |
| Facturación electrónica XML con el SRI | Se guardan los campos de identificación tributaria. No se emite XML en esta versión. |

---

## 2. Cumplimiento de las 4 Directrices Obligatorias en el MVP

### Directriz 1 — Arquitectura Modular

- Tres esquemas lógicos independientes: `ms_inventario`, `ms_ventas`, `ms_clientes`.
- **Cero `FOREIGN KEY` entre esquemas.** Las referencias entre servicios son `UUID` lógicos, sin constraint en la base de datos.
- Las ventas guardan **snapshots `JSONB`** de lo que necesitan en el momento de vender (datos del producto/variante y del cliente), de modo que no hacen JOIN contra otros servicios.
- Resultado: si un servicio entra en mantenimiento, los otros siguen operando con los datos que ya congelaron. Esto responde a la brecha de FK cruzadas identificada en la auditoría (Directriz 1).

### Directriz 2 — Integridad del Inventario

- Control atómico en tiempo real por **variante exacta**: Producto + Talla/Medida + Versión/Modelo + Adicional Parche + Adicional Dorsal.
- Bloqueo transaccional: no se procesa una venta si `stock_actual <= 0`. La verificación y el descuento ocurren en la misma transacción.
- Cada movimiento queda registrado automáticamente en el Kardex ligero `movimientos_stock`.
- Los datos del Excel encajan sin pérdida de información: el parche y el dorsal tienen columnas propias y el stock inicial entra como movimiento de saldo inicial.

### Directriz 3 — Trazabilidad de Costos

- `valor_jersey_club` es el costo de llegada entregado por contabilidad y vive en la variante.
- Al vender, ese costo unitario se **congela en `detalle_ventas`**. Aunque el costo de la variante cambie después, la ganancia histórica no se altera.
- Con esto el Dashboard calcula la ganancia neta exacta por venta y por período.
- El desglose FOB, flete y manejo queda para la fase de Compras. El MVP no lo calcula.

### Directriz 4 — Flujo Comercial Cerrado

- `ms-clientes` valida el tipo de identificación ecuatoriana: `CEDULA`, `RUC`, `PASAPORTE` o `CONSUMIDOR_FINAL`.
- El cierre de venta es un solo clic que:
  1. descuenta stock en `ms-inventario`,
  2. registra el cobro en `ms-ventas`,
  3. deja listo `vendedor_id` (UUID nullable) para futuras comisiones en RRHH.

---

## 3. Estandarización del Modelo de Datos (Catálogo Generalizado y Clientes)

### 3.1 `ms-inventario`: `productos` y `variantes`

**`productos`** describe qué es el artículo, con independencia de su talla o personalización:

- Campos: `categoria`, `nombre`, `marca_equipo`, `temporada_coleccion`.
- Justificación: el negocio ya no vende solo camisetas. Con `categoria` el mismo catálogo soporta camisetas, chompas, canilleras, gorras y accesorios, sin tablas por tipo de producto. Los nombres de los campos son genéricos a propósito (`marca_equipo`, `temporada_coleccion`) para que sirvan en artículos que no son de fútbol.

**`variantes`** describe cada combinación vendible y su stock:

- Campos: `talla_medida`, `version_modelo`, `adicional_parche`, `adicional_dorsal`, `observaciones`, `stock_actual`, `valor_jersey_club`, `pvp_sugerido`.
- Justificación de `talla_medida` y `version_modelo`: nombres genéricos que sirven tanto para una talla de camiseta como para la medida de una gorra.
- Justificación de `adicional_parche` y `adicional_dorsal` como **columnas de primera clase**: son lo que más se filtra en el Excel real (Champions, Eurocopa, MLS; nombre y número). Al ser columnas propias se pueden indexar y filtrar de forma rápida, en lugar de buscar dentro de un texto libre como ocurre hoy en la columna `Parches`.
- Justificación de `observaciones`: recoge notas operativas que hoy están en las columnas `Columna1` y `Columna2` del Excel.

Diferencia consciente respecto al Modelo Semifinal v5.0.0: allí el parche no era dimensión del SKU y los componentes se registraban por unidad física. En el MVP el parche y el dorsal pasan a ser atributos de la variante, y el stock se lleva por contador. Es una simplificación deliberada, coherente con la ausencia de serialización QR en esta versión.

### 3.2 `ms-clientes`

- Tabla base con datos generales de contacto y despacho: identificación (tipo y número), nombre o razón social, teléfono, correo, ciudad, provincia y dirección de entrega, con el operador de envío (Servientrega o Laar Courier).
- Justificación de un servicio propio: los datos personales y tributarios tienen otro ciclo de vida que el stock y las ventas, y así `ms-ventas` solo necesita guardar un snapshot del cliente al vender.
- Queda lista para escalar: al estar la dirección separada del cliente, pasar a **múltiples direcciones de envío** en una fase futura se resuelve añadiendo una tabla hija, sin romper el contrato existente.

---

## 4. Estrategia API-First y Hoja de Ruta Inmediata (Qué sigue)

Orden de ejecución acordado:

1. **Congelar los contratos API REST y la estructura de directorios del proyecto.** Se definen primero qué JSON envía y recibe cada servicio (por ejemplo, descuento de stock y devolución). Con los contratos fijos, el esquema y el código se construyen contra una interfaz estable.
2. **Generar el esquema SQL definitivo en PostgreSQL** (`01_schema_mvp_jersey_club.sql`), con los tres esquemas separados y sin FK cruzadas.
3. **Depurar y migrar el Excel** `STOCK 2026 21-11-2026.xlsx`, alineado a las reglas de formato de la base de datos. La auditoría ya identificó lo que hay que limpiar: códigos duplicados (LTOO52 y LTOO53), placeholders `*`, mayúsculas inconsistentes, formatos de temporada mezclados, talla `2XL` frente a `XXL`, filas de totales, y filas que agrupan varias unidades.
4. **Desarrollar los 3 mini-microservicios y el Frontend Web Mobile-First con Dashboard.**

---

## 5. Trazabilidad con la Auditoría Fase 0 (brechas y estado en el MVP)

| Brecha de [[00_Informe_Auditoria_Fase0]] | Tratamiento en el MVP |
|---|---|
| Parches con texto multivalor y calidad (afelpado, silicona) | `adicional_parche` como columna propia. La calidad del parche queda en el texto de esa columna o en `observaciones`; si se quiere filtrar por calidad, hay que separarla en la depuración (pendiente de definir). |
| Nombre y número de dorsal | `adicional_dorsal`. El valor `*` del Excel significa "sin dorsal". |
| Equipación (LOCAL, VISITANTE, TERCERA, especiales) | No tiene columna propia en el MVP. Pendiente de decidir si va dentro de `productos.nombre` o como campo nuevo. |
| Versión `PILOTO`, `FAN`, `Retro` | Se normaliza en `version_modelo`. |
| Código legado LTOO | Pendiente de decidir dónde guardarlo (por ejemplo, un campo de código en `variantes`) para poder conciliar contra el Excel. |
| FK cruzadas, vendedor, `outbox_eventos` | FK cruzadas eliminadas por diseño. `vendedor_id` UUID nullable incluido. El outbox queda para cuando exista RRHH. |
| Costo sin desglose en el Excel | `valor_jersey_club` como costo único entregado por contabilidad. |
| Clientes y ventas históricas ausentes en el Excel | No se migran. Las ventas pasadas entran como movimientos de stock de salida, sin pedido ni cliente. |
