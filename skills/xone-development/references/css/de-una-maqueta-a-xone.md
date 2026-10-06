# De una maqueta HTML (Stitch, Tailwind) a XOne

Contenido: §1 cómo leer esta tabla · §2 medidas y unidades · §3 forma, bordes y fondos · §4 color · §5 texto y
tipografías · §6 composición · §7 lo que no existe

Una maqueta de Stitch trae un `code.html` con clases de Tailwind y una configuración propia (`tailwind.config`:
colores con nombre, `borderRadius`, `fontFamily`, `fontSize`). Esta tabla dice cómo se escribe cada cosa en XOne.
**XOne ignora en silencio lo que no conoce**: una clase traducida «a ojo» no da error, da una pantalla distinta.

## 1. Cómo leer esta tabla

Cada fila dice de dónde sale:

- **medido**: comprobado en un emulador Android con una pantalla de prueba. Fíate.
- **documentado**: lo dice otra referencia de esta skill, sin medida propia.
- **sin medir**: no se ha comprobado. Pruébalo en el aparato antes de dar nada por bueno.

Lo primero, siempre: lee la configuración de Tailwind del `code.html` (`tailwind.config = {…}`). Los nombres de las
clases (`rounded-lg`, `text-key-numeric`, `bg-surface-container-high`) son de ESA maqueta y valen lo que diga ella.

## 2. Medidas y unidades

| En la maqueta | En XOne | De dónde |
|---|---|---|
| un ancho en px | `p`: `px_maqueta × resolution-width / ancho_de_la_maqueta`; o en `%` del contenedor | medido |
| un alto en px | `p` con la misma cuenta. **Ojo**: un alto en `p` escala con el ALTO útil de la pantalla y un ancho con el ANCHO, así que en un teléfono alargado sale más alto (medido: ×1,72 en alto y ×1,5 en ancho, 15 % más alto de proporción) | medido |
| `w-full` | `width="100%"` | documentado |
| `p-N`, `px-N`, `py-N` | `lpadding`, `rpadding`, `tpadding`, `bpadding` (no hay abreviado) | documentado |
| `m-N`, `mt-N`… | `lmargin`, `tmargin`… (no hay abreviado; `rmargin` en `%` se ignora) | documentado / medido |

`p` no es el píxel y escala **por eje**: un ancho por `ancho_real / resolution-width`, un alto por
`alto_útil / resolution-height` (el alto útil es la pantalla sin las barras de estado y de navegación). Lee los
dos valores en el `app.xml` del proyecto.

## 3. Forma, bordes y fondos

| En la maqueta | En XOne | De dónde |
|---|---|---|
| `rounded-full` (píldora o círculo) | `border-corner-radius: 999` | medido |
| `rounded-lg`, `rounded-xl`, `rounded-[Npx]` | `border-corner-radius` en **píxeles del aparato**, no en `p`: `px_maqueta × ancho_real / ancho_de_la_maqueta` (32 px en una maqueta de 390 son unos 89 en un aparato de 1080). El radio se recorta a la mitad del alto | medido (la unidad) |
| un botón sin borde | `border-width: 0`. Un `type="B"` pinta un contorno fino por omisión; `border: false`, `border: 0`, `framebox: false` y `labelbox: false` NO lo quitan | medido |
| `border`, `border-COLOR` | `border-width: 1; border-color: #RRGGBB` | documentado |
| `bg-gradient-to-br from-A to-B` | un SVG con `generar_fondo_svg` (tipo degradado, ángulo 45 para `to-br`): en un BOTÓN va en `img`, en un frame en `imgbk` (en un botón `imgbk` se ignora) | medido |
| `shadow-[0_6px_14px_…]` (sombra exterior) | un SVG con `generar_fondo_svg` (tipo sombra). **No** `elevation` en algo redondeado: recorta el fondo por abajo | medido |
| `shadow-[inset_…]` (brillo interior) | no hay equivalente; si importa, dibújalo en el mismo SVG del fondo | sin medir |
| `border-corner-radius` sobre una imagen de fondo | no la recorta: la esquina se dibuja DENTRO del SVG | medido |

## 4. Color

| En la maqueta | En XOne | De dónde |
|---|---|---|
| `bg-<nombre>`, `text-<nombre>` | el `#RRGGBB` que diga `tailwind.config` para ese nombre, en `bgcolor` y `forecolor` / `text-forecolor` | documentado |
| `bg-<nombre>/80` (transparencia) | `#AARRGGBB` con el alfa **primero**: 80 % es `CC`, 60 % `99`, 5 % `0D` | documentado |
| un color en un SVG | `#RRGGBB` más `opacity` (HTML y SVG ponen el alfa al final; XOne al principio) | medido |

## 5. Texto y tipografías

| En la maqueta | En XOne | De dónde |
|---|---|---|
| una fuente de Google Fonts (`fontFamily` en la configuración, `fonts.googleapis.com` en el `<head>`) | su `.ttf` en `fonts/` y `fontname: Nombre.ttf` (`buscar_fuente` → `traer_fuente` lo trae: un `.ttf` estático por peso, `Inter-Bold.ttf`). El `.ttf` variable que da Google Fonts vale tal cual (sale con su peso por omisión). **Se sube desplegando entero**: la recarga en caliente no lleva `fonts/`. Un `fontname` que no está en el aparato saca un diálogo de error y el control no se pinta | medido |
| `text-[Npx]`, `fontSize` de la configuración | `fontsize: N−8`. En Android la letra sale de **`fontsize` + 8 dp**: `fontsize: 20` pinta una letra de 28 dp, y `fontsize: 40` una de 48. Un píxel de la maqueta (viewport de unos 390 de ancho) es casi un dp del teléfono, así que `text-[48px]` → `fontsize: 40` y `text-[16px]` → `fontsize: 8`. Ese +8 es fijo: no escala con el tamaño ni depende de la `resolution-width` de `app.xml`. Medido con la fuente del sistema; con otra `fontname` el tamaño es el mismo, pero el alto de las mayúsculas cambia con la fuente. `textfont-size` y iOS, sin medir | medido (Android) |
| `font-medium`, `font-semibold`, `font-bold` | la variante de la fuente con ese peso (`Roboto-Bold.ttf`) o `fontbold` | documentado |
| `uppercase` | escribe el texto ya en mayúsculas | sin medir |
| `tracking-*` (espaciado entre letras), `leading-*` (interlineado) | sin equivalente conocido | sin medir |
| un texto que no cabe | `auto-fontsize="true"`, o una caja más alta: un `height` menor que la letra la corta por abajo | medido |
| cambiar la fuente de un control (`fontname`) | **revisa la altura de su caja**: con el mismo `fontsize`, otra fuente coloca la letra a otra altura dentro de ella. Space Grotesk queda más abajo que Roboto, así que en una tecla con la altura justa se corta más por abajo (el `-` y el `+` casi desaparecen). Sube el `height` o baja el `fontsize`, y compruébalo con una captura | medido |
| iconos `material-symbols-outlined` | `buscar_icono` → `icons/ic_<nombre>.svg`, en un `type="IMG"` (en el `img` de un botón se estira) | medido |

## 6. Composición

| En la maqueta | En XOne | De dónde |
|---|---|---|
| `grid grid-cols-4 gap-N` | una fila de controles con `width` en `%` que, con sus márgenes, sume como mucho el 100 %: el que se pasa desborda por la derecha | medido |
| `flex justify-between` | márgenes en `%` entre los elementos de la fila | documentado |
| `flex-col` | controles uno bajo otro (`newline`) dentro de un frame | documentado |
| una cabecera fija (`fixed top-0`) | un `group` con `fixed="true"` y `orientation="top"` | documentado |

## 7. Lo que no existe en XOne (no lo traduzcas, ni a medias)

`hover:`, `active:`, `focus:`, `transition-*`, `animate-*`, `translate-*`, `scale-*`, `blur-*`, `backdrop-blur-*`,
`opacity` animada, `pointer-events-*`, `select-none`, `overflow-x-auto` con barra oculta, `env(safe-area-inset-*)`.
Son estados o animaciones del navegador; en XOne no hacen nada, y escribirlos con otro nombre no los hace existir.
