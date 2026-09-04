import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../estilos/base.css";
import "../estilos/design-platform.css";
import "../estilos/corner-shape.css";
import "../estilos/scrollbar.css";
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
