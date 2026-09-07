import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  AGENTES_DE_SERIE,
  borrarAgente,
  FICHERO_DE_SEMILLA,
  guardarAgente,
  cargarAgentes,
  leerCarpetaDeAgentes,
  rutaDeAgentes,
  rutaGlobalDeAgentes,
  sembrarAgentes,
} from "./agentesEnDisco.js";
import { fusionarAgentes } from "../core/agentes.js";

const base = () => mkdtempSync(join(tmpdir(), "xonecode-agentes-"));

/** Escribe un `.md` a pelo en la carpeta de agentes de una base. */
function ponerFichero(raiz: string, fichero: string, contenido: string): void {
  const carpeta = rutaDeAgentes(raiz);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, fichero), contenido, "utf8");
}

describe("sembrarAgentes", () => {
  it("escribe los de serie la primera vez, y se vuelven a leer enteros", () => {
    // La ida y vuelta es lo que importa: si lo sembrado no pasara el cargador, los
    // especialistas desaparecerían al siguiente arranque y el orquestador se quedaría sin
    // nadie a quien delegar — sin que nada diera error.
    const raiz = base();
    expect(sembrarAgentes(raiz).escritos.sort()).toEqual(["dev", "docs", "mockup", "planner", "probador"]);
    const { agentes, problemas } = leerCarpetaDeAgentes(rutaDeAgentes(raiz), "global");
    expect(problemas).toEqual([]);
    expect(agentes.map((a) => a.nombre).sort()).toEqual(["dev", "docs", "mockup", "planner", "probador"]);
  });

  it("NO pisa uno que ya existe: el usuario ha podido afinar su prompt", () => {
    // Volver a escribirlo en cada arranque le borraría el trabajo sin decir nada, que es la
    // peor forma de perderlo.
    const raiz = base();
    sembrarAgentes(raiz);
    const ruta = join(rutaDeAgentes(raiz), "dev.md");
    writeFileSync(ruta, "---\ndescripcion: el mío\n---\nMIS INSTRUCCIONES", "utf8");
    expect(sembrarAgentes(raiz).escritos).toEqual([]);
    expect(readFileSync(ruta, "utf8")).toContain("MIS INSTRUCCIONES");
  });

  it("sembrar dos veces con la misma versión de serie no escribe nada la segunda", () => {
    const raiz = base();
    expect(sembrarAgentes(raiz).escritos).toHaveLength(5);
    const segunda = sembrarAgentes(raiz);
    expect(segunda.escritos).toEqual([]);
    expect(segunda.desactualizados).toEqual([]);
  });

  /**
   * El agujero que esto cierra: con «la carpeta es la marca», ningún agente nuevo y ninguna
   * corrección a uno existente alcanzaba a quien ya hubiera arrancado una vez. Medido: un
   * `docs.md` llevaba semanas sin la consulta acotada, y el probador de Android no habría
   * llegado jamás.
   */
  it("uno que nadie ha tocado se ACTUALIZA cuando cambia la versión de serie", () => {
    const raiz = base();
    sembrarAgentes(raiz);
    const ruta = join(rutaDeAgentes(raiz), "dev.md");
    // Se simula una versión de serie anterior escribiendo otra cosa Y anotándola en la
    // marca: es exactamente el estado en que queda un fichero que sembramos nosotros.
    const anterior = "---\ndescripcion: el de antes\n---\nLO DE ANTES";
    writeFileSync(ruta, anterior, "utf8");
    const marca = JSON.parse(readFileSync(join(rutaDeAgentes(raiz), FICHERO_DE_SEMILLA), "utf8")) as Record<string, string>;
    marca["dev"] = createHash("sha256").update(anterior, "utf8").digest("hex").slice(0, 16);
    writeFileSync(join(rutaDeAgentes(raiz), FICHERO_DE_SEMILLA), JSON.stringify(marca), "utf8");

    const siembra = sembrarAgentes(raiz);
    expect(siembra.escritos).toEqual(["dev"]);
    expect(siembra.desactualizados).toEqual([]);
    expect(readFileSync(ruta, "utf8")).not.toContain("LO DE ANTES");
  });

  it("uno AFINADO se respeta y se DICE, no se pisa ni se calla", () => {
    const raiz = base();
    sembrarAgentes(raiz);
    const ruta = join(rutaDeAgentes(raiz), "dev.md");
    writeFileSync(ruta, "---\ndescripcion: el mío\n---\nMIS INSTRUCCIONES", "utf8");
    const siembra = sembrarAgentes(raiz);
    expect(siembra.escritos).toEqual([]);
    expect(siembra.desactualizados).toEqual(["dev"]);
    expect(readFileSync(ruta, "utf8")).toContain("MIS INSTRUCCIONES");
    // Y no se pregunta dos veces: una vez marcado como ajeno, sigue siéndolo.
    expect(sembrarAgentes(raiz).escritos).toEqual([]);
    expect(readFileSync(ruta, "utf8")).toContain("MIS INSTRUCCIONES");
  });

  it("un agente NUEVO llega a quien ya tenía la carpeta", () => {
    const raiz = base();
    sembrarAgentes(raiz);
    // Se simula «este agente todavía no existía cuando se sembró» quitándolo de la marca.
    const rutaMarca = join(rutaDeAgentes(raiz), FICHERO_DE_SEMILLA);
    const marca = JSON.parse(readFileSync(rutaMarca, "utf8")) as Record<string, string>;
    delete marca["probador"];
    writeFileSync(rutaMarca, JSON.stringify(marca), "utf8");
    rmSync(join(rutaDeAgentes(raiz), "probador.md"));

    expect(sembrarAgentes(raiz).escritos).toEqual(["probador"]);
    expect(existsSync(join(rutaDeAgentes(raiz), "probador.md"))).toBe(true);
  });

  /**
   * La carpeta de quien viene de la regla vieja no tiene marca, y ahí no se puede saber qué
   * borró a propósito: dar por nuevo lo que falta le resucitaría un agente que eliminó. Se
   * anota lo que hay y no se escribe nada esa vez; desde la siguiente, todo lo demás vale.
   */
  it("una carpeta SIN marca se adopta: no se escribe nada, y lo distinto se dice", () => {
    const raiz = base();
    mkdirSync(rutaDeAgentes(raiz), { recursive: true });
    writeFileSync(join(rutaDeAgentes(raiz), "docs.md"), "---\ndescripcion: el mío\n---\nMÍO", "utf8");

    const siembra = sembrarAgentes(raiz);
    expect(siembra.escritos).toEqual([]);
    expect(siembra.desactualizados).toEqual(["docs"]);
    // Ni se resucita lo que falta ni se pisa lo que hay.
    expect(existsSync(join(rutaDeAgentes(raiz), "dev.md"))).toBe(false);
    expect(readFileSync(join(rutaDeAgentes(raiz), "docs.md"), "utf8")).toContain("MÍO");
    // Y ya hay marca: a partir de aquí un agente nuevo sí llegaría.
    expect(existsSync(join(rutaDeAgentes(raiz), FICHERO_DE_SEMILLA))).toBe(true);
  });

  it("la marca no se lee como un agente: empieza por punto y no acaba en .md", () => {
    const raiz = base();
    sembrarAgentes(raiz);
    const { agentes, problemas } = leerCarpetaDeAgentes(rutaDeAgentes(raiz), "global");
    expect(problemas).toEqual([]);
    expect(agentes.map((a) => a.nombre)).not.toContain(".semilla");
  });

  it("uno BORRADO no se resucita en el siguiente arranque", () => {
    // Borrarlo es una decisión, no un accidente. Volver a ponerlo convertiría el botón de
    // eliminar en un botón que no hace nada hasta que reinicias.
    const raiz = base();
    sembrarAgentes(raiz);
    expect(borrarAgente(raiz, "mockup")).toBe(true);
    // La siembra vuelve a correr —es lo que pasa en cada arranque— y no lo trae de vuelta.
    // Solo repone los que nunca existieron, que en esta carpeta ya no es ninguno.
    sembrarAgentes(raiz);
    const { agentes } = leerCarpetaDeAgentes(rutaDeAgentes(raiz), "global");
    expect(agentes.map((a) => a.nombre)).not.toContain("mockup");
  });

  it("los cuatro conservan los textos que tenían en código: es una mudanza, no un rediseño", () => {
    const dev = AGENTES_DE_SERIE.find((a) => a.nombre === "dev")!;
    expect(dev.descripcion).toContain("aprobación humana");
    expect(dev.soloLectura).toBe(false);
    const docs = AGENTES_DE_SERIE.find((a) => a.nombre === "docs")!;
    expect(docs.soloLectura).toBe(true);
    // Las particularidades que vivían en un `nombre === "planner"` dentro de `promptDe`
    // ahora están en el cuerpo de su fichero, que es donde se pueden leer y ajustar.
    const planner = AGENTES_DE_SERIE.find((a) => a.nombre === "planner")!;
    expect(planner.instrucciones).toContain("HANDOFF DE PLANNER");
  });
});

describe("cargarAgentes", () => {
  it("SIEMBRA si no hay carpeta global: quien pide agentes tiene que encontrar alguno", () => {
    // Medido, y por eso está aquí y no en el arranque: la llamada vivía en
    // `main.ts#entrarEnConsola` y la rama web devuelve ANTES de llegar ahí, así que
    // `npm run web` arrancaba sin un solo subagente y el orquestador sin nadie a quien
    // delegar — sin que nada diera error. Colgarlo del cargador lo hace imposible de
    // olvidar: por construcción, quien pide agentes encuentra algo.
    const casa = base();
    const previo = process.env["HOME"];
    process.env["HOME"] = casa;
    try {
      // `homedir()` en macOS y Linux respeta `HOME`; si en esta plataforma no lo hiciera, el
      // test no puede afirmar nada y se salta en vez de dar un verde falso.
      if (rutaGlobalDeAgentes().startsWith(casa)) {
        expect(cargarAgentes().agentes.map((a) => a.nombre).sort()).toEqual([
          "dev",
          "docs",
          "mockup",
          "planner",
          "probador",
        ]);
      }
    } finally {
      if (previo === undefined) delete process.env["HOME"];
      else process.env["HOME"] = previo;
    }
  });
});

describe("leerCarpetaDeAgentes", () => {
  it("una carpeta que no existe no es un error: es que todavía no hay ninguno", () => {
    expect(leerCarpetaDeAgentes(join(base(), "no-existe"), "proyecto")).toEqual({
      agentes: [],
      problemas: [],
    });
  });

  it("un fichero roto se salta CON su motivo, y los demás siguen cargando", () => {
    // Es lo que evita que un `.md` a medio escribir deje la consola sin ningún subagente.
    // Y el motivo se guarda para poder decirlo: saltárselo en silencio haría que el agente
    // «desapareciera» sin explicación.
    const raiz = base();
    ponerFichero(raiz, "bueno.md", "---\ndescripcion: sirve\n---\ncuerpo");
    ponerFichero(raiz, "roto.md", "sin frontmatter");
    const { agentes, problemas } = leerCarpetaDeAgentes(rutaDeAgentes(raiz), "proyecto");
    expect(agentes.map((a) => a.nombre)).toEqual(["bueno"]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/roto\.md.*frontmatter/);
  });

  it("solo mira los `.md`: un README o un `.bak` no es un agente", () => {
    const raiz = base();
    ponerFichero(raiz, "notas.txt", "---\ndescripcion: no soy un agente\n---\n");
    ponerFichero(raiz, "dev.md.bak", "---\ndescripcion: tampoco\n---\n");
    expect(leerCarpetaDeAgentes(rutaDeAgentes(raiz), "proyecto").agentes).toEqual([]);
  });

  it("el de PROYECTO gana sobre el global con el mismo nombre", () => {
    const global = base();
    const proyecto = base();
    ponerFichero(global, "revisor.md", "---\ndescripcion: el global\n---\n");
    ponerFichero(proyecto, "revisor.md", "---\ndescripcion: el del proyecto\n---\n");
    const fusion = fusionarAgentes(
      leerCarpetaDeAgentes(rutaDeAgentes(global), "global").agentes,
      leerCarpetaDeAgentes(rutaDeAgentes(proyecto), "proyecto").agentes
    );
    expect(fusion).toHaveLength(1);
    expect(fusion[0]!.descripcion).toBe("el del proyecto");
    expect(fusion[0]!.origen).toBe("proyecto");
  });
});

describe("guardarAgente", () => {
  it("un nombre con separadores NO se sanea: se rechaza", () => {
    // El nombre llega del cliente por HTTP. `segmentoSeguro` —la misma función que usa
    // `sesiones.ts` con el id de sesión— LANZA en vez de limpiar, y está bien que lo haga:
    // limpiar un `../../.env` hasta convertirlo en un nombre válido guardaría el agente con
    // un nombre que nadie pidió, y quien lo mandó creería que se llama de otra forma. Que
    // reviente aquí es lo que hace que el error se vea en vez de convertirse en un fichero
    // sorpresa.
    const raiz = base();
    const malo = {
      nombre: "../../fuera",
      descripcion: "d",
      motor: "modelo" as const,
      soloLectura: true,
      skills: [],
      instrucciones: "",
      origen: "proyecto" as const,
    };
    expect(() => guardarAgente(raiz, malo)).toThrow(/no vale como nombre de agente/);
    expect(leerCarpetaDeAgentes(rutaDeAgentes(raiz), "proyecto").agentes).toEqual([]);
    // Y NO deja la carpeta creada. Con la regla vieja —la carpeta ERA la marca— un intento
    // fallido en el global impedía para siempre que se sembrara nada. Con la marca en
    // fichero el peligro cambió de forma pero no desapareció: una carpeta vacía sin marca
    // se adoptaría, anotando los cinco como entregados sin escribir ninguno. Por eso se
    // comprueban las dos cosas: que no queda carpeta, y que sembrar escribe los cinco.
    expect(existsSync(rutaDeAgentes(raiz))).toBe(false);
    expect(sembrarAgentes(raiz).escritos).toHaveLength(5);
  });

  it("una carpeta VACÍA sin marca se siembra, no se adopta", () => {
    // No viene de ninguna siembra: la deja un guardado fallido. Adoptarla anotaría los cinco
    // como entregados sin escribir uno solo, y ese usuario se quedaría sin ningún subagente
    // para siempre.
    const raiz = base();
    mkdirSync(rutaDeAgentes(raiz), { recursive: true });
    expect(sembrarAgentes(raiz).escritos).toHaveLength(5);
    expect(existsSync(join(rutaDeAgentes(raiz), "dev.md"))).toBe(true);
  });

  it("borrar dice si existía: no se puede decir «borrado» de algo que no estaba", () => {
    const raiz = base();
    expect(borrarAgente(raiz, "fantasma")).toBe(false);
  });
});
