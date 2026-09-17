import { describe, it, expect } from "vitest";
import { crearNavegacionXone, LIMITES_NAVEGACION } from "./navegacionXone.js";
import { construirIndice, type ModeloDeNavegacion } from "../../core/navegacion.js";
import type { CargarIndice } from "../navegacion/indiceEnDisco.js";

/** Un `app` sin nada declarado. Vacío significa «no consta», no «no hay». */
const APP_VACIA = { entrada: [], login: [], estilos: [], conexiones: [] };


const MODELO: ModeloDeNavegacion = {
  colecciones: [
    {
      nombre: "Clientes",
      fichero: "/Clientes.xne",
      campos: [{ nombre: "NOMBRE", tipo: "T" }],
      eventos: [],
      nodos: [],
      conexiones: [],
      referencias: [],
    },
    {
      nombre: "Pedidos",
      fichero: "/Pedidos.xne",
      campos: [],
      eventos: [],
      nodos: [],
      conexiones: [],
      referencias: [{ desde: "Pedidos.CLIENTE", por: "mapcol", hacia: "Clientes" }],
    },
  ],
  app: APP_VACIA,
  referenciasDeScript: [],
};

const cargarDe = (modelo: ModeloDeNavegacion): CargarIndice => async () => construirIndice(modelo);
const SIN_FICHEROS = new Set<string>();

/** La tool devuelve texto; invocarla es lo que hace el agente. */
const llamar = async (
  entrada: {
    operacion: "inventario" | "definicion" | "referencias" | "campos" | "detalle" | "app" | "problemas";
    nombre?: string;
  },
  modelo = MODELO
): Promise<string> => String(await crearNavegacionXone(cargarDe(modelo), SIN_FICHEROS).invoke(entrada));

describe("xone_navegacion", () => {
  it("el inventario dice CUÁNTAS hay y dónde vive cada una", () => {
    // Es la pregunta que hoy se contesta leyendo los 41 ficheros.
    return llamar({ operacion: "inventario" }).then((r) => {
      expect(r).toContain("2 colecciones");
      expect(r).toContain("Clientes  /Clientes.xne");
    });
  });

  it("la definición de un campo dice su colección, su tipo y su fichero", async () => {
    expect(await llamar({ operacion: "definicion", nombre: "Clientes.NOMBRE" })).toBe(
      "Clientes.NOMBRE:T  /Clientes.xne"
    );
  });

  it("las referencias dicen POR QUÉ atributo, que es la mitad de la respuesta", async () => {
    expect(await llamar({ operacion: "referencias", nombre: "Clientes" })).toBe(
      "Pedidos.CLIENTE --mapcol--> Clientes  /Pedidos.xne"
    );
  });

  it("los campos salen con su tipo", async () => {
    expect(await llamar({ operacion: "campos", nombre: "Clientes" })).toContain("Clientes.NOMBRE:T");
  });

  it("lo que no existe NO es un error: se dice, y se dice cómo seguir", async () => {
    // Un «no encontrado» seco hace que el modelo pruebe otra ruta inventada, o peor, que dé
    // por hecho que no hacía falta. Misma postura que `porQueNo` con las vistas aplanadas.
    const r = await llamar({ operacion: "definicion", nombre: "NoExiste" });
    expect(r).toContain("No hay ninguna declaración");
    expect(r).toContain("inventario");
  });

  it("nadie que la referencie se dice nombrando los atributos que se miraron", async () => {
    const r = await llamar({ operacion: "referencias", nombre: "Pedidos" });
    expect(r).toContain("Nadie referencia");
    expect(r).toContain("mapcol");
  });

  it("sin `nombre` en una operación que lo pide, se pide con un ejemplo", async () => {
    expect(await llamar({ operacion: "definicion" })).toContain("Clientes.NOMBRE");
  });

  it("una lista larga se recorta DICIENDO cuánto se dejó fuera", async () => {
    // Una lista truncada en silencio se lee como la lista entera, y sobre eso se concluye
    // de más.
    const muchas: ModeloDeNavegacion = {
      colecciones: Array.from({ length: LIMITES_NAVEGACION.inventario + 5 }, (_, i) => ({
        nombre: `C${i}`,
        fichero: `/C${i}.xne`,
        campos: [],
        eventos: [],
        nodos: [],
        conexiones: [],
        referencias: [],
      })),
      app: APP_VACIA,
      referenciasDeScript: [],
    };
    const r = await llamar({ operacion: "inventario" }, muchas);
    expect(r).toContain(`${LIMITES_NAVEGACION.inventario + 5} colecciones`);
    expect(r).toContain("… y 5 más");
  });

  it("un proyecto sin colecciones lo AFIRMA, no devuelve una lista vacía muda", async () => {
    expect(await llamar({ operacion: "inventario" }, { colecciones: [], app: APP_VACIA, referenciasDeScript: [] })).toContain("no declara ninguna");
  });

  it("si el índice no se puede construir, se DEVUELVE el motivo y se ofrece la salida", async () => {
    // Devolver y no lanzar: deepagents le pasa el error al modelo, que puede seguir con
    // `read_file`; una excepción se llevaría el turno por delante.
    const rota: CargarIndice = async () => {
      throw new Error("ENOENT: no such file or directory, open '/Users/alguien/secreto'");
    };
    const r = String(await crearNavegacionXone(rota, SIN_FICHEROS).invoke({ operacion: "inventario" }));
    expect(r).toContain("No se pudo leer la estructura");
    expect(r).toContain("read_file");
    // Y el mensaje de Node NO viaja: lleva la ruta absoluta de la máquina.
    expect(r).not.toContain("/Users/alguien");
  });

  it("la tool se llama `xone_navegacion` y su descripción dice qué NO hace", async () => {
    // «No ve referencias calculadas en JavaScript» es un límite real del índice: decirlo en
    // la descripción es lo que evita que el modelo concluya que un uso no existe.
    const t = crearNavegacionXone(cargarDe(MODELO), SIN_FICHEROS);
    expect(t.name).toBe("xone_navegacion");
    expect(t.description).toContain("JavaScript");
    expect(t.description).toContain("grep");
  });
});

describe("la costura con el índice de disco", () => {
  it("una carpeta sin `app.xml` se convierte en una frase, no en un turno caído", async () => {
    // `XoneProject.load` lanza ahí (medido en `indiceEnDisco.test.ts`). El agente tiene que
    // poder seguir con `read_file`; y el mensaje de Node lleva la ruta absoluta, así que no
    // viaja.
    const comoElDisco: CargarIndice = async () => {
      throw new Error("No se encontró app.xml en /var/folders/xx/nav-vacia-1234");
    };
    const r = String(await crearNavegacionXone(comoElDisco, SIN_FICHEROS).invoke({ operacion: "inventario" }));
    expect(r).toContain("No se pudo leer la estructura");
    expect(r).not.toContain("/var/folders");
  });
});

describe("las operaciones nuevas", () => {
  const RICO: ModeloDeNavegacion = {
    colecciones: [
      {
        nombre: "Pedidos",
        fichero: "/Pedidos.xne",
        campos: [{ nombre: "ID", tipo: "N" }],
        referencias: [{ desde: "Pedidos", por: "contents", hacia: "NoExiste" }],
        eventos: ["before-edit", "onchange(CLIENTE)"],
        nodos: ["Recalcular"],
        conexiones: [],
      },
      {
        nombre: "Sola",
        fichero: "/Sola.xne",
        campos: [],
        referencias: [],
        eventos: [],
        nodos: [],
        conexiones: [],
      },
    ],
    app: { entrada: ["Pedidos"], login: ["LoginColl"], estilos: ["default.css"], conexiones: [] },
    referenciasDeScript: [],
  };

  it("`app` contesta por dónde arranca, que es la primera pregunta de un proyecto ajeno", async () => {
    const r = await llamar({ operacion: "app" }, RICO);
    expect(r).toContain("arranca por: Pedidos");
    expect(r).toContain("login: LoginColl");
    expect(r).toContain("default.css");
  });

  it("y sin entrypoint declarado lo DICE, en vez de dejar la fila en blanco", async () => {
    const r = await llamar({ operacion: "app" }, { colecciones: [], app: APP_VACIA, referenciasDeScript: [] });
    expect(r).toContain("no consta");
  });

  it("`detalle` junta campos, eventos y nodos de una colección", async () => {
    const r = await llamar({ operacion: "detalle", nombre: "Pedidos" }, RICO);
    expect(r).toContain("campos: ID:N");
    expect(r).toContain("eventos: before-edit onchange(CLIENTE)");
    expect(r).toContain("nodos: Recalcular");
  });

  it("y lo que está VACÍO no se pinta: una plantilla de «(ninguno)» cuesta en cada llamada", async () => {
    const r = await llamar({ operacion: "detalle", nombre: "Sola" }, RICO);
    expect(r).toContain("campos: (ninguno)");
    expect(r).not.toContain("eventos:");
    expect(r).not.toContain("nodos:");
  });

  it("`problemas` encuentra una referencia rota SIN saber el nombre que falta", async () => {
    // Era el hueco: el índice ya guardaba la referencia a `OperQueue`, pero solo se podía
    // encontrar preguntando por un nombre que es justo lo que se quiere descubrir.
    const r = await llamar({ operacion: "problemas" }, RICO);
    expect(r).toContain("NoExiste");
    expect(r).toContain("Pedidos --contents--> NoExiste");
  });

  it("las referencias de SCRIPT cuentan como referencias, y dicen que vienen de un script", async () => {
    // Es como navega una app XOne de verdad: los botones del menú abren colecciones con
    // `appData.getCollection('X')`, no con `mapcol`.
    const conScript: ModeloDeNavegacion = {
      ...RICO,
      referenciasDeScript: [
        { desde: "EntradaApp.MAP_BT_DEPORTES", por: "script", hacia: "Deportes", fichero: "/EntradaApp.xne" },
      ],
    };
    expect(await llamar({ operacion: "referencias", nombre: "Deportes" }, conScript)).toContain(
      "EntradaApp.MAP_BT_DEPORTES --script--> Deportes"
    );
  });

  it("y una rota que SOLO se ve desde un script también sale en `problemas`", async () => {
    const conScript: ModeloDeNavegacion = {
      ...RICO,
      referenciasDeScript: [
        { desde: "LoginColl:onload", por: "script", hacia: "Login", fichero: "/LoginColl.xne" },
      ],
    };
    const r = await llamar({ operacion: "problemas" }, conScript);
    expect(r).toContain("Login");
    expect(r).toContain("LoginColl:onload --script--> Login");
  });

  it("un proyecto sano lo AFIRMA, en vez de devolver dos listas vacías", async () => {
    const sano: ModeloDeNavegacion = {
      colecciones: [
        { nombre: "A", fichero: "/A.xne", campos: [], referencias: [], eventos: [], nodos: [], conexiones: [] },
      ],
      app: { entrada: ["A"], login: [], estilos: [], conexiones: [] },
      referenciasDeScript: [],
    };
    expect(await llamar({ operacion: "problemas" }, sano)).toContain("Ninguna referencia");
  });

  it("`detalle` de lo que no existe manda al inventario", async () => {
    expect(await llamar({ operacion: "detalle", nombre: "Fantasma" }, RICO)).toContain("inventario");
  });
});
