"use client";

import { ArrowRight, PackageOpen, Plus, RefreshCw, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EditorPrecios, PlacaCosto } from "@/components/placa-costo";
import { Aviso, Boton, cx, Esqueleto, EstadoStock, Vacio } from "@/components/ui";
import { get, mensajeError } from "@/lib/api";
import { aCentavos, dinero, fechaDia, hoyEcuador, inicioMesEcuador, nombreProducto, numero, porcentaje, rasgos, titulo } from "@/lib/formato";
import { useEsDueno } from "@/lib/sesion";
import type { Dashboard, PaginaVariantes, Variante } from "@/lib/tipos";
import { useConsulta } from "@/lib/use-consulta";

type Periodo = "hoy" | "7d" | "mes" | "30d";
const PERIODOS: { id: Periodo; etiqueta: string }[] = [
  { id: "hoy", etiqueta: "Hoy" },
  { id: "7d", etiqueta: "7 días" },
  { id: "mes", etiqueta: "Este mes" },
  { id: "30d", etiqueta: "30 días" },
];

function rango(p: Periodo): { desde: string; hasta: string } {
  const hasta = hoyEcuador();
  if (p === "hoy") return { desde: hasta, hasta };
  if (p === "7d") return { desde: hoyEcuador(-6), hasta };
  if (p === "30d") return { desde: hoyEcuador(-29), hasta };
  return { desde: inicioMesEcuador(), hasta };
}

const METODO: Record<string, { etiqueta: string; tono: string }> = {
  TRANSFERENCIA: { etiqueta: "Transferencia", tono: "bg-tinta" },
  EFECTIVO: { etiqueta: "Efectivo", tono: "bg-plata-3" },
  TARJETA: { etiqueta: "Tarjeta", tono: "bg-plata-2" },
};

export default function PaginaDashboard() {
  const dueno = useEsDueno();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const r = rango(periodo);

  const ventas = useConsulta(`dash:${r.desde}:${r.hasta}`, (signal) =>
    get<Dashboard>("/ventas/dashboard", { query: r, signal }).then((x) => x.data),
  );
  const inventario = useConsulta("inv:kpis", (signal) =>
    get<PaginaVariantes>("/variantes", { query: { limit: 1 }, signal }).then((x) => x.data.kpis),
  );
  const pendientes = useConsulta(dueno ? "inv:sin-costo" : null, (signal) =>
    get<PaginaVariantes>("/variantes", { query: { sin_costo: true, solo_disponibles: true, limit: 5 }, signal }).then((x) => x.data),
  );

  const d = ventas.datos;
  const k = inventario.datos;
  const sinVentas = d && d.ventas_confirmadas === 0;

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="cifra text-[2.1rem] leading-none font-bold lg:text-[2.6rem]">Panel</h1>
          <p className="mt-1.5 text-gris">
            {d ? (d.periodo.desde === d.periodo.hasta ? fechaDia(d.periodo.desde) : `${fechaDia(d.periodo.desde)} – ${fechaDia(d.periodo.hasta)}`) : "Cargando periodo…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div role="radiogroup" aria-label="Periodo" className="grid flex-1 grid-cols-4 rounded-full bg-linea-2 p-1 sm:flex-none">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={periodo === p.id}
                onClick={() => setPeriodo(p.id)}
                className={cx(
                  "h-9 rounded-full px-3 text-[0.85rem] font-semibold whitespace-nowrap transition-colors",
                  periodo === p.id ? "bg-tinta text-blanco" : "text-gris hover:text-tinta",
                )}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
          <Link
            href="/ventas/nueva/"
            className="hidden h-11 items-center gap-2 rounded-[var(--radius-placa)] bg-tinta px-4 font-semibold whitespace-nowrap text-blanco transition-colors hover:bg-tinta-2 sm:inline-flex"
          >
            <Plus className="size-5" /> Registrar venta rápida
          </Link>
        </div>
      </div>

      {ventas.error ? (
        <Aviso tono="error" titulo="No se pudo cargar el resumen de ventas" accion={<Boton tamano="sm" variante="secundario" icono={RefreshCw} onClick={ventas.recargar}>Reintentar</Boton>}>
          {mensajeError(ventas.error)}
        </Aviso>
      ) : null}

      {/* Franja de indicadores */}
      <section aria-label="Indicadores" className="sobre-tinta overflow-hidden rounded-xl bg-tinta text-blanco shadow-[var(--shadow-suave)]">
        <div className={cx("grid grid-cols-2", dueno ? "lg:grid-cols-5" : "lg:grid-cols-3", ventas.cargando && d && "opacity-70 transition-opacity")}>
          {dueno ? (
            <Indicador
              principal
              etiqueta="Ganancia neta"
              valor={d ? dinero(d.ganancia_neta) : null}
              nota={d ? `${numero(d.ventas_confirmadas)} ${d.ventas_confirmadas === 1 ? "venta" : "ventas"} confirmadas` : null}
              tono={d && aCentavos(d.ganancia_neta) < 0 ? "text-[#ff9aa3]" : undefined}
            />
          ) : (
            <Indicador principal etiqueta="Ventas del periodo" valor={d ? dinero(d.total_vendido) : null} nota={d ? `${numero(d.ventas_confirmadas)} ventas · ${numero(d.unidades_vendidas)} unidades` : null} />
          )}
          {dueno && <Indicador etiqueta="Ventas totales" valor={d ? dinero(d.total_vendido) : null} nota={d ? `Ticket promedio ${dinero(d.ticket_promedio)}` : null} />}
          {dueno && <Indicador etiqueta="Costo Jersey Club" valor={d ? dinero(d.costo_total_jrs) : null} nota="Costo congelado en cada venta" />}
          {dueno && <Indicador etiqueta="Margen promedio" valor={d ? porcentaje(d.margen_porcentaje) : null} nota="Ganancia sobre lo vendido" />}
          {!dueno && <Indicador etiqueta="Ticket promedio" valor={d ? dinero(d.ticket_promedio) : null} nota="Por venta confirmada" />}
          <Indicador etiqueta="Unidades en stock" valor={k ? numero(k.unidades_stock) : null} nota={k ? `${numero(k.skus_con_stock)} variantes disponibles` : null} enlace="/inventario/?solo_disponibles=true" />
        </div>
      </section>

      <Link href="/ventas/nueva/" className="metal flex h-14 items-center justify-center gap-2 rounded-[var(--radius-placa)] text-[1.05rem] font-bold sm:hidden">
        <Plus className="size-5" /> Registrar venta rápida
      </Link>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
        <section className="rounded-xl border border-linea bg-blanco p-5 lg:p-6">
          <h2 className="cifra text-[1.35rem] font-bold">Ingresos por método de pago</h2>
          {!d ? (
            <div className="mt-5 flex flex-col gap-3">
              <Esqueleto className="h-4" />
              <Esqueleto className="h-12" />
              <Esqueleto className="h-12" />
            </div>
          ) : sinVentas ? (
            <Vacio icono={PackageOpen} titulo="Aún no hay ventas en este periodo">
              Las ventas confirmadas aparecerán aquí desglosadas por transferencia, efectivo y tarjeta.
            </Vacio>
          ) : (
            <MetodosPago d={d} dueno={dueno} />
          )}
        </section>

        <section className="rounded-xl border border-linea bg-blanco p-5 lg:p-6">
          <h2 className="cifra flex items-center gap-2 text-[1.35rem] font-bold">
            <Trophy className="size-5 text-plata-3" /> Más vendidos
          </h2>
          {!d ? (
            <div className="mt-5 flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Esqueleto key={i} className="h-11" />
              ))}
            </div>
          ) : d.top_productos.length === 0 ? (
            <Vacio icono={Trophy} titulo="Sin productos vendidos todavía">
              El ranking se arma con las ventas confirmadas del periodo.
            </Vacio>
          ) : (
            <ol className="mt-4 flex flex-col">
              {d.top_productos.map((p, i) => {
                const max = d.top_productos[0].unidades || 1;
                return (
                  <li key={p.producto_id ?? i} className="grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 border-t border-linea-2 py-3 first:border-t-0">
                    <span className="cifra text-[1.5rem] leading-none font-extrabold text-plata-3">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {titulo(p.nombre)} <span className="font-normal text-gris">{p.temporada_coleccion}</span>
                      </p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-linea-2">
                        <div className="metal-barra h-1.5 rounded-full" style={{ width: `${Math.max(8, (p.unidades / max) * 100)}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="cifra text-[1.15rem] font-bold">{numero(p.unidades)} u.</p>
                      <p className="text-[0.78rem] text-gris">{dueno ? `+${dinero(p.ganancia_total)}` : dinero(p.total_vendido)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {dueno && <CostosPendientes kpis={k ?? null} pendientes={pendientes} />}
    </div>
  );
}

function Indicador({
  etiqueta,
  valor,
  nota,
  principal = false,
  tono,
  enlace,
}: {
  etiqueta: string;
  valor: string | null;
  nota: string | null;
  principal?: boolean;
  tono?: string;
  enlace?: string;
}) {
  const contenido = (
    <>
      <p className="text-[0.82rem] font-medium text-humo">{etiqueta}</p>
      {valor === null ? (
        <span className="mt-2 block h-9 w-28 animate-pulse rounded bg-tinta-3" />
      ) : (
        <p className={cx("cifra mt-1 leading-none font-bold", principal ? "text-[2.7rem] lg:text-[2.4rem]" : "text-[1.85rem]", tono)}>{valor}</p>
      )}
      {nota && <p className="mt-2 text-[0.8rem] text-humo">{nota}</p>}
    </>
  );
  const clase = cx(
    "border-tinta-3 px-5 py-5 lg:border-l lg:first:border-l-0",
    principal ? "col-span-2 border-b lg:col-span-1 lg:border-b-0" : "odd:border-l [&:nth-child(n+4)]:border-t lg:[&:nth-child(n+4)]:border-t-0",
  );
  return enlace ? (
    <Link href={enlace} className={cx(clase, "group transition-colors hover:bg-tinta-2")}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

function MetodosPago({ d, dueno }: { d: Dashboard; dueno: boolean }) {
  const total = aCentavos(d.total_vendido) || 1;
  return (
    <div className="mt-5">
      <div className="flex h-3 overflow-hidden rounded-full bg-linea-2" aria-hidden>
        {d.por_metodo_pago.map((m) => (
          <div key={m.metodo_pago} className={METODO[m.metodo_pago].tono} style={{ width: `${(aCentavos(m.total_vendido) / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-4 flex flex-col">
        {d.por_metodo_pago.map((m) => {
          const pct = Math.round((aCentavos(m.total_vendido) / total) * 1000) / 10;
          return (
            <li key={m.metodo_pago} className="flex items-center gap-3 border-t border-linea-2 py-3 first:border-t-0">
              <span className={cx("size-3 shrink-0 rounded-sm", METODO[m.metodo_pago].tono)} />
              <span className="flex-1 font-medium">
                {METODO[m.metodo_pago].etiqueta}
                <span className="ml-2 text-[0.82rem] text-gris">
                  {numero(m.ventas)} {m.ventas === 1 ? "venta" : "ventas"}
                </span>
              </span>
              <span className="text-right">
                <span className="cifra block text-[1.2rem] font-bold">{dinero(m.total_vendido)}</span>
                <span className="text-[0.78rem] text-gris">
                  {porcentaje(pct)}
                  {dueno && ` · ganancia ${dinero(m.ganancia_total)}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CostosPendientes({
  kpis,
  pendientes,
}: {
  kpis: { total_skus: number; skus_sin_costo: number } | null;
  pendientes: ReturnType<typeof useConsulta<PaginaVariantes>>;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [recien, setRecien] = useState<string | null>(null);
  const cargados = kpis ? kpis.total_skus - kpis.skus_sin_costo : 0;
  const pct = kpis && kpis.total_skus ? (cargados / kpis.total_skus) * 100 : 0;

  function alGuardar(v: Variante) {
    setEditando(null);
    setRecien(v.id);
    pendientes.actualizar((p) => ({ ...p, items: p.items.map((x) => (x.id === v.id ? { ...x, ...v } : x)) }));
  }

  if (kpis && kpis.skus_sin_costo === 0) {
    return (
      <Aviso tono="ok" titulo="Todas las variantes tienen costo cargado">
        El margen de cada venta se calcula con el costo real de llegada.
      </Aviso>
    );
  }

  return (
    <section className="rounded-xl border border-linea bg-blanco">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between lg:p-6">
        <div className="max-w-xl">
          <h2 className="cifra text-[1.35rem] font-bold">Variantes sin costo cargado</h2>
          <p className="mt-1 text-[0.92rem] text-gris">
            Sin el costo de llegada no se puede calcular la ganancia real. Empieza por las que tienen stock: son las que se van a vender.
          </p>
        </div>
        <Link href="/inventario/?sin_costo=true" className="inline-flex h-10 items-center gap-1.5 self-start rounded-[var(--radius-placa)] px-3 font-semibold whitespace-nowrap hover:bg-tinta/6 sm:self-auto">
          Completar todas <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="px-5 lg:px-6">
        <div className="flex items-baseline justify-between text-[0.88rem]">
          <span className="font-semibold">Costos cargados</span>
          <span className="cifra text-[1.25rem] font-bold">
            {kpis ? `${numero(cargados)} / ${numero(kpis.total_skus)}` : "—"}
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-linea-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Costos cargados">
          <div className="metal-barra h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[0.82rem] font-medium text-error">{kpis ? `${numero(kpis.skus_sin_costo)} variantes con costo $0,00` : ""}</p>
      </div>
      <ul className="mt-3">
        {pendientes.error ? (
          <li className="p-5">
            <Aviso tono="error" titulo="No se pudieron cargar las variantes">{mensajeError(pendientes.error)}</Aviso>
          </li>
        ) : !pendientes.datos ? (
          [0, 1, 2].map((i) => (
            <li key={i} className="border-t border-linea-2 px-5 py-4">
              <Esqueleto className="h-10" />
            </li>
          ))
        ) : (
          pendientes.datos.items.map((v) => (
            <li key={v.id} className="border-t border-linea-2 px-5 py-3.5 lg:px-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="cifra rounded bg-tinta px-1.5 py-0.5 text-[0.85rem] font-bold text-blanco">{v.codigo_legacy ?? "S/C"}</span>
                <div className="min-w-0 flex-1 basis-[calc(100%-6rem)] sm:basis-auto">
                  <p className="font-semibold sm:truncate">{titulo(nombreProducto(v))}</p>
                  <p className="text-[0.82rem] text-gris sm:truncate">{rasgos(v).join(" · ")}</p>
                </div>
                <span className="flex-1 sm:hidden" />
                <EstadoStock stock={v.stock_actual} compacto />
                {editando !== v.id && (
                  <button type="button" onClick={() => setEditando(v.id)} className="rounded-[4px] transition-transform hover:scale-[1.03]" aria-label={`Cargar costo de ${v.codigo_legacy ?? "la variante"}`}>
                    <PlacaCosto valor={v.valor_jersey_club} recienCargada={recien === v.id} />
                  </button>
                )}
              </div>
              {editando === v.id && (
                <div className="mt-3 rounded-[var(--radius-placa)] bg-papel p-3">
                  <EditorPrecios variante={v} alGuardar={alGuardar} alCancelar={() => setEditando(null)} />
                </div>
              )}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
