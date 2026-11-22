"use client";

import {
  ArrowLeftRight,
  Banknote,
  Check,
  CreditCard,
  Minus,
  PackageSearch,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Margen } from "@/components/placa-costo";
import { Aviso, Boton, cx, EstadoStock, Selector, useNotas } from "@/components/ui";
import { SelectorCliente, type ClienteVenta } from "@/components/venta/cliente";
import { ApiError, get, mensajeError, post } from "@/lib/api";
import { aCentavos, deCentavos, dinero, dineroCentavos, margen, nombreProducto, porcentaje, rasgos, titulo, uuid } from "@/lib/formato";
import { useEsDueno } from "@/lib/sesion";
import { CONSUMIDOR_FINAL_ID, type MetodoPago, type PaginaVariantes, type Variante, type Venta } from "@/lib/tipos";
import { useConsulta } from "@/lib/use-consulta";
import { useRetrasado } from "@/lib/use-retrasado";

interface Linea {
  variante: Variante;
  cantidad: number;
  precio: string;
}

const PAGOS: { valor: MetodoPago; etiqueta: string; nota: string; icono: typeof Banknote }[] = [
  { valor: "TRANSFERENCIA", etiqueta: "Transferencia", nota: "Depósito o transferencia bancaria", icono: ArrowLeftRight },
  { valor: "EFECTIVO", etiqueta: "Efectivo", nota: "Pago en mano o contra entrega", icono: Banknote },
  { valor: "TARJETA", etiqueta: "Tarjeta", nota: "Débito o crédito", icono: CreditCard },
];

const ENVIOS = [
  { valor: "RETIRO", etiqueta: "Retiro o entrega directa" },
  { valor: "SERVIENTREGA", etiqueta: "Servientrega" },
  { valor: "LAAR_COURIER", etiqueta: "Laar Courier" },
  { valor: "ENTREGA_QUITO", etiqueta: "Entrega en Quito" },
  { valor: "OTRO", etiqueta: "Otro" },
];

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export default function NuevaVenta() {
  const dueno = useEsDueno();
  const avisar = useNotas();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cliente, setCliente] = useState<ClienteVenta>({ modo: "CONSUMIDOR_FINAL" });
  const [envio, setEnvio] = useState("RETIRO");
  const [pago, setPago] = useState<MetodoPago | null>(null);
  const [observacion, setObservacion] = useState("");
  const [clave, setClave] = useState(uuid);
  const [enviando, setEnviando] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorLinea, setErrorLinea] = useState<Record<string, string>>({});
  const [vendida, setVendida] = useState<{ venta: Venta; mensaje: string } | null>(null);

  const termino = useRetrasado(busqueda.trim(), 250);
  const resultados = useConsulta(vendida ? null : `bus:${termino}`, (signal) =>
    get<PaginaVariantes>("/variantes", { query: { busqueda: termino || undefined, solo_disponibles: true, limit: 8 }, signal }).then((r) => r.data.items),
  );

  // Envío por defecto según el courier preferido del cliente
  const [clientePrevio, setClientePrevio] = useState(cliente);
  if (clientePrevio !== cliente) {
    setClientePrevio(cliente);
    if (cliente.modo === "REGISTRADO") setEnvio(cliente.cliente.courier_preferido);
    else if (cliente.modo === "RESPALDO") setEnvio(cliente.datos.courier_preferido);
    else setEnvio("RETIRO");
  }

  const totales = useMemo(() => {
    let total = 0;
    let costo = 0;
    let unidades = 0;
    let precioInvalido = false;
    for (const l of lineas) {
      const p = aCentavos(l.precio);
      if (!l.precio || Number.isNaN(p) || p <= 0) precioInvalido = true;
      else total += p * l.cantidad;
      costo += aCentavos(l.variante.valor_jersey_club) * l.cantidad;
      unidades += l.cantidad;
    }
    const sinCosto = lineas.some((l) => aCentavos(l.variante.valor_jersey_club) === 0);
    const todoSinCosto = lineas.length > 0 && lineas.every((l) => aCentavos(l.variante.valor_jersey_club) === 0);
    return { total, costo, unidades, precioInvalido, sinCosto, todoSinCosto };
  }, [lineas]);

  const excedeStock = lineas.some((l) => l.cantidad > l.variante.stock_actual);
  const faltantes = [
    lineas.length === 0 && "agrega al menos un producto",
    totales.precioInvalido && "escribe el precio de cada producto",
    excedeStock && "ajusta las cantidades al stock disponible",
    !pago && "elige el método de pago",
  ].filter(Boolean) as string[];

  function agregar(v: Variante) {
    setErrorLinea((e) => ({ ...e, [v.id]: "" }));
    setLineas((ls) => {
      const existente = ls.find((l) => l.variante.id === v.id);
      if (existente) {
        if (existente.cantidad >= v.stock_actual) {
          avisar("info", `Solo hay ${v.stock_actual} en stock de esa variante.`);
          return ls;
        }
        return ls.map((l) => (l.variante.id === v.id ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [...ls, { variante: v, cantidad: 1, precio: aCentavos(v.pvp_sugerido) ? v.pvp_sugerido : "" }];
    });
  }

  const cambiarLinea = (id: string, cambio: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.variante.id === id ? { ...l, ...cambio } : l)));

  /** Vuelve a leer el stock de las variantes del carrito (tras un 409). */
  async function refrescarStock() {
    const frescas = await Promise.all(
      lineas.map((l) => get<Variante>(`/variantes/${l.variante.id}`).then((r) => r.data).catch(() => l.variante)),
    );
    setLineas((ls) => ls.map((l) => ({ ...l, variante: frescas.find((f) => f.id === l.variante.id) ?? l.variante })));
  }

  async function confirmar() {
    setIntentado(true);
    if (faltantes.length) return;
    setEnviando(true);
    setError(null);
    setErrorLinea({});
    const notaEnvio = envio === "RETIRO" ? "" : `Envío: ${ENVIOS.find((e) => e.valor === envio)?.etiqueta}`;
    const cuerpo = {
      ...(cliente.modo === "REGISTRADO" ? { cliente_id: cliente.cliente.id } : {}),
      ...(cliente.modo === "RESPALDO"
        ? {
            cliente_respaldo: {
              tipo_identificacion: cliente.datos.tipo_identificacion,
              identificacion: cliente.datos.identificacion.replace(/[\s-]/g, ""),
              nombre_completo: cliente.datos.nombre_completo.trim(),
              ...(cliente.datos.telefono.trim() ? { telefono: cliente.datos.telefono.trim() } : {}),
              ...(cliente.datos.email.trim() ? { email: cliente.datos.email.trim() } : {}),
              ...(cliente.datos.ciudad.trim() ? { ciudad: cliente.datos.ciudad.trim() } : {}),
              ...(cliente.datos.direccion_referencia.trim() ? { direccion_referencia: cliente.datos.direccion_referencia.trim() } : {}),
            },
          }
        : {}),
      ...(cliente.modo === "CONSUMIDOR_FINAL" ? { cliente_id: CONSUMIDOR_FINAL_ID } : {}),
      metodo_pago: pago,
      ...([notaEnvio, observacion.trim()].filter(Boolean).length ? { observacion: [notaEnvio, observacion.trim()].filter(Boolean).join(" · ").slice(0, 500) } : {}),
      items: lineas.map((l) => ({ variante_id: l.variante.id, cantidad: l.cantidad, precio_venta_unitario: deCentavos(aCentavos(l.precio)) })),
    };
    try {
      const r = await post<Venta>("/ventas", cuerpo, { idempotencyKey: clave });
      setVendida({ venta: r.data, mensaje: r.message });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      // Resultado desconocido (sin conexión / timeout): se conserva la clave y reintentar es seguro.
      const incierto = e instanceof ApiError && (e.status === 0 || e.status === 504);
      if (!incierto) setClave(uuid());
      if (e instanceof ApiError && e.codigo === "STOCK_INSUFICIENTE") {
        const porLinea: Record<string, string> = {};
        for (const d of e.detalles) {
          const id = UUID_RE.exec(d)?.[0];
          const disponible = /disponible (\d+)/.exec(d)?.[1];
          if (id) porLinea[id] = disponible === "0" ? "Otra venta se llevó la última unidad. Ya no hay stock." : `Otra venta se adelantó: ahora quedan ${disponible}.`;
        }
        setErrorLinea(porLinea);
        setError("Alguien vendió estas unidades hace un momento. Ajusta el carrito y confirma de nuevo; no se cobró nada.");
        void refrescarStock();
      } else if (incierto) {
        setError("No hubo respuesta del servidor. Pulsa «Confirmar venta» otra vez: si la venta ya se registró, no se duplicará.");
      } else {
        setError(e instanceof ApiError && e.detalles.length ? `${mensajeError(e)} ${e.detalles.filter((d) => d !== e.mensaje).join(" ")}`.trim() : mensajeError(e));
      }
    } finally {
      setEnviando(false);
    }
  }

  function nuevaVenta() {
    setLineas([]);
    setCliente({ modo: "CONSUMIDOR_FINAL" });
    setPago(null);
    setObservacion("");
    setClave(uuid());
    setIntentado(false);
    setError(null);
    setErrorLinea({});
    setVendida(null);
    setBusqueda("");
  }

  if (vendida) return <Comprobante venta={vendida.venta} mensaje={vendida.mensaje} dueno={dueno} alNueva={nuevaVenta} />;

  const margenTotal = margen(totales.costo, totales.total);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="cifra text-[2.1rem] leading-none font-bold lg:text-[2.6rem]">Registrar venta</h1>
        <p className="mt-1.5 text-gris">Productos, cliente y pago en una sola pantalla.</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,1fr)] lg:gap-8">
        {/* Productos */}
        <section aria-labelledby="t-productos" className="flex min-w-0 flex-col gap-4 rounded-xl border border-linea bg-blanco p-4 sm:p-5">
          <h2 id="t-productos" className="cifra flex items-center gap-2 text-[1.4rem] font-bold">
            <Paso n={1} /> Productos
          </h2>
          <label className="relative">
            <span className="sr-only">Buscar variante</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-gris" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Equipo, código, talla, parche o dorsal"
              className="h-12 w-full rounded-[var(--radius-placa)] border border-linea bg-papel pr-3 pl-10 text-[1rem] focus:border-tinta focus:bg-blanco focus:ring-2 focus:ring-tinta/12 focus:outline-none"
            />
          </label>
          <ul className={cx("flex max-h-[22rem] flex-col overflow-y-auto border-y border-linea-2 transition-opacity", resultados.cargando && resultados.datos && "opacity-60")}>
            {resultados.error ? (
              <li className="p-3"><Aviso tono="error" titulo="No se pudo buscar en el inventario">{mensajeError(resultados.error)}</Aviso></li>
            ) : !resultados.datos ? (
              <li className="px-3 py-4 text-[0.9rem] text-gris">Cargando variantes disponibles…</li>
            ) : resultados.datos.length === 0 ? (
              <li className="flex items-center gap-2 px-3 py-4 text-[0.9rem] text-gris"><PackageSearch className="size-4" /> Ninguna variante con stock coincide.</li>
            ) : (
              resultados.datos.map((v) => {
                const enCarrito = lineas.find((l) => l.variante.id === v.id)?.cantidad ?? 0;
                const lleno = enCarrito >= v.stock_actual;
                return (
                  <li key={v.id} className="border-t border-linea-2 first:border-t-0">
                    <button
                      type="button"
                      disabled={lleno}
                      onClick={() => agregar(v)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-plata-1 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      <span className="cifra rounded bg-tinta px-1.5 py-0.5 text-[0.8rem] font-bold text-blanco">{v.codigo_legacy ?? "S/C"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{titulo(nombreProducto(v))}</span>
                        <span className="block text-[0.8rem] text-gris">{rasgos(v).join(" · ")}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <EstadoStock stock={v.stock_actual - enCarrito} compacto />
                        {aCentavos(v.pvp_sugerido) ? (
                          <span className="cifra text-[0.95rem] font-bold">{dinero(v.pvp_sugerido)}</span>
                        ) : (
                          <span className="text-[0.78rem] font-semibold text-gris">Sin PVP</span>
                        )}
                      </span>
                      <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", lleno ? "bg-linea-2 text-gris" : "bg-tinta text-blanco")}>
                        {lleno ? <Check className="size-4" /> : <Plus className="size-4" />}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div>
            <h3 className="mb-2 flex items-center justify-between text-[0.95rem] font-semibold">
              <span className="flex items-center gap-2"><ShoppingBag className="size-4" /> Carrito</span>
              <span className="text-gris">{totales.unidades} {totales.unidades === 1 ? "unidad" : "unidades"}</span>
            </h3>
            {lineas.length === 0 ? (
              <p className={cx("rounded-[var(--radius-placa)] border border-dashed px-4 py-6 text-center text-[0.9rem]", intentado ? "border-error text-error" : "border-linea text-gris")}>
                Toca una variante de la lista para agregarla.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {lineas.map((l) => (
                  <LineaCarrito
                    key={l.variante.id}
                    l={l}
                    dueno={dueno}
                    intentado={intentado}
                    error={errorLinea[l.variante.id]}
                    alCambiar={(c) => cambiarLinea(l.variante.id, c)}
                    alQuitar={() => setLineas((ls) => ls.filter((x) => x.variante.id !== l.variante.id))}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-8">
          {/* Cliente y envío */}
          <section aria-labelledby="t-cliente" className="flex flex-col gap-4 rounded-xl border border-linea bg-blanco p-4 sm:p-5">
            <h2 id="t-cliente" className="cifra flex items-center gap-2 text-[1.4rem] font-bold">
              <Paso n={2} /> Cliente y envío
            </h2>
            <SelectorCliente valor={cliente} alCambiar={setCliente} />
            <div className="flex items-end gap-2">
              <Truck className="mb-3 size-5 shrink-0 text-gris" />
              <Selector etiqueta="Entrega" className="flex-1" value={envio} onChange={(e) => setEnvio(e.target.value)} opciones={ENVIOS} />
            </div>
          </section>

          {/* Pago y cierre */}
          <section aria-labelledby="t-pago" className="flex flex-col gap-4 rounded-xl border border-linea bg-blanco p-4 sm:p-5">
            <h2 id="t-pago" className="cifra flex items-center gap-2 text-[1.4rem] font-bold">
              <Paso n={3} /> Pago y cierre
            </h2>
            <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-3 gap-2">
              {PAGOS.map(({ valor, etiqueta, nota, icono: Icono }) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={pago === valor}
                  title={nota}
                  onClick={() => setPago(valor)}
                  className={cx(
                    "flex min-h-24 flex-col items-center justify-center gap-2 rounded-[var(--radius-placa)] border-2 px-1 text-[0.9rem] font-semibold transition-[background-color,border-color,transform] active:scale-[0.98]",
                    pago === valor ? "border-tinta bg-tinta text-blanco" : intentado && !pago ? "border-error/60 bg-blanco" : "border-linea bg-blanco hover:border-tinta/40",
                  )}
                >
                  <Icono className="size-6" />
                  {etiqueta}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5 text-[0.82rem] font-semibold">
              Observación (opcional)
              <textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                maxLength={400}
                rows={2}
                placeholder="Ej. Entregar después de las 18:00"
                className="resize-none rounded-[var(--radius-placa)] border border-linea bg-blanco px-3 py-2 text-[0.95rem] font-normal focus:border-tinta focus:ring-2 focus:ring-tinta/12 focus:outline-none"
              />
            </label>

            <div className="sobre-tinta rounded-[var(--radius-placa)] bg-tinta p-4 text-blanco">
              <div className="flex items-baseline justify-between">
                <span className="text-humo">Total a cobrar</span>
                <span className="cifra text-[2.3rem] leading-none font-bold">{dineroCentavos(totales.total)}</span>
              </div>
              {dueno && lineas.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-tinta-3 pt-3 text-[0.8rem] text-humo">
                  <span>{totales.sinCosto && !totales.todoSinCosto ? "Costo JRS · parcial" : "Costo JRS"}<b className="cifra block text-[1.1rem] text-blanco">{totales.todoSinCosto ? "Sin cargar" : dineroCentavos(totales.costo)}</b></span>
                  <span>{totales.sinCosto ? "Ganancia · parcial" : "Ganancia"}<b className={cx("cifra block text-[1.1rem]", totales.total - totales.costo < 0 ? "text-[#ff9aa3]" : totales.sinCosto ? "text-[#f3c56b]" : "text-blanco")}>{dineroCentavos(totales.total - totales.costo)}</b></span>
                  <span>{totales.sinCosto && !totales.todoSinCosto ? "Margen · parcial" : "Margen"}<b className="cifra block text-[1.1rem] text-blanco">{totales.todoSinCosto ? "—" : porcentaje(margenTotal)}</b></span>
                </div>
              )}
              {dueno && totales.sinCosto && (
                <p className="mt-2 text-[0.78rem] text-[#f3c56b]">Hay productos sin costo cargado: la ganancia mostrada es mayor que la real.</p>
              )}
            </div>

            {error && <Aviso tono="error" titulo="La venta no se registró">{error}</Aviso>}
            {intentado && faltantes.length > 0 && !error && (
              <p className="text-[0.88rem] font-medium text-error">Para confirmar: {faltantes.join(", ")}.</p>
            )}
            <Boton tamano="lg" className="w-full text-[1.05rem]" cargando={enviando} icono={Check} onClick={() => void confirmar()}>
              Confirmar venta · {dineroCentavos(totales.total)}
            </Boton>
          </section>
        </div>
      </div>
    </div>
  );
}

function Paso({ n }: { n: number }) {
  return <span className="grid size-7 place-items-center rounded-full bg-tinta text-[0.95rem] font-extrabold text-blanco">{n}</span>;
}

function LineaCarrito({
  l,
  dueno,
  intentado,
  error,
  alCambiar,
  alQuitar,
}: {
  l: Linea;
  dueno: boolean;
  intentado: boolean;
  error?: string;
  alCambiar: (c: Partial<Linea>) => void;
  alQuitar: () => void;
}) {
  const stock = l.variante.stock_actual;
  const excede = l.cantidad > stock;
  const precioMalo = intentado && (!l.precio || Number.isNaN(aCentavos(l.precio)) || aCentavos(l.precio) <= 0);
  const subtotal = Number.isNaN(aCentavos(l.precio)) ? 0 : aCentavos(l.precio) * l.cantidad;
  return (
    <li className={cx("animate-entrar border-t py-3", error || excede ? "-mx-2 border-error/50 bg-error-fondo/40 px-2" : "border-linea-2")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            <span className="cifra mr-1.5 text-gris">{l.variante.codigo_legacy}</span>
            {titulo(nombreProducto(l.variante))}
          </p>
          <p className="text-[0.8rem] text-gris">{rasgos(l.variante).join(" · ")}</p>
        </div>
        <button type="button" onClick={alQuitar} aria-label="Quitar del carrito" className="-mt-1 -mr-1 grid size-9 place-items-center rounded-full text-gris hover:bg-tinta/6 hover:text-error">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-[0.78rem] font-semibold text-gris">Cantidad · máx. {stock}</p>
          <div className="flex items-center rounded-[var(--radius-placa)] border border-linea bg-blanco">
            <button type="button" aria-label="Restar una" disabled={l.cantidad <= 1} onClick={() => alCambiar({ cantidad: l.cantidad - 1 })} className="grid size-10 place-items-center disabled:text-plata-2">
              <Minus className="size-4" />
            </button>
            <span className="cifra w-8 text-center text-[1.2rem] font-bold" aria-live="polite">{l.cantidad}</span>
            <button
              type="button"
              aria-label="Sumar una"
              disabled={l.cantidad >= stock}
              onClick={() => alCambiar({ cantidad: l.cantidad + 1 })}
              className="grid size-10 place-items-center disabled:text-plata-2"
              title={l.cantidad >= stock ? "No hay más stock de esta variante" : undefined}
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
        <label className="flex w-32 flex-col gap-1 text-[0.78rem] font-semibold text-gris">
          Precio de venta
          <span className="relative">
            <span className="absolute inset-y-0 left-2.5 flex items-center text-gris">$</span>
            <input
              inputMode="decimal"
              value={l.precio}
              onChange={(e) => alCambiar({ precio: e.target.value })}
              placeholder="0.00"
              aria-invalid={precioMalo || undefined}
              className={cx(
                "cifra h-10 w-full rounded-[var(--radius-placa)] border bg-blanco pr-2 pl-6 text-[1.1rem] font-bold text-tinta focus:border-tinta focus:ring-2 focus:ring-tinta/12 focus:outline-none",
                precioMalo ? "border-error" : "border-linea",
              )}
            />
          </span>
        </label>
        <div className="ml-auto text-right">
          <p className="cifra text-[1.25rem] font-bold">{dineroCentavos(subtotal)}</p>
          {dueno && <Margen costo={l.variante.valor_jersey_club} precio={l.precio || "0"} className="text-[0.85rem]" />}
        </div>
      </div>
      {excede && !error && <p className="mt-2 text-[0.82rem] font-semibold text-error">Solo quedan {stock}. Baja la cantidad para continuar.</p>}
      {error && <p role="alert" className="mt-2 text-[0.82rem] font-semibold text-error">{error}</p>}
    </li>
  );
}

function Comprobante({ venta, mensaje, dueno, alNueva }: { venta: Venta; mensaje: string; dueno: boolean; alNueva: () => void }) {
  const advertencia = mensaje.includes("Atención:") ? mensaje.split("Atención:")[1].trim() : null;
  return (
    <div className="mx-auto flex w-full max-w-xl animate-entrar flex-col gap-5">
      <div className="sobre-tinta overflow-hidden rounded-xl bg-tinta text-blanco shadow-[var(--shadow-flota)]">
        <div className="flex items-center gap-3 border-b border-tinta-3 px-5 py-4">
          <span className="metal grid size-10 place-items-center rounded-full"><Check className="size-5" /></span>
          <div>
            <p className="font-semibold">Venta confirmada</p>
            <p className="cifra text-[1.15rem] font-bold text-plata-2">{venta.numero_comprobante}</p>
          </div>
        </div>
        <div className="px-5 py-5">
          <p className="text-humo">Total cobrado · {titulo(venta.metodo_pago)}</p>
          <p className="cifra text-[3rem] leading-none font-bold">{dinero(venta.total_vendido)}</p>
          {dueno && (
            <p className="mt-2 text-[0.92rem] text-humo">
              Costo JRS {dinero(venta.costo_total_jrs)} · Ganancia <b className="text-blanco">{dinero(venta.ganancia_total)}</b>
            </p>
          )}
          <p className="mt-3 text-[0.92rem] text-humo">Cliente: <b className="text-blanco">{venta.cliente_snapshot.nombre_completo ?? "Consumidor final"}</b></p>
        </div>
        <ul className="border-t border-tinta-3 px-5 py-3">
          {venta.detalle?.map((d) => (
            <li key={d.id} className="flex items-baseline justify-between gap-3 py-1.5 text-[0.92rem]">
              <span className="min-w-0 truncate">
                {d.cantidad} × {titulo(d.snapshot_producto.nombre)} · {d.snapshot_producto.talla_medida}
              </span>
              <span className="cifra font-bold">{dinero(d.subtotal)}</span>
            </li>
          ))}
        </ul>
      </div>
      {advertencia && <Aviso tono="alerta" titulo="Venta registrada con datos de respaldo">{advertencia}</Aviso>}
      <div className="grid grid-cols-2 gap-3">
        <Boton tamano="lg" icono={Plus} onClick={alNueva}>Nueva venta</Boton>
        <Link href="/ventas/" className="inline-flex h-14 items-center justify-center gap-2 rounded-[var(--radius-placa)] border border-linea bg-blanco font-semibold hover:bg-plata-1">
          <ReceiptText className="size-5" /> Ver historial
        </Link>
      </div>
    </div>
  );
}
