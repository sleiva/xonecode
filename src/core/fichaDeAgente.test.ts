import { describe, expect, it } from "vitest";
import { fichaDeAgente } from "./agentes.js";
import type { Agente } from "./agentes.js";

const agente = (cambios: Partial<Agente> = {}): Agente => ({
  nombre: "x-xone",
  descripcion: "Hace cosas.",
  motor: "modelo",
  soloLectura: true,
  skills: [],
  instrucciones: "",
  origen: "semilla",
  ...cambios,
});

describe("fichaDeAgente", () => {
  /**
   * **El porqué, medido en la librería**: deepagents construye la lista de especialistas con
   * `- ${name}: ${description}` y nada más, bajo un encabezado que promete «and the tools they
   * have access to» — una promesa que su cuerpo no cumple. Así que lo único que el orquestador
   * sabe de su equipo es una frase en prosa, y con eso no se puede componer un pipeline:
   * componer exige saber qué puede hacer cada pieza y qué devuelve.
   */
  it("conserva lo que el usuario escribió, y le añade lo que sabe hacer", () => {
    const ficha = fichaDeAgente(agente({ descripcion: "Mira el proyecto." }));

    expect(ficha.startsWith("Mira el proyecto.")).toBe(true);
    expect(ficha).toMatch(/solo LEE/);
  });

  it("un agente que escribe lo dice, y dice que pasa por aprobación", () => {
    const ficha = fichaDeAgente(agente({ soloLectura: false }));

    expect(ficha).toMatch(/ESCRIBE/);
    expect(ficha).toMatch(/aprobaci[oó]n/i);
    expect(ficha).not.toMatch(/solo LEE/);
  });

  /** Lo que más cambia una decisión de reparto: quién alcanza la máquina. */
  it("quien ejecuta comandos lo dice", () => {
    const ficha = fichaDeAgente(agente({ soloLectura: false, ejecucion: true }));

    expect(ficha).toMatch(/ejecuta comandos/);
  });

  /**
   * **REPRODUCIDO**: la primera versión derivaba «ESCRIBE ficheros, y cada escritura pasa por
   * aprobación» de `soloLectura: false`, y para quien EJECUTA eso es falso dos veces —y la
   * segunda en la dirección peligrosa, porque promete una barrera que no existe—:
   *
   *  - `montajeDeFicheros` le da `TOOLS_CON_EJECUCION`, que **no lleva `write_file` ni
   *    `edit_file`**: con las tools de fichero no puede escribir nada.
   *  - Y **no recibe `permissions`** (deepagents lanza si se combinan con un backend
   *    ejecutable), así que lo que su SHELL toque no pasa por ninguna aprobación.
   *
   * La propia descripción del conductor acababa en «No edita ficheros del proyecto», o sea que
   * la ficha se contradecía con la frase que iba tres palabras antes.
   */
  it("quien ejecuta NO «escribe con aprobación»: no tiene las tools y su shell no pasa por ella", () => {
    const ficha = fichaDeAgente(agente({ soloLectura: false, ejecucion: true }));

    expect(ficha).not.toMatch(/ESCRIBE ficheros del proyecto/);
    expect(ficha).not.toMatch(/cada escritura pasa por aprobación/);
    // Y lo que sí es cierto se DICE, porque es lo que hay que saber para repartir.
    expect(ficha).toMatch(/sin pasar por la aprobación|sin aprobación/i);
  });

  it("y quien no ejecuta no lo insinúa", () => {
    expect(fichaDeAgente(agente())).not.toMatch(/ejecuta comandos/);
  });

  /**
   * Para ENGRANAR hace falta saber qué sale de cada pieza, no solo qué entra. Se DERIVA de lo
   * que el `.md` ya declara, así que un subagente del usuario trae su ficha sola y no hay una
   * segunda lista escrita a mano que se quede vieja — el fallo que este repo ya tiene anotado
   * para la regla de los diagramas.
   */
  it("dice qué DEVUELVE, que es lo que deja encadenarlo", () => {
    expect(fichaDeAgente(agente())).toMatch(/devuelve/i);
    expect(fichaDeAgente(agente({ soloLectura: false }))).toMatch(/devuelve/i);
    expect(fichaDeAgente(agente({ soloLectura: false, ejecucion: true }))).toMatch(/devuelve/i);
  });

  it("un motor externo se dice, porque cambia lo que se le puede pedir", () => {
    expect(fichaDeAgente(agente({ motor: "claude-code" }))).toMatch(/claude-code/);
    expect(fichaDeAgente(agente())).not.toMatch(/motor/i);
  });

  /** Una descripción sin punto final no debe pegarse con lo que viene detrás. */
  it("no pega la ficha contra la frase del usuario", () => {
    expect(fichaDeAgente(agente({ descripcion: "Sin punto" }))).toContain("Sin punto.");
  });
});
