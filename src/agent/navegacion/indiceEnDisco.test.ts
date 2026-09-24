import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indiceEnDisco, modeloEnDisco } from "./indiceEnDisco.js";
import { fotoDeColecciones } from "../../core/fotoDeColecciones.js";

/**
 * Contra DISCO de verdad, con `xone-linter` de verdad y un proyecto de mentira.
 *
 * Se puede porque el linter entra como LIBRERÍA y no como el binario `xone-simulator`: `npm
 * test` sigue sin necesitar nada instalado, que es el invariante de siempre. Es la prueba de
 * aceptación que el diseño pedía — dos `.xne` donde uno referencia al otro.
 */
function proyectoDePrueba(): string {
  const raiz = mkdtempSync(join(tmpdir(), "nav-xone-"));
  writeFileSync(
    join(raiz, "app.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<app name="Demo">\n  <include file="Clientes.xne"/>\n  <include file="Pedidos.xne"/>\n</app>\n`
  );
  writeFileSync(
    join(raiz, "Clientes.xne"),
    `<?xml version="1.0" encoding="utf-8"?>\n<coll name="Clientes">\n  <prop name="ID" type="N"/>\n  <prop name="NOMBRE" type="T"/>\n</coll>\n`
  );
  writeFileSync(
    join(raiz, "Pedidos.xne"),
    `<?xml version="1.0" encoding="utf-8"?>\n<coll name="Pedidos">\n  <prop name="CLIENTE" type="N" mapcol="Clientes" mapfld="NOMBRE"/>\n</coll>\n`
  );
  return raiz;
}

const ficherosDe = (raiz: string): ReadonlySet<string> => new Set(readdirSync(raiz).map((f) => `/${f}`));

describe("indiceEnDisco", () => {
  it("lee un proyecto de verdad y resuelve la referencia entre dos .xne", async () => {
    const raiz = proyectoDePrueba();
    const indice = await indiceEnDisco(raiz)(ficherosDe(raiz));

    expect(indice.inventario().map((d) => d.nombre).sort()).toEqual(["Clientes", "Pedidos"]);
    expect(indice.campos("Clientes").map((c) => `${c.nombre}:${c.tipo}`)).toEqual(["ID:N", "NOMBRE:T"]);
    expect(indice.referencias("Clientes")).toEqual([
      { desde: "Pedidos.CLIENTE", por: "mapcol", hacia: "Clientes", fichero: "/Pedidos.xne" },
      { desde: "Pedidos.CLIENTE", por: "mapfld", hacia: "Clientes.NOMBRE", fichero: "/Pedidos.xne" },
    ]);
  });

  it("y la definición de un campo apunta al fichero de SU colección", async () => {
    const raiz = proyectoDePrueba();
    const indice = await indiceEnDisco(raiz)(ficherosDe(raiz));
    expect(indice.definicion("Clientes.NOMBRE")).toEqual([
      { nombre: "NOMBRE", clase: "campo", fichero: "/Clientes.xne", coleccion: "Clientes", tipo: "T" },
    ]);
  });

  it("NINGUNA ruta de la máquina sale del índice", async () => {
    // De aquí sale texto que va al modelo y de ahí al cable. El temporal está bajo el tmpdir
    // del sistema, así que si una absoluta se colara, se vería.
    const raiz = proyectoDePrueba();
    const indice = await indiceEnDisco(raiz)(ficherosDe(raiz));
    const todo = JSON.stringify([indice.inventario(), indice.referencias("Clientes")]);
    expect(todo).not.toContain(raiz);
    expect(todo).not.toContain(tmpdir());
  });

  it("una vista APLANADA no entra en el índice", async () => {
    // `Clientes.xml` con un `Clientes.xne` al lado es lo que XOne Studio genera, y el agente
    // no debe abrirla. La guarda se reaplica en el adaptador porque una tool propia NO pasa
    // por el middleware de permisos.
    const raiz = proyectoDePrueba();
    writeFileSync(
      join(raiz, "Clientes.xml"),
      `<?xml version="1.0" encoding="utf-8"?>\n<coll name="ClientesAplanada">\n</coll>\n`
    );
    const indice = await indiceEnDisco(raiz)(ficherosDe(raiz));
    expect(indice.inventario().map((d) => d.fichero)).not.toContain("/Clientes.xml");
  });

  it("NO cachea: lo que el agente acaba de escribir se ve en la consulta siguiente", async () => {
    // Un índice viejo que dice que un campo existe cuando acaba de borrarse es peor que no
    // tener índice: es una respuesta con autoridad y equivocada.
    const raiz = proyectoDePrueba();
    const cargar = indiceEnDisco(raiz);
    expect((await cargar(ficherosDe(raiz))).definicion("Nueva")).toEqual([]);

    writeFileSync(
      join(raiz, "Nueva.xne"),
      `<?xml version="1.0" encoding="utf-8"?>\n<coll name="Nueva">\n  <prop name="X" type="T"/>\n</coll>\n`
    );
    writeFileSync(
      join(raiz, "app.xml"),
      `<?xml version="1.0" encoding="utf-8"?>\n<app name="Demo">\n  <include file="Clientes.xne"/>\n  <include file="Pedidos.xne"/>\n  <include file="Nueva.xne"/>\n</app>\n`
    );
    expect((await cargar(ficherosDe(raiz))).definicion("Nueva")).toHaveLength(1);
  });

  it("una carpeta sin `app.xml` LANZA, y ese es el contrato que la tool traduce", async () => {
    // Medido contra la librería: `XoneProject.load` no devuelve un modelo vacío, lanza. No se
    // traga aquí a propósito — quien decide qué hacer con eso es la tool, que lo convierte en
    // una frase para el modelo («usa read_file o grep») en vez de tumbar el turno. Tragárselo
    // aquí devolvería un índice vacío, que el agente leería como «este proyecto no tiene
    // colecciones»: una afirmación falsa con toda la autoridad de una respuesta.
    const vacia = mkdtempSync(join(tmpdir(), "nav-vacia-"));
    mkdirSync(join(vacia, "sub"), { recursive: true });
    await expect(indiceEnDisco(vacia)(new Set())).rejects.toThrow(/app\.xml/);
  });
});

describe("la foto de la pestaña Colecciones, contra disco de verdad", () => {
  it("sale del MISMO modelo que el índice, y sin ninguna ruta de la máquina", async () => {
    const raiz = proyectoDePrueba();
    const foto = fotoDeColecciones(await modeloEnDisco(raiz)(ficherosDe(raiz)));
    expect(foto.colecciones.map((c) => c.nombre).sort()).toEqual(["Clientes", "Pedidos"]);
    const clientes = foto.colecciones.find((c) => c.nombre === "Clientes")!;
    const indice = await indiceEnDisco(raiz)(ficherosDe(raiz));
    // Lo que la pestaña dice que le apunta es lo que la tool contestaría.
    expect(clientes.leApuntan).toEqual(indice.referencias("Clientes"));
    expect(JSON.stringify(foto)).not.toContain(raiz);
  });
});
