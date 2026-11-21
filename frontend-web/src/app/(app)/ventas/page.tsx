"use client";

import { ChevronLeft, ChevronRight, Plus, ReceiptText, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Aviso, Boton, cx, Esqueleto, Selector, Vacio } from "@/components/ui";
import { get, mensajeError } from "@/lib/api";
import { dinero, fecha, hoyEcuador, inicioMesEcuador, numero, titulo } from "@/lib/formato";
import { useEsDueno } from "@/lib/sesion";
import { METODOS_PAGO, type Dashboard, type EstadoVenta, type Pagina, type Venta } from "@/lib/tipos";
import { useConsulta } from "@/lib/use-consulta";

const LIMITE = 20;

const ESTADO: Record<EstadoVenta, { etiqueta: string; clase: string }> = {
  CONFIRMADA: { etiqueta: "Confirmada", clase: "bg-ok-fondo text-ok" },
  RECHAZADA: { etiqueta: "Rechazada", clase: "bg-error-fondo text-error" },
  FALLIDA: { etiqueta: "Fallida", clase: "bg-error-fondo text-error" },
  PENDIENTE: { etiqueta: "Pendiente", clase: "bg-alerta-fondo text-alerta" },
};

export default function Historial() {
  const dueno = useEsDueno();
  const [desde, setDesde] = useState(inicioMesEcuador);
  const [hasta, setHasta] = useState(() => hoyEcuador());
  const [metodo, setMetodo] = useState("");
  const [estado, setEstado] = useState("CONFIRMADA");
  const [pagina, setPagina] = useState(1);
  const rangoInvalido = desde > hasta;

  const query = { desde, hasta, metodo_pago: metodo || undefined, estado: estado || undefined, page: pagina, limit: LIMITE };
  const lista = useConsulta(rangoInvalido ? null : JSON.stringify(query), async (signal) => {
    const r = await get<Pagina<Venta>>("/ventas", { query, signal });
    // El listado no trae el detalle: se completa en paralelo para mostrar los productos.
    const conDetalle = await Promise.all(
      r.data.items.map((v) =>
        get<Venta>(`/ventas/${v.id}`, { signal })
          .then((d) => d.data)
          .catch(() => v),
      ),
    );
    return { ...r.data, items: conDetalle };
  });
  const resumen = useConsulta(rangoInvalido ? null : `res:${desde}:${hasta}`, (signal) =>
    get<Dashboard>("/ventas/dashboard", { query: { desde, hasta }, signal }).then((r) => r.data),
  );

  const filtro = (f: () => void) => {
    f();
    setPagina(1);
  };
  const r = resumen.datos;
  const delMetodo = metodo && r ? r.por_metodo_pago.find((m) => m.metodo_pago === metodo) : null;
  const totalPaginas = lista.datos ? Math.max(1, Math.ceil(lista.datos.meta.total / LIMITE)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="cifra text-[2.1rem] leading-none font-bold lg:text-[2.6rem]">Ventas</h1>
          <p className="mt-1.5 text-gris">Cada venta guarda el precio y el costo del momento en que se cobró.</p>
        </div>
        <Link href="/ventas/nueva/" className="hidden h-11 items-center gap-2 rounded-[var(--radius-placa)] bg-tinta px-4 font-semibold text-blanco hover:bg-tinta-2 sm:inline-flex">
          <Plus className="size-5" /> Registrar venta
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-linea bg-blanco p-3 sm:p-4 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5 text-[0.82rem] font-semibold">
          Desde
          <input type="date" value={desde} max={hasta} onChange={(e) => filtro(() => setDesde(e.target.value))} className="h-11 rounded-[var(--radius-placa)] border border-linea bg-blanco px-3 text-[0.95rem] font-normal focus:border-tinta focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1.5 text-[0.82rem] font-semibold">
          Hasta
          <input type="date" value={hasta} min={desde} max={hoyEcuador()} onChange={(e) => filtro(() => setHasta(e.target.value))} className="h-11 rounded-[var(--radius-placa)] border border-linea bg-blanco px-3 text-[0.95rem] font-normal focus:border-tinta focus:outline-none" />
        </label>
        <Selector etiqueta="Método de pago" vacio="Todos" value={metodo} onChange={(e) => filtro(() => setMetodo(e.target.value))} opciones={METODOS_PAGO.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))} />
        <Selector
          etiqueta="Estado"
          vacio="Todos"
          value={estado}
          onChange={(e) => filtro(() => setEstado(e.target.value))}
          opciones={(Object.keys(ESTADO) as EstadoVenta[]).map((k) => ({ valor: k, etiqueta: ESTADO[k].etiqueta }))}
        />
      </div>
      {rangoInvalido && <Aviso tono="alerta" titulo="La fecha «Desde» es posterior a «Hasta»" />}

      {/* Resumen del rango (solo confirmadas) */}
      <dl className="sobre-tinta grid grid-cols-2 overflow-hidden rounded-xl bg-tinta text-blanco sm:grid-cols-4">
        <Cifra etiqueta={metodo ? `Cobrado por ${titulo(metodo)}` : "Total cobrado"} valor={r ? dinero(delMetodo ? delMetodo.total_vendido : r.total_vendido) : null} />
        <Cifra etiqueta="Ventas confirmadas" valor={r ? numero(delMetodo ? delMetodo.ventas : r.ventas_confirmadas) : null} />
        {dueno ? (
          <>
            <Cifra etiqueta="Costo JRS" valor={r && !metodo ? dinero(r.costo_total_jrs) : r ? "—" : null} />
            <Cifra etiqueta="Ganancia real" valor={r ? dinero(delMetodo ? delMetodo.ganancia_total : r.ganancia_neta) : null} />
          </>
        ) : (
          <>
            <Cifra etiqueta="Unidades" valor={r && !metodo ? numero(r.unidades_vendidas) : r ? "—" : null} />
            <Cifra etiqueta="Ticket promedio" valor={r && !metodo ? dinero(r.ticket_promedio) : r ? "—" : null} />
          </>
        )}
      </dl>

      {lista.error ? (
        <Aviso tono="error" titulo="No se pudo cargar el historial" accion={<Boton tamano="sm" variante="secundario" icono={RefreshCw} onClick={lista.recargar}>Reintentar</Boton>}>
          {mensajeError(lista.error)}
        </Aviso>
      ) : null}

      <section aria-label="Ventas" aria-busy={lista.cargando} className={cx("transition-opacity", lista.cargando && lista.datos && "opacity-60")}>
        {!lista.datos ? (
          <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-24" />)}</div>
        ) : lista.datos.items.length === 0 ? (
          <div className="rounded-xl border border-linea bg-blanco">
            <Vacio icono={ReceiptText} titulo="No hay ventas con estos filtros">
              Cambia el rango de fechas o el método de pago. Las ventas nuevas aparecen aquí al confirmarse.
            </Vacio>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2 lg:hidden">
              {lista.datos.items.map((v) => (
                <li key={v.id} className="rounded-xl border border-linea bg-blanco p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="cifra text-[1.1rem] font-bold">{v.numero_comprobante}</p>
                      <p className="text-[0.82rem] text-gris">{fecha(v.created_at)} · {titulo(v.metodo_pago)}</p>
                    </div>
                    <EtiquetaEstado e={v.estado} />
                  </div>
                  <p className="mt-2 truncate text-[0.9rem] font-medium">{v.cliente_snapshot.nombre_completo ?? "Consumidor final"}</p>
                  <Productos v={v} />
                  <div className="mt-3 flex items-end justify-between border-t border-linea-2 pt-3">
                    {dueno ? (
                      <p className="text-[0.82rem] text-gris">
                        Costo {dinero(v.costo_total_jrs)} · Ganancia <b className="cifra text-[1rem] text-ok">{dinero(v.ganancia_total)}</b>
                      </p>
                    ) : <span />}
                    <p className="cifra text-[1.4rem] font-bold">{dinero(v.total_vendido)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-hidden rounded-xl border border-linea bg-blanco lg:block">
              <table className="w-full border-collapse text-left text-[0.92rem]">
                <thead className="bg-tinta text-[0.78rem] font-semibold tracking-wide text-humo uppercase">
                  <tr>
                    <th className="px-4 py-3">Comprobante</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Productos vendidos</th>
                    <th className="px-4 py-3">Pago</th>
                    <th className="px-4 py-3 text-right">Total cobrado</th>
                    {dueno && <th className="px-4 py-3 text-right">Costo JRS</th>}
                    {dueno && <th className="px-4 py-3 text-right">Ganancia real</th>}
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.datos.items.map((v) => (
                    <tr key={v.id} className="border-t border-linea-2 align-top hover:bg-papel/70">
                      <td className="px-4 py-3">
                        <p className="cifra text-[1.05rem] font-bold">{v.numero_comprobante}</p>
                        <p className="text-[0.8rem] text-gris">{fecha(v.created_at)}</p>
                      </td>
                      <td className="max-w-[14rem] px-4 py-3">
                        <p className="truncate font-medium">{v.cliente_snapshot.nombre_completo ?? "Consumidor final"}</p>
                        <p className="truncate text-[0.8rem] text-gris">{v.cliente_snapshot.identificacion}</p>
                      </td>
                      <td className="px-4 py-3"><Productos v={v} /></td>
                      <td className="px-4 py-3">{titulo(v.metodo_pago)}</td>
                      <td className="cifra px-4 py-3 text-right text-[1.1rem] font-bold">{dinero(v.total_vendido)}</td>
                      {dueno && <td className="cifra px-4 py-3 text-right text-[1.05rem]">{dinero(v.costo_total_jrs)}</td>}
                      {dueno && <td className="cifra px-4 py-3 text-right text-[1.1rem] font-bold text-ok">{dinero(v.ganancia_total)}</td>}
                      <td className="px-4 py-3"><EtiquetaEstado e={v.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[0.88rem] text-gris">{numero(lista.datos.meta.total)} ventas</p>
              <div className="flex gap-2">
                <Boton variante="secundario" tamano="sm" icono={ChevronLeft} disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Boton>
                <Boton variante="secundario" tamano="sm" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
                  Siguiente <ChevronRight className="size-4" />
                </Boton>
              </div>
            </nav>
          </>
        )}
      </section>
    </div>
  );
}

function Productos({ v }: { v: Venta }) {
  if (!v.detalle) return <p className="text-[0.82rem] text-gris">—</p>;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-[0.85rem]">
      {v.detalle.map((d) => (
        <li key={d.id} className="truncate">
          <b className="cifra">{d.cantidad}×</b> {titulo(d.snapshot_producto.nombre)}{" "}
          <span className="text-gris">
            {d.snapshot_producto.talla_medida}
            {d.snapshot_producto.adicional_dorsal ? ` · ${d.snapshot_producto.adicional_dorsal}` : ""} · {dinero(d.precio_venta_unitario)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EtiquetaEstado({ e }: { e: EstadoVenta }) {
  return <span className={cx("inline-flex rounded-full px-2.5 py-1 text-[0.75rem] font-semibold whitespace-nowrap", ESTADO[e].clase)}>{ESTADO[e].etiqueta}</span>;
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="border-tinta-3 px-5 py-4 even:border-l sm:border-l sm:first:border-l-0 [&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-t-0">
      <dt className="text-[0.8rem] text-humo">{etiqueta}</dt>
      <dd className="cifra mt-1 text-[1.75rem] leading-none font-bold">{valor ?? <span className="inline-block h-7 w-20 animate-pulse rounded bg-tinta-3" />}</dd>
    </div>
  );
}
