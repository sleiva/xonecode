import { describe, expect, it } from "vitest";
import { CloudStudioEnMemoria } from "../core/ports.js";
import { enumerarRemoto } from "./manifiesto.js";

describe("enumerarRemoto", () => {
  // Orden deliberado: cada subdirectorio deja un superviviente en los primeros N,
  // porque el doble corta por orden de inserción del objeto, no alfabético. Con
  // "doc/guia.md" al final (como en una redacción "natural" del fixture), un tope de 2
  // la deja fuera del todo y NINGUNA consulta por directorio puede recuperarla — no hay
  // ninguna entrada que la mencione. Eso no es un fallo del recorrido: es que el propio
  // fixture haría la tarea irresoluble. Con este orden, en cambio, el truncado SÍ se puede
  // sortear recorriendo los directorios que si asoman.
  const textos = {
    "app.xml": "<app/>",
    "icons/a.svg": "<svg/>",
    "doc/guia.md": "# guía",
    "icons/b.svg": "<svg/>",
  };

  it("devuelve todo cuando no hay truncado", async () => {
    const puerto = new CloudStudioEnMemoria({ textos });
    await puerto.abrir("Demo");
    const { manifiesto, raizTruncada } = await enumerarRemoto(puerto);
    expect(manifiesto.map((e) => e.ruta)).toEqual(["app.xml", "doc/guia.md", "icons/a.svg", "icons/b.svg"]);
    expect(raizTruncada).toBe(false);
  });

  it("recorre subdirectorios cuando el servidor trunca", async () => {
    const puerto = new CloudStudioEnMemoria({ textos, topeEstructura: 3 });
    await puerto.abrir("Demo");
    // Comprueba la premisa: la llamada única YA viene incompleta. Si esto no fuera cierto
    // el test pasaría igual con una implementación que ni recorriera subdirectorios.
    expect((await puerto.estructura()).entradas.length).toBeLessThan(4);
    const { manifiesto, raizTruncada } = await enumerarRemoto(puerto);
    expect(manifiesto.map((e) => e.ruta).sort()).toEqual(["app.xml", "doc/guia.md", "icons/a.svg", "icons/b.svg"]);
    // La raíz vino truncada aunque el recorrido por ancestros haya recuperado TODO en
    // este fixture concreto: no hay forma de saberlo desde el cliente, así que se
    // declara siempre — la certeza de "sí lo cubrí todo" no la puede dar este código.
    expect(raizTruncada).toBe(true);
  });

  it("recorre directorios anidados aunque el truncado esconda un directorio hermano", async () => {
    // "a/d/e.txt" solo se descubre pidiendo "a" (el ANCESTRO, no el padre inmediato de lo
    // que sí sobrevivió al corte). Si el recorrido solo encolara el padre directo de cada
    // ruta vista ("a/b"), nunca llegaría a pedir "a" y "a/d/e.txt" quedaría sin enumerar.
    const anidados = {
      "root.txt": "r",
      "a/b/c.txt": "c",
      "a/d/e.txt": "e",
    };
    const puerto = new CloudStudioEnMemoria({ textos: anidados, topeEstructura: 2 });
    await puerto.abrir("Demo");
    expect((await puerto.estructura()).entradas.length).toBeLessThan(3);
    const { manifiesto } = await enumerarRemoto(puerto);
    expect(manifiesto.map((e) => e.ruta).sort()).toEqual(["a/b/c.txt", "a/d/e.txt", "root.txt"]);
  });

  it("declara la raíz truncada cuando esconde un directorio que ningún otro fichero menciona", async () => {
    // "secreto/x.txt" no comparte prefijo con NADA más: si el corte de la raíz lo deja
    // fuera, ningún ancestro visto lo vuelve a pedir jamás, y se pierde en silencio. Una
    // implementación que solo mirara si el manifiesto "parece completo" no lo notaría.
    const conOculto = { "app.xml": "1", "icons/a.svg": "2", "secreto/x.txt": "3" };
    const puerto = new CloudStudioEnMemoria({ textos: conOculto, topeEstructura: 2 });
    await puerto.abrir("Demo");
    const { manifiesto, raizTruncada } = await enumerarRemoto(puerto);
    expect(manifiesto.some((e) => e.ruta === "secreto/x.txt")).toBe(false);
    expect(raizTruncada).toBe(true);
  });

  it("no duplica una entrada vista dos veces", async () => {
    const puerto = new CloudStudioEnMemoria({ textos, topeEstructura: 3 });
    await puerto.abrir("Demo");
    const { manifiesto } = await enumerarRemoto(puerto);
    // El tamaño a secas no basta: un acumulador con repetidos también podría dar un Set
    // del mismo tamaño que un array vacío. Fijar el total además del "sin duplicados"
    // es lo que distingue "faltan todas" de "no hay repetidas".
    expect(manifiesto).toHaveLength(4);
    expect(new Set(manifiesto.map((e) => e.ruta)).size).toBe(manifiesto.length);
  });

  it("un directorio que falla no tira la enumeración", async () => {
    const puerto = new CloudStudioEnMemoria({ textos, topeEstructura: 2 });
    await puerto.abrir("Demo");
    const roto = {
      ...puerto,
      estructura: async (dir?: string) =>
        dir === "icons" ? Promise.reject(new Error("boom")) : puerto.estructura(dir),
    } as typeof puerto;
    const { manifiesto, noEnumerados } = await enumerarRemoto(roto);
    expect(manifiesto.some((e) => e.ruta === "app.xml")).toBe(true);
    expect(noEnumerados).toEqual(["icons"]);
  });
});
