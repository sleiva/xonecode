import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  arbolDeProyecto,
  leerFicheroDeProyecto,
  motivoDeRutaInaceptable,
  ordenarRutas,
  TOPE_DE_ENTRADAS,
  TOPE_DE_FICHERO,
} from "./arbolDeProyecto.js";

let raiz: string;
let fuera: string;

/**
 * ¿El sistema de ficheros distingue mayúsculas? Se mide una vez, escribiendo y preguntando
 * por el mismo nombre en otra caja: en APFS y en NTFS no distingue —y ahí «.ENV» abre
 * «.env»—, en un ext4 sí, y ahí ese caso no se puede montar. Se detecta en vez de suponer
 * la máquina: el test de más abajo afirma un rechazo que en Linux no tiene nada que rechazar.
 */
const SIN_DISTINGUIR_MAYUSCULAS = (() => {
  const d = mkdtempSync(join(tmpdir(), "xc-caso-"));
  try {
    writeFileSync(join(d, "x.txt"), "");
    return existsSync(join(d, "X.TXT"));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
})();

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), "xc-arbol-"));
  fuera = mkdtempSync(join(tmpdir(), "xc-fuera-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>");
  mkdirSync(join(raiz, "app"));
  writeFileSync(join(raiz, "app", "Clientes.xne"), "<coll name=\"Clientes\"/>");
  writeFileSync(join(raiz, "app", "Clientes.xml"), "<vistas/>"); // aplanada
  writeFileSync(join(raiz, ".env"), "SECRETO=1");
  mkdirSync(join(raiz, ".xonecode"));
  writeFileSync(join(raiz, ".xonecode", "config.json"), "{}");
  mkdirSync(join(raiz, ".git"));
  writeFileSync(join(raiz, ".git", "HEAD"), "ref");
  mkdirSync(join(raiz, "node_modules", "x"), { recursive: true });
  writeFileSync(join(raiz, "node_modules", "x", "i.js"), "");
  writeFileSync(join(raiz, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
  writeFileSync(join(raiz, "viejo.txt"), Buffer.from([0x68, 0x6f, 0x6c, 0x61, 0x20, 0xf1])); // «hola ñ» en cp1252
  writeFileSync(join(raiz, "grande.js"), "x".repeat(TOPE_DE_FICHERO + 10));
  writeFileSync(join(fuera, "secreto.txt"), "no");
  symlinkSync(join(fuera, "secreto.txt"), join(raiz, "enlace.txt"));
  // Los tres enlaces que burlaban la barrera: apuntan DENTRO de la raíz, así que la
  // comprobación de «el camino real sigue en el proyecto» los deja pasar.
  symlinkSync(join(raiz, ".env"), join(raiz, "enlace-env.txt"));
  symlinkSync(join(raiz, ".xonecode"), join(raiz, "carpeta-enlazada"), "dir");
  symlinkSync(join(raiz, "app", "Clientes.xml"), join(raiz, "alias.xml"));
  mkdirSync(join(fuera, "claves"));
  writeFileSync(join(fuera, "claves", "id_rsa"), "-----BEGIN");
  symlinkSync(join(fuera, "claves"), join(raiz, "dir-fuera"), "dir");
});

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
  rmSync(fuera, { recursive: true, force: true });
});

describe("arbolDeProyecto", () => {
  it("lista lo que el agente ve y nada más: ni .env, ni .xonecode, ni .git, ni node_modules, ni la vista aplanada", () => {
    const { rutas, recortado } = arbolDeProyecto(raiz);
    expect(recortado).toBe(false);
    expect(rutas).toContain("app/Clientes.xne");
    expect(rutas).toContain("app.xml");
    expect(rutas).not.toContain("app/Clientes.xml");
    expect(rutas.some((r) => r.startsWith(".env") || r.startsWith(".xonecode") || r.startsWith(".git") || r.startsWith("node_modules"))).toBe(false);
  });

  it("no lista lo que hay detrás de un enlace a carpeta: ni el alias de una denegada ni lo de fuera", () => {
    // Un enlace a carpeta no se sigue (`turnoReal.ts` usa `lstatSync`), así que
    // «carpeta-enlazada» no puede colar `.xonecode` bajo otro nombre ni «dir-fuera»
    // traer nombres de ficheros que no son del proyecto.
    const { rutas } = arbolDeProyecto(raiz);
    expect(rutas).not.toContain("carpeta-enlazada/config.json");
    expect(rutas.some((r) => r.startsWith("carpeta-enlazada/") || r.startsWith("dir-fuera"))).toBe(false);
  });

  it("ordena carpetas antes que ficheros en cada nivel, y alfabético sin mayúsculas", () => {
    expect(ordenarRutas(["b.js", "a/z.xne", "A.js", "a/b/c.css", "Zeta/x"])).toEqual(["a/b/c.css", "a/z.xne", "Zeta/x", "A.js", "b.js"]);
  });

  it("declara el recorte al pasar el tope de entradas", () => {
    const muchos = mkdtempSync(join(tmpdir(), "xc-muchos-"));
    try {
      for (let i = 0; i < TOPE_DE_ENTRADAS + 5; i++) writeFileSync(join(muchos, `f${String(i).padStart(5, "0")}.js`), "");
      const { rutas, recortado } = arbolDeProyecto(muchos);
      expect(recortado).toBe(true);
      expect(rutas).toHaveLength(TOPE_DE_ENTRADAS);
    } finally {
      rmSync(muchos, { recursive: true, force: true });
    }
  });
});

describe("leerFicheroDeProyecto", () => {
  it("lee un fichero de texto UTF-8", async () => {
    const f = await leerFicheroDeProyecto(raiz, "app/Clientes.xne");
    expect(f).toMatchObject({ ruta: "app/Clientes.xne", texto: "<coll name=\"Clientes\"/>", binario: false, recortado: false, codificacion: "utf-8" });
    expect(f.bytes).toBe(Buffer.byteLength("<coll name=\"Clientes\"/>"));
  });

  it.each(["../x", "/etc/passwd", ".env", ".xonecode/config.json", "app/Clientes.xml", "enlace.txt", "app", "no-existe.xne", "a//b"])(
    "rechaza «%s» con motivo y sin texto",
    async (ruta) => {
      const f = await leerFicheroDeProyecto(raiz, ruta);
      expect(f.error).toBeTypeOf("string");
      expect(f.texto).toBeUndefined();
      expect(f.error).not.toContain(raiz); // nunca la ruta real de la máquina
    }
  );

  it("un NUL en los primeros 8 KB es binario: sin texto, con tamaño", async () => {
    const f = await leerFicheroDeProyecto(raiz, "logo.png");
    expect(f).toMatchObject({ binario: true, bytes: 7 });
    expect(f.texto).toBeUndefined();
  });

  it("lo que no es UTF-8 se lee como latin1 y se dice", async () => {
    const f = await leerFicheroDeProyecto(raiz, "viejo.txt");
    expect(f.codificacion).toBe("latin1");
    expect(f.texto).toBe("hola ñ");
  });

  it("recorta al tope y lo declara, con el tamaño real", async () => {
    const f = await leerFicheroDeProyecto(raiz, "grande.js");
    expect(f.recortado).toBe(true);
    expect(f.texto!.length).toBeLessThanOrEqual(TOPE_DE_FICHERO);
    expect(f.bytes).toBe(TOPE_DE_FICHERO + 10);
  });

  it("una ruta con separadores de Windows se resuelve igual que con «/»", async () => {
    // El «\\» sobrevive a la criba de balde (no es absoluta ni lleva «..») y a la de
    // vista aplanada (que ya normaliza), así que tiene que sobrevivir también a la
    // resolución en disco: resolver con la ruta CRUDA fallaba aquí con «no existe».
    const f = await leerFicheroDeProyecto(raiz, "app\\Clientes.xne");
    expect(f.ruta).toBe("app\\Clientes.xne"); // la pedida, no la normalizada
    expect(f.texto).toBe("<coll name=\"Clientes\"/>");
    expect(f.error).toBeUndefined();
  });

  it("un carácter multibyte partido justo en el tope se recorta como UTF-8, no como latin1", async () => {
    // La «ñ» (2 bytes) empieza en TOPE_DE_FICHERO - 1: el corte cae en medio de su
    // segundo byte, y el reintento de `decodificar` tiene que quitarla entera en vez
    // de degradar el fichero a latin1 por un límite arbitrario.
    const contenido = "a".repeat(TOPE_DE_FICHERO - 1) + "ñ" + "x".repeat(20);
    writeFileSync(join(raiz, "frontera.txt"), contenido, "utf-8");
    const f = await leerFicheroDeProyecto(raiz, "frontera.txt");
    expect(f.codificacion).toBe("utf-8");
    expect(f.recortado).toBe(true);
    expect(f.texto!.endsWith("a")).toBe(true);
  });

  it("un fichero de exactamente TOPE_DE_FICHERO bytes no se recorta", async () => {
    writeFileSync(join(raiz, "justo.txt"), "a".repeat(TOPE_DE_FICHERO));
    const f = await leerFicheroDeProyecto(raiz, "justo.txt");
    expect(f.recortado).toBe(false);
    expect(f.texto!.length).toBe(TOPE_DE_FICHERO);
    expect(f.bytes).toBe(TOPE_DE_FICHERO);
  });

  it("un fichero vacío se lee como texto vacío, no como binario", async () => {
    writeFileSync(join(raiz, "vacio.txt"), "");
    const f = await leerFicheroDeProyecto(raiz, "vacio.txt");
    expect(f).toMatchObject({ texto: "", binario: false, recortado: false, bytes: 0, codificacion: "utf-8" });
  });

  it("un enlace DENTRO de la raíz que apunta a un fichero denegado se rechaza", async () => {
    const f = await leerFicheroDeProyecto(raiz, "enlace-env.txt");
    expect(f.error).toBeTypeOf("string");
    expect(f.texto).toBeUndefined();
    expect(f.error).not.toContain(raiz);
  });

  it("un enlace a carpeta denegada no abre lo que hay dentro", async () => {
    const f = await leerFicheroDeProyecto(raiz, "carpeta-enlazada/config.json");
    expect(f.error).toBeTypeOf("string");
    expect(f.texto).toBeUndefined();
  });

  it("un enlace a una vista APLANADA se rechaza como aplanada, no se lee", async () => {
    // La criba de balde no puede verlo: al lado de «alias.xml» no hay ningún
    // «alias.xne». Quien lo caza es la recomprobación sobre el camino REAL.
    const f = await leerFicheroDeProyecto(raiz, "alias.xml");
    expect(f.error).toContain("aplanada");
    expect(f.texto).toBeUndefined();
  });

  it("una variante de mayúsculas de una ruta denegada se rechaza", async () => {
    if (!SIN_DISTINGUIR_MAYUSCULAS) return; // en un FS que distingue, «.ENV» no existe: nada que rechazar
    for (const ruta of [".ENV", ".Xonecode/config.json", ".GIT/HEAD"]) {
      const f = await leerFicheroDeProyecto(raiz, ruta);
      expect(f.error, ruta).toBeTypeOf("string");
      expect(f.texto, ruta).toBeUndefined();
    }
  });

  it("un enlace simbólico DENTRO de la raíz se lee con normalidad", async () => {
    symlinkSync(join(raiz, "app", "Clientes.xne"), join(raiz, "alias.xne"));
    const f = await leerFicheroDeProyecto(raiz, "alias.xne");
    expect(f.ruta).toBe("alias.xne");
    expect(f.texto).toBe("<coll name=\"Clientes\"/>");
    expect(f.error).toBeUndefined();
  });
});

describe("motivoDeRutaInaceptable", () => {
  it("acepta una ruta relativa normal y rechaza las demás formas", () => {
    expect(motivoDeRutaInaceptable("src/app.xne")).toBeUndefined();
    expect(motivoDeRutaInaceptable("")).toBeTypeOf("string");
    expect(motivoDeRutaInaceptable("./a")).toBeTypeOf("string");
    expect(motivoDeRutaInaceptable("a/../b")).toBeTypeOf("string");
    expect(motivoDeRutaInaceptable("C:\\x")).toBeTypeOf("string");
    expect(motivoDeRutaInaceptable(".env.local")).toBeTypeOf("string");
  });
});
