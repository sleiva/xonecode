# El estilo es un SISTEMA: pega los tokens, elige un carácter

Este fichero era una lista de consejos y se incumplía entera. Medido en un panel real
(2026-09-01): decía «evita Inter» y salió `Inter`; decía «evita los morados» y salieron índigo
`#6366f1` + púrpura + rosa; decía «una escala» y salieron cuatro radios sueltos; y cero
variables CSS. **Un consejo no es un sistema**: lo que sigue se pega y se acabó.

## Los tokens, y el tema en TRES bloques

**El de por omisión**, elegido por el usuario el 2026-09-01: fondo casi blanco frío, tinta negra
azulada, acento azul petróleo y el **cuerpo en SERIF**, que es lo que le quita la cara de
plantilla. Pega el bloque tal cual y no uses ningún color más.

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root {
  --ground:#f6f8fa; --surface:#ffffff; --surface-2:#eef2f6;  /* página / tarjeta / elevado */
  --ink:#151a21; --ink-soft:#4e5a68; --rule:#d7dee6;         /* texto / apoyo / separador  */
  --accent:#0e6c88; --accent-soft:#d9edf4;                   /* SOLO lo que actúa o mide   */
  --alerta:#8d3b2d; --alerta-soft:#f5e3df;                   /* lo retirado, lo que falla  */
  --display:'Archivo','Helvetica Neue',Arial,sans-serif;
  --body:'IBM Plex Serif',Georgia,serif;
  --mono:'IBM Plex Mono','SF Mono',Menlo,monospace;
  --radius:6px;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --ground:#11151a; --surface:#171c23; --surface-2:#1e242c;
  --ink:#e5e9ef; --ink-soft:#9aa7b6; --rule:#2c343e;
  --accent:#58b6d2; --accent-soft:#16323d; --alerta:#d98a7b; --alerta-soft:#35211d;
} }
:root[data-theme="dark"] { /* las MISMAS seis líneas de arriba, repetidas */ }
body { background:var(--ground); color:var(--ink); font-family:var(--body);
       font-size:17px; line-height:1.65; margin:0; }
</style>
```

**Los tres bloques son tres ESTADOS y hacen falta los tres**: el visor puede no decir nada (gana
`prefers-color-scheme`), decir `data-theme="dark"` o decir `data-theme="light"` — y sin el
`:not([data-theme="light"])` un visor en claro dentro de un sistema oscuro sale oscuro. **Ningún
color puede tener su única definición dentro de un `@media`.**

Con Tailwind se usan tal cual: `bg-[var(--surface)]`, `text-[var(--ink-soft)]`,
`border-[var(--rule)]`, `rounded-[var(--radius)]`, `font-[var(--display)]`. Y el diagrama se
pinta con estos MISMOS tokens: `reference/diagramas.md`, sección del tema.

## El cuerpo en SERIF, los titulares en sans, los identificadores en mono

`IBM Plex Serif` a **17px / 1.65** para leer, `Archivo` para titulares y `IBM Plex Mono` para lo
que es un identificador (`app.xml`, `MAP_BT_MENU`, nombres de coll). Esa mezcla es lo contrario
del defecto —todo en Inter a 14px— y es la mitad del carácter.

Otros caracteres, si el contenido pide otra cosa. **Se toma la fila ENTERA:**

| carácter | display / cuerpo / mono | acento | radio |
|---|---|---|---|
| **documento** (el de arriba) | Archivo / IBM Plex Serif / IBM Plex Mono | `#0e6c88` petróleo | `6px` |
| **instrumento** | IBM Plex Sans / IBM Plex Sans / IBM Plex Mono | `#0f766e` teal | `4px` |
| **cuadro de mando** | Space Grotesk / Public Sans / IBM Plex Mono | `#1d4ed8` tinta | `10px` |

**Ninguna es Inter y ningún acento es índigo ni púrpura**, que es la otra mitad.

## El ancho: la PÁGINA no lleva `max-width`

**El artifact se pinta en un panel, no en una ventana de navegador**, y su ancho lo decide quien
mira — puede ser 1.700 px. Un `max-w-7xl mx-auto` en el contenedor exterior (que es lo que sale
por defecto) son **1.280 px centrados**: en ese panel deja **460 px de margen muerto** a los
lados, con el diagrama encogido en medio. Medido sobre un panel real, 2026-09-01.

- **Nada de `max-w-*` ni `mx-auto` en el envoltorio de la página.** Se respira con `padding`
  (`p-6 md:p-8`), no estrechando.
- **La MEDIDA se limita solo en la PROSA**, que es donde de verdad importa: `max-w-prose` en los
  párrafos largos. Una tabla, un diagrama o una rejilla de tarjetas quieren todo el ancho.
- **Y el SVG de un diagrama tiene que poder CRECER**: mermaid le pone un `max-width` propio que
  lo deja a su tamaño natural. Ver `reference/diagramas.md`.

## Tres reglas duras

1. **UN radio por panel**, el de la fila que hayas elegido. La excepción única es `rounded-full`
   para pastillas y avatares. Cuatro radios en una página es la firma de que nadie decidió.
2. **El acento SOLO para lo que actúa o mide**: el botón que se pulsa, la barra que crece, el
   nodo activo. Si el título, los iconos y las etiquetas van del color de acento, no destaca
   nada — y ése es el aspecto de plantilla que se intenta evitar.
3. **El fondo se PINTA, siempre y explícito** (`background: var(--ground)` en `body`). El visor
   pinta su propio fondo detrás, así que un `body` transparente hereda el tema del anfitrión y
   el texto puede acabar ilegible.

**Y no pongas un INTERRUPTOR de tema.** Los tres bloques de arriba ya cubren los tres estados,
así que no hace falta — y recordar la elección pide `localStorage`, que **LANZA** en el sandbox
del visor y se lleva el bloque `<script>` entero: la página se ve perfecta y el diagrama no
llega a dibujarse. El validador rechaza el artifact si lo encuentra.

## Y lo de siempre

Una jerarquía de TRES tamaños y sostenerla · alineación a la izquierda salvo motivo (centrarlo
todo es la marca de fábrica) · espaciado 4/8/16/24 y nada entre medias · densidad al servicio
del dato: una tabla de 40 filas legible vale más que 6 tarjetas enormes con tres cifras.
