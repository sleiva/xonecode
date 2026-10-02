import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { conImagenesDelProyecto,
  arbolDeProyecto,
  escribirFicheroDeProyecto,
  huellaDeContenido,
  leerFicheroDeProyecto,
  motivoDeRutaInaceptable,
  mimeDeImagen,
  ordenarRutas,
  TOPE_DE_ENTRADAS,
  TOPE_DE_FICHERO,
  TOPE_DE_IMAGEN,
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
  // Un binario que NO es una imagen: es el que prueba el olfateo del NUL, porque un `.png`
  // ya no llega ahí — se decide antes, por la extensión.
  writeFileSync(join(raiz, "datos.bin"), Buffer.from([0x01, 0x00, 0x02]));
  writeFileSync(join(raiz, "icono.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
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
    const f = await leerFicheroDeProyecto(raiz, "datos.bin");
    expect(f).toMatchObject({ binario: true, bytes: 3 });
    expect(f.texto).toBeUndefined();
    // Y no se disfraza de imagen: sin extensión conocida no hay MIME que ofrecer.
    expect(f.mime).toBeUndefined();
    expect(f.base64).toBeUndefined();
  });

  it("una imagen viaja con su MIME y sus bytes, aunque lleve un NUL en la cabecera", async () => {
    // El PNG del fixture tiene un 0x00 en el quinto byte: por el camino del texto habría
    // salido como «un fichero binario» y nunca se habría podido pintar.
    const f = await leerFicheroDeProyecto(raiz, "logo.png");
    expect(f).toMatchObject({ binario: true, bytes: 7, mime: "image/png" });
    expect(Buffer.from(f.base64!, "base64")).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
    expect(f.texto).toBeUndefined();
  });

  it("una imagen que pasa del tope se declara con su MIME y SIN bytes", async () => {
    const gorda = join(raiz, "gorda.png");
    writeFileSync(gorda, Buffer.alloc(TOPE_DE_IMAGEN + 1));
    const f = await leerFicheroDeProyecto(raiz, "gorda.png");
    expect(f).toMatchObject({ binario: true, mime: "image/png", bytes: TOPE_DE_IMAGEN + 1 });
    // Sin los bytes: media imagen no es media información, y el `mime` es lo que permite
    // decir «una imagen de N KB» en vez de «un binario».
    expect(f.base64).toBeUndefined();
  });

  it("un SVG viaja con las DOS caras: su fuente y su dibujo", async () => {
    const f = await leerFicheroDeProyecto(raiz, "icono.svg");
    expect(f.binario).toBe(false);
    expect(f.texto).toContain("<svg");
    expect(f.mime).toBe("image/svg+xml");
    expect(Buffer.from(f.base64!, "base64").toString("utf8")).toBe(f.texto);
  });

  it("mimeDeImagen conoce las extensiones que el visor pinta, y nada más", () => {
    expect(mimeDeImagen("a/b/logo.PNG")).toBe("image/png");
    expect(mimeDeImagen("foto.jpeg")).toBe("image/jpeg");
    expect(mimeDeImagen("icono.svg")).toBe("image/svg+xml");
    expect(mimeDeImagen("app.xne")).toBeUndefined();
    expect(mimeDeImagen("sinpunto")).toBeUndefined();
    // Un fichero oculto sin extensión no es «un .png»: el punto inicial no cuenta.
    expect(mimeDeImagen(".png")).toBeUndefined();
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

describe("las imágenes de un markdown, incrustadas para la VISTA", () => {
  const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
  const proyectoConDoc = (md: string) => {
    const raiz = mkdtempSync(join(tmpdir(), "vista-md-"));
    mkdirSync(join(raiz, "doc", "img"), { recursive: true });
    writeFileSync(join(raiz, "doc", "img", "login.png"), PNG);
    writeFileSync(join(raiz, ".env"), "CLAVE=secreta");
    writeFileSync(join(raiz, "doc", "manual.md"), md);
    return raiz;
  };

  it("el markdown lleva su `vista` con cada imagen apuntando a la ruta que la sirve, y el `texto` sigue siendo la fuente", async () => {
    const md = "# Manual\n\n![Login](img/login.png)\n![Fuera](../../x.png)\n![Env](../.env)\n";
    const leido = await leerFicheroDeProyecto(proyectoConDoc(md), "doc/manual.md");
    expect(leido.texto).toBe(md);
    // Solo la imagen del proyecto se reescribe; lo de fuera y lo que no es una imagen se quedan igual.
    expect(leido.vista).toBe(
      "# Manual\n\n![Login](/imagen-del-proyecto?ruta=doc%2Fimg%2Flogin.png)\n![Fuera](../../x.png)\n![Env](../.env)\n"
    );
  });

  it("para el PDF se INCRUSTA, y lo que no pasa la barrera de la pestaña Ficheros no: ni `.env` ni lo de fuera", async () => {
    const raizBuena = proyectoConDoc("![ok](img/login.png)\n");
    const buena = await conImagenesDelProyecto(raizBuena, "doc/manual.md", "![ok](img/login.png)\n");
    expect(buena.texto).toBe(`![ok](data:image/png;base64,${PNG.toString("base64")})\n`);
    const raiz = proyectoConDoc("![a](../.env)\n![b](../../fuera.png)\n![c](img/no-existe.png)\n");
    const r = await conImagenesDelProyecto(raiz, "doc/manual.md", readFileSync(join(raiz, "doc", "manual.md"), "utf8"));
    expect(r.incrustadas).toBe(0);
    expect(r.texto).not.toContain("secreta");
    expect(r.texto).not.toContain("data:");
    // Las dos que se intentaron y no se pudieron se CUENTAN; lo de fuera de la raíz ni se intenta.
    expect(r.sinResolver).toBe(2);
  });

  it("sin imágenes que incrustar no hay `vista`: el visor usa el texto de siempre", async () => {
    const leido = await leerFicheroDeProyecto(proyectoConDoc("# Solo texto\n"), "doc/manual.md");
    expect(leido.vista).toBeUndefined();
  });
});

/** ¿Corre como root? Entonces un `chmod 0555` no impide escribir y el caso de EACCES no se puede montar. */
const ES_ROOT = typeof process.getuid === "function" && process.getuid() === 0;

describe("escribirFicheroDeProyecto", () => {
  const huellaDe = (ruta: string): string => huellaDeContenido(readFileSync(join(raiz, ruta)));
  const temporales = (dir: string): string[] => readdirSync(dir).filter((n) => n.endsWith(".xonecode.tmp"));
  /** Lo que una escritura negada NO puede haber tocado. */
  const foto = (): Record<string, string> =>
    Object.fromEntries(
      [".env", ".git/HEAD", ".xonecode/config.json", "app/Clientes.xml", "app/Clientes.xne"].map((r) => [r, readFileSync(join(raiz, r), "utf8")])
    );

  it("la lectura trae la huella de los BYTES, y solo con el texto entero en UTF-8", async () => {
    expect((await leerFicheroDeProyecto(raiz, "app/Clientes.xne")).huella).toBe(huellaDe("app/Clientes.xne"));
    // Sin huella no hay «Editar»: recortado, latin1 y binario son de solo lectura.
    expect((await leerFicheroDeProyecto(raiz, "grande.js")).huella).toBeUndefined();
    expect((await leerFicheroDeProyecto(raiz, "viejo.txt")).huella).toBeUndefined();
    expect((await leerFicheroDeProyecto(raiz, "datos.bin")).huella).toBeUndefined();
  });

  it("«.ENV» en mayúsculas también se niega, sin tocar el disco ni dejar temporales", async () => {
    // En APFS/NTFS «.ENV» abre «.env»; en un FS que distingue no existe. En los dos se niega.
    const antes = foto();
    const r = await escribirFicheroDeProyecto(raiz, ".ENV", "PISADO", "cualquiera");
    expect(r.error).toBeTypeOf("string");
    expect(r.huella).toBeUndefined();
    expect(r.error).not.toContain(raiz);
    expect(foto()).toEqual(antes);
    expect(readdirSync(raiz).filter((n) => n.toLowerCase() === ".env")).toEqual([".env"]);
    expect(temporales(raiz)).toEqual([]);
  });

  it("guarda, devuelve la huella nueva y no deja temporales", async () => {
    const r = await escribirFicheroDeProyecto(raiz, "app/Clientes.xne", "<coll name=\"Otra\"/>", huellaDe("app/Clientes.xne"));
    expect(r.error).toBeUndefined();
    expect(readFileSync(join(raiz, "app", "Clientes.xne"), "utf8")).toBe("<coll name=\"Otra\"/>");
    expect(r).toEqual({ ruta: "app/Clientes.xne", huella: huellaDe("app/Clientes.xne") });
    expect(temporales(join(raiz, "app"))).toEqual([]);
  });

  it.each([
    "../x",
    "/etc/passwd",
    ".env",
    ".git/HEAD",
    ".xonecode/config.json",
    "app/Clientes.xml",
    "enlace.txt",
    "enlace-env.txt",
    "alias.xml",
    "carpeta-enlazada/config.json",
    "app",
    "no-existe.xne",
    "a//b",
  ])("niega «%s» con motivo, sin la ruta de la máquina y sin tocar nada", async (ruta) => {
    const antes = foto();
    const fueraAntes = readFileSync(join(fuera, "secreto.txt"), "utf8");
    const r = await escribirFicheroDeProyecto(raiz, ruta, "PISADO", "cualquiera");
    expect(r.error).toBeTypeOf("string");
    expect(r.huella).toBeUndefined();
    expect(r.error).not.toContain(raiz);
    expect(r.error).not.toContain(fuera);
    expect(foto()).toEqual(antes);
    expect(readFileSync(join(fuera, "secreto.txt"), "utf8")).toBe(fueraAntes);
    expect(existsSync(join(raiz, "no-existe.xne"))).toBe(false);
  });

  it("con la huella vieja no escribe: el disco se queda con lo que dejó otro", async () => {
    const vieja = huellaDe("app/Clientes.xne");
    writeFileSync(join(raiz, "app", "Clientes.xne"), "<coll name=\"DeOtro\"/>");
    const r = await escribirFicheroDeProyecto(raiz, "app/Clientes.xne", "<coll name=\"Mio\"/>", vieja);
    expect(r.error).toMatch(/cambió desde que lo abriste/);
    expect(readFileSync(join(raiz, "app", "Clientes.xne"), "utf8")).toBe("<coll name=\"DeOtro\"/>");
    expect(temporales(join(raiz, "app"))).toEqual([]);
  });

  it("niega un texto por encima del tope, medido en BYTES y no en caracteres", async () => {
    // «ñ» son dos bytes: la cadena tiene MENOS caracteres que el tope y más bytes.
    const texto = "ñ".repeat(TOPE_DE_FICHERO / 2 + 1);
    expect(texto.length).toBeLessThan(TOPE_DE_FICHERO);
    const r = await escribirFicheroDeProyecto(raiz, "app/Clientes.xne", texto, huellaDe("app/Clientes.xne"));
    expect(r.error).toMatch(/tope/);
    expect(readFileSync(join(raiz, "app", "Clientes.xne"), "utf8")).toBe("<coll name=\"Clientes\"/>");
  });

  it("escribe los finales de línea tal como llegan: el CRLF lo conserva quien edita", async () => {
    writeFileSync(join(raiz, "crlf.js"), "a\r\nb\r\n");
    await escribirFicheroDeProyecto(raiz, "crlf.js", "a\r\nB\r\n", huellaDe("crlf.js"));
    expect(readFileSync(join(raiz, "crlf.js"), "utf8")).toBe("a\r\nB\r\n");
  });

  it.skipIf(process.platform === "win32")("conserva los permisos del original", async () => {
    writeFileSync(join(raiz, "script.js"), "uno");
    chmodSync(join(raiz, "script.js"), 0o755);
    await escribirFicheroDeProyecto(raiz, "script.js", "dos", huellaDe("script.js"));
    expect(statSync(join(raiz, "script.js")).mode & 0o777).toBe(0o755);
  });

  it("el BOM que el lector quitó vuelve al guardar", async () => {
    writeFileSync(join(raiz, "bom.xne"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("hola")]));
    const leido = await leerFicheroDeProyecto(raiz, "bom.xne");
    expect(leido.texto).toBe("hola");
    const r = await escribirFicheroDeProyecto(raiz, "bom.xne", "adiós", leido.huella!);
    expect(r.error).toBeUndefined();
    const enDisco = readFileSync(join(raiz, "bom.xne"));
    expect([...enDisco.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(enDisco.subarray(3).toString("utf8")).toBe("adiós");
  });

  it("por un enlace DENTRO del proyecto escribe en su destino, y el enlace sigue siendo enlace", async () => {
    symlinkSync(join(raiz, "app", "Clientes.xne"), join(raiz, "atajo.xne"));
    const r = await escribirFicheroDeProyecto(raiz, "atajo.xne", "<nuevo/>", huellaDe("app/Clientes.xne"));
    expect(r.error).toBeUndefined();
    expect(readFileSync(join(raiz, "app", "Clientes.xne"), "utf8")).toBe("<nuevo/>");
    expect(lstatSync(join(raiz, "atajo.xne")).isSymbolicLink()).toBe(true);
  });

  it("una imagen no se edita desde aquí", async () => {
    const r = await escribirFicheroDeProyecto(raiz, "icono.svg", "<svg/>", huellaDe("icono.svg"));
    expect(r.error).toMatch(/imagen/);
    expect(readFileSync(join(raiz, "icono.svg"), "utf8")).toBe("<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
  });

  it.skipIf(process.platform === "win32" || ES_ROOT)("si el disco no deja escribir, lo dice con su código y sin la ruta", async () => {
    const huella = huellaDe("app/Clientes.xne");
    chmodSync(join(raiz, "app"), 0o555);
    try {
      const r = await escribirFicheroDeProyecto(raiz, "app/Clientes.xne", "<x/>", huella);
      expect(r.error).toMatch(/EACCES|EPERM/);
      expect(r.error).not.toContain(raiz);
    } finally {
      chmodSync(join(raiz, "app"), 0o755);
    }
  });
});
