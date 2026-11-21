"use client";

import { Check, PencilLine, X } from "lucide-react";
import { useState } from "react";
import { mensajeError, patch } from "@/lib/api";
import { aCentavos, deCentavos, dinero, margen, porcentaje } from "@/lib/formato";
import type { Variante } from "@/lib/tipos";
import { Boton, cx, useNotas } from "./ui";

/**
 * Movimiento firma: la placa de costo.
 * Sin costo → ranura punteada «Sin costo»; con costo → placa plateada (la plata del isotipo).
 */
export function PlacaCosto({ valor, recienCargada = false }: { valor: string; recienCargada?: boolean }) {
  const vacia = aCentavos(valor) === 0;
  if (vacia) {
    return (
      <span className="inline-flex h-7 items-center rounded-[4px] border border-dashed border-error/60 px-2 text-[0.78rem] font-semibold whitespace-nowrap text-error">
        Sin costo
      </span>
    );
  }
  return (
    <span
      className={cx(
        "metal cifra inline-flex h-7 items-center rounded-[4px] px-2 text-[1rem] font-bold whitespace-nowrap",
        recienCargada && "animate-placa",
      )}
    >
      {dinero(valor)}
    </span>
  );
}

export function Margen({ costo, precio, className }: { costo: string; precio: string; className?: string }) {
  const c = aCentavos(costo);
  const p = aCentavos(precio);
  if (!c || !p) return <span className={cx("text-gris", className)}>—</span>;
  const m = margen(c, p);
  return (
    <span className={cx("cifra font-bold", (m ?? 0) < 0 ? "text-error" : (m ?? 0) < 20 ? "text-alerta" : "text-ok", className)}>
      {porcentaje(m)}
      <span className="ml-1 font-sans text-[0.78rem] font-medium text-gris">({dinero(deCentavos(p - c))})</span>
    </span>
  );
}

/** Editor rápido de valor_jersey_club y pvp_sugerido (PATCH /variantes/:id/precios). */
export function EditorPrecios({
  variante,
  alGuardar,
  alCancelar,
  enLinea = false,
}: {
  variante: Variante;
  alGuardar: (v: Variante) => void;
  alCancelar: () => void;
  enLinea?: boolean;
}) {
  const avisar = useNotas();
  const [costo, setCosto] = useState(aCentavos(variante.valor_jersey_club) ? variante.valor_jersey_club : "");
  const [pvp, setPvp] = useState(aCentavos(variante.pvp_sugerido) ? variante.pvp_sugerido : "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cC = aCentavos(costo || "0");
  const cP = aCentavos(pvp || "0");
  const invalido = Number.isNaN(cC) || Number.isNaN(cP) || (!costo && !pvp);
  const m = !Number.isNaN(cC) && !Number.isNaN(cP) ? margen(cC, cP) : null;

  async function guardar() {
    if (invalido) {
      setError("Escribe montos válidos, por ejemplo 27.50");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (costo) body.valor_jersey_club = deCentavos(cC);
      if (pvp) body.pvp_sugerido = deCentavos(cP);
      const r = await patch<Variante>(`/variantes/${variante.id}/precios`, body);
      avisar("ok", r.message.startsWith("Precios actualizados.") ? r.message : "Precios guardados");
      alGuardar(r.data);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  }

  const entrada =
    "cifra h-11 w-full rounded-[var(--radius-placa)] border border-linea bg-blanco pr-2 pl-6 text-[1.1rem] font-bold focus:border-tinta focus:ring-2 focus:ring-tinta/12 focus:outline-none";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") alCancelar();
      }}
      className={cx("animate-entrar", enLinea ? "flex flex-wrap items-end gap-2" : "grid gap-3")}
    >
      <div className={cx("grid gap-2", enLinea ? "grid-cols-2 sm:w-64" : "grid-cols-2")}>
        <label className="flex flex-col gap-1 text-[0.75rem] font-semibold">
          Costo JRS
          <span className="relative">
            <span className="absolute inset-y-0 left-2.5 flex items-center text-gris">$</span>
            <input autoFocus inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0.00" className={entrada} />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-[0.75rem] font-semibold">
          PVP sugerido
          <span className="relative">
            <span className="absolute inset-y-0 left-2.5 flex items-center text-gris">$</span>
            <input inputMode="decimal" value={pvp} onChange={(e) => setPvp(e.target.value)} placeholder="0.00" className={entrada} />
          </span>
        </label>
      </div>
      <div className={cx("flex items-center gap-2", enLinea ? "" : "justify-between")}>
        <span className="text-[0.82rem] text-gris">
          Margen{" "}
          <b className={cx("cifra text-[1rem]", m === null ? "text-gris" : m < 0 ? "text-error" : m < 20 ? "text-alerta" : "text-ok")}>
            {porcentaje(m)}
          </b>
        </span>
        <span className="flex gap-1.5">
          <Boton tamano="sm" variante="fantasma" onClick={alCancelar} aria-label="Cancelar" icono={X} />
          <Boton tamano="sm" type="submit" cargando={guardando} icono={Check}>
            Guardar
          </Boton>
        </span>
      </div>
      {error && <p className="w-full text-[0.8rem] font-medium text-error">{error}</p>}
    </form>
  );
}

export function BotonEditarPrecio({ onClick, etiqueta }: { onClick: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="grid size-9 place-items-center rounded-full text-gris transition-colors hover:bg-tinta/6 hover:text-tinta"
    >
      <PencilLine className="size-4" />
    </button>
  );
}
