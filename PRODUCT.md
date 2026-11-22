# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + lucide-react, pedido explícitamente por el usuario. Despliegue previsto en Azure Static Web Apps: el frontend no tiene funciones de servidor propias y consume solo el gateway (`NEXT_PUBLIC_API_URL`, por defecto `http://localhost:3010/api/v1`).

## Users

- **Socios (2)**: administran costos, precios e inventario y revisan resultados, principalmente desde el PC.
- **Vendedores (actuales o futuros, con comisiones en RRHH)**: cobran y registran ventas desde el celular, a menudo con prisa mientras atienden por WhatsApp/Instagram o en persona.

Un único usuario administrador inicia sesión hoy (JWT del gateway); los roles por vendedor aún no existen.

## Product Purpose

Sistema Jersey Club reemplaza el control de stock en Excel de una tienda de camisetas de fútbol y artículos deportivos en Ecuador. Permite ver el stock exacto por variante, registrar ventas en un solo paso y conocer la ganancia real de cada venta. Éxito: ninguna venta sin stock, cero ventas duplicadas, y margen real visible en todo momento.

## Positioning

Control por **variante exacta** (Producto + Talla + Versión + Parche + Dorsal), no por producto genérico: dos camisetas iguales con distinto parche o dorsal son artículos distintos. El costo de llegada (`valor_jersey_club`) se congela en cada venta para que la ganancia histórica nunca cambie.

## Operating Context

- Ventas por redes sociales y en persona; envíos por Servientrega, Laar Courier o entrega en Quito.
- Clientes identificados según normativa ecuatoriana: Cédula, RUC, Pasaporte o Consumidor Final.
- Métodos de pago: Transferencia, Efectivo, Tarjeta.
- Catálogo heredado de `docs/STOCK 2026 21-11-2026.xlsx`: 54 productos, 95 variantes, 153 unidades; 80 variantes llegaron sin costo (`0.00`) y deben completarse desde la interfaz.
- Productos: camisetas (jugador, fan, retro, piloto F1), chompas, canilleras, gorras, accesorios.

## Capabilities and Constraints

- API: gateway en `contracts/gateway.openapi.yaml`; servicios en `contracts/ms-*.openapi.yaml`. Respuesta `{ status, message, data }`, error `{ status, error, details[], error_code, correlation_id }`.
- Toda venta requiere `Idempotency-Key`; el stock insuficiente devuelve `409 STOCK_INSUFICIENTE`.
- Si ms-clientes cae, la venta continúa con datos de respaldo (degradación); sin ms-inventario no se vende.
- Todo el texto de la interfaz en español (Ecuador), montos en USD.
- Sin roles ni multiusuario todavía; sin facturación electrónica SRI; sin fotos de producto en el catálogo.

## Brand Commitments

- Nombre: **Jersey Club** (abreviado JRS Club).
- Marca vigente: isotipo geométrico angular monocromo (negro `#1B1C1E` y versión metálica plateada) en `../../LOGO/Logo nuevo/` (`Logo sin fondo final .png`, `logo blanco sin fondo.png`, `Jersey club letras.png`). Los logos circulares rojos de 2023 son la identidad anterior.
- Tipografías de marca en `../Tipografias/`: Helvetica Now Display ExtraBold y Circula Medium (licencias comerciales/propias: no se distribuyen sin confirmar licencia web).

## Evidence on Hand

- Datos reales de inventario migrados en PostgreSQL (seed del Excel). No hay ventas reales registradas todavía, ni fotos de producto, ni testimonios.

## Product Principles

1. Ninguna venta sin stock de la variante exacta; el sistema bloquea antes de que el servidor tenga que rechazar.
2. El margen real siempre visible: costo, precio y ganancia juntos donde se decide.
3. Vender en segundos desde el celular: el flujo de venta nunca se bloquea por un servicio secundario.
4. Los datos heredados incompletos (costos en 0) se señalan y se corrigen en el lugar, no se ocultan.

## Accessibility & Inclusion

Uso con una mano en celular y en exteriores: objetivos táctiles amplios, contraste alto y estados que no dependan solo del color (stock, errores).
