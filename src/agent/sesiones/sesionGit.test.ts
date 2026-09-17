import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  cambiosDeSesion,
  claseNeta,
  fotoDeApertura,
  marcarSesion,
  olvidarSesion,
  parcheDeSesion,
  refDeSesion,
  selloDeSesion,
} from "./sesionGit.js";
import { commitDeTurno } from "./gitSync.js";

/** Un repo de verdad: esto prueba git, no un doble de git. */
function repo(): string {
  const raiz = mkdtempSync(join(tmpdir(), "xonecode-sesion-"));
  execFileSync("git", ["init", "-q", "."], { cwd: raiz });
  execFileSync("git", ["config", "user.email", "x@y.z"], { cwd: raiz });
  execFileSync("git", ["config", "user.name", "x"], { cwd: raiz });
  return raiz;
}

/** Escribe un fichero creando su carpeta: los casos de esta batería viven en subcarpetas. */
function escribir(raiz: string, ruta: string, texto: string): void {
  const destino = join(raiz, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, texto);
}

describe("refDeSesion", () => {
  /**
   * El id se cuela en un nombre de referencia. Uno con `..`, con espacios o empezando por
   * guion no da un error claro: da un `update-ref` que falla raro o, peor, otra ref.
   */
  it("rechaza lo que no vale como nombre de ref", () => {
    expect(refDeSesion("s1")).toBe("refs/xonecode/sesion/s1");
    expect(refDeSesion("2026-09-05_a1b2")).toBe("refs/xonecode/sesion/2026-09-05_a1b2");
    expect(refDeSesion("../../head")).toBeUndefined();
    expect(refDeSesion("con espacio")).toBeUndefined();
    expect(refDeSesion("-arranca-con-guion")).toBeUndefined();
    expect(refDeSesion("")).toBeUndefined();
  });
});

describe("los ficheros de una sesión", () => {
  it("cuenta lo tocado desde la marca, incluido lo que git todavía no seguía", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "uno\ndos\n");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });

    expect(await marcarSesion(raiz, "s1")).toBe(true);

    // Lo que haría el agente: cambiar uno, crear otro, borrar un tercero.
    writeFileSync(join(raiz, "app.xne"), "uno\nDOS\ntres\n");
    mkdirSync(join(raiz, "docs"));
    writeFileSync(join(raiz, "docs", "nuevo.md"), "hola\n");

    const { via, ficheros } = await cambiosDeSesion(raiz, "s1");
    // «desde-apertura» y no «git»: esta sesión no tiene ningún commit sellado, así que lo
    // que se mide es la copia del proyecto y no la sesión. Es la medida de siempre con el
    // nombre corregido — el que tenía afirmaba una autoría que no podía sostener.
    expect(via).toBe("desde-apertura");
    expect(ficheros.map((f) => [f.ruta, f.clase])).toEqual([
      ["app.xne", "modificado"],
      // Un fichero recién creado NO está seguido por git, y el índice privado con `add -A`
      // es justo lo que hace que cuente igual.
      ["docs/nuevo.md", "nuevo"],
    ]);
    expect(ficheros[0]).toMatchObject({ mas: 2, menos: 1 });
    rmSync(raiz, { recursive: true, force: true });
  });

  it("sin marca no dice «no tocaste nada»: dice que no lo sabe", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "a.txt"), "x\n");
    const { via, ficheros } = await cambiosDeSesion(raiz, "sin-marcar");
    expect(via).toBe("sin-marca");
    expect(ficheros).toEqual([]);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("una carpeta sin git no rompe nada: se declara sin marca", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-nogit-"));
    expect(await marcarSesion(raiz, "s1")).toBe(false);
    expect((await cambiosDeSesion(raiz, "s1")).via).toBe("sin-marca");
    rmSync(raiz, { recursive: true, force: true });
  });

  it("el parche de un fichero trae su contenido, y olvidar la sesión borra la ref", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "a.txt"), "antes\n");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });
    await marcarSesion(raiz, "s1");
    writeFileSync(join(raiz, "a.txt"), "después\n");

    const parche = await parcheDeSesion(raiz, "s1", "a.txt");
    expect(parche?.texto).toMatch(/-antes/);
    expect(parche?.texto).toMatch(/\+después/);
    expect(parche?.recortado).toBe(false);

    // La ref vive FUERA de `refs/heads` y `refs/tags`: no ensucia ni `git branch` ni
    // `git tag`, que es todo el motivo de no haber usado un tag.
    expect(execFileSync("git", ["tag"], { cwd: raiz, encoding: "utf8" }).trim()).toBe("");
    expect(execFileSync("git", ["branch", "--list"], { cwd: raiz, encoding: "utf8" })).not.toMatch(/sesion/);
    expect(
      execFileSync("git", ["for-each-ref", "--format=%(refname)", "refs/xonecode"], { cwd: raiz, encoding: "utf8" })
    ).toMatch(/refs\/xonecode\/sesion\/s1/);

    await olvidarSesion(raiz, "s1");
    expect(
      execFileSync("git", ["for-each-ref", "--format=%(refname)", "refs/xonecode"], { cwd: raiz, encoding: "utf8" }).trim()
    ).toBe("");
    rmSync(raiz, { recursive: true, force: true });
  });
});

describe("lo que NO es trabajo de la sesión", () => {
  /**
   * El fallo que esto evita: `volcar()` escribe el `.jsonl` de la propia sesión al final de
   * cada turno, dentro de `.xonecode/`. Sin excluirlo, la lista empezaba por «el transcript
   * de esta sesión, modificado por esta sesión» en cualquier repo del usuario, donde
   * `prepararRepo` no ha escrito ningún `info/exclude`.
   */
  it("`.xonecode/` no sale en la lista aunque el repo no lo excluya", async () => {
    const raiz = repo();
    try {
      expect(await marcarSesion(raiz, "s1")).toBe(true);
      escribir(raiz, ".xonecode/sesiones/s1.jsonl", '{"tipo":"usuario"}\n');
      escribir(raiz, "src/app.xne", "<app/>");

      const { via, ficheros } = await cambiosDeSesion(raiz, "s1");
      expect(via).toBe("desde-apertura");
      expect(ficheros.map((f) => f.ruta)).toEqual(["src/app.xne"]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  /**
   * Un proyecto puede colgar de un repo mayor (`instantanea.ts` lo sostiene a propósito).
   * Los árboles se escriben con rutas desde la raíz DEL REPO, así que sin `--relative` las
   * rutas saldrían con el prefijo de la subcarpeta y el parche, que se pide por esa ruta
   * con `cwd` en el proyecto, no casaría con ningún fichero: diff vacío y fila colgada.
   */
  it("con `.xonecode` YA ignorado, la marca se toma igual y la carpeta sigue sin salir", async () => {
    // La arista que se comió la vista entera, medida contra el proyecto de verdad: `git add`
    // con un pathspec `:(exclude).xonecode` en un repo donde `.xonecode` YA está ignorado
    // considera que has nombrado una ruta ignorada, avisa y **sale con código 1**. El árbol
    // no se escribía, `marcarSesion` devolvía `false`, y la pestaña decía «sin-marca» para
    // siempre — un fallo mudo con un mensaje tranquilizador. Los tests de al lado no lo
    // cogían porque en sus repos de usar y tirar `.xonecode` no lo ignora nadie.
    const raiz = repo();
    try {
      escribir(raiz, ".gitignore", ".xonecode/\n");
      execFileSync("git", ["add", "-A"], { cwd: raiz });
      execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });

      expect(await marcarSesion(raiz, "s1")).toBe(true);
      escribir(raiz, ".xonecode/sesiones/s1.jsonl", "{}\n");
      escribir(raiz, "src/app.xne", "<app/>");

      const { via, ficheros } = await cambiosDeSesion(raiz, "s1");
      expect(via).toBe("desde-apertura");
      expect(ficheros.map((f) => f.ruta)).toEqual(["src/app.xne"]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("con el proyecto en una subcarpeta del repo, las rutas son del PROYECTO y el parche casa", async () => {
    const base = repo();
    try {
      const raiz = join(base, "apps", "tienda");
      mkdirSync(raiz, { recursive: true });
      escribir(raiz, "src/app.xne", "<app/>");
      expect(await marcarSesion(raiz, "s1")).toBe(true);
      escribir(raiz, "src/app.xne", "<app><nuevo/></app>");

      const { ficheros } = await cambiosDeSesion(raiz, "s1");
      expect(ficheros.map((f) => f.ruta)).toEqual(["src/app.xne"]);
      const parche = await parcheDeSesion(raiz, "s1", "src/app.xne");
      expect(parche?.texto).toContain("nuevo");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("`.xonecode` y el árbol de la sesión", () => {
  /**
   * En un proyecto OFFLINE nadie escribió `info/exclude`, así que `.xonecode` no está
   * ignorada. Ahí dentro vive ahora `checkpoint.sqlite`, que son decenas de megas que
   * cambian en cada superpaso: si entrara en el árbol, cada foto dejaría esos blobs en
   * `.git/objects` y la ref de la sesión los mantendría vivos para siempre.
   */
  it("no entra en el árbol aunque el repo no la ignore", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "uno\n");
    escribir(raiz, ".xonecode/checkpoint.sqlite", "bytes que no queremos en git\n");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });
    // Sin `info/exclude`: es el caso offline, y se comprueba en vez de suponerse.
    expect(() => execFileSync("git", ["check-ignore", "-q", ".xonecode/checkpoint.sqlite"], { cwd: raiz })).toThrow();

    const marcar = await fotoDeApertura(raiz);
    expect(await marcar("s1")).toBe(true);

    const arbol = execFileSync("git", ["ls-tree", "-r", "--name-only", "refs/xonecode/sesion/s1"], {
      cwd: raiz,
      encoding: "utf8",
    });
    expect(arbol).toContain("app.xne");
    expect(arbol).not.toContain(".xonecode");
  });
});

describe("claseNeta", () => {
  /**
   * Una sesión puede tocar el mismo fichero en varios turnos, y la fila enseña UNA clase.
   * La decisión vive en una función pura por eso: no es un detalle del bucle que la usa.
   */
  it("de la primera vez a la última, y creado+borrado no deja fila", () => {
    expect(claseNeta("nuevo", "modificado")).toBe("nuevo");
    expect(claseNeta("modificado", "modificado")).toBe("modificado");
    expect(claseNeta("modificado", "borrado")).toBe("borrado");
    // Ni estaba antes ni está ahora: una fila de «borrado» afirmaría que la sesión borró
    // algo que nunca existió en el proyecto.
    expect(claseNeta("nuevo", "borrado")).toBeUndefined();
  });
});

describe("selloDeSesion", () => {
  it("es un trailer con el id, y solo con un id que valga como argumento de git", () => {
    expect(selloDeSesion("s1")).toBe("Xonecode-Sesion: s1");
    expect(selloDeSesion("con espacio")).toBeUndefined();
    expect(selloDeSesion("../otra")).toBeUndefined();
  });
});

describe("la atribución por COMMIT", () => {
  /** El turno de una sesión: escribe y commitea, que es lo que hace `commitDeTurno`. */
  async function turno(raiz: string, sesion: string, ruta: string, texto: string): Promise<void> {
    escribir(raiz, ruta, texto);
    const hecho = await commitDeTurno(raiz, `xonecode: ${sesion}`, sesion);
    expect(hecho.via).toBe("commit");
  }

  /**
   * EL FALLO QUE ESTO ARREGLA, medido en el proyecto del usuario el 10-09-2026: una
   * conversación enseñaba +1266 líneas que había escrito una tarea de fondo veinte minutos
   * después, con la pestaña rotulada «Sesión». Aquí, con dos sesiones sobre la misma copia,
   * cada una ve lo suyo.
   */
  it("cada sesión ve SOLO lo que commiteó ella, aunque la otra escribiera después", async () => {
    const raiz = repo();
    escribir(raiz, "app.xne", "<app/>");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });

    await turno(raiz, "sesion-uno", "doc/DE_LA_UNO.md", "uno\n");
    await turno(raiz, "sesion-dos", "doc/DE_LA_DOS.md", "dos\n");

    const uno = await cambiosDeSesion(raiz, "sesion-uno");
    expect(uno.via).toBe("git");
    expect(uno.ficheros.map((f) => [f.ruta, f.clase])).toEqual([["doc/DE_LA_UNO.md", "nuevo"]]);
    // Y lo dice: entre el «antes» de la uno y ahora hay un commit que no es suyo, así que su
    // lista es exacta pero un parche podría traer hunks de la otra.
    expect(uno.mezclados).toBe(1);

    const dos = await cambiosDeSesion(raiz, "sesion-dos");
    expect(dos.ficheros.map((f) => f.ruta)).toEqual(["doc/DE_LA_DOS.md"]);
    // La dos no tiene a nadie entremedias: su «antes» es el commit de la uno.
    expect(dos.mezclados).toBeUndefined();

    rmSync(raiz, { recursive: true, force: true });
  });

  it("un id que es PREFIJO de otro no se confunde: el sello se verifica entero", async () => {
    // `--grep` casa por subcadena, así que sin verificar el trailer la sesión `s1` se
    // quedaría también con los commits de `s10`. Es la misatribución silenciosa de siempre.
    const raiz = repo();
    escribir(raiz, "app.xne", "<app/>");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });

    await turno(raiz, "s1", "de-s1.md", "uno\n");
    await turno(raiz, "s10", "de-s10.md", "diez\n");

    expect((await cambiosDeSesion(raiz, "s1")).ficheros.map((f) => f.ruta)).toEqual(["de-s1.md"]);
    expect((await cambiosDeSesion(raiz, "s10")).ficheros.map((f) => f.ruta)).toEqual(["de-s10.md"]);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("lo que nadie ha commiteado se enseña MARCADO: el turno en vuelo commitea al terminar", async () => {
    const raiz = repo();
    escribir(raiz, "app.xne", "<app/>");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });
    await turno(raiz, "s1", "hecho.md", "commiteado\n");
    // El turno que está corriendo ahora mismo: escrito y todavía sin commit.
    escribir(raiz, "en-vuelo.md", "escribiendo\n");

    const { ficheros } = await cambiosDeSesion(raiz, "s1");
    expect(ficheros.map((f) => [f.ruta, f.sinCommitear])).toEqual([
      ["en-vuelo.md", true],
      ["hecho.md", undefined],
    ]);
    // Y su parche se puede pedir: sin esto, mirar la pestaña mientras el agente escribe
    // enseñaría una fila que no se abre.
    const parche = await parcheDeSesion(raiz, "s1", "en-vuelo.md");
    expect(parche?.texto).toContain("escribiendo");
    rmSync(raiz, { recursive: true, force: true });
  });

  it("un fichero que la sesión creó y borró no deja fila, y el resto sí", async () => {
    const raiz = repo();
    escribir(raiz, "app.xne", "<app/>");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });

    await turno(raiz, "s1", "temporal.md", "borrame\n");
    rmSync(join(raiz, "temporal.md"));
    escribir(raiz, "queda.md", "esto sí\n");
    const hecho = await commitDeTurno(raiz, "xonecode: s1", "s1");
    expect(hecho.via).toBe("commit");

    const { ficheros } = await cambiosDeSesion(raiz, "s1");
    expect(ficheros.map((f) => f.ruta)).toEqual(["queda.md"]);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("el parche de un fichero arranca en el turno que lo tocó, y cuenta lo mismo que su fila", async () => {
    const raiz = repo();
    escribir(raiz, "app.xne", "uno\ndos\ntres\n");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });

    await turno(raiz, "s1", "app.xne", "uno\nDOS\ntres\n");
    const { ficheros } = await cambiosDeSesion(raiz, "s1");
    expect(ficheros[0]).toMatchObject({ ruta: "app.xne", clase: "modificado", mas: 1, menos: 1 });
    const parche = await parcheDeSesion(raiz, "s1", "app.xne");
    expect(parche?.texto).toContain("+DOS");
    expect(parche?.texto).toContain("-dos");
    rmSync(raiz, { recursive: true, force: true });
  });

  it("sin sello no hay atribución, y se declara: es una sesión de antes de esto", async () => {
    const raiz = repo();
    escribir(raiz, "app.xne", "<app/>");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });
    expect(await marcarSesion(raiz, "vieja")).toBe(true);
    // Otra sesión commitea encima; la vieja no tiene con qué distinguirlo.
    await turno(raiz, "sesion-nueva", "de-otra.md", "otra\n");

    const { via, ficheros } = await cambiosDeSesion(raiz, "vieja");
    expect(via).toBe("desde-apertura");
    expect(ficheros.map((f) => f.ruta)).toEqual(["de-otra.md"]);
    rmSync(raiz, { recursive: true, force: true });
  });
});
