---
name: Jersey Club
description: ERP de tienda en español (es-EC) que deja el costo real a la vista y nunca muestra un costo desconocido como si fuera real.
colors:
  tinta: "#1b1c1e"
  tinta-2: "#2a2b2f"
  tinta-3: "#3a3c41"
  humo: "#a7abb1"
  papel: "#f3f3f0"
  blanco: "#ffffff"
  linea: "#dfdfda"
  linea-2: "#ecece8"
  gris: "#62666c"
  plata-1: "#f1f3f5"
  plata-2: "#c3c8cd"
  plata-3: "#8c9299"
  ok: "#17734a"
  ok-fondo: "#dcefe4"
  alerta: "#8a5806"
  alerta-fondo: "#f8ebcc"
  error: "#ad1f2c"
  error-fondo: "#f8dcdf"
typography:
  cifra-titulo:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "2.1rem (2.6rem desde lg)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "tnum, lnum"
  cifra-seccion:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  cifra-indicador:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "2.7rem (2.4rem desde lg); 1.85rem secundarios"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  cuerpo:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum, lnum"
  etiqueta:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 600
  nota:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.78rem to 0.8rem"
    fontWeight: 500
rounded:
  placa: "6px"
  chip-codigo: "4px"
  tarjeta: "12px"
  hoja: "16px"
  pastilla: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.blanco}"
    rounded: "{rounded.placa}"
    height: "44px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.tinta-2}"
  button-secondary:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.placa}"
    height: "44px"
  button-on-ink:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.placa}"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.blanco}"
    rounded: "{rounded.placa}"
    height: "44px"
  field:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.placa}"
    height: "44px"
  card:
    backgroundColor: "{colors.blanco}"
    rounded: "{rounded.tarjeta}"
    padding: "20px (24px desde lg)"
  kpi-strip:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.blanco}"
    rounded: "{rounded.tarjeta}"
  cost-plate-missing:
    textColor: "{colors.error}"
    rounded: "{rounded.chip-codigo}"
    height: "28px"
  cost-plate-loaded:
    textColor: "{colors.tinta}"
    rounded: "{rounded.chip-codigo}"
    height: "28px"
  nav-rail:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.humo}"
    width: "256px"
---

# Design System: Jersey Club

## Overview

**Creative North Star: "La placa de costo"**

Un ERP de tienda en español de Ecuador (es-EC, 100% de la interfaz) donde el costo real siempre está a la vista y lo desconocido nunca se disfraza de dato. El mundo visual sale de la marca: negro de marca, blanco frío y la plata cepillada del isotipo. Se diseña con el mismo cuidado para celular (mobile-first, vendedor) y para PC (administrador); no es una versión reducida de la otra.

El sistema es plano y sobrio: superficies tonales, bordes finos y casi ninguna sombra en reposo. La plata es escasa a propósito y solo significa "completo": la placa de un costo cargado, la barra de progreso, el ítem activo de navegación y el isotipo. Las acciones primarias son casi negras (o blancas sobre negro), nunca plateadas. Los estados (verde, ámbar, rojo) siempre llevan texto junto al color.

Hay dos roles reales. ADMIN ve costos, márgenes y ganancia y puede editar precios, catálogo y stock y anular ventas. VENDEDOR no ve nada de eso y el layout se reacomoda (por ejemplo la franja de indicadores pasa de 5 a 3 columnas), no deja huecos. Se rechaza cualquier metáfora de álbum, cromos o fidelización: ni en el lenguaje ni en la interfaz. También se rechaza el panel gris con acento azul típico de la categoría.

**Key Characteristics:**
- Negro de marca en riel, cabecera, franja de indicadores y acciones primarias; fondo blanco frío.
- Plata cepillada solo para lo completo.
- Cifras en Barlow Condensed tabular; UI en Barlow.
- Costo faltante = ranura punteada roja "Sin costo"; ganancia o margen incompletos = "parcial" en ámbar.
- Hojas y diálogos nativos (`dialog`); sin tarjetas anidadas.

## Colors

Paleta de tres voces: negro de marca, blanco frío y plata fría, más tres colores de estado apagados.

### Primary
- **Tinta de marca** (tinta): riel lateral, cabecera móvil, barra inferior, franja de indicadores, botón primario, selección de texto, anillo de foco. Capas más claras para hover y borde sobre negro: tinta-2, tinta-3.

### Secondary
- **Plata cepillada** (plata-1, plata-2, plata-3): ramp de la plata del isotipo. Se materializa como degradado cepillado (clases `metal` y `metal-barra`) en la placa de costo cargado, la barra de progreso, la marca del ítem activo, el interruptor activo y el isotipo. plata-2 también es el foco sobre fondo negro; plata-3 es el color de números de ranking e íconos vacíos.

### Neutral
- **Papel frío** (papel): fondo de página y de hojas/diálogos.
- **Blanco** (blanco): tarjetas, campos, cabeceras de hoja.
- **Línea / Línea suave** (linea, linea-2): bordes y divisores; linea-2 también es el carril de barras de progreso y el fondo del selector de periodo.
- **Gris de apoyo** (gris): texto secundario y ayudas.
- **Humo** (humo): texto secundario sobre negro.

### Estado (siempre con texto)
- **Ok** (ok / ok-fondo): stock normal, margen sano (20% o más), aviso de éxito.
- **Alerta** (alerta / alerta-fondo): última unidad, margen bajo (menos de 20%), "parcial".
- **Error** (error / error-fondo): agotado, margen negativo, "Sin costo", errores, acción destructiva.

### Named Rules
**The Silver Means Complete Rule.** La plata aparece solo donde algo está completo: costo cargado, progreso, ítem activo, isotipo. Nunca como decoración ni como color de acción.

**The Never-Zero Rule.** Un costo no cargado jamás se muestra como $0,00 real: es la ranura punteada roja "Sin costo", y la ganancia/margen que dependen de él se marcan "parcial".

**The Color Plus Words Rule.** Ningún estado se comunica solo con color; siempre hay etiqueta ("Agotado", "Última unidad", "parcial", "Sin costo").

## Typography

**Display / cifras:** Barlow Condensed (600, 700, 800) con Barlow y system-ui de respaldo
**Cuerpo / UI:** Barlow (400, 500, 600, 700) con system-ui

**Character:** Condensada y mecánica para cifras, títulos y códigos; humanista y legible para la interfaz. Todo el sitio activa numerales tabulares y lining (`tnum`, `lnum`), de modo que las columnas de dinero se alinean.

### Hierarchy
- **Título de página** (700, 2.1rem / 2.6rem en PC, line-height 1): "Panel", "Inventario"; en condensada.
- **Cifra de indicador** (700, 2.7rem móvil / 2.4rem PC para el principal, 1.85rem los demás, line-height 1): valores de la franja negra.
- **Título de sección y de hoja/diálogo** (700, 1.35rem a 1.45rem): condensada.
- **Cuerpo** (400 a 500, 0.95rem): texto y campos.
- **Etiqueta** (600, 0.82rem): etiquetas de campo y de indicador.
- **Nota** (500, 0.78 a 0.8rem): ayudas, pie de cifra, errores de campo.
- **Cabecera de tabla** (600, 0.78rem, mayúsculas con tracking amplio, sobre negro): solo encabezados de columna de inventario y ventas.

### Named Rules
**The Figures Are Condensed Rule.** Todo importe, cantidad, código y porcentaje usa la clase de cifra (Barlow Condensed tabular); el texto corrido nunca.

**The Brand Caps Rule.** La marca "Jersey Club" y el titular de la pantalla de ingreso van en mayúsculas condensadas; el resto de la interfaz va en mayúscula/minúscula normal.

## Layout

Mobile-first con un solo punto de quiebre estructural en `lg` (1024px). Celular: cabecera negra fija de 56px (isotipo y nombre), contenido en una columna con 16px laterales, barra inferior de 5 posiciones con la acción "Vender" central elevada (círculo blanco de 56px con aro negro). PC: riel negro fijo de 256px con botón blanco "Registrar venta", navegación, usuario y rol; contenido hasta 1400px con 40px laterales.

El panel organiza una franja negra de indicadores (2 columnas en celular con el principal a ancho completo; 5 en una fila para ADMIN y 3 para VENDEDOR en PC), luego pagos y más vendidos a dos columnas en PC. En celular el bloque de costos pendientes sube antes de los pagos. Ritmo vertical de 24px (32px en PC) entre secciones, 20 a 24px dentro de tarjetas. Controles táctiles de 44px de alto mínimo (36px en tamaño pequeño, 56px en grande).

## Elevation & Depth

Plano por defecto; la profundidad es tonal (negro sobre papel, blanco sobre papel, bordes de 1px). Las sombras existen solo para elementos que flotan sobre el contenido.

### Shadow Vocabulary
- **Flota** (`0 12px 32px -12px rgb(27 28 30 / 0.35), 0 2px 6px -2px rgb(27 28 30 / 0.18)`): hojas, diálogos, notificaciones y el botón central "Vender".
- **Suave** (`0 1px 2px rgb(27 28 30 / 0.06), 0 4px 12px -6px rgb(27 28 30 / 0.12)`): franja de indicadores.
- **Bisel de plata** (inset claro arriba, inset oscuro abajo): solo dentro de `metal`.

### Named Rules
**The Flat-Until-Floating Rule.** Una tarjeta en reposo no lleva sombra; solo lo que se superpone (hoja, diálogo, nota, botón central) usa Flota. Las sombras duras con desplazamiento no existen en este sistema.

## Shapes

Esquinas contenidas: 6px (placa) para botones, campos y avisos; 4px para códigos y la placa de costo; 12px para tarjetas y franja de indicadores; 16px solo en la parte superior de la hoja móvil; píldora completa para selector de periodo, chips de stock, avatares e interruptores. Bordes de 1px en linea. El carril de las barras es una píldora; la barra interna usa la plata cepillada.

## Components

### Buttons
- **Shape:** 6px, alto 44px (sm 36, lg 56), peso 600.
- **Primario:** fondo tinta, texto blanco; hover tinta-2; deshabilitado tinta al 40%.
- **Sobre negro:** blanco con texto tinta (acción "Registrar venta" del riel); hover plata-1.
- **Secundario:** blanco con borde linea. **Fantasma:** sin fondo. **Metal:** plata cepillada, existe en la variante pero no es acción por defecto. **Peligro:** fondo error, texto blanco.
- **Foco:** contorno de 2px tinta con 2px de separación (plata-2 sobre negro). Pulsar reduce a 98,5%.

### Inputs / Fields
- Fondo blanco, borde linea, 6px, 44px de alto, etiqueta de 0.82rem encima. Foco: borde tinta y aro de 2px tinta al 12%. Error: borde y mensaje en error, con texto. Importes en cifra condensada con prefijo "$". Selector con flecha SVG en tinta.

### Navigation
- Riel (PC) y barra inferior (celular) en negro. Ítem inactivo en humo; activo en blanco sobre tinta-2 con una marca de plata cepillada de 3px (borde izquierdo en riel, línea superior en celular). "Cuenta" abre una hoja.

### Placa de costo (componente firma)
- **Sin costo:** ranura punteada de 1px en error (60%), 28px de alto, texto "Sin costo".
- **Con costo:** placa de plata cepillada, importe en cifra condensada 1rem bold; al guardar recién, la placa se llena con un barrido de brillo de 520ms (`placa`). El editor en línea muestra el margen en vivo (rojo negativo, ámbar bajo 20%, verde desde 20%).

### Cards / Containers
- Blanco, borde linea, 12px, 20 a 24px de padding; títulos en cifra condensada. Nunca se anida una tarjeta dentro de otra; los sub-bloques usan divisores de linea-2 o un fondo papel sin borde.

### Chips de stock
- Píldora con la cifra y texto: error "agotado", ámbar "última", verde "en stock". Con texto sr-only equivalente.

### Hoja y Diálogo
- **Hoja:** panel lateral de 30rem en PC, hoja inferior con esquinas superiores de 16px en celular; cabecera blanca, pie con safe-area.
- **Diálogo de confirmación:** centrado en PC (hasta 32rem, 12px), anclado abajo a ancho completo en celular. Las acciones destructivas (anular una venta) usan este diálogo y exigen un motivo; botón peligro. Fondo con velo tinta al 45 a 50% y desenfoque de 2px.

### Avisos y notas
- Avisos en línea con ícono SVG y título (info, alerta, error, ok). Notas temporales sobre la barra inferior en celular y abajo a la derecha en PC; negro o rojo, 4 a 7s.

### Tablas
- Cabecera negra, texto humo, 0.78rem en mayúsculas; filas separadas por linea-2.

## Do's and Don'ts

### Do:
- **Do** mostrar un costo ausente como la ranura punteada roja "Sin costo" y marcar "parcial" toda ganancia o margen que lo incluya.
- **Do** reservar la plata cepillada para lo completo: placa de costo, progreso, ítem activo, isotipo.
- **Do** hacer primarias las acciones en tinta (#1B1C1E) o blanco sobre negro.
- **Do** acompañar todo estado con texto y usar la clase de cifra para todo importe, cantidad y código.
- **Do** ocultar a VENDEDOR costos, márgenes y ganancia y reacomodar el layout sin huecos.
- **Do** confirmar acciones destructivas con el diálogo que pide un motivo.
- **Do** escribir toda la interfaz en español (es-EC) con lenguaje administrativo llano.

### Don't:
- **Don't** mostrar $0,00 para un costo no cargado.
- **Don't** usar plata como fondo de acciones primarias ni como decoración.
- **Don't** usar metáforas de álbum, cromos, colecciones por completar o fidelización, ni en copy ni en visuales.
- **Don't** anidar tarjetas ni apoyar el significado solo en el color.
- **Don't** usar sombras duras desplazadas ni sombra en tarjetas en reposo.
- **Don't** volver a la categoría: panel gris con acento azul.
