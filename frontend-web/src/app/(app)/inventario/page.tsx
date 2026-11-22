"use client";

import { ArrowUpDown, ChevronLeft, ChevronRight, PackagePlus, Plus, RefreshCw, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { HojaAjuste, HojaNuevaVariante, HojaNuevoProducto } from "@/components/inventario/hojas";
import { BotonEditarPrecio, EditorPrecios, Margen, PlacaCosto } from "@/components/placa-costo";
import { Aviso, Boton, cx, Esqueleto, EstadoStock, Hoja, Interruptor, Selector, Vacio } from "@/components/ui";
import { get, mensajeError } from "@/lib/api";
import { aCentavos, dinero, numero, titulo } from "@/lib/formato";
import { useEsDueno } from "@/lib/sesion";
import { CATEGORIAS, TALLAS, VERSIONES, type PaginaVariantes, type Producto, type Variante } from "@/lib/tipos";
import { useConsulta } from "@/lib/use-consulta";
import { useRetrasado } from "@/lib/use-retrasado";

const LIMITE = 25;

interface Filtros {
  busqueda: string;
  categoria: string;
  marca_equipo: string;
  talla_medida: string;
  version_modelo: string;
  adicional_parche: string;
  adicional_dorsal: string;
  solo_disponibles: boolean;
  sin_costo: boolean;
}

const VACIOS: Filtros = {
  busqueda: "",
  categoria: "",
  marca_equipo: "",
  talla_medida: "",
  version_modelo: "",
  adicional_parche: "",
  adicional_dorsal: "",
  solo_disponibles: false,
  sin_costo: false,
};

export default function PaginaInventario() {
  return (
    <Suspense fallback={<Esqueleto className="h-96" />}>
      <Inventario />
    </Suspense>
  );
}

function Inventario() {
  const dueno = useEsDueno();
  const params = useSearchParams();
  const [filtros, setFiltros] = useState<Filtros>(() => ({
    ...VACIOS,
    solo_disponibles: params.get("solo_disponibles") === "true",
    sin_costo: params.get("sin_costo") === "true",
  }));
  const [pagina, setPagina] = useState(1);
  const [hojaFiltros, setHojaFiltros] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [recien, setRecien] = useState<string | null>(null);
  const [ajustando, setAjustando] = useState<Variante | null>(null);
  const [nuevoProducto, setNuevoProducto] = useState(false);
  const [nuevaVariante, setNuevaVariante] = useState(false);
  const [productoNuevo, setProductoNuevo] = useState<Producto | null>(null);

  const diferidos = useRetrasado(filtros, 300);
  const consulta = {
    ...diferidos,
    sin_costo: dueno && diferidos.sin_costo,
    page: pagina,
    limit: LIMITE,
  };
  const { datos, error, cargando, recargar, actualizar } = useConsulta(JSON.stringify(consulta), (signal) =>
    get<PaginaVariantes>("/variantes", { query: { ...consulta }, signal }).then((r) => r.data),
  );

  const cambiar = <K extends keyof Filtros>(k: K, v: Filtros[K]) => {
    setFiltros((f) => ({ ...f, [k]: v }));
    setPagina(1);
  };
  const activos = (Object.keys(VACIOS) as (keyof Filtros)[]).filter((k) => k !== "busqueda" && filtros[k] !== VACIOS[k]).length;
  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.meta.total / LIMITE)) : 1;

  function alGuardarPrecio(v: Variante) {
    setEditando(null);
    setRecien(v.id);
    actualizar((d) => ({ ...d, items: d.items.map((x) => (x.id === v.id ? { ...x, ...v, producto: x.producto } : x)) }));
    // Los indicadores (sin costo, valor a costo JRS) dependen de todo el filtro: se vuelven a pedir.
    recargar();
  }
  function alAjustar(id: string, stock: number) {
    actualizar((d) => ({ ...d, items: d.items.map((x) => (x.id === id ? { ...x, stock_actual: stock } : x)) }));
  }

  const panelFiltros = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Selector etiqueta="Categoría" vacio="Todas" value={filtros.categoria} onChange={(e) => cambiar("categoria", e.target.value)} opciones={CATEGORIAS.map((c) => ({ valor: c, etiqueta: titulo(c) }))} />
      <CampoFiltro etiqueta="Equipo o marca" valor={filtros.marca_equipo} alCambiar={(v) => cambiar("marca_equipo", v)} placeholder="Ej. Argentina" />
      <Selector etiqueta="Talla" vacio="Todas" value={filtros.talla_medida} onChange={(e) => cambiar("talla_medida", e.target.value)} opciones={TALLAS.map((t) => ({ valor: t, etiqueta: t }))} />
      <Selector etiqueta="Versión" vacio="Todas" value={filtros.version_modelo} onChange={(e) => cambiar("version_modelo", e.target.value)} opciones={VERSIONES.map((v) => ({ valor: v, etiqueta: titulo(v) }))} />
      <CampoFiltro etiqueta="Parche" valor={filtros.adicional_parche} alCambiar={(v) => cambiar("adicional_parche", v)} placeholder="Ej. Champions" />
      <CampoFiltro etiqueta="Dorsal" valor={filtros.adicional_dorsal} alCambiar={(v) => cambiar("adicional_dorsal", v)} placeholder="Ej. Messi" />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="cifra text-[2.1rem] leading-none font-bold lg:text-[2.6rem]">Inventario</h1>
          <p className="mt-1.5 text-gris">Stock por variante exacta: talla, versión, parche y dorsal.</p>
        </div>
        {dueno && (
          <div className="flex gap-2">
            <Boton variante="secundario" icono={PackagePlus} onClick={() => setNuevoProducto(true)}>
              <span>Nuevo producto</span>
            </Boton>
            <Boton icono={Plus} onClick={() => { setProductoNuevo(null); setNuevaVariante(true); }}>
              <span>Nueva variante</span>
            </Boton>
          </div>
        )}
      </div>

      {/* Indicadores del conjunto filtrado */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-linea bg-linea sm:grid-cols-4">
        <Dato etiqueta="Variantes" valor={datos ? numero(datos.kpis.total_skus) : null} nota={datos ? `${numero(datos.kpis.skus_con_stock)} con stock` : ""} />
        <Dato etiqueta="Unidades" valor={datos ? numero(datos.kpis.unidades_stock) : null} nota="En el filtro actual" />
        {dueno ? (
          <>
            <Dato etiqueta="Valor a costo JRS" valor={datos ? dinero(datos.kpis.valorizacion_costo_jrs) : null} nota={datos ? `A PVP ${dinero(datos.kpis.valorizacion_pvp)}${datos.kpis.skus_sin_costo > 0 ? ` · sin sumar ${numero(datos.kpis.skus_sin_costo)} sin costo` : ""}` : ""} />
            <Dato
              etiqueta="Sin costo"
              valor={datos ? numero(datos.kpis.skus_sin_costo) : null}
              nota="Ver solo estas"
              alerta={!!datos && datos.kpis.skus_sin_costo > 0}
              onClick={() => cambiar("sin_costo", !filtros.sin_costo)}
              activo={filtros.sin_costo}
            />
          </>
        ) : (
          <>
            <Dato etiqueta="Valor a PVP" valor={datos ? dinero(datos.kpis.valorizacion_pvp) : null} nota="Precio sugerido" />
            <Dato etiqueta="Agotadas" valor={datos ? numero(datos.kpis.total_skus - datos.kpis.skus_con_stock) : null} nota="Sin unidades" />
          </>
        )}
      </dl>

      {/* Búsqueda y filtros */}
      <div className="flex flex-col gap-3 rounded-xl border border-linea bg-blanco p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-64">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-gris" />
            <input
              type="search"
              value={filtros.busqueda}
              onChange={(e) => cambiar("busqueda", e.target.value)}
              placeholder="Buscar equipo, código, parche o dorsal"
              className="h-12 w-full rounded-[var(--radius-placa)] border border-linea bg-papel pr-3 pl-10 text-[1rem] focus:border-tinta focus:bg-blanco focus:ring-2 focus:ring-tinta/12 focus:outline-none"
            />
          </label>
          <Boton variante="secundario" className="lg:hidden" icono={SlidersHorizontal} onClick={() => setHojaFiltros(true)}>
            Filtros{activos > 0 && <span className="ml-0.5 grid size-6 place-items-center rounded-full bg-tinta text-[0.78rem] text-blanco">{activos}</span>}
          </Boton>
          <div className="flex flex-wrap items-center gap-x-5">
            <Interruptor activo={filtros.solo_disponibles} alCambiar={(v) => cambiar("solo_disponibles", v)} etiqueta="Solo con stock disponible" />
            {dueno && <Interruptor activo={filtros.sin_costo} alCambiar={(v) => cambiar("sin_costo", v)} etiqueta="Solo sin costo" />}
          </div>
        </div>
        <div className="hidden lg:block">{panelFiltros}</div>
        {activos > 0 && (
          <button type="button" onClick={() => { setFiltros((f) => ({ ...VACIOS, busqueda: f.busqueda })); setPagina(1); }} className="flex items-center gap-1 self-start text-[0.85rem] font-semibold text-gris hover:text-tinta">
            <X className="size-4" /> Quitar {activos} {activos === 1 ? "filtro" : "filtros"}
          </button>
        )}
      </div>

      {error ? (
        <Aviso tono="error" titulo="No se pudo cargar el inventario" accion={<Boton tamano="sm" variante="secundario" icono={RefreshCw} onClick={recargar}>Reintentar</Boton>}>
          {mensajeError(error)}
        </Aviso>
      ) : null}

      {/* Resultados */}
      <section aria-label="Variantes" aria-busy={cargando} className={cx("transition-opacity", cargando && datos && "opacity-60")}>
        {!datos ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Esqueleto key={i} className="h-20" />
            ))}
          </div>
        ) : datos.items.length === 0 ? (
          <div className="rounded-xl border border-linea bg-blanco">
            <Vacio icono={SearchX} titulo="Ninguna variante coincide">
              Prueba con menos filtros o busca por código (LTOO7) o por dorsal.
            </Vacio>
          </div>
        ) : (
          <>
            {/* Celular: tarjetas */}
            <ul className="flex flex-col gap-2 lg:hidden">
              {datos.items.map((v) => (
                <li key={v.id} className="rounded-xl border border-linea bg-blanco p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="cifra rounded bg-tinta px-1.5 py-0.5 text-[0.8rem] font-bold text-blanco">{v.codigo_legacy ?? "S/C"}</span>
                        <span className="truncate font-semibold">{titulo(v.producto?.nombre ?? "")}</span>
                      </p>
                      <p className="mt-1 text-[0.85rem] text-gris">
                        {[v.producto?.temporada_coleccion, `Talla ${v.talla_medida}`, titulo(v.version_modelo)].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-0.5 text-[0.85rem]">
                        {v.adicional_parche ? titulo(v.adicional_parche) : <span className="text-gris">Sin parche</span>}
                        {" · "}
                        {v.adicional_dorsal ?? <span className="text-gris">Sin dorsal</span>}
                      </p>
                    </div>
                    <EstadoStock stock={v.stock_actual} />
                  </div>
                  <div className="mt-3 flex items-center gap-3 border-t border-linea-2 pt-3">
                    {dueno ? (
                      <>
                        <button type="button" onClick={() => setEditando(editando === v.id ? null : v.id)} aria-label="Editar costo y PVP">
                          <PlacaCosto valor={v.valor_jersey_club} recienCargada={recien === v.id} />
                        </button>
                        <div className="min-w-0 flex-1 text-[0.85rem]">
                          <p>PVP {aCentavos(v.pvp_sugerido) ? <b className="cifra text-[1rem]">{dinero(v.pvp_sugerido)}</b> : <span className="font-semibold text-gris">sin definir</span>}</p>
                          <Margen costo={v.valor_jersey_club} precio={v.pvp_sugerido} className="text-[0.92rem]" />
                        </div>
                        <BotonEditarPrecio onClick={() => setEditando(editando === v.id ? null : v.id)} etiqueta={`Editar precios de ${v.codigo_legacy ?? "la variante"}`} />
                        <Boton tamano="sm" variante="secundario" icono={ArrowUpDown} onClick={() => setAjustando(v)}>
                          Stock
                        </Boton>
                      </>
                    ) : (
                      <p className="text-[0.9rem]">
                        PVP sugerido {aCentavos(v.pvp_sugerido) ? <b className="cifra text-[1.15rem]">{dinero(v.pvp_sugerido)}</b> : <span className="font-semibold text-gris">sin definir</span>}
                      </p>
                    )}
                  </div>
                  {editando === v.id && (
                    <div className="mt-3 rounded-[var(--radius-placa)] bg-papel p-3">
                      <EditorPrecios variante={v} alGuardar={alGuardarPrecio} alCancelar={() => setEditando(null)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {/* PC: tabla */}
            <div className="hidden overflow-x-auto rounded-xl border border-linea bg-blanco lg:block">
              <table className="w-full border-collapse text-left text-[0.92rem]">
                <thead className="bg-tinta text-[0.78rem] font-semibold tracking-wide text-humo uppercase">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Variante exacta</th>
                    <th className="px-4 py-3">Stock</th>
                    {dueno && <th className="px-4 py-3">Valor JRS Club</th>}
                    <th className="px-4 py-3 text-right">PVP sugerido</th>
                    {dueno && <th className="px-4 py-3 text-right">Margen estimado</th>}
                    {dueno && <th className="px-2 py-3"><span className="sr-only">Acciones</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {datos.items.map((v) => (
                    <FilaVariante
                      key={v.id}
                      v={v}
                      dueno={dueno}
                      editando={editando === v.id}
                      recien={recien === v.id}
                      alEditar={() => setEditando(editando === v.id ? null : v.id)}
                      alGuardar={alGuardarPrecio}
                      alAjustar={() => setAjustando(v)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[0.88rem] text-gris">
                {numero((pagina - 1) * LIMITE + 1)}–{numero(Math.min(pagina * LIMITE, datos.meta.total))} de {numero(datos.meta.total)}
              </p>
              <div className="flex gap-2">
                <Boton variante="secundario" tamano="sm" icono={ChevronLeft} disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                  Anterior
                </Boton>
                <Boton variante="secundario" tamano="sm" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
                  Siguiente <ChevronRight className="size-4" />
                </Boton>
              </div>
            </nav>
          </>
        )}
      </section>

      <Hoja abierta={hojaFiltros} alCerrar={() => setHojaFiltros(false)} titulo="Filtros" pie={<Boton className="w-full" onClick={() => setHojaFiltros(false)}>Ver {datos ? numero(datos.meta.total) : ""} variantes</Boton>}>
        {panelFiltros}
      </Hoja>
      {dueno && (
        <>
          <HojaNuevoProducto
            abierta={nuevoProducto}
            alCerrar={() => setNuevoProducto(false)}
            alCrear={(p) => {
              setNuevoProducto(false);
              setProductoNuevo(p);
              setNuevaVariante(true);
            }}
          />
          <HojaNuevaVariante
            abierta={nuevaVariante}
            productoInicial={productoNuevo}
            alCerrar={() => setNuevaVariante(false)}
            alCrear={() => recargar()}
          />
          <HojaAjuste variante={ajustando} alCerrar={() => setAjustando(null)} alAjustar={alAjustar} />
        </>
      )}
    </div>
  );
}

function FilaVariante({
  v,
  dueno,
  editando,
  recien,
  alEditar,
  alGuardar,
  alAjustar,
}: {
  v: Variante;
  dueno: boolean;
  editando: boolean;
  recien: boolean;
  alEditar: () => void;
  alGuardar: (v: Variante) => void;
  alAjustar: () => void;
}) {
  return (
    <>
      <tr className={cx("border-t border-linea-2 align-middle transition-colors hover:bg-papel/70", editando && "bg-papel")}>
        <td className="px-4 py-3">
          <span className="cifra rounded bg-tinta px-1.5 py-0.5 text-[0.85rem] font-bold text-blanco">{v.codigo_legacy ?? "S/C"}</span>
        </td>
        <td className="px-4 py-3">
          <p className="font-semibold">{titulo(v.producto?.nombre ?? "")}</p>
          <p className="text-[0.82rem] whitespace-nowrap text-gris">
            {titulo(v.producto?.categoria ?? "")} · {v.producto?.temporada_coleccion ?? "Sin temporada"}
          </p>
        </td>
        <td className="px-4 py-3">
          <p>
            <b className="cifra text-[1.05rem]">{v.talla_medida}</b> · {titulo(v.version_modelo)}
          </p>
          <p className="max-w-[20rem] truncate text-[0.82rem] text-gris" title={[v.adicional_parche, v.adicional_dorsal].filter(Boolean).join(" · ")}>
            {v.adicional_parche ? titulo(v.adicional_parche) : "Sin parche"} · {v.adicional_dorsal ?? "Sin dorsal"}
          </p>
        </td>
        <td className="px-4 py-3">
          <EstadoStock stock={v.stock_actual} />
        </td>
        {dueno && (
          <td className="px-4 py-3">
            <button type="button" onClick={alEditar} className="rounded-[4px] transition-transform hover:scale-[1.03]" aria-label="Editar costo y PVP">
              <PlacaCosto valor={v.valor_jersey_club} recienCargada={recien} />
            </button>
          </td>
        )}
        <td className="cifra px-4 py-3 text-right text-[1.05rem] font-bold">{aCentavos(v.pvp_sugerido) ? dinero(v.pvp_sugerido) : <span className="font-sans text-[0.8rem] font-semibold text-gris">Sin PVP</span>}</td>
        {dueno && (
          <td className="px-4 py-3 text-right">
            <Margen costo={v.valor_jersey_club} precio={v.pvp_sugerido} />
          </td>
        )}
        {dueno && (
          <td className="px-2 py-3">
            <div className="flex justify-end gap-0.5">
              <BotonEditarPrecio onClick={alEditar} etiqueta="Editar costo y PVP" />
              <button type="button" onClick={alAjustar} aria-label="Ajustar stock" className="grid size-9 place-items-center rounded-full text-gris hover:bg-tinta/6 hover:text-tinta">
                <ArrowUpDown className="size-4" />
              </button>
            </div>
          </td>
        )}
      </tr>
      {editando && (
        <tr className="bg-papel">
          <td colSpan={8} className="px-4 pb-4">
            <EditorPrecios variante={v} enLinea alGuardar={alGuardar} alCancelar={alEditar} />
          </td>
        </tr>
      )}
    </>
  );
}

function Dato({
  etiqueta,
  valor,
  nota,
  alerta = false,
  activo = false,
  onClick,
}: {
  etiqueta: string;
  valor: string | null;
  nota: string;
  alerta?: boolean;
  activo?: boolean;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      <dt className="text-[0.8rem] font-semibold text-gris">{etiqueta}</dt>
      <dd className={cx("cifra mt-1 text-[1.75rem] leading-none font-bold", alerta && "text-error")}>
        {valor ?? <span className="inline-block h-7 w-16 animate-pulse rounded bg-linea" />}
      </dd>
      <dd className="mt-1.5 text-[0.78rem] text-gris">{nota}</dd>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={activo} className={cx("bg-blanco px-4 py-3.5 text-left transition-colors hover:bg-plata-1", activo && "bg-plata-1 ring-2 ring-tinta ring-inset")}>
      {contenido}
    </button>
  ) : (
    <div className="bg-blanco px-4 py-3.5">{contenido}</div>
  );
}

function CampoFiltro({ etiqueta, valor, alCambiar, placeholder }: { etiqueta: string; valor: string; alCambiar: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[0.82rem] font-semibold">
      {etiqueta}
      <input
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-[var(--radius-placa)] border border-linea bg-blanco px-3 text-[0.95rem] font-normal focus:border-tinta focus:ring-2 focus:ring-tinta/12 focus:outline-none"
      />
    </label>
  );
}
