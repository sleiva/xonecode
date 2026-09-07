import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { tituloDesde,
  crearSesion,
  anotarActo,
  listarSesiones,
  reabrirSesion,
  borrarSesion,
  renombrarSesion,
  elegirDispositivo,
  IndiceDeSesionesRoto,
} from "./sesiones.js";

const proyecto = () => mkdtempSync(join(tmpdir(), "xonecode-proyecto-"));

describe("sesiones por proyecto", () => {
  it("el título sale de la primera prosa del usuario", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "añade una colección de clientes" });
    expect(listarSesiones(raiz)[0].titulo).toBe("añade una colección de clientes");
  });

  it("se guarda UN ACTO POR LÍNEA y se anexa, no se reescribe", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "hola" });
    anotarActo(raiz, id, { tipo: "asistente", texto: "qué tal" });
    const bruto = readFileSync(join(raiz, ".xonecode", "sesiones", `${id}.jsonl`), "utf8");
    expect(bruto.trimEnd().split("\n")).toHaveLength(2);
  });

  it("reabrir devuelve los actos en orden y la marca como histórica", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "uno" });
    anotarActo(raiz, id, { tipo: "asistente", texto: "dos" });
    const abierta = reabrirSesion(raiz, id);
    expect(abierta.actos.map((a) => ("texto" in a ? a.texto : ""))).toEqual(["uno", "dos"]);
    expect(abierta.historica).toBe(true);
  });

  it("una línea corrupta se SALTA y las demás siguen: no tumba la reapertura", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "uno" });
    const ruta = join(raiz, ".xonecode", "sesiones", `${id}.jsonl`);
    writeFileSync(ruta, readFileSync(ruta, "utf8") + "{esto no es json\n");
    anotarActo(raiz, id, { tipo: "asistente", texto: "tres" });
    expect(reabrirSesion(raiz, id).actos).toHaveLength(2);
  });

  it("una sesión reabierta no vuelve a nacer: el id se conserva", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    expect(reabrirSesion(raiz, id).id).toBe(id);
  });

  it("un indice.json roto para la escritura sin sobrescribirlo: no borra sesiones que nombraba", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    const rutaIndice = join(raiz, ".xonecode", "sesiones", "indice.json");
    const indiceRoto = "{esto no es json";
    writeFileSync(rutaIndice, indiceRoto);
    expect(() => anotarActo(raiz, id, { tipo: "usuario", texto: "uno" })).toThrow(IndiceDeSesionesRoto);
    // El acto se escribió en el .jsonl aunque el índice esté roto: lo prescindible (el
    // índice, reconstruible barriendo los .jsonl) no puede tumbar lo irrecuperable (el acto).
    expect(reabrirSesion(raiz, id).actos).toEqual([{ tipo: "usuario", texto: "uno" }]);
    // Y el indice.json roto se queda EXACTAMENTE como estaba: nadie lo sobrescribió con [].
    expect(readFileSync(rutaIndice, "utf8")).toBe(indiceRoto);
  });
});

describe("borrar y renombrar una sesión", () => {
  it("borrar se lleva la entrada del índice Y el fichero", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "haz algo" });
    expect(existsSync(join(raiz, ".xonecode", "sesiones", `${id}.jsonl`))).toBe(true);

    expect(borrarSesion(raiz, id)).toBe(true);
    expect(listarSesiones(raiz).map((s) => s.id)).not.toContain(id);
    expect(existsSync(join(raiz, ".xonecode", "sesiones", `${id}.jsonl`))).toBe(false);
  });

  /**
   * Dos pestañas abiertas, o un doble clic en «Eliminar»: la segunda llamada no puede ser
   * un error. Lo único que hay que saber es si quedaba algo.
   */
  it("borrar un id desconocido no lanza: devuelve que no había nada", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "x" });
    expect(borrarSesion(raiz, id)).toBe(true);
    expect(borrarSesion(raiz, id)).toBe(false);
    expect(borrarSesion(raiz, "nunca-existio")).toBe(false);
  });

  it("borrar una sesión no toca a las demás", () => {
    const raiz = proyecto();
    const a = crearSesion(raiz);
    const b = crearSesion(raiz);
    anotarActo(raiz, a, { tipo: "usuario", texto: "la de A" });
    anotarActo(raiz, b, { tipo: "usuario", texto: "la de B" });
    borrarSesion(raiz, a);
    expect(listarSesiones(raiz).map((s) => s.titulo)).toEqual(["la de B"]);
    expect(reabrirSesion(raiz, b).actos).toHaveLength(1);
  });

  /**
   * LA regresión que importa: `anotarActo` fija el título en el primer acto de usuario y
   * solo mientras esté vacío. Un renombrado que no sobreviva al siguiente turno es peor que
   * no poder renombrar, porque el nombre se pierde sin decir nada.
   */
  it("el nombre puesto a mano SOBREVIVE a los turnos siguientes", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "arregla el login" });
    expect(listarSesiones(raiz)[0]!.titulo).toBe("arregla el login");

    expect(renombrarSesion(raiz, id, "Login de la demo")).toBe(true);
    anotarActo(raiz, id, { tipo: "usuario", texto: "y ahora el registro" });
    anotarActo(raiz, id, { tipo: "asistente", texto: "hecho" });
    expect(listarSesiones(raiz)[0]!.titulo).toBe("Login de la demo");
  });

  /**
   * Un título vacío devolvería la sesión al régimen automático (`entrada.titulo === ""`), y
   * el siguiente turno la rebautizaría con la primera frase: el nombre que puso una persona
   * desaparecería sin que nadie lo dijera.
   */
  it("un título vacío o en blanco se rechaza, no se guarda", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "algo" });
    renombrarSesion(raiz, id, "Nombre bueno");
    expect(renombrarSesion(raiz, id, "   ")).toBe(false);
    expect(renombrarSesion(raiz, id, "")).toBe(false);
    expect(listarSesiones(raiz)[0]!.titulo).toBe("Nombre bueno");
  });

  it("renombrar una sesión que no existe dice que no, en vez de crearla", () => {
    const raiz = proyecto();
    crearSesion(raiz);
    expect(renombrarSesion(raiz, "nunca-existio", "Hola")).toBe(false);
    expect(listarSesiones(raiz)).toHaveLength(1);
  });
});

describe("tituloDesde: el título automático es la primera frase, entera", () => {
  it("una petición corta se queda tal cual", () => {
    expect(tituloDesde("añade una colección de clientes")).toBe("añade una colección de clientes");
  });

  it("se queda con la PRIMERA frase y suelta la puntuación final", () => {
    expect(tituloDesde("Arregla el login. Después revisa el menú y dime qué ves.")).toBe("Arregla el login");
    expect(tituloDesde("¿Cómo se hace una ventana en XOne? Explícalo con un ejemplo.")).toBe("Cómo se hace una ventana en XOne");
  });

  it("el caso medido: corta antes de los dos puntos y no deja una comilla a medias", () => {
    expect(tituloDesde("Escribe literalmente esta frase, sin cambiar nada: «en XOne se usa $http para peticiones»")).toBe(
      "Escribe literalmente esta frase, sin cambiar nada"
    );
  });

  it("una frase larga se corta en una palabra entera, con puntos suspensivos", () => {
    const t = tituloDesde("Necesito que revises todas las colecciones del proyecto buscando props sin el prefijo MAP_ que no estén en la tabla");
    expect(t.endsWith("…")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t).not.toMatch(/\s…$/);
    expect(t).toBe("Necesito que revises todas las colecciones del proyecto…");
  });

  it("solo la primera línea, sin la comilla de apertura", () => {
    expect(tituloDesde("«hola»\notra línea")).toBe("hola»");
  });
});

describe("el dispositivo preferido de una sesión", () => {
  const GALAXY = { id: "R58", nombre: "Galaxy S21", plataforma: "android" as const, clase: "fisico" as const };

  it("se guarda con la sesión y vuelve al reabrirla", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ses-"));
    const id = crearSesion(raiz);
    expect(elegirDispositivo(raiz, id, GALAXY)).toBe(true);
    expect(listarSesiones(raiz)[0]!.dispositivo).toEqual(GALAXY);
    // Reabrir lo devuelve: es un dato de la SESIÓN, no uno de sus actos, así que sale del
    // índice y no del `.jsonl`.
    expect(reabrirSesion(raiz, id).dispositivo).toEqual(GALAXY);
  });

  it("se guarda la FOTO y no solo el id: los ids no son estables", () => {
    // `emulator-5554` es un puerto y un teléfono se desenchufa. Con solo el id, al reabrir
    // la pastilla enseñaría un serial crudo en vez de «Galaxy S21 · no está ahora».
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ses-"));
    const id = crearSesion(raiz);
    elegirDispositivo(raiz, id, GALAXY);
    expect(Object.keys(listarSesiones(raiz)[0]!.dispositivo!).sort()).toEqual(["clase", "id", "nombre", "plataforma"]);
  });

  it("con `undefined` se quita, sin dejar el campo puesto a nada", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ses-"));
    const id = crearSesion(raiz);
    elegirDispositivo(raiz, id, GALAXY);
    elegirDispositivo(raiz, id, undefined);
    expect("dispositivo" in listarSesiones(raiz)[0]!).toBe(false);
  });

  it("una sesión que todavía no está en el índice se dice con `false`, no se inventa", () => {
    // El id nace al volcar el primer acto: elegir dispositivo antes no tiene entrada que
    // tocar, y crear una aquí la enseñaría en la barra como una sesión vacía.
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ses-"));
    expect(elegirDispositivo(raiz, "todavia-no", GALAXY)).toBe(false);
    expect(listarSesiones(raiz)).toEqual([]);
  });

  it("anotar un acto después NO borra el dispositivo elegido", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ses-"));
    const id = crearSesion(raiz);
    elegirDispositivo(raiz, id, GALAXY);
    anotarActo(raiz, id, { tipo: "usuario", texto: "hola" });
    expect(listarSesiones(raiz)[0]!.dispositivo).toEqual(GALAXY);
  });
});
