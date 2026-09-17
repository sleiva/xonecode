import { defineConfig } from "vitest/config";

/**
 * No había config a propósito (los valores por omisión bastaban), y eso tenía un coste
 * medido: el `include` por omisión barre TODO el repo, y `.worktrees/` —ignorado por git
 * pero presente en disco— no está en el `exclude` por omisión. Con un worktree viejo ahí,
 * `npm test` corría 128 ficheros en vez de 66.
 *
 * Ahora hace falta de verdad: el cliente web necesita `jsdom` y el host necesita `node`,
 * y eso no se puede expresar sin config.
 *
 * Y una tercera cosa: **`setupFiles` muda la casa del usuario a un temporal**, en los DOS
 * proyectos. Sin eso, correr los tests le reescribía a quien los corre su
 * `~/.xonecode/agentes/` — el porqué entero está en `src/casaDePruebas.ts`, y `src/gate.test.ts`
 * comprueba que sigue declarado aquí.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "host",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
          environment: "node",
          setupFiles: ["./src/casaDePruebas.ts"],
        },
      },
      {
        test: {
          name: "cliente",
          include: ["apps/web/**/*.test.ts", "apps/web/**/*.test.tsx"],
          exclude: ["**/node_modules/**", "**/dist/**"],
          environment: "jsdom",
          // También aquí: el cliente no lee la casa hoy, pero la regla es del SUITE y no de
          // una mitad — un proyecto exento es por donde vuelve.
          setupFiles: ["./src/casaDePruebas.ts"],
          // `MarkdownText` (`@deepseek-ai/dsh-client-ui-primitives`) importa
          // `katex/dist/katex.min.css` como efecto de carga. Externalizado (el trato por
          // omisión para node_modules), Node intenta resolverlo con su loader nativo y
          // revienta con «Unknown file extension ".css"» — no es un fallo del paquete,
          // es que sin esto Vitest nunca le pasa ese import por Vite, que sí sabe mockear
          // CSS en modo test. Basta con inlinear ESTE paquete (no `katex` en sí, probado
          // por separado: sin su entrada aquí la suite sigue en verde) — el import de la
          // hoja de estilos vive DENTRO de `dsh-client-ui-primitives`, así que forzar SU
          // transformación por Vite ya le pasa ese `.css` por el pipeline que sabe
          // mockearlo, sin tener que inlinear también a quien lo publica.
          server: { deps: { inline: [/@deepseek-ai\/dsh-client-ui-primitives/] } },
        },
      },
    ],
  },
});
