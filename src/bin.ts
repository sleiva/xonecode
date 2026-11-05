#!/usr/bin/env node
import { relanzarConNodeDeRedLocal } from "./agent/config/nodeDeRedLocal.js";

// En un Mac, XOneCode corre con un node envuelto en una app para poder llegar a la red local (la granja): ver
// `core/nodeDeRedLocal.ts`. Va ANTES de cargar nada más: el proceso que relanza solo espera a su hijo.
if (!relanzarConNodeDeRedLocal()) {
  const { main } = await import("./cli/main.js");
  main(process.argv.slice(2))
    .then((codigo) => process.exit(codigo))
    .catch((e) => {
      process.stderr.write(`XOneCode falló: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(70); // EX_SOFTWARE
    });
}
