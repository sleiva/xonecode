# Diagramas de flujo

Mermaid desde cdnjs. Sin red: el diagrama es texto dentro de la página. **Éste es el montaje
canónico** — copia el bloque entero, no la mitad:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.0/mermaid.min.js"></script>
<pre class="mermaid">
flowchart LR
  Login["LoginRest (login-coll)"] --> Entry["VisitasClientes_v2 (entry-point)"]
  Entry --> Q{"¿Cliente nuevo?"}
  Q -->|"Sí"| Alta["Clientes.xne"]
  Q -->|"No"| DB[("gestion.db")]
</pre>
<style>
  .mermaid { width: 100%; overflow-x: auto; }
  .mermaid svg { width: 100%; height: auto; max-width: none; }
</style>
<script>
  mermaid.initialize({
    startOnLoad: true,
    theme: "base",                       // el ÚNICO que acepta themeVariables
    themeVariables: {
      primaryColor:       "#ffffff",     // relleno del nodo   → --surface
      primaryTextColor:   "#151a21",     // texto del nodo     → --ink
      primaryBorderColor: "#d7dee6",     // borde              → --rule
      lineColor:          "#4e5a68",     // flechas            → --ink-soft
      secondaryColor:     "#eef2f6",     // fondo de subgrafos → --surface-2
      tertiaryColor:      "#d9edf4",     // lo acentuado       → --accent-soft
      fontFamily:         "'IBM Plex Serif', Georgia, serif",
      fontSize:           "15px",
    },
    flowchart: { curve: "basis", nodeSpacing: 40, rankSpacing: 55, padding: 12 },
  });
</script>
```

## Por qué ese bloque y no el de por omisión

Los defectos de mermaid pintan **nodos amarillo pastel con borde marrón, en escuadra y
apelotonados**: el diagrama parece de otro producto que el panel que lo rodea. Comprobado en un
navegador con 10.9.0, con el bloque de arriba el relleno del nodo sale `#ffffff`, el borde
`#d7dee6` y las flechas `#4e5a68` — o sea **los mismos tokens que el panel** (`estilo.md`).

- **`theme: "base"`**: con `default`, `dark` o `neutral`, `themeVariables` **se ignora**.
- **`curve: "basis"`**: aristas curvas en vez de en escuadra. El cambio de una línea que más
  aire da.
- **`nodeSpacing`/`rankSpacing`**: los defectos (15/50) aprietan; 40/55 respira.
- **Los colores van A MANO, no como `var(--x)`**: mermaid los escribe dentro del SVG y no
  resuelve variables CSS. Con tema oscuro, pásale el juego oscuro cuando
  `matchMedia('(prefers-color-scheme: dark)').matches`.
- **Las dos líneas del `<style>`**: `overflow-x` en el BLOQUE (la página no debe scrollear en
  horizontal) y `max-width: none` en el SVG, porque mermaid le escribe su tamaño natural y sin
  eso se queda pequeño y centrado en un panel ancho.

## LO PRIMERO: toda etiqueta con `(` va ENTRE COMILLAS

Un paréntesis sin comillas es un error de SINTAXIS y **se lleva el diagrama entero**: la página
carga perfecta y en su sitio sale «Syntax error in text». Medido con `mermaid.parse`, y **en
10.9.0 y en 11.15.0 igual** — no es cosa de la versión:

| lo que escribes | |
|---|---|
| `A[Mapeos (mapcol)]` | **ROMPE** |
| `A["Mapeos (mapcol)"]` | ✓ |
| `subgraph Vistas (contents)` | **ROMPE** |
| `subgraph S1 [Vistas (contents)]` | **ROMPE** — los corchetes NO salvan |
| `subgraph "Vistas (contents)"` | ✓ |
| `A[(Tabla (usuarios))]` | **ROMPE** · `DB[("Tabla (usuarios)")]` ✓ |

Y lo que **NO** rompe, comprobado igual: almohadillas (`A[Salida ##EXIT##]`), puntos
(`A[LoginColl.xne]`), acentos, `:`, `@` y texto en las flechas — las almohadillas se han acusado
en falso DOS veces. En un proyecto XOne los nombres traen paréntesis solos (`(mapcol)`,
`(contents)`, `(entry-point)`), así que la regla práctica es **comillas siempre**.

## Si el diagrama va en una PESTAÑA, `startOnLoad: true` lo deja en blanco

**Fallo real, medido**: dentro de un contenedor oculto mermaid produce un SVG de **0×0** y no
vuelve a dibujar al mostrarlo (visible al cargar da 563×427). El usuario ve un hueco y la
consola no dice nada. Con pestañas, acordeones o `<details>` cerrados: **`startOnLoad: false`, y
dibujar DESPUÉS de mostrar**.

```js
const dibujados = new WeakSet();
async function mostrarPestana(panel) {
  panel.style.display = 'block';                  // primero VISIBLE
  for (const nodo of panel.querySelectorAll('.mermaid')) {
    if (dibujados.has(nodo)) continue;            // una sola vez por nodo
    dibujados.add(nodo);
    await mermaid.run({ nodes: [nodo] });         // y AHORA se dibuja
  }
}
```

De `0×0` a `278×105`. Tres detalles: **el orden no es negociable** (`display: block` ANTES de
`mermaid.run`; al revés vuelve a dar 0×0) · **`run({ nodes: [...] })` y no `run()` a secas**
(sin `nodes` reprocesa la página entera) · **una sola vez por nodo** (mermaid sustituye el
`<pre>` por el SVG, así que un segundo pase no tiene texto que parsear).

Diagnóstico rápido: «Syntax error in text» → un paréntesis sin comillas. Hueco en blanco SIN
error → el contenedor oculto. Nunca las almohadillas.
