import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  AGENTES_DE_SERIE,
  borrarAgente,
  guardarAgente,
  leerCarpetaDeAgentes,
  rutaDeAgentes,
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
  it("escribe los cuatro de serie la primera vez, y se vuelven a leer enteros", () => {
    // La ida y vuelta es lo que importa: si lo sembrado no pasara el cargador, los cuatro
    // especialistas desaparecerían al siguiente arranque y el orquestador se quedaría sin
    // nadie a quien delegar — sin que nada diera error.
    const raiz = base();
    expect(sembrarAgentes(raiz).sort()).toEqual(["dev", "docs", "mockup", "planner"]);
    const { agentes, problemas } = leerCarpetaDeAgentes(rutaDeAgentes(raiz), "global");
    expect(problemas).toEqual([]);
    expect(agentes.map((a) => a.nombre).sort()).toEqual(["dev", "docs", "mockup", "planner"]);
  });

  it("NO pisa uno que ya existe: el usuario ha podido afinar su prompt", () => {
    // Volver a escribirlo en cada arranque le borraría el trabajo sin decir nada, que es la
    // peor forma de perderlo.
    const raiz = base();
    sembrarAgentes(raiz);
    const ruta = join(rutaDeAgentes(raiz), "dev.md");
    writeFileSync(ruta, "---\ndescripcion: el mío\n---\nMIS INSTRUCCIONES", "utf8");
    expect(sembrarAgentes(raiz)).toEqual([]);
    expect(readFileSync(ruta, "utf8")).toContain("MIS INSTRUCCIONES");
  });

  it("la carpeta es la marca: sembrar dos veces no escribe nada la segunda", () => {
    const raiz = base();
    expect(sembrarAgentes(raiz)).toHaveLength(4);
    expect(sembrarAgentes(raiz)).toEqual([]);
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
    // Y NO deja la carpeta creada: es la marca de «ya se sembró», así que un intento
    // fallido en el global habría impedido para siempre que se sembraran los cuatro.
    expect(sembrarAgentes(raiz)).toHaveLength(4);
  });

  it("borrar dice si existía: no se puede decir «borrado» de algo que no estaba", () => {
    const raiz = base();
    expect(borrarAgente(raiz, "fantasma")).toBe(false);
  });
});
