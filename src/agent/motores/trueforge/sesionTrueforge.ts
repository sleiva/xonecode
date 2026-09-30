/**
 * Una `SesionReal` con el motor de TrueForge debajo — la Fase 0 de
 * `docs/VARIANTE-TRUEFORGE-HARNESS.md`.
 *
 * Cumple el MISMO contrato que la de deepagents (`turno/sesionReal.ts`), así que la
 * consola —web, terminal, tareas— no sabe con cuál habla: los dos pintan eventos de dominio en la
 * misma `Piel`, aprueban por el mismo `pedirAprobacion` y devuelven los mismos `cambios`.
 *
 * **Lo que hay, y lo que NO, dicho entero**:
 * - SÍ: el raíz como ORQUESTADOR de solo lectura y sin skills, y cada especialista como hijo
 *   sacado de su `.md` (prompt, skills, permisos, modelo; la shell solo quien la declara), sobre
 *   nuestro backend (`toolsDeFichero.ts`) y nuestro modelo (`modeloLangchain.ts`); las tools
 *   propias adaptadas (`toolsPropias.ts`: `xone_navegacion`, `regex_search`, la crítica visual…);
 *   los recortes de deepagents y la compactación del raíz (`recortes.ts`); la aprobación de cada
 *   escritura con su diff, devuelta al hilo que la pidió; el verificador con su reparación, con
 *   las reglas compartidas de `turno/verificacion.ts`; el modo autónomo, los artefactos sin
 *   preguntar, la cancelación, los tokens y los cambios del turno.
 *   Y la memoria en disco: la foto del raíz se guarda al final de cada turno y reabrir la sesión
 *   continúa la conversación (`memoriaTrueforge.ts`).
 *   Y además: los hechos del proyecto delante de cada turno, el juez del turno y el crítico de
 *   pantalla enganchados al final, la pregunta del orquestador también como dato para la tarjeta,
 *   y Claude Code, Codex y OpenCode como hijos por el mismo puerto que deepagents
 *   (`modeloExterno.ts`).
 * - NO: un presupuesto GLOBAL por turno (la suma de todos los hilos), que deepagents tampoco tiene.
 */
import { TOPE_DE_PREGUNTAS_CONTESTADAS_SOLAS, opcionRecomendada } from "../../../core/modoDeEscritura.js";
import { claseDeTrabajo } from "../../../core/esfuerzo.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import winston from "winston";
import { AgentThread, AgentThreadOrchestrator, EventType, NOOP_AGENT_TRACING, askUserQuestion, contextCompaction, dynamicSubAgents } from "./trueforge.js";
import { TOPE_DE_LLAMADAS_DEL_CONDUCTOR, TOPE_DE_LLAMADAS_DEL_ESPECIALISTA, UMBRAL_RESUMEN_TOKENS } from "../../turno/resumenDeContexto.js";
import type { DomainEvent, HallazgoDelTurno, PendienteDeAprobacion } from "../../../core/events.js";
import type {
  ConsumoDeSesion,
  ConsumoDeSesionPorCuenta,
  IconosPort,
  ConectoresPort,
  Papel,
  ModelosPort,
  MotorExterno,
  SkillInfo,
  SubagenteExternoPort,
  VerifierPort,
} from "../../../core/ports.js";
import { crearSubagenteExterno } from "../../subagentes/subagenteExterno.js";
import { inventarioDelProyecto, opcionesDeSubagenteExterno } from "../../subagentes/escrituraExterna.js";
import { sumarConsumo, SIN_CONSUMO } from "../../subagentes/consumoExterno.js";
import { sumarPorModelo, type ConsumoPorModelo } from "../../../core/actos.js";
import { ColaDeEventos, entrelazar } from "../../../core/entrelazar.js";
import { modeloExternoParaTrueforge } from "./modeloExterno.js";
import { diferenciasDelContraste, metricasDeTrueforge } from "./metricasTrueforge.js";
import { cambiosQueSeVerifican, huellaDeErrores, repartirHallazgos, textoDeReparacion, tocaCriticarPantalla, TOPE_REPARACIONES } from "../../turno/verificacion.js";
import { correrTurno, type Piel } from "../../../core/turno.js";
import type { Artefacto } from "../../../core/artefactos.js";
import type { LineaDeDiff } from "../../../core/diff.js";
import { createTokenTracker, type TokenTracker } from "../../../vendor/tokenTracking.js";
import { MAX_APPROVAL_ROUNDS, type Decision } from "../../../vendor/hitl.js";
import { artefactosNuevos, backendDeAgente, entornoDeLaShellDelProyecto, fotoDeArtefactos, scriptsDeLasSkills } from "../../grafo/proyecto.js";
import { carpetaDeHotswap } from "../../../core/hotswap.js";
import { cargarAgentes } from "../../subagentes/agentesEnDisco.js";
import { fichaDeAgente, promptDeAgente, recibeMarcarCriterios, repartirSkills, type Agente } from "../../../core/agentes.js";
import { PERFIL_DEL_ORQUESTADOR, promptOrquestador } from "../../grafo/xoneAgent.js";
import { permisosDe, seDetieneEn, TEXTO_HITL } from "../../grafo/perfiles.js";
import { cambioDe } from "../../turno/interrupts.js";
import { tomarInstantanea, type Cambio } from "../../turno/instantanea.js";
import { ficherosDelProyecto } from "../../turno/ficherosDelProyecto.js";
import type { SesionReal } from "../../turno/sesionReal.js";
import { accionDelJuez, type HechosDelTurno, type VeredictoDelTurno } from "../../../core/juezDelTurno.js";
import type { Entorno } from "../../config/entorno.js";
import { modeloParaTrueforge } from "./modeloLangchain.js";
import { TOOLS_DE_LECTURA, type BackendDeFicheros } from "./toolsDeFichero.js";
import { topeAgotadoDe, traducirEvento, type PensamientoPorHilo } from "./eventosTrueforge.js";
import { anuncioDeSkills } from "./skillsTrueforge.js";
import {
  capabilitiesDe,
  capacidadDeFecha,
  capacidadDeFicheros,
  capacidadDeAvisoDeVueltas,
  capacidadDeInstrucciones,
  capacidadDeNotas,
  capacidadDeConectores,
  capacidadDePropias,
  capacidadDeRecortes,
  capacidadesDelEspecialista,
  type Capacidad,
  clasesDeTools,
  toolsDe,
} from "./capacidades.js";
import { crearConectoresDeSesion, tarjetaDeRemota } from "./toolsDeConectores.js";
import { CONECTOR_STITCH, crearTraerDeStitch } from "./traerDeStitch.js";
import { esDeLaMaqueta } from "../../../core/stitch.js";
import { recibeConectores } from "../../../core/conectores.js";
import { buscarMaqueta, medirContraMaqueta, resumenDeMedida, textoDeMedidaAutomatica, ultimaCaptura } from "./medidaAutomatica.js";
import { anotarEscritura, capacidadDeInformesDeHijos, escrituraConExito, textoDelInforme, type CambioDeFichero } from "./informesDeHijos.js";
import { crearDiagnosticoDeTools, type DiagnosticoDeTools } from "../../turno/diagnosticoDeTools.js";
import { encenderTrazaDeErrores } from "../../trazaDeErroresEnDisco.js";
import { anotarPaso } from "../../../core/trazaDeErrores.js";
import { entornoConDepuracion } from "../../turno/depuracion.js";
import { detalleDe, parametrosDe } from "../../turno/resumenDeTool.js";
import { apartarMemoria, cargarMemoria, fotoSaneada, guardarMemoria, textoDeMemoriaDescartada, type FotoDeHilo } from "./memoriaTrueforge.js";
import { crearNota, sobrantes, type Nota } from "./notas.js";
import { crearMemoriaDeEspecialistas } from "./memoriaDeEspecialistas.js";
import { crearEsperas } from "./esperas.js";
import { conResumenSeguro } from "./resumenSeguro.js";
import { crearControlDeDetencion, RESUMEN_DE_RELLENO } from "./detencion.js";
import type { ToolDeLangchain } from "./toolsPropias.js";
import { crearNavegacionXone } from "../../grafo/navegacionXone.js";
import { hechosDelProyectoDe } from "../../navegacion/hechosEnDisco.js";
import { conHechosDelProyecto } from "../../../core/hechosDelProyecto.js";
import { crearBusquedaRegex } from "../../grafo/busquedaRegex.js";
import { crearBuscarIcono, recibeBuscarIcono } from "../../grafo/buscarIcono.js";
import { crearGenerarFondoSvg, recibeGenerarFondo } from "../../grafo/generarFondoSvg.js";
import { crearCopiarArtefacto } from "../../grafo/copiarArtefacto.js";
import { crearMarcarCriteriosDelPlan } from "../../grafo/marcarCriteriosDelPlan.js";
import { crearUnirSecciones } from "../../grafo/unirSecciones.js";
import { crearIncorporarAdjunto, recibeIncorporarAdjunto } from "../../grafo/incorporarAdjunto.js";
import { crearCriticaVisual } from "../../grafo/criticaVisual.js";
import { crearCompararCapturas } from "../../grafo/compararCapturas.js";
import { crearAtributosXone, NOMBRE_ATRIBUTOS_XONE } from "../../grafo/atributosXone.js";
import { crearDiferenciaDeCapturas } from "../../grafo/diferenciaDeCapturas.js";
import { crearLectorDeReferencias } from "../../grafo/lectorDeReferencias.js";
import { crearDescribirImagen } from "../../grafo/describirImagen.js";
import { crearTraerDeLaMaquina } from "../../grafo/traerDeLaMaquina.js";
import { invocarVisualConModelos } from "../../dispositivos/juezVisual.js";
import { estilosDeDisco, indiceEnDisco, type CargarIndice } from "../../navegacion/indiceEnDisco.js";

/** El hilo raíz de TrueForge. Se llama así en la librería y no se elige. */
const HILO_RAIZ = "main";

/**
 * **Ser fiel a un diseño es parte del encargo, y se comprueba con números Y con ojos.**
 *
 * Rehaciendo una calculadora de Stitch, el orquestador dio la pantalla por buena una y otra vez con
 * el crítico en verde, porque corría SIN la maqueta: su verde significaba «nada roto» y no veía que
 * faltaba la barra superior. Con la maqueta a mano (`/diseno/`, `/adjuntos/`), el bucle es este, y
 * termina: una condición de parada de estructura y un tope de vueltas, porque sin tope un crítico
 * y un agente pueden retocar para siempre.
 */
const BUCLE_DE_CALIDAD = [
  "SI EL ENCARGO TRAE UN DISEÑO (una imagen en /diseno/, /adjuntos/ o /artefactos/), SER FIEL A ÉL es parte del",
  "encargo, y se comprueba con números y con ojos. Tras cada cambio visual: pide al conductor una captura NATIVA",
  "nueva y contrástala con `comparar_capturas` y con `xone_critica_visual`, pasando el diseño como `referencia` en las",
  "dos. Sin referencia el crítico solo dice «nada roto», que no es «se parece». Si la estructura o el crítico señalan",
  "diferencias con el diseño —piezas que faltan, tamaños, formas—, delega el arreglo en quien MAQUETA la pantalla (el que escribe su `.xne`, no el de los recursos) con esas diferencias concretas y",
  "repite. Para cuando la distancia estructural baje del 10 % en vertical y en horizontal y el crítico no señale diferencias de forma con el diseño, o tras TRES vueltas, y",
  "di lo que sigue faltando en vez de darlo por hecho.",
].join("\n");

/**
 * Lo que el orquestador tiene que saber para DELEGAR en ESTE motor. Su prompt es el de siempre
 * (`promptOrquestador`), que habla de `task` y de la ficha que va en su descripción: aquí la
 * delegación es `create_sub_agent` y no tiene descripción por especialista, así que se traduce
 * el nombre de la tool y las fichas van escritas aquí, con la MISMA función que deepagents.
 */
/**
 * **El idioma de la SALIDA, dicho desde código**, al raíz y a cada especialista. Visto en la consola web (MyAllXOne):
 * el texto entre herramientas salía en inglés («Let me call…») con la persona escribiendo en español: nuestros prompts
 * están en español pero ninguno lo decía, y hay piezas internas en inglés que tiran de él (la identidad que añade
 * TrueForge, las descripciones de las tools, la costumbre de DeepSeek de razonar en inglés).
 *
 * **Lo que importa es lo que LEE la persona, en SU idioma** (decisión suya): las respuestas, lo que se dice entre
 * herramientas y lo que se entrega. El razonamiento queda libre. Y no es «español» a fuego, es el idioma del usuario: el
 * raíz lo lee de su mensaje; un hijo no lo ve, así que sigue el de su encargo, que el raíz escribe en ese idioma.
 */
export const IDIOMA_DE_LA_RESPUESTA =
  "IDIOMA: contesta en el idioma en que te escribe el usuario (el de su último mensaje): tus respuestas y lo que dices " +
  "entre herramientas, que es lo que él lee. Los encargos a tus especialistas, escríbelos en ese mismo idioma. Tu " +
  "razonamiento puede ir en el idioma que quieras. El código, los nombres de ficheros, atributos y funciones, y las citas " +
  "literales se quedan como son.";

/** Lo mismo para un ESPECIALISTA, que no ve el mensaje del usuario: sigue el idioma de su encargo. */
export const IDIOMA_DEL_ESPECIALISTA =
  "IDIOMA: lo que devuelves y lo que entregas (un documento, un texto de la app, un informe) va en el idioma de tu " +
  "encargo, que es el del usuario. Tu razonamiento puede ir en el idioma que quieras. El código, los nombres de " +
  "ficheros, atributos y funciones, y las citas literales se quedan como son.";

/**
 * **Al desarrollador no se le cuenta la MAQUINARIA**, solo al raíz, que es quien le habla. Visto en la consola web: al
 * saludar, el raíz explicaba que tenía «la foto del proyecto», que no la iba a «re-escanear», que el especialista lo
 * llevaría «dentro del HANDOFF DE ANÁLISIS» y que usaría `xone_navegacion`. Es cómo trabaja el harness por dentro, no
 * algo que le sirva a quien pide: petición suya. A los hijos no va, porque le hablan al raíz y no a la persona.
 */
export const SIN_HABLAR_DEL_HARNESS =
  "CON QUIÉN HABLAS: con un desarrollador de apps XOne, al que le interesa su proyecto y su encargo, no cómo trabajas por " +
  "dentro. No le nombres tus herramientas, a tus especialistas por su nombre interno, los protocolos entre ellos (HANDOFF " +
  "DE ANÁLISIS…), la foto o el contexto que te llega al empezar, ni lo que vas a medir o no: cuéntale lo que encontraste, " +
  "lo que hiciste en su proyecto y lo que necesitas de él. Si pregunta cómo trabajas, entonces sí.";

/** Lo que recibe el agente en modo autónomo cuando pregunta sin marcar ninguna opción como recomendada. */
export const RESPUESTA_AUTONOMA_SIN_RECOMENDADA =
  "Modo autónomo: no hay nadie a quien preguntar. Decide tú con lo que dicen el encargo y el plan, sigue, y di en tu respuesta final qué elegiste y por qué.";

/** Un comando que saca una captura de pantalla del aparato. */
export const COMANDO_DE_CAPTURA = /xone-captura-android|xone-hotswap\s+shot\b|\bscreencap\b/;

/** Con cuántas capturas de UN encargo se le avisa a quien ejecuta. */
export const UMBRALES_DE_CAPTURAS = [2, 4] as const;

/**
 * El aviso de capturas. El prompt del conductor ya decía que una captura «no es una herramienta de diagnóstico», y una
 * comprobación de una pasada real sacó 18 —61 ficheros y 92 pares casi iguales en total—, casi todas para mirar valores
 * y excepciones que `getText`/`getFields` y el log contestan sin mirar nada. Un texto no es un contador.
 */
export function textoDeCapturas(capturas: number): string {
  return [
    `LLEVAS ${String(capturas)} CAPTURAS en este encargo.`,
    "Para un VALOR, un estado o una excepción no hace falta ninguna: `xone-log-android --app` (lo que la app escribió con",
    "`console.log`), `getFields`, `elements` acotado y el log de errores lo dicen sin mirar la pantalla. Una captura es para lo VISUAL (algo cortado, tapado, del color o tamaño equivocado) y una por",
    "cosa que compruebes, con `shot name=<qué pruebas>`. Si solo quieres saber si algo cambió, `diferencia_de_capturas`.",
    "No repitas la misma pantalla: si la anterior ya lo decía, no hay nada nuevo que sacar.",
  ].join("\n");
}

/** Con cuántas comprobaciones seguidas se le avisa a quien lleva un lazo. El primero es el «tres vueltas» del prompt. */
export const UMBRALES_DE_VUELTAS = [3, 5] as const;

/**
 * El aviso: no dice «para», dice «cambia de procedimiento». La misma familia de fallo se vio arreglada de cinco
 * maneras (un control que falta, y al arreglarlo, otro): lo que hay que hacer es aislar la causa una vez y aplicarla
 * a todos los sitios, no reescribir otra vez.
 */
export function textoDeVueltas(vueltas: number): string {
  return [
    `LLEVAS ${String(vueltas)} COMPROBACIONES SEGUIDAS con el aparato.`,
    "Si el fallo de la última es de la MISMA FAMILIA que el anterior (la misma excepción, el mismo tipo de control), NO hagas otra",
    "reescritura: (1) di la hipótesis en una frase, (2) pide al de pruebas UN experimento mínimo —un control, un evento— y lee",
    "el resultado BRUTO del aparato, (3) con la causa confirmada, aplica el arreglo a TODOS los sitios parecidos de una vez.",
    "Si tras eso el fallo sigue igual, devuelve el trabajo diciendo qué falta y qué mediste, en vez de otra vuelta.",
  ].join("\n");
}

/**
 * El hilo de un especialista que NO arrancó porque espera a otros: nace ya terminado, con la respuesta al orquestador
 * ya escrita (`preComputedCompletion`), y la librería lo trata como cualquier hijo que acaba. No llama al modelo ni tiene
 * tools: lo único que hace es contestar al que lo pidió.
 */
function hiloQueNoArranca(
  nombre: string,
  esperados: readonly string[],
  params: { threadId: string; parent: unknown; request: { name: string; input: string } },
  modelo: unknown,
  logger: unknown
): AgentThread {
  const padre = params.parent as { tool_call_id?: string };
  const texto =
    `${nombre} NO HA ARRANCADO: espera a que termine ${esperados.join(", ")}, que sigue trabajando y produce lo que ${nombre} necesita. ` +
    `Cuando ${esperados.join(", ")} te devuelva su informe, vuelve a llamar a ${nombre} con ese informe dentro del encargo.`;
  return new AgentThread({
    definition: { modelClient: modelo, iterationLimit: 1 } as never,
    threadId: params.threadId,
    title: params.request.name,
    parent: params.parent as never,
    agentInfo: { type: "dynamic", ...params.request } as never,
    preComputedCompletion: {
      type: "done",
      output: { role: "assistant", content: texto },
      send_to_parent: { role: "tool", tool_call_id: padre.tool_call_id ?? "", content: texto },
    } as never,
    tracing: NOOP_AGENT_TRACING,
    logger: logger as never,
  });
}

/**
 * Lo que se le cuenta a quien ESPERÓ a otros especialistas, al soltarse: a quién esperó y qué hay en el disco.
 * Solo NOMBRES —los recursos de `icons/` y los `ASSETS.md`/`TASKS.md` del plan—, nunca su contenido: es lo que dejó
 * el otro, que no viaja por ningún canal más que el disco. Sin recursos que nombrar, un aviso corto.
 */
export function textoDeLoQueDejaronLosEsperados(raiz: string, esperadas: readonly string[]): string {
  let recursos: string[] = [];
  try {
    recursos = readdirSync(join(raiz, "icons")).filter((f) => /\.(svg|png|jpg|jpeg)$/i.test(f)).sort();
  } catch {
    recursos = [];
  }
  let notas: string[] = [];
  try {
    notas = readdirSync(join(raiz, ".xonecode", "planes"))
      .flatMap((p) => ["ASSETS.md"].filter((f) => existsSync(join(raiz, ".xonecode", "planes", p, f))).map((f) => `/planes/${p}/${f}`))
      .sort();
  } catch {
    notas = [];
  }
  return [
    `Antes de ti han terminado ${esperadas.join(", ")}, que trabajaban a la vez o antes que tú.`,
    ...(recursos.length === 0 ? [] : [`Lo que hay ahora en icons/ (${String(recursos.length)}): ${recursos.join(", ")}.`]),
    ...(notas.length === 0 ? [] : [`Lo que dejó escrito para ti: ${notas.join(", ")}. Léelo antes de escribir.`]),
    "USA los recursos que te sirvan por su nombre exacto, y si no vas a usar alguno, dilo al devolver el trabajo.",
  ].join("\n");
}

/**
 * Lo que se le dice a quien puede llamar a otros. Cada llamada de estas es un hilo nuevo que solo sabe lo que le
 * escribas (aunque recuerde sus encargos anteriores de la sesión), y lo que te devuelve es lo que vio, no un
 * veredicto: decidir si lo que escribiste funciona sigue siendo cosa tuya, con lo que ese hijo te traiga.
 */
export function textoDelBucle(llama: readonly string[], opciones: { conCritica?: boolean } = {}): string {
  const puedeDiseñar = llama.includes("designer-xone");
  return [
    `PUEDES LLAMAR A: ${llama.join(", ")}, con \`create_sub_agent\` (\`name\` exacto y \`input\` autosuficiente).`,
    "Tu bucle es: escribe, llama al de pruebas para desplegar y comprobar, lee lo que te devuelve y corrige.",
    "Dile QUÉ comprobar y qué esperas ver. No lo llames por cada línea que cambies: junta los cambios.",
    "",
    "PRUEBAS FUNCIONALES Y VISUALES, SEPARADAS Y EN ESTE ORDEN:",
    "- Instrumenta tu código con `console.log(\"CALC tecla 8\")`, `console.log(\"CALC resultado \" + r)` en los puntos",
    "  que deciden (tecla, expresión, resultado, error). Nunca `ui.showToast` ni `appData.writeConsoleString` para depurar:",
    "  el aviso no deja rastro y el segundo es legacy y no llega al log de Android.",
    "- FUNCIONAL: UN encargo con TODOS los casos, como acciones y lo que esperas («teclea 2 + 3 × 4 = → log `CALC resultado",
    "  14`, display 14»). El de pruebas los hace, lee el log con `xone-log-android --app` y te devuelve cada caso: pasa o falla",
    "  con lo que salió. SIN capturas. Corrige todos los fallos juntos y repite solo los que fallaron.",
    "- VISUAL, solo cuando lo funcional pasa: UNA captura por ronda. Con ella el harness te trae la medida contra la maqueta;",
    "  pasa el crítico, arregla TODAS las diferencias en la misma ronda y solo entonces pide otra captura. Tres rondas como mucho.",
    "- Una pantalla que se parece a la maqueta con datos de ejemplo fijos NO está terminada: la lógica tiene que funcionar.",
    "Lo que te devuelva es lo que ha visto, no un permiso para dar el trabajo por bueno: si dice que la app se cae, se cae.",
    "EMPIEZA POR LO MÍNIMO: no escribas la pantalla entera de una vez. Primero la versión más pequeña que se pueda VER y PULSAR",
    "—el arranque, el display y UN botón—, y pídele al de pruebas que la arranque y la toque. Solo cuando eso funcione, amplía",
    "(el teclado, las funciones, el historial). Un fallo de arranque descubierto con la pantalla entera escrita cuesta reescribirla.",
    ...(puedeDiseñar
      ? [
          "El LAYOUT y el CSS son TUYOS: si la pantalla se ve mal, lo arreglas tú, no se lo pasas a nadie ni lo devuelves al que te",
          "encargó. `designer-xone` solo hace RECURSOS —iconos de una biblioteca y fondos SVG en `icons/`—: pídeselos juntos, con para",
          "qué control, tamaño en píxeles y colores, y usa los nombres que te devuelva. No le pidas que toque el `.xne` ni el CSS: no puede.",
          "Los recursos te llegan con una TABLA (fichero → control → atributo → tamaño → si lleva el símbolo dentro): úsala y no abras",
          "los SVG para enterarte de lo que ya dice.",
        ]
      : []),
    ...(opciones.conCritica === true
      ? [
          "",
          "PARA JUZGAR UNA PANTALLA tienes `xone_critica_visual` (un modelo aparte mira la captura) y `comparar_capturas` (mide la",
          "estructura contra la maqueta con números). Pídele al de pruebas una captura y que te diga su nombre; pásala con `pantalla` y,",
          "si hay diseño (/diseno/ o un adjunto), como `referencia`. Lo que digan esas dos herramientas manda sobre tu impresión: no",
          "lo descartes como «no fiable»; si no estás de acuerdo, dilo con el dato.",
          "Cada vez que vuelva el de pruebas con una captura, el HARNESS te trae su medida contra la maqueta: no hace falta que",
          "la pidas tú. El juicio es tuyo: con esa cifra y el crítico decides si sigues; no se lo devuelvas al que te encargó para que juzgue.",
        ]
      : []),
    "",
    "NO TERMINAS hasta que se cumpla el CRITERIO DE ACEPTACIÓN de tu encargo. Si el encargo no lo trae, es: (1) todas las casillas",
    "de la tarea en el `TASKS.md` comprobadas, (2) la app arranca y hace lo que pide, y (3) con diseño, la distancia que mide",
    "`comparar_capturas` por debajo del 10 % en vertical y en horizontal, que ENCAJE en la pantalla (cada borde del contenido a",
    "un 3 % o menos del de la maqueta: que llegue a los lados y abajo como ella), y el crítico sin diferencias de forma ni de estructura.",
    "Lo que XOne NO puede reproducir no cuenta y no lo persigas: las tipografías del diseño (no hay .ttf), el desenfoque de fondo y",
    "las animaciones; una sombra o un degradado se aproximan con un SVG. Tienes TRES vueltas de corregir y volver a comprobar para",
    "llegar; si al agotarlas algo",
    "sigue sin cumplirse, devuelve el trabajo diciendo QUÉ falta, con lo que midieron el crítico y la medida tal cual. Devolver antes",
    "porque «ya funciona» es dejar el trabajo a medias. Al devolver cuenta lo que se midió: el juicio final no es tuyo, y el arnés",
    "lo revisa igual.",
  ].join("\n");
}

export function notaDeDelegacion(
  agentes: readonly Agente[],
  opciones: { conIconos?: boolean; conComparacion?: boolean; conMemoria?: boolean; conBucle?: boolean; conEsperas?: boolean } = {}
): string {
  if (agentes.length === 0) return "";
  return [
    "NOTA DEL HARNESS: en este entorno NO existe la tool `task`. Se delega con `create_sub_agent`:",
    "`name` es EXACTAMENTE el nombre del especialista y `input` el encargo, autosuficiente —el",
    "especialista no ve esta conversación—. Donde estas instrucciones dicen `task` o `subagent_type`,",
    "entiende `create_sub_agent` y `name`. Las fichas de los especialistas:",
    ...agentes.map((a) => `- ${a.nombre}: ${fichaDeAgente(a, opciones)}`),
    ...(opciones.conComparacion === true ? ["", BUCLE_DE_CALIDAD] : []),
    ...(opciones.conEsperas === true
      ? [
          "",
          "ESPERAS ENTRE ESPECIALISTAS: developer-xone NO arranca mientras designer-xone esté trabajando (lo que el diseñador produce",
          "—los recursos de `icons/`— lo necesita el `.xne`). Si los lanzas a la vez, la llamada al desarrollador te vuelve AL INSTANTE",
          "diciendo que no ha arrancado; cuando el diseñador te devuelva su informe, llama de nuevo al desarrollador con ESE INFORME dentro",
          "del encargo: su TABLA de recursos (fichero → control → atributo → tamaño) TAL CUAL, no un resumen, y no revises tú los SVG. Lo más simple es lanzar primero al diseñador y, con su informe, al desarrollador.",
        ]
      : []),
    ...(opciones.conBucle === true
      ? [
          "",
          "BUCLE DEL DESARROLLADOR: developer-xone prueba lo que escribe él mismo, llamando a device-controller (despliega, toca y lee",
          "el log), maqueta y arregla lo visual él mismo —designer-xone solo le hace iconos y fondos SVG—, y corrige hasta cumplir el CRITERIO DE ACEPTACIÓN que le des. Por eso",
          "cada encargo a developer-xone lleva el CRITERIO ESCRITO y MEDIBLE: qué casillas del plan tiene que dejar comprobadas, qué",
          "tiene que hacer la app, y, si hay diseño, que la distancia de `comparar_capturas` quede por debajo del 10 % en vertical y en",
          "horizontal, que ENCAJE en la pantalla (cada borde a un 3 % o menos del de la maqueta) y que el crítico no señale diferencias de forma o de estructura (di dónde está la maqueta). No se puede pedir",
          "lo que XOne no reproduce —las tipografías del diseño, el desenfoque de fondo, las animaciones—. Sin criterio, devolverá el",
          "trabajo en cuanto funcione. No le encargues a device-controller comprobar SU",
          "trabajo, ni a designer-xone lo visual de su pantalla (designer-xone no puede tocar un `.xne` ni el CSS): llama tú al diseñador",
          "para los RECURSOS que la pantalla necesite, antes del desarrollador. Lo que developer-xone te devuelva es lo que él vio y midió, no un veredicto: el juicio final es tuyo y del arnés.",
        ]
      : []),
    ...(opciones.conMemoria === true
      ? [
          "",
          "MEMORIA DE LOS ESPECIALISTAS: en esta sesión cada especialista RECUERDA sus encargos anteriores (lo que leyó,",
          "lo que descubrió y lo que hizo). Al volver a llamar a uno, dale solo lo NUEVO: no repitas lo que ya sabe.",
        ]
      : []),
  ].join("\n");
}

/** Lo que cada clase NO puede hacer, que la lista de tools no dice sola. */
const LIMITES_DE: Record<ReturnType<typeof clasesDeTools>, string> = {
  ejecuta: "No puedes escribir ficheros del proyecto.",
  lee: "Solo puedes escribir en `/artefactos/` y `/planes/`: el proyecto no lo puedes tocar, y no puedes ejecutar comandos.",
  escribe: "Cada escritura la aprueba una persona viendo su diff, y no puedes ejecutar comandos.",
};

/**
 * La frase de las tools que TIENE, sacada de los nombres que de verdad se le montan: escrita a
 * mano se quedaba vieja en cuanto se añadía una —la nota decía cuatro y el modelo veía seis—.
 */
/**
 * CUÁNDO usar el índice de atributos, junto a la lista de tools y solo a quien la tiene. Medido en calc13: con la tool
 * montada y descrita, el consultor la consultó 9 veces y el desarrollador —quien escribe los atributos— ninguna, con 13
 * lecturas de la skill: su prompt solo la nombraba en la lista, y el `SKILL.md` le manda a las referencias. No va en el
 * `SKILL.md` porque ese llega también a los motores externos, que no tienen la tool.
 */
export const USO_DE_XONE_ATRIBUTOS =
  "Para saber si un atributo XML existe en un nodo (coll, group, frame, prop) y qué hace, pregunta PRIMERO a `xone_atributos`: " +
  "contesta en una línea desde las tablas de la skill. Lee la referencia de la skill solo si no lo encuentra, o si necesitas ejemplos o matices.";

export function notaDeTools(nombres: readonly string[], limite: string): string {
  return `NOTA DEL HARNESS: aunque tu identidad diga lo contrario, NO tienes las mismas tools que quien te delega. Tienes ${nombres
    .map((n) => `\`${n}\``)
    .join(", ")}. ${limite}`;
}

/** Un nombre que no es de ningún especialista: lectura a secas, sin escribir en ningún sitio. */
const LIMITE_DEL_GENERICO = "No puedes escribir ficheros ni ejecutar comandos.";

/**
 * La pregunta del orquestador, como TEXTO del chat: la pregunta y sus opciones numeradas. Se pinta
 * en la respuesta y no en un diálogo, a propósito: así llega igual a la web, a la TUI y al terminal
 * sin tocar ninguna piel, y la persona contesta como contesta siempre, escribiendo.
 */
export function textoDePregunta(args: Record<string, unknown>): string {
  const { pregunta, opciones } = consultaDe(args);
  return [
    "\n\n" + pregunta,
    ...(opciones.length === 0 ? [] : ["", ...opciones.map((o, i) => `${i + 1}. ${o}`), "", "Contesta con el número o con tus palabras."]),
  ].join("\n");
}

/**
 * La pregunta y sus opciones como DATO (`events.ts#consulta`), de los argumentos que mandó el
 * modelo: una sola lectura para el texto, la tarjeta y la respuesta, o las tres divergirían.
 */
export function consultaDe(args: Record<string, unknown>): { pregunta: string; opciones: string[] } {
  return {
    pregunta: typeof args.question === "string" ? args.question.trim() : "",
    opciones: Array.isArray(args.options) ? args.options.filter((o): o is string => typeof o === "string") : [],
  };
}

/** Lo que escribió la persona, como respuesta: un número de opción se traduce a su texto. */
export function respuestaAPregunta(args: Record<string, unknown>, escrito: string): string {
  const { opciones } = consultaDe(args);
  const n = /^\s*(\d+)\s*[.)]?\s*$/.exec(escrito);
  const elegida = n === null ? undefined : opciones[Number(n[1]) - 1];
  return elegida ?? escrito;
}

/**
 * El tope de llamadas del ORQUESTADOR en un turno. deepagents no le pone ninguno —no puede quedarse
 * a medias— y TrueForge exige un número (su omisión, 25, es la del core); 100 es la omisión de su
 * propio `AgentSpec`. Es POR TURNO porque el raíz se rehace desde su foto al acabar cada uno.
 */
export const LIMITE_DE_LLAMADAS_DEL_RAIZ = 100;

/** La pregunta guardada en la foto, en la forma con que la espera el turno. */
function preguntaDeLaFoto(foto: FotoDeHilo | undefined): Pendiente | undefined {
  const p = foto?.pregunta_pendiente;
  if (p === undefined) return undefined;
  return {
    clave: claveDe(p.hilo, p.id),
    hilo: p.hilo,
    id: p.id,
    nombre: "ask_user_question",
    args: p.args,
    ...(p.encargo === undefined ? {} : { encargo: p.encargo }),
  };
}

export interface OpcionesDeSesionTrueforge {
  raiz: string;
  modelos: ModelosPort;
  entorno: Entorno;
  /**
   * El catálogo de skills de la sesión. OBLIGATORIO: sin él cada especialista se quedaría sin
   * el anuncio de las suyas y trabajaría como si no las tuviera, sin un error que leer — el
   * patrón de fallo del campo opcional.
   */
  skills: readonly SkillInfo[];
  pedirAprobacion?: (
    pendientes: PendienteDeAprobacion[],
    ficheros: Map<string, string>,
    diffs: Map<string, LineaDeDiff[]>
  ) => Promise<Map<string, Decision>>;
  /** El modo autónomo de la sesión, leído en CADA ronda (`core/modoDeEscritura.ts`). */
  sinAprobacion?: () => boolean;
  /** La carpeta de artefactos de la sesión (lo que el agente ve como `/artefactos/`). */
  artefactos?: string;
  /**
   * La carpeta de los ADJUNTOS — lo que el agente ve como `/adjuntos/`, de solo lectura
   * (`core/adjuntos.ts`, `agent/grafo/proyecto.ts#backendConAdjuntos`). Ausente es «no hay»
   * y `/adjuntos/` no se monta; una cadena vacía montaría el cwd del proceso.
   *
   * **Antes de IXCODE-7 este motor no recibía este dato en absoluto**: una tarea con
   * adjuntos corría en TrueForge sin `/adjuntos/` montada, mudo — los tests de la pieza
   * pasaban igual porque la composición vivía en `montarBackend`, que ningún test doblaba.
   */
  adjuntos?: string;
  /** De dónde salen los iconos (IXCODE-18). Ausente = `buscar_icono` no se monta. */
  iconos?: IconosPort;
  /**
   * Los conectores MCP del proyecto (Stitch…). El MISMO servicio de Ajustes, que solo tiene la
   * web: ausente —el terminal, `run`, los evals— es que ningún agente recibe sus tools.
   */
  conectores?: ConectoresPort;
  hilo?: string;
  /**
   * El índice de `xone_navegacion`. Solo para doblarlo en un test: ausente es el REAL, sobre la
   * raíz (`indiceEnDisco`), y la omisión vive aquí y no en quien llama por el patrón de fallo de
   * siempre — compuesta en un cierre que los tests doblan, la tool quedaría escrita y sin montar.
   */
  navegacion?: CargarIndice;
  /**
   * El simulador. Entra por parámetro, como en deepagents, para que `npm test` siga sin él; en
   * producción lo pasa `abrirSesionReal`, que es quien lo recibe de todas las pieles.
   */
  verifier?: VerifierPort;
  /** Solo para doblar la traza en un test; ausente es la real (`crearDiagnosticoDeTools`). */
  diagnostico?: DiagnosticoDeTools;
  /** Tope de rondas de aprobación con alguien delante (el de la consola). */
  topeDeRondas?: number;
  /**
   * Que cada especialista recuerde sus encargos anteriores de la sesión (`memoriaDeEspecialistas.ts`).
   * Por omisión SÍ; `XONECODE_SIN_MEMORIA_DE_ESPECIALISTAS=1` lo apaga, para comparar una pasada con y sin ella.
   */
  memoriaDeEspecialistas?: boolean;
  /**
   * El BUCLE del desarrollador: quien escribe puede llamar por su cuenta a los especialistas que su `.md`
   * declara en `llama` (hoy `device-controller`), y así prueba lo que escribe sin pasar por el orquestador.
   * Apagado por omisión: `XONECODE_BUCLE_DEL_DEVELOPER=1` lo enciende, para compararlo con una pasada sin él.
   */
  bucleDelDesarrollador?: boolean;
  /**
   * Que un hijo espere al fin de los que su `.md` declara en `espera` cuando el orquestador los lanza a la vez
   * (`esperas.ts`). Por omisión SÍ: es una regla de coherencia, no una palanca de coste.
   */
  esperasEntreHijos?: boolean;
  /**
   * El crítico VISUAL y el JUEZ del turno, los MISMOS puertos que deepagents
   * (`turnoReal.ts#abrirSesionReal`): llaman a un modelo, así que entran por parámetro y
   * `npm test` no pregunta a nadie. Ausente es «esta ejecución no tiene», nunca «está bien».
   */
  criticaVisual?: (
    captura: { base64: string; mime: string },
    pantalla: string
  ) => Promise<{ veredicto: string; observaciones: string[] }>;
  juezDelTurno?: (caso: { objetivo: string; respuesta: string; hechos: HechosDelTurno }) => Promise<VeredictoDelTurno>;
  /**
   * La FÁBRICA del puerto de los motores externos (Claude Code, Codex, OpenCode), no el puerto:
   * así un test recibe las opciones que la sesión COMPONE —política, modo, cola, consumo— y las
   * comprueba una a una. Ausente es la real (`crearSubagenteExterno`), y la omisión vive aquí por
   * el patrón de fallo de siempre: compuesta en un cierre que los tests doblan, quedaría escrita.
   */
  subagenteExterno?: (opciones: ReturnType<typeof opcionesDeSubagenteExterno>) => SubagenteExternoPort;
  /**
   * ¿Las dos trazas opt-in van encendidas sin variable de entorno? Resuelto por quien LLAMA,
   * igual que en deepagents (`turnoReal.ts#abrirSesionReal`) — ver ahí el porqué de que
   * ausente se comporte exactamente como hoy.
   */
  depurar?: boolean;
}

/** Una tool call que espera decisión: en QUÉ hilo, con qué id, y qué pide. */
interface Pendiente {
  clave: string;
  hilo: string;
  id: string;
  nombre: string;
  args: Record<string, unknown>;
  /** Solo en una PREGUNTA: el encargo CRUDO que la provocó, para juzgar y reparar contra él y no
   *  contra la respuesta. Viaja en la foto, así que sobrevive a reabrir la sesión. */
  encargo?: string;
}

const claveDe = (hilo: string, id: string): string => `${hilo}:${id}`;

/**
 * `agregarNota` no vive todavía en `SesionReal` (IXCODE-4, Task 6 se la añade ahí como opcional,
 * compartida con deepagents): se ensancha el tipo de retorno AQUÍ, en vez de esperar a esa task,
 * porque una sesión sin ella tipado como `SesionReal` a secas dejaría `s.agregarNota(...)` en
 * rojo bajo `tsc --noEmit` desde este mismo commit. Sigue siendo un `SesionReal` válido en
 * cualquier sitio que lo espere (`turnoReal.ts#abrirSesionReal`), por ser una intersección.
 */
export async function abrirSesionTrueforge(
  opciones: OpcionesDeSesionTrueforge
): Promise<SesionReal & { agregarNota(texto: string): void; detener(texto: string): void; readonly llamadasTiradasPorDetener: number }> {
  const { raiz } = opciones;
  let modelos = opciones.modelos;
  const logger = winston.createLogger({ silent: true, transports: [] });
  /**
   * La traza de tools (`XONECODE_TRACE_TOOLS=1`), la MISMA de deepagents: mismo fichero y mismo
   * formato, así que `xonecode traza` compara los dos motores. La omisión es la real —entrar por
   * parámetro solo sirve para doblarla—, que es lo que evita dejarla escrita y sin montar.
   */
  const entornoDeDiagnostico = entornoConDepuracion(opciones.depurar === true);
  // El CHAT es la sesión con la que se abrió (`opciones.hilo`, el id del índice), no el `hilo` de
  // ahora: `/nuevo` abre otro hilo huérfano pero los actos siguen yendo a la misma sesión.
  const diagnostico = opciones.diagnostico ?? crearDiagnosticoDeTools(raiz, entornoDeDiagnostico, opciones.hilo);
  /**
   * La traza de EXCEPCIONES e HITOS, la MISMA de deepagents (`turnoReal.ts`) y que aquí
   * faltaba por completo: TrueForge nunca la encendía, ni siquiera con la variable de entorno
   * puesta a mano.
   */
  encenderTrazaDeErrores(raiz, entornoDeDiagnostico);
  const tracker: TokenTracker = createTokenTracker();
  const oyentes = new Set<() => void>();
  let aborto: AbortController | undefined;
  /** Se pidió cancelar ESTE turno. Hace falta además del `aborto`: entre dos rondas —mientras
   *  se espera una aprobación— no hay llamada en curso que abortar, y la ronda siguiente
   *  abriría un control nuevo y se llevaría la cancelación por delante. */
  let cancelado = false;
  let cerrada = false;
  let hilo = opciones.hilo ?? `tf-${Date.now()}`;
  const catalogo = opciones.skills;
  const disponibles = new Set(catalogo.map((s) => s.nombre));
  /** De quién es cada hilo, para que la tarjeta de aprobación diga QUIÉN quiere escribir. */
  const quienEs = new Map<string, string>([[HILO_RAIZ, PERFIL_DEL_ORQUESTADOR.nombre]]);
  /**
   * El especialista CARGADO de cada hilo hijo, para el `origen` de sus tools. No es `quienEs`:
   * ése guarda también el nombre que el modelo puso al delegar aunque no sea de nadie, y lo que
   * viaja por el cable como nombre de un especialista tiene que serlo de verdad.
   */
  const especialistaDeHilo = new Map<string, string>();
  const conMemoriaDeEspecialistas = opciones.memoriaDeEspecialistas ?? process.env.XONECODE_SIN_MEMORIA_DE_ESPECIALISTAS !== "1";
  // Encendido por omisión desde que se midió (calc9-calc15); `XONECODE_BUCLE_DEL_DEVELOPER=0` lo apaga para comparar.
  const conBucleDelDesarrollador = opciones.bucleDelDesarrollador ?? process.env.XONECODE_BUCLE_DEL_DEVELOPER !== "0";
  const conEsperas = opciones.esperasEntreHijos ?? true;
  /** Cuántas comprobaciones (llamadas a quien EJECUTA) lleva cada hilo que lleva un lazo. */
  const vueltasDeCadaHilo = new Map<string, number>();
  /** Cuántas CAPTURAS ha sacado cada hilo que ejecuta comandos (`xone-captura-android`, `xone-hotswap shot`). */
  const capturasDeCadaHilo = new Map<string, number>();
  /** Lo que escribió cada hijo en su encargo, quién lo llamó, y los informes que esperan a ese padre (`informesDeHijos.ts`). */
  const escritosDeCadaHilo = new Map<string, Map<string, CambioDeFichero>>();
  const padreDeHilo = new Map<string, string>();
  const informesPendientes = new Map<string, string[]>();
  /** Las escrituras pedidas y aún sin respuesta, por hilo e id: la respuesta de una aprobada llega en OTRO `paso`. */
  const escriturasEnVuelo = new Map<string, { nombre: string; args: Record<string, unknown> }>();
  /** Para la medida automática (`medidaAutomatica.ts`): cuándo nació cada hilo, su última escritura, su última crítica y la última medida que recibió. */
  const nacimientoDeHilo = new Map<string, number>();
  const ultimaEscrituraDeHilo = new Map<string, number>();
  const ultimaCriticaDeHilo = new Map<string, number>();
  const ultimaMedidaDeHilo = new Map<string, string>();
  /** Cuántas rondas VISUALES lleva cada hilo: una por medida automática recibida (`RONDAS_VISUALES`). */
  const rondasVisualesDeHilo = new Map<string, number>();
  const capacidadDeInformes = capacidadDeInformesDeHijos((hiloPadre) => {
    const textos = informesPendientes.get(hiloPadre) ?? [];
    informesPendientes.delete(hiloPadre);
    return textos;
  });
  const esperas = crearEsperas();
  const memoriaDeEspecialistas = crearMemoriaDeEspecialistas();
  /** Los hijos con memoria que corren ahora: su hilo, para leer su historial al terminar. */
  const hijosConMemoria = new Map<string, { nombre: string; hilo: AgentThread; iniciales: unknown[] }>();

  /** Lo que el agente dejó en `/artefactos/` y aún no se ha anunciado: un artefacto se escribe
   *  SIN aprobación, así que tiene que ANUNCIARSE, como en deepagents. */
  const artefactosPorAnunciar: Artefacto[] = [];
  /** Las IMÁGENES que dejó el turno en curso, para el crítico de pantalla. Se vacía al empezar
   *  cada turno: una captura de antes enseña la pantalla de antes. */
  let capturasDelTurno: Artefacto[] = [];
  const anotarArtefacto = (a: Artefacto): void => {
    artefactosPorAnunciar.push(a);
    // La MAQUETA traída (`/artefactos/diseno/`) no es una captura del aparato: el crítico de pantalla
    // la juzgaría como si fuera la app.
    if (a.mime !== undefined && a.mime.startsWith("image/") && !esDeLaMaqueta(a.ruta)) capturasDelTurno.push(a);
  };
  /** Lo que la persona escribió mientras el agente trabajaba, IXCODE-4: se entrega por
   *  `capacidadDeNotas`, la MISMA instancia en la raíz y en cada hijo. */
  const notas: Nota[] = [];
  /** DETENER y replanificar (`detencion.ts`): viaja por el mismo procesador que las notas. */
  const detencion = crearControlDeDetencion(HILO_RAIZ);
  /** Tool calls tiradas por DETENER en la sesión: si se queda en cero, el filtro es solo red. */
  let llamadasTiradasPorDetener = 0;
  const capacidadDeNotasDeLaSesion = capacidadDeNotas(notas, {
    detencion,
    nombreDe: (h) => quienEs.get(h) ?? h,
    hiloRaiz: HILO_RAIZ,
  });
  /** Lo que la persona escribió en el turno y nadie leyó: notas y la orden de DETENER. */
  const sinLeerDelTurno = (): string | undefined => {
    const sinLeer = [sobrantes(notas), detencion.sobrante()].filter((t): t is string => t !== undefined);
    return sinLeer.length === 0 ? undefined : sinLeer.join("\n\n");
  };
  const montarBackend = (ejecucion?: { entorno: Record<string, string>; senal?: () => AbortSignal | undefined }) =>
    backendDeAgente({
      raiz,
      ficheros: ficherosDelProyecto(raiz),
      ...(opciones.artefactos === undefined
        ? {}
        : { artefactos: { carpeta: opciones.artefactos, alEscribir: anotarArtefacto } }),
      ...(opciones.adjuntos === undefined ? {} : { adjuntos: opciones.adjuntos }),
      ...(ejecucion === undefined ? {} : { ejecucion }),
    });
  const backend = montarBackend() as unknown as BackendDeFicheros;

  /**
   * **Los motores EXTERNOS**, por el MISMO puerto que deepagents (`subagenteExterno.ts`), con sus
   * guardas de ruta, su política —la de la sesión, traducida (`politicaExternaDeSesion`)— y su
   * consumo. Lo que el hijo hace MIENTRAS trabaja entra por `eventosExternos` y se entrelaza con el
   * flujo del turno; las rutas que aplica sin preguntar van al aviso del turno por
   * `apuntarAplicadasSinPreguntar`, un puntero de la sesión a una lista del turno: la política se
   * compone una vez y el aviso es de cada turno.
   */
  const eventosExternos = new ColaDeEventos();
  let consumoExterno: ConsumoDeSesion = SIN_CONSUMO;
  /**
   * El consumo POR MODELO (`ConsumoPorModelo`): un especialista puede correr en otro modelo que el
   * raíz. Cada hilo apunta al id con que NACIÓ (`modeloDeHilo`); el raíz, al de su papel AHORA
   * (`/modelo` lo cambia). Suma lo mismo que `tracker` y `consumoExterno`, repartido.
   */
  let porModelo: ConsumoPorModelo = {};
  const modeloDeHilo = new Map<string, string>();
  const idDelPapel = (papel: Papel): string => modelos.idDePapel?.(papel) ?? `papel ${papel}`;
  const apuntarModelo = (id: string, cuenta: "modelo" | "externo", c: { entrada: number; salida: number; cache: number }): void => {
    porModelo = sumarPorModelo(porModelo, { [id]: { cuenta, ...c } });
  };
  let apuntarAplicadasSinPreguntar: ((rutas: readonly string[]) => void) | undefined;
  const externo = (opciones.subagenteExterno ?? crearSubagenteExterno)(
    opcionesDeSubagenteExterno({
      ...(opciones.pedirAprobacion === undefined ? {} : { pedirAprobacion: opciones.pedirAprobacion }),
      ficherosDelProyecto: () => ficherosDelProyecto(raiz),
      eventos: eventosExternos,
      alConsumir: (c) => {
        consumoExterno = sumarConsumo(consumoExterno, c);
        // Claude Code dice su gasto por modelo; los otros dos, solo por motor.
        if (c.porModelo !== undefined && Object.keys(c.porModelo).length > 0) {
          for (const [id, m] of Object.entries(c.porModelo)) apuntarModelo(`${c.motor}:${id}`, "externo", m);
        } else apuntarModelo(c.motor, "externo", c);
        avisar();
      },
      modo: {
        sinPreguntar: () => opciones.sinAprobacion?.() === true,
        alAplicarSinPreguntar: (rutas) => apuntarAplicadasSinPreguntar?.(rutas),
      },
    })
  );
  /**
   * Qué motores externos se pueden usar DE VERDAD, preguntado UNA vez al abrir —como deepagents al
   * construir el grafo—: un especialista que el orquestador elige y que revienta en cuanto lo
   * elige es un botón muerto que pulsa el modelo, y se lo cree.
   */
  const motoresDisponibles = new Set<MotorExterno>();
  for (const motor of new Set(cargarAgentes(raiz).agentes.map((a) => a.motor).filter((m) => m !== "modelo"))) {
    if (await externo.disponible(motor as MotorExterno)) motoresDisponibles.add(motor as MotorExterno);
  }
  /** Los hilos de un hijo EXTERNO: su «llamada al modelo» no es una llamada, no se cuenta. */
  const hilosExternos = new Set<string>();
  /** Cuántos hijos externos lanzó el turno en curso, para el contraste con las métricas del motor. */
  let externosDelTurno = 0;

  /**
   * **El raíz es el ORQUESTADOR, de solo lectura y SIN skills** — la regla de deepagents
   * (`xoneAgent.ts`): los subagentes no heredan las skills del orquestador, cada uno recibe
   * las de su `.md`. Lee para orientarse y contestar lo que se contesta mirando; todo lo que
   * escribe o ejecuta lo delega. Los de motor externo, solo si su motor está disponible: el
   * prompt del orquestador y la factoría de hijos salen de ESTA lista, así que no puede ofrecer
   * uno que luego no se monte.
   */
  const especialistas = (): Agente[] =>
    cargarAgentes(raiz).agentes.filter((a) => a.motor === "modelo" || motoresDisponibles.has(a.motor as MotorExterno));
  /**
   * **Las tools PROPIAS, con el MISMO reparto que deepagents** (`xoneAgent.ts`): son las mismas
   * funciones, adaptadas (`toolsPropias.ts`), no una copia.
   * - `xone_navegacion` va a TODOS, el orquestador incluido: medido en deepagents, el
   *   orquestador no delegaba la pregunta de estructura y sin ella se orientaba con once
   *   llamadas de `ls`/`grep`/`read_file`.
   * - `regex_search` a los especialistas.
   * - `copiar_artefacto` solo a quien declara `escribeEn` y con carpeta de artefactos.
   * - La crítica visual y traer de la máquina, solo al ORQUESTADOR y solo con carpeta: es
   *   quien reparte y quien lee la ruta que nombra la persona.
   */
  const ficheros = ficherosDelProyecto(raiz);
  const cargarIndice = opciones.navegacion ?? indiceEnDisco(raiz);
  const cargarEstilos = estilosDeDisco(raiz);
  const navegacion = (): ToolDeLangchain => crearNavegacionXone(cargarIndice, ficheros, cargarEstilos) as unknown as ToolDeLangchain;
  const carpeta = opciones.artefactos;
  const lectorDeReferencias = crearLectorDeReferencias({
    raiz,
    ...(carpeta === undefined ? {} : { artefactos: carpeta }),
    ...(opciones.adjuntos === undefined ? {} : { adjuntos: opciones.adjuntos }),
  });
  /** El crítico y la medida, con las MISMAS piezas para quien las tenga: el raíz, y con el bucle encendido el desarrollador. */
  const herramientasDeJuicio = (): ToolDeLangchain[] =>
    carpeta === undefined
      ? []
      : ([
          crearCriticaVisual({
            leerArtefacto: async (nombre) => readFileSync(join(carpeta, nombre)),
            invocar: invocarVisualConModelos({ paraPapel: (p) => modelos.paraPapel(p) }),
            // La maqueta casi nunca está en /artefactos/: la trae la persona (/adjuntos/) o vive en /diseno/.
            leerReferencia: lectorDeReferencias,
          }),
          // Medir la estructura contra la maqueta: la otra mitad del crítico, con el raíz como él.
          crearCompararCapturas({ leerArtefacto: async (nombre) => readFileSync(join(carpeta, nombre)), leerReferencia: lectorDeReferencias }),
        ] as unknown as ToolDeLangchain[]);
  // ¿Existe este atributo en este nodo? A todos, como la navegación: es de lectura y contesta desde la skill del paquete.
  const atributos = crearAtributosXone() as unknown as ToolDeLangchain;
  // VER una imagen (IXCODE-23), a TODOS, el raíz incluido: es de lectura, y el raíz es quien recibe los adjuntos.
  // `read_file` no abre una imagen y el aviso de adjuntos manda aquí (`describirImagen.ts`).
  const describirImagen = (): ToolDeLangchain =>
    crearDescribirImagen({
      invocar: invocarVisualConModelos({ paraPapel: (p) => modelos.paraPapel(p) }),
      leer: lectorDeReferencias,
      carpetas: {
        raiz,
        ...(carpeta === undefined ? {} : { artefactos: carpeta }),
        ...(opciones.adjuntos === undefined ? {} : { adjuntos: opciones.adjuntos }),
      },
    }) as unknown as ToolDeLangchain;
  /**
   * Los conectores MCP del proyecto, una vez por sesión: se leen los marcados AHORA y sus tools se
   * piden a la red al primer uso (`toolsDeConectores.ts`). El raíz recibe las de LECTURA; un
   * especialista, las dos clases si `recibeConectores`.
   */
  const delProyecto = opciones.conectores?.delProyecto(raiz) ?? [];
  const deConectores = opciones.conectores === undefined || delProyecto.length === 0 ? undefined : crearConectoresDeSesion(opciones.conectores, delProyecto);
  const conStitch = delProyecto.some((c) => c.id === CONECTOR_STITCH);
  const conectoresDe = (agente: Agente): readonly Capacidad[] =>
    deConectores === undefined || !recibeConectores(agente)
      ? []
      : [capacidadDeConectores(deConectores, "lectura", backend as never), capacidadDeConectores(deConectores, "escritura", backend as never)];
  /**
   * `traer_pantalla_de_stitch` (`traerDeStitch.ts`), solo si la sesión tiene Stitch entre sus
   * conectores y carpeta de artefactos donde dejar la maqueta. La reciben el raíz y quien recibe
   * los conectores: quien pide la pantalla y quien la construye a partir de ella.
   */
  const traerDeStitch = (): ToolDeLangchain[] =>
    opciones.conectores !== undefined && carpeta !== undefined && conStitch
      ? [crearTraerDeStitch({ conectores: opciones.conectores, carpeta, alEscribir: anotarArtefacto }) as unknown as ToolDeLangchain]
      : [];
  const propiasDelRaiz: ToolDeLangchain[] = [
    navegacion(),
    atributos,
    describirImagen(),
    ...herramientasDeJuicio(),
    ...(carpeta === undefined ? [] : ([crearTraerDeLaMaquina({ carpeta, alEscribir: anotarArtefacto })] as unknown as ToolDeLangchain[])),
    ...traerDeStitch(),
  ];
  const propiasDe = (agente: Agente): ToolDeLangchain[] => [
    crearBusquedaRegex(backend as never) as unknown as ToolDeLangchain,
    navegacion(),
    atributos,
    describirImagen(),
    ...(carpeta !== undefined && (agente.escribeEn ?? []).length > 0
      ? [crearCopiarArtefacto({ raiz, carpetaDeArtefactos: carpeta, perfil: agente }) as unknown as ToolDeLangchain]
      : []),
    // El mismo reparto que deepagents (`xoneAgent.ts`): a quien declara `escribeEn`.
    ...((agente.escribeEn ?? []).length > 0 ? [crearUnirSecciones({ raiz, perfil: agente }) as unknown as ToolDeLangchain] : []),
    // Meter un adjunto del chat en el proyecto, con el reparto de deepagents: a quien escribe el
    // proyecto entero y solo con la carpeta montada. Pide aprobación: `capacidadesDelEspecialista`
    // la pone en `requireApprovalForTools`, y `rondasDe` la pregunta con su tarjeta (`cambioDe`).
    ...(opciones.adjuntos !== undefined && recibeIncorporarAdjunto(agente)
      ? [crearIncorporarAdjunto({ raiz, carpetaDeAdjuntos: opciones.adjuntos, perfil: agente }) as unknown as ToolDeLangchain]
      : []),
    // Buscar un icono cuando faltan los assets (IXCODE-18), con el reparto de deepagents: a quien
    // escribe el proyecto y solo con el puerto. Es de LECTURA: no entra en `requireApprovalForTools`.
    ...(recibeConectores(agente) ? traerDeStitch() : []),
    ...(opciones.iconos !== undefined && recibeBuscarIcono(agente)
      ? [crearBuscarIcono(opciones.iconos) as unknown as ToolDeLangchain]
      : []),
    // Fondos SVG: pura y sin red, sin puerto; a quien escribe el proyecto, como deepagents.
    ...(recibeGenerarFondo(agente) ? [crearGenerarFondoSvg() as unknown as ToolDeLangchain] : []),
    // ¿Cambió la zona tras el toque? Al conductor, que es quien saca las capturas: comprueba una
    // ACCIÓN suya, no juzga la pantalla (eso sigue siendo del crítico y de `comparar_capturas`).
    ...(carpeta !== undefined && agente.ejecucion === true
      ? [crearDiferenciaDeCapturas({ leerArtefacto: async (nombre) => readFileSync(join(carpeta, nombre)) }) as unknown as ToolDeLangchain]
      : []),
    // Y marcar en el plan lo comprobado, con el reparto de deepagents (`recibeMarcarCriterios`).
    ...(recibeMarcarCriterios(agente) ? [crearMarcarCriteriosDelPlan({ raiz }) as unknown as ToolDeLangchain] : []),
    // El BUCLE del desarrollador: quien puede llamar al de pruebas también tiene el crítico y la medida, para
    // juzgar la pantalla con lo que el otro capture. El veredicto sigue siendo de un modelo aparte, no suyo, y el
    // juez final del arnés revisa igual (`textoDelBucle`).
    ...(conBucleDelDesarrollador && (agente.llama?.length ?? 0) > 0 ? herramientasDeJuicio() : []),
  ];
  /**
   * **Un cliente de modelo por papel, modelo y esfuerzo, que dura la SESIÓN** —hasta `/modelo`—, y
   * no uno por llamada como era.
   *
   * No es por ahorro, es por el ECO de DeepSeek (`config/ecoDeRazonamiento.ts`): repone el
   * `reasoning_content` que `@langchain/openai` tira, emparejándolo por el id de la tool call, y su
   * memoria vive DENTRO del cliente. Con un cliente nuevo en cada llamada la memoria nacía vacía y el
   * eco no emparejaba nunca. Medido en el cable con DeepSeek real: deepagents devolvía el
   * razonamiento en 7 de 7 mensajes con tool calls, y TrueForge en 0 de 5. Hoy la API lo acepta
   * igual, pero su documentación exige devolverlo, y con esto TrueForge lo hace a nivel HTTP haga lo
   * que haga su contexto —que es justo lo que cambia en 0.3—
   * (`deepseekEnTrueforge.test.ts`).
   */
  const clientes = new Map<string, unknown>();
  const clienteDe = (clave: string, crear: () => unknown): unknown => {
    let cliente = clientes.get(clave);
    if (cliente === undefined) {
      cliente = crear();
      clientes.set(clave, cliente);
    }
    return cliente;
  };
  // Lo que la librería pierde: el razonamiento de cada llamada, por tokens de salida, hasta que su evento llega.
  const razonamientoPendiente = new Map<number, number[]>();
  const alRazonar = (salida: number, razonamiento: number): void => {
    razonamientoPendiente.set(salida, [...(razonamientoPendiente.get(salida) ?? []), razonamiento]);
  };
  const razonamientoDeSalida = (salida: number): number | undefined => razonamientoPendiente.get(salida)?.shift();
  const llm = modeloParaTrueforge({ modelo: () => clienteDe("papel:trabajo:", () => modelos.paraPapel("trabajo")), senal: () => aborto?.signal, alRazonar });

  /**
   * El hilo de un hijo EXTERNO: un `AgentThread` normal con UNA llamada, cuyo «modelo» es el
   * producto (`modeloExterno.ts`). Sin tools, sin capabilities y sin compactación: el bucle vive
   * dentro de Claude Code, Codex u OpenCode. La petición es la de deepagents (`xoneAgent.ts`), y
   * se compone al DELEGAR —el inventario, fresco—; su vida es la del encargo, y no se persiste
   * nada del producto: la foto del raíz guarda el encargo y la respuesta, nunca un proceso.
   */
  const hijoExterno = (
    agente: Agente,
    params: { request: { name: string; input: string }; threadId: string; parent: unknown }
  ): AgentThread => {
    hilosExternos.add(params.threadId);
    externosDelTurno += 1;
    const motor = agente.motor as MotorExterno;
    /**
     * La EJECUCIÓN de un externo: solo Claude Code, solo con `ejecucion: true` en su `.md` y con
     * carpeta de artefactos donde dejar lo que saque (`core/comandoExterno.ts`). Sus scripts, por
     * su nombre; el entorno de NUESTRA shell; y la lectura de ESTAS dos carpetas de la sesión, que
     * es donde sus scripts dejan las capturas. Codex y OpenCode siguen sin shell.
     */
    const ejecucion =
      agente.ejecucion === true && motor === "claude-code" && carpeta !== undefined
        ? {
            scripts: scriptsDeLasSkills(raiz, agente.skills),
            entorno: entornoDeLaShellDelProyecto(raiz, carpeta),
            lecturas: [carpeta, carpetaDeHotswap(carpeta)],
          }
        : undefined;
    /**
     * Lo que sus comandos dejen en `/artefactos/` se ANUNCIA al volver, con la MISMA foto que nuestra
     * shell (`fotoDeArtefactos`): por nuestra shell se anunciaba y por la suya no, y una captura
     * que no se anuncia no la mide nadie.
     */
    const puertoDelHijo: typeof externo =
      ejecucion === undefined || carpeta === undefined
        ? externo
        : {
            disponible: (m) => externo.disponible(m),
            correr: async (peticion) => {
              const antes = fotoDeArtefactos(carpeta);
              try {
                return await externo.correr(peticion);
              } finally {
                try {
                  for (const a of artefactosNuevos(antes, fotoDeArtefactos(carpeta))) anotarArtefacto(a);
                } catch {
                  // Un artefacto que no se pudo anunciar no invalida lo que hizo el hijo.
                }
              }
            },
          };
    return new AgentThread({
      definition: {
        modelClient: modeloExternoParaTrueforge({
          puerto: puertoDelHijo,
          peticion: () => ({
            motor,
            cwd: raiz,
            instrucciones: `${promptDeAgente(agente, repartirSkills(agente, disponibles))}\n\n${inventarioDelProyecto(ficherosDelProyecto(raiz))}`,
            tarea: params.request.input,
            ...(agente.modelo === undefined ? {} : { modelo: agente.modelo }),
            permitirEscritura: !agente.soloLectura,
            agente: agente.nombre,
            ...(ejecucion === undefined ? {} : { ejecucion }),
          }),
          senal: () => aborto?.signal,
        }),
        messages: [{ role: "user", content: params.request.input }],
        iterationLimit: 1,
      } as never,
      threadId: params.threadId,
      title: params.request.name,
      parent: params.parent as never,
      agentInfo: { type: "dynamic", ...params.request } as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
  };

  /**
   * El hilo de un subagente, sacado de SU `.md`: su prompt, SUS skills, sus permisos y su
   * modelo. TrueForge no tiene subagentes con nombre ni deja poner prompt propio a un hijo —su
   * identidad fija dice además que tiene «las mismas tools que el padre», que aquí no es
   * verdad—, así que las instrucciones van en su primer mensaje, CORRIGIENDO esa frase, y el
   * encargo detrás. Un nombre que no es de ningún especialista da un hijo genérico de SOLO
   * LECTURA y sin shell: un nombre inventado no tumba el turno ni se lleva la escritura.
   */
  const crearHijo = async (params: {
    request: { name: string; input: string };
    threadId: string;
    parent: unknown;
  }): Promise<AgentThread> => {
    // Quién lo pide: el raíz, o un especialista que llama a otro. Un especialista solo puede llamar a los que su
    // `.md` declara en `llama` y con el interruptor puesto; lo demás cae al ayudante genérico de solo lectura,
    // el mismo de un nombre inventado, y se anota en la traza.
    const quienPide = params.parent === undefined ? undefined : especialistaDeHilo.get((params.parent as { thread_id?: string }).thread_id ?? "");
    const permitidos = quienPide === undefined ? undefined : (especialistas().find((a) => a.nombre === quienPide)?.llama ?? []);
    const concedido = permitidos === undefined || (conBucleDelDesarrollador && permitidos.includes(params.request.name));
    if (!concedido) anotarPaso("trueforge.llamada", `${quienPide ?? "?"} pidió a ${params.request.name}: no está en su lista`)();
    const agente = concedido ? especialistas().find((a) => a.nombre === params.request.name) : undefined;
    // Cuenta una COMPROBACIÓN: quien lleva un lazo llamó a quien ejecuta. Es lo que dispara el aviso de vueltas.
    if (concedido && agente?.ejecucion === true && params.parent !== undefined) {
      const padre = (params.parent as { thread_id?: string }).thread_id ?? "";
      if (padre !== "") vueltasDeCadaHilo.set(padre, (vueltasDeCadaHilo.get(padre) ?? 0) + 1);
    }
    // ¿Arranca? Un especialista que declara `espera` NO arranca mientras haya vivo —o anunciado por el mismo mensaje del
    // orquestador— uno de esos: se le devuelve al instante diciéndolo, y el orquestador lo llama de nuevo con el informe del
    // otro. No se espera bloqueando: bloqueaba a la librería, que no devuelve el control mientras un hilo no termine su
    // paso, y una aprobación del otro hilo no se atendía (`esperas.ts`).
    const debeEsperar = conEsperas && agente !== undefined ? esperas.vivos(agente.espera ?? [], params.threadId) : [];
    if (agente !== undefined && debeEsperar.length > 0) {
      anotarPaso("trueforge.espera", `${agente.nombre} no arranca: espera a ${debeEsperar.join(", ")}`)();
      diagnostico?.memoria?.(agente.nombre, "arranca-sin", `espera a ${debeEsperar.join(", ")}`);
      return hiloQueNoArranca(agente.nombre, debeEsperar, params, llm, logger);
    }
    detencion.nacio(params.threadId);
    esperas.nacio(agente?.nombre ?? params.request.name, params.threadId);
    const hiloDelPadre = (params.parent as { thread_id?: string } | undefined)?.thread_id;
    if (hiloDelPadre !== undefined && hiloDelPadre !== "") padreDeHilo.set(params.threadId, hiloDelPadre);
    nacimientoDeHilo.set(params.threadId, Date.now());
    quienEs.set(params.threadId, agente?.nombre ?? params.request.name);
    if (agente !== undefined) especialistaDeHilo.set(params.threadId, agente.nombre);
    if (agente !== undefined && agente.motor !== "modelo") return hijoExterno(agente, params);
    const clase = agente === undefined ? "lee" : clasesDeTools(agente);
    // Las piezas por lo que declara su `.md` (`capacidades.ts`); la nota sale de SUS tools.
    const piezas = capacidadesDelEspecialista(agente, params.request.name, {
      backend: backend as never,
      propias: propiasDe,
      conectores: conectoresDe,
      notas: capacidadDeNotasDeLaSesion,
      puedeLlamar: (a) => conBucleDelDesarrollador && (a.llama?.length ?? 0) > 0,
      informes: capacidadDeInformes,
      vueltas: (a) =>
        a.ejecucion === true
          ? capacidadDeAvisoDeVueltas({ vueltasDe: (hilo) => capturasDeCadaHilo.get(hilo) ?? 0, umbrales: UMBRALES_DE_CAPTURAS, texto: textoDeCapturas })
          : conBucleDelDesarrollador && (a.llama?.length ?? 0) > 0
            ? capacidadDeAvisoDeVueltas({ vueltasDe: (hilo) => vueltasDeCadaHilo.get(hilo) ?? 0, umbrales: UMBRALES_DE_VUELTAS, texto: textoDeVueltas })
            : undefined,
      conShell: () =>
        montarBackend({
          entorno: entornoDeLaShellDelProyecto(raiz, opciones.artefactos),
          // El MISMO patrón que ya usa `modeloParaTrueforge` un poco más arriba en este
          // fichero: un getter que se reevalúa en cada llamada, así siempre lee el
          // `AbortController` de la RONDA en curso y no uno capturado al construir.
          senal: () => aborto?.signal,
        }) as unknown as {
          execute(c: string): unknown;
          write(ruta: string, contenido: string): unknown;
        },
    });
    const nombres = toolsDe(piezas);
    const nota = [
      notaDeTools(nombres, agente === undefined ? LIMITE_DEL_GENERICO : LIMITES_DE[clase]),
      ...(nombres.includes(NOMBRE_ATRIBUTOS_XONE) ? [USO_DE_XONE_ATRIBUTOS] : []),
    ].join("\n");
    const instrucciones =
      agente === undefined
        ? `${IDIOMA_DEL_ESPECIALISTA}\n\n${nota} Contesta con lo que encuentres y dónde.`
        : [
            IDIOMA_DEL_ESPECIALISTA,
            "",
            promptDeAgente(agente, repartirSkills(agente, disponibles)),
            "",
            nota,
            anuncioDeSkills(agente, catalogo),
            ...(conBucleDelDesarrollador && (agente.llama?.length ?? 0) > 0 ? ["", textoDelBucle(agente.llama ?? [], { conCritica: carpeta !== undefined })] : []),
          ]
            .filter((l) => l !== undefined)
            .join("\n")
            .trimEnd();
    const papel = agente?.soloLectura === true ? "rapido" : "trabajo";
    modeloDeHilo.set(params.threadId, agente?.modelo ?? idDelPapel(papel));
    const claseDeEsfuerzo = agente === undefined ? undefined : claseDeTrabajo(agente);
    // La memoria del especialista: su conversación anterior de ESTA sesión, si la hay y se puede usar.
    const apertura = conMemoriaDeEspecialistas && agente !== undefined ? memoriaDeEspecialistas.abrir(agente.nombre, params.threadId) : undefined;
    const previa = apertura !== undefined && "previa" in apertura ? apertura.previa : undefined;
    if (agente !== undefined && apertura !== undefined) {
      if (previa !== undefined) diagnostico?.memoria?.(agente.nombre, "arranca-con", "historial de la sesión", previa.tokens);
      else diagnostico?.memoria?.(agente.nombre, "arranca-sin", "sin" in apertura ? apertura.sin : "primera");
    }
    // Si lo que esperaba ya terminó en esta conversación, sabe qué dejó (solo nombres, nunca contenido).
    const esperado = conEsperas && agente !== undefined ? esperas.terminados(agente.espera ?? []) : [];
    const avisoDeLoEsperado = esperado.length > 0 ? `${textoDeLoQueDejaronLosEsperados(raiz, esperado)}\n\n` : "";
    const mensajesIniciales: unknown[] =
      previa === undefined
        ? [{ role: "user", content: `${avisoDeLoEsperado}${params.request.input}` }]
        : [
            ...previa.mensajes,
            {
              role: "user",
              content:
                "NUEVO ENCARGO. Ya trabajaste antes en esta sesión: lo de arriba es tu conversación anterior, con lo que leíste y decidiste. " +
                "No repitas lecturas de ficheros que no hayan cambiado.\n\n" +
                `${avisoDeLoEsperado}${params.request.input}`,
            },
          ];
    const definicionDelHijo = {
      modelClient: modeloParaTrueforge({
        modelo: () =>
          agente?.modelo === undefined
            ? clienteDe(`papel:${papel}:${agente?.esfuerzo ?? ""}:${claseDeEsfuerzo ?? ""}:${agente?.pensamiento ?? ""}`, () => modelos.paraPapel(papel, agente?.esfuerzo, claseDeEsfuerzo, agente?.pensamiento))
            : clienteDe(`modelo:${agente.modelo}:${agente.esfuerzo ?? ""}:${claseDeEsfuerzo ?? ""}:${agente.pensamiento ?? ""}`, () => modelos.paraModelo(agente.modelo!, agente.esfuerzo, claseDeEsfuerzo, agente.pensamiento)),
        senal: () => aborto?.signal,
        alRazonar,
        soloTexto: () => (detencion.soloTexto(params.threadId) ? RESUMEN_DE_RELLENO : undefined),
        corte: () => detencion.corte(params.threadId),
        alTirarLlamadas: (n) => {
          llamadasTiradasPorDetener += n;
          // A la traza de hitos (con «Depurar»): es la medida de si el filtro hace falta o es red.
          anotarPaso("trueforge.detener", `${quienEs.get(params.threadId) ?? params.threadId}: ${n} tool call(s) tiradas`)();
        },
      }),
      messages: mensajesIniciales,
      // Los topes MEDIDOS de deepagents: el conductor más, porque cada paso suyo es un comando.
      iterationLimit: agente?.ejecucion === true ? TOPE_DE_LLAMADAS_DEL_CONDUCTOR : TOPE_DE_LLAMADAS_DEL_ESPECIALISTA,
    };
    const hijo = new AgentThread({
      definition: definicionDelHijo as never,
      threadId: params.threadId,
      title: params.request.name,
      parent: params.parent as never,
      agentInfo: { type: "dynamic", ...params.request } as never,
      /**
       * **El prompt del especialista va en el prompt de SISTEMA, por una capability**, y no en
       * su primer mensaje como al principio. Medido en la librería: `buildInstruction` IGNORA el
       * `instruction` de un hijo (`!this.parent`), y lo único que llega a su sistema son los
       * `instructionBuilders`. En el primer mensaje, además, una compactación —que sustituye el
       * contexto entero— se lo llevaría por delante.
       *
       * **Y el hijo NO se compacta, por una medida.** Se activó al mismo umbral que el raíz y la
       * traza lo tumbó («lanza la app en el emulador», MyAllXOne): el `device-controller` llegó a
       * 32.694 a un par de llamadas de terminar, y el resumen de TrueForge —un prompt largo que
       * pide fragmentos de código enteros— costó 26.010 de entrada SIN caché y 5.916 de salida, y
       * las dos llamadas siguientes volvieron a calentar la caché. Un encargo de hijo es corto y va
       * cacheado al 85-95 %: reenviar su contexto sale más barato que resumirlo. El de deepagents
       * acabó a 22.508 sin llegar al umbral.
       */
      capabilities: capabilitiesDe([...piezas, capacidadDeInstrucciones(instrucciones)]) as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
    if (agente !== undefined && apertura !== undefined) hijosConMemoria.set(params.threadId, { nombre: agente.nombre, hilo: hijo, iniciales: mensajesIniciales });
    return hijo;
  };

  /**
   * El árbol de hilos de UNA conversación. Se rehace con `nuevoHilo`, al reabrir una sesión
   * —desde la foto guardada— y tras un turno cortado, desde la foto SANEADA del raíz: los hijos
   * que se quedaron esperando no pueden seguir, y con ellos vivos el siguiente mensaje del usuario
   * lo rechazaba la librería («Cannot process user messages while sub agents are running»).
   */
  let raizActual: AgentThread | undefined;
  /** La pregunta del orquestador que espera respuesta: el siguiente mensaje la contesta. */
  let preguntaEnEspera: Pendiente | undefined;
  const nuevoOrquestador = (foto?: FotoDeHilo): AgentThreadOrchestrator => {
    // Los hijos que corrían no pueden seguir; lo que aprendieron sí se queda.
    memoriaDeEspecialistas.darPorMuertos();
    esperas.darPorMuertos();
    hijosConMemoria.clear();
    const definicion = {
      modelClient: llm,
      instruction: [IDIOMA_DE_LA_RESPUESTA, SIN_HABLAR_DEL_HARNESS, promptOrquestador(especialistas()), notaDeDelegacion(especialistas(), { conIconos: opciones.iconos !== undefined, conComparacion: carpeta !== undefined, conMemoria: conMemoriaDeEspecialistas, conBucle: conBucleDelDesarrollador, conEsperas })].filter((l) => l !== "").join("\n\n"),
      // Por TURNO, porque el raíz se rehace desde su foto al final de cada uno (ver `turno`).
      iterationLimit: LIMITE_DE_LLAMADAS_DEL_RAIZ,
    };
    const raizDelArbol = new AgentThread({
      definition: definicion,
      threadId: HILO_RAIZ,
      title: HILO_RAIZ,
      capabilities: [
        // Las piezas del orquestador (`capacidades.ts`): leer, sus tools propias, el presupuesto
        // del paso y la fecha. Lo que necesita su definición —compactar— y delegar van aquí.
        ...capabilitiesDe([
          capacidadDeFicheros({ backend, reglas: permisosDe(PERFIL_DEL_ORQUESTADOR), tools: TOOLS_DE_LECTURA, conAprobacion: false }),
          capacidadDePropias(propiasDelRaiz, backend as never),
          ...(deConectores === undefined ? [] : [capacidadDeConectores(deConectores, "lectura", backend as never)]),
          capacidadDeRecortes(backend as never),
          capacidadDeFecha(),
          capacidadDeNotasDeLaSesion,
          capacidadDeInformes,
        ]),
        /**
         * **La conversación se RESUME al mismo umbral que deepagents** (`UMBRAL_RESUMEN_TOKENS`):
         * sin esto no se compactaba nunca y cada turno reenviaba la sesión entera. La
         * compactación de TrueForge sustituye el contexto ENTERO por el resumen, y por eso las
         * instrucciones van en el prompt de sistema —aquí `instruction`, en un hijo su
         * capability—, que no se compacta.
         */
        contextCompaction({
          definition: { ...definicion, modelClient: conResumenSeguro(definicion.modelClient as never, (t) => anotarPaso("trueforge.compactacion", t)()) } as never,
          compactionThresholdTokens: UMBRAL_RESUMEN_TOKENS,
        }),
        // `ask_user_question`, SOLO en el raíz —la librería tampoco se la da a un hijo—: es el
        // único que tiene a una persona delante.
        askUserQuestion(),
        // `create_sub_agent`: la delegación de TrueForge, un nivel y cinco a la vez como mucho.
        dynamicSubAgents({ sandboxAvailable: false, tracing: NOOP_AGENT_TRACING }),
      ] as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
      ...(foto === undefined
        ? {}
        : {
            context: foto.context as never,
            ...(foto.current_context_usage === undefined ? {} : { currentContextUsage: foto.current_context_usage as never }),
            ...(foto.capability_state == null ? {} : { capabilityState: foto.capability_state as never }),
          }),
    });
    raizActual = raizDelArbol;
    return new AgentThreadOrchestrator({
      agentThreads: new Map([[HILO_RAIZ, raizDelArbol]]),
      createDynamicSubAgentThread: async (params) =>
        crearHijo(params as unknown as { request: { name: string; input: string }; threadId: string; parent: unknown }),
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
  };
  /**
   * Solo se persiste con un id de sesión DADO: es lo que tiene índice donde reanudar. La consola
   * de terminal no lo pasa, la misma regla que el checkpoint de deepagents.
   */
  const persistir = opciones.hilo !== undefined;
  /** El aviso de una memoria que existía y no se entendió: sale en el PRIMER turno y se gasta. */
  let avisoDeMemoria: string | undefined;
  /**
   * La foto de la sesión `id`, si hay y se entiende. Una que no se entiende se APARTA —el guardado
   * de este mismo turno la pisaría— y se DICE en el turno siguiente (`memoriaTrueforge.ts`).
   */
  const fotoDeLaSesion = (id: string): FotoDeHilo | undefined => {
    avisoDeMemoria = undefined;
    if (!persistir) return undefined;
    const lectura = cargarMemoria(raiz, id);
    if (lectura.estado === "incompatible") avisoDeMemoria = textoDeMemoriaDescartada(lectura.motivo, apartarMemoria(raiz, id));
    return lectura.estado === "ok" ? lectura.foto : undefined;
  };
  const fotoInicial = fotoDeLaSesion(hilo);
  let orquestador = nuevoOrquestador(fotoInicial);
  // La pregunta que se quedó sin contestar al cerrar: la respuesta de la persona es para ELLA.
  preguntaEnEspera = preguntaDeLaFoto(fotoInicial);

  const avisar = (): void => {
    for (const o of oyentes) o();
  };

  /**
   * Lo que el orquestador dice al ejecutar, traducido; y lo que pidió aprobar al terminar.
   *
   * **Una aprobación se devuelve al hilo que la PIDIÓ.** Con subagentes que escriben, la
   * `write_file` la pide el hijo, y el orquestador de TrueForge reparte las decisiones por
   * `thread_id`: mandarla al raíz no la contestaría —o la rechazaría por hilo desconocido—.
   * Por eso las tool calls se apuntan por hilo Y por id: dos hijos pueden repetir id.
   */
  /**
   * Cuando vuelve quien EJECUTA, la medida de su última captura contra la maqueta, para quien lo llamó
   * (`medidaAutomatica.ts`). Sin carpeta de artefactos, sin maqueta o sin captura nueva, nada. Un fallo al abrir o
   * decodificar se anota y no tumba el turno.
   */
  function medidaTrasProbar(deHilo: string, hiloPadre: string, quien: Agente | undefined): string | undefined {
    if (carpeta === undefined || quien?.ejecucion !== true) return undefined;
    const maqueta = buscarMaqueta(raiz, opciones.adjuntos, carpeta);
    const captura = ultimaCaptura(carpeta, nacimientoDeHilo.get(deHilo) ?? Date.now());
    if (maqueta === undefined || captura === undefined) return undefined;
    try {
      const comparacion = medirContraMaqueta(join(carpeta, captura), maqueta.disco);
      ultimaMedidaDeHilo.set(hiloPadre, resumenDeMedida(comparacion, captura));
      const ronda = (rondasVisualesDeHilo.get(hiloPadre) ?? 0) + 1;
      rondasVisualesDeHilo.set(hiloPadre, ronda);
      const escribio = ultimaEscrituraDeHilo.get(hiloPadre);
      const critico = ultimaCriticaDeHilo.get(hiloPadre);
      return textoDeMedidaAutomatica({
        quien: quien.nombre,
        captura,
        maqueta: maqueta.virtual,
        comparacion,
        pedirCritica: critico === undefined || (escribio !== undefined && escribio > critico),
        ronda,
      });
    } catch (e) {
      anotarPaso("trueforge.medida", `no se pudo medir ${captura}: ${e instanceof Error ? e.message : String(e)}`)();
      return undefined;
    }
  }

  async function* paso(lote: unknown[], senal: AbortSignal, pendientes: Pendiente[], preguntas: Pendiente[] = []): AsyncGenerator<DomainEvent> {
    for await (const _ of orquestador.send(lote as never)) void _;
    const llamadas = new Map<string, { nombre: string; args: Record<string, unknown> }>();
    // El razonamiento de los especialistas, juntado por hilo hasta que su mensaje se completa.
    const pensamientos: PensamientoPorHilo = new Map();
    const it = orquestador.execute({ signal: senal });
    let r = await it.next();
    while (!r.done) {
      const evento = r.value as { type?: string; thread_id?: string; output?: unknown; tool_call_id?: string; content?: unknown };
      const deHilo = evento.thread_id ?? HILO_RAIZ;
      if (evento.type === "internal.agent.context.append" && Array.isArray(evento.output)) {
        for (const m of evento.output) {
          for (const t of (m as { tool_calls?: { id: string; function: { name: string; arguments: string } }[] }).tool_calls ?? []) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(t.function.arguments) as Record<string, unknown>;
            } catch {
              args = {};
            }
            llamadas.set(claveDe(deHilo, t.id), { nombre: t.function.name, args });
            if (t.function.name === "write_file" || t.function.name === "edit_file") escriturasEnVuelo.set(claveDe(deHilo, t.id), { nombre: t.function.name, args });
            if (t.function.name === "xone_critica_visual") ultimaCriticaDeHilo.set(deHilo, Date.now());
            // La traza: la MISMA lista blanca que el evento (`detalleDe`, `parametrosDe`), nunca
            // los argumentos crudos.
            const quien = quienEs.get(deHilo) ?? deHilo;
            diagnostico?.herramienta(
              t.function.name,
              detalleDe(t.function.name, args),
              parametrosDe(t.function.name, args),
              tracker,
              deHilo === HILO_RAIZ ? "orquestador" : "especialista",
              undefined,
              quien
            );
            // Una CAPTURA más de quien ejecuta: es lo que dispara el aviso de capturas (`textoDeCapturas`).
            if (t.function.name === "execute" && typeof args["command"] === "string" && COMANDO_DE_CAPTURA.test(args["command"])) {
              capturasDeCadaHilo.set(deHilo, (capturasDeCadaHilo.get(deHilo) ?? 0) + 1);
            }
            // Qué le pide el orquestador a quién: el encargo, acotado (ver `DiagnosticoDeTools.delegacion`).
            if (t.function.name === "create_sub_agent" && typeof args["name"] === "string" && typeof args["input"] === "string") {
              diagnostico?.delegacion?.(quien, args["name"], args["input"]);
              esperas.anunciar(args["name"]);
            }
          }
        }
      }
      if (evento.type === "tool.response" && evento.tool_call_id !== undefined) {
        // Cuánto METIÓ en el contexto lo que devolvió: los caracteres, nunca el contenido.
        const llamada = llamadas.get(claveDe(deHilo, evento.tool_call_id));
        const chars = typeof evento.content === "string" ? evento.content.length : 0;
        diagnostico?.resultado?.(llamada?.nombre, llamada === undefined ? undefined : detalleDe(llamada.nombre, llamada.args), chars);
        // Lo que ESCRIBIÓ este hilo, para decírselo a quien lo llamó al terminar (`informesDeHijos.ts`).
        const escritura = escriturasEnVuelo.get(claveDe(deHilo, evento.tool_call_id));
        if (escritura !== undefined) {
          escriturasEnVuelo.delete(claveDe(deHilo, evento.tool_call_id));
          if (deHilo !== HILO_RAIZ && escrituraConExito(evento.content)) {
            const cambios = escritosDeCadaHilo.get(deHilo) ?? new Map<string, CambioDeFichero>();
            anotarEscritura(cambios, escritura.nombre, escritura.args);
            escritosDeCadaHilo.set(deHilo, cambios);
            ultimaEscrituraDeHilo.set(deHilo, Date.now());
          }
        }
      }
      // Un hilo que agotó su tope se ANOTA en la traza, con quién era: el raíz y cualquier hijo.
      if (evento.type === "internal.agent.done") {
        esperas.murio(deHilo);
        const hiloPadre = padreDeHilo.get(deHilo);
        // Lo que devolvió a quien lo llamó, a la traza (`DiagnosticoDeTools.devolucion`): la otra mitad del encargo.
        const devuelto = (evento as { send_to_parent?: { content?: unknown } }).send_to_parent?.content;
        if (hiloPadre !== undefined && devuelto !== undefined) {
          const texto = typeof devuelto === "string" ? devuelto : JSON.stringify(devuelto);
          diagnostico?.devolucion?.(quienEs.get(deHilo) ?? deHilo, quienEs.get(hiloPadre) ?? (hiloPadre === HILO_RAIZ ? "orquestador" : hiloPadre), texto);
        }
        if (hiloPadre !== undefined) {
          padreDeHilo.delete(deHilo);
          const nombre = especialistaDeHilo.get(deHilo);
          const quien = especialistas().find((a) => a.nombre === nombre);
          const medida = medidaTrasProbar(deHilo, hiloPadre, quien);
          const texto =
            medida ??
            textoDelInforme(quienEs.get(deHilo) ?? deHilo, escritosDeCadaHilo.get(deHilo) ?? new Map(), quien !== undefined && quien.motor === "modelo" && clasesDeTools(quien) === "escribe", ultimaMedidaDeHilo.get(deHilo));
          escritosDeCadaHilo.delete(deHilo);
          nacimientoDeHilo.delete(deHilo);
          if (texto !== undefined) informesPendientes.set(hiloPadre, [...(informesPendientes.get(hiloPadre) ?? []), texto]);
        }
        const h = hijosConMemoria.get(deHilo);
        if (h !== undefined) {
          hijosConMemoria.delete(deHilo);
          const foto = h.hilo.toSnapshot() as unknown as { context: unknown[]; current_context_usage?: { prompt_tokens?: number; completion_tokens?: number } };
          const tokens = (foto.current_context_usage?.prompt_tokens ?? 0) + (foto.current_context_usage?.completion_tokens ?? 0);
          const destino = memoriaDeEspecialistas.cerrar(deHilo, { // Un hijo CORTADO por «Detener» lleva en su historial la orden de parar: heredarla lo pararía
          // sin que nadie se lo haya pedido, así que no deja memoria (como uno que falló).
          bien: (evento as { status?: string }).status !== "error" && !detencion.soloTexto(deHilo), mensajes: [...h.iniciales, ...foto.context], tokens });
          diagnostico?.memoria?.(h.nombre, "cierra", destino, tokens);
        }
      }
      const tope = topeAgotadoDe(evento);
      if (tope !== undefined) diagnostico?.corte?.(quienEs.get(deHilo) ?? deHilo, tope);
      const { eventos, uso } = traducirEvento(evento, (h) => especialistaDeHilo.get(h), pensamientos);
      // La «llamada» de un hijo externo es el producto entero: su consumo llega por su propio
      // callback (`externo`), y contarla aquí sumaría una llamada de modelo a ceros por delegación.
      if (uso !== undefined && !hilosExternos.has(deHilo)) {
        // Los tokens de TODOS los hilos se gastaron, así que todos cuentan. La VENTANA es otra
        // pregunta —cuánto ocupa la conversación—, y esa es la del raíz: la de un hijo es la de
        // un encargo que muere con él.
        tracker.input += uso.input;
        tracker.output += uso.output;
        tracker.cache += uso.cache;
        tracker.calls += 1;
        apuntarModelo(deHilo === HILO_RAIZ ? idDelPapel("trabajo") : (modeloDeHilo.get(deHilo) ?? idDelPapel("trabajo")), "modelo", {
          entrada: uso.input,
          salida: uso.output,
          cache: uso.cache,
        });
        // Y solo de una llamada NORMAL: la de la compactación mide lo de ANTES de resumir.
        if (deHilo === HILO_RAIZ && evento.type === "internal.agent.context.append") tracker.contexto = uso.input;
        // Por ORIGEN, como deepagents: el orquestador y cada especialista por su nombre.
        const razonado = uso.razonamiento ?? razonamientoDeSalida(uso.output);
        diagnostico?.modelo(quienEs.get(deHilo) ?? deHilo, {
          input: uso.input,
          output: uso.output,
          cache: uso.cache,
          llamadas: tracker.calls,
          contexto: uso.input,
          ...(razonado === undefined ? {} : { razonamiento: razonado }),
        });
        avisar();
      }
      yield* eventos;
      while (artefactosPorAnunciar.length > 0) yield { tipo: "artefacto", artefacto: artefactosPorAnunciar.shift()! };
      r = await it.next();
    }
    const resultado = r.value as { required_actions?: { type?: string; thread_id?: string; tool_calls?: { id: string }[] }[] };
    for (const accion of resultado.required_actions ?? []) {
      // Dos interrupciones distintas, y no se mezclan: una APROBACIÓN decide sobre una escritura
      // con su diff; una RESPUESTA es lo que pide `ask_user_question`, que no escribe nada.
      const destino = accion.type === "tool.approval_required" ? pendientes : accion.type === "tool.response_required" ? preguntas : undefined;
      if (destino === undefined) continue;
      const deHilo = accion.thread_id ?? HILO_RAIZ;
      for (const { id } of accion.tool_calls ?? []) {
        const clave = claveDe(deHilo, id);
        const llamada = llamadas.get(clave);
        if (llamada !== undefined) destino.push({ clave, hilo: deHilo, id, ...llamada });
      }
    }
  }

  return {
    get tracker() {
      return tracker;
    },
    get hilo() {
      return hilo;
    },
    async turno(peticion: string, piel: Piel) {
      if (cerrada) throw new Error("la sesión está cerrada");
      const t0 = Date.now();
      cancelado = false;
      detencion.reiniciar();
      const instantanea = await tomarInstantanea(raiz, opciones.entorno.git);
      const tope = opciones.topeDeRondas ?? MAX_APPROVAL_ROUNDS;
      const aplicadasSinPreguntar: string[] = [];
      apuntarAplicadasSinPreguntar = (rutas) => void aplicadasSinPreguntar.push(...rutas);
      // Lo que llevaba el tracker al empezar: el contraste con el motor es del TURNO.
      const trackerAlEmpezar = { input: tracker.input, output: tracker.output, cache: tracker.cache, calls: tracker.calls };
      externosDelTurno = 0;
      capturasDelTurno = [];
      /** El encargo de ESTE turno tal cual se pidió, y el mismo con la última pregunta y su
       *  respuesta al lado, que es lo que se juzga y se repara (ver `flujo`). Ausente = no consta. */
      let encargoDelTurno: string | undefined;
      let objetivoDelTurno: string | undefined;
      // Se dice UNA vez: el turno que lo lleva es el primero que corre sin la conversación de antes.
      const memoriaDescartada = avisoDeMemoria;
      avisoDeMemoria = undefined;
      let cortadoPorTope = false;
      let preguntasSolas = 0;
      let sinResolver = 0;
      // El veredicto del turno, con las MISMAS reglas que deepagents (`verificacion.ts`).
      let veredicto: "verde" | "rojo" | "no-corrio" = "no-corrio";
      let hallazgosDelTurno: HallazgoDelTurno[] = [];
      let preexistentesDelTurno: number | undefined;
      let motivoSinVerificar: string | undefined;
      let escribioProyecto = false;

      /**
       * Las RONDAS de una petición: una pausa termina la ronda y se reanuda con las decisiones.
       * Devuelve si acabó LIMPIA —sin escrituras en la mesa—, que es lo único que se verifica:
       * con algo sin resolver el turno no ha terminado su trabajo, y mirar a medias daría un
       * veredicto sobre algo que no es lo que quedó.
       */
      async function* rondasDe(loteInicial: unknown[], salida: { limpia: boolean }): AsyncGenerator<DomainEvent> {
        let lote = loteInicial;
        let rondas = 0;
        while (true) {
          if (cancelado || cerrada) return;
          aborto = new AbortController();
          const senal = aborto.signal;
          const pendientes: Pendiente[] = [];
          const preguntas: Pendiente[] = [];
          yield* paso(lote, senal, pendientes, preguntas);
          if (pendientes.length === 0) {
            /**
             * **En modo autónomo no se le pregunta a nadie**, y se dice en el chat. Una pregunta con una opción
             * `(Recommended)` se contesta con ella; una sin recomendada vuelve al agente pidiéndole que decida él y diga
             * qué eligió. Era «todas o ninguna»: medido en MyAllXOne, el orquestador hizo DOS a la vez —una con
             * recomendada, la otra no— y no se contestó ninguna, se enseñó solo la primera y la segunda se perdió. Con
             * tope, para que no dé vueltas.
             */
            if (preguntas.length > 0 && opciones.sinAprobacion?.() === true && preguntasSolas + preguntas.length <= TOPE_DE_PREGUNTAS_CONTESTADAS_SOLAS) {
              preguntasSolas += preguntas.length;
              const respuestas: unknown[] = [];
              for (const q of preguntas) {
                const { pregunta, opciones: posibles } = consultaDe(q.args);
                const elegida = opcionRecomendada(posibles);
                yield {
                  tipo: "aviso",
                  texto:
                    elegida !== undefined
                      ? `modo autónomo: a «${pregunta}» contesto la recomendada: ${elegida}`
                      : `modo autónomo: «${pregunta}» no se pregunta; lo decide el agente y lo dirá`,
                  severidad: "aviso",
                };
                respuestas.push({
                  type: "user.tool_response",
                  thread_id: q.hilo,
                  tool_call_id: q.id,
                  content: elegida ?? RESPUESTA_AUTONOMA_SIN_RECOMENDADA,
                });
              }
              lote = respuestas;
              continue;
            }
            // El orquestador PREGUNTA: el turno acaba aquí con la pregunta a la vista, y lo que la
            // persona escriba después vuelve como la respuesta de esa tool (`turno`, arriba).
            const pregunta = preguntas[0];
            if (pregunta !== undefined) {
              // El encargo CRUDO, no el objetivo con su nota: si no, cada pregunta encadenada
              // arrastraría las notas de las anteriores y el objetivo crecería turno a turno.
              preguntaEnEspera = { ...pregunta, ...(encargoDelTurno === undefined ? {} : { encargo: encargoDelTurno }) };
              yield { tipo: "token", texto: textoDePregunta(pregunta.args) };
              // Y la misma pregunta como DATO, para la piel que pinta un botón por opción.
              const consulta = consultaDe(pregunta.args);
              if (consulta.opciones.length > 0) yield { tipo: "consulta", ...consulta };
            }
            salida.limpia = true;
            return;
          }

          const leer = (ruta: string): string => {
            try {
              return readFileSync(join(raiz, ruta), "utf8");
            } catch {
              return "";
            }
          };
          // Todo va por la CLAVE (hilo + id): es lo que viaja a la tarjeta y lo que vuelve.
          const decisiones = new Map<string, Decision>();
          const humanos: PendienteDeAprobacion[] = [];
          const ficheros = new Map<string, string>();
          const diffs = new Map<string, LineaDeDiff[]>();
          const autonomo = opciones.sinAprobacion?.() === true;
          for (const p of pendientes) {
            // Una tool de un CONECTOR que escribe (generar en Stitch…) va SIEMPRE a una persona, también
            // en modo autónomo: el modo gobierna las escrituras LOCALES, como con `/sync subir`. Sin
            // fichero: la tarjeta enseña el conector, la tool y sus argumentos enteros.
            const remota = deConectores?.remotaDe(p.nombre);
            if (remota !== undefined) {
              const tarjeta = tarjetaDeRemota(remota, p.args);
              humanos.push({
                id: p.clave,
                origen: quienEs.get(p.hilo) ?? p.hilo,
                descripcion: tarjeta.descripcion,
                decisionesPermitidas: ["approve", "reject"],
                remota: true,
              });
              diffs.set(p.clave, tarjeta.lineas);
              continue;
            }
            const ruta = typeof p.args.file_path === "string" ? p.args.file_path : "";
            // Lo que NO es el proyecto —artefactos y planes— y lo que el backend va a rechazar de
            // todas formas no se pregunta: la MISMA función que el HITL de deepagents.
            if (!seDetieneEn({ toolCall: { args: p.args } })) {
              decisiones.set(p.clave, { type: "approve" });
            } else if (autonomo) {
              decisiones.set(p.clave, { type: "approve" });
              aplicadasSinPreguntar.push(ruta);
            } else {
              humanos.push({
                id: p.clave,
                origen: quienEs.get(p.hilo) ?? p.hilo,
                descripcion: `quiere ${TEXTO_HITL[p.nombre] ?? p.nombre}`,
                decisionesPermitidas: ["approve", "reject"],
              });
              ficheros.set(p.clave, ruta);
              const vista = cambioDe({ id: p.clave, tool: p.nombre, args: p.args, description: "", allowedDecisions: [] }, leer);
              if (vista !== undefined) diffs.set(p.clave, vista.lineas);
            }
          }

          if (humanos.length > 0) {
            rondas += 1;
            yield { tipo: "pausa", pendientes: humanos };
            if (opciones.pedirAprobacion === undefined || rondas > tope) {
              // Nadie a quien preguntar, o se agotó el tope: lo que no se decide NO se aplica.
              cortadoPorTope = rondas > tope;
              sinResolver = humanos.length;
              return;
            }
            const respuesta = await opciones.pedirAprobacion(humanos, ficheros, diffs);
            if (cancelado || cerrada) {
              // Cancelado mientras se decidía: no se aplica nada de lo que estaba en la mesa.
              sinResolver = humanos.length;
              return;
            }
            for (const h of humanos) decisiones.set(h.id, respuesta.get(h.id) ?? { type: "reject" });
          }
          lote = pendientes.map((p) => ({ p, d: decisiones.get(p.clave) ?? ({ type: "reject" } as Decision) })).map(({ p, d }) => ({
            type: "user.tool_approval",
            thread_id: p.hilo,
            tool_call_id: p.id,
            approval: d.type === "approve" ? { status: "allow" } : { status: "deny", reason: d.message ?? "rechazado por el usuario" },
          }));
        }
      }

      /**
       * **El verificador, cosido al FINAL del flujo y no después del turno** —la regla de
       * deepagents—: `correrTurno` cierra en cuanto el flujo se agota, así que verificar después
       * pintaría el veredicto fuera del turno. Un rojo se REPARA en el mismo hilo, como mensaje
       * de USUARIO con el objetivo delante (`textoDeReparacion`), hasta `TOPE_REPARACIONES`, y
       * corta antes si un intento deja la MISMA huella de errores.
       */
      async function* flujo(): AsyncGenerator<DomainEvent> {
        // Si el orquestador dejó una pregunta, ESTE mensaje es su respuesta: vuelve a su hilo como
        // `user.tool_response`, y no como un mensaje nuevo que la dejaría sin contestar.
        const enEspera = preguntaEnEspera;
        preguntaEnEspera = undefined;
        // El ENCARGO del turno: lo que se repara y lo que se juzga. En un turno que contesta una
        // pregunta no es lo tecleado —un «2» no es un objetivo—, sino el encargo que la provocó.
        //
        // Y con lo que se preguntó y se contestó al lado. Medido en el navegador: con el encargo
        // a secas, el juez leía solo la respuesta de ESTE turno y concluía que la pregunta que
        // se pidió no se había hecho — se hizo, en el turno anterior, y él no lo veía.
        // Solo la ÚLTIMA pregunta va en la nota: las de antes están en la conversación, y el
        // encargo de una pregunta encadenada es el CRUDO (`rondasDe`), así que no se acumulan.
        encargoDelTurno = enEspera === undefined ? peticion : enEspera.encargo;
        objetivoDelTurno =
          enEspera === undefined || encargoDelTurno === undefined
            ? encargoDelTurno
            : `${encargoDelTurno}\n\n[En un turno anterior el agente preguntó «${consultaDe(enEspera.args).pregunta}» y la persona contestó «${respuestaAPregunta(enEspera.args, peticion)}».]`;
        // Los hechos baratos del proyecto van DELANTE (`core/hechosDelProyecto.ts`), la misma
        // foto y el MISMO cargador que `xone_navegacion`, rehecha en cada turno —la regla de
        // deepagents: en el prompt de sistema envejecería dentro de la sesión—. Solo en la
        // petición ORIGINAL: la respuesta a una pregunta no es un encargo nuevo, y el mensaje de
        // una reparación ya lleva sus hallazgos. Un índice que no carga deja la petición sola.
        const loteInicial: unknown[] =
          enEspera === undefined
            ? [
                {
                  type: EventType.USER_MESSAGE,
                  content: conHechosDelProyecto(peticion, await hechosDelProyectoDe(cargarIndice, ficherosDelProyecto(raiz))),
                },
              ]
            : [{ type: "user.tool_response", thread_id: enEspera.hilo, tool_call_id: enEspera.id, content: respuestaAPregunta(enEspera.args, peticion) }];
        yield* pasadas(loteInicial);
        yield* juzgar();
      }

      /** Lo que el turno CONTESTÓ en su última pasada: es lo que lee el juez. */
      let respuestaDeLaPasada = "";

      /**
       * Las PASADAS del turno: la de la petición y las de reparación. Cada `return` de aquí es un
       * final del turno —verde, sin escribir, sin verificador, bloqueado…— y el juez va DETRÁS de
       * todos (`flujo`); la única salida que no cierra es la que sigue a otra pasada.
       */
      async function* pasadas(loteInicial: unknown[]): AsyncGenerator<DomainEvent> {
        let lote = loteInicial;
        let intento = 0;
        let huellaPrevia: string | undefined;
        let visualYaDisparo = false;
        while (true) {
          if (intento > 0) yield { tipo: "reparacion", intento, tope: TOPE_REPARACIONES };
          const salida = { limpia: false };
          respuestaDeLaPasada = "";
          for await (const evento of rondasDe(lote, salida)) {
            if (evento.tipo === "token") respuestaDeLaPasada += evento.texto;
            yield evento;
          }
          const cambios = cambiosQueSeVerifican(await instantanea.cambios());
          escribioProyecto = cambios.length > 0;
          if (!salida.limpia) {
            if (sinResolver > 0) motivoSinVerificar = "quedaron escrituras sin resolver";
            return;
          }
          veredicto = "no-corrio";
          if (!escribioProyecto) {
            motivoSinVerificar = "el turno no escribió ningún fichero del proyecto";
            return;
          }
          if (opciones.verifier === undefined) {
            motivoSinVerificar = "esta ejecución no tiene verificador";
            return;
          }
          yield { tipo: "fase", fase: "verificando" };
          let informe;
          try {
            informe = await opciones.verifier.verificar(raiz);
          } catch (e) {
            // Que no esté el binario NO es un fallo del proyecto, y se dice como tal.
            motivoSinVerificar = e instanceof Error ? e.message : String(e);
            yield { tipo: "aviso", texto: `⚠ no se pudo verificar: ${motivoSinVerificar}`, severidad: "aviso" };
            return;
          }
          motivoSinVerificar = undefined;
          const { hallazgos, preexistentes, errores } = repartirHallazgos(raiz, informe, cambios.map((c) => c.ruta));
          veredicto = errores === 0 ? "verde" : "rojo";
          hallazgosDelTurno = hallazgos;
          preexistentesDelTurno = preexistentes;
          yield {
            tipo: "verificacion",
            verde: errores === 0,
            errores,
            avisos: hallazgos.length - errores,
            hallazgos,
            ...(preexistentes > 0 ? { preexistentes } : {}),
          };

          /**
           * **El crítico de pantalla**, con las reglas de deepagents (`turnoReal.ts`, junto a
           * `tocaCriticarPantalla`): mira la ÚLTIMA captura que dejó este turno, una vez por
           * turno. Con el simulador en VERDE solo REPORTA —medido allí: una ronda disparada por
           * defectos de otra pantalla se iba a rediseñar lo que nadie pidió—; en ROJO sus
           * observaciones se suman a la reparación que iba a salir igualmente. Que no se pueda
           * preguntar es un aviso, no un rojo.
           */
          let observacionesVisuales: string[] = [];
          if (
            carpeta !== undefined &&
            tocaCriticarPantalla({ hayCritico: opciones.criticaVisual !== undefined, capturas: capturasDelTurno.length, yaDisparo: visualYaDisparo, intento })
          ) {
            visualYaDisparo = true;
            const captura = capturasDelTurno[capturasDelTurno.length - 1]!;
            try {
              const bytes = readFileSync(join(carpeta, captura.nombre));
              const visual = await opciones.criticaVisual!({ base64: bytes.toString("base64"), mime: captura.mime ?? "image/png" }, captura.nombre);
              if (visual.veredicto === "rojo" && visual.observaciones.length > 0) {
                observacionesVisuales = visual.observaciones;
                yield {
                  tipo: "aviso",
                  texto: `⚠ la captura de esta sesión enseña ${visual.observaciones.length} defecto(s) de pantalla`,
                  severidad: "aviso",
                };
              }
            } catch (error) {
              yield { tipo: "aviso", texto: `⚠ no se pudo criticar la pantalla: ${error instanceof Error ? error.name : "error"}`, severidad: "aviso" };
            }
          }

          if (errores === 0) return;
          const huella = huellaDeErrores(hallazgos);
          if (huella === huellaPrevia) {
            yield {
              tipo: "bloqueado",
              motivo: "no-progreso",
              explicacion: `el intento ${intento} dejó los mismos ${errores} error(es) en los mismos sitios`,
            };
            return;
          }
          if (intento >= TOPE_REPARACIONES) {
            yield {
              tipo: "bloqueado",
              motivo: "tope-reparaciones",
              explicacion: `tras ${intento} intento(s) siguen ${errores} error(es); se deja como está para que lo mires`,
            };
            return;
          }
          huellaPrevia = huella;
          intento += 1;
          lote = [{ type: EventType.USER_MESSAGE, content: textoDeReparacion(hallazgos, observacionesVisuales, objetivoDelTurno ?? peticion) }];
        }
      }

      /**
       * **¿Hizo lo que se le pidió?** El juez del turno, con el reparto de deepagents: los HECHOS
       * los mide el código y al modelo solo se le pregunta el juicio (`core/juezDelTurno.ts`). Va
       * DETRÁS de todas las pasadas, así que alcanza cada final del turno —«no escribió nada» es
       * el candidato número uno a no haber cumplido—. Tres casos en que NO se pregunta, y los tres
       * serían ruido: un turno CANCELADO (alguien pulsó Parar; juzgarlo es gastar una llamada
       * contra su decisión), uno que acaba PREGUNTANDO (su «respuesta» es la pregunta, y saldría
       * dudoso siempre), y la respuesta a una pregunta cuyo encargo no consta —una sesión
       * reabierta: el encargo vive en memoria del proceso, no en la foto—. Un juez que falla es
       * un aviso: es una opinión sobre trabajo ya hecho.
       */
      async function* juzgar(): AsyncGenerator<DomainEvent> {
        if (opciones.juezDelTurno === undefined || cancelado || cerrada) return;
        if (preguntaEnEspera !== undefined || objetivoDelTurno === undefined) return;
        try {
          const v = await opciones.juezDelTurno({
            objetivo: objetivoDelTurno,
            respuesta: respuestaDeLaPasada,
            hechos: {
              // Ausente es «no corrió», que no es lo mismo que «salió mal»: el prompt lo dice.
              ...(veredicto === "verde" || veredicto === "rojo" ? { verificador: veredicto } : {}),
              ...(cortadoPorTope ? { escriturasSinResolver: true } : {}),
            },
          });
          const accion = accionDelJuez(v, { hayHumano: false });
          if (accion.tipo !== "nada") yield { tipo: "aviso", texto: `⚠ ${accion.texto}`, severidad: "aviso" };
        } catch (error) {
          yield { tipo: "aviso", texto: `⚠ no se pudo consultar al juez del turno: ${error instanceof Error ? error.name : "error"}`, severidad: "aviso" };
        }
      }

      let bitacora;
      try {
        // El flujo del turno MÁS lo que un hijo externo va haciendo en su proceso: sin esto, sus
        // minutos de trabajo no cruzan hasta que contesta (`core/entrelazar.ts`).
        bitacora = await correrTurno(entrelazar(flujo(), eventosExternos), piel, {
          // Solo si el turno ESCRIBIÓ y aun así no se verificó, y con el motivo: la regla de
          // deepagents — un aviso que salta cuando no ha pasado nada enseña a ignorarlo.
          avisos: (b) => [
            ...(memoriaDescartada === undefined ? [] : [memoriaDescartada]),
            ...(sinLeerDelTurno() === undefined
              ? []
              : cancelado
                ? // PARAR es «para»: lo escrito que nadie leyó no arranca otro turno —medido, lo
                  // hacía—, pero tampoco se pierde en silencio: se dice, con su texto, para copiarlo.
                  [`⏹ turno parado: no se manda lo que escribiste mientras trabajaba — «${sinLeerDelTurno()}»`]
                : [`⚠ una nota no se pudo entregar a tiempo: se manda como el turno siguiente`]),
            ...(b.corrio("verify") || !escribioProyecto
              ? []
              : [`⚠ el verificador no ha corrido en este turno${motivoSinVerificar === undefined ? "" : ` (${motivoSinVerificar})`}`]),
            ...(aplicadasSinPreguntar.length === 0
              ? []
              : [`⚠ ${aplicadasSinPreguntar.length} escritura(s) aplicadas SIN aprobación: ${aplicadasSinPreguntar.join(", ")} — esta sesión va en modo autónomo`]),
          ],
          desde: t0,
        });
      } finally {
        aborto = undefined;
        /**
         * **El contraste con las métricas del motor**, ANTES de rehacer el raíz: el árbol que se
         * mide es el de este turno, y rehecho ya no lo sería (`metricasTrueforge.ts`). Solo con la
         * traza puesta, y sin poder tumbar nada: es diagnóstico.
         */
        if (diagnostico?.contraste !== undefined) {
          try {
            const motor = metricasDeTrueforge(orquestador.getMetrics() as unknown as Record<string, unknown>);
            const nuestras = {
              entrada: tracker.input - trackerAlEmpezar.input,
              salida: tracker.output - trackerAlEmpezar.output,
              cache: tracker.cache - trackerAlEmpezar.cache,
              llamadas: tracker.calls - trackerAlEmpezar.calls,
            };
            diagnostico.contraste({
              nuestras,
              motor: { ...motor },
              externos: externosDelTurno,
              diferencias: diferenciasDelContraste(nuestras, motor, externosDelTurno),
            });
          } catch {
            // Una métrica que no se pudo leer no es un turno que falló.
          }
        }
        // Lo que un hijo escribiera fuera de un turno no tiene dónde contarse (ver arriba).
        apuntarAplicadasSinPreguntar = undefined;
        /**
         * La foto del raíz, al acabar CADA turno —en el `finally`, como el commit del turno—:
         * saneada, para que las tool calls que el corte dejó sin respuesta no rompan la
         * siguiente llamada. Se guarda si hay sesión que reanudar, y si el turno no acabó limpio
         * se rehace el árbol desde ella. Guardar no puede tumbar un turno ya terminado.
         */
        if (raizActual !== undefined) {
          const foto = fotoSaneada({
            ...(raizActual.toSnapshot() as unknown as FotoDeHilo),
            ...(preguntaEnEspera === undefined
              ? {}
              : {
                  pregunta_pendiente: {
                    hilo: preguntaEnEspera.hilo,
                    id: preguntaEnEspera.id,
                    args: preguntaEnEspera.args,
                    ...(preguntaEnEspera.encargo === undefined ? {} : { encargo: preguntaEnEspera.encargo }),
                  },
                }),
          });
          if (persistir) {
            try {
              guardarMemoria(raiz, hilo, foto);
            } catch {
              // Sin memoria en disco la sesión sigue viva; al reabrirla, `hayMemoria` dirá la verdad.
            }
          }
          /**
           * **El raíz se rehace desde su foto al final de CADA turno**, y no solo tras uno cortado.
           * El contador de llamadas de TrueForge (`metrics.iterations`) vive con el HILO y no se
           * reinicia entre ejecuciones: con el raíz vivo toda la conversación, su tope se agotaba
           * sumando TODOS los turnos y una sesión larga dejaba de contestar aunque cada turno fuera
           * corto. Rehacerlo reinicia el contador y conserva el contexto: el tope pasa a ser por
           * turno, que es lo que promete.
           */
          orquestador = nuevoOrquestador(foto);
        }
      }
      const cambios: Cambio[] = await instantanea.cambios();
      // Calculado y VACIADO aquí, DESPUÉS del único `await` que queda entre el `finally` y el
      // `return`: hacerlo antes (como sugería el borrador) deja una ventana en la que una nota
      // empujada durante ese `await` cae en una cola ya vacía y sobrevive muda al turno
      // siguiente — justo lo que este campo existe para impedir.
      const notasSobrantes = cancelado ? undefined : sinLeerDelTurno();
      detencion.reiniciar();
      notas.length = 0; // Se sirvieron o se reportan aquí: no siguen vivas para el próximo turno.
      return {
        bitacora,
        cambios,
        cortadoPorTope,
        verificador: veredicto,
        pendientes: sinResolver,
        ...(hallazgosDelTurno.length === 0 ? {} : { hallazgos: hallazgosDelTurno }),
        ...(preexistentesDelTurno === undefined ? {} : { preexistentes: preexistentesDelTurno }),
        ...(motivoSinVerificar === undefined ? {} : { motivoSinVerificar }),
        ...(notasSobrantes === undefined ? {} : { notasSobrantes }),
      };
    },
    async cambiarModelos(nuevos: ModelosPort) {
      // El ILLM pide el modelo en cada llamada, así que basta con cambiar a quién se lo pide:
      // el hilo sigue entero.
      modelos = nuevos;
      // Los clientes eran del modelo de antes: el siguiente se construye con el nuevo.
      clientes.clear();
    },
    nuevoHilo(id?: string) {
      hilo = id ?? `tf-${Date.now()}`;
      // Otra conversación: lo que los especialistas recordaban era de la anterior.
      memoriaDeEspecialistas.olvidar();
      esperas.olvidar();
      vueltasDeCadaHilo.clear();
      capturasDeCadaHilo.clear();
      escritosDeCadaHilo.clear();
      escriturasEnVuelo.clear();
      nacimientoDeHilo.clear();
      ultimaEscrituraDeHilo.clear();
      ultimaCriticaDeHilo.clear();
      ultimaMedidaDeHilo.clear();
      rondasVisualesDeHilo.clear();
      padreDeHilo.clear();
      informesPendientes.clear();
      hijosConMemoria.clear();
      // Un hilo NUEVO: lo que hubiera guardado con ese id no se pisa ni se carga a medias. Y una
      // pregunta de la conversación de antes no la contesta el primer mensaje de la nueva.
      const foto = fotoDeLaSesion(hilo);
      orquestador = nuevoOrquestador(foto);
      preguntaEnEspera = preguntaDeLaFoto(foto);
      // Y las DOS cuentas vuelven a cero, como en deepagents: lo que gastó la conversación de antes
      // no es de ésta, y sin esto `/nuevo` arrastraba la cifra entera a una sesión vacía.
      tracker.input = 0;
      tracker.output = 0;
      tracker.cache = 0;
      tracker.calls = 0;
      tracker.contexto = 0;
      consumoExterno = SIN_CONSUMO;
      porModelo = {};
      avisar();
    },
    cancelar() {
      cancelado = true;
      aborto?.abort(new Error("turno cancelado por el usuario"));
    },
    /**
     * Empuja la nota a la cola de la sesión, sin más: no comprueba que haya un turno en marcha
     * —ese contrato lo sostiene quien llama (`web/servidor/vestibulo.ts`, Task 6)—, así que
     * llamarlo sin turno en curso no lanza, y la nota queda ahí para la próxima llamada al
     * modelo que la recoja `capacidadDeNotasDeLaSesion`.
     */
    agregarNota(texto: string) {
      notas.push(crearNota(texto));
    },
    /**
     * DETENER y replanificar (`detencion.ts`): los especialistas en marcha cierran con su resumen
     * en su siguiente llamada, y el raíz replanifica con ellos y con `texto`. Solo vale DENTRO de
     * un turno —el siguiente empieza de cero—, y por eso el servidor solo la manda con uno en vuelo;
     * si el turno cierra sin que nadie la lea, su texto sale como sobrante.
     */
    detener(texto: string) {
      detencion.detener(texto);
    },
    get llamadasTiradasPorDetener() {
      return llamadasTiradasPorDetener;
    },
    consumo(): ConsumoDeSesionPorCuenta {
      return {
        modelo: { entrada: tracker.input, salida: tracker.output, cache: tracker.cache },
        externo: consumoExterno,
        contexto: tracker.contexto,
        // Sin nada gastado no hay desglose: vacío no es «no consta», y un objeto vacío lo afirmaría.
        ...(Object.keys(porModelo).length === 0 ? {} : { porModelo: sumarPorModelo({}, porModelo) }),
      };
    },
    alCambiarConsumo(oyente: () => void) {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    cerrar() {
      cerrada = true;
      aborto?.abort(new Error("sesión cerrada"));
    },
  } as SesionReal & { agregarNota(texto: string): void; detener(texto: string): void; readonly llamadasTiradasPorDetener: number };
}
