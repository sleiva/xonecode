import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../estilos/base.css";
import "../estilos/design-platform.css";
import "../estilos/corner-shape.css";
import "../estilos/scrollbar.css";
// Las variables del splash de arranque (`componentes/Splash.tsx`, `componentes/Marca.tsx`),
// aparte de `design-platform.css` a propósito: no son tokens de la paleta copiada, son
// el diseño de marca propio de xonecode — ver `splash.css` para el porqué.
import "../estilos/splash.css";
// Los `--shiki-*` que las vallas de código resaltadas usan (`CodeBlock`, vía
// `MarkdownText` en `Chat.tsx`): sin este fichero el tema de shiki no tiene de dónde
// leer color y el texto resaltado sale con lo que el navegador herede, no con la
// paleta que `shiki.css` ya trae copiada para esto (Task 13b).
import "../estilos/shiki.css";
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
    <App store={store} enviar={conexion.enviar} />
  </StrictMode>,
);
