"use client";

import { Minus, PackagePlus, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Aviso, Boton, Campo, cx, Hoja, Selector, useNotas } from "@/components/ui";
import { ApiError, get, mensajeError, post } from "@/lib/api";
import { aCentavos, deCentavos, nombreProducto, rasgos, titulo, uuid } from "@/lib/formato";
import { CATEGORIAS, TALLAS, VERSIONES, type Pagina, type Producto, type Variante } from "@/lib/tipos";
import { useConsulta } from "@/lib/use-consulta";

const opciones = (xs: readonly string[]) => xs.map((x) => ({ valor: x, etiqueta: titulo(x) }));

function errorDe(e: unknown): string {
  if (e instanceof ApiError && e.detalles.length) return e.detalles.join(" ");
  return mensajeError(e);
}

// ------------------------------------------------------------------ Nuevo producto
export function HojaNuevoProducto({
  abierta,
  alCerrar,
  alCrear,
}: {
  abierta: boolean;
  alCerrar: () => void;
  alCrear: (p: Producto) => void;
}) {
  const avisar = useNotas();
  const [f, setF] = useState({ categoria: "CAMISETA", nombre: "", marca_equipo: "", temporada_coleccion: "" });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const temporadaInvalida = f.temporada_coleccion !== "" && !/^\d{4}(-\d{2})?$/.test(f.temporada_coleccion.trim());

  async function crear() {
    if (!f.nombre.trim() || !f.marca_equipo.trim()) {
      setError("Completa el nombre y el equipo o marca.");
      return;
    }
    if (temporadaInvalida) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await post<Producto>("/productos", {
        categoria: f.categoria,
        nombre: f.nombre.trim(),
        marca_equipo: f.marca_equipo.trim(),
        ...(f.temporada_coleccion.trim() ? { temporada_coleccion: f.temporada_coleccion.trim() } : {}),
      });
      avisar("ok", `Producto «${r.data.nombre}» creado. Ahora agrega sus variantes.`);
      setF({ categoria: f.categoria, nombre: "", marca_equipo: "", temporada_coleccion: "" });
      alCrear(r.data);
    } catch (e) {
      setError(errorDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Hoja
      abierta={abierta}
      alCerrar={alCerrar}
      titulo="Nuevo producto"
      descripcion="El producto agrupa sus variantes de talla, versión, parche y dorsal."
      pie={
        <Boton className="w-full" cargando={enviando} onClick={() => void crear()} icono={PackagePlus}>
          Crear producto
        </Boton>
      }
    >
      <div className="flex flex-col gap-4">
        <Selector etiqueta="Categoría" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} opciones={opciones(CATEGORIAS)} />
        <Campo etiqueta="Equipo o marca" placeholder="Ej. Barcelona SC" value={f.marca_equipo} onChange={(e) => setF({ ...f, marca_equipo: e.target.value })} />
        <Campo etiqueta="Nombre" placeholder="Ej. Barcelona SC Local" ayuda="Incluye la equipación: Local, Visitante, Tercera, Retro…" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <Campo
          etiqueta="Temporada o colección (opcional)"
          placeholder="2025 o 2025-26"
          inputMode="numeric"
          value={f.temporada_coleccion}
          onChange={(e) => setF({ ...f, temporada_coleccion: e.target.value })}
          error={temporadaInvalida ? "Usa el formato AAAA o AAAA-AA, por ejemplo 2025-26." : null}
        />
        {error && <Aviso tono="error" titulo="No se pudo crear el producto">{error}</Aviso>}
      </div>
    </Hoja>
  );
}

// ------------------------------------------------------------------ Nueva variante
export function HojaNuevaVariante({
  abierta,
  alCerrar,
  alCrear,
  productoInicial,
}: {
  abierta: boolean;
  alCerrar: () => void;
  alCrear: (v: Variante) => void;
  productoInicial?: Producto | null;
}) {
  const avisar = useNotas();
  const [busqueda, setBusqueda] = useState("");
  const [producto, setProducto] = useState<Producto | null>(productoInicial ?? null);
  const [f, setF] = useState({ talla_medida: "M", version_modelo: "JUGADOR", adicional_parche: "", adicional_dorsal: "", codigo_legacy: "", valor_jersey_club: "", pvp_sugerido: "" });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [productoPrevio, setProductoPrevio] = useState(productoInicial);
  if (productoInicial !== productoPrevio) {
    setProductoPrevio(productoInicial);
    if (productoInicial) setProducto(productoInicial);
  }

  const productos = useConsulta(abierta && !producto ? `prod:${busqueda}` : null, (signal) =>
    get<Pagina<Producto>>("/productos", { query: { busqueda: busqueda.trim() || undefined, limit: 8 }, signal }).then((r) => r.data.items),
  );
  const montoInvalido = (v: string) => v !== "" && Number.isNaN(aCentavos(v));

  async function crear() {
    if (!producto) {
      setError("Elige el producto al que pertenece la variante.");
      return;
    }
    if (montoInvalido(f.valor_jersey_club) || montoInvalido(f.pvp_sugerido)) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await post<Variante>("/variantes", {
        producto_id: producto.id,
        talla_medida: f.talla_medida,
        version_modelo: f.version_modelo,
        ...(f.adicional_parche.trim() ? { adicional_parche: f.adicional_parche.trim() } : {}),
        ...(f.adicional_dorsal.trim() ? { adicional_dorsal: f.adicional_dorsal.trim() } : {}),
        ...(f.codigo_legacy.trim() ? { codigo_legacy: f.codigo_legacy.trim() } : {}),
        ...(f.valor_jersey_club ? { valor_jersey_club: deCentavos(aCentavos(f.valor_jersey_club)) } : {}),
        ...(f.pvp_sugerido ? { pvp_sugerido: deCentavos(aCentavos(f.pvp_sugerido)) } : {}),
      });
      avisar("ok", "Variante creada con stock 0. Registra la entrada de mercadería.");
      setF({ ...f, adicional_dorsal: "", codigo_legacy: "" });
      alCrear(r.data);
    } catch (e) {
      setError(
        e instanceof ApiError && e.codigo === "VARIANTE_DUPLICADA"
          ? "Esa combinación exacta de producto, talla, versión, parche y dorsal ya existe."
          : errorDe(e),
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Hoja
      abierta={abierta}
      alCerrar={alCerrar}
      titulo="Nueva variante"
      descripcion="Cada combinación exacta de talla, versión, parche y dorsal es una variante con su propio stock."
      pie={
        <Boton className="w-full" cargando={enviando} disabled={!producto} onClick={() => void crear()} icono={Plus}>
          Crear variante
        </Boton>
      }
    >
      <div className="flex flex-col gap-4">
        {producto ? (
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-placa)] border border-tinta bg-blanco p-3">
            <div className="min-w-0">
              <p className="text-[0.78rem] font-semibold text-gris">Producto</p>
              <p className="truncate font-semibold">
                {titulo(producto.nombre)} <span className="font-normal text-gris">{producto.temporada_coleccion}</span>
              </p>
            </div>
            <Boton tamano="sm" variante="fantasma" onClick={() => setProducto(null)}>
              Cambiar
            </Boton>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Campo etiqueta="Producto" placeholder="Busca por nombre o equipo" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} sufijo={<Search className="size-4" />} />
            <ul className="flex max-h-56 flex-col overflow-y-auto rounded-[var(--radius-placa)] border border-linea bg-blanco">
              {(productos.datos ?? []).map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setProducto(p)} className="flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-plata-1">
                    <span className="font-semibold">{titulo(p.nombre)}</span>
                    <span className="text-[0.8rem] text-gris">
                      {titulo(p.categoria)} · {p.temporada_coleccion ?? "Sin temporada"}
                    </span>
                  </button>
                </li>
              ))}
              {productos.datos?.length === 0 && <li className="px-3 py-3 text-[0.88rem] text-gris">Sin coincidencias. Crea primero el producto.</li>}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Selector etiqueta="Talla o medida" value={f.talla_medida} onChange={(e) => setF({ ...f, talla_medida: e.target.value })} opciones={TALLAS.map((t) => ({ valor: t, etiqueta: t }))} />
          <Selector etiqueta="Versión o modelo" value={f.version_modelo} onChange={(e) => setF({ ...f, version_modelo: e.target.value })} opciones={opciones(VERSIONES)} />
        </div>
        <Campo etiqueta="Parche (opcional)" placeholder="Ej. Champions League" value={f.adicional_parche} onChange={(e) => setF({ ...f, adicional_parche: e.target.value })} />
        <Campo etiqueta="Dorsal (opcional)" placeholder="Ej. Messi 10" value={f.adicional_dorsal} onChange={(e) => setF({ ...f, adicional_dorsal: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Costo JRS" inputMode="decimal" placeholder="0.00" value={f.valor_jersey_club} onChange={(e) => setF({ ...f, valor_jersey_club: e.target.value })} error={montoInvalido(f.valor_jersey_club) ? "Monto inválido" : null} />
          <Campo etiqueta="PVP sugerido" inputMode="decimal" placeholder="0.00" value={f.pvp_sugerido} onChange={(e) => setF({ ...f, pvp_sugerido: e.target.value })} error={montoInvalido(f.pvp_sugerido) ? "Monto inválido" : null} />
        </div>
        <Campo etiqueta="Código interno (opcional)" placeholder="Ej. LTOO90" value={f.codigo_legacy} onChange={(e) => setF({ ...f, codigo_legacy: e.target.value })} />
        {error && <Aviso tono="error" titulo="No se pudo crear la variante">{error}</Aviso>}
      </div>
    </Hoja>
  );
}

// ------------------------------------------------------------------ Ajuste de stock
export function HojaAjuste({
  variante,
  alCerrar,
  alAjustar,
}: {
  variante: Variante | null;
  alCerrar: () => void;
  alAjustar: (varianteId: string, stockNuevo: number) => void;
}) {
  const avisar = useNotas();
  const [tipo, setTipo] = useState<"AJUSTE_ENTRADA" | "AJUSTE_SALIDA">("AJUSTE_ENTRADA");
  const [cantidad, setCantidad] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [clave, setClave] = useState(uuid);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [previa, setPrevia] = useState<Variante | null>(null);
  if (variante !== previa) {
    setPrevia(variante);
    setTipo("AJUSTE_ENTRADA");
    setCantidad(1);
    setMotivo("");
    setError(null);
    setClave(uuid());
  }

  const stock = variante?.stock_actual ?? 0;
  const excede = tipo === "AJUSTE_SALIDA" && cantidad > stock;
  const resultado = tipo === "AJUSTE_ENTRADA" ? stock + cantidad : stock - cantidad;

  async function ajustar() {
    if (!variante || excede) return;
    if (motivo.trim().length < 3) {
      setError("Escribe el motivo: queda registrado en el Kardex.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await post<{ stock_nuevo: number }>(
        "/stock/ajustes",
        { variante_id: variante.id, tipo, cantidad, observacion: motivo.trim() },
        { idempotencyKey: clave },
      );
      avisar("ok", `Stock actualizado: ${r.data.stock_nuevo} unidades.`);
      alAjustar(variante.id, r.data.stock_nuevo);
      alCerrar();
    } catch (e) {
      setError(errorDe(e));
      if (e instanceof ApiError && e.status === 409) setClave(uuid());
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Hoja
      abierta={variante !== null}
      alCerrar={alCerrar}
      titulo="Ajustar stock"
      descripcion={variante ? `${titulo(nombreProducto(variante))} · ${rasgos(variante).join(" · ")}` : undefined}
      pie={
        <Boton className="w-full" cargando={enviando} disabled={excede} onClick={() => void ajustar()}>
          {tipo === "AJUSTE_ENTRADA" ? `Registrar entrada de ${cantidad}` : `Registrar salida de ${cantidad}`}
        </Boton>
      }
    >
      <div className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Tipo de ajuste" className="grid grid-cols-2 gap-2">
          {(
            [
              ["AJUSTE_ENTRADA", "Entrada", "Mercadería nueva o devolución"],
              ["AJUSTE_SALIDA", "Salida", "Pérdida, daño o corrección"],
            ] as const
          ).map(([v, t, n]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={tipo === v}
              onClick={() => setTipo(v)}
              className={cx(
                "flex flex-col items-start rounded-[var(--radius-placa)] border p-3 text-left transition-colors",
                tipo === v ? "border-tinta bg-blanco shadow-[var(--shadow-suave)]" : "border-linea hover:border-tinta/40",
              )}
            >
              <span className="font-semibold">{t}</span>
              <span className="text-[0.78rem] text-gris">{n}</span>
            </button>
          ))}
        </div>
        <div>
          <p className="mb-2 text-[0.82rem] font-semibold">Cantidad</p>
          <div className="flex items-center gap-3">
            <Boton variante="secundario" aria-label="Restar" onClick={() => setCantidad((c) => Math.max(1, c - 1))} icono={Minus} />
            <input
              inputMode="numeric"
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, Math.min(10000, Number(e.target.value.replace(/\D/g, "")) || 1)))}
              className="cifra h-11 w-24 rounded-[var(--radius-placa)] border border-linea bg-blanco text-center text-[1.5rem] font-bold focus:border-tinta focus:outline-none"
              aria-label="Cantidad"
            />
            <Boton variante="secundario" aria-label="Sumar" onClick={() => setCantidad((c) => c + 1)} icono={Plus} />
          </div>
          <p className={cx("mt-3 text-[0.9rem]", excede ? "font-semibold text-error" : "text-gris")}>
            {excede ? `Solo hay ${stock} en stock: no se puede sacar ${cantidad}.` : (
              <>
                Stock: <b className="cifra text-[1.05rem] text-tinta">{stock}</b> → <b className="cifra text-[1.05rem] text-tinta">{resultado}</b>
              </>
            )}
          </p>
        </div>
        <Campo etiqueta="Motivo" placeholder="Ej. Llegó pedido de importación" value={motivo} onChange={(e) => setMotivo(e.target.value)} ayuda="Queda registrado en el Kardex con la fecha y el costo vigente." />
        {error && <Aviso tono="error" titulo="No se pudo registrar el ajuste">{error}</Aviso>}
      </div>
    </Hoja>
  );
}
