import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
import { puedeEscribirRuta } from "../grafo/perfiles.js";
import { FICHEROS_DE_UN_PLAN } from "../../core/planes.js";
import { escribirAgente, fusionarAgentes, type Agente } from "../../core/agentes.js";
import { RAIZ_SKILLS, SkillsEnDisco } from "../grafo/skills.js";
import { crearNavegacionXone } from "../grafo/navegacionXone.js";

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
    expect(sembrarAgentes(raiz).escritos.sort()).toEqual(["analyst-xone", "consultant-xone", "designer-xone", "developer-xone", "device-controller", "document-writer"]);
    const { agentes, problemas } = leerCarpetaDeAgentes(rutaDeAgentes(raiz), "global");
    expect(problemas).toEqual([]);
    expect(agentes.map((a) => a.nombre).sort()).toEqual(["analyst-xone", "consultant-xone", "designer-xone", "developer-xone", "device-controller", "document-writer"]);
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
    expect(sembrarAgentes(raiz).escritos).toHaveLength(6);
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
    rmSync(join(carpeta, "device-controller.md"));
    const rutaMarca = join(carpeta, FICHERO_DE_SEMILLA);
    const marca = JSON.parse(readFileSync(rutaMarca, "utf8")) as Record<string, string>;
    delete marca["device-controller"];
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
    expect(siembra.escritos).toEqual(["device-controller"]);
    expect(siembra.retirados).toEqual([
      { nombre: "probador", ahoraSeLlama: "device-controller", borrado: true },
    ]);
    expect(existsSync(rutaViejo)).toBe(false);
    expect(existsSync(join(rutaDeAgentes(raiz), "device-controller.md"))).toBe(true);
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
      { nombre: "probador", ahoraSeLlama: "device-controller", borrado: false },
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
      ["xone-device-tester", "device-controller"],
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
      "device-controller",
      "document-writer",
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
      ahoraSeLlama: "device-controller",
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

  /**
   * Este test guardaba la MUDANZA de los textos de código a los `.md` comprobando frases
   * literales. Esa mudanza acabó hace mucho, y las descripciones SE REDISEÑARON a propósito:
   * dejaron de decir lo que cada agente ES y pasaron a decir cómo se USA —cuándo llamarlo, qué
   * darle y qué devuelve—, que es la convención de los ejemplos de deepagents
   * (`research-agent`: «Only give this researcher ONE topic at a time…»). Una descripción es
   * lo que el orquestador lee para repartir, así que una frase de identidad le dice menos que
   * una instrucción de uso.
   *
   * Lo que se comprueba ahora es la SUSTANCIA, no la redacción: que quien escribe avisa de que
   * se aprueba, y que los papeles siguen siendo los que son.
   */
  it("las descripciones dicen cómo se USA cada uno, y las capacidades no han cambiado", () => {
    const dev = AGENTES_DE_SERIE.find((a) => a.nombre === "developer-xone")!;
    expect(dev.descripcion).toMatch(/aprobaci[oó]n/i);
    expect(dev.soloLectura).toBe(false);
    // Y todas dicen qué DEVUELVEN, que es la mitad que hace falta para encadenarlas.
    for (const a of AGENTES_DE_SERIE) {
      expect(a.descripcion, a.nombre).toMatch(/[Dd]evuelve/);
    }
    const docs = AGENTES_DE_SERIE.find((a) => a.nombre === "consultant-xone")!;
    expect(docs.soloLectura).toBe(true);
    // Las particularidades que vivían en un `nombre === "planner"` dentro de `promptDe`
    // ahora están en el cuerpo de su fichero, que es donde se pueden leer y ajustar.
    const planner = AGENTES_DE_SERIE.find((a) => a.nombre === "analyst-xone")!;
    expect(planner.instrucciones).toContain("HANDOFF DE ANÁLISIS");
  });

  /**
   * El prompt de `device-controller` NOMBRA sus scripts y promete que están en el PATH. Un
   * nombre que no existe es el botón muerto de siempre, solo que en un prompt: el modelo lo
   * llama, `sh` contesta «command not found», y lo que hace entonces —medido— es apañárselas
   * por su cuenta, que es como apareció un `.png` en la raíz del proyecto del usuario. Se
   * comprueba contra el catálogo REAL del paquete, y en las DOS direcciones: un script nuevo
   * que no se nombre tampoco existe para quien tiene que usarlo.
   */
  /**
   * El prompt del conductor le dice cómo ORIENTARSE: que `xone_navegacion` con
   * `operacion: "referencias"` le da el control que lleva a una colección. Medido sobre
   * AppDemo, esa llamada devuelve `EntradaApp.MAP_BT_CALCULADORA_DR --script--> Calculadora`,
   * que es justo lo que hay que pulsar.
   *
   * **Y la operación se comprueba contra el ESQUEMA REAL de la tool**, por lo mismo que los
   * scripts se comprueban contra el catálogo: un nombre de operación que no existe hace que
   * la tool rechace la llamada, y entonces el modelo se pone a adivinar argumentos — un viaje
   * y un error de esquema, justo cuando venía a orientarse.
   */
  it("la operación de navegación que el prompt NOMBRA existe en el esquema de la tool", () => {
    const conductor = AGENTES_DE_SERIE.find((a) => a.nombre === "device-controller")!;
    expect(conductor.instrucciones).toContain("xone_navegacion");

    const nombradas = [...conductor.instrucciones.matchAll(/operacion:\s*\\?"([a-z]+)\\?"/g)].map((m) => m[1]!);
    expect(nombradas.length).toBeGreaterThan(0);

    const esquema = crearNavegacionXone(
      () => {
        throw new Error("el esquema no necesita índice");
      },
      new Set()
    ).schema as { safeParse(v: unknown): { success: boolean } };
    for (const operacion of nombradas) {
      expect(
        esquema.safeParse({ operacion, nombre: "Calculadora" }).success,
        `el prompt nombra la operación «${operacion}» y la tool no la acepta`
      ).toBe(true);
    }
  });

  /**
   * MEDIDO: en un turno real el conductor gastó su presupuesto haciendo `grep` de
   * `MAP_BT_ACEPTAR`, `function hacerLogin` y `Usuarios` para deducir las credenciales del
   * código — y se quedó en la pantalla de login con 285k tokens gastados. La respuesta estaba
   * a UNA orden: `runSql` contra la tabla de usuarios del aparato devolvió `LOGIN "admin"` y
   * `PWD` vacío, y con eso se entra.
   *
   * **Y el final de la regla no es cosmético**: un subagente no tiene canal para preguntar a
   * nadie a mitad de turno, así que «pedírselo al usuario» solo puede ser pararse y decir qué
   * falta. Lo que no puede es seguir probando contraseñas.
   */
  it("le dice cómo entrar cuando la app pide login, y qué hacer si no puede", () => {
    const conductor = AGENTES_DE_SERIE.find((a) => a.nombre === "device-controller")!;

    expect(conductor.instrucciones).toContain("runSql");
    expect(conductor.instrucciones).toMatch(/_usuarios/);
    expect(conductor.instrucciones).toMatch(/autologon/);
    // Pararse y decirlo, en vez de seguir adivinando.
    expect(conductor.instrucciones).toMatch(/PÁRATE/);
  });

  /**
   * Lo que lo separa de «prueba a ver»: MEDIDO contra el aparato, el control que da la tool
   * (`MAP_BT_CALCULADORA_DR`) NO se puede pulsar de primeras — vive en un cajón cerrado y el
   * aparato contesta «not found or not enabled». Si el prompt no dice qué hacer entonces, el
   * modelo repite el mismo clic.
   */
  it("y le dice qué hacer cuando ese control no está en pantalla", () => {
    const conductor = AGENTES_DE_SERIE.find((a) => a.nombre === "device-controller")!;

    expect(conductor.instrucciones).toMatch(/no aparece en el árbol/);
    expect(conductor.instrucciones).toMatch(/en vez de repetir el mismo clic/);
  });

  it("todos los scripts que el prompt NOMBRA existen y son ejecutables, y al revés", () => {
    const conductor = AGENTES_DE_SERIE.find((a) => a.nombre === "device-controller")!;
    const nombrados = new Set(
      [...conductor.instrucciones.matchAll(/`(xone-[a-z0-9-]+)`/g)].map((m) => m[1]!)
    );
    const carpeta = join(RAIZ_SKILLS, "xone-hotswap", "scripts");
    const enDisco = new Set(readdirSync(carpeta));

    expect(nombrados.size).toBeGreaterThan(0);
    for (const nombre of nombrados) {
      expect(enDisco.has(nombre), `el prompt nombra «${nombre}» y no está en scripts/`).toBe(true);
      // Sin el bit de ejecución el PATH no lo encuentra, y el síntoma es idéntico al de que
      // no exista: se comprueba aparte porque `npm pack` y git lo conservan, pero un fichero
      // creado a mano no lo trae.
      expect(statSync(join(carpeta, nombre)).mode & 0o111).toBeGreaterThan(0);
    }
    for (const nombre of enDisco) {
      expect(nombrados.has(nombre), `«${nombre}» existe y el prompt no lo nombra`).toBe(true);
    }
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
          "device-controller",
          "document-writer",
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

  /**
   * El renombrado que SOLO cambia las mayúsculas, que es el caso más común de todos.
   *
   * Medido en una máquina de verdad: APFS es INSENSIBLE a mayúsculas, así que con un
   * `Documentador.md` en disco el `existsSync` de `documentador.md` contesta SÍ —es el mismo
   * fichero— y la guarda del destino ocupado rechazaba justo el arreglo que el aviso del
   * cargador propone. Se compara por inodo: si el «destino» ES el origen, no hay nada ocupado.
   *
   * Y en un sistema SENSIBLE los dos son ficheros distintos, con inodos distintos, así que la
   * comparación sigue diciendo la verdad ahí: si el otro existe de verdad, se rechaza.
   */
  it("renombrar solo las MAYÚSCULAS vale, aunque el sistema de ficheros no las distinga", () => {
    const raiz = base();
    const carpeta = rutaDeAgentes(raiz);
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, "Documentador.md"), "---\ndescripcion: el mío\n---\ncuerpo", "utf8");

    expect(renombrarAgente(raiz, "Documentador", propio("documentador", "el mío"))).toBe("hecho");
    const { agentes } = leerCarpetaDeAgentes(carpeta, "global");
    expect(agentes.map((a) => a.nombre)).toEqual(["documentador"]);
    // Y no quedan dos: en un sistema sensible el viejo se habría movido, y en uno insensible
    // el nombre del único fichero es el nuevo.
    expect(readdirSync(carpeta).filter((f) => f.endsWith(".md"))).toEqual(["documentador.md"]);
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
    expect(sembrarAgentes(raiz).escritos).toHaveLength(6);
  });

  it("una carpeta VACÍA sin marca se siembra, no se adopta", () => {
    // No viene de ninguna siembra: la deja un guardado fallido. Adoptarla anotaría los cinco
    // como entregados sin escribir uno solo, y ese usuario se quedaría sin ningún subagente
    // para siempre.
    const raiz = base();
    mkdirSync(rutaDeAgentes(raiz), { recursive: true });
    expect(sembrarAgentes(raiz).escritos).toHaveLength(6);
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

describe("la ejecución es de UNO, y se comprueba", () => {
  it("solo `device-controller` la trae de serie", () => {
    // Es la guarda contra el «ya que estamos»: conceder ejecución a un especialista más es
    // darle el disco entero, porque una shell no pasa por `permisosDe` ni por `virtualMode`.
    // Que se note aquí y no en producción.
    expect(AGENTES_DE_SERIE.filter((a) => a.ejecucion === true).map((a) => a.nombre)).toEqual([
      "device-controller",
    ]);
  });

  it("el que ejecuta NO es de solo lectura, y ese campo además le elige el modelo", () => {
    // `soloLectura` se refiere a los FICHEROS, pero decide el papel: `rapido` para quien solo
    // lee, `trabajo` para quien escribe. Un agente con shell marcado «solo lectura» miente dos
    // veces: dice que no puede tocar nada —puede tocar el disco entero— y se lleva el modelo
    // barato para un trabajo que es leer un log y entender una excepción.
    const conductor = AGENTES_DE_SERIE.find((a) => a.nombre === "device-controller")!;
    expect(conductor.soloLectura).toBe(false);
    for (const otro of AGENTES_DE_SERIE.filter((a) => a.ejecucion !== true)) {
      expect(otro.ejecucion).toBeUndefined();
    }
  });

  it("y su `.md` la lleva escrita, que es de donde sale al recargarlo", () => {
    const conductor = AGENTES_DE_SERIE.find((a) => a.nombre === "device-controller")!;
    expect(escribirAgente(conductor)).toContain("ejecucion: true");
  });

  it("los demás no la mencionan siquiera", () => {
    for (const a of AGENTES_DE_SERIE.filter((x) => x.nombre !== "device-controller")) {
      expect(escribirAgente(a)).not.toContain("ejecucion");
    }
  });
});

/**
 * Lo que se inyecta en deepagents por cada subagente es `- <nombre>: <descripción>`, y eso
 * viaja en CADA llamada del orquestador. Así que estas cinco frases son a la vez lo único con
 * lo que reparte y un coste fijo: valen las dos comprobaciones.
 */
describe("las descripciones que ve el orquestador", () => {
  it("todas dicen cuándo usarlo, qué darle y qué devuelve", () => {
    for (const a of AGENTES_DE_SERIE) {
      expect(a.descripcion, `${a.nombre}: para qué`).toMatch(/^Para /);
      expect(a.descripcion, `${a.nombre}: qué darle`).toMatch(/[Dd]ale |[Dd]ile /);
      expect(a.descripcion, `${a.nombre}: qué devuelve`).toMatch(/[Dd]evuelve/);
    }
  });

  /**
   * **Y las que se pisan dicen dónde está la frontera.** Medido: el arreglo de un padding —CSS
   * puro— se lo llevó `developer-xone` y no `designer-xone`, porque la frontera era un adverbio
   * («cómo se VE» contra «cómo funciona»). Ahora cada una NOMBRA a la otra y dice por qué.
   */
  it("los que compiten se nombran y se deslindan", () => {
    const de = (n: string) => AGENTES_DE_SERIE.find((a) => a.nombre === n)!.descripcion;

    expect(de("designer-xone")).toContain("developer-xone");
    expect(de("device-controller")).toContain("developer-xone");
    expect(de("consultant-xone")).toMatch(/no para averiguar qué hay en el proyecto/);
    expect(de("analyst-xone")).toMatch(/no para preguntas de la plataforma/);
  });

  /**
   * **El plan por delante del reconocimiento, atado por POSICIÓN y no por presencia.**
   *
   * Las dos reglas ya estaban las dos en el prompt y aun así no salía ningún plan: medido el
   * 21-09-2026, cuatro delegaciones al analista y cero escrituras, porque
   * `RECONOCIMIENTO_PLANNER` acaba en «deja de llamar tools y responde» y el bloque del plan
   * caía DESPUÉS. Dos órdenes de parada opuestas, y gana la que se lee antes.
   *
   * Por eso esto compara ÍNDICES: un test de `toContain` seguiría verde con el orden
   * invertido, que es exactamente el estado que no producía planes. Y por eso la frase de la
   * primera escritura se ata aparte — sin ella, el orden solo adelanta la misma instrucción
   * de «escribe al final».
   */
  it("al analista se le manda escribir el plan ANTES de terminar de investigar", () => {
    const analista = AGENTES_DE_SERIE.find((a) => a.nombre === "analyst-xone")!;
    const prompt = analista.instrucciones;

    const plan = prompt.indexOf("PREPARAR O ENCARAR UN CAMBIO");
    const pararYResponder = prompt.indexOf("deja de llamar tools y responde");
    expect(plan).toBeGreaterThanOrEqual(0);
    expect(pararYResponder).toBeGreaterThanOrEqual(0);
    expect(plan).toBeLessThan(pararYResponder);

    // La primera escritura es el plan, y va ANTES de acabar de investigar.
    expect(prompt).toMatch(/PRIMERA escritura es `\/planes\/<nombre>\/PLAN\.md`/);
    expect(prompt).toMatch(/ANTES de terminar de\s+investigar/);
  });

  /**
   * El coste es real y conviene que salte si alguien lo dobla sin querer: son ~800 tokens que
   * viajan en cada llamada del que más llamadas hace. No es un límite de diseño, es un aviso.
   */
  it("y no se van de precio sin que nadie se entere", () => {
    const total = AGENTES_DE_SERIE.reduce((n, a) => n + `- ${a.nombre}: ${a.descripcion}`.length, 0);

    expect(total).toBeLessThan(4500);
  });
});

/**
 * El plan que el analista PROMETE, cruzado con lo que el código le deja hacer.
 *
 * Es la prueba de la CLASE de fallo que esto arregla, y no del caso: durante semanas su
 * ficha decía «puede dejar un PLAN en `/planes/<nombre>/`» y ningún proyecto tuvo jamás uno.
 * Una promesa en un prompt solo es verdad si la ruta se puede escribir, las skills existen y
 * el agente las tiene declaradas — tres sitios distintos que nadie comparaba.
 */
describe("el plan del analista, prometido y posible", () => {
  const analista = AGENTES_DE_SERIE.find((a) => a.nombre === "analyst-xone")!;

  it("escribe donde dice que escribe, y NO en el proyecto", () => {
    expect(analista.instrucciones).toContain("/planes/<nombre>/");
    expect(puedeEscribirRuta(analista, "/planes/login-biometrico/PLAN.md")).toBe(true);
    expect(puedeEscribirRuta(analista, "/planes/login-biometrico/TASKS.md")).toBe(true);
    // Sigue siendo de solo lectura para la app del cliente, que es lo que no se toca.
    expect(puedeEscribirRuta(analista, "/Menu.xne")).toBe(false);
    expect(analista.soloLectura).toBe(true);
  });

  it("las skills que su prompt NOMBRA las tiene declaradas y existen en el catálogo real", () => {
    // Un nombre muerto en un prompt manda al modelo a apañárselas solo: la misma regla que
    // ya se aplica a los scripts que nombra el conductor.
    for (const skill of ["xone-spec-builder", "xone-plan-builder"]) {
      expect(analista.instrucciones, skill).toContain(skill);
      expect(analista.skills, skill).toContain(skill);
      expect(existsSync(join(RAIZ_SKILLS, skill, "SKILL.md")), skill).toBe(true);
    }
  });

  it("y los tres ficheros del plan son los que el que desarrolla va a buscar", () => {
    // `TRABAJAR_CON_PLAN` lee `TASKS.md` y se apoya en `PLAN.md` y `CONTEXT.md`. Si el
    // analista escribiera otros nombres, el plan existiría y nadie lo leería.
    for (const f of FICHEROS_DE_UN_PLAN) expect(analista.instrucciones, f).toContain(f);
  });

  it("una decisión que no puede tomar se deja PENDIENTE, no se inventa", () => {
    // Las dos skills entrevistan y un subagente no tiene a quién entrevistar.
    expect(analista.instrucciones).toMatch(/PENDIENTE/);
    expect(analista.instrucciones).toMatch(/No la\s+inventes|no la inventes/);
  });
});

/**
 * **Lo que la FICHA promete es lo que el orquestador acaba pidiendo.**
 *
 * La ficha de un subagente es lo que el orquestador lee para decidir qué encargarle, así que
 * lo que ahí figure como «devuelve X» se convierte en una petición de X. Medido sobre una
 * sesión real: la ficha de `device-controller` listaba la captura entre lo que devuelve
 * —«devuelve lo que MIDIÓ: salida literal, captura y excepciones del log»— y el conductor
 * capturaba tres veces en una delegación, después de haber leído ya `screen` Y el log.
 *
 * No era que no supiera la jerarquía: su propio prompt dice que la captura va la ÚLTIMA y
 * cuánto cuesta. Es que se la habían encargado, y gana quien escribe el encargo. Y encima
 * tiene una segunda factura, porque una captura del turno se lleva al crítico visual.
 */
describe("la ficha de device-controller no encarga capturas de oficio", () => {
  const conductor = AGENTES_DE_SERIE.find((a) => a.nombre === "device-controller");

  it("existe y dice lo que devuelve", () => {
    expect(conductor?.descripcion).toMatch(/Devuelve lo que MIDIÓ/);
  });

  it("la lista de lo que DEVUELVE no incluye la captura", () => {
    // Solo el tramo entre guiones largos: lo que se promete de oficio.
    const promete = /Devuelve lo que MIDIÓ —([^—]*)—/.exec(conductor?.descripcion ?? "")?.[1] ?? "";
    expect(promete, "el tramo de lo prometido no se encontró").not.toBe("");
    expect(promete).not.toMatch(/captura/i);
    // Y lo que sí promete sigue estando: sin esto el test pasaría con la frase borrada.
    expect(promete).toMatch(/salida literal/);
    expect(promete).toMatch(/log/);
  });

  it("y si la nombra, es CONDICIONADA a lo visual", () => {
    // No se prohíbe la palabra: pedirla cuando el fallo es visual es justo su caso de uso.
    // Lo que no puede es aparecer sin condición, que es como se convierte en rutina.
    const d = conductor?.descripcion ?? "";
    if (/captura/i.test(d)) expect(d).toMatch(/captura[\s\S]*?(solo si|VISUAL)/i);
  });
});
