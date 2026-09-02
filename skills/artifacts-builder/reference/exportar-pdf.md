# Exportar a PDF

**La vía sencilla y fiable: `window.print()` con CSS de impresión.** No necesita librería, y el
widget de NappAI pinta el artifact en un iframe con `allow-modals`, que es lo que permite abrir
el diálogo de impresión desde dentro.

```html
<button class="no-imprimir" onclick="window.print()">Exportar a PDF</button>
<style>
  @media print {
    .no-imprimir { display: none; }
    body { background: #fff; color: #000; }
    .pagina { break-inside: avoid; }
  }
  @page { margin: 15mm; }
</style>
```

El usuario elige «Guardar como PDF» en el diálogo del navegador.

## Si el artifact tiene varias vistas, exporta SOLO la que se está viendo

Un panel con pestañas no debe imprimir las pestañas ocultas: salen paginas en blanco o, peor,
contenido que el usuario no estaba mirando. Marca lo imprimible y esconde el resto:

```html
<section class="vista" data-vista="resumen">…</section>
<section class="vista" data-vista="detalle" hidden>…</section>

<style>
  @media print {
    /* Solo la vista visible llega al PDF. */
    .vista[hidden] { display: none !important; }
    nav, .filtros, .no-imprimir { display: none; }
  }
</style>
```

Si una vista **no** tiene sentido en papel —un mapa interactivo, un formulario— dilo en la
interfaz en vez de imprimirla mal: deshabilita el botón para esa vista, o añade un
`@media print` que la sustituya por una nota corta.

## Antes de dar el botón por bueno

- **Las gráficas se imprimen desde el canvas ya pintado.** Si la librería redibuja al cambiar el
  tamaño, escucha `beforeprint` y fuerza un `resize`/`update`; si no, el PDF sale con la gráfica
  del tamaño anterior.
- **Los colores de fondo se pierden.** El navegador no imprime fondos por omisión. Para una
  tabla con filas alternas o un badge de color, usa `print-color-adjust: exact` en ese elemento.
- **Nada de `position: fixed`** en lo que deba salir: se repite o desaparece.

## Si generas el fichero desde JavaScript

jsPDF o html2pdf desde cdnjs. Ten en cuenta que la descarga dentro del iframe depende de
`allow-downloads`, que el widget sí pone. Aun así `window.print()` falla en menos sitios y no
gasta presupuesto del tope de 5 MB en una librería.
