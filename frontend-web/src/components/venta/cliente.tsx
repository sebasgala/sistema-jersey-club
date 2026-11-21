"use client";

import { Search, UserPlus, UserRound, Users, WifiOff } from "lucide-react";
import { useState } from "react";
import { Aviso, Boton, Campo, cx, Selector } from "@/components/ui";
import { ApiError, get, mensajeError, post } from "@/lib/api";
import { ETIQUETA_TIPO, validarIdentificacion } from "@/lib/identificacion";
import { COURIERS, PROVINCIAS, type Cliente, type Courier, type Pagina, type TipoIdentificacion } from "@/lib/tipos";
import { useConsulta } from "@/lib/use-consulta";
import { useRetrasado } from "@/lib/use-retrasado";

/** Lo que la venta necesita saber del cliente. */
export type ClienteVenta =
  | { modo: "CONSUMIDOR_FINAL" }
  | { modo: "REGISTRADO"; cliente: Cliente }
  | { modo: "RESPALDO"; datos: DatosCliente };

export interface DatosCliente {
  tipo_identificacion: Exclude<TipoIdentificacion, "CONSUMIDOR_FINAL">;
  identificacion: string;
  nombre_completo: string;
  telefono: string;
  email: string;
  provincia: string;
  ciudad: string;
  direccion_referencia: string;
  courier_preferido: Courier;
}

const DATOS_VACIOS: DatosCliente = {
  tipo_identificacion: "CEDULA",
  identificacion: "",
  nombre_completo: "",
  telefono: "",
  email: "",
  provincia: "",
  ciudad: "",
  direccion_referencia: "",
  courier_preferido: "SERVIENTREGA",
};

const esCaida = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status === 503 || e.status === 504);

export function SelectorCliente({
  valor,
  alCambiar,
}: {
  valor: ClienteVenta;
  alCambiar: (c: ClienteVenta) => void;
}) {
  const [vista, setVista] = useState<"buscar" | "nuevo">("buscar");
  const [busqueda, setBusqueda] = useState("");
  const [caido, setCaido] = useState(false);
  const termino = useRetrasado(busqueda.trim(), 300);

  const resultados = useConsulta(
    valor.modo === "CONSUMIDOR_FINAL" && vista === "buscar" && termino.length >= 3 ? `cli:${termino}` : null,
    (signal) => get<Pagina<Cliente>>("/clientes", { query: { busqueda: termino, limit: 6 }, signal }).then((r) => r.data.items),
  );
  const clientesCaido = caido || esCaida(resultados.error);

  if (valor.modo === "REGISTRADO" || valor.modo === "RESPALDO") {
    const c = valor.modo === "REGISTRADO" ? valor.cliente : valor.datos;
    return (
      <div className="flex items-start gap-3 rounded-[var(--radius-placa)] border border-tinta bg-blanco p-4">
        <span className="metal grid size-10 shrink-0 place-items-center rounded-full">
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{c.nombre_completo}</p>
          <p className="text-[0.85rem] text-gris">
            {ETIQUETA_TIPO[c.tipo_identificacion]} {c.identificacion}
            {c.ciudad ? ` · ${c.ciudad}` : ""}
          </p>
          {valor.modo === "RESPALDO" && (
            <p className="mt-1 text-[0.8rem] font-medium text-alerta">Datos de respaldo: se guardan en la venta sin registrar el cliente.</p>
          )}
        </div>
        <Boton tamano="sm" variante="fantasma" onClick={() => alCambiar({ modo: "CONSUMIDOR_FINAL" })}>
          Cambiar
        </Boton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-[var(--radius-placa)] border border-linea bg-blanco p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tinta text-plata-2">
          <Users className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Consumidor final</p>
          <p className="text-[0.82rem] text-gris">9999999999999 · sin datos de envío</p>
        </div>
        <span className="rounded-full bg-ok-fondo px-2.5 py-1 text-[0.75rem] font-semibold text-ok">Seleccionado</span>
      </div>

      {clientesCaido && (
        <Aviso tono="alerta" titulo="El módulo de clientes no responde">
          Puedes seguir vendiendo como consumidor final o escribir los datos del cliente: se guardan en la venta y no bloquean el cobro.
        </Aviso>
      )}

      <div role="tablist" aria-label="Cliente" className="grid grid-cols-2 gap-1 rounded-full bg-linea-2 p-1 text-[0.85rem] font-semibold">
        {(
          [
            ["buscar", "Buscar cliente", Search],
            ["nuevo", "Registrar nuevo", UserPlus],
          ] as const
        ).map(([v, t, Icono]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vista === v}
            onClick={() => setVista(v)}
            className={cx("flex h-9 items-center justify-center gap-1.5 rounded-full transition-colors", vista === v ? "bg-tinta text-blanco" : "text-gris hover:text-tinta")}
          >
            <Icono className="size-4" /> {t}
          </button>
        ))}
      </div>

      {vista === "buscar" ? (
        <div className="flex flex-col gap-2">
          <Campo
            etiqueta="Cédula, RUC, pasaporte, nombre o teléfono"
            placeholder="Mínimo 3 caracteres"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            sufijo={<Search className="size-4" />}
          />
          {termino.length >= 3 && !clientesCaido && (
            <ul className="flex flex-col overflow-hidden rounded-[var(--radius-placa)] border border-linea bg-blanco">
              {resultados.cargando && !resultados.datos && <li className="px-3 py-3 text-[0.88rem] text-gris">Buscando…</li>}
              {resultados.error && !esCaida(resultados.error) ? (
                <li className="px-3 py-3 text-[0.88rem] text-error">{mensajeError(resultados.error)}</li>
              ) : null}
              {resultados.datos?.map((c) => (
                <li key={c.id} className="border-t border-linea-2 first:border-t-0">
                  <button type="button" onClick={() => alCambiar({ modo: "REGISTRADO", cliente: c })} className="flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-plata-1">
                    <span className="font-semibold">{c.nombre_completo}</span>
                    <span className="text-[0.8rem] text-gris">
                      {ETIQUETA_TIPO[c.tipo_identificacion]} {c.identificacion}
                      {c.telefono ? ` · ${c.telefono}` : ""}
                    </span>
                  </button>
                </li>
              ))}
              {resultados.datos?.length === 0 && !resultados.cargando && (
                <li className="flex items-center justify-between gap-2 px-3 py-3 text-[0.88rem] text-gris">
                  Sin coincidencias.
                  <Boton tamano="sm" variante="secundario" onClick={() => setVista("nuevo")}>
                    Registrar
                  </Boton>
                </li>
              )}
            </ul>
          )}
        </div>
      ) : (
        <FormularioCliente
          caido={clientesCaido}
          alCaer={() => setCaido(true)}
          alGuardar={(c) => alCambiar({ modo: "REGISTRADO", cliente: c })}
          alUsarRespaldo={(d) => alCambiar({ modo: "RESPALDO", datos: d })}
        />
      )}
    </div>
  );
}

function FormularioCliente({
  caido,
  alCaer,
  alGuardar,
  alUsarRespaldo,
}: {
  caido: boolean;
  alCaer: () => void;
  alGuardar: (c: Cliente) => void;
  alUsarRespaldo: (d: DatosCliente) => void;
}) {
  const [d, setD] = useState<DatosCliente>(DATOS_VACIOS);
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = d.identificacion ? validarIdentificacion(d.tipo_identificacion, d.identificacion) : tocado ? "Escribe la identificación." : null;
  const errorNombre = tocado && !d.nombre_completo.trim() ? "Escribe el nombre o la razón social." : null;
  const errorEmail = d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email) ? "Correo no válido." : null;
  const errorTel = d.telefono && !/^\+?[0-9 ()-]{7,20}$/.test(d.telefono) ? "Teléfono no válido (7 a 20 dígitos)." : null;
  const set = <K extends keyof DatosCliente>(k: K, v: DatosCliente[K]) => setD((x) => ({ ...x, [k]: v }));

  async function guardar() {
    setTocado(true);
    if (!d.identificacion || errorId || !d.nombre_completo.trim() || errorEmail || errorTel) return;
    if (caido) {
      alUsarRespaldo(d);
      return;
    }
    setEnviando(true);
    setError(null);
    const opcional = (v: string) => (v.trim() ? v.trim() : undefined);
    try {
      const r = await post<Cliente>("/clientes", {
        tipo_identificacion: d.tipo_identificacion,
        identificacion: d.identificacion.replace(/[\s-]/g, ""),
        nombre_completo: d.nombre_completo.trim(),
        telefono: opcional(d.telefono),
        email: opcional(d.email),
        provincia: opcional(d.provincia),
        ciudad: opcional(d.ciudad),
        direccion_referencia: opcional(d.direccion_referencia),
        courier_preferido: d.courier_preferido,
      });
      alGuardar(r.data);
    } catch (e) {
      if (esCaida(e)) {
        alCaer();
        alUsarRespaldo(d);
        return;
      }
      if (e instanceof ApiError && e.codigo === "CLIENTE_DUPLICADO") {
        try {
          const existente = await get<Cliente>(`/clientes/identificacion/${encodeURIComponent(d.identificacion.replace(/[\s-]/g, ""))}`);
          alGuardar(existente.data);
          return;
        } catch {
          /* cae al mensaje */
        }
      }
      setError(e instanceof ApiError && e.detalles.length ? e.detalles.join(" ") : mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Tipo de identificación" className="grid grid-cols-3 gap-2">
        {(["CEDULA", "RUC", "PASAPORTE"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={d.tipo_identificacion === t}
            onClick={() => set("tipo_identificacion", t)}
            className={cx(
              "h-10 rounded-[var(--radius-placa)] border text-[0.88rem] font-semibold transition-colors",
              d.tipo_identificacion === t ? "border-tinta bg-tinta text-blanco" : "border-linea bg-blanco hover:border-tinta/40",
            )}
          >
            {ETIQUETA_TIPO[t]}
          </button>
        ))}
      </div>
      <Campo
        etiqueta={d.tipo_identificacion === "CEDULA" ? "Cédula (10 dígitos)" : d.tipo_identificacion === "RUC" ? "RUC (13 dígitos)" : "Pasaporte"}
        inputMode={d.tipo_identificacion === "PASAPORTE" ? "text" : "numeric"}
        value={d.identificacion}
        onChange={(e) => set("identificacion", e.target.value)}
        error={errorId}
        claseInput="cifra text-[1.1rem] tracking-wide"
      />
      <Campo etiqueta="Nombre o razón social" value={d.nombre_completo} onChange={(e) => set("nombre_completo", e.target.value)} error={errorNombre} autoComplete="off" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Teléfono" inputMode="tel" placeholder="099 000 0000" value={d.telefono} onChange={(e) => set("telefono", e.target.value)} error={errorTel} />
        <Campo etiqueta="Correo (opcional)" inputMode="email" value={d.email} onChange={(e) => set("email", e.target.value)} error={errorEmail} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Selector etiqueta="Provincia" vacio="Elegir" value={d.provincia} onChange={(e) => set("provincia", e.target.value)} opciones={PROVINCIAS.map((p) => ({ valor: p, etiqueta: p }))} />
        <Campo etiqueta="Ciudad" value={d.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
      </div>
      <Campo etiqueta="Dirección y referencia" placeholder="Calle, número y una referencia para el courier" value={d.direccion_referencia} onChange={(e) => set("direccion_referencia", e.target.value)} />
      <Selector
        etiqueta="Courier preferido"
        value={d.courier_preferido}
        onChange={(e) => set("courier_preferido", e.target.value as Courier)}
        opciones={COURIERS.map((c) => ({ valor: c.valor, etiqueta: c.etiqueta }))}
      />
      {error && <Aviso tono="error" titulo="No se pudo registrar el cliente">{error}</Aviso>}
      <Boton variante="secundario" cargando={enviando} icono={caido ? WifiOff : UserPlus} onClick={() => void guardar()}>
        {caido ? "Usar estos datos en la venta" : "Guardar y usar este cliente"}
      </Boton>
      <p className="text-[0.78rem] text-gris">La cédula se valida con su dígito verificador y el RUC debe terminar en 001.</p>
    </div>
  );
}
