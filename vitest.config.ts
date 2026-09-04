import { defineConfig } from "vitest/config";

/**
 * No había config a propósito (los valores por omisión bastaban), y eso tenía un coste
 * medido: el `include` por omisión barre TODO el repo, y `.worktrees/` —ignorado por git
 * pero presente en disco— no está en el `exclude` por omisión. Con un worktree viejo ahí,
 * `npm test` corría 128 ficheros en vez de 66.
 *
 * Ahora hace falta de verdad: el cliente web necesita `jsdom` y el host necesita `node`,
 * y eso no se puede expresar sin config.
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
        },
      },
      {
        test: {
          name: "cliente",
          include: ["apps/web/**/*.test.ts", "apps/web/**/*.test.tsx"],
          exclude: ["**/node_modules/**", "**/dist/**"],
          environment: "jsdom",
        },
      },
    ],
  },
});
