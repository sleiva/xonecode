#!/usr/bin/env node
/**
 * Trae el paquete de la sesión remota (relé + web móvil) de `xonecode-server` a `vendor/xonecode-remoto/`.
 *
 * Esa carpeta ES el artefacto que viaja en el npm de xonecode (`bundleDependencies`), así que se
 * COMMITEA. Pasos: corre el `npm test` de xonecode-server (construye el paquete y copia la web a
 * `packages/remoto/web`), copia `package.json`, `dist` y `web` a un temporal junto al destino, y solo
 * entonces lo cambia por el anterior: un fallo no deja nunca una copia a medias. `origen.json` apunta
 * al commit de xonecode-server del que salió (y dice si su árbol estaba sucio).
 *
 * Carpeta de xonecode-server: `XONECODE_SERVER_DIR`, y por omisión la hermana de este repo.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const servidor = resolve(process.env.XONECODE_SERVER_DIR ?? join(raiz, "..", "xonecode-server"));
const destino = join(raiz, "vendor", "xonecode-remoto");

function fallar(texto) {
  console.error(`remoto:traer: ${texto}`);
  process.exit(1);
}

if (!existsSync(join(servidor, "packages", "remoto", "package.json"))) {
  fallar(`no encuentro xonecode-server en ${servidor} (usa XONECODE_SERVER_DIR)`);
}

try {
  execFileSync("npm", ["test"], { cwd: servidor, stdio: "inherit" });
} catch {
  fallar("los tests de xonecode-server fallan: no se toca vendor/");
}

const paquete = join(servidor, "packages", "remoto");
for (const que of ["package.json", "dist", "web"]) {
  if (!existsSync(join(paquete, que))) fallar(`falta ${que} en packages/remoto tras construir`);
}

const git = (...args) => execFileSync("git", args, { cwd: servidor, encoding: "utf8" }).trim();
const origen = { commit: git("rev-parse", "HEAD"), sucio: git("status", "--porcelain").length > 0 };

// Fuera lo que no es el artefacto: basura del SO, tests y mapas de fuentes que se hayan colado.
const sobra = (ruta) => {
  const nombre = ruta.split(/[\\/]/).pop();
  return nombre === ".DS_Store" || /\.test\.(js|d\.ts)$/.test(nombre) || /\.map$/.test(nombre);
};

const temporal = `${destino}.nuevo`;
rmSync(temporal, { recursive: true, force: true });
mkdirSync(temporal, { recursive: true });
try {
  cpSync(join(paquete, "package.json"), join(temporal, "package.json"));
  cpSync(join(paquete, "dist"), join(temporal, "dist"), { recursive: true, filter: (o) => !sobra(o) });
  cpSync(join(paquete, "web"), join(temporal, "web"), { recursive: true, filter: (o) => !sobra(o) });
  writeFileSync(join(temporal, "origen.json"), `${JSON.stringify(origen, null, 2)}\n`);
  if (!statSync(join(temporal, "web", "index.html")).isFile() || readdirSync(join(temporal, "dist")).length === 0) {
    throw new Error("la copia está incompleta");
  }
  rmSync(destino, { recursive: true, force: true });
  renameSync(temporal, destino);
} catch (e) {
  rmSync(temporal, { recursive: true, force: true });
  fallar(`no se pudo copiar: ${e instanceof Error ? e.message : String(e)}`);
}
console.log(`remoto:traer: vendor/xonecode-remoto ← ${origen.commit.slice(0, 7)}${origen.sucio ? " (árbol sucio)" : ""}`);
