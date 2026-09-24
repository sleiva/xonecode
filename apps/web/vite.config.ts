import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: el host sirve dist/ desde la raíz y no hay CDN detrás.
  base: "./",
  // El aviso de «más de 500 kB» pide partir el bundle para una red lenta, y esta consola se
  // sirve en loopback: la aplicación entera pesa ~1,2 MB y cargarla a trozos no ahorra nada.
  // El límite queda por encima de lo de hoy, para que un salto de verdad SÍ avise.
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
