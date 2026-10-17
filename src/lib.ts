/**
 * `xonecode/lib`: la API de librería de xonecode, para usarlo DESDE OTRO programa (hoy,
 * xonecode-copilot) sin consola, sin web y sin nadie delante.
 *
 * Solo reexporta. Lo que entra aquí es CONTRATO: cambiar una firma de las de abajo rompe a
 * quien lo use. Lo que no está aquí no es público, aunque se pueda importar desde `dist/`.
 *
 * Importar esto no carga ink ni React (`lib.test.ts`): la TUI y la web entran por `import()`
 * dinámico desde `cli/main.ts`.
 */
export { ClientCredentialsProvider } from "@modelcontextprotocol/sdk/client/auth-extensions.js";
export {
  conectarStudioDeServidor,
  type ConexionDeServidor,
  type OpcionesDeConexionDeServidor,
} from "./agent/cloudstudio/conexionDeServidor.js";
export { crearRama } from "./agent/cloudstudio/crearRama.js";
export { clienteCloudStudio } from "./agent/cloudstudio/cloudstudioClient.js";
export { SCOPES_CLOUDSTUDIO_AGENTE, type InvocarMcp, type ProyectoRemoto } from "./agent/cloudstudio/cloudstudioMcp.js";
export { descargarProyecto, type OpcionesDeDescarga } from "./agent/cloudstudio/descarga.js";
export { subir, type OpcionesDeSubida, type InformeDeSubida, type FalloDeSubida } from "./agent/cloudstudio/subida.js";
export { prepararRepo, vaciarCopia, cambiosPendientes } from "./agent/sesiones/gitSync.js";
export {
  ejecutarTareaAutonoma,
  type OpcionesDeTareaAutonoma,
  type ResultadoDeTareaAutonoma,
} from "./lib/tareaAutonoma.js";
/**
 * Siembra los agentes de serie en una casa (`base`): copilot los deja en el `HOME` temporal de la
 * ejecución ANTES de superponer los suyos, para que el raíz tenga a sus especialistas.
 */
export { sembrarAgentes, rutaDeAgentes } from "./agent/subagentes/agentesEnDisco.js";
export { Modelos } from "./agent/config/modelos.js";
export { VARIABLES_POR_PROVEEDOR, type FuentesDeEleccion } from "./core/modelos.js";
export { TOPE_DE_RONDAS_DE_TAREA } from "./core/tareas.js";
export type { CloudStudioPort } from "./core/ports.js";
export type { EstadoDeSync, OperacionOmitida } from "./core/cloudstudio.js";
export type { Entrega, CierreDeTarea, ResultadoDeTurno, VeredictoDeTarea } from "./core/entrega.js";
export type { MotorDeAgente } from "./core/motor.js";
