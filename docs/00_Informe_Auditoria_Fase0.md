# Informe de Auditoría — Fase 0 · Subfase 0.1 (Dominio y Datos)

**Sistema:** Jersey Club · **Fuentes:** `STOCK 2026 21-11-2026.xlsx`, Modelo Semifinal v5.0.0 (53 tablas), `RoadMap.md`

---

## 1. Resumen de hallazgos del Excel

- **3 hojas:** `PRINCIPAL` (portada vacía), `STOCK` (inventario real) y `DICIEMBRE` (**oculta**: costos y ganancias de 6 ventas de dic-2024).
- **`STOCK`:** cabecera en la fila 3, tabla Excel `Tabla3`, 102 filas con datos y 14 columnas: `Codigo, Talla, Equipo, Temporada, Equipación, Versión, Parches, Nombre, Numero, Entrada, Salida, Stock Actual, Columna1, Columna2`.
- **Texto concatenado:** `Parches` mezcla varios parches y su calidad en una celda (ej. `CHAMPIONS LEAGUE Y LOGO SPOTIFY (PARCHE AFELPADO)`, `FIFA (PARCHES AFELPADOS) NO OFICIALES`). `Equipación` mezcla variante y personalización (`LOCAL (OLIVIA RODRIGO)`, `TRAVIS SCOTT (1.1)`). En `DICIEMBRE` todo el producto va en un solo texto (`Real Madrid 24-25 versión jugador tercera parches Champions League`).
- **Calidad de datos:**
  - Valores inconsistentes: `Jugador`/`JUGADOR`, `Local`/`LOCAL`, `2XL`/`XXL`.
  - Temporada con formatos mezclados: `23-24`, `2024`, `2008 - 09`, `2026`.
  - Placeholder `*` en 22 nombres, 21 números y 10 parches.
  - Nulos: `Parches` 18, `Temporada` 12, `Equipación` 15.
  - Códigos `LTOO52` y `LTOO53` duplicados.
  - Texto en columnas numéricas (`Salida = "No vendido"`).
  - 2 filas donde Entrada − Salida ≠ Stock (`LTOO61`, `LTOO71`).
  - 4 filas de totales o basura sin código.
  - `Columna1` y `Columna2` casi vacías (notas: `Vendido 16-09`, `1 VENDIDA`).
- **Granularidad mixta:** la mayoría de las filas es 1 fila = 1 prenda (Entrada = 1). Las líneas de F1/Mercedes agrupan de 4 a 15 unidades en una sola fila.
- **Celdas combinadas:** solo en `PRINCIPAL` (4 rangos) y el título de `STOCK` (`B1:D2`). Los datos no tienen merges.
- **`Stock Actual`** es una fórmula (`Entrada − Salida`). No hay costo ni precio en `STOCK`: solo existen en la hoja oculta (`Valor JRS club` 25.05–30.00, `PVP`, `envío`, `ganancias`).
- **No existen** en el Excel: cliente, identificación, vendedor, bodega ni fecha de compra o venta.

## 2. Tabla de brechas: Excel vs. Modelo Semifinal

| # | Dato del Excel | Choque o brecha con el Modelo | Acción |
|---|---|---|---|
| 1 | `Parches` (texto multivalor, con calidad: afelpado, silicona, no oficial) | El modelo usa `COMPONENTE_PERSONALIZACION` + `UNIDAD_FISICA_COMPONENTE`. No hay atributo de calidad del parche ni de si es oficial. | Parsear a N componentes. Agregar `calidad_material` y `es_oficial` al catálogo. |
| 2 | `Nombre` + `Numero` (dorsal) | Cabe como `texto_personalizacion` del componente dorsal. El placeholder `*` significa "sin dorsal". | Migrar solo si ≠ `*`. |
| 3 | `Equipación` (LOCAL/VISITANTE/TERCERA/DESPEDIDA/especiales) | `VARIANTE_PRODUCTO` es Producto × Talla × Versión. No existe campo de equipación; solo se podría codificar en `PRODUCTO_BASE.nombre`. | Agregar `equipacion` y `edicion_especial` a `PRODUCTO_BASE`. |
| 4 | `Versión` = `PILOTO` (F1), `FAN`, `Retro` | `TIPO_VERSION` no tiene `PILOTO`; hay que normalizar mayúsculas. | Sembrar catálogo y normalizar. |
| 5 | `Temporada` (`23-24`, `2024`, `2008-09`) | `VARCHAR(30)` libre. Hay riesgo de duplicar productos por formato. | Normalizar a `AAAA-AA` antes de cargar. |
| 6 | `Talla` `2XL` | `TALLA` tiene XXL. | Mapear `2XL` → `XXL`. |
| 7 | Filas con Entrada > 1 (F1/Mercedes) | El modelo exige 1 `UNIDAD_FISICA` por prenda (con serial). | Expandir a N unidades al migrar. |
| 8 | `Codigo` LTOO1… (duplicados LTOO52/53) | No hay campo para el código legado. | Agregar `codigo_legacy` (único) a `UNIDAD_FISICA`. |
| 9 | `Salida` / `Vendido 16-09` / `1 VENDIDA` | Una unidad vendida requiere `PEDIDO_VENTA` con cliente, dirección y pago. El Excel no los tiene. | Cargar como `VENDIDA_ENTREGADA` con movimiento de kárdex de saldo inicial y pedido "histórico migrado". |
| 10 | Costo `Valor JRS club` (25.05–30.00) y `envío` | No hay desglose FOB / flete China-USA / flete USA-EC / manejo. El `CHECK` de descomponibilidad se aplica solo a líneas de importación. | Cargar como `costo_landed_real` total con `origen_costo = 'LEGADO_EXCEL'`. |
| 11 | `PVP`, `ganancias` (hoja oculta) | `ganancias` se calcula en el Excel. En el modelo es `margen_neto_orden` (derivado). | Usar PVP como `precio_venta_sugerido`; descartar `ganancias`. |
| 12 | Reparto `Sebas` 51.55 / `Steven` 34.36 (socios) | Corresponde a `MOVIMIENTO_SOCIETARIO` (Tesorería), no a Inventario ni a Ventas. | Fuera del alcance de la Fase 1. |

## 3. Ajustes mínimos obligatorios al Modelo Semifinal

**Directriz 1 · Arquitectura modular**
- `ms-inventario`: tablas 4–17, y los componentes en tablas 9–11. `ms-ventas`: tablas 28–38, 52 y 53. Pertenecen a `ms-compras`: tablas 18–26. Pertenecen a `ms-rrhh`: tablas 39–43. Marketing, Contabilidad y Tesorería quedan para fases posteriores.
- FK cruzadas que deben volverse UUID lógicos sin constraint (hoy son `BIGINT` con FK):
  - `UNIDAD_FISICA.id_orden_importacion`, y `DETALLE_PEDIDO_VENTA.id_orden_importacion_asociada` → Compras.
  - `PEDIDO_VENTA.id_empleado_vendedor` → RRHH.
  - `PEDIDO_VENTA.id_gasto_publicitario` y `PEDIDO_VENTA.id_courier_local` → Marketing y Compras.
  - `COBRO.id_billetera` → Tesorería; `COBRO` y `FACTURA` → `EMPLEADO` / `USUARIO_SISTEMA`.
  - `DETALLE_PEDIDO_VENTA.id_variante_producto` y `id_unidad_fisica` → Inventario (Ventas↔Inventario también cruza esquemas). Congelar `sku`, `nombre` y `precio` en la línea.
  - `COMPONENTE_INCLUIDO` y las tablas de Compras que apuntan a `VARIANTE_PRODUCTO` y `COMPONENTE` (se resuelven en 0.3).
- **El modelo no define la tabla `outbox_eventos`** (0 menciones). Crearla en cada microservicio, con el contrato de comisiones para RRHH.
- La estrategia de IDs es `BIGINT` secuencial. Para referencias lógicas entre servicios conviene `UUID`, así que hay que decidir la convención de IDs.

**Directriz 2 · Integridad del inventario**
- Soportado: variante atómica (Producto × Talla × Versión) más parches como componentes por unidad, serial por prenda, `STOCK_BODEGA` como proyección y `MOVIMIENTO_KARDEX` por movimiento.
- Faltan: `equipacion` / `edicion_especial` (brecha 3), `codigo_legacy` (8), calidad del parche (1) y el tipo de movimiento `SALDO_INICIAL` en el kárdex.
- Con esos cambios los datos del Excel entran sin pérdida, salvo lo que ya falta en origen (fechas, bodega, cliente).

**Directriz 3 · Trazabilidad de costos**
- Soportado desde el día 1: FOB, flete China-USA, flete USA-EC prorrateado, manejo y `costo_landed_final_unit` con `CHECK` de suma.
- Ajuste: aceptar `origen_costo` (`IMPORTACION` / `LEGADO_EXCEL`) para el stock migrado sin desglose. La Fase 2 (Compras) completará el desglose real.

**Directriz 4 · Flujo comercial Ecuador**
- Soportado: `CLIENTE` con `CEDULA / RUC / PASAPORTE / CONSUMIDOR_FINAL`, `9999999999999` para consumidor final, snapshot fiscal e IVA por línea. `PEDIDO_VENTA` ya tiene vendedor nullable.
- Ajustes:
  - Agregar `CHECK` de longitud y formato por `tipo_identificacion` (10 dígitos / 13 dígitos / pasaporte).
  - Para `CONSUMIDOR_FINAL`, relajar `NOT NULL` de email, teléfono, provincia y ciudad.
  - Cambiar `id_empleado_vendedor` (FK `BIGINT`) por `vendedor_id UUID` lógico, congelando también el nombre del vendedor. Sin FK a RRHH.

## 4. Veredicto de viabilidad para la Subfase 0.2

**VIABLE CON CONDICIONES.** El modelo cubre la arquitectura 5FN, el costo landed y el cumplimiento tributario de Ecuador. Antes de pasar a 0.2 deben cerrarse estos puntos:

1. Cerrar los 12 ajustes de la sección 2 y 3: `equipacion`, `codigo_legacy`, calidad de parche, `SALDO_INICIAL`, `origen_costo`, `vendedor_id` UUID y checks de identificación.
2. Decidir la convención de IDs entre servicios (`UUID` lógico vs `BIGINT`) y definir `outbox_eventos`.
3. Limpiar y normalizar el Excel (duplicados LTOO52/53, `*`, mayúsculas, temporadas, talla `2XL`, filas con totales). Es la Subfase 1 de migración, no bloquea el diseño.

**Riesgos fuera del control del modelo:** no hay clientes ni ventas históricas en el Excel, y el costo legacy no tiene desglose. Ambos se aceptan como saldo inicial.
