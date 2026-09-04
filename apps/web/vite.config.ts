import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: el host sirve dist/ desde la raíz y no hay CDN detrás.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});
