# TUI de xonecode — estilo XOne (delta sobre la TUI Ink)

Fecha: 2026-09-01. Estado: aprobado para planificación.
Base: `2026-09-01-tui-ink-design.md`. Este documento solo describe lo que CAMBIA; todo lo
que no se nombra aquí sigue como en la spec base y en el código actual de `src/cli/tui/`.

## Qué es

Un restyle de la TUI para acercarla a la maqueta de referencia (OpenCode): bloques de
mensaje con barra de acento, línea de cierre de turno con modelo y duración, pie a dos
extremos, sidebar con lo estable anclado abajo, paleta con los azules de xone.es y el
logotipo XONE en letras de bloque como cabecera de la sidebar.

## Por qué así

- **Los azules son los de xone.es, medidos en su CSS**, no elegidos a ojo: navy `#00396f`
  (dominante), azul claro `#47abd6`, cian `#2ac4ea`. El navy sobre un terminal oscuro no se
  lee como texto, así que solo pinta bordes, barras y logotipo; el texto de acento es el
  azul claro.
- **Nada inventado en la sidebar.** La referencia enseña coste en dólares, LSP y MCP.
  xonecode no tiene medidor de coste, no tiene LSP y el `McpPort` no llega a la sesión de
  consola (`correrTui.ts` no lo recibe). Esas secciones NO se pintan. Es la misma regla que
  «porcentaje solo con tope» de `core/contextos.ts`.
- **Un acto, una fila.** `ventanaDe` (transcript.tsx) cuenta un acto como una fila y
  `app.tsx` calcula la altura del transcript restando filas fijas. Los bloques nuevos no
  pueden tener borde arriba/abajo ni padding vertical, o la ventana se desborda.
- **Sin dependencias nuevas.** El logotipo es un array de cadenas; no entra figlet ni
  nada parecido (mismo criterio por el que la Entrada no usa `ink-text-input`).

## Alcance

**Entra:**

1. Paleta XOne en `temaInk.ts`.
2. Bloque de usuario con barra izquierda navy en el transcript.
3. Fase en ámbar («+ Pensando — detalle: 0.2s»).
4. Acto `fin` con el modelo del turno: «■ ollama/glm · 1.8s».
5. Entrada con barra izquierda navy y segunda línea muda con el modelo de trabajo.
6. Pie a dos extremos: ruta a la izquierda; tokens, porcentaje y «/ayuda» a la derecha.
7. Sidebar: logotipo XONE arriba (con umbral de anchura), Contexto y Modelo, y al fondo
   «proyecto:rama» + «● xonecode <versión>».

**No entra:** coste, LSP, MCP, fondos de color en los bloques (Ink 5.2.1: `Box` no tiene
`backgroundColor`; `Text` sí, pero pintar fondos por span rompería con el wrap), temas de
usuario, ratón.

## Diseño por pieza

### 1. Paleta (`temaInk.ts`, `temaInk.test.ts`)

| token | valor | uso |
|---|---|---|
| `acento` | `#47abd6` | texto de acento: cabeceras de sidebar, viñetas, el ■ del fin, logotipo |
| `prompt` | `#2ac4ea` | el cursor `▏` de la Entrada y de la Pregunta |
| `marca` (nuevo, solo TUI) | `#00396f` | barra izquierda de los bloques de usuario y de la Entrada |
| `fase` (nuevo, solo TUI) | `#e0a458` | la línea «+ fase: Ns» |

Los demás tokens no cambian. `marca` y `fase` se añaden a la lista `soloTui` del test de
espejo inverso. El test que fija `acento` a `#38bdf8` pasa a fijarlo a `#47abd6`; la
aserción de «hex» se mantiene para los cuatro.

### 2. Transcript (`transcript.tsx`, `store.ts`)

- Caja: `<Box flexDirection="column" flexGrow={1} flexBasis={0} overflow="hidden"
  justifyContent="flex-end">`. El transcript es la ÚNICA pieza elástica de la columna
  izquierda (Entrada, Pregunta y pie llevan `flexShrink 0`): con pocos actos se estira y
  deja la Entrada anclada abajo, y cuando el contenido no cabe se recorta por ARRIBA, que
  lo más nuevo es lo que hay que leer. `altura` deja de ser la altura de la caja —la pone
  el flex— y pasa a ser el tamaño de la rebanada que `ventanaDe` corta del historial.
  Cada fila va en un Box con `flexShrink 0`: si las filas encogen, Ink reparte el recorte
  entre todas y las redondea sobre las mismas líneas, y se pierden actos del MEDIO en vez
  de los de arriba (medido: 10 actos en 5 filas pintaban «c1 c3 c5 c7 c9»).
- `usuario`: `<Box borderStyle="single" borderLeft borderTop={false} borderRight={false}
  borderBottom={false} borderLeftColor={temaInk.marca} paddingLeft={1}>` con el texto
  dentro. Una fila por acto. Se retira el `❯ ` de delante.
- `fase`: mismo texto de hoy, color `temaInk.fase` en vez de `mudo`.
- `fin`: el acto pasa a `{ tipo: "fin"; ms: number; modelo?: string }`. Se pinta
  `■ <modelo> · <segundos>s` con el ■ en `acento`, el modelo en `texto` y la duración en
  `mudo`. Sin modelo (tests viejos, guion) se pinta `■ <segundos>s`.
- `Piel.fin` del motor sigue recibiendo solo `ms`. El modelo lo pone el envoltorio de
  piel de `correrTui.ts` (`piel()`), que ya conoce `modeloTrabajo`: llama a
  `store.fin(ms, modeloTrabajo)`. Se captura en el momento del `fin`, no en el render,
  para que un `/modelo` posterior no reetiquete turnos ya cerrados. `crearPielTui`
  acepta un `modeloActual?: () => string` opcional para hacer lo mismo sin duplicar.

### 3. Entrada (`entrada.tsx`)

- Borde: barra izquierda `marca` (mismo Box que el bloque de usuario), sin el redondeado.
- Dentro, dos filas: la línea en edición con cursor `prompt`; debajo, en `mudo`, el
  modelo de trabajo (`modelo: string`, prop nueva). Ocupada: «turno en curso… (Ctrl-C
  para cancelar el turno)» sustituye a la primera fila; la segunda se mantiene.
- La pista de Tab, cuando hay, es una tercera fila (como hoy).
- `PreguntaInk` (app.tsx) adopta la misma barra izquierda pero en `aviso`, para que se
  distinga de la Entrada.

### 4. Pie (`sidebar.tsx`, `app.tsx`)

- `lineaDeEstado(modelo, ruta)` se sustituye por `pie(datos): { izquierda: string;
  derecha: string }`, pura: `izquierda = ruta`; `derecha = "<15,4K> (<8>%)  /ayuda"`, y
  sin tope `"<15,4K> tokens  /ayuda"`, y con contexto 0 solo `"/ayuda"`. Las cifras salen
  de `compacto`/`formatearTope` de `cli/tokens.ts`, como hoy.
- `BarraDeEstado` pinta `<Box justifyContent="space-between">`: la ruta y las cifras en
  `mudo`; solo la palabra `/ayuda` en `texto`, como el «ctrl+p» de la referencia.
- La ruta abrevia el `$HOME` a `~` (`abreviarHome`, pura, en `correrTui.ts`) y, cuando el
  pie es estrecho, se trunca por DELANTE (`wrap="truncate-start"`, dentro de un Box con
  `flexShrink 1`): la cola —el proyecto— es la que identifica. Las cifras y `/ayuda` van
  en un Box con `flexShrink 0`, para que un pie estrecho no se los coma.

### 5. Sidebar (`sidebar.tsx`, `logo.ts`)

- `logo.ts`: `export const LOGO_XONE: readonly string[]` (letras de bloque, 5 filas de
  26 columnas) y `export function cabeLogo(columnas: number): boolean` → `columnas >= 100`.
  El umbral es sobre la anchura TOTAL del terminal (stdout.columns), que `App` pasa a la
  sidebar como prop `columnas`.
- Estructura: `<Box flexDirection="column" flexGrow={1}>` (llena la columna, cuya altura fija pone `App`) con:
  1. Logotipo (si `cabeLogo`) en `acento`, seguido de una fila vacía.
  2. Sección **Contexto** (solo si `contexto > 0`): la cifra como hoy.
  3. Sección **Modelo**: trabajo en `texto`, resto de papeles en `mudo`.
  4. `<Box flexGrow={1} />` que empuja el resto al fondo.
  5. Pie de sidebar: `<ruta>:<rama>` con `proyecto` en negrita y `:rama` en `mudo`
     (sin rama, solo el proyecto), y debajo `● xonecode <versión>` con el ● en `exito`.
- `columnas` llega a `Sidebar` como prop APARTE de `DatosDeSidebar` (los datos los compone
  `correrTui.ts`, que no mira stdout; la anchura la conoce `App`). `DatosDeSidebar` gana en
  cambio `ruta` para el pie (la raíz, con el `$HOME` abreviado a `~`); `proyecto` sigue
  siendo el basename.
- Para que el anclaje al fondo funcione, `App` da a la fila de columnas `height = rows - 1`.
  El pie NO es esa fila —vive dentro de la columna izquierda—: el `- 1` es la fila de
  reserva del borrado total de Ink (ver Riesgos).

### 6. Altura del transcript (`app.tsx`)

La fila de columnas mide `rows - 1` (fijo, por la fila de reserva del borrado total de
Ink) y Entrada, Pregunta y pie llevan `flexShrink 0`: el transcript es lo único que se
estira y lo único que se recorta, por arriba. Lo que se calcula, entonces, no es una
altura de caja sino cuántos actos pedir: `alturaTranscript = (rows - 1) - FILAS_FIJAS` es
el tamaño de la rebanada que `ventanaDe` corta. `FILAS_FIJAS = 3` (2 filas de contenido de
la Entrada + 1 del pie) queda como constante nombrada, con el desglose en comentario; la
pista de Tab añade una fila transitoria que sale de una fila del transcript.

## Testing

Todo con `ink-testing-library` o funciones puras; nada necesita TTY ni red.

- `temaInk.test.ts`: acento `#47abd6`; `marca` y `fase` declarados; los cuatro hex.
- `transcript.test.tsx`: el bloque de usuario ocupa UNA fila (frame de un store con N
  usuarios tiene N líneas de contenido); `fin` con modelo pinta `■ ollama/glm · 1.8s`;
  `fin` sin modelo pinta `■ 1.8s`.
- `store.test.ts`: `fin(ms, modelo)` guarda el modelo en el acto.
- `correrTui.test.ts`: la piel del turno pasa el modelo vigente al `fin`, y un `/modelo`
  DESPUÉS del fin no cambia el acto ya cerrado.
- `entrada.test.tsx`: la segunda fila enseña el modelo; ocupada también.
- `sidebar.test.tsx`: `pie()` en sus tres variantes (con tope, sin tope, contexto 0);
  el logotipo aparece con 120 columnas y no con 80; `proyecto:rama` y `xonecode 0.3.0`
  siguen presentes; sin rama, solo el proyecto. Se actualizan las aserciones de cadena
  exacta que cambian (`lineaDeEstado` desaparece).
- `logo.test.ts`: todas las filas del logotipo tienen la misma anchura y ninguna supera
  28 columnas (la sidebar mide 30).
- `app.test.tsx`: la maqueta ENTERA con una altura conocida (stdout falso de 24 filas, sin
  TTY; `ink-testing-library` no vale porque fija `columns` y no expone `rows`). En reposo,
  con prompt largo, con pista de Tab, con el transcript lleno y colchón vivo, ocupado y a
  80 columnas: el frame mide 23 filas, el pie y `● xonecode` cierran la última y el cursor
  `▏` (o «turno en curso») sigue en pantalla.
- `frontera.test.ts` no cambia: `logo.ts` no importa ink.

## Riesgos asumidos

- **El umbral de 100 columnas es un número a ojo.** Si molesta, se ajusta en un sitio.
- **El ámbar de fase no es color XOne.** Es el único tono cálido de la paleta y existe
  para que la fase no se confunda con el texto mudo; queda declarado como token de TUI.
- **El anclaje al fondo (`flexGrow` + separador elástico) depende de que la columna tenga
  altura fija**, que `App` le da con `height={rows - 1}`. Probado con un frame de altura
  conocida (`sidebar.test.tsx`) y montando `App` entera (`app.test.tsx`).
- **Una fila de reserva por el borrado total de Ink.** Ink repinta con `clearTerminal` el
  frame entero cuando su altura alcanza `stdout.rows`. La fila de columnas mide `rows - 1`
  para que el frame normal quede por debajo y el repintado sea incremental.
- **El modal de aprobación supera `rows` mientras está abierto.** Se monta debajo de la
  fila de columnas (diseño de la spec base), así que en ese estado Ink pinta por el camino
  del borrado total. Ya pasaba cuando el transcript estaba lleno; con la fila anclada pasa
  siempre que hay modal. Se asume; rehacer dónde se monta el modal es otro cambio.
