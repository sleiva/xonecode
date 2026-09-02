# Gráficas interactivas

Chart.js desde cdnjs, versión fijada. Los datos van horneados: no hay red.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
<canvas id="ventas"></canvas>
<script>
  const DATOS = [/* horneado en tiempo de generación */];
  new Chart(document.getElementById('ventas'), {
    type: 'bar',
    data: { labels: DATOS.map(d => d.mes), datasets: [{ data: DATOS.map(d => d.total) }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
</script>
```

**Interactividad sin red:** filtra el array en memoria y llama a `chart.update()`. Todo el
dataset ya está en la página.

**Tema:** lee `window.matchMedia('(prefers-color-scheme: dark)')` y pásale los colores a
`options.scales` y `options.plugins.legend.labels.color`.
