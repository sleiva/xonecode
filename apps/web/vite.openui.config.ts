import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * El build del VISOR de artefactos OpenUI (`src/openui/visor.tsx`), APARTE del de la aplicación:
 * un solo `visor.js` autoejecutable y su `visor.css`, que el servidor incrusta en el documento
 * de cada `.openui` (`web/servidor/visorOpenui.ts`). Va a `dist/openui/` sin vaciar `dist/`, que
 * es donde el build de la aplicación ya dejó lo suyo.
 *
 * **Sin telemetría**: la de runtime de `@openuidev/lang-core` es opcional y no se enciende sin
 * `OPENUI_RUNTIME_TELEMETRY_ENABLED`, que en un navegador no existe; y `process.env` se reduce a
 * `NODE_ENV` para que ninguna otra variable del entorno de build acabe dentro del bundle.
 */
export default defineConfig({
  plugins: [react()],
  // Sin la carpeta pública de la aplicación: sus iconos no son del visor.
  publicDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
  build: {
    outDir: "dist/openui",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: "src/openui/visor.tsx",
      formats: ["iife"],
      name: "XonecodeVisorOpenui",
      fileName: () => "visor.js",
    },
    rollupOptions: { output: { assetFileNames: "visor.[ext]" } },
  },
});
