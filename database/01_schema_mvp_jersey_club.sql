-- =============================================================================
-- Sistema Jersey Club — Esquema MVP (PostgreSQL 16)
-- 3 esquemas aislados: ms_inventario, ms_clientes, ms_ventas.
-- CERO llaves foráneas entre esquemas: las referencias cruzadas son UUID lógicos
-- y los datos ajenos se congelan en snapshots JSONB.
-- Script idempotente: puede ejecutarse varias veces sin error.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cada esquema tiene su propia función fn_set_updated_at() para no acoplarse a otro.

-- =============================================================================
-- ESQUEMA ms_inventario
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS ms_inventario;

CREATE OR REPLACE FUNCTION ms_inventario.fn_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS ms_inventario.productos (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  categoria            VARCHAR(40)  NOT NULL,      -- CAMISETA, CHOMPA, CANILLERAS, GORRA, ACCESORIO...
  nombre               VARCHAR(150) NOT NULL,
  marca_equipo         VARCHAR(100) NOT NULL,
  temporada_coleccion  VARCHAR(20),
  activo               BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_productos_categoria_mayus CHECK (categoria = UPPER(categoria))
);

CREATE INDEX IF NOT EXISTS ix_productos_categoria    ON ms_inventario.productos (categoria);
CREATE INDEX IF NOT EXISTS ix_productos_marca_equipo ON ms_inventario.productos (marca_equipo);
CREATE INDEX IF NOT EXISTS ix_productos_temporada    ON ms_inventario.productos (temporada_coleccion);

CREATE TABLE IF NOT EXISTS ms_inventario.variantes (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id        UUID          NOT NULL REFERENCES ms_inventario.productos (id),
  codigo_legacy      VARCHAR(30)   UNIQUE,
  talla_medida       VARCHAR(20)   NOT NULL,
  version_modelo     VARCHAR(30)   NOT NULL,
  adicional_parche   VARCHAR(150),
  adicional_dorsal   VARCHAR(100),
  observaciones      TEXT,
  stock_actual       INT           NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  valor_jersey_club  NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (valor_jersey_club >= 0),
  pvp_sugerido       NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (pvp_sugerido >= 0),
  activo             BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Variante exacta (Directriz 2): Producto + Talla + Versión + Parche + Dorsal
CREATE UNIQUE INDEX IF NOT EXISTS ux_variantes_combinacion ON ms_inventario.variantes (
  producto_id,
  talla_medida,
  version_modelo,
  COALESCE(adicional_parche, ''),
  COALESCE(adicional_dorsal, '')
);
CREATE INDEX IF NOT EXISTS ix_variantes_producto ON ms_inventario.variantes (producto_id);
CREATE INDEX IF NOT EXISTS ix_variantes_talla    ON ms_inventario.variantes (talla_medida);
CREATE INDEX IF NOT EXISTS ix_variantes_version  ON ms_inventario.variantes (version_modelo);
CREATE INDEX IF NOT EXISTS ix_variantes_con_stock ON ms_inventario.variantes (producto_id) WHERE stock_actual > 0;

CREATE TABLE IF NOT EXISTS ms_inventario.movimientos_stock (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variante_id      UUID         NOT NULL REFERENCES ms_inventario.variantes (id),
  tipo             VARCHAR(25)  NOT NULL,
  cantidad         INT          NOT NULL,
  stock_anterior   INT          NOT NULL,
  stock_nuevo      INT          NOT NULL,
  idempotency_key  VARCHAR(100) UNIQUE,
  referencia_id    UUID,                          -- lógico: id de venta u otro documento
  observacion      TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_movimientos_tipo CHECK (tipo IN ('SALDO_INICIAL', 'VENTA', 'REVERSION_VENTA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA')),
  CONSTRAINT ck_movimientos_cantidad CHECK (cantidad >= 0),
  CONSTRAINT ck_movimientos_stock_no_negativo CHECK (stock_anterior >= 0 AND stock_nuevo >= 0),
  -- El saldo debe cuadrar con el sentido del movimiento
  CONSTRAINT ck_movimientos_cuadre CHECK (
    (tipo IN ('SALDO_INICIAL', 'REVERSION_VENTA', 'AJUSTE_ENTRADA') AND stock_nuevo = stock_anterior + cantidad)
    OR (tipo IN ('VENTA', 'AJUSTE_SALIDA') AND stock_nuevo = stock_anterior - cantidad)
  )
);

-- v1.1 (2026-11-21): Kardex valorizado. Costo JRS unitario vigente al momento del
-- movimiento; permite que un reintento idempotente devuelva el costo original.
ALTER TABLE ms_inventario.movimientos_stock
  ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(10,2)
    CONSTRAINT ck_movimientos_costo CHECK (costo_unitario IS NULL OR costo_unitario >= 0);

CREATE INDEX IF NOT EXISTS ix_movimientos_variante   ON ms_inventario.movimientos_stock (variante_id, created_at);
CREATE INDEX IF NOT EXISTS ix_movimientos_referencia ON ms_inventario.movimientos_stock (referencia_id);

DROP TRIGGER IF EXISTS tg_productos_updated_at ON ms_inventario.productos;
CREATE TRIGGER tg_productos_updated_at BEFORE UPDATE ON ms_inventario.productos
  FOR EACH ROW EXECUTE FUNCTION ms_inventario.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_variantes_updated_at ON ms_inventario.variantes;
CREATE TRIGGER tg_variantes_updated_at BEFORE UPDATE ON ms_inventario.variantes
  FOR EACH ROW EXECUTE FUNCTION ms_inventario.fn_set_updated_at();

-- =============================================================================
-- ESQUEMA ms_clientes
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS ms_clientes;

CREATE OR REPLACE FUNCTION ms_clientes.fn_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS ms_clientes.clientes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo_identificacion   VARCHAR(20)  NOT NULL CHECK (tipo_identificacion IN ('CEDULA', 'RUC', 'PASAPORTE', 'CONSUMIDOR_FINAL')),
  identificacion        VARCHAR(20)  UNIQUE NOT NULL,
  nombre_completo       VARCHAR(150) NOT NULL,
  telefono              VARCHAR(25),
  provincia             VARCHAR(80),
  ciudad                VARCHAR(80),
  direccion_referencia  TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Formato por tipo (el dígito verificador de la cédula se valida en ms-clientes)
  CONSTRAINT ck_clientes_formato_identificacion CHECK (
    (tipo_identificacion = 'CEDULA'           AND identificacion ~ '^[0-9]{10}$')
    OR (tipo_identificacion = 'RUC'           AND identificacion ~ '^[0-9]{10}001$')
    OR (tipo_identificacion = 'PASAPORTE'     AND identificacion ~ '^[A-Za-z0-9]{5,20}$')
    OR (tipo_identificacion = 'CONSUMIDOR_FINAL' AND identificacion = '9999999999999')
  )
);

-- v1.1 (2026-11-21): contacto por correo y operador de envío preferido.
-- ADD COLUMN IF NOT EXISTS mantiene el script idempotente en bases ya creadas.
ALTER TABLE ms_clientes.clientes
  ADD COLUMN IF NOT EXISTS email VARCHAR(150)
    CONSTRAINT ck_clientes_email CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
ALTER TABLE ms_clientes.clientes
  ADD COLUMN IF NOT EXISTS courier_preferido VARCHAR(30) NOT NULL DEFAULT 'SERVIENTREGA'
    CONSTRAINT ck_clientes_courier CHECK (courier_preferido IN ('SERVIENTREGA', 'LAAR_COURIER', 'ENTREGA_QUITO', 'OTRO'));

CREATE INDEX IF NOT EXISTS ix_clientes_nombre ON ms_clientes.clientes (LOWER(nombre_completo));
CREATE INDEX IF NOT EXISTS ix_clientes_telefono ON ms_clientes.clientes (telefono);
CREATE INDEX IF NOT EXISTS ix_clientes_ciudad ON ms_clientes.clientes (ciudad);

DROP TRIGGER IF EXISTS tg_clientes_updated_at ON ms_clientes.clientes;
CREATE TRIGGER tg_clientes_updated_at BEFORE UPDATE ON ms_clientes.clientes
  FOR EACH ROW EXECUTE FUNCTION ms_clientes.fn_set_updated_at();

-- Consumidor final con id fijo (lo referencia el contrato de ms-clientes)
INSERT INTO ms_clientes.clientes (id, tipo_identificacion, identificacion, nombre_completo)
VALUES ('00000000-0000-4000-8000-000000000001', 'CONSUMIDOR_FINAL', '9999999999999', 'CONSUMIDOR FINAL')
ON CONFLICT (identificacion) DO NOTHING;

-- =============================================================================
-- ESQUEMA ms_ventas
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS ms_ventas;

CREATE OR REPLACE FUNCTION ms_ventas.fn_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS ms_ventas.seq_numero_comprobante START 1;

CREATE TABLE IF NOT EXISTS ms_ventas.ventas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_comprobante  VARCHAR(30)   UNIQUE NOT NULL,   -- JC-AAAA-000001 (desde seq_numero_comprobante)
  idempotency_key     VARCHAR(100)  UNIQUE,            -- Idempotency-Key del POST /ventas
  cliente_id          UUID          NOT NULL,          -- lógico → ms_clientes.clientes (sin FK)
  cliente_snapshot    JSONB         NOT NULL,
  vendedor_id         UUID,                            -- lógico → futuro ms_rrhh (sin FK)
  metodo_pago         VARCHAR(20)   NOT NULL CHECK (metodo_pago IN ('TRANSFERENCIA', 'EFECTIVO', 'TARJETA')),
  estado              VARCHAR(20)   NOT NULL DEFAULT 'CONFIRMADA' CHECK (estado IN ('PENDIENTE', 'CONFIRMADA', 'RECHAZADA', 'FALLIDA')),
  total_vendido       NUMERIC(10,2) NOT NULL CHECK (total_vendido >= 0),
  costo_total_jrs     NUMERIC(10,2) NOT NULL CHECK (costo_total_jrs >= 0),
  ganancia_total      NUMERIC(10,2) NOT NULL,          -- puede ser negativa (venta bajo costo)
  observacion         TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ventas_ganancia CHECK (ganancia_total = total_vendido - costo_total_jrs)
);

CREATE INDEX IF NOT EXISTS ix_ventas_created_at ON ms_ventas.ventas (created_at);
CREATE INDEX IF NOT EXISTS ix_ventas_estado     ON ms_ventas.ventas (estado);
CREATE INDEX IF NOT EXISTS ix_ventas_cliente    ON ms_ventas.ventas (cliente_id);
CREATE INDEX IF NOT EXISTS ix_ventas_vendedor   ON ms_ventas.ventas (vendedor_id) WHERE vendedor_id IS NOT NULL;

DROP TRIGGER IF EXISTS tg_ventas_updated_at ON ms_ventas.ventas;
CREATE TRIGGER tg_ventas_updated_at BEFORE UPDATE ON ms_ventas.ventas
  FOR EACH ROW EXECUTE FUNCTION ms_ventas.fn_set_updated_at();

CREATE TABLE IF NOT EXISTS ms_ventas.detalle_ventas (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id                    UUID          NOT NULL REFERENCES ms_ventas.ventas (id),
  variante_id                 UUID          NOT NULL,   -- lógico → ms_inventario.variantes (sin FK)
  snapshot_producto           JSONB         NOT NULL,
  cantidad                    INT           NOT NULL CHECK (cantidad > 0),
  precio_venta_unitario       NUMERIC(10,2) NOT NULL CHECK (precio_venta_unitario >= 0),
  valor_jersey_club_unitario  NUMERIC(10,2) NOT NULL CHECK (valor_jersey_club_unitario >= 0),
  subtotal                    NUMERIC(10,2) NOT NULL,
  ganancia_linea              NUMERIC(10,2) NOT NULL,
  CONSTRAINT ck_detalle_subtotal CHECK (subtotal = cantidad * precio_venta_unitario),
  CONSTRAINT ck_detalle_ganancia CHECK (ganancia_linea = cantidad * (precio_venta_unitario - valor_jersey_club_unitario))
);

CREATE INDEX IF NOT EXISTS ix_detalle_ventas_venta    ON ms_ventas.detalle_ventas (venta_id);
CREATE INDEX IF NOT EXISTS ix_detalle_ventas_variante ON ms_ventas.detalle_ventas (variante_id);

CREATE TABLE IF NOT EXISTS ms_ventas.outbox_eventos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agregado_tipo  VARCHAR(50)  NOT NULL,   -- p. ej. 'VENTA'
  agregado_id    UUID         NOT NULL,
  tipo_evento    VARCHAR(80)  NOT NULL,   -- p. ej. 'VentaConfirmada'
  payload        JSONB        NOT NULL,
  procesado      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_outbox_pendientes ON ms_ventas.outbox_eventos (created_at) WHERE procesado = FALSE;
