/**
 * El gate se COMPRUEBA, no se recuerda.
 *
 * `npm run typecheck` era `tsc --noEmit` a secas, y el `tsconfig.json` de la raíz incluye
 * solo `src/**`: las ~25.000 líneas de `apps/web/src` —el cliente entero de la consola web—
 * no pasaban por ninguna comprobación de tipos. `vite build` tampoco: transpila con esbuild,
 * que mira sintaxis y no tipos.
 *
 * **Medido antes de arreglarlo**, con un `const roto: number = texto` metido a propósito en
 * un componente del cliente: `npm run typecheck` salía 0, `npm run build` salía 0, y el error
 * solo aparecía llamando a mano a `tsc -p apps/web/tsconfig.json`, que nada ejecutaba. Lo más
 * elocuente es que el propio `apps/web/tsconfig.json` ya lo decía en un comentario —«una
 * comprobación que ni vite build ni npm run typecheck ejecutan hoy»—: la regla estaba
 * escrita, no probada, que es el patrón de fallo de este repo en versión de gate.
 *
 * Este test existe porque un script de `package.json` es justo lo que se «simplifica» un día
 * sin que nada se ponga rojo: al revés que un import, quitarlo no rompe nada visible, y el
 * síntoma sería volver al silencio de antes con todo en verde.
 *
 * Lo que NO cubre, y es deliberado: los `*.test.ts(x)` del cliente, que
 * `apps/web/tsconfig.json` excluye a propósito (usan `node:fs`/`url`/`path` y `types:
 * ["vite/client"]` apaga los globals de Node; meterlos aquí los traería a todo el bundle).
 * Comprobarlos es otra medida con su propia técnica, y hoy tienen errores anteriores: meterlos
 * en el gate lo dejaría rojo de salida, que es la forma de que nadie lo mire.
 */
import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const guion = (nombre: string): string => {
  const paquete = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  return paquete.scripts?.[nombre] ?? "";
};

describe("el gate cubre las dos mitades del repo", () => {
  it("`typecheck` comprueba el host y también el cliente web", () => {
    const orden = guion("typecheck");
    // El host: el tsconfig de la raíz, que es `src/**`.
    expect(orden).toContain("tsc --noEmit");
    // Y el cliente, que tiene su propio proyecto porque su `lib`, su `jsx` y sus `types` no
    // son los del host — no se puede cubrir ampliando el `include` de la raíz.
    expect(orden).toContain("apps/web/tsconfig.json");
  });

  it("las dos comprobaciones van encadenadas con `&&`, o la primera en fallar no pararía nada", () => {
    // Con `;` o con `&` el código de salida sería el de la ÚLTIMA, así que un host roto
    // pasaría el gate siempre que el cliente estuviera limpio. CI lee ese código.
    expect(guion("typecheck")).toContain("&&");
  });
});

/**
 * Y `npm test` no toca la casa de quien lo corre, que es el hermano de «sin clave, sin
 * conexión y sin simulador».
 *
 * Hacía falta y no era teórico: `cargarAgentes()` SIEMBRA —a propósito, con su motivo medido—
 * y la ráfaga de bienvenida del cable lo llama, así que una pasada le reescribía a quien la
 * corría su `~/.xonecode/agentes/`. Con el renombrado de los cinco especialistas dejó de ser
 * invisible: le retiró cuatro ficheros y le escribió cinco.
 *
 * Dos aserciones y no una, porque cubren cosas distintas: la primera mide el EFECTO aquí y
 * ahora; la segunda mira el fichero de configuración, que es lo único que puede dejar al
 * proyecto `cliente` sin la regla — desde este test, que corre en el proyecto `host`, el otro
 * no se puede observar. Es la misma forma que el `&&` del gate: un ajuste de configuración se
 * «simplifica» un día sin que nada se ponga rojo.
 */
describe("`npm test` no escribe en la casa del usuario", () => {
  it("la casa está mudada a un temporal mientras corren los tests", () => {
    // Directo: si alguien quita el `setupFiles`, esto se pone rojo en la siguiente pasada.
    expect(homedir().startsWith(tmpdir())).toBe(true);
  });

  it("y se declara en los DOS proyectos: uno exento es por donde vuelve", () => {
    const config = readFileSync(join(RAIZ, "vitest.config.ts"), "utf8");
    // Dos veces, una por proyecto. El `host` lo prueba el test de arriba; el `cliente` solo
    // se puede comprobar así, porque este fichero no corre en él.
    expect(config.split("casaDePruebas").length - 1).toBeGreaterThanOrEqual(3);
  });
});
