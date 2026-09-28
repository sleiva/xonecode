import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { guardarAdjuntoDeSesion, listarAdjuntosDeSesion, TOPE_DE_ADJUNTO_DE_SESION, TOPE_DE_ADJUNTOS_POR_SESION } from "./adjuntosDeSesion.js";

const carpetas: string[] = [];

function proyectoTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), "xonecode-adjuntos-sesion-"));
  carpetas.push(raiz);
  return raiz;
}

afterEach(() => {
  while (carpetas.length > 0) rmSync(carpetas.pop() as string, { recursive: true, force: true });
});

describe("guardarAdjuntoDeSesion / listarAdjuntosDeSesion", () => {
  it("una carpeta que no se puede LISTAR (un fichero en su sitio: ENOTDIR) da [], no lanza", () => {
    // Corre dentro de `consolaWeb#recibir`: un `throw` se llevaría el mensaje de la persona.
    const raiz = proyectoTemporal();
    mkdirSync(join(raiz, ".xonecode", "sesiones", "sesion-1"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "sesiones", "sesion-1", "adjuntos"), "no soy una carpeta");
    expect(listarAdjuntosDeSesion(raiz, "sesion-1")).toEqual([]);
    expect(listarAdjuntosDeSesion(raiz, "sesion-1", ["a.png"])).toEqual([]);
  });

  it("guarda y lista un adjunto, con su mime deducido del nombre", () => {
    const raiz = proyectoTemporal();
    const resultado = guardarAdjuntoDeSesion(raiz, "sesion-1", "captura.png", Buffer.from("no-son-bytes-de-verdad"));

    expect(resultado).toEqual({ ok: true, nombre: "captura.png" });
    expect(listarAdjuntosDeSesion(raiz, "sesion-1")).toEqual([
      { nombre: "captura.png", bytes: 22, mime: "image/png" },
    ]);
  });

  /**
   * Ronda de arreglo 1/5 (IXCODE-7): la carpeta es por SESIÓN, no por mensaje, y las fichas
   * del compositor se vacían al enviar — sin este sufijo, un segundo `a.png` de otro turno
   * pisaría en SILENCIO el del turno anterior. `writeFileSync` no avisa de una sobrescritura.
   */
  it("dos guardados del MISMO nombre no se pisan: el segundo cae en «a-2.png», intacto el primero", () => {
    const raiz = proyectoTemporal();
    const primero = guardarAdjuntoDeSesion(raiz, "sesion-1", "a.png", Buffer.from("del primer turno"));
    const segundo = guardarAdjuntoDeSesion(raiz, "sesion-1", "a.png", Buffer.from("del segundo turno"));

    expect(primero).toEqual({ ok: true, nombre: "a.png" });
    expect(segundo).toEqual({ ok: true, nombre: "a-2.png" });

    const carpeta = join(raiz, ".xonecode", "sesiones", "sesion-1", "adjuntos");
    expect(readFileSync(join(carpeta, "a.png"), "utf8")).toBe("del primer turno");
    expect(readFileSync(join(carpeta, "a-2.png"), "utf8")).toBe("del segundo turno");
    expect(listarAdjuntosDeSesion(raiz, "sesion-1").map((a) => a.nombre)).toEqual(["a-2.png", "a.png"]);
  });

  it("un tercer guardado del mismo nombre sigue la numeración: «a-3.png»", () => {
    const raiz = proyectoTemporal();
    guardarAdjuntoDeSesion(raiz, "sesion-1", "a.png", Buffer.from("1"));
    guardarAdjuntoDeSesion(raiz, "sesion-1", "a.png", Buffer.from("2"));
    const tercero = guardarAdjuntoDeSesion(raiz, "sesion-1", "a.png", Buffer.from("3"));

    expect(tercero).toEqual({ ok: true, nombre: "a-3.png" });
  });

  it("un nombre sin extensión también se numera: «nota» → «nota-2»", () => {
    const raiz = proyectoTemporal();
    guardarAdjuntoDeSesion(raiz, "sesion-1", "nota", Buffer.from("1"));
    const resultado = guardarAdjuntoDeSesion(raiz, "sesion-1", "nota", Buffer.from("2"));

    expect(resultado).toEqual({ ok: true, nombre: "nota-2" });
  });

  it("escribe el fichero en 0600 y la carpeta en 0700", () => {
    const raiz = proyectoTemporal();
    guardarAdjuntoDeSesion(raiz, "sesion-1", "nota.txt", Buffer.from("hola"));

    const carpeta = join(raiz, ".xonecode", "sesiones", "sesion-1", "adjuntos");
    expect(statSync(carpeta).mode & 0o777).toBe(0o700);
    expect(statSync(join(carpeta, "nota.txt")).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(carpeta, "nota.txt"), "utf8")).toBe("hola");
  });

  it("rechaza un nombre fuera de la lista blanca, sin escribir nada", () => {
    const raiz = proyectoTemporal();
    const resultado = guardarAdjuntoDeSesion(raiz, "sesion-1", "../x", Buffer.from("da igual"));

    expect(resultado).toEqual({ ok: false, motivo: "ese nombre no vale para un adjunto" });
    expect(existsSync(join(raiz, ".xonecode"))).toBe(false);
  });

  it("rechaza un id de sesión inseguro (lo que hace lanzar a carpetaDeAdjuntosDeSesion)", () => {
    const raiz = proyectoTemporal();
    const resultado = guardarAdjuntoDeSesion(raiz, "../otra", "nota.txt", Buffer.from("hola"));

    expect(resultado).toEqual({ ok: false, motivo: "ese nombre no vale para un adjunto" });
    expect(listarAdjuntosDeSesion(raiz, "../otra")).toEqual([]);
  });

  it("rechaza un fichero por encima del tope por fichero (inyectable, sin escribir 20 MB de verdad)", () => {
    const raiz = proyectoTemporal();
    const datos = Buffer.alloc(1001);
    const resultado = guardarAdjuntoDeSesion(raiz, "sesion-1", "grande.bin", datos, { porFichero: 1000, porSesion: 5000 });

    expect(resultado).toEqual({ ok: false, motivo: "el fichero es demasiado grande (tope 0 MB)" });
    expect(listarAdjuntosDeSesion(raiz, "sesion-1")).toEqual([]);
  });

  it("usa el tope por fichero real (TOPE_DE_ADJUNTO_DE_SESION, 20 MB) cuando no se inyecta ninguno", () => {
    const raiz = proyectoTemporal();
    const datos = Buffer.alloc(TOPE_DE_ADJUNTO_DE_SESION + 1);
    const resultado = guardarAdjuntoDeSesion(raiz, "sesion-1", "grande.bin", datos);

    expect(resultado).toEqual({ ok: false, motivo: "el fichero es demasiado grande (tope 20 MB)" });
  });

  it("rechaza lo que haga pasar la sesión del tope por sesión, aunque el fichero individual quepa", () => {
    const raiz = proyectoTemporal();
    const topes = { porFichero: 1000, porSesion: 1500 };
    expect(guardarAdjuntoDeSesion(raiz, "sesion-1", "uno.bin", Buffer.alloc(900), topes)).toEqual({ ok: true, nombre: "uno.bin" });

    const resultado = guardarAdjuntoDeSesion(raiz, "sesion-1", "dos.bin", Buffer.alloc(900), topes);

    expect(resultado).toEqual({ ok: false, motivo: "esta sesión ya no admite más adjuntos (tope 0 MB)" });
    expect(listarAdjuntosDeSesion(raiz, "sesion-1").map((a) => a.nombre)).toEqual(["uno.bin"]);
  });

  it("expone TOPE_DE_ADJUNTOS_POR_SESION como el tope real por sesión (50 MB)", () => {
    expect(TOPE_DE_ADJUNTOS_POR_SESION).toBe(50_000_000);
  });

  it("no escribe si `adjuntos` es un enlace simbólico, y nada sale de la sesión de verdad", () => {
    const raiz = proyectoTemporal();
    const fuera = proyectoTemporal();
    mkdirSync(join(raiz, ".xonecode", "sesiones", "sesion-1"), { recursive: true });
    symlinkSync(fuera, join(raiz, ".xonecode", "sesiones", "sesion-1", "adjuntos"));

    const resultado = guardarAdjuntoDeSesion(raiz, "sesion-1", "colado.txt", Buffer.from("no debería llegar aquí"));

    expect(resultado).toEqual({ ok: false, motivo: "ese nombre no vale para un adjunto" });
    expect(existsSync(join(fuera, "colado.txt"))).toBe(false);
  });

  it("no escribe si `sesiones` ENTERA es un enlace simbólico (no solo `sesiones/<id>`)", () => {
    // Este es el caso que un `lstat` de solo dos segmentos, o una comparación de `realpath`
    // contra `<raiz>/.xonecode/sesiones`, no cazan: `lstat("sesiones/<id>")` sigue el enlace
    // del padre, y `realpathSync(baseSesiones)` sigue el mismo enlace que se busca detectar.
    const raiz = proyectoTemporal();
    const fuera = proyectoTemporal();
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    symlinkSync(fuera, join(raiz, ".xonecode", "sesiones"));

    const resultado = guardarAdjuntoDeSesion(raiz, "sesion-1", "colado.txt", Buffer.from("fuga"));

    expect(resultado).toEqual({ ok: false, motivo: "ese nombre no vale para un adjunto" });
    expect(existsSync(join(fuera, "sesion-1"))).toBe(false);
  });

  it("no escribe si `sesiones/<id>` es un enlace simbólico", () => {
    const raiz = proyectoTemporal();
    const fuera = proyectoTemporal();
    mkdirSync(join(raiz, ".xonecode", "sesiones"), { recursive: true });
    symlinkSync(fuera, join(raiz, ".xonecode", "sesiones", "sesion-1"));

    const resultado = guardarAdjuntoDeSesion(raiz, "sesion-1", "colado.txt", Buffer.from("tampoco"));

    expect(resultado).toEqual({ ok: false, motivo: "ese nombre no vale para un adjunto" });
    expect(existsSync(join(fuera, "adjuntos"))).toBe(false);
  });

  it("no lista lo que hay detrás de un enlace en `adjuntos`", () => {
    const raiz = proyectoTemporal();
    const fuera = proyectoTemporal();
    mkdirSync(join(fuera), { recursive: true });
    writeFileSync(join(fuera, "secreto.txt"), "no es un adjunto");
    mkdirSync(join(raiz, ".xonecode", "sesiones", "sesion-1"), { recursive: true });
    symlinkSync(fuera, join(raiz, ".xonecode", "sesiones", "sesion-1", "adjuntos"));

    expect(listarAdjuntosDeSesion(raiz, "sesion-1")).toEqual([]);
  });

  it("el motivo del rechazo nunca lleva la ruta de `raiz`, en NINGUNO de los rechazos", () => {
    const raiz = proyectoTemporal();
    const fuera = proyectoTemporal();
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    symlinkSync(fuera, join(raiz, ".xonecode", "sesiones"));

    const porNombre = guardarAdjuntoDeSesion(raiz, "sesion-1", "../x", Buffer.from("x"));
    const porIdInseguro = guardarAdjuntoDeSesion(raiz, "../otra", "nota.txt", Buffer.from("x"));
    const porEnlace = guardarAdjuntoDeSesion(raiz, "sesion-1", "colado.txt", Buffer.from("x"));

    for (const resultado of [porNombre, porIdInseguro, porEnlace]) {
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.motivo).not.toContain(raiz);
        expect(resultado.motivo).not.toContain(fuera);
      }
    }
  });

  it("listarAdjuntosDeSesion con `nombres` filtra y respeta su orden, omitiendo los ausentes", () => {
    const raiz = proyectoTemporal();
    guardarAdjuntoDeSesion(raiz, "sesion-1", "a.txt", Buffer.from("a"));
    guardarAdjuntoDeSesion(raiz, "sesion-1", "b.txt", Buffer.from("b"));
    guardarAdjuntoDeSesion(raiz, "sesion-1", "c.txt", Buffer.from("c"));

    const filtrado = listarAdjuntosDeSesion(raiz, "sesion-1", ["c.txt", "no-existe.txt", "a.txt"]);

    expect(filtrado.map((a) => a.nombre)).toEqual(["c.txt", "a.txt"]);
  });

  it("listarAdjuntosDeSesion sin `nombres` los devuelve todos, ordenados", () => {
    const raiz = proyectoTemporal();
    guardarAdjuntoDeSesion(raiz, "sesion-1", "z.txt", Buffer.from("z"));
    guardarAdjuntoDeSesion(raiz, "sesion-1", "a.txt", Buffer.from("a"));

    expect(listarAdjuntosDeSesion(raiz, "sesion-1").map((a) => a.nombre)).toEqual(["a.txt", "z.txt"]);
  });

  it("listarAdjuntosDeSesion de una sesión sin adjuntos devuelve una lista vacía", () => {
    const raiz = proyectoTemporal();
    expect(listarAdjuntosDeSesion(raiz, "sesion-sin-nada")).toEqual([]);
  });

  it("dos sesiones distintas de la misma raíz no comparten carpeta", () => {
    const raiz = proyectoTemporal();
    guardarAdjuntoDeSesion(raiz, "sesion-1", "solo-en-1.txt", Buffer.from("uno"));
    guardarAdjuntoDeSesion(raiz, "sesion-2", "solo-en-2.txt", Buffer.from("dos"));

    expect(listarAdjuntosDeSesion(raiz, "sesion-1").map((a) => a.nombre)).toEqual(["solo-en-1.txt"]);
    expect(listarAdjuntosDeSesion(raiz, "sesion-2").map((a) => a.nombre)).toEqual(["solo-en-2.txt"]);
  });

  /**
   * Ronda de arreglo 1/5: `statSync` SIGUE un enlace (a diferencia de `lstatSync`, que usa
   * `listarAdjuntosDeSesion`), así que un enlace COLGANTE dentro de `adjuntos/` —apunta a algo
   * que ya no existe— hace que la suma de tamaños del tope por sesión LANCE `ENOENT`. Sin el
   * `try` alrededor de las llamadas de disco, esa excepción se llevaba el `POST /adjunto` por
   * delante: un rechazo de guarda se devuelve, nunca se lanza.
   */
  it("un enlace COLGANTE dentro de `adjuntos/` no revienta: se rechaza con su código, sin ruta", () => {
    const raiz = proyectoTemporal();
    const carpeta = join(raiz, ".xonecode", "sesiones", "sesion-1", "adjuntos");
    mkdirSync(carpeta, { recursive: true });
    symlinkSync(join(raiz, "esto-no-existe.bin"), join(carpeta, "colgante.bin"));

    const resultado = guardarAdjuntoDeSesion(raiz, "sesion-1", "nota.txt", Buffer.from("hola"));

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toMatch(/ENOENT/);
      expect(resultado.motivo).not.toContain(raiz);
    }
    // Y no dejó a medias el fichero que sí se pudo escribir: nada se guardó de este intento.
    expect(existsSync(join(carpeta, "nota.txt"))).toBe(false);
  });
});
