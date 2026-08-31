#!/usr/bin/env node
import { main } from "./cli/main.js";

main(process.argv.slice(2))
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    process.stderr.write(`xonecode falló: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(70); // EX_SOFTWARE
  });