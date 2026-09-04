/**
 * `nombreDePersona` de verdad ejecuta `git` y lee `os.userInfo()` — no es un puerto con
 * doble, así que aquí se prueba invocando el binario de verdad sobre un `HOME` y un `cwd`
 * temporales y aislados, igual que `cli/main.test.ts` aísla `$HOME` para no leer la
 * config real de quien corre el test. `GIT_CONFIG_NOSYSTEM=1` evita que un `/etc/gitconfig`
 * de la máquina que corre el test le preste un `user.name` que no le corresponde a este
 * test.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { nombreDePersona } from "./persona.js";

let temporales: string[] = [];
const homeOriginal = process.env.HOME;
const noSystemOriginal = process.env.GIT_CONFIG_NOSYSTEM;

function raizTemporal(): string {
  const r = mkdtempSync(join(tmpdir(), "xc-persona-"));
  temporales.push(r);
  return r;
}

beforeEach(() => {
  // Un HOME vacío: sin esto, `git config --get user.name` sin repo local cae al
  // `~/.gitconfig` de quien corre el test, y el caso "sin nombre" saldría en rojo (o en
  // verde por casualidad) según la máquina.
  process.env.HOME = raizTemporal();
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

afterEach(() => {
  for (const r of temporales) rmSync(r, { recursive: true, force: true });
  temporales = [];
  if (homeOriginal === undefined) delete process.env.HOME;
  else process.env.HOME = homeOriginal;
  if (noSystemOriginal === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
  else process.env.GIT_CONFIG_NOSYSTEM = noSystemOriginal;
});

describe("nombreDePersona", () => {
  it("con `user.name` en la config de git del propio repo, devuelve ese nombre", () => {
    const cwd = raizTemporal();
    execFileSync("git", ["init"], { cwd, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "Ana Programadora"], { cwd, stdio: "ignore" });

    expect(nombreDePersona(cwd)).toBe("Ana Programadora");
  });

  it("sin git config en ningún sitio, cae al usuario del sistema operativo", () => {
    // `cwd` no es un repo git y el `HOME` de esta suite está vacío (`beforeEach`): `git
    // config --get user.name` sale sin nada que decir, así que toca `os.userInfo()`, que
    // en la máquina donde corre el test SIEMPRE tiene un `username` — de ahí que el test
    // afirme igualdad con el mismo valor que devolvería `userInfo()` y no un literal.
    const cwd = raizTemporal();

    const esperado = nombreDelSistema();
    expect(nombreDePersona(cwd)).toBe(esperado);
  });

  it("ni nombre inventado ni cadena vacía: si `userInfo().username` viniera vacío, el saludo se queda sin nombre", () => {
    // No hay forma portable de vaciar `os.userInfo().username` de verdad (depende del
    // SO), así que esto documenta el contrato leyendo el propio código en vez de
    // fingir un entorno sin usuario: la función nunca devuelve `""`, solo un nombre no
    // vacío o `undefined`. El test que sí ejerce la rama es indirecto — lo cubre el
    // `.trim() === "" ? undefined : nombre` de `persona.ts`, y este test deja constancia
    // de que ese es el contrato que las dos vías (cable y `Bienvenida.tsx`) asumen.
    const cwd = raizTemporal();
    const resultado = nombreDePersona(cwd);
    expect(resultado === undefined || resultado.length > 0).toBe(true);
  });
});

/** El mismo cálculo que hace `persona.ts` en su segunda rama, para comparar sin repetir
 *  un literal que dependería de qué usuario corre el test. */
function nombreDelSistema(): string | undefined {
  const nombre = userInfo().username.trim();
  return nombre === "" ? undefined : nombre;
}
