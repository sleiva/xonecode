import type { MotorLocal } from "../tipos.js";

/** Un paso de la guía: lo que se hace, y el comando si lo hay. */
export interface PasoDeGuia {
  texto: string;
  comando?: string;
}

export const NOMBRE_DE_MOTOR: Readonly<Record<MotorLocal, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
};

/**
 * La guía paso a paso de cada motor, para cuando el botón no basta. **No pide PowerShell como
 * administrador ni dejar la consola abierta**: lo primero no hace falta y lo segundo es falso —la
 * credencial queda guardada al terminar (medido)—. Y la de Claude Code empieza por el botón:
 * XOneCode trae su propio Claude Code dentro del SDK, así que no hay nada que instalar.
 */
export const GUIA_DE_INICIO: Readonly<Record<MotorLocal, readonly PasoDeGuia[]>> = {
  "claude-code": [
    {
      texto:
        "XOneCode ya trae Claude Code: no hace falta instalarlo. Pulsa «Iniciar sesión» y se abrirá el navegador. Si el navegador no se abre, «Abrir consola de inicio de sesión» abre una terminal con el comando ya escrito.",
    },
    {
      texto: "Si tienes Claude Code instalado por tu cuenta, también vale en una terminal normal (no hace falta abrirla como administrador):",
      comando: "claude auth login",
    },
    { texto: "En el navegador, entra con tu cuenta de Claude (o con la Consola de Anthropic si pagas por uso)." },
    { texto: "Si al final la web te enseña un código, cópialo y pégalo donde te lo pide —aquí o en la terminal— y pulsa Enter." },
    { texto: "Listo. No hace falta dejar ninguna consola abierta: la sesión queda guardada en el equipo. Pulsa «Probar» para comprobar que contesta." },
  ],
  codex: [
    { texto: "Instala Codex si no lo tienes:", comando: "npm install -g @openai/codex" },
    { texto: "Inicia sesión en una terminal; se abrirá el navegador para entrar con tu cuenta de ChatGPT:", comando: "codex login" },
    { texto: "Comprueba que quedó hecho:", comando: "codex login status" },
    { texto: "Vuelve aquí, pulsa «Volver a comprobar» y después «Probar». No hace falta dejar la terminal abierta." },
  ],
  opencode: [
    { texto: "Instala OpenCode si no lo tienes:", comando: "npm install -g opencode-ai" },
    { texto: "Añade la credencial del proveedor que vayas a usar; te pedirá elegirlo en una lista:", comando: "opencode auth login" },
    { texto: "Comprueba qué credenciales tiene:", comando: "opencode auth list" },
    { texto: "Vuelve aquí, pulsa «Volver a comprobar» y después «Probar». No hace falta dejar la terminal abierta." },
  ],
};
