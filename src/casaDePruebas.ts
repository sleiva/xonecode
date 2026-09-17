/**
 * `npm test` no toca la casa del usuario.
 *
 * Es el hermano de «sin clave, sin conexión y sin simulador», y hacía falta: **correr los
 * tests le reescribía a quien los corre su `~/.xonecode/agentes/`**. No por un test que
 * quisiera hacerlo, sino de rebote — `cargarAgentes()` SIEMBRA, a propósito y con su motivo
 * medido (`agentesEnDisco.ts`: colgarlo del cargador es lo que lo hace imposible de olvidar),
 * y la ráfaga de bienvenida del cable lo llama. Con el renombrado de los cinco especialistas
 * eso dejó de ser invisible: un `npm test` le retiró cuatro ficheros y le escribió cinco.
 *
 * El arreglo NO es quitar la siembra del cargador —esa decisión está medida y el remedio la
 * desharía— ni mudar el `HOME` en los tests que hoy lo provocan: eso es una lista que hay que
 * acordarse de ampliar, y el patrón de fallo de este repo es exactamente ese. Se muda para
 * TODO el suite, una vez, en `vitest.config.ts`, y así ningún test futuro puede reintroducirlo.
 *
 * **Medido antes de ponerlo**: con `HOME` en un temporal, el suite entero sigue en verde
 * (3590), así que ningún test dependía de la casa real — y lo único que xonecode escribía ahí
 * era la carpeta de agentes. No se está tapando una dependencia: no la había.
 *
 * Una casa POR PROCESO y no una compartida: los workers corren a la vez, y `sembrarAgentes`
 * hace leer-modificar-escribir sobre `.semilla.json`. Compartida, dos workers podrían
 * entrelazarse ahí. Y no una por FICHERO de test, que serían un par de cientos de temporales
 * por pasada para aislar algo que ya está aislado por worker.
 *
 * `USERPROFILE` además de `HOME` porque `os.homedir()` mira ese en Windows. No cuesta nada y
 * evita que esto sea cierto solo en las dos plataformas donde se probó.
 *
 * Vive en `src/` para que lo tipe el gate, y `tsconfig.build.json` lo excluye —el mismo trato
 * que `src/evals/`—: no es código del producto y no tiene por qué acabar en `dist/`.
 * `src/gate.test.ts` comprueba las dos mitades: que esto está haciendo efecto de verdad, y
 * que `vitest.config.ts` lo declara en los DOS proyectos.
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const casa = join(tmpdir(), `xonecode-casa-de-pruebas-${process.pid}`);
mkdirSync(casa, { recursive: true });

process.env["HOME"] = casa;
process.env["USERPROFILE"] = casa;

// Se recoge al salir. Si el worker muere de otra forma, lo que queda es una carpeta vacía en
// el temporal del sistema: el precio de no hacerlo es despreciable y el de no mudar la casa no.
process.on("exit", () => {
  try {
    rmSync(casa, { recursive: true, force: true });
  } catch {
    // Un temporal que no se puede borrar no es motivo para tumbar la pasada.
  }
});
