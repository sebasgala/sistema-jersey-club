# Arquitectura actual — Sistema Jersey Club

Diagramas en Mermaid (se ven en la vista previa de VS Code con la extensión de Mermaid).

## 1. Vista general

El navegador solo habla con el gateway. Cada microservicio es dueño de su propio esquema en PostgreSQL y nunca consulta el de otro.

```mermaid
flowchart LR
    subgraph Cliente["Navegador (celular o PC)"]
        FE["frontend-web<br/>Next.js · :3014<br/>login, panel, inventario,<br/>venta, historial"]
    end

    subgraph Entrada["Punto único de entrada"]
        GW["gateway · :3010<br/>JWT, roles, permisos,<br/>oculta costos al VENDEDOR"]
    end

    subgraph Servicios["Microservicios (red interna)"]
        INV["ms-inventario · :3011<br/>productos, variantes,<br/>stock y Kardex"]
        VEN["ms-ventas · :3012<br/>ventas, anulación,<br/>dashboard, outbox"]
        CLI["ms-clientes · :3013<br/>clientes y validación<br/>cédula / RUC"]
    end

    subgraph BD["PostgreSQL 16 · :5436 (una base, 4 esquemas aislados)"]
        S1[("ms_inventario")]
        S2[("ms_ventas")]
        S3[("ms_clientes")]
        S4[("ms_auth<br/>usuarios y roles")]
    end

    FE -- "HTTPS + Bearer JWT<br/>X-Correlation-Id · Idempotency-Key" --> GW
    GW -- "X-User-Id · X-User-Role" --> INV
    GW -- "X-User-Id · X-User-Role" --> VEN
    GW -- "X-User-Id · X-User-Role" --> CLI
    GW --> S4

    VEN -- "descontar / revertir stock<br/>timeout 3 s" --> INV
    VEN -- "consultar cliente<br/>timeout 2 s" --> CLI

    INV --> S1
    VEN --> S2
    CLI --> S3
```

## 2. Quién puede hacer qué (roles)

```mermaid
flowchart TD
    L["POST /auth/login<br/>usuario o correo + contraseña"] --> DB[("ms_auth.usuarios<br/>bcrypt")]
    DB --> T["JWT con sub, username,<br/>email, nombre y role"]
    T --> R{"role"}
    R -- ADMIN --> A["Todo: costos, márgenes, precios,<br/>catálogo, ajustes de stock,<br/>ventas y anular ventas"]
    R -- VENDEDOR --> V["Registrar ventas, consultar stock,<br/>clientes e historial.<br/>Sin costos ni ganancias<br/>(el gateway los elimina)"]
    V -. "editar, ajustar, anular" .-> X["403 ROL_NO_AUTORIZADO"]
```

## 3. Cierre de venta en 1 clic (saga orquestada por ms-ventas)

```mermaid
sequenceDiagram
    autonumber
    actor U as Vendedor
    participant FE as frontend-web
    participant GW as gateway
    participant VEN as ms-ventas
    participant CLI as ms-clientes
    participant INV as ms-inventario
    participant DB as PostgreSQL

    U->>FE: Confirmar venta
    FE->>GW: POST /ventas (JWT + Idempotency-Key)
    GW->>VEN: reenvía + X-User-Id (vendedor_id)
    VEN->>DB: ¿clave ya usada? (idempotencia)
    VEN->>CLI: GET /clientes/{id}
    alt ms-clientes no responde
        VEN-->>VEN: usa datos de respaldo o consumidor final
    end
    VEN->>DB: guarda venta PENDIENTE
    VEN->>INV: POST /stock/descuentos
    INV->>DB: SELECT FOR UPDATE + descuenta + Kardex (1 transacción)
    alt stock insuficiente
        INV-->>VEN: 409 STOCK_INSUFICIENTE
        VEN->>DB: venta RECHAZADA
        VEN-->>FE: 409 (no se cobra nada)
    else descuento correcto
        INV-->>VEN: snapshot y costo de cada variante
        VEN->>DB: detalle con costo congelado + outbox VentaConfirmada + CONFIRMADA
        alt falla al guardar
            VEN->>INV: POST /stock/reversiones (compensación)
            VEN->>DB: venta FALLIDA
        else todo bien
            VEN-->>FE: 201 comprobante JC-AAAA-NNNNNN
        end
    end
```

## 4. Anular una venta

```mermaid
sequenceDiagram
    autonumber
    actor A as Administrador
    participant FE as frontend-web
    participant GW as gateway
    participant VEN as ms-ventas
    participant INV as ms-inventario
    participant DB as PostgreSQL

    A->>FE: Anular + motivo
    FE->>GW: POST /ventas/{id}/anular
    GW->>GW: solo rol ADMIN
    GW->>VEN: reenvía
    VEN->>INV: POST /stock/reversiones (idempotente)
    INV->>DB: devuelve stock + REVERSION_VENTA en el Kardex
    VEN->>DB: estado ANULADA + motivo + usuario + outbox VentaAnulada
    VEN-->>FE: 200 (el panel deja de contarla)
```

## 5. Despliegue

```mermaid
flowchart LR
    subgraph Local["Hoy: en tu computadora"]
        D1["docker compose up -d pg-jersey-club<br/>(solo la base)"]
        D2["servicios con npm run start:dev<br/>+ frontend con npm run dev"]
    end
    subgraph Stack["Stack en contenedores (perfil stack)"]
        C1["gateway :3010<br/>(único puerto publicado)"]
        C2["ms-inventario · ms-ventas · ms-clientes<br/>(red interna)"]
        C3[("pg-jersey-club")]
        C1 --> C2 --> C3
    end
    subgraph Futuro["Previsto (aún sin decidir)"]
        F1["Azure Static Web Apps<br/>frontend estático"]
        F2["Azure Container Apps<br/>gateway y servicios"]
        F3[("PostgreSQL gestionado<br/>Supabase u otro")]
        F1 --> F2 --> F3
    end
```
