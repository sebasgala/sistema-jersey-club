"""
Depuración y migración del Excel legado de Jersey Club hacia ms_inventario.

Lee `STOCK 2026 21-11-2026.xlsx` (hoja STOCK, cabecera en la fila 3, y la hoja oculta
DICIEMBRE para rescatar `Valor JRS club` y `PVP`), aplica las reglas de la Auditoría
Fase 0 y genera:

  - scripts-migracion/STOCK_LIMPIO_2026.xlsx   (datos depurados + reporte de depuración)
  - database/02_seed_inventario.sql             (INSERT idempotentes en ms_inventario)

Solo usa openpyxl y la biblioteca estándar. El Excel original nunca se modifica.
Los UUID son deterministas (uuid5), así que regenerar el seed produce los mismos ids.

Uso:
    python -I scripts-migracion/limpiar_y_migrar_excel.py
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
import uuid
import warnings
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA_DEFECTO = RAIZ / "docs" / "STOCK 2026 21-11-2026.xlsx"
SALIDA_XLSX_DEFECTO = RAIZ / "scripts-migracion" / "STOCK_LIMPIO_2026.xlsx"
SALIDA_SQL_DEFECTO = RAIZ / "database" / "02_seed_inventario.sql"

# Espacio de nombres fijo para UUID deterministas (no cambiar: rompería la idempotencia)
NS_JERSEY = uuid.UUID("6f1c2b0e-3d4a-5b6c-8d7e-9f0a1b2c3d4e")
LOTE_MIGRACION = "MIGRACION-EXCEL-2026-11-21"
CATEGORIA_DEFECTO = "CAMISETA"
VERSION_SIN_DATO = "SIN_DEFINIR"

# Equipo (texto limpio en mayúsculas) -> (marca_equipo, sufijo de nombre)
EQUIPOS = {
    "AL NASSR": ("Al Nassr", None),
    "ALEMANIA": ("Alemania", None),
    "ARGENTINA": ("Argentina", None),
    "BOCA JUNIORS": ("Boca Juniors", None),
    "BRASIL": ("Brasil", None),
    "BRAZIL": ("Brasil", None),  # variante en inglés del mismo equipo
    "CHELSEA": ("Chelsea", None),
    "CROACIA": ("Croacia", None),
    "ECUADOR": ("Ecuador", None),
    "ESPAÑA": ("España", None),
    "FC BARCELONA": ("FC Barcelona", None),
    "INGLATERRA": ("Inglaterra", None),
    "INTER DE MIAMI": ("Inter de Miami", None),
    "INTER DE MILAN": ("Inter de Milán", None),
    "ITALIA": ("Italia", None),
    "MANCHESTER CITY": ("Manchester City", None),
    "MANCHESTER UNITED": ("Manchester United", None),
    "NORUEGA": ("Noruega", None),
    "PORTUGAL": ("Portugal", None),
    "REAL MADRID": ("Real Madrid", None),
    "SANTOS": ("Santos", None),
    "SC CORINTHIANS": ("SC Corinthians", None),
    "MERCEDES NEGRA": ("Mercedes", "F1 NEGRA"),
    "MERCEDES BLANCA": ("Mercedes", "F1 BLANCA"),
}

# Valores de "Parches" que significan "sin parche"
SIN_PARCHE = {"NO", "SIN PARCHES", "SIN PARCHE", "NINGUNO"}

# Correcciones puntuales de texto en parches: (patrón, reemplazo, nota para observaciones)
CORRECCIONES_PARCHE = [
    (re.compile(r"\bCHAMPIONE\b"), "CHAMPIONS", None),
    (re.compile(r"^MLS DAÑADO$"), "MLS", "Parche MLS dañado"),
    (re.compile(r"^NO PARCHES \((.+)\)$"), None, r"Edición: \1"),
]

# Correcciones de equipación
CORRECCIONES_EQUIPACION = [(re.compile(r"\bCOSTUM\b"), "CUSTOM")]

CAMPOS_STOCK = {
    "codigo": "CODIGO",
    "talla": "TALLA",
    "equipo": "EQUIPO",
    "temporada": "TEMPORADA",
    "equipacion": "EQUIPACION",
    "version": "VERSION",
    "parches": "PARCHES",
    "nombre": "NOMBRE",
    "numero": "NUMERO",
    "entrada": "ENTRADA",
    "salida": "SALIDA",
    "stock_excel": "STOCK ACTUAL",
    "columna1": "COLUMNA1",
    "columna2": "COLUMNA2",
}


# ----------------------------------------------------------------------------- utilidades
def sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def limpiar(valor) -> str | None:
    """Texto limpio: sin NBSP, espacios colapsados; '*' y vacío -> None."""
    if valor is None:
        return None
    texto = str(valor).replace("\xa0", " ")
    texto = re.sub(r"\s+", " ", texto).strip()
    if texto in {"", "*", ","}:
        return None
    return texto


def a_entero(valor, *, texto_cero=("NO VENDIDO",)) -> int | None:
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return int(valor)
    texto = limpiar(valor)
    if texto is None:
        return None
    if texto.upper() in texto_cero:
        return 0
    try:
        return int(Decimal(texto))
    except InvalidOperation:
        return None


def a_dinero(valor) -> Decimal | None:
    texto = limpiar(valor)
    if texto is None:
        return None
    texto = texto.replace("$", "").replace(",", ".").strip()
    if texto in {"-", ""}:
        return Decimal("0.00")
    try:
        return Decimal(texto).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None


def normalizar_temporada(valor) -> str | None:
    """
    'YY-YY' y 'AAAA - YY' -> 'AAAA-YY' (temporadas de clubes que cruzan dos años).
    Un año suelto (selecciones, MLS, ediciones especiales) se conserva como 'AAAA':
    convertirlo en 'AAAA-YY' inventaría una temporada que el Excel no dice.
    """
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return str(int(valor))
    texto = limpiar(valor)
    if texto is None:
        return None
    texto = texto.replace(" ", "")
    m = re.fullmatch(r"(\d{2})-(\d{2})", texto)
    if m:
        inicio = int(m.group(1))
        siglo = 1900 if inicio >= 50 else 2000
        return f"{siglo + inicio}-{m.group(2)}"
    m = re.fullmatch(r"(\d{4})-(\d{2})", texto)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    m = re.fullmatch(r"(\d{4})", texto)
    if m:
        return m.group(1)
    return texto


def sql_texto(valor) -> str:
    if valor is None:
        return "NULL"
    return "'" + str(valor).replace("'", "''") + "'"


def uid(*partes) -> str:
    return str(uuid.uuid5(NS_JERSEY, "|".join("" if p is None else str(p) for p in partes)))


# ----------------------------------------------------------------------------- modelo
@dataclass
class FilaLimpia:
    fila_excel: int
    codigo_original: str
    codigo_legacy: str
    talla_medida: str
    marca_equipo: str
    nombre_producto: str
    equipacion: str | None
    temporada_coleccion: str | None
    version_modelo: str
    adicional_parche: str | None
    adicional_dorsal: str | None
    entrada: int
    salida: int
    stock_actual: int
    stock_excel: int | None
    notas: list[str] = field(default_factory=list)

    @property
    def clave_producto(self):
        return (CATEGORIA_DEFECTO, self.marca_equipo, self.nombre_producto, self.temporada_coleccion)

    @property
    def clave_variante(self):
        return self.clave_producto + (
            self.talla_medida,
            self.version_modelo,
            self.adicional_parche or "",
            self.adicional_dorsal or "",
        )


@dataclass
class Variante:
    id: str
    producto_id: str
    clave: tuple
    filas: list[FilaLimpia]
    valor_jersey_club: Decimal = Decimal("0.00")
    pvp_sugerido: Decimal = Decimal("0.00")
    origen_costo: str | None = None

    @property
    def stock_actual(self) -> int:
        return sum(f.stock_actual for f in self.filas)

    @property
    def codigo_legacy(self) -> str:
        return self.filas[0].codigo_legacy

    @property
    def observaciones(self) -> str | None:
        notas: list[str] = []
        if len(self.filas) > 1:
            codigos = ", ".join(f.codigo_legacy for f in self.filas)
            notas.append(f"Códigos legados agrupados en esta variante: {codigos}")
        for f in self.filas:
            for n in f.notas:
                notas.append(f"[{f.codigo_legacy}] {n}" if len(self.filas) > 1 else n)
        if self.origen_costo:
            notas.append(self.origen_costo)
        return " | ".join(notas) if notas else None


class Reporte:
    def __init__(self):
        self.eventos: list[tuple[str, str, str]] = []  # (tipo, referencia, detalle)

    def add(self, tipo: str, referencia, detalle: str):
        self.eventos.append((tipo, str(referencia), detalle))

    def contar(self, tipo: str) -> int:
        return sum(1 for e in self.eventos if e[0] == tipo)


# ----------------------------------------------------------------------------- lectura STOCK
def mapear_cabecera(fila) -> dict[str, int]:
    indices = {}
    for i, celda in enumerate(fila):
        if celda is None:
            continue
        nombre = sin_acentos(limpiar(celda) or "").upper()
        for campo, esperado in CAMPOS_STOCK.items():
            if nombre == esperado:
                indices[campo] = i
    faltantes = set(CAMPOS_STOCK) - set(indices)
    if faltantes:
        raise SystemExit(f"Cabecera de STOCK incompleta, faltan: {sorted(faltantes)}")
    return indices


def normalizar_parche(texto: str | None, notas: list[str]) -> str | None:
    texto = limpiar(texto)
    if texto is None:
        return None
    texto = texto.upper()
    for patron, reemplazo, nota in CORRECCIONES_PARCHE:
        m = patron.search(texto)
        if not m:
            continue
        if nota:
            notas.append(m.expand(nota) if "\\" in nota else nota)
        if reemplazo is None:
            return None
        texto = patron.sub(reemplazo, texto)
    if texto in SIN_PARCHE:
        return None
    return texto


def normalizar_dorsal(nombre, numero) -> str | None:
    nombre = limpiar(nombre)
    nombre = nombre.upper() if nombre else None
    if isinstance(numero, float):
        numero = int(numero)
    numero = limpiar(numero)
    partes = [p for p in (nombre, numero) if p]
    return " ".join(partes) if partes else None


def leer_stock(ws, reporte: Reporte) -> list[FilaLimpia]:
    filas = list(ws.iter_rows(min_row=3, values_only=True))
    idx = mapear_cabecera(filas[0])

    def v(fila, campo):
        i = idx[campo]
        return fila[i] if i < len(fila) else None

    crudas = []
    for n, fila in enumerate(filas[1:], start=4):
        codigo = limpiar(v(fila, "codigo"))
        talla = limpiar(v(fila, "talla"))
        equipo = limpiar(v(fila, "equipo"))
        entrada = a_entero(v(fila, "entrada"))
        if all(x is None for x in fila):
            continue
        if codigo is None:
            resto = [x for x in fila if limpiar(x) is not None]
            reporte.add("FILA_DESCARTADA", f"fila {n}", f"Fila sin código (total o basura): {resto}")
            continue
        if talla is None and equipo is None and entrada is None:
            reporte.add(
                "FILA_DESCARTADA",
                f"fila {n}",
                f"Código {codigo} sin talla, equipo ni entrada (fila plantilla vacía)",
            )
            continue
        crudas.append((n, codigo, fila))

    # Códigos repetidos entre filas válidas -> sufijo -A, -B, ...
    conteo: dict[str, int] = {}
    for _, codigo, _ in crudas:
        conteo[codigo] = conteo.get(codigo, 0) + 1
    vistos: dict[str, int] = {}

    limpias: list[FilaLimpia] = []
    for n, codigo, fila in crudas:
        notas: list[str] = []
        codigo_legacy = codigo
        if conteo[codigo] > 1:
            k = vistos.get(codigo, 0)
            vistos[codigo] = k + 1
            codigo_legacy = f"{codigo}-{chr(ord('A') + k)}"
            reporte.add("CODIGO_DUPLICADO", codigo, f"fila {n} renombrada a {codigo_legacy}")

        # Talla
        talla = (limpiar(v(fila, "talla")) or "").upper()
        if talla == "2XL":
            talla = "XXL"
            reporte.add("TALLA_NORMALIZADA", codigo_legacy, "2XL -> XXL")

        # Equipo
        equipo_txt = (limpiar(v(fila, "equipo")) or "").upper()
        if equipo_txt in EQUIPOS:
            marca, sufijo = EQUIPOS[equipo_txt]
        else:
            marca, sufijo = equipo_txt.title(), None
            reporte.add("EQUIPO_NO_MAPEADO", codigo_legacy, f"'{equipo_txt}' -> '{marca}' (revisar)")

        # Equipación
        equipacion = limpiar(v(fila, "equipacion"))
        if equipacion:
            equipacion = equipacion.upper()
            for patron, reemplazo in CORRECCIONES_EQUIPACION:
                equipacion = patron.sub(reemplazo, equipacion)

        nombre_producto = " ".join(p for p in (marca, sufijo, equipacion) if p)

        # Versión
        version = limpiar(v(fila, "version"))
        if version:
            version = version.upper()
        else:
            version = VERSION_SIN_DATO
            reporte.add("VERSION_FALTANTE", codigo_legacy, f"Sin versión en el Excel -> {VERSION_SIN_DATO}")

        # Temporada
        temporada_cruda = v(fila, "temporada")
        temporada = normalizar_temporada(temporada_cruda)
        if temporada_cruda is not None and str(temporada_cruda) != temporada:
            reporte.add("TEMPORADA_NORMALIZADA", codigo_legacy, f"{temporada_cruda!r} -> {temporada}")

        parche = normalizar_parche(v(fila, "parches"), notas)
        dorsal = normalizar_dorsal(v(fila, "nombre"), v(fila, "numero"))

        # Cantidades
        entrada = a_entero(v(fila, "entrada")) or 0
        salida_cruda = v(fila, "salida")
        salida = a_entero(salida_cruda)
        if salida is None:
            salida = 0
            reporte.add("SALIDA_VACIA", codigo_legacy, "Salida vacía -> 0")
        elif not isinstance(salida_cruda, (int, float)):
            reporte.add("SALIDA_TEXTO", codigo_legacy, f"{salida_cruda!r} -> {salida}")
        stock = entrada - salida
        if stock < 0:
            reporte.add("STOCK_NEGATIVO", codigo_legacy, f"Entrada {entrada} - Salida {salida} < 0 -> 0")
            stock = 0
        stock_excel = a_entero(v(fila, "stock_excel"))
        if stock_excel is not None and stock_excel != stock:
            notas.append(f"El Excel indicaba Stock Actual {stock_excel}; recalculado Entrada-Salida = {stock}")
            reporte.add(
                "STOCK_RECALCULADO", codigo_legacy, f"Excel {stock_excel} vs Entrada-Salida {stock} (se usa {stock})"
            )

        for col in ("columna1", "columna2"):
            nota = limpiar(v(fila, col))
            if nota:
                notas.append(f"Nota Excel: {nota}")
                if "VENDID" in nota.upper() and salida == 0:
                    reporte.add(
                        "NOTA_CONTRADICTORIA",
                        codigo_legacy,
                        f"Nota '{nota}' pero Salida = 0; se conserva el stock calculado ({stock})",
                    )

        limpias.append(
            FilaLimpia(
                fila_excel=n,
                codigo_original=codigo,
                codigo_legacy=codigo_legacy,
                talla_medida=talla,
                marca_equipo=marca,
                nombre_producto=nombre_producto,
                equipacion=equipacion,
                temporada_coleccion=temporada,
                version_modelo=version,
                adicional_parche=parche,
                adicional_dorsal=dorsal,
                entrada=entrada,
                salida=salida,
                stock_actual=stock,
                stock_excel=stock_excel,
                notas=notas,
            )
        )
    return limpias


# ----------------------------------------------------------------------------- lectura DICIEMBRE
@dataclass
class CostoDiciembre:
    fila_excel: int
    descripcion: str
    valor_jersey_club: Decimal
    pvp: Decimal
    marca_equipo: str | None = None
    temporada: str | None = None
    equipacion: str | None = None
    version: str | None = None
    variantes_afectadas: int = 0


def leer_diciembre(ws, reporte: Reporte) -> list[CostoDiciembre]:
    filas = list(ws.iter_rows(values_only=True))
    cab_fila, cab = None, {}
    for n, fila in enumerate(filas, start=1):
        textos = [sin_acentos(limpiar(c) or "").upper() for c in fila]
        if "CAMISETA" in textos and "VALOR JRS CLUB" in textos:
            cab_fila = n
            cab = {"desc": textos.index("CAMISETA"), "valor": textos.index("VALOR JRS CLUB"), "pvp": textos.index("PVP")}
            break
    if cab_fila is None:
        reporte.add("DICIEMBRE", "hoja", "No se encontró la cabecera Camiseta / Valor JRS club / PVP")
        return []

    equipos_busqueda = sorted(
        {(sin_acentos(k).lower(), m) for k, (m, suf) in EQUIPOS.items() if suf is None}, key=lambda x: -len(x[0])
    )
    costos = []
    for n, fila in enumerate(filas[cab_fila:], start=cab_fila + 1):
        desc = limpiar(fila[cab["desc"]])
        valor = a_dinero(fila[cab["valor"]])
        pvp = a_dinero(fila[cab["pvp"]])
        if not desc or valor is None or pvp is None:
            continue
        c = CostoDiciembre(n, desc, valor, pvp)
        t = sin_acentos(desc).lower()
        for nombre, marca in equipos_busqueda:
            if nombre in t:
                c.marca_equipo = marca
                break
        m = re.search(r"\b(\d{2}-\d{2}|\d{4})\b", t)
        c.temporada = normalizar_temporada(m.group(1)) if m else None
        if re.search(r"\b(local|home)\b", t):
            c.equipacion = "LOCAL"
        elif re.search(r"\btercera\b", t):
            c.equipacion = "TERCERA"
        elif re.search(r"\b(visitante|away)\b", t):
            c.equipacion = "VISITANTE"
        for palabra, ver in (("jugador", "JUGADOR"), ("retro", "RETRO"), ("fan", "FAN")):
            if re.search(rf"\b{palabra}\b", t):
                c.version = ver
                break
        costos.append(c)
    return costos


def aplicar_costos(variantes: list[Variante], costos: list[CostoDiciembre], reporte: Reporte):
    for c in costos:
        for var in variantes:
            f = var.filas[0]
            if (
                f.marca_equipo == c.marca_equipo
                and f.temporada_coleccion == c.temporada
                and f.equipacion == c.equipacion
                and f.version_modelo == c.version
            ):
                var.valor_jersey_club = c.valor_jersey_club
                var.pvp_sugerido = c.pvp
                var.origen_costo = (
                    f"Costo {c.valor_jersey_club} y PVP {c.pvp} rescatados de la hoja DICIEMBRE (dic-2024, fila {c.fila_excel})"
                )
                c.variantes_afectadas += 1
        if c.variantes_afectadas == 0:
            reporte.add("COSTO_SIN_COINCIDENCIA", f"DICIEMBRE fila {c.fila_excel}", c.descripcion)
        else:
            reporte.add(
                "COSTO_APLICADO",
                f"DICIEMBRE fila {c.fila_excel}",
                f"{c.marca_equipo} {c.temporada} {c.equipacion} {c.version}: "
                f"valor {c.valor_jersey_club} / PVP {c.pvp} -> {c.variantes_afectadas} variante(s)",
            )
    sin_costo = [v for v in variantes if v.valor_jersey_club == 0]
    reporte.add(
        "COSTO_PENDIENTE",
        f"{len(sin_costo)} variantes",
        "Sin costo en el Excel: quedan con valor_jersey_club = 0.00 hasta que contabilidad lo entregue",
    )


# ----------------------------------------------------------------------------- consolidación
def consolidar(filas: list[FilaLimpia], reporte: Reporte):
    productos: "OrderedDict[tuple, str]" = OrderedDict()
    variantes: "OrderedDict[tuple, Variante]" = OrderedDict()
    for f in filas:
        pid = productos.setdefault(f.clave_producto, uid("producto", *f.clave_producto))
        clave = f.clave_variante
        if clave in variantes:
            variantes[clave].filas.append(f)
        else:
            variantes[clave] = Variante(id=uid("variante", *clave), producto_id=pid, clave=clave, filas=[f])
    for var in variantes.values():
        if len(var.filas) > 1:
            reporte.add(
                "VARIANTE_AGRUPADA",
                var.codigo_legacy,
                "Misma variante exacta en varias filas: " + ", ".join(f.codigo_legacy for f in var.filas),
            )
    return productos, list(variantes.values())


# ----------------------------------------------------------------------------- salidas
def escribir_sql(ruta: Path, productos, variantes: list[Variante], origen: Path):
    lineas = [
        "-- =============================================================================",
        "-- Sistema Jersey Club — Seed de inventario desde el Excel legado",
        f"-- Generado por scripts-migracion/limpiar_y_migrar_excel.py el {date.today().isoformat()}",
        f"-- Fuente: {origen.name} (hojas STOCK y DICIEMBRE)",
        f"-- Productos: {len(productos)} · Variantes: {len(variantes)} · "
        f"Unidades en stock: {sum(v.stock_actual for v in variantes)}",
        "-- Idempotente: los ids son deterministas y cada INSERT usa ON CONFLICT DO NOTHING.",
        "-- =============================================================================",
        "",
        "BEGIN;",
        "",
        "-- productos",
    ]
    for (categoria, marca, nombre, temporada), pid in productos.items():
        lineas.append(
            "INSERT INTO ms_inventario.productos (id, categoria, nombre, marca_equipo, temporada_coleccion) VALUES "
            f"({sql_texto(pid)}, {sql_texto(categoria)}, {sql_texto(nombre)}, {sql_texto(marca)}, {sql_texto(temporada)}) "
            "ON CONFLICT (id) DO NOTHING;"
        )
    lineas += ["", "-- variantes"]
    for v in variantes:
        f = v.filas[0]
        lineas.append(
            "INSERT INTO ms_inventario.variantes (id, producto_id, codigo_legacy, talla_medida, version_modelo, "
            "adicional_parche, adicional_dorsal, observaciones, stock_actual, valor_jersey_club, pvp_sugerido) VALUES "
            f"({sql_texto(v.id)}, {sql_texto(v.producto_id)}, {sql_texto(v.codigo_legacy)}, {sql_texto(f.talla_medida)}, "
            f"{sql_texto(f.version_modelo)}, {sql_texto(f.adicional_parche)}, {sql_texto(f.adicional_dorsal)}, "
            f"{sql_texto(v.observaciones)}, {v.stock_actual}, {v.valor_jersey_club}, {v.pvp_sugerido}) "
            "ON CONFLICT (id) DO NOTHING;"
        )
    lineas += ["", "-- movimientos_stock (SALDO_INICIAL: uno por código legado)"]
    for v in variantes:
        saldo = 0
        for f in v.filas:
            anterior, saldo = saldo, saldo + f.stock_actual
            obs = (
                f"Saldo inicial migrado del Excel (hoja STOCK fila {f.fila_excel}, código {f.codigo_legacy}): "
                f"entrada {f.entrada}, salida {f.salida}"
            )
            lineas.append(
                "INSERT INTO ms_inventario.movimientos_stock (id, variante_id, tipo, cantidad, stock_anterior, "
                "stock_nuevo, idempotency_key, observacion) VALUES "
                f"({sql_texto(uid('movimiento', LOTE_MIGRACION, f.codigo_legacy))}, {sql_texto(v.id)}, 'SALDO_INICIAL', "
                f"{f.stock_actual}, {anterior}, {saldo}, {sql_texto(LOTE_MIGRACION + ':' + f.codigo_legacy)}, "
                f"{sql_texto(obs)}) ON CONFLICT (id) DO NOTHING;"
            )
    lineas += [
        "",
        "-- Verificación: el stock de cada variante migrada debe cuadrar con su Kardex",
        "DO $$",
        "DECLARE descuadres INT;",
        "BEGIN",
        "  SELECT COUNT(*) INTO descuadres",
        "  FROM ms_inventario.variantes v",
        "  JOIN (",
        "    SELECT variante_id,",
        "           SUM(CASE WHEN tipo IN ('SALDO_INICIAL','REVERSION_VENTA','AJUSTE_ENTRADA') THEN cantidad ELSE -cantidad END) AS saldo",
        "    FROM ms_inventario.movimientos_stock GROUP BY variante_id",
        "  ) k ON k.variante_id = v.id",
        "  WHERE v.stock_actual <> k.saldo;",
        "  IF descuadres > 0 THEN",
        "    RAISE EXCEPTION 'Seed inválido: % variantes con stock distinto a su Kardex', descuadres;",
        "  END IF;",
        "END $$;",
        "",
        "COMMIT;",
        "",
    ]
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text("\n".join(lineas), encoding="utf-8")


def hoja(wb, titulo, cabecera, filas):
    ws = wb.create_sheet(titulo)
    ws.append(cabecera)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F3A5F")
    for f in filas:
        ws.append(["" if x is None else (float(x) if isinstance(x, Decimal) else x) for x in f])
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for i, _ in enumerate(cabecera, start=1):
        ancho = max(len(str(c.value or "")) for c in ws[get_column_letter(i)])
        ws.column_dimensions[get_column_letter(i)].width = min(max(ancho + 2, 10), 70)
    return ws


def escribir_xlsx(ruta: Path, filas, productos, variantes, costos, reporte: Reporte):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    var_por_codigo = {f.codigo_legacy: v for v in variantes for f in v.filas}
    hoja(
        wb,
        "STOCK_LIMPIO",
        ["fila_excel", "codigo_original", "codigo_legacy", "categoria", "marca_equipo", "nombre_producto",
         "equipacion", "temporada_coleccion", "talla_medida", "version_modelo", "adicional_parche",
         "adicional_dorsal", "entrada", "salida", "stock_actual", "stock_excel", "variante_id", "notas"],
        [[f.fila_excel, f.codigo_original, f.codigo_legacy, CATEGORIA_DEFECTO, f.marca_equipo, f.nombre_producto,
          f.equipacion, f.temporada_coleccion, f.talla_medida, f.version_modelo, f.adicional_parche,
          f.adicional_dorsal, f.entrada, f.salida, f.stock_actual, f.stock_excel,
          var_por_codigo[f.codigo_legacy].id, " | ".join(f.notas) or None] for f in filas],
    )
    hoja(
        wb,
        "PRODUCTOS",
        ["id", "categoria", "nombre", "marca_equipo", "temporada_coleccion", "variantes", "unidades_stock"],
        [[pid, k[0], k[2], k[1], k[3], sum(1 for v in variantes if v.producto_id == pid),
          sum(v.stock_actual for v in variantes if v.producto_id == pid)] for k, pid in productos.items()],
    )
    hoja(
        wb,
        "VARIANTES",
        ["id", "producto_id", "codigo_legacy", "talla_medida", "version_modelo", "adicional_parche",
         "adicional_dorsal", "stock_actual", "valor_jersey_club", "pvp_sugerido", "observaciones"],
        [[v.id, v.producto_id, v.codigo_legacy, v.filas[0].talla_medida, v.filas[0].version_modelo,
          v.filas[0].adicional_parche, v.filas[0].adicional_dorsal, v.stock_actual, v.valor_jersey_club,
          v.pvp_sugerido, v.observaciones] for v in variantes],
    )
    hoja(
        wb,
        "COSTOS_DICIEMBRE",
        ["fila_excel", "descripcion", "valor_jersey_club", "pvp", "marca_equipo", "temporada", "equipacion",
         "version", "variantes_afectadas"],
        [[c.fila_excel, c.descripcion, c.valor_jersey_club, c.pvp, c.marca_equipo, c.temporada, c.equipacion,
          c.version, c.variantes_afectadas] for c in costos],
    )
    hoja(wb, "REPORTE_DEPURACION", ["tipo", "referencia", "detalle"], reporte.eventos)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    wb.save(ruta)


# ----------------------------------------------------------------------------- main
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--entrada", type=Path, default=ENTRADA_DEFECTO)
    parser.add_argument("--salida-xlsx", type=Path, default=SALIDA_XLSX_DEFECTO)
    parser.add_argument("--salida-sql", type=Path, default=SALIDA_SQL_DEFECTO)
    args = parser.parse_args()

    if not args.entrada.exists():
        print(f"No existe el archivo de entrada: {args.entrada}", file=sys.stderr)
        return 1

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # imágenes WMF de la portada no soportadas por openpyxl
        wb = openpyxl.load_workbook(args.entrada, data_only=True, read_only=False)

    reporte = Reporte()
    filas = leer_stock(wb["STOCK"], reporte)
    productos, variantes = consolidar(filas, reporte)
    costos = leer_diciembre(wb["DICIEMBRE"], reporte) if "DICIEMBRE" in wb.sheetnames else []
    aplicar_costos(variantes, costos, reporte)

    codigos = [v.codigo_legacy for v in variantes]
    if len(codigos) != len(set(codigos)):
        print("Error: codigo_legacy repetido entre variantes", file=sys.stderr)
        return 1

    escribir_sql(args.salida_sql, productos, variantes, args.entrada)
    escribir_xlsx(args.salida_xlsx, filas, productos, variantes, costos, reporte)

    unidades = sum(v.stock_actual for v in variantes)
    print(f"Filas válidas leídas de STOCK : {len(filas)}")
    print(f"Productos                     : {len(productos)}")
    print(f"Variantes                     : {len(variantes)}")
    print(f"Variantes con stock > 0       : {sum(1 for v in variantes if v.stock_actual > 0)}")
    print(f"Unidades en stock             : {unidades}")
    print(f"Movimientos SALDO_INICIAL     : {len(filas)}")
    print("Eventos de depuración:")
    tipos = OrderedDict()
    for t, _, _ in reporte.eventos:
        tipos[t] = tipos.get(t, 0) + 1
    for t, n in tipos.items():
        print(f"  {t:<24} {n}")
    print(f"XLSX -> {args.salida_xlsx}")
    print(f"SQL  -> {args.salida_sql}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
