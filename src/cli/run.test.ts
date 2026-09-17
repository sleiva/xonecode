import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cmdRun } from "./run.js";

const previo = process.cwd();
afterEach(() => process.chdir(previo));

describe("`run --real` y las fuentes del disco", () => {
  /**
   * El agujero que esto cierra: `run --real` corría con lo que venía por BANDERA y nada más,
   * así que el `config.json` del usuario no se leía y `aplicarAuth` no se llamaba nunca. La
   * composición vivía en el despachador, que ningún test alcanza — el patrón de siempre.
   */
  it("hidrata desde el disco, y con la raíz en la que va a trabajar", async () => {
    const raiz = realpathSync(mkdtempSync(join(tmpdir(), "xc-run-")));
    process.chdir(raiz);
    const vistas: string[] = [];

    // Sin `app.xml` el turno se para en seco y devuelve 1: basta para ver el cableado sin
    // abrir una sesión real, que es lo que ningún test puede permitirse aquí.
    const codigo = await cmdRun({
      peticion: "lo que sea",
      real: true,
      escribir: () => {},
      hidratar: (r, fuentes) => {
        vistas.push(r);
        return { fuentes, cargado: { config: {}, auth: {}, rutas: [], avisos: [] } };
      },
    });

    expect(codigo).toBe(1);
    expect(vistas).toEqual([raiz]);
  });
});
