import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cmdPodar, proyectosDelWorkspace } from "./podar.js";

const MB = 1024 * 1024;
const salida = () => {
  const lineas: string[] = [];
  // Se guarda SIN el salto, que es cosa del transporte: lo que se comprueba es la línea.
  return { lineas, escribir: (t: string) => lineas.push(t.replace(/\n$/, "")) };
};

describe("cmdPodar", () => {
  it("cuenta lo que liberó en CADA proyecto y el total", () => {
    const s = salida();
    const codigo = cmdPodar(
      [
        { nombre: "manager/MyAllXOne", raiz: "/w/a" },
        { nombre: "webstudio/AppDemo", raiz: "/w/b" },
      ],
      s.escribir,
      {
        pendientes: () => false,
        tamano: () => 900 * MB,
        checkpointer: () => undefined,
        podar: () => ({ antes: 900 * MB, despues: 20 * MB, checkpointsBorrados: 5, writesBorrados: 7 }),
      },
    );

    expect(codigo).toBe(0);
    expect(s.lineas[0]).toContain("manager/MyAllXOne");
    expect(s.lineas[1]).toContain("webstudio/AppDemo");
    expect(s.lineas.at(-1)).toMatch(/Liberados 1760 MB en 2 proyecto/);
  });

  /** Nunca la ruta de la máquina: el mismo trato que le da el cable. */
  it("no pinta ninguna ruta", () => {
    const s = salida();
    cmdPodar([{ nombre: "manager/X", raiz: "/Users/alguien/.xonecode/workspace/manager/X" }], s.escribir, {
      pendientes: () => false,
      tamano: () => 900 * MB,
      checkpointer: () => undefined,
      podar: () => ({ antes: 900 * MB, despues: 20 * MB, checkpointsBorrados: 1, writesBorrados: 1 }),
    });
    expect(s.lineas.join("\n")).not.toContain("/Users/");
  });

  /**
   * **Un proyecto ya limpio se DICE**, al revés que en el mantenimiento automático: aquí lo
   * acaba de teclear una persona, y el silencio se leería como «no funcionó».
   */
  it("dice cuáles ya estaban al día", () => {
    const s = salida();
    cmdPodar([{ nombre: "manager/X", raiz: "/w/a" }], s.escribir, {
      pendientes: () => false,
      tamano: () => 20 * MB,
      checkpointer: () => undefined,
      podar: () => ({ antes: 20 * MB, despues: 20 * MB, checkpointsBorrados: 0, writesBorrados: 0 }),
    });
    expect(s.lineas[0]).toMatch(/ya estaba al día/);
    expect(s.lineas.at(-1)).toMatch(/Nada que liberar/);
  });

  /** Un proyecto sin base no es un fallo: es uno con el que nadie ha hablado. */
  it("se salta en silencio los que no tienen base, y no los abre", () => {
    const s = salida();
    const abrir = vi.fn(() => undefined);
    cmdPodar([{ nombre: "manager/X", raiz: "/w/a" }], s.escribir, {
      pendientes: () => false,
      tamano: () => undefined,
      checkpointer: abrir,
      podar: () => undefined,
    });
    expect(abrir).not.toHaveBeenCalled();
    expect(s.lineas).toEqual(["Nada que liberar."]);
  });

  /** Un cerrojo de otro proceso se cuenta y no tumba el resto. */
  it("un proyecto que no se pudo podar no se lleva a los demás", () => {
    const s = salida();
    cmdPodar([{ nombre: "a", raiz: "/w/a" }, { nombre: "b", raiz: "/w/b" }], s.escribir, {
      pendientes: () => false,
      tamano: () => 900 * MB,
      checkpointer: () => undefined,
      podar: (_c, raiz) =>
        raiz === "/w/a"
          ? undefined
          : { antes: 900 * MB, despues: 20 * MB, checkpointsBorrados: 1, writesBorrados: 1 },
    });
    expect(s.lineas[0]).toMatch(/no se pudo podar/);
    expect(s.lineas[1]).toContain("b:");
    expect(s.lineas.at(-1)).toMatch(/en 1 proyecto/);
  });

  /**
   * **Teclear el comando no autoriza a romper una sesión que puede continuar.** Encontrado
   * sobre el workspace real: un proyecto de 422 MB tenía una aprobación sin contestar
   * mientras otro de 882 MB no. La cota sí se salta a mano; esta guarda no.
   */
  it("no toca un proyecto con trabajo a medias, y lo dice", () => {
    const s = salida();
    const podar = vi.fn();
    cmdPodar([{ nombre: "webstudio/AppDemo", raiz: "/w/a" }], s.escribir, {
      pendientes: () => true,
      tamano: () => 422 * MB,
      checkpointer: () => undefined,
      podar,
    });
    expect(podar).not.toHaveBeenCalled();
    expect(s.lineas[0]).toMatch(/trabajo a medias/);
    expect(s.lineas.at(-1)).toMatch(/Nada que liberar/);
  });

  /** Las líneas salen de una en una: sin esto el informe entero sale pegado. */
  it("cada línea lleva su salto", () => {
    const crudas: string[] = [];
    cmdPodar([{ nombre: "a", raiz: "/w/a" }], (t) => crudas.push(t), {
      pendientes: () => false,
      tamano: () => 900 * MB,
      checkpointer: () => undefined,
      podar: () => ({ antes: 900 * MB, despues: 20 * MB, checkpointsBorrados: 1, writesBorrados: 1 }),
    });
    expect(crudas.length).toBeGreaterThan(1);
    for (const c of crudas) expect(c.endsWith("\n")).toBe(true);
  });

  it("sin proyectos lo dice y sale bien", () => {
    const s = salida();
    expect(cmdPodar([], s.escribir)).toBe(0);
    expect(s.lineas[0]).toMatch(/No hay ningún proyecto/);
  });
});

describe("proyectosDelWorkspace", () => {
  it("recorre <workspace>/<entorno>/<proyecto> y nombra por entorno/proyecto", () => {
    const base = mkdtempSync(join(tmpdir(), "xonecode-ws-"));
    try {
      mkdirSync(join(base, "manager", "MyAllXOne"), { recursive: true });
      mkdirSync(join(base, "webstudio", "AppDemo"), { recursive: true });
      mkdirSync(join(base, ".oculto", "X"), { recursive: true });

      const p = proyectosDelWorkspace(base);

      expect(p.map((x) => x.nombre)).toEqual(["manager/MyAllXOne", "webstudio/AppDemo"]);
      expect(p[0]!.raiz).toBe(join(base, "manager", "MyAllXOne"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("una base que no existe da la lista vacía, no un error", () => {
    expect(proyectosDelWorkspace("/no/existe/en/ninguna/parte")).toEqual([]);
  });
});
