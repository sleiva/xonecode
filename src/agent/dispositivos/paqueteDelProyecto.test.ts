import { mkdirSync, mkdtempSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { empaquetarProyecto, TOPE_DE_PAQUETE } from "./paqueteDelProyecto.js";

function escribir(raiz: string, ficheros: readonly string[]): void {
  for (const fichero of ficheros) {
    mkdirSync(dirname(join(raiz, fichero)), { recursive: true });
    writeFileSync(join(raiz, fichero), `contenido de ${fichero}`);
  }
}

/**
 * Un proyecto de mentira con un pie en cada regla del filtro. `objects.xml` va con su
 * `objects.xne` al lado a propósito: es una VISTA APLANADA, y tiene que entrar.
 */
const PROYECTO = [
  "app.xml",
  "app.ini",
  "objects.xml",
  "objects.xne",
  "icons/a.png",
  ".env",
  "db.key",
  ".git/config",
  ".xonecode/checkpoint.sqlite",
  "bd/gestion.db",
  "bd/gestion.db-wal",
  "files/datos.db", // fuera de bd/ y con `-wal` al lado: la regla es por NOMBRE
];

const nuevoProyecto = (ficheros: readonly string[] = PROYECTO): string => {
  const raiz = mkdtempSync(join(tmpdir(), "xc-paquete-"));
  escribir(raiz, ficheros);
  return raiz;
};

/** El árbol que hay en disco, relativo y ordenado: para comprobar que nada lo tocó. */
function listado(raiz: string, prefijo = ""): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(join(raiz, prefijo), { withFileTypes: true })) {
    const ruta = prefijo === "" ? entrada.name : `${prefijo}/${entrada.name}`;
    salida.push(ruta);
    if (entrada.isDirectory()) salida.push(...listado(raiz, ruta));
  }
  return salida.sort();
}

describe("empaquetarProyecto", () => {
  it("entra el proyecto menos la base, git, la carpeta interna y las claves", () => {
    const paquete = empaquetarProyecto(nuevoProyecto());

    // La lista EXACTA, no un booleano: lo que se sube al dispositivo es esto y nada más.
    // `objects.xml` (vista aplanada con su `.xne` al lado) entra; `.env`, `db.key`,
    // `.git/`, `.xonecode/`, `bd/` y los dos `.db` —con su `-wal`— no.
    expect(paquete.ficheros).toEqual(["app.ini", "app.xml", "icons/a.png", "objects.xml", "objects.xne"]);
    expect(Object.keys(unzipSync(paquete.bytes)).sort()).toEqual([
      "app.ini",
      "app.xml",
      "icons/a.png",
      "objects.xml",
      "objects.xne",
    ]);
    expect(paquete.total).toBe(
      ["app.ini", "app.xml", "icons/a.png", "objects.xml", "objects.xne"]
        .map((f) => `contenido de ${f}`.length)
        .reduce((a, b) => a + b, 0)
    );
    // El contenido viaja entero, no solo el nombre.
    expect(Buffer.from(unzipSync(paquete.bytes)["app.ini"]!).toString("utf8")).toBe("contenido de app.ini");
  });

  it("la vista aplanada viaja: el filtro del agente no es el de la app", () => {
    // Este test existe por si alguien «unifica» el filtro con `esVistaAplanada`. Lo que
    // esa función protege es el fichero que el agente puede EDITAR —la fuente es el
    // `.xne`—, no lo que el framework espera encontrar al lado en el dispositivo: dejar
    // fuera el `.xml` deja la app rota.
    const paquete = empaquetarProyecto(nuevoProyecto(["Clientes.xne", "Clientes.xml"]));
    expect(paquete.ficheros).toEqual(["Clientes.xml", "Clientes.xne"]);
  });

  it("no escribe nada en disco", () => {
    const raiz = nuevoProyecto();
    const antes = listado(raiz);
    empaquetarProyecto(raiz);
    expect(listado(raiz)).toEqual(antes);
  });

  it("la basura del SO no entra, ni en la raíz ni dentro", () => {
    // El ZIP aterriza en `app_<nombre>/` del dispositivo: un `.DS_Store` que entre se
    // despliega en la app del cliente. La lista es la MISMA constante que la de git
    // (`BASURA_DEL_SO`), así que aquí se comprueban los tres nombres y lo que importa de
    // verdad: que lo legítimo que se le parece —`icons/`, un `.xne`, un `.ini`— sigue
    // entrando entero.
    const raiz = nuevoProyecto(["app.xne", "app.ini", "icons/a.png", "icons/.DS_Store", ".DS_Store", "Thumbs.db", "desktop.ini"]);
    const paquete = empaquetarProyecto(raiz);
    expect(paquete.ficheros).toEqual(["app.ini", "app.xne", "icons/a.png"]);
    expect(Object.keys(unzipSync(paquete.bytes)).sort()).toEqual(["app.ini", "app.xne", "icons/a.png"]);
  });

  it("el mismo árbol da los mismos bytes dos veces", () => {
    // Sin fijar la fecha de cada entrada, `fflate` estampa la hora actual y esto falla una
    // vez de cada dos —el formato DOS guarda los segundos partidos por dos, así que dos
    // ejecuciones seguidas suelen salir iguales y el fallo aparece más tarde—.
    const raiz = nuevoProyecto();
    const primero = empaquetarProyecto(raiz);
    const segundo = empaquetarProyecto(raiz);
    expect(segundo.bytes).toEqual(primero.bytes);
  });

  it("una fecha anterior a 1980 no revienta el paquete", () => {
    // `fflate` escribe la fecha en formato DOS y por debajo de 1980 lanza «date not in
    // range 1980-2099» sin decir de qué fichero. Una mtime a 0 es la que dejan algunas
    // herramientas al extraer un archivo.
    const raiz = nuevoProyecto(["app.xne"]);
    utimesSync(join(raiz, "app.xne"), new Date(0), new Date(0));
    expect(empaquetarProyecto(raiz).ficheros).toEqual(["app.xne"]);
  });

  it("no sigue un enlace simbólico, ni siquiera hacia dentro del proyecto", () => {
    // El paquete lo lee el disco de verdad: incluir un enlace que sale del proyecto es
    // meter en el ZIP un fichero que el proyecto no tiene (`dir-fuera/id_rsa`, ya medido
    // en la pestaña Ficheros). El de dentro no se pierde: su destino viaja por su nombre.
    const raiz = nuevoProyecto(["app.xne"]);
    symlinkSync("/etc/hosts", join(raiz, "fuera.txt"));
    symlinkSync(join(raiz, "app.xne"), join(raiz, "enlace.xne"));
    symlinkSync(tmpdir(), join(raiz, "carpeta-fuera"));
    expect(empaquetarProyecto(raiz).ficheros).toEqual(["app.xne"]);
  });

  it("por encima del tope lanza con el tamaño y no sube nada", () => {
    // El tope entra por parámetro: fabricar 512 MiB en un test no es una opción, y un
    // fichero disperso haría que el test dependiera del sistema de ficheros.
    const raiz = nuevoProyecto(["app.ini", "pesado.bin"]);
    writeFileSync(join(raiz, "pesado.bin"), Buffer.alloc(2 * 1024 * 1024));
    expect(() => empaquetarProyecto(raiz, 1024 * 1024)).toThrow(
      /el proyecto ocupa 2,0 MB y el paquete admite 1,0 MB: no se sube nada/
    );
    // Y con el tope real, ese mismo proyecto sí se empaqueta.
    expect(empaquetarProyecto(raiz).total).toBeGreaterThan(2 * 1024 * 1024);
    expect(TOPE_DE_PAQUETE).toBe(512 * 1024 * 1024);
  });
});
