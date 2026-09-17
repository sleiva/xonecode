import { describe, it, expect } from "vitest";
import { crearNavegacionXone, LIMITES_NAVEGACION } from "./navegacionXone.js";
import { construirIndice, type ModeloDeNavegacion } from "../../core/navegacion.js";
import type { CargarIndice } from "../navegacion/indiceEnDisco.js";

const MODELO: ModeloDeNavegacion = {
  colecciones: [
    {
      nombre: "Clientes",
      fichero: "/Clientes.xne",
      campos: [{ nombre: "NOMBRE", tipo: "T" }],
      referencias: [],
    },
    {
      nombre: "Pedidos",
      fichero: "/Pedidos.xne",
      campos: [],
      referencias: [{ desde: "Pedidos.CLIENTE", por: "mapcol", hacia: "Clientes" }],
    },
  ],
};

const cargarDe = (modelo: ModeloDeNavegacion): CargarIndice => async () => construirIndice(modelo);
const SIN_FICHEROS = new Set<string>();

/** La tool devuelve texto; invocarla es lo que hace el agente. */
const llamar = async (
  entrada: { operacion: "inventario" | "definicion" | "referencias" | "campos"; nombre?: string },
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
        referencias: [],
      })),
    };
    const r = await llamar({ operacion: "inventario" }, muchas);
    expect(r).toContain(`${LIMITES_NAVEGACION.inventario + 5} colecciones`);
    expect(r).toContain("… y 5 más");
  });

  it("un proyecto sin colecciones lo AFIRMA, no devuelve una lista vacía muda", async () => {
    expect(await llamar({ operacion: "inventario" }, { colecciones: [] })).toContain("no declara ninguna");
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
