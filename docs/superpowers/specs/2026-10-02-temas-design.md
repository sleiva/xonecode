# Temas de la consola web: un juego por modo

**Fecha:** 02-10-2026 · **Alcance:** solo el cliente web (`apps/web/`) · **Estado:** diseño aprobado, pendiente de plan

## Qué se pide

Hoy la consola web tiene un **modo** (sistema / claro / oscuro, `apariencia.ts`) y una sola paleta por modo. Se
quiere, además del modo, elegir un **tema** —la familia entera de superficies, texto y acento, al estilo de Nord o
Solarized— de un juego para el claro y otro para el oscuro. El modo decide cuál de los dos temas elegidos está en
vigor.

## El juego

El tema base se llama **XOneCode**, en los dos modos, y es el de omisión. Los otros tres de cada modo son los más
instalados del Marketplace de VS Code (categoría Themes, medido el 02-10-2026, quitando packs de iconos y de
lenguaje):

| Modo | Temas |
|---|---|
| Oscuro | XOneCode · GitHub Dark · One Dark · Dracula |
| Claro | XOneCode · GitHub Light · One Light · Ayu Light |

Cifras de la medida: GitHub Theme 20,2 M (pack mixto), One Dark Pro 12,8 M, Dracula 11,0 M, Ayu 4,2 M (pack mixto),
Atom One Light 1,45 M (el único claro sin pack). Los temas que trae VS Code (Solarized, Monokai, Dark Modern) no
tienen cifra de instalaciones y por eso no compiten en esta cuenta. Los colores de cada tema salen de su paleta
oficial publicada (GitHub Primer, One Dark/Light, Dracula, Ayu).

## Cómo está construido hoy (lo que el diseño respeta)

- `apariencia.ts` pone o quita `data-ds-dark-theme` en el `body`; el modo se guarda en `localStorage`
  (`xonecode.apariencia`). El conmutador está en la cabecera (`Cabecera.tsx`).
- La paleta base es `estilos/design-platform.css` (copiada de deepseek): ~78 alias `--dsw-alias-*` por modo, de los
  que la interfaz usa **46**.
- `estilos/marca.css` redefine los alias de acento con los colores de XOne y declara los `--xonecode-*` (33 en uso).
  Ningún `.module.css` lleva un color literal (`componentes/Barra.test.tsx`).
- El resaltado de código va por variables `--shiki-token-*` (`estilos/shiki.css`, tema `css-variables` de shiki).
- Cuelgan además del modo: `scrollbar.css`, `gradient-shadow-text.css`, la regla de borde de `Compositor.module.css`
  y el `?tema=claro|oscuro` del visor de OpenUI (`Artefactos.tsx#useTemaDeLaConsola`).

## Diseño

### 1. El catálogo es DATOS puros — `apps/web/src/temas.ts`

```ts
type ModoDeTema = "claro" | "oscuro";
interface Tema {
  id: string;            // slug único: "xonecode-claro", "github-oscuro", "dracula"…
  nombre: string;        // lo que se pinta: "GitHub Dark"
  modo: ModoDeTema;
  semillas?: Semillas;   // AUSENTE solo en XOneCode (ver §2)
}
```

**Las semillas** son 24 colores con significado:

- **15 de interfaz**: `fondo`, `capa1`, `capa2`, `capa3`, `texto`, `texto2`, `texto3`, `borde`, `acento`,
  `sobreAcento`, `peligro`, `exito`, `aviso`, `negocio` y `sombra` (el color del velo de los diálogos y de la sombra
  de la caja: oscuro en TODOS los temas, porque un velo claro sobre un tema claro no separa nada).
- **9 de código**, que alimentan los `--shiki-token-*`: `palabraClave`, `cadena`, `funcion`, `comentario`,
  `constante`, `parametro`, `puntuacion`, `enlace`, `expresionDeCadena`.

`TEMAS` es la lista cerrada; `temasDe(modo)` devuelve los de un modo en orden (XOneCode primero), y
`temaPorId(id, modo)` devuelve el tema si existe Y es de ese modo, si no XOneCode de ese modo.

`temas.ts` es la **excepción declarada** a «ningún color literal», como `marca.css` y `splash.css`.

### 2. XOneCode NO pasa por el puente

XOneCode no lleva semillas. Aplicarlo es QUITAR `data-tema` y las variables `--tema-*`: queda la cascada de hoy
(`design-platform.css` + `marca.css` + `shiki.css`) intacta. «Se ve exactamente como hoy» queda garantizado por
construcción, no por haber copiado bien unos valores. Es el tema de omisión en los dos modos.

### 3. El puente — `apps/web/estilos/temas.css`

Una regla `body[data-tema] { … }` que deriva de las semillas:

- los **46 alias `--dsw-alias-*` en uso** (superficies, texto, bordes, estados, interactivo, markdown, scrollbar,
  botones flotantes y elevados);
- los **`--xonecode-*` que llevan color**: `cian`, `cian-oscuro`, `azul`, `azul-hondo` → `acento` (y derivados);
  `sobre-azul` → `sobreAcento`; `rojo`, `verde` → `peligro`, `exito`; `velo`, `fila-elegida`, `fila-hover`,
  `borde-azul`, `sombra-caja` y el acento de la barra lateral (`--dsw-specific-sidebar-nav-item-active-accent`);
- los **`--shiki-token-*`** y `--shiki-background` / `--shiki-foreground`;

Los tintes (hover, fondos de peligro/éxito, bordes suaves, fila elegida) se sacan con `color-mix` de la semilla, como
ya hace `marca.css` con el rojo. El fichero **no lleva ningún color literal**: solo `var(--tema-*)`, `color-mix` y la
palabra `transparent` como segundo color de un `color-mix` (sin ella no hay tinte translúcido).

**Los derivados se REDECLARAN en el puente** (`--xonecode-rojo-fondo`, `-verde-fondo`, `-fila-elegida`, `-fila-hover`,
`-sombra-caja`, `--shiki-foreground`/`-background`): `marca.css` y `shiki.css` los declaran en `:root`, y una custom
property con `var()` se resuelve en el elemento donde se DECLARA y se hereda ya resuelta, así que cambiar la semilla en
el `body` no los alcanzaría.

**Lo que no se toca**: los dos colores del gráfico de gasto (`--xonecode-gasto-*`), validados con el skill `dataviz`
contra el fondo de cada modo, y las variables del splash.

`temas.css` se carga DESPUÉS de `marca.css`, `shiki.css` y `gradient-shadow-text.css`, y su selector
(`body[data-tema]`) tiene igual o más especificidad que `body[data-ds-dark-theme]`, para que gane en los dos modos.

La regla de `Compositor.module.css` (`:global([data-ds-dark-theme]) .compositor { border-color: … }`) se repasa
para que, con un tema puesto, el borde salga del tema y no del azul de XOne.

Los ~32 alias que la interfaz NO usa no se redefinen: el test de §8 es quien vigila que eso siga siendo verdad.

### 4. Aplicarlo — `apariencia.ts`

`aplicarApariencia(apariencia, temas, cuerpo)` ya decide el modo en vigor (con «sistema», por
`prefers-color-scheme`). Ahora, además:

1. toma el tema elegido para ESE modo (`temas.claro` / `temas.oscuro`, resuelto con `temaPorId`);
2. si es XOneCode, quita `data-tema` y cada `--tema-*` del `style` del `body`;
3. si no, pone `data-tema="<id>"` y escribe cada semilla como `--tema-<nombre>` en el `style` del `body`.

El cambio de sistema claro↔oscuro (el `matchMedia` que ya escucha `App.tsx`) reaplica, así que el tema cambia con el
modo. `data-ds-dark-theme` se sigue poniendo como hoy: lo leen `Artefactos.tsx`, `scrollbar.css` y los tests.

### 5. Los selectores — Ajustes, pestaña General, sección «Temas»

- Dos filas: **Tema claro** y **Tema oscuro**, cada una con sus cuatro opciones.
- Cada opción es una **muestra** (fondo, una línea de texto y una pastilla de acento del tema) con su nombre debajo.
  La muestra pinta con los colores del tema por `style` en línea con variables (`--muestra-fondo`…), no con colores
  en el `.module.css`.
- Es un grupo de botones con `aria-pressed`, el patrón de `SelectorDeModo.tsx`; pulsar el ya elegido no hace nada.
- Elegir guarda y reaplica. Si la fila no es la del modo en vigor, se guarda y la fila DICE «se aplica cuando la
  consola esté en oscuro» (o «en claro»), para que elegir sin ver un cambio no parezca que no ha hecho nada.
- El conmutador de modo de la cabecera no cambia.

El estado vive donde vive hoy el de la apariencia (`App.tsx`, no el store), y Ajustes lo recibe por props
(`temas`, `alCambiarTema(modo, id)`). **Ausente = no se pinta la sección**, como el resto de controles sin dato.

### 6. Lo que se guarda

`localStorage`, como el modo: `xonecode.tema.claro` y `xonecode.tema.oscuro`. Es de ESTE navegador, no de la cuenta
ni del proyecto. Todo acceso va en `try` (`leerTemas`/`guardarTema` junto a `leerApariencia`). Un id que no está en
el catálogo, o que es de otro modo, se lee como XOneCode.

### 7. Límites declarados

- **El visor de OpenUI** recibe por `?tema=` solo `claro`/`oscuro`, y se queda con la paleta XOneCode de ese modo.
  Pasarle el tema entero es otro trabajo.
- **Los artefactos HTML** no cambian: son del agente, no de la consola.
- **El splash** sigue con la marca: es la presentación de XOne, no una superficie de trabajo.
- **El parpadeo al cargar**: el tema se aplica en el primer efecto de `App`, igual que hoy el modo oscuro; no se
  añade un script en el `index.html` para adelantarlo.

### 8. Tests (vitest, proyecto `cliente`, `jsdom`)

- **`temas.test.ts` — contraste WCAG** de cada tema con semillas, contra su propio `fondo`, `capa1` y `capa2`:
  `texto` y `texto2` ≥ 4,5:1; `texto3` ≥ 3:1; `sobreAcento` sobre `acento` ≥ 4,5:1; `peligro`, `exito`, `aviso` ≥ 3:1
  sobre `fondo`. El fallo nombra el tema y el par. Un tema que no llegue se corrige en su semilla, sin rebajar el
  umbral.
- **Completitud**: cada tema con semillas trae las 24; los ids son únicos; `temasDe(modo)` devuelve cuatro por modo
  con XOneCode primero; `temaPorId` cae en XOneCode con un id desconocido o de otro modo.
- **El puente cubre lo que se usa**: recorre todos los `.css` y `.module.css` del cliente (`estilos/` y `src/`), saca
  cada `var(--dsw-alias-…)` y exige que `temas.css` lo redefina. Un alias nuevo que el puente no conozca da rojo.
  Lo mismo para `var(--shiki-token-…)`.
- **`temas.css` sin literales**: ningún `#hex`, `rgb(`, `hsl(` ni nombre de color, salvo `transparent` dentro de un
  `color-mix`.
- **`apariencia.test.ts`**: XOneCode → sin `data-tema` y sin `--tema-*`; otro → atributo y las 24 variables; cambiar
  de modo cambia el tema; un `localStorage` que lanza no tumba nada y lee XOneCode.
- **Ajustes**: las dos filas con sus cuatro opciones, la elegida con `aria-pressed="true"`, elegir llama a
  `alCambiarTema(modo, id)`, la línea de «se aplica cuando…» sale solo en la fila que no está en vigor, y sin
  `temas` no se pinta la sección.

**Alias que se usan y NO existen** (censo hecho al planificar): `border-primary`, `bg-secondary`, `border-secondary`,
`text-secondary`, `text-tertiary`, `state-warning-primary`/`-tertiary` (el nombre real es `warn`) y `fill-tsp-secondary`
(solo en un comentario). Hoy resuelven a nada: bordes que no se pintan, fondos transparentes, letra heredada. Se
arreglan en un commit APARTE y ANTES del puente, apuntando cada uno a su alias real, con un test que exige que todo
alias usado esté definido (o lleve fallback, como `font-mono`). **Esto cambia lo que se ve en XOneCode** en esos
sitios: es un arreglo, no parte de los temas. `--dsw-alias-que-no-existe` es del propio `Barra.test.tsx` y se queda.

### 9. Verificación al acabar

`npm run typecheck` y `npm test` en verde, y **en el navegador** (`npm run web`) los ocho temas uno a uno: chat con
un bloque de código, barra lateral, Ajustes, el compositor, un diálogo con velo y una tarjeta de aprobación. Un test
de contraste no ve un borde que desaparece.

## Ficheros

| Fichero | Cambio |
|---|---|
| `apps/web/src/temas.ts` + `.test.ts` | nuevo: catálogo, semillas, `temasDe`, `temaPorId`, contraste |
| `apps/web/estilos/temas.css` | nuevo: el puente |
| `apps/web/src/main.tsx` | importar `temas.css` después de las hojas que pisa |
| `apps/web/src/apariencia.ts` + `.test.ts` | aplicar el tema del modo en vigor; leer/guardar los dos temas |
| `apps/web/src/App.tsx` | estado de los temas junto al de la apariencia; props a Ajustes |
| `apps/web/src/componentes/Ajustes.tsx` + `.module.css` + test | sección «Temas» en General |
| `apps/web/src/componentes/SelectorDeTema.tsx` + `.module.css` | nuevo: una fila de muestras |
| `apps/web/src/componentes/Compositor.module.css` | el borde oscuro no pisa al tema |
| `apps/web/src/componentes/Barra.test.tsx` | `temas.ts` en la excepción si el test lo recorre |
| `CLAUDE.md` | una viñeta en «La consola web» |
