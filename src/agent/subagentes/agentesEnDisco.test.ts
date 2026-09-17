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
  esDeSerie,
  leerCarpetaDeAgentes,
  marcarSemilla,
  renombrarAgente,
  restaurarAgente,
  rutaDeAgentes,
  rutaGlobalDeAgentes,
  sembrarAgentes,
} from "./agentesEnDisco.js";
import { escribirAgente, fusionarAgentes, type Agente } from "../../core/agentes.js";
import { SkillsEnDisco } from "../grafo/skills.js";

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
    expect(sembrarAgentes(raiz).escritos.sort()).toEqual(["analyst-xone", "consultant-xone", "designer-xone", "developer-xone", "tester-xone"]);
    const { agentes, problemas } = leerCarpetaDeAgentes(rutaDeAgentes(raiz), "global");
    expect(problemas).toEqual([]);
    expect(agentes.map((a) => a.nombre).sort()).toEqual(["analyst-xone", "consultant-xone", "designer-xone", "developer-xone", "tester-xone"]);
  });

  it("NO pisa uno que ya existe: el usuario ha podido afinar su prompt", () => {
    // Volver a escribirlo en cada arranque le borraría el trabajo sin decir nada, que es la
    // peor forma de perderlo.
    const raiz = base();
    sembrarAgentes(raiz);
    const ruta = join(rutaDeAgentes(raiz), "developer-xone.md");
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
   * `docs.md` llevaba semanas sin la consulta acotada, y el probador de dispositivos no habría
   * llegado jamás.
   */
  it("uno que nadie ha tocado se ACTUALIZA cuando cambia la versión de serie", () => {
    const raiz = base();
    sembrarAgentes(raiz);
    const ruta = join(rutaDeAgentes(raiz), "developer-xone.md");
    // Se simula una versión de serie anterior escribiendo otra cosa Y anotándola en la
    // marca: es exactamente el estado en que queda un fichero que sembramos nosotros.
    const anterior = "---\ndescripcion: el de antes\n---\nLO DE ANTES";
    writeFileSync(ruta, anterior, "utf8");
    const marca = JSON.parse(readFileSync(join(rutaDeAgentes(raiz), FICHERO_DE_SEMILLA), "utf8")) as Record<string, string>;
    marca["developer-xone"] = createHash("sha256").update(anterior, "utf8").digest("hex").slice(0, 16);
    writeFileSync(join(rutaDeAgentes(raiz), FICHERO_DE_SEMILLA), JSON.stringify(marca), "utf8");

    const siembra = sembrarAgentes(raiz);
    expect(siembra.escritos).toEqual(["developer-xone"]);
    expect(siembra.desactualizados).toEqual([]);
    expect(readFileSync(ruta, "utf8")).not.toContain("LO DE ANTES");
  });

  it("uno AFINADO se respeta y se DICE, no se pisa ni se calla", () => {
    const raiz = base();
    sembrarAgentes(raiz);
    const ruta = join(rutaDeAgentes(raiz), "developer-xone.md");
    writeFileSync(ruta, "---\ndescripcion: el mío\n---\nMIS INSTRUCCIONES", "utf8");
    const siembra = sembrarAgentes(raiz);
    expect(siembra.escritos).toEqual([]);
    expect(siembra.desactualizados).toEqual(["developer-xone"]);
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
    delete marca["analyst-xone"];
    writeFileSync(rutaMarca, JSON.stringify(marca), "utf8");
    rmSync(join(rutaDeAgentes(raiz), "analyst-xone.md"));

    expect(sembrarAgentes(raiz).escritos).toEqual(["analyst-xone"]);
    expect(existsSync(join(rutaDeAgentes(raiz), "analyst-xone.md"))).toBe(true);
  });

  /**
   * Deja la carpeta como la de quien venía de la versión con el nombre viejo: su `probador.md`
   * y la marca con la clave de entonces. Se reconstruye a mano porque el renombrado ya ocurrió
   * —en el código no queda ningún `probador`, y la marca guarda un nombre y su hash, nada más—.
   *
   * Los dos textos van separados a propósito: `sembrado` es lo que escribimos y lo que la marca
   * recuerda, `enDisco` lo que hay ahora. Solo se diferencian si el usuario lo tocó, y es justo
   * lo que la retirada tiene que distinguir.
   */
  function conElNombreViejo(raiz: string, sembrado: string, enDisco = sembrado): string {
    sembrarAgentes(raiz);
    const carpeta = rutaDeAgentes(raiz);
    const rutaViejo = join(carpeta, "probador.md");
    writeFileSync(rutaViejo, enDisco, "utf8");
    rmSync(join(carpeta, "tester-xone.md"));
    const rutaMarca = join(carpeta, FICHERO_DE_SEMILLA);
    const marca = JSON.parse(readFileSync(rutaMarca, "utf8")) as Record<string, string>;
    delete marca["tester-xone"];
    marca["probador"] = createHash("sha256").update(sembrado, "utf8").digest("hex").slice(0, 16);
    writeFileSync(rutaMarca, JSON.stringify(marca), "utf8");
    return rutaViejo;
  }

  /**
   * El quinto caso, que no existía hasta que un agente de serie se llamó de otra forma. Sin él
   * la marca se queda con una clave que ya no nombra a nadie y quien ya hubiera arrancado se
   * encuentra con DOS probadores: el nuevo, mantenido, y el viejo, huérfano y sin actualizar
   * nunca más — y callado, que es lo que hace que nadie lo note.
   */
  it("un RENOMBRADO retira el fichero viejo de quien no lo tocó, y lo DICE", () => {
    const raiz = base();
    const rutaViejo = conElNombreViejo(raiz, "---\ndescripcion: el de antes\n---\nLO DE ANTES");

    const siembra = sembrarAgentes(raiz);
    expect(siembra.escritos).toEqual(["tester-xone"]);
    expect(siembra.retirados).toEqual([
      { nombre: "probador", ahoraSeLlama: "tester-xone", borrado: true },
    ]);
    expect(existsSync(rutaViejo)).toBe(false);
    expect(existsSync(join(rutaDeAgentes(raiz), "tester-xone.md"))).toBe(true);
    // Y no se vuelve a decir: la clave se fue con el fichero.
    expect(sembrarAgentes(raiz).retirados).toEqual([]);
  });

  it("un RENOMBRADO que el usuario afinó se QUEDA, y se dice cada arranque", () => {
    const raiz = base();
    const rutaViejo = conElNombreViejo(
      raiz,
      "---\ndescripcion: el de serie\n---\nLO NUESTRO",
      "---\ndescripcion: el mío\n---\nMIS INSTRUCCIONES"
    );

    const siembra = sembrarAgentes(raiz);
    expect(siembra.retirados).toEqual([
      { nombre: "probador", ahoraSeLlama: "tester-xone", borrado: false },
    ]);
    expect(readFileSync(rutaViejo, "utf8")).toContain("MIS INSTRUCCIONES");
    // Sigue diciéndose: aquí queda algo que decidir, que es borrarlo o quedarse con los dos.
    expect(sembrarAgentes(raiz).retirados).toHaveLength(1);
  });

  /**
   * LÍMITE DECLARADO. La carpeta que se ADOPTA no tiene marca, así que no hay contra qué
   * comparar el huérfano y no se puede saber si lo escribimos nosotros o su dueño. Se queda,
   * sin retirar y sin decir: es el lado que no borra nada ajeno. Se paga una vez, en la ronda
   * de adopción de quien venga de la regla vieja — la misma que ya se paga por lo demás.
   */
  it("LIMITE: sin marca, el huérfano de un renombrado ni se retira ni se dice", () => {
    const raiz = base();
    mkdirSync(rutaDeAgentes(raiz), { recursive: true });
    writeFileSync(join(rutaDeAgentes(raiz), "probador.md"), "---\ndescripcion: d\n---\ncuerpo", "utf8");

    expect(sembrarAgentes(raiz).retirados).toEqual([]);
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
    writeFileSync(join(rutaDeAgentes(raiz), "consultant-xone.md"), "---\ndescripcion: el mío\n---\nMÍO", "utf8");

    const siembra = sembrarAgentes(raiz);
    expect(siembra.escritos).toEqual([]);
    expect(siembra.desactualizados).toEqual(["consultant-xone"]);
    // Ni se resucita lo que falta ni se pisa lo que hay.
    expect(existsSync(join(rutaDeAgentes(raiz), "developer-xone.md"))).toBe(false);
    expect(readFileSync(join(rutaDeAgentes(raiz), "consultant-xone.md"), "utf8")).toContain("MÍO");
    // Y ya hay marca: a partir de aquí un agente nuevo sí llegaría.
    expect(existsSync(join(rutaDeAgentes(raiz), FICHERO_DE_SEMILLA))).toBe(true);
  });

  /**
   * Los CINCO a la vez, que es lo que de verdad pasó: los de serie pasaron a `<rol>-xone`.
   *
   * Se construye la carpeta de quien arrancó con los nombres viejos y se comprueba que la
   * siembra hace las dos cosas de cada caso: retira el que era nuestra semilla intacta y
   * escribe el nuevo, y respeta el que el usuario afinó diciéndolo. Sin esto, el renombrado de
   * los cinco era una tabla que nadie prueba, y el síntoma de que faltara una entrada es un
   * especialista huérfano y sin mantener, en silencio — el fallo que `RENOMBRADOS` existe para
   * no repetir.
   */
  it("los CINCO renombrados alcanzan a quien tenía los nombres viejos", () => {
    const raiz = base();
    const carpeta = rutaDeAgentes(raiz);
    mkdirSync(carpeta, { recursive: true });
    const marca: Record<string, string> = {};
    // Cuatro tal como los habríamos escrito nosotros, y `mockup` afinado por el usuario.
    const viejos: [string, string][] = [
      ["docs", "consultant-xone"],
      ["planner", "analyst-xone"],
      ["dev", "developer-xone"],
      ["xone-device-tester", "tester-xone"],
    ];
    for (const [viejo, nuevo] of viejos) {
      const contenido = escribirAgente({ ...AGENTES_DE_SERIE.find((a) => a.nombre === nuevo)!, nombre: viejo });
      writeFileSync(join(carpeta, `${viejo}.md`), contenido, "utf8");
      marca[viejo] = createHash("sha256").update(contenido, "utf8").digest("hex").slice(0, 16);
    }
    const mio = "---\ndescripcion: el mío\n---\nMIS INSTRUCCIONES";
    writeFileSync(join(carpeta, "mockup.md"), mio, "utf8");
    marca["mockup"] = createHash("sha256")
      .update(escribirAgente({ ...AGENTES_DE_SERIE.find((a) => a.nombre === "designer-xone")!, nombre: "mockup" }), "utf8")
      .digest("hex")
      .slice(0, 16);
    writeFileSync(join(carpeta, FICHERO_DE_SEMILLA), JSON.stringify(marca), "utf8");

    const siembra = sembrarAgentes(raiz);

    // Los cinco nuevos están, y los cuatro viejos intactos se han ido con su clave.
    expect(siembra.escritos.sort()).toEqual([
      "analyst-xone",
      "consultant-xone",
      "designer-xone",
      "developer-xone",
      "tester-xone",
    ]);
    for (const [viejo] of viejos) expect(existsSync(join(carpeta, `${viejo}.md`))).toBe(false);
    expect(siembra.retirados.filter((r) => r.borrado).map((r) => r.nombre).sort()).toEqual([
      "dev",
      "docs",
      "planner",
      "xone-device-tester",
    ]);

    // Y el afinado se QUEDA y se dice: queda algo que decidir, que es borrarlo o tener los dos.
    expect(readFileSync(join(carpeta, "mockup.md"), "utf8")).toContain("MIS INSTRUCCIONES");
    expect(siembra.retirados).toContainEqual({
      nombre: "mockup",
      ahoraSeLlama: "designer-xone",
      borrado: false,
    });
  });

  /**
   * La entrada vieja se ACTUALIZÓ en vez de dejarse: apuntaba a `xone-device-tester`, que ya no
   * es de serie. Sin esto, a quien conserve un `probador.md` afinado se le seguiría diciendo
   * que ese agente «se llama ahora `xone-device-tester`» — un nombre que no existe en ninguna
   * parte, y el usuario iría a buscarlo.
   */
  it("un renombrado en DOS pasos se dice de un salto, con el nombre de HOY", () => {
    const raiz = base();
    const carpeta = rutaDeAgentes(raiz);
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, "probador.md"), "---\ndescripcion: el mío\n---\nMÍO", "utf8");
    writeFileSync(join(carpeta, FICHERO_DE_SEMILLA), JSON.stringify({ probador: "ajeno" }), "utf8");

    expect(sembrarAgentes(raiz).retirados).toContainEqual({
      nombre: "probador",
      ahoraSeLlama: "tester-xone",
      borrado: false,
    });
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
    expect(borrarAgente(raiz, "designer-xone")).toBe(true);
    // La siembra vuelve a correr —es lo que pasa en cada arranque— y no lo trae de vuelta.
    // Solo repone los que nunca existieron, que en esta carpeta ya no es ninguno.
    sembrarAgentes(raiz);
    const { agentes } = leerCarpetaDeAgentes(rutaDeAgentes(raiz), "global");
    expect(agentes.map((a) => a.nombre)).not.toContain("designer-xone");
  });

  it("los cuatro conservan los textos que tenían en código: es una mudanza, no un rediseño", () => {
    const dev = AGENTES_DE_SERIE.find((a) => a.nombre === "developer-xone")!;
    expect(dev.descripcion).toContain("aprobación humana");
    expect(dev.soloLectura).toBe(false);
    const docs = AGENTES_DE_SERIE.find((a) => a.nombre === "consultant-xone")!;
    expect(docs.soloLectura).toBe(true);
    // Las particularidades que vivían en un `nombre === "planner"` dentro de `promptDe`
    // ahora están en el cuerpo de su fichero, que es donde se pueden leer y ajustar.
    const planner = AGENTES_DE_SERIE.find((a) => a.nombre === "analyst-xone")!;
    expect(planner.instrucciones).toContain("HANDOFF DE ANÁLISIS");
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
          "analyst-xone",
          "consultant-xone",
          "designer-xone",
          "developer-xone",
          "tester-xone",
        ]);
      }
    } finally {
      if (previo === undefined) delete process.env["HOME"];
      else process.env["HOME"] = previo;
    }
  });

  /**
   * Un de serie afinado ya NO es un problema: es un estado de su tarjeta.
   *
   * Salía por el mismo canal que un `.md` que no carga, así que la consola pintaba en rojo y
   * arriba del todo dos agentes que están perfectamente, con una escapatoria que además era
   * falsa («bórralo si quieres el nuevo» dejaba sin ninguno). Ahora lo dice la tarjeta del
   * agente, que es donde está el botón que lo arregla, y `problemas` vuelve a significar solo
   * «este fichero no se pudo cargar».
   */
  it("un de serie MODIFICADO no va a `problemas`: lo dice su tarjeta", () => {
    const casa = base();
    const previo = process.env["HOME"];
    process.env["HOME"] = casa;
    try {
      if (!rutaGlobalDeAgentes().startsWith(casa)) return;
      cargarAgentes();
      writeFileSync(join(rutaGlobalDeAgentes(), "consultant-xone.md"), "---\ndescripcion: mío\n---\nMÍO", "utf8");

      const { agentes, problemas } = cargarAgentes();
      expect(problemas).toEqual([]);
      expect(agentes.find((a) => a.nombre === "consultant-xone")?.semilla).toBe("modificada");
      expect(agentes.find((a) => a.nombre === "developer-xone")?.semilla).toBe("intacta");
    } finally {
      if (previo === undefined) delete process.env["HOME"];
      else process.env["HOME"] = previo;
    }
  });
});

/**
 * De quién es cada `.md`, que es el dato que decide qué botón lleva su tarjeta.
 *
 * Se prueba aquí y no a través de `cargarAgentes` por la regla de las nueve veces: una regla
 * de producción compuesta dentro de algo que los tests doblan está escrita, no probada. La
 * función es pura, así que la trampa del proyecto se ata directamente.
 */
describe("marcarSemilla", () => {
  const como = (nombre: string, origen: Agente["origen"]): Agente => ({
    nombre,
    descripcion: "da igual",
    motor: "modelo",
    soloLectura: true,
    skills: [],
    instrucciones: "",
    origen,
  });

  it("un de serie del global lleva su estado; uno del usuario, NINGUNO", () => {
    // Ausente ≠ «intacta»: un subagente del usuario no tiene semilla de la que apartarse, y
    // marcarlo como intacto le pintaría un «Restaurar el de serie» que no existe.
    const salida = marcarSemilla([como("consultant-xone", "global"), como("advisor", "global")], []);
    expect(salida.find((a) => a.nombre === "consultant-xone")?.semilla).toBe("intacta");
    expect(salida.find((a) => a.nombre === "advisor")?.semilla).toBeUndefined();
  });

  it("uno de serie MODIFICADO se dice: es el único con algo que restaurar", () => {
    const salida = marcarSemilla([como("consultant-xone", "global"), como("developer-xone", "global")], ["consultant-xone"]);
    expect(salida.find((a) => a.nombre === "consultant-xone")?.semilla).toBe("modificada");
    expect(salida.find((a) => a.nombre === "developer-xone")?.semilla).toBe("intacta");
  });

  /**
   * La trampa, y es la razón de que la regla no sea `nombre ∈ AGENTES_DE_SERIE` a secas.
   *
   * La siembra solo toca el GLOBAL. Un `docs.md` en `.xonecode/agentes/` del proyecto lo
   * escribió el usuario, y da igual que se llame como uno de serie: es suyo. Con la regla
   * simple se quedaría sin botón de borrar —un fichero del usuario que el usuario no puede
   * borrar— y con un «Restaurar el de serie» que le pisaría el suyo con el global.
   */
  it("un `.md` DE PROYECTO que se llama igual que uno de serie es del USUARIO", () => {
    const salida = marcarSemilla([como("consultant-xone", "proyecto")], ["consultant-xone"]);
    expect(salida[0]!.semilla).toBeUndefined();
  });

  it("no toca nada más del agente: solo añade de quién es", () => {
    const uno = como("consultant-xone", "global");
    expect(marcarSemilla([uno], [])[0]).toEqual({ ...uno, semilla: "intacta" });
  });
});

/**
 * Restaurar el de serie: lo que ocupa el sitio del borrado en un agente sembrado.
 *
 * Borrar uno de serie NO devolvía el de serie —la marca recuerda que se entregó, así que no
 * se resiembra (ver «uno BORRADO no se resucita»)—, o sea que el «Bórralo si quieres el
 * nuevo» que decía la consola dejaba al usuario sin ninguno de los dos y para siempre. Esto
 * es la operación que sí hace lo que esa frase prometía.
 */
describe("restaurarAgente", () => {
  it("reescribe el `.md` con el de serie de hoy, pisando lo que hubiera", () => {
    const raiz = base();
    sembrarAgentes(raiz);
    const ruta = join(rutaDeAgentes(raiz), "consultant-xone.md");
    writeFileSync(ruta, "---\ndescripcion: el mío\n---\nMIS INSTRUCCIONES", "utf8");

    expect(restaurarAgente(raiz, "consultant-xone")).toBe(true);
    const docs = AGENTES_DE_SERIE.find((a) => a.nombre === "consultant-xone")!;
    expect(readFileSync(ruta, "utf8")).toBe(escribirAgente(docs));
  });

  /**
   * Y esto es lo que el borrado no daba: el agente vuelve al carril de las actualizaciones.
   *
   * No se escribe la marca aquí a propósito: la reanota la siembra siguiente, que corre
   * ANTES de cualquier lectura (`cargarAgentes` la llama primero) y que ya sabe reconocer su
   * propio hash. Escribirla también sería un segundo sitio donde decidir sobre la marca, y
   * el único que puede resucitar lo que el usuario borró.
   */
  it("vuelve al carril: la siembra siguiente lo re-anota y ya no lo da por tocado", () => {
    const raiz = base();
    sembrarAgentes(raiz);
    writeFileSync(join(rutaDeAgentes(raiz), "consultant-xone.md"), "---\ndescripcion: mío\n---\nMÍO", "utf8");
    expect(sembrarAgentes(raiz).desactualizados).toEqual(["consultant-xone"]);

    restaurarAgente(raiz, "consultant-xone");
    const despues = sembrarAgentes(raiz);
    expect(despues.desactualizados).toEqual([]);
    expect(despues.escritos).toEqual([]);
  });

  it("de uno que no es de serie no hay nada que restaurar, y se dice", () => {
    // Devuelve si pudo, como `borrarAgente`: la interfaz no puede decir «restaurado» de algo
    // de lo que no tenemos ninguna versión.
    const raiz = base();
    sembrarAgentes(raiz);
    guardarAgente(raiz, {
      nombre: "mio",
      descripcion: "el mío",
      motor: "modelo",
      soloLectura: true,
      skills: [],
      instrucciones: "",
      origen: "global",
    });
    expect(restaurarAgente(raiz, "mio")).toBe(false);
    expect(existsSync(join(rutaDeAgentes(raiz), "mio.md"))).toBe(true);
  });

  it("restaura uno que el usuario había BORRADO: la siembra ya no lo traía", () => {
    // El caso que dejaba el agujero abierto. Borrarlo era irreversible desde la consola.
    const raiz = base();
    sembrarAgentes(raiz);
    borrarAgente(raiz, "designer-xone");
    sembrarAgentes(raiz);
    expect(existsSync(join(rutaDeAgentes(raiz), "designer-xone.md"))).toBe(false);

    expect(restaurarAgente(raiz, "designer-xone")).toBe(true);
    expect(existsSync(join(rutaDeAgentes(raiz), "designer-xone.md"))).toBe(true);
  });
});

/**
 * Renombrar, que es `renameSync` y LUEGO escribir — nunca escribir y luego borrar.
 *
 * El orden importa y es la única razón de que esto sea una función y no dos llamadas: un
 * fallo entre los dos pasos deja UN fichero (el renombrado, con el contenido viejo), nunca
 * dos con el mismo prompt ni cero. Al revés, una excepción entre el `write` y el `rm` deja
 * los DOS —que es exactamente lo que el campo deshabilitado del formulario evitaba— y el
 * usuario ve dos subagentes con la misma descripción y no sabe cuál toca el orquestador.
 */
describe("renombrarAgente", () => {
  const propio = (nombre: string, descripcion = "el mío"): Agente => ({
    nombre,
    descripcion,
    motor: "modelo",
    soloLectura: true,
    skills: [],
    instrucciones: "cuerpo",
    origen: "global",
  });

  it("mueve el `.md` y escribe el contenido nuevo en el mismo paso", () => {
    // Las dos cosas a la vez porque el formulario permite cambiar el nombre Y la descripción
    // en la misma pulsación: guardar solo una de las dos dejaría la pantalla mintiendo.
    const raiz = base();
    guardarAgente(raiz, propio("advisor"));

    expect(renombrarAgente(raiz, "advisor", propio("segunda-opinion", "revisada"))).toBe("hecho");
    expect(existsSync(join(rutaDeAgentes(raiz), "advisor.md"))).toBe(false);
    const { agentes, problemas } = leerCarpetaDeAgentes(rutaDeAgentes(raiz), "global");
    expect(problemas).toEqual([]);
    expect(agentes.map((a) => [a.nombre, a.descripcion])).toEqual([["segunda-opinion", "revisada"]]);
  });

  it("NO pisa el destino si ya existe, y deja el origen donde estaba", () => {
    // Es la guarda que de verdad importa: sin ella, renombrar `advisor` a `docs` se llevaba
    // por delante el `docs.md` de serie —o el otro subagente del usuario— sin decir nada.
    // «El destino ya existe» cubre los dos casos, y es el motivo honesto: no hace falta un
    // caso especial para los de serie.
    const raiz = base();
    sembrarAgentes(raiz);
    guardarAgente(raiz, propio("advisor"));
    const docsAntes = readFileSync(join(rutaDeAgentes(raiz), "consultant-xone.md"), "utf8");

    expect(renombrarAgente(raiz, "advisor", propio("consultant-xone"))).toBe("destino-ocupado");
    expect(readFileSync(join(rutaDeAgentes(raiz), "consultant-xone.md"), "utf8")).toBe(docsAntes);
    expect(existsSync(join(rutaDeAgentes(raiz), "advisor.md"))).toBe(true);
  });

  it("sin origen no se inventa nada: no se escribe el destino", () => {
    // Escribirlo convertiría un renombrado de algo que ya no está en un alta silenciosa, con
    // el contenido de una pantalla que se abrió sobre un fichero que alguien borró a mano.
    const raiz = base();
    expect(renombrarAgente(raiz, "fantasma", propio("nuevo"))).toBe("sin-origen");
    expect(existsSync(join(rutaDeAgentes(raiz), "nuevo.md"))).toBe(false);
  });

  it("un nombre nuevo inválido LANZA, y no toca el origen", () => {
    // `segmentoSeguro`, la misma de `guardarAgente`: el nombre llega del cliente por HTTP y
    // un `../../.env` compondría una ruta fuera de la carpeta. Se comprueba ANTES de mover.
    const raiz = base();
    guardarAgente(raiz, propio("advisor"));
    expect(() => renombrarAgente(raiz, "advisor", propio("../fuera"))).toThrow();
    expect(existsSync(join(rutaDeAgentes(raiz), "advisor.md"))).toBe(true);
  });

  it("el renombrado de un de serie no se impide AQUÍ: eso lo decide quien llama", () => {
    // Esta función mueve un fichero. Que un de serie no se pueda renombrar es una regla del
    // producto y vive en el servidor, junto a la de que no se borra — dos sitios donde
    // decidir lo mismo es cómo uno de los dos se queda sin la regla.
    const raiz = base();
    sembrarAgentes(raiz);
    expect(renombrarAgente(raiz, "consultant-xone", propio("mis-docs"))).toBe("hecho");
  });
});

describe("esDeSerie", () => {
  it("dice los cinco de serie y ningún otro", () => {
    // Es la guarda del servidor: un `borrar` de uno de serie se RECHAZA ahí, no solo se le
    // esconde el icono al cliente. Esconder el botón es presentación.
    for (const a of AGENTES_DE_SERIE) expect(esDeSerie(a.nombre)).toBe(true);
    expect(esDeSerie("advisor")).toBe(false);
    // El renombrado tampoco: dejó de ser de serie, y su `.md` es del usuario y se borra.
    expect(esDeSerie("probador")).toBe(false);
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
    expect(existsSync(join(rutaDeAgentes(raiz), "developer-xone.md"))).toBe(true);
  });

  it("borrar dice si existía: no se puede decir «borrado» de algo que no estaba", () => {
    const raiz = base();
    expect(borrarAgente(raiz, "fantasma")).toBe(false);
  });
});

describe("las skills que piden los agentes de serie", () => {
  it("todas EXISTEN en el catálogo del disco", () => {
    // `rutasDeSkills` (`xoneAgent.ts`) filtra contra el catálogo y **descarta en silencio** el
    // nombre que no esté: renombrar una skill sin tocar la semilla dejaba al agente sin ella,
    // sin un solo error y con el suite entero en verde. Pasó al traer `xone-hotswap` —la
    // semilla decía `xone-android-hotswap`—, y el test que lo habría cazado no existía: los
    // que tocan `rutasDeSkills` usan `SkillsEnMemoria`, un doble con su propia lista, así que
    // comparaban el catálogo consigo mismo.
    //
    // Esto es lo que lo convierte en rojo, y vale para el próximo renombrado igual.
    const catalogo = new Set(new SkillsEnDisco().catalogo().map((s) => s.nombre));
    for (const agente of AGENTES_DE_SERIE) {
      for (const skill of agente.skills) {
        expect(catalogo.has(skill), `${agente.nombre} pide «${skill}», que no está en el catálogo`).toBe(true);
      }
    }
  });
});
