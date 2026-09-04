import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../estilos/base.css";
import "../estilos/design-platform.css";
import "../estilos/corner-shape.css";
import "../estilos/scrollbar.css";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
