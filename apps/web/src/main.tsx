import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Las dos caras de la marca, EMPAQUETADAS y no traídas de un CDN. No es purismo: esta
// consola escucha en loopback y tiene un modo `offline` de primera clase (`config.json`,
// `modo: "offline"`), así que una hoja de fonts.googleapis.com la dejaría sin su propia
// letra justo en el caso que el producto declara soportar — y de paso le contaría a Google
// cada arranque de una herramienta local. Van las PRIMERAS porque solo declaran `@font-face`
// y no pintan nada: quien las aplica es `tipografia.css`, la última de la lista.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "../estilos/base.css";
import "../estilos/design-platform.css";
import "../estilos/corner-shape.css";
import "../estilos/scrollbar.css";
// Las variables del splash de arranque (`componentes/Splash.tsx`, `componentes/Marca.tsx`),
// aparte de `design-platform.css` a propósito: no son tokens de la paleta copiada, son
// el diseño de marca propio de xonecode — ver `splash.css` para el porqué.
import "../estilos/splash.css";
// NUESTRA, y ANTES que nada que la use: la paleta de marca de xonecode y el puente que mete
// su acento en los alias `--dsw-alias-*` que pinta todo lo demás. Va después de
// `design-platform.css` a propósito — redefine tres de sus alias, y para eso tiene que
// llegar la última de las dos.
import "../estilos/marca.css";
// Los `--shiki-*` que las vallas de código resaltadas usan (`CodeBlock`, vía
// `MarkdownText` en `Chat.tsx`): sin este fichero el tema de shiki no tiene de dónde
// leer color y el texto resaltado sale con lo que el navegador herede, no con la
// paleta que `shiki.css` ya trae copiada para esto (Task 13b).
import "../estilos/shiki.css";
// NUESTRA: el cromo de lo que monta el renderizador de markdown del paquete —el botón de
// copiar de las vallas y el cuerpo de un documento—, sin ámbito de módulo, porque lo usan
// el chat y la pestaña Ficheros. Después de `marca.css`, de donde sale el icono de copiar
// como máscara.
import "../estilos/markdown.css";
// NUESTRA, y la ÚLTIMA a propósito: aplica al documento los tokens de tipografía que las
// hojas copiadas solo declaran. Sin ella la interfaz entera sale en serif — medido.
import "../estilos/tipografia.css";
import { crearStoreDelCliente } from "./store.js";
import { crearConexion } from "./conexion.js";
import { App } from "./App.js";

// El único sitio de todo el cliente que construye un `EventSource` de verdad: `App.tsx`
// recibe `store` y `enviar` ya hechos, precisamente para que un test que algún día monte
// `App` en jsdom (que no implementa `EventSource`, medido en `conexion.ts`) no tenga que
// pasar por aquí.
const store = crearStoreDelCliente();
const conexion = crearConexion(store);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App store={store} enviar={conexion.enviar} subirAdjunto={conexion.subirAdjunto} mirar={conexion.mirar} />
  </StrictMode>,
);
