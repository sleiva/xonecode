import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MotoresLocales, type AccionDeMotorLocal } from "./MotoresLocales.js";
import type { EstadoDeMotorLocal } from "../tipos.js";

afterEach(cleanup);

const MEDIDO = "2026-10-03T10:00:00.000Z";

const SIN_SESION: EstadoDeMotorLocal = {
  motor: "claude-code",
  instalado: "ok",
  version: "2.1.263",
  conSesion: false,
  sesion: "Sin sesión iniciada",
  admiteLogin: true,
  admiteConsola: true,
  medido: MEDIDO,
};

const CODEX_FALTA: EstadoDeMotorLocal = { motor: "codex", instalado: "no-encontrado", detalle: "codex no está instalado", medido: MEDIDO };

function montar(motores: EstadoDeMotorLocal[], acciones: AccionDeMotorLocal[] = []) {
  return render(<MotoresLocales motores={motores} conectado alAccion={(a) => acciones.push(a)} agentes={[{ nombre: "analyst-claude", motor: "claude-code" }]} />);
}

describe("el modelo de OpenCode", () => {
  const OPENCODE: EstadoDeMotorLocal = { motor: "opencode", instalado: "ok", version: "1.18.34", admiteModelo: true, medido: MEDIDO };
  const LISTA = {
    modelos: [
      { id: "opencode/big-pickle", nombre: "opencode/big-pickle" },
      { id: "opencode-go/glm-5.3", nombre: "opencode-go/glm-5.3" },
    ],
  };

  function abrirOpencode(estado: EstadoDeMotorLocal, modelos?: typeof LISTA) {
    const acciones: AccionDeMotorLocal[] = [];
    const pedidos: string[] = [];
    render(
      <MotoresLocales
        motores={[SIN_SESION, estado]}
        conectado
        alAccion={(a) => acciones.push(a)}
        {...(modelos === undefined ? {} : { modelosDeMotor: { opencode: modelos } })}
        alPedirModelosDeMotor={(m) => pedidos.push(m)}
      />
    );
    fireEvent.click(screen.getByRole("tab", { name: /OpenCode/ }));
    return { acciones, pedidos };
  }

  it("sin lista la PIDE, y sin modelo avisa del tier gratuito", () => {
    const { pedidos } = abrirOpencode(OPENCODE);
    expect(pedidos).toEqual(["opencode"]);
    expect((screen.getByRole("combobox", { name: "Modelo de OpenCode" }) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/Sin modelo elegido, OpenCode usa uno de su tier gratuito/)).toBeTruthy();
  });

  it("agrupa por proveedor, y elegir manda la intención; «Sin elegir» la quita", () => {
    const { acciones, pedidos } = abrirOpencode({ ...OPENCODE, modelo: "opencode-go/glm-5.3" }, LISTA);
    expect(pedidos).toEqual([]);
    const select = screen.getByRole("combobox", { name: "Modelo de OpenCode" }) as HTMLSelectElement;
    expect(select.value).toBe("opencode-go/glm-5.3");
    expect([...select.querySelectorAll("optgroup")].map((g) => g.label)).toEqual(["opencode", "opencode-go"]);
    expect(screen.queryByText(/Sin modelo elegido/)).toBeNull();
    fireEvent.change(select, { target: { value: "opencode/big-pickle" } });
    fireEvent.change(select, { target: { value: "" } });
    expect(acciones.filter((a) => a.accion === "modelo")).toEqual([
      { accion: "modelo", motor: "opencode", modelo: "opencode/big-pickle" },
      { accion: "modelo", motor: "opencode" },
    ]);
  });

  it("un guardado que el motor ya no lista se sigue enseñando, no como «sin elegir»", () => {
    abrirOpencode({ ...OPENCODE, modelo: "opencode-go/viejo" }, LISTA);
    expect((screen.getByRole("combobox", { name: "Modelo de OpenCode" }) as HTMLSelectElement).value).toBe("opencode-go/viejo");
  });

  it("los motores que no lo admiten no pintan selector", () => {
    montar([SIN_SESION]);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("MotoresLocales", () => {
  it("al entrar pide una medida, y sin manejador no pinta ningún botón", () => {
    const acciones: AccionDeMotorLocal[] = [];
    montar([SIN_SESION], acciones);
    expect(acciones).toEqual([{ accion: "medir" }]);
    cleanup();
    render(<MotoresLocales motores={[SIN_SESION]} conectado />);
    expect(screen.queryByRole("button", { name: "Iniciar sesión" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Probar" })).toBeNull();
  });

  it("sin sesión: versión, «Iniciar sesión», la guía abierta y quién usa el motor", () => {
    const acciones: AccionDeMotorLocal[] = [];
    montar([SIN_SESION], acciones);
    expect(screen.getByText(/versión 2\.1\.263/)).toBeTruthy();
    expect(screen.getByText(/Lo usan: analyst-claude/)).toBeTruthy();
    expect(screen.getByText(/No hace falta dejar ninguna consola abierta/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(acciones.slice(1)).toEqual([
      { accion: "login", motor: "claude-code", modo: "claudeai" },
      { accion: "probar", motor: "claude-code" },
    ]);
    expect(screen.getByRole("button", { name: "Probando…" })).toBeTruthy();
  });

  it("con sesión NO se ofrece iniciar otra: reemplazaría la de todos los Claude Code del equipo", () => {
    montar([{ ...SIN_SESION, conSesion: true, sesion: "Cuenta de Claude · Team · XOne" }]);
    expect(screen.queryByRole("button", { name: /Iniciar sesión|Cambiar de cuenta|Consola de Anthropic|Abrir consola/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Probar" })).toBeTruthy();
  });

  it("con sesión la guía arranca PLEGADA y desmontada, y se abre al pulsar", () => {
    montar([{ ...SIN_SESION, conSesion: true, sesion: "Cuenta de Claude · Team · XOne" }]);
    expect(screen.queryByText(/No hace falta dejar ninguna consola abierta/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Paso a paso/ }));
    expect(screen.getByText(/No hace falta dejar ninguna consola abierta/)).toBeTruthy();
  });

  it("con un login en curso: campo para el código, reabrir el navegador y cancelar", () => {
    const acciones: AccionDeMotorLocal[] = [];
    montar([{ ...SIN_SESION, login: { fase: "esperando", pideCodigo: true, desde: MEDIDO } }], acciones);
    expect(screen.queryByRole("button", { name: "Iniciar sesión" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Código de inicio de sesión"), { target: { value: "abc#123" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver a abrir el navegador" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(acciones.slice(1)).toEqual([
      { accion: "codigo", motor: "claude-code", codigo: "abc#123" },
      { accion: "navegador", motor: "claude-code" },
      { accion: "cancelar", motor: "claude-code" },
    ]);
  });

  it("la clave heredada se avisa, y cada camino de la prueba dice el suyo", () => {
    montar([
      {
        ...SIN_SESION,
        conSesion: true,
        conClave: true,
        pruebas: [
          { camino: "sin-ejecucion", ok: false, detalle: "Invalid API key", ms: 900, medido: MEDIDO },
          { camino: "con-ejecucion", ok: true, detalle: "contestó «OK»", ms: 2100, medido: MEDIDO },
        ],
      },
    ]);
    expect(screen.getByText(/clave de API de Anthropic/)).toBeTruthy();
    expect(screen.getByText(/Subagentes sin ejecución/)).toBeTruthy();
    expect(screen.getByText(/contestó «OK»/)).toBeTruthy();
  });

  it("Codex sin instalar: lo dice, no ofrece probar, y la guía da el comando de instalar", () => {
    montar([SIN_SESION, CODEX_FALTA]);
    fireEvent.click(screen.getByRole("tab", { name: /Codex/ }));
    expect(screen.getByText(/No está instalado/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Probar" })).toBeNull();
    expect(screen.getByText("npm install -g @openai/codex")).toBeTruthy();
  });
});
