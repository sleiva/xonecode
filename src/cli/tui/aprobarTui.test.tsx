import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { reductorDeAprobacion, estadoInicial, pedirDecisionesTui, ModalAprobacion } from "./aprobarTui.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import type { LineaDeDiff } from "../../core/diff.js";

const pendiente = (id: string): PendienteDeAprobacion => ({
  id,
  origen: "dev",
  descripcion: "escribir Clientes.xne",
  decisionesPermitidas: ["approve", "reject"],
});

describe("el reductor de aprobación", () => {
  it("aprobar y rechazar acumulan decisiones y avanzan", () => {
    let s = estadoInicial([pendiente("i1"), pendiente("i2")]);
    s = reductorDeAprobacion(s, "aprobar");
    s = reductorDeAprobacion(s, "rechazar");
    expect(s.indice).toBe(2);
    expect(s.terminado!.get("i1")!.type).toBe("approve");
    expect(s.terminado!.get("i2")!.type).toBe("reject");
    // Idempotente al terminar: más decisiones después del agotado no cambian nada.
    const otro = reductorDeAprobacion(s, "aprobar");
    expect(otro.terminado).toBe(s.terminado);
  });

  it("agotar la lista SIN responder los restantes no puede dejarlos sin decisión (fail-closed)", () => {
    // La garantía real vive en `pedirDecisionesTui`: todo pendiente sin decisión
    // explícita sale RECHAZADO. Este test fija el contrato del reductor: al agotar,
    // `terminado` lleva una decisión POR CADA pendiente.
    let s = estadoInicial([pendiente("i1")]);
    s = reductorDeAprobacion(s, "aprobar");
    expect(s.terminado!.size).toBe(1);
    expect(s.terminado!.get("i1")!.type).toBe("approve");
  });
});

/** Escribe una tecla tras un tick: el cable de useInput se asienta tras el primer frame. */
const esperar = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

async function teclear(instancia: { stdin: { write: (d: string) => void } }, texto: string): Promise<void> {
  await esperar();
  for (const letra of texto) {
    instancia.stdin.write(letra);
    await esperar();
  }
}

const DIFF: LineaDeDiff[] = [
  { tipo: "igual", texto: "<Coleccion nombre='Clientes'>" },
  { tipo: "quitado", texto: "  <Campo nombre='nif' />" },
  { tipo: "anadido", texto: "  <Campo nombre='cif' />" },
];

function montar(overrides: { diff?: (id: string) => LineaDeDiff[] | undefined } = {}) {
  const decisiones: Map<string, { type: "approve" | "reject"; message?: string }>[] = [];
  const instancia = render(
    <ModalAprobacion
      pendientes={[pendiente("i1")]}
      fichero={(id) => (id === "i1" ? "clientes.xne" : undefined)}
      diff={overrides.diff ?? (() => DIFF)}
      alTerminar={(d) => decisiones.push(d)}
    />
  );
  return { instancia, decisiones };
}

describe("el modal de aprobación", () => {
  it("enseña el pendiente: descripción, fichero, quién y el diff con signo", async () => {
    const { instancia } = montar();
    await esperar();
    const salida = instancia.lastFrame() ?? "";
    expect(salida).toContain("APROBACIÓN 1/1");
    expect(salida).toContain("escribir Clientes.xne");
    expect(salida).toContain("clientes.xne");
    expect(salida).toContain("dev");
    expect(salida).toContain("+   <Campo nombre='cif' />");
    expect(salida).toContain("-   <Campo nombre='nif' />");
    expect(salida).toContain("¿Aprobar? [S/n]");
    instancia.unmount();
  });

  it("s aprueba y resuelve alTerminar", async () => {
    const { instancia, decisiones } = montar();
    await teclear(instancia, "s");
    await esperar();
    expect(decisiones).toHaveLength(1);
    expect(decisiones[0]!.get("i1")!.type).toBe("approve");
    instancia.unmount();
  });

  it("n rechaza (fail-closed: lo que no se entiende no toca nada)", async () => {
    const { instancia, decisiones } = montar();
    await teclear(instancia, "n");
    await esperar();
    expect(decisiones).toHaveLength(1);
    expect(decisiones[0]!.get("i1")!.type).toBe("reject");
    instancia.unmount();
  });

  it("Enter a secas RECHAZA, no aprueba", async () => {
    // Distinto del stdio (donde el Enter aprueba solo con TTY de verdad): en TUI el
    // modal solo vive cuando hay alguien mirando, pero la asimetría se conserva —
    // aprobar es explícito («s»), todo lo demás es rechazo.
    const { instancia, decisiones } = montar();
    await teclear(instancia, "\r");
    await esperar();
    expect(decisiones).toHaveLength(1);
    expect(decisiones[0]!.get("i1")!.type).toBe("reject");
    instancia.unmount();
  });
});

describe("pedirDecisionesTui — la costura fail-closed", () => {
  it("rellena con RECHAZO todo pendiente sin decisión explícita y resuelve el Map completo", async () => {
    // `montar` falso: el modal «se cierra» devolviendo solo lo respondido. Los que
    // quedaron sin respuesta NO pueden quedar fuera del Map: aprobar ejecuta, así que
    // el silencio es rechazo.
    const promesa = pedirDecisionesTui([pendiente("i1"), pendiente("i2")], new Map(), new Map(), ({ alTerminar }) => {
      const parciales = new Map();
      parciales.set("i1", { type: "approve" });
      alTerminar(parciales);
    });
    await expect(promesa).resolves.toEqual(
      new Map([
        ["i1", { type: "approve" }],
        ["i2", { type: "reject" }],
      ])
    );
  });

  it("con la lista vacía resuelve un Map vacío SIN montar nada", async () => {
    const montar = vi.fn();
    const promesa = pedirDecisionesTui([], new Map(), new Map(), montar);
    await expect(promesa).resolves.toEqual(new Map());
    expect(montar).not.toHaveBeenCalled();
  });
});
