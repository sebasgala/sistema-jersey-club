# Patrones de Integración (Obsidian → MVP Jersey Club)

Alcance: 3 mini-microservicios (`ms-inventario`, `ms-ventas`, `ms-clientes`), API-First. Fuentes: la wiki y la materia Integración de Sistemas. Contexto: [[Desisiones contexto actual]] y [[00_Informe_Auditoria_Fase0]].

---

## 1. Mapa de Notas Relevantes Encontradas

**Wiki** (`wiki/Ingenieria_Sistemas/Arquitectura_Diseno`, 4 notas relevantes de 8):

| Nota | Qué problema resuelve en Jersey Club |
|---|---|
| [[integracion-de-sistemas-api-first]] | Elegir comunicación síncrona, asíncrona o híbrida. Lista anti-patrones, Circuit Breaker, Retry, Outbox y Saga. |
| [[rest-avanzado-diseno-recursos-versionamiento]] | URIs, verbos y códigos HTTP. Estructura de respuesta/error. Versionamiento `/api/v1` y compatibilidad. |
| [[esquemas-compatibilidad-y-gestion-de-contratos]] | Contrato como artefacto (schema-first), cambios compatibles vs. rompedores, JSON Schema. |
| [[arquitectura-orientada-a-eventos-eda-microservicios]] | Saga con compensación, correlation ID, DLQ, RabbitMQ vs. Kafka. Mayormente para Fase 2/3. |

Las otras 4 notas de la wiki (GraphQL/federación, SOA/ESB, Kotlin y Android) las revisé solo por título y no las usé: no aplican al MVP.

**Integración de sistemas** (carpeta `wikicozy` del proyecto Cozy del curso):

| Nota | Qué aporta |
|---|---|
| `convenciones-codigo` | Nombres en español, carpetas NestJS, `main.ts`, códigos por verbo, errores. |
| `Estructura de módulos NestJS`, `DTO y validación con class-validator`, `Excepciones y pipes en NestJS`, `Persistencia con TypeORM y PostgreSQL` | Módulo, controlador, servicio, DTO, pipes y TypeORM. |
| `Estructura de respuestas y errores en APIs` | Formato uniforme `status/message/data` y `error/details`. |
| `rubrica-y-entregas`, `Info Improtante arquitectura` | Criterios de evaluación y estructura multi-repo de Cozy (un repo por microservicio, Gateway y Event Bus). |

**Límite del barrido.** El enlace de "2 niveles" casi no avanza: las notas de la wiki apuntan a conceptos (`[[saga-pattern]]`, `[[outbox-pattern]]`, `[[circuit-breaker]]`, etc.) que no existen como archivos. Todo lo útil está dentro de las 4 notas anteriores.

---

## 2. Patrones a Aplicar HOY en el MVP

### 2.1 Comunicación síncrona (REST/OpenAPI)

Es la modalidad que la wiki recomienda para operaciones críticas con consistencia fuerte (pagos, checkout). El flujo de venta es una integración **híbrida simple**: síncrona hoy y asíncrona reservada para después (sección 3).

| Llamada | Endpoint | Resultados |
|---|---|---|
| `ms-ventas` → `ms-clientes` | `GET /api/v1/clientes/{id}` | `200` cliente · `404` no existe · `503` servicio caído |
| `ms-ventas` → `ms-inventario` | `POST /api/v1/stock/descuentos` | `201` descontado · `404` variante inexistente · **`409` stock insuficiente** · `400` datos inválidos · `503` |
| `ms-ventas` → `ms-inventario` | `POST /api/v1/stock/reversiones` | `201` revertido · `200` si ya estaba revertido (idempotente) |

**Timeouts y fallos** (la wiki exige Retry/Backoff y Circuit Breaker ante degradación):
- Timeout corto por llamada: 3 s a inventario, 2 s a clientes. Sin timeout, un servicio lento bloquea al otro (acoplamiento temporal).
- Reintentos con backoff exponencial (máximo 2) **solo si la operación es idempotente**: los `GET` y los `POST` con `Idempotency-Key`.
- Circuit Breaker: opcional en el MVP; con un solo consumidor por servicio, un timeout bien puesto cubre la mayor parte del riesgo.
- Si un servicio no responde, devolver `503` con mensaje claro. Nunca un `500` ni una venta a medias.
- **Degradación (decisión recomendada, no viene de la wiki):** si `ms-clientes` está caído, `ms-ventas` permite vender como `CONSUMIDOR_FINAL` o con datos del cliente enviados en el cuerpo de la petición. Así se cumple la Directriz 1. `ms-inventario` es obligatorio para vender: sin él no se puede verificar stock (Directriz 2).

### 2.2 Consistencia sin FK cruzadas

La wiki lo resume así: cada microservicio es dueño de su base de datos, y **Saga reemplaza el "todo o nada" ACID por "todo o compensado"**. Para el MVP, `ms-ventas` es el orquestador de la venta (la wiki recomienda orquestación para flujos regulados o críticos como cobros).

1. **ACID local.** Cada servicio guarda en su propia transacción. El descuento de stock y el registro en `movimientos_stock` van en una sola transacción en `ms-inventario`, con bloqueo de fila (`SELECT ... FOR UPDATE`) y `CHECK (stock_actual >= 0)`.
2. **Snapshots JSONB.** `ms-ventas` congela al vender el cliente, el SKU/descripción de la variante, el precio y `valor_jersey_club`. No hace JOIN con otros servicios y la historia no cambia si el catálogo cambia.
3. **Secuencia de la venta** (orquestada por `ms-ventas`):
   1. Guarda la venta local como `PENDIENTE` (con snapshots y `Idempotency-Key` = id de la venta).
   2. Llama a `descuentos`. Si responde `409`, la venta pasa a `RECHAZADA` y no se descuenta nada.
   3. Si el descuento fue exitoso, confirma la venta, el cobro y el detalle en una transacción local: `CONFIRMADA`.
   4. **Compensación:** si falla el paso 3 (o hay timeout tras descontar), llama a `reversiones` con la misma clave y marca la venta `FALLIDA`.
   5. **Barrido de seguridad:** un job periódico revisa ventas `PENDIENTE` antiguas y las reconcilia (confirma o revierte). Cubre el caso de que `ms-ventas` caiga a mitad del flujo.
4. **Idempotencia.** Descuento y reversión aceptan `Idempotency-Key`; repetir la misma petición devuelve el mismo resultado y no vuelve a mover stock. Es lo que hace seguros los reintentos.

### 2.3 Estructura de carpetas (estándar del curso, NestJS)

Convenciones del profesor: dominio y recursos en español y plural, archivos en kebab-case con sufijo de rol, prefijo `/api/v1`, `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted`, Swagger, `.env` fuera de git y `.env.example` versionado.

```text
jersey-club/
  contracts/                      # schema-first: un OpenAPI por servicio
    ms-inventario.openapi.yaml
    ms-ventas.openapi.yaml
    ms-clientes.openapi.yaml
  ms-inventario/
    src/
      main.ts
      app.module.ts
      productos/      (productos.module.ts · .controller.ts · .service.ts · producto.entity.ts · dto/)
      variantes/
      stock/          (descuentos, reversiones, movimientos_stock)
    .env.example
  ms-ventas/
    src/  ventas/ · pagos/ · outbox/      # outbox: tabla creada, sin relay todavía
  ms-clientes/
    src/  clientes/
  gateway/                         # CORS, JWT y enrutamiento (previsto en el Roadmap Fase 1)
  frontend-web/                    # Next.js mobile-first + Dashboard
```

Cada servicio mantiene su propio esquema PostgreSQL (`ms_inventario`, `ms_ventas`, `ms_clientes`) y sus columnas de dinero como `numeric(10,2)` con `transformer`. El proyecto Cozy del profesor usa un repositorio por microservicio; para un MVP con una sola persona, una carpeta por servicio en un repositorio es suficiente y se separa después sin cambios de código.

---

## 3. Patrones Reservados para Fase 2 / Fase 3 (No implementar aún)

| Concepto (wiki) | Por qué no hoy | Puerto que dejamos listo |
|---|---|---|
| **Broker de mensajería** (RabbitMQ para eventos críticos; Kafka para volumen/analítica) | Añade infraestructura y consistencia eventual que el MVP no necesita. | Tabla `outbox_eventos` en `ms-ventas`, escrita en la misma transacción que la venta, **sin relay**. |
| **Outbox Pattern + eventos** (`VentaConfirmada` con `vendedor_id`, y futuros `StockActualizado`, `CompraRecibida`) | RRHH y Compras no existen todavía. | Nombres de evento definidos y contrato AsyncAPI en `contracts/` cuando se active. |
| **Saga coreografiada** | La venta ya se orquesta de forma síncrona. | `ms-ventas` queda como orquestador; migrar a eventos solo si hacen falta más participantes. |
| **Event Sourcing** | `movimientos_stock` ya da un registro por movimiento, suficiente para auditar. | El kárdex es la base: se puede promover a log de eventos más adelante. |
| **Schema Registry / Avro** | Solo tiene sentido con Kafka. | JSON Schema/OpenAPI por servicio hoy. |
| **Federación GraphQL, mTLS, observabilidad completa** (OpenTelemetry, Jaeger) | Complejidad operativa excesiva para 3 servicios. | `correlation_id` en logs JSON desde hoy; el resto se añade sin tocar los contratos. |

**CQRS** no aparece en las notas de la wiki ni de la materia que revisé, así que no lo incluyo como patrón. El dashboard puede leer directamente de las tablas de cada servicio.

---

## 4. Checklist Pre-Contratos API-First

Cada endpoint que diseñemos en el siguiente paso debe cumplir las 5 reglas:

1. **Contrato primero (schema-first).** El OpenAPI del servicio se escribe y se revisa antes del código, vive en `contracts/` y se valida en CI. El código se ajusta al contrato y no al revés.
2. **Recurso, verbo y código correctos.**
   - URI: sustantivo en plural y con prefijo `/api/v1`. Sin verbos en la URI.
   - Verbos: `GET` lee, `POST` crea (`201` + header `Location`), `PUT` y `DELETE` idempotentes (`204`), `PATCH` actualiza parcialmente (`200`).
   - Errores estándar: `400` validación, `404` no existe, **`409` conflicto (stock insuficiente, duplicado)**, `503` servicio no disponible.
   - Nunca `500` para un id inexistente.
3. **Respuesta y error uniformes.** Éxito: `{ status, message, data }`. Error: `{ status, error, details[], error_code, correlation_id }`. La nota del curso deja abierto el formato; lo fijamos aquí para que los tres servicios lo respeten.
4. **Seguridad ante reintentos y trazabilidad.** Toda operación que modifica stock acepta `Idempotency-Key`. Toda llamada entre servicios viaja con `X-Correlation-Id`, que también se registra en los logs JSON.
5. **Evolución sin romper.** Solo cambios aditivos dentro de `v1` (campos opcionales, endpoints nuevos). Quitar o renombrar un campo, o cambiar un tipo, obliga a `/api/v2` con versión anterior vigente. Los DTO validan con `whitelist` / `forbidNonWhitelisted` y todo servicio documenta su Swagger.
