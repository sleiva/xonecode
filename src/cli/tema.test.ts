/**
 * Tests del tema: los tokens semánticos de color de las pieles.
 *
 * La regla dura que este fichero verifica es doble:
 *
 * 1. **Sin color, TODO token es cadena vacía.** La piel no ramifica por TTY:
 *    compone `${t.mudo}texto${t.reset}` igual con tubería que con terminal, y lo que
 *    garantiza que no salga basura ANSI a un pipe es que el tema apagado no tiene
 *    nada que poner. Un token que se olvide de apagarse rompe aquí, no en un log de CI.
 * 2. **Nadie fuera de `tema.ts` escribe un ANSI.** Un color hardcodeado en una piel es
 *    un color que el tema no puede apagar ni cambiar: mismo estilo de guardián que
 *    `core/imports.test.ts` aplica a la frontera de `core/`.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { crearTema } from "./tema.js";

describe("crearTema", () => {
  it("con color, los tokens son códigos ANSI exactos — el sitio único donde viven", () => {
    const t = crearTema(true);
    expect(t).toEqual({
      texto: "",
      mudo: "\x1b[2m",
      negrita: "\x1b[1m",
      exito: "\x1b[32m",
      aviso: "\x1b[33m",
      grave: "\x1b[31m",
      // `anadido`/`quitado` comparten código con exito/grave a propósito: son tokens
      // DISTINTOS porque significan cosas distintas — si el diff algún día quiere fondo
      // de color (como qwen-code), se cambia aquí y ninguna piel se entera.
      anadido: "\x1b[32m",
      quitado: "\x1b[31m",
      prompt: "\x1b[36m",
      reset: "\x1b[0m",
    });
  });

  it("sin color, TODO token es cadena vacía: mismo camino de código, cero basura en pipes", () => {
    const t = crearTema(false);
    for (const [nombre, valor] of Object.entries(t)) {
      expect(valor, `token «${nombre}»`).toBe("");
    }
  });
});

describe("nadie más hardcodea ANSI", () => {
  /** Recorre los `.ts` de producción bajo `src/`, excluyendo tests, oro y el propio tema. */
  function ficherosTsTs(carpeta: string): string[] {
    const fuera: string[] = [];
    for (const nombre of readdirSync(carpeta)) {
      const ruta = join(carpeta, nombre);
      if (statSync(ruta).isDirectory()) {
        if (nombre === "__oro__" || nombre === "node_modules" || nombre === "dist") continue;
        fuera.push(...ficherosTsTs(ruta));
      } else if (nombre.endsWith(".ts") && !nombre.endsWith(".test.ts")) {
        fuera.push(ruta);
      }
    }
    return fuera;
  }

  it("ningún .ts de producción fuera de tema.ts contiene un escape ANSI", () => {
    const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const permitidos = new Set([join(raiz, "src", "cli", "tema.ts").normalize()]);
    const culpables: string[] = [];
    for (const ruta of ficherosTsTs(join(raiz, "src"))) {
      if (permitidos.has(ruta.normalize())) continue;
      if (readFileSync(ruta, "utf8").includes("\\x1b[")) culpables.push(ruta);
    }
    expect(culpables, `ANSI hardcodeado en: ${culpables.join(", ")}`).toEqual([]);
  });
});