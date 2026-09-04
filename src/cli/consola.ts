/**
 * El lazo de la consola interactiva y los comandos de barra.
 *
 * La regla que gobierna este fichero: una consola no llama a `input()` ni imprime por su
 * cuenta. `correrConsola` recibe de dónde leer (`consola.lineas`) y a dónde escribir
 * (`consola.escribir`) — en producción stdin y el `escribir` con flush; en los tests, una
 * lista de líneas y un acumulador. Sin esa costura la consola no se puede probar.
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cmdConfig } from "./config.js";
import { cmdDescribe } from "./describe.js";
import { cmdDoctor } from "./doctor.js";
import { cmdVerify } from "./verify.js";
import { AgenteGuionizado } from "../agent/guionizado.js";
import { correrTurno, type Piel } from "../core/turno.js";
import { PAPELES, POR_OMISION, ModeloMalEscrito, parsear, PROVEEDORES, type FuentesDeEleccion, type Proveedor } from "../core/modelos.js";
import type { Aviso } from "../core/config.js";
import type { Papel } from "../core/ports.js";
import { ES_DOBLE, esDoble } from "../core/ports.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import type { LineaDeDiff } from "../core/diff.js";
import { interpretAnswer, type Decision } from "../vendor/hitl.js";
import type { PoliticaDeAprobacion } from "../core/cloudstudio.js";
import { crearPielStdio, type Escribir } from "./stdio.js";
import { esTema, seleccionarTema, TEMAS, type IdTema } from "./tema.js";
import { acuseDeModelo } from "./acuseDeModelo.js";
import type { Preguntar } from "./aprobar.js";
import { guardarCredencial, AuthRotoEnDisco } from "../agent/authEnDisco.js";
import { URL_CLOUDSTUDIO_POR_OMISION } from "../agent/cloudstudioMcp.js";
import { cargar, NOMBRE_CARPETA } from "../agent/configEnDisco.js";
import { rutaMemoriaDeProyecto } from "../agent/memoriaDeProyecto.js";
import type { CatalogoModelosPort, ModeloDisponible } from "../core/ports.js";

export interface Consola {
  /** De dónde vienen las líneas del usuario. Agotarlo termina la sesión: es EOF, no cuelgue. */
  lineas: AsyncIterable<string>;
  escribir: Escribir;
  /** Para las aprobaciones dentro de un turno. */
  preguntar: Preguntar;
  interactivo: boolean;
  /**
   * ¿Se acabó la entrada? Acompaña a `preguntar`, y existe porque su cadena vacía
   * significa DOS cosas —el usuario pulsó Enter, o el readline se cerró— y con
   * `interactivo: true` la primera APRUEBA: sin distinguirlas, un Ctrl-D aprobaba una
   * escritura de fichero (`cli/aprobar.ts` lo cuenta entero). Ausente = no se sabe; la
   * TUI y la web no lo necesitan porque sus aprobaciones van por `aprobacionesTui`.
   */
  eof?: () => boolean;
  /**
   * Lee una clave SIN eco (para `provider`). El eco-off no se puede probar desde
   * aquí: es la costura de test, y la implementación de producción (raw-mode de
   * stdin) vive fuera — este fichero solo la usa.
   */
  leerSecreto: (pregunta: string) => Promise<string>;
  /** El catálogo vivo entra por puerto; los tests le dan su doble determinista. */
  catalogoModelos: CatalogoModelosPort;
  /** Escritura global inyectada: la consola elige, pero no conoce el disco. */
  guardarModeloGlobal: (papel: Papel, id: string) => { ruta: string; id: string };
  /**
   * Selector opcional de una piel rica. La consola conserva su flujo de preguntas y
   * número cuando no existe (stdio y tests que no montan la TUI).
   */
  seleccionar?: (selector: SelectorDeConsola) => Promise<string | undefined>;
  /**
   * La piel que los turnos usan para pintarse. La consola stdio no la define (se usa
   * `crearPielStdio`); la TUI la aporta — mismo contrato `Piel`, otro render.
   */
  piel?: () => Piel;
  /**
   * Las aprobaciones propias (modal TUI). Ausente = `pedirDecisiones` por readline.
   * Mismo contrato que el puerto `pedirAprobacion` de `abrirSesionReal`.
   */
  aprobacionesTui?: (
    pendientes: PendienteDeAprobacion[],
    ficheros: Map<string, string>,
    diffs: Map<string, LineaDeDiff[]>
  ) => Promise<Map<string, Decision>>;
  /** Cambia la paleta de la piel actual; la TUI además fuerza un repintado completo. */
  aplicarTema?: (tema: IdTema) => void;
  /** Persistencia inyectada: el tema es del proyecto, no de la cuenta. */
  guardarTemaDeProyecto?: (tema: IdTema) => { ruta: string; tema: string };
  /** Conexión OAuth + MCP, inyectada desde agent para que esta capa siga sin SDK MCP. */
  conectarCloudStudio?: (url: string, scopes: readonly string[], informar: (texto: string) => void) => Promise<{
    url: string;
    scopes: readonly string[];
    herramientas: Array<{ nombre: string; descripcion: string }>;
    proyectos: Array<{ id: string; nombre: string }>;
  }>;
  /** El endpoint es configuración de proyecto; los tokens OAuth no. */
  guardarCloudStudioDeProyecto?: (url: string, scopes: readonly string[]) => { ruta: string; url: string; scopes: string[] };
  /** El modo es configuración local del proyecto, inyectada desde el adaptador de disco. */
  guardarModoDeProyecto?: (modo: "offline" | "cloud") => { ruta: string; modo: "offline" | "cloud" };
  guardarProyectoCloudStudioDeProyecto?: (proyecto: { id: string; nombre: string }) => { ruta: string; proyecto: { id: string; nombre: string } };
  /**
   * Las ramas del proyecto remoto YA elegido, hermana de `conectarCloudStudio`: esta capa
   * tampoco conoce MCP para esto. Con una sola rama disponible el alta no pregunta.
   */
  ramasDeCloudStudio?: (proyecto: string) => Promise<string[]>;
  /** La rama ORIGEN es identidad del remoto, no una preferencia: va dentro de `cloudstudio`. */
  guardarRamaDeProyecto?: (rama: string) => { ruta: string; rama: string };
  /** El modelo propio del proyecto, por papel. Nunca lleva claves. */
  guardarModelosDeProyecto?: (papel: Papel, id: string) => { ruta: string; id: string };
  /**
   * Sincronización con CloudStudio, inyectada desde `agent/`: esta capa no conoce MCP ni
   * git. Su ausencia (modo guion, tests) es la que hace que `/sync` lo diga sin reventar.
   *
   * `politicaDeAprobacion` solo importa para «subir» (`core/cloudstudio.ts` documenta el
   * hueco): quien construye el adaptador real la reenvía a `agent/subida.ts#subir`, que
   * la exige. Esta capa no rellena el hueco por su cuenta — eso es cosa del comando
   * `/sync` (ver `politicaInteractiva` más abajo), que sí tiene `preguntar`/`escribir`.
   */
  sincronizar?: (
    accion: "estado" | "bajar" | "subir",
    raiz: string,
    politicaDeAprobacion?: PoliticaDeAprobacion,
    /**
     * Los avisos DETERMINISTAS de la sincronización, tal cual los emite `agent/`: «el
     * servidor truncó el listado», «el ZIP falló; bajando fichero a fichero», qué
     * ficheros no se pudieron bajar, cuántos no subieron, qué configuración de git se
     * conservó. En este repo los avisos son código y no prompt; sin este cable estaban
     * escritos y no llegaban a ninguna parte (el `informar` por omisión es `() => {}`).
     */
    informar?: (texto: string) => void
  ) => Promise<
    | { tipo: "texto"; texto: string }
    // `accion` viaja con el rechazo porque el porqué NO es el mismo en las dos
    // direcciones: subir exige un commit para que mover la ref signifique algo; bajar lo
    // exige porque SOBRESCRIBE el disco y sin commit no hay nada que recuperar.
    | { tipo: "arbol-sucio"; accion: "bajar" | "subir"; pendientes: string[] }
  >;
}

/**
 * Saludo local de la consola. No procede del modelo ni se incorpora al hilo: debe hacer
 * visible que xonecode está listo sin gastar tokens ni sesgar la primera petición.
 */
export const MENSAJE_BIENVENIDA =
  "¡Bienvenido a xonecode! Puedo analizar, explicar y modificar tu proyecto XOne. Escribe `/` para ver los comandos o cuéntame qué necesitas.\n";

/**
 * Hay estado que retomar solo cuando existe la memoria del PROYECTO. Una carpeta
 * `.xonecode` con `config.json` aislado no representa trabajo anterior y debe conservar
 * el saludo de primera visita.
 */
export function hayEstadoDeProyecto(raiz: string): boolean {
  return existsSync(rutaMemoriaDeProyecto(raiz));
}

/**
 * Petición interna de reanudación. Es deliberadamente de solo lectura y estrecha para
 * que abrir una sesión existente no se convierta en otra exploración exhaustiva.
 */
export const PETICION_REANUDAR_PROYECTO =
  "Reanuda el proyecto. Lee solo /MEMORIA_PROYECTO.md y resume brevemente el contexto, " +
  "los pendientes confirmados y el siguiente paso recomendado. No modifiques nada, no cargues skills " +
  "ni explores el código salvo que la memoria cite una ruta imprescindible para aclarar un pendiente; " +
  "en ese caso lee solo sus primeras 50 líneas. Termina preguntando si quieres continuar ese paso.";

export const MENSAJE_REANUDANDO = "Analizando el estado guardado del repositorio…\n";
// Movida a `agent/cloudstudioMcp.ts`: es la dirección de un servidor, no un detalle de
// esta piel, y `adoptarLegadoSiProcede` (Task 4 del plan de la consola web) la necesita
// desde `agent/`, que no puede importar de `cli/`. Se reexporta para no romper a quien
// la importaba de aquí.
export { URL_CLOUDSTUDIO_POR_OMISION };
const SCOPES_STUDIO_LECTURA = ["openid", "profile", "email", "offline_access", "mcp.read"] as const;
const SCOPES_STUDIO_AGENTE = [
  "openid", "profile", "email", "offline_access", "xonewebstudioapi",
  "mcp.read", "mcp.write", "mcp.execute", "mcp.branch",
] as const;

function modoStudio(valor: string | undefined): { nombre: "lectura" | "agente"; scopes: readonly string[] } | undefined {
  if (valor === "lectura") return { nombre: "lectura", scopes: SCOPES_STUDIO_LECTURA };
  if (valor === undefined || valor === "agente") return { nombre: "agente", scopes: SCOPES_STUDIO_AGENTE };
  return undefined;
}

/**
 * Primer contacto con una carpeta. En pipes no se crea estado ni se pregunta: el modo
 * offline histórico permanece exactamente igual. Cloud se persiste SOLO después de
 * autenticar y descubrir el MCP, de modo que un login cancelado deja la carpeta virgen.
 */
export async function configurarModoInicial(raiz: string, consola: Consola): Promise<void> {
  if (existsSync(join(raiz, NOMBRE_CARPETA)) || !consola.interactivo || consola.guardarModoDeProyecto === undefined) return;

  let modo: "offline" | "cloud" | undefined;
  if (consola.seleccionar !== undefined) {
    const elegido = await consola.seleccionar({
      titulo: "Modo de proyecto",
      opciones: [
        { id: "cloud", etiqueta: "Cloud connected", detalle: "Conecta CloudStudio y trabaja sobre una copia sincronizada." },
        { id: "offline", etiqueta: "Offline", detalle: "Trabaja solo con los ficheros presentes en esta carpeta." },
      ],
    });
    modo = elegido === "cloud" || elegido === "offline" ? elegido : undefined;
  } else {
    consola.escribir("modo de proyecto:\n  1. Cloud connected\n  2. Offline\n");
    const elegido = (await consola.preguntar("número (Enter cancela): ")).trim();
    modo = elegido === "1" ? "cloud" : elegido === "2" ? "offline" : undefined;
  }

  if (modo === undefined) {
    consola.escribir("inicio cancelado: elige un modo para crear .xonecode\n");
    return;
  }
  if (modo === "offline") {
    consola.guardarModoDeProyecto("offline");
    consola.escribir("→ Modo offline listo\n");
    return;
  }
  if (consola.conectarCloudStudio === undefined || consola.guardarCloudStudioDeProyecto === undefined || consola.guardarProyectoCloudStudioDeProyecto === undefined) {
    consola.escribir("CloudStudio no está disponible en esta ejecución; no se ha creado .xonecode\n");
    return;
  }

  // El endpoint es parte de la identidad del entorno: incluso teniendo uno oficial
  // por omisión, el primer arranque debe permitir elegir el CloudStudio concreto.
  // Enter conserva la URL pública sin obligar a teclearla.
  const escrita = await consola.preguntar(`URL MCP de CloudStudio [${URL_CLOUDSTUDIO_POR_OMISION}]: `);
  const url = escrita.trim() || URL_CLOUDSTUDIO_POR_OMISION;
  consola.escribir("Configurando CloudStudio…\n");
  let resultado: Awaited<ReturnType<NonNullable<Consola["conectarCloudStudio"]>>>;
  try {
    resultado = await consola.conectarCloudStudio(url, SCOPES_STUDIO_AGENTE, consola.escribir);
  } catch (error) {
    // El asistente inicial nunca puede tirar abajo la consola: ni un OAuth cancelado
    // ni un MCP con un catálogo distinto deben dejar la carpeta a medio configurar.
    const detalle = error instanceof Error ? error.message : String(error);
    consola.escribir(`No se pudo conectar a CloudStudio: ${detalle}\n`);
    consola.escribir("No se ha creado .xonecode. Reinicia xonecode para elegir Offline o probar otra URL.\n");
    return;
  }
  if (resultado.proyectos.length === 0) {
    consola.escribir("CloudStudio no devolvió proyectos seleccionables; no se ha creado .xonecode\n");
    return;
  }
  let id: string | undefined;
  if (consola.seleccionar !== undefined) {
    id = await consola.seleccionar({
      titulo: "Proyecto de CloudStudio",
      opciones: resultado.proyectos.map((proyecto) => ({ id: proyecto.id, etiqueta: proyecto.nombre, detalle: proyecto.id })),
    });
  } else {
    for (const [indice, proyecto] of resultado.proyectos.entries()) consola.escribir(`  ${indice + 1}. ${proyecto.nombre}\n`);
    const indice = Number((await consola.preguntar("número (Enter cancela): ")).trim()) - 1;
    id = Number.isInteger(indice) ? resultado.proyectos[indice]?.id : undefined;
  }
  const proyecto = resultado.proyectos.find((candidato) => candidato.id === id);
  if (proyecto === undefined) {
    consola.escribir("selección cancelada; no se ha creado .xonecode\n");
    return;
  }
  consola.guardarCloudStudioDeProyecto(resultado.url, resultado.scopes);
  consola.guardarProyectoCloudStudioDeProyecto(proyecto);
  // El modo se guarda YA: `sincronizar` (más abajo) relee la config del disco, y un
  // fallo en la descarga no puede dejar «cloudstudio» apuntado sin ningún «modo».
  consola.guardarModoDeProyecto("cloud");

  // Paso 3: rama ORIGEN (de la que se baja y contra la que se compara) y descarga de la
  // copia local. Las ramas entran inyectadas, hermanas de `conectarCloudStudio`: esta capa
  // tampoco conoce MCP para esto. Hoy los proyectos suelen tener solo `master`, y con una
  // sola opción no se pregunta: preguntar lo que no tiene alternativa es ruido.
  let ramas: string[] = [];
  try {
    ramas = (await consola.ramasDeCloudStudio?.(proyecto.nombre)) ?? [];
  } catch (error) {
    // Igual que el fallo de `conectarCloudStudio`: no puede tirar abajo un alta que ya
    // guardó proyecto y modo. La rama cae al valor por defecto y se avisa.
    const detalle = error instanceof Error ? error.message : String(error);
    consola.escribir(`no se pudieron listar las ramas de CloudStudio: ${detalle}\n`);
  }
  let rama = ramas[0] ?? "master";
  if (ramas.length > 1) {
    let elegida: string | undefined;
    if (consola.seleccionar !== undefined) {
      elegida = await consola.seleccionar({
        titulo: "Rama origen",
        opciones: ramas.map((r) => ({ id: r, etiqueta: r })),
      });
    } else {
      consola.escribir("rama origen:\n");
      for (const [indice, r] of ramas.entries()) consola.escribir(`  ${indice + 1}. ${r}\n`);
      const indice = Number((await consola.preguntar("número (Enter cancela): ")).trim()) - 1;
      elegida = Number.isInteger(indice) ? ramas[indice] : undefined;
    }
    if (elegida === undefined) {
      // A diferencia de la cancelación del modo o del proyecto, aquí YA se guardó
      // `cloudstudio` y `modo: "cloud"`: decir «no se ha creado .xonecode» sería mentir.
      // Se cae a la primera rama en vez de dejar el proyecto sin rama origen.
      consola.escribir(`selección cancelada; se usa «${rama}» como rama origen\n`);
    } else {
      rama = elegida;
    }
  }
  consola.guardarRamaDeProyecto?.(rama);

  if (consola.sincronizar !== undefined) {
    consola.escribir("Descargando el proyecto…\n");
    try {
      const bajada = await consola.sincronizar("bajar", raiz, undefined, consola.escribir);
      if (bajada.tipo === "texto") consola.escribir(bajada.texto);
      else {
        // El alta es el camino por el que se pierde trabajo sin haber escrito `/sync`:
        // quien arranca xonecode en una carpeta con trabajo y elige modo cloud. Bajar
        // sobrescribe el disco, así que aquí se dice qué hay y NO se baja nada.
        consola.escribir(
          `no se ha descargado nada: hay trabajo local sin commitear (${bajada.pendientes.join(", ")}). ` +
            "La descarga sobrescribe el disco; commitea (o guarda) y usa /sync bajar\n"
        );
      }
    } catch (error) {
      // Un fallo de red o de servidor durante la descarga no puede tirar abajo el alta:
      // .xonecode ya quedó escrito y el usuario puede reintentar con /sync bajar.
      const detalle = error instanceof Error ? error.message : String(error);
      consola.escribir(`no se pudo descargar el proyecto: ${detalle}; prueba /sync bajar\n`);
    }
  }

  // Paso 4: modelo propio del proyecto, opcional. Por omisión NO: hereda el global, que
  // es lo que el usuario acaba de elegir en el asistente de cuenta.
  if (consola.guardarModelosDeProyecto !== undefined) {
    let quierePropio = false;
    if (consola.seleccionar !== undefined) {
      const elegido = await consola.seleccionar({
        titulo: "Modelo de este proyecto",
        opciones: [
          { id: "global", etiqueta: "Usar el modelo global", detalle: "lo normal" },
          { id: "propio", etiqueta: "Elegir uno solo para este proyecto" },
        ],
      });
      quierePropio = elegido === "propio";
    } else {
      consola.escribir("modelo de este proyecto:\n  1. Usar el modelo global\n  2. Elegir uno para este proyecto\n");
      quierePropio = (await consola.preguntar("número (Enter = usar el global): ")).trim() === "2";
    }
    if (quierePropio) {
      let proveedor: Proveedor | undefined;
      if (consola.seleccionar !== undefined) {
        const elegido = await consola.seleccionar({
          titulo: "Proveedor del modelo de este proyecto",
          opciones: PROVEEDORES.map((p) => ({ id: p, etiqueta: p })),
        });
        proveedor = validarProveedor(elegido);
      } else {
        consola.escribir(`proveedores: ${PROVEEDORES.join(", ")}\n`);
        proveedor = validarProveedor((await consola.preguntar("proveedor: ")).trim());
      }
      if (proveedor === undefined) {
        consola.escribir("proveedor inválido; se mantiene el modelo global\n");
      } else {
        const modeloId = await seleccionarModelo(proveedor, consola);
        if (modeloId !== undefined) {
          const id = `${proveedor}/${modeloId}`;
          for (const papel of PAPELES) consola.guardarModelosDeProyecto(papel, id);
          consola.escribir(`→ ${id} guardado para este proyecto\n`);
        }
      }
    }
  }

  // No se vuelca el catálogo: es configuración de transporte, no parte de la conversación.
  consola.escribir("→ Entorno cloud listo\n");
}

/** Datos de un selector: UI-neutral, para que `consola.ts` no conozca Ink. */
export interface SelectorDeConsola {
  titulo: string;
  opciones: readonly { id: string; etiqueta: string; detalle?: string }[];
}

export interface EstadoDeSesion {
  hilo: string;
  raiz: string;
  fuentes: FuentesDeEleccion;
  /** Overrides vivos de `/modelos`, separados de las banderas con las que arrancó la CLI. */
  seleccionesDeCatalogo?: Partial<Record<Papel, string>>;
}

/** Lo que hace un comando de barra: escribe y puede cambiar el estado de la sesión. */
export type ManejadorDeBarra = (
  args: string[],
  estado: EstadoDeSesion,
  consola: Consola
) => Promise<{ seguir: boolean; estado?: EstadoDeSesion }>;

/** Cómo se corre una línea de prosa. El valor por omisión usa el agente guionizado. */
export type EjecutorDeTurno = (
  peticion: string,
  estado: EstadoDeSesion,
  consola: Consola
) => Promise<void>;

/**
 * Duplicado a propósito de `cli/config.ts` (que a su vez lo duplica de
 * `agent/configEnDisco.ts`, no exportado y no tocable): misma regla y misma
 * omisión — `ollama` no lleva variable porque no necesita credencial.
 */
const VARIABLE_POR_PROVEEDOR: Partial<Record<Proveedor, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GOOGLE_API_KEY",
  "ollama-cloud": "OLLAMA_API_KEY",
};

/**
 * Un turno con `AgenteGuionizado`, igual que el `cmdRun` sin `--real`.
 *
 * Es el valor por omisión de `correrConsola`: mantiene el invariante de fase 1 (todo corre
 * sin API y sin red). El cableado del agente REAL va en otra tarea y se inyecta como
 * tercer parámetro, mismo patrón que `cmdVerify(ruta, escribir, verificador = ...)`.
 */
export async function ejecutarTurnoGuionizado(
  peticion: string,
  _estado: EstadoDeSesion,
  consola: Consola
): Promise<void> {
  const agente = new AgenteGuionizado();
  // La costura: la piel de la consola si la aporta (la TUI), y el render stdio de siempre
  // si no — el camino de hoy, byte-idéntico cuando el campo no está.
  const piel = consola.piel?.() ?? crearPielStdio(consola.escribir);

  if (esDoble(agente)) {
    consola.escribir("⚠  AGENTE DE PEGA: esto es un guion, no ha corrido ningún modelo.\n\n");
  }

  await correrTurno(agente.turno(peticion), piel, {
    avisos: (b) => (b.corrio("verify") && esDoble(agente) ? ["⚠  El veredicto es de pega."] : []),
  });
}

// La función entera es de pega, no un turno suyo en concreto: TODO turno que pase por aquí
// usa `new AgenteGuionizado()`, así que la marca no depende de qué pasó en esta llamada.
// `web/servidor/vestibulo.ts#volcar` la mira para decidir si un turno se escribe a
// `.xonecode/sesiones/` — un transcript de pega indistinguible de uno real ensuciaría el
// historial del proyecto, y la decisión tiene que tomarla esta marca y no un booleano ni
// una bandera leída del argv, por la misma razón de siempre: se puede olvidar.
(ejecutarTurnoGuionizado as unknown as Record<typeof ES_DOBLE, true>)[ES_DOBLE] = true;

/** El nombre del tipo de error y su mensaje: «ModeloMalEscrito: ...» no cuenta lo mismo que «Error: ...». */
function describirError(e: unknown): string {
  if (e instanceof Error) return `${e.constructor.name}: ${e.message}`;
  return String(e);
}

/**
 * Ruta de `auth.json` en el mismo momento de la llamada (no cacheada en un módulo, por lo
 * mismo que `rutaAuth` tampoco lo hace) y SIN importar la función del writer: `provider`
 * solo necesita NOMBRAR la ruta, nunca leerla.
 */
function rutaAuthParaAviso(): string {
  return join(homedir(), NOMBRE_CARPETA, "auth.json");
}

/** Filtra por id o nombre sin alterar el orden publicado por el proveedor. */
export function filtrarModelos(
  modelos: readonly ModeloDisponible[],
  filtro: string
): ModeloDisponible[] {
  const buscado = filtro.trim().toLowerCase();
  if (buscado === "") return [...modelos];
  return modelos.filter((modelo) =>
    modelo.id.toLowerCase().includes(buscado) || modelo.nombre?.toLowerCase().includes(buscado)
  );
}

export type EleccionNumerada =
  | { tipo: "elegido"; modelo: ModeloDisponible }
  | { tipo: "cancelado" }
  | { tipo: "invalido" };

/** Un número visible es uno basado en uno; Enter significa cancelar, no elegir el primero. */
export function elegirPorNumero(
  modelos: readonly ModeloDisponible[],
  respuesta: string
): EleccionNumerada {
  const texto = respuesta.trim();
  if (texto === "") return { tipo: "cancelado" };
  if (!/^\d+$/.test(texto)) return { tipo: "invalido" };
  const modelo = modelos[Number(texto) - 1];
  return modelo === undefined ? { tipo: "invalido" } : { tipo: "elegido", modelo };
}

/** Un papel vacío permite salir del flujo, pero cualquier otro texto debe ser exacto. */
export function elegirPapel(respuesta: string): Papel | undefined {
  const texto = respuesta.trim().toLowerCase();
  return (PAPELES as readonly string[]).includes(texto) ? (texto as Papel) : undefined;
}

/** La global solo tiene efecto inmediato si no hay una fuente de rango superior para ese papel. */
export function fuenteQueEclipsaGlobal(
  papel: Papel,
  fuentes: FuentesDeEleccion,
  seleccionesDeCatalogo: Partial<Record<Papel, string>> = {}
): "bandera" | "entorno" | "proyecto" | undefined {
  if (
    (fuentes.porPapel?.[papel] !== undefined &&
      fuentes.porPapel[papel] !== seleccionesDeCatalogo[papel]) ||
    fuentes.bandera !== undefined
  ) {
    return "bandera";
  }
  if (fuentes.entorno?.XONECODE_MODELO !== undefined) return "entorno";
  if (fuentes.proyecto?.modelos?.[papel] !== undefined || fuentes.proyecto?.modelo !== undefined) {
    return "proyecto";
  }
  return undefined;
}

function validarProveedor(nombre: string | undefined): Proveedor | undefined {
  if (nombre !== undefined && (PROVEEDORES as readonly string[]).includes(nombre)) {
    return nombre as Proveedor;
  }
  return undefined;
}

/** Exportada: `main.ts` la usa para el contexto de `asistenteDeModelo` (stdio y TUI). */
export function hayCredencial(proveedor: Proveedor, raiz: string): boolean {
  const variable = VARIABLE_POR_PROVEEDOR[proveedor];
  if (variable === undefined) return true;
  const enEntorno = process.env[variable];
  if (enEntorno !== undefined && enEntorno.trim() !== "") return true;
  return cargar(raiz).auth[proveedor] !== undefined;
}

function describirModelo(modelo: ModeloDisponible): string {
  const etiqueta = modelo.nombre ?? modelo.id;
  const contexto = modelo.contexto === undefined ? "" : `, ctx ${modelo.contexto}`;
  return `${etiqueta} (${modelo.proveedor}/${modelo.id}${contexto})`;
}

/**
 * El selector de modelo de un catálogo ya elegido: la parte que `/modelos` y el alta de
 * proyecto (`configurarModoInicial`) COMPARTEN, para que no haya dos copias del mismo
 * flujo (rico con `seleccionar`, o numerado por `preguntar` cuando esa costura no existe).
 * Devuelve el id crudo del catálogo (sin el prefijo `<proveedor>/`) o `undefined` si se
 * canceló o no había nada entre lo que elegir — los mensajes de cada caso ya se escriben
 * aquí, así que quien llama no repite el aviso.
 */
export async function seleccionarModelo(proveedor: Proveedor, consola: Consola): Promise<string | undefined> {
  const modelos = await consola.catalogoModelos.listar(proveedor);
  if (modelos.length === 0) {
    consola.escribir(`no hay modelos disponibles para ${proveedor}\n`);
    return undefined;
  }
  if (consola.seleccionar !== undefined) {
    const opciones = modelos.map((modelo) => ({
      id: modelo.id,
      etiqueta: modelo.nombre ?? modelo.id,
      detalle: describirModelo(modelo),
    }));
    const elegido = await consola.seleccionar({ titulo: `Modelos de ${proveedor}`, opciones });
    const modelo = modelos.find((candidato) => candidato.id === elegido);
    if (modelo === undefined) {
      consola.escribir("selección cancelada\n");
      return undefined;
    }
    return modelo.id;
  }
  const filtro = await consola.preguntar("filtro (Enter para todos): ");
  const filtrados = filtrarModelos(modelos, filtro);
  if (filtrados.length === 0) {
    consola.escribir("no hay modelos que coincidan con el filtro\n");
    return undefined;
  }
  for (const [indice, modelo] of filtrados.entries()) {
    consola.escribir(`${indice + 1}. ${describirModelo(modelo)}\n`);
  }
  const eleccion = elegirPorNumero(filtrados, await consola.preguntar("número (Enter cancela): "));
  if (eleccion.tipo === "cancelado") {
    consola.escribir("selección cancelada\n");
    return undefined;
  }
  if (eleccion.tipo === "invalido") {
    consola.escribir("número inválido\n");
    return undefined;
  }
  return eleccion.modelo.id;
}

/** Flujo interactivo de catálogo; los fallos previstos nunca devuelven un estado nuevo. */
async function elegirModelo(
  args: string[],
  estado: EstadoDeSesion,
  consola: Consola
): Promise<{ seguir: boolean; estado?: EstadoDeSesion }> {
  const proveedor = validarProveedor(args[0]);
  if (proveedor === undefined) {
    const escrito = args[0];
    consola.escribir(
      escrito === undefined
        ? `uso: /modelos <proveedor> — proveedores: ${PROVEEDORES.join(", ")}\n`
        : `proveedor «${escrito}» desconocido. Los que hay: ${PROVEEDORES.join(", ")}\n`
    );
    return { seguir: true };
  }
  if (!hayCredencial(proveedor, estado.raiz)) {
    consola.escribir(`falta la credencial para ${proveedor}; usa /provider ${proveedor}\n`);
    return { seguir: true };
  }

  const modeloId = await seleccionarModelo(proveedor, consola);
  if (modeloId === undefined) return { seguir: true };

  let papel: Papel | undefined;
  if (consola.seleccionar !== undefined) {
    const papelElegido = await consola.seleccionar({
      titulo: "Asignar modelo a",
      opciones: PAPELES.map((p) => ({ id: p, etiqueta: p })),
    });
    papel = elegirPapel(papelElegido ?? "");
  } else {
    const respuestaPapel = await consola.preguntar("papel (rapido/trabajo/afilado): ");
    if (respuestaPapel.trim() === "") {
      consola.escribir("selección cancelada\n");
      return { seguir: true };
    }
    papel = elegirPapel(respuestaPapel);
    if (papel === undefined) {
      consola.escribir(`papel inválido; elige: ${PAPELES.join(", ")}\n`);
      return { seguir: true };
    }
  }
  if (papel === undefined) {
    consola.escribir("selección cancelada\n");
    return { seguir: true };
  }

  return guardarEleccionDeModelo(proveedor, modeloId, papel, estado, consola);
}

/** Selector de tema: misma costura rica que /modelos, con pregunta numerada en stdio. */
async function elegirTema(_args: string[], _estado: EstadoDeSesion, consola: Consola): Promise<{ seguir: boolean }> {
  let id: string | undefined;
  if (consola.seleccionar !== undefined) {
    id = await consola.seleccionar({
      titulo: "Tema de xonecode",
      opciones: TEMAS.map((tema) => ({ id: tema.id, etiqueta: tema.etiqueta, detalle: tema.detalle })),
    });
  } else {
    consola.escribir("temas:\n");
    for (const [indice, tema] of TEMAS.entries()) {
      consola.escribir(`  ${indice + 1}. ${tema.etiqueta} — ${tema.detalle}\n`);
    }
    const respuesta = (await consola.preguntar("número (Enter cancela): ")).trim();
    if (respuesta === "") return { seguir: true };
    const indice = Number(respuesta) - 1;
    id = Number.isInteger(indice) ? TEMAS[indice]?.id : undefined;
  }
  if (id === undefined) {
    consola.escribir("selección cancelada\n");
    return { seguir: true };
  }
  if (!esTema(id)) {
    consola.escribir("tema inválido\n");
    return { seguir: true };
  }
  (consola.aplicarTema ?? seleccionarTema)(id);
  const tema = TEMAS.find((candidato) => candidato.id === id)!;
  const guardado = consola.guardarTemaDeProyecto?.(id);
  consola.escribir(
    guardado === undefined
      ? `tema activo: ${tema.etiqueta}\n`
      : `tema activo: ${tema.etiqueta} · guardado en ${guardado.ruta}\n`
  );
  return { seguir: true };
}

function guardarEleccionDeModelo(
  proveedor: Proveedor,
  modeloId: string,
  papel: Papel,
  estado: EstadoDeSesion,
  consola: Consola
): { seguir: boolean; estado?: EstadoDeSesion } {
  const id = `${proveedor}/${modeloId}`;
  consola.guardarModeloGlobal(papel, id);
  const eclipsa = fuenteQueEclipsaGlobal(papel, estado.fuentes, estado.seleccionesDeCatalogo);
  if (eclipsa !== undefined) {
    consola.escribir(`modelo ${papel} guardado en global; sigue activo el de ${eclipsa}\n`);
    return { seguir: true };
  }
  const fuentes = {
    ...estado.fuentes,
    porPapel: { ...estado.fuentes.porPapel, [papel]: id },
  };
  consola.escribir(acuseDeModelo(papel, id));
  return {
    seguir: true,
    estado: {
      ...estado,
      fuentes,
      seleccionesDeCatalogo: { ...estado.seleccionesDeCatalogo, [papel]: id },
    },
  };
}

/**
 * El `completer` de readline (ver docs de node:readline: firma síncrona
 * `(line: string) => [string[], string]`). Dos mundos:
 *
 * - Una línea que empieza por «/» propone SIEMPRE desde `COMANDOS`, nunca de una lista
 *   aparte. Con un único candidato, se completa. Con varios, se listan con su
 *   descripción (readline por sí solo no la pinta) usando `escribir`.
 * - Una línea en prosa no completa nada… salvo tras una «@»: entonces propone
 *   FICHEROS del proyecto. Los ficheros entran por FUNCIÓN porque el completer se
 *   construye una vez al arrancar y los ficheros cambian durante la sesión. Los
 *   candidatos son líneas COMPLETAS (mismo pacto que con «/prov» → /provider): readline
 *   sustituye la línea entera por el candidato y completa al prefijo común solo.
 *
 * Fuera de eso, no molesta: en medio de una petición en prosa, un completer que
 * sugiriera siempre sería un estorbo.
 */
const TOPE_DE_PILDORAS = 8;

export function crearCompleter(
  escribir: Escribir,
  ficherosDelProyecto: () => ReadonlySet<string> = () => new Set()
): (linea: string) => [string[], string] {
  return (linea: string) => {
    if (!linea.startsWith("/")) {
      const arroba = linea.lastIndexOf("@");
      if (arroba === -1) return [[], linea];
      const prefijo = linea.slice(arroba + 1);
      const base = linea.slice(0, arroba + 1);
      // La barra inicial es el convenio del espacio virtual del backend, no algo que el
      // usuario deba teclear: se ofrece la ruta RELATIVA.
      const ficheros = [...ficherosDelProyecto()]
        .map((f) => (f.startsWith("/") ? f.slice(1) : f))
        .filter((f) => f.startsWith(prefijo))
        .sort()
        .map((f) => base + f);
      if (ficheros.length === 0) return [[], linea];
      if (ficheros.length > 1) {
        escribir("\n");
        const visibles = ficheros.slice(0, TOPE_DE_PILDORAS);
        escribir(`  ${visibles.map((f) => f.slice(base.length)).join("   ")}\n`);
        const restantes = ficheros.length - visibles.length;
        if (restantes > 0) escribir(`  … y ${restantes} más\n`);
      }
      return [ficheros, linea];
    }
    const prefijo = linea.slice(1).toLowerCase();
    const candidatos = Object.keys(COMANDOS)
      .filter((n) => n.startsWith(prefijo))
      .map((n) => `/${n}`);
    if (candidatos.length > 1) {
      escribir("\n");
      for (const c of candidatos) {
        const nombre = c.slice(1);
        escribir(`  ${c.padEnd(20)}  ${COMANDOS[nombre]!.descripcion}\n`);
      }
    }
    return [candidatos, linea];
  };
}

/**
 * La maquinaria común de los cuatro comandos de modelo: validación con `parsear` y cambio
 * del modelo EN CALIENTE. `papel === undefined` fija los TRES papeles (la bandera);
 * en otro caso fija uno, que gana sobre la bandera.
 *
 * El estado solo cambia con un modelo VÁLIDO: un fallo de tecleo no puede dejar la sesión
 * apuntando a algo que revienta al construir el cliente.
 */
function manejadorDeModelo(papel: Papel | undefined): ManejadorDeBarra {
  const nombre = papel === undefined ? "/modelo" : `/modelo-${papel}`;
  return async (args, estado, consola) => {
    const valor = args[0];
    if (!valor) {
      consola.escribir(
        `uso: ${nombre} <proveedor>/<modelo> — proveedores: ${PROVEEDORES.join(", ")}\n`
      );
      return { seguir: true };
    }
    try {
      parsear(valor);
    } catch (e) {
      // El mensaje del error ya lista los proveedores válidos: se reusa, no se reescribe.
      if (!(e instanceof ModeloMalEscrito)) throw e;
      consola.escribir(`${e.message}\n`);
      return { seguir: true };
    }
    const fuentes: FuentesDeEleccion =
      papel === undefined
        ? { ...estado.fuentes, bandera: valor }
        : { ...estado.fuentes, porPapel: { ...estado.fuentes.porPapel, [papel]: valor } };
    // La frase vive en `acuseDeModelo.ts`: la TUI la re-parsea para su sidebar, así
    // que escribir y leer comparten módulo — retocar la frase aquí no rompe a ciegas.
    consola.escribir(acuseDeModelo(papel, valor));
    const seleccionesDeCatalogo = { ...estado.seleccionesDeCatalogo };
    if (papel === undefined) {
      for (const p of PAPELES) delete seleccionesDeCatalogo[p];
    } else {
      delete seleccionesDeCatalogo[papel];
    }
    return {
      seguir: true,
      estado: {
        ...estado,
        fuentes,
        seleccionesDeCatalogo:
          Object.keys(seleccionesDeCatalogo).length === 0 ? undefined : seleccionesDeCatalogo,
      },
    };
  };
}

/**
 * La ÚNICA política de aprobación que existe hoy: rellena el hueco de
 * `core/cloudstudio.ts#PoliticaDeAprobacion` con un humano que ve el plan y responde.
 * Vive aquí, en `cli/`, y no en `agent/subida.ts`: la política es de la piel, el hueco es
 * del motor.
 *
 * **Es MÁS estricta que `cli/aprobar.ts`, a propósito: aquí el Enter a secas no aprueba
 * ni con TTY.** No es el mismo acto. En `aprobar.ts` se autoriza una escritura con su
 * diff delante, línea a línea, y el Enter que aprueba lo pulsa alguien que está mirando
 * el cambio; aquí se PUBLICA en un servidor remoto, lo que hay en pantalla es una lista
 * de rutas —no el contenido— y es la operación menos reversible del producto. El detalle
 * que lo hace peligroso no se ve: `APPROVALS_TTY` (`vendor/hitl.ts`) contiene la cadena
 * VACÍA, así que pasarle `interactive` a `interpretAnswer` convertiría en «sube» toda
 * respuesta vacía — y `consola.preguntar` devuelve "" también cuando el readline ya está
 * cerrado (Ctrl-D, un stdin agotado a mitad de turno). Un EOF no puede publicar. Por eso
 * se llama sin opciones, contra `APPROVALS_NO_TTY`, y el prompt enseña `[s/N]` siempre:
 * un default visible que no fuera el real sería mentir en el paso que sube.
 *
 * La política AUTÓNOMA (el papel `afilado` decidiendo sin que nadie mire) todavía no
 * existe — hace falta, además del veredicto del juez, que el código compruebe
 * condiciones deterministas (verificador en verde, árbol limpio, plan sin pendientes):
 * ver el comentario de `PoliticaDeAprobacion`.
 */
export function politicaInteractiva(consola: Consola): PoliticaDeAprobacion {
  return async (plan) => {
    consola.escribir(`\n${"─".repeat(60)}\n`);
    consola.escribir(`SUBIDA A CLOUDSTUDIO — ${plan.length} ${plan.length === 1 ? "operación" : "operaciones"}\n`);
    for (const operacion of plan) {
      const signo = operacion.tipo === "borrado" ? "-" : operacion.tipo === "binario" ? "~" : "+";
      consola.escribir(`  ${signo} ${operacion.ruta}\n`);
    }
    const respuesta = await consola.preguntar("¿Subir a CloudStudio? [s/N] ");
    const decision = interpretAnswer(respuesta);
    consola.escribir(decision.type === "approve" ? "  → APROBADO\n" : "  → rechazado, no se ha aplicado nada\n");
    return decision.type === "approve";
  };
}

export const COMANDOS: Record<string, { descripcion: string; manejador: ManejadorDeBarra }> = {
  ayuda: {
    descripcion: "lista los comandos de barra",
    // Se genera RECORRIENDO COMANDOS: una lista escrita a mano se queda vieja en cuanto
    // alguien añade un comando. La auto-referencia es segura porque esto corre en runtime.
    manejador: async (_args, _estado, consola) => {
      consola.escribir("comandos:\n");
      for (const [nombre, c] of Object.entries(COMANDOS)) {
        consola.escribir(`  /${nombre.padEnd(16)}  ${c.descripcion}\n`);
      }
      return { seguir: true };
    },
  },
  config: {
    descripcion: "config y credenciales, sin claves — como `xonecode config`",
    manejador: async (_args, estado, consola) => {
      cmdConfig(estado.fuentes, {}, consola.escribir, estado.raiz);
      return { seguir: true };
    },
  },
  describe: {
    descripcion: "qué hay montado y qué es de pega — como `xonecode describe`",
    manejador: async (_args, estado, consola) => {
      cmdDescribe(estado.fuentes, consola.escribir, estado.raiz);
      return { seguir: true };
    },
  },
  doctor: {
    descripcion: "¿hay proyecto aquí? ¿responde el simulador? — como `xonecode doctor`",
    manejador: async (_args, _estado, consola) => {
      // Firma real de cmdDoctor: pregunta por `process.cwd()`, no por `estado.raiz` — es lo
      // que un diagnóstico de entorno debe hacer, así que no se le pasa la raíz de sesión.
      await cmdDoctor(consola.escribir);
      return { seguir: true };
    },
  },
  verify: {
    descripcion: "valida el proyecto con el simulador — como `xonecode verify`",
    manejador: async (_args, estado, consola) => {
      await cmdVerify(estado.raiz, consola.escribir);
      return { seguir: true };
    },
  },
  modelo: {
    descripcion: "cambia los TRES papeles en caliente: /modelo <proveedor>/<modelo>",
    manejador: manejadorDeModelo(undefined),
  },
  "modelo-rapido": {
    descripcion: "cambia el papel `rapido` en caliente: /modelo-rapido <proveedor>/<modelo>",
    manejador: manejadorDeModelo("rapido"),
  },
  "modelo-trabajo": {
    descripcion: "cambia el papel `trabajo` en caliente: /modelo-trabajo <proveedor>/<modelo>",
    manejador: manejadorDeModelo("trabajo"),
  },
  "modelo-afilado": {
    descripcion: "cambia el papel `afilado` en caliente: /modelo-afilado <proveedor>/<modelo>",
    manejador: manejadorDeModelo("afilado"),
  },
  modelos: {
    descripcion: "elige un modelo del catálogo de un proveedor y lo guarda globalmente: /modelos <proveedor>",
    manejador: elegirModelo,
  },
  themes: {
    descripcion: "elige tema visual: XOne, Clear, Midnight, Graphite o Ember",
    manejador: elegirTema,
  },
  "connect-studio": {
    descripcion: "conecta CloudStudio una vez: /connect-studio [url] [agente|lectura]",
    manejador: async (args, _estado, consola) => {
      if (consola.conectarCloudStudio === undefined || consola.guardarCloudStudioDeProyecto === undefined) {
        consola.escribir("la conexión CloudStudio no está disponible en esta ejecución\n");
        return { seguir: true };
      }
      const primerArgEsModo = args[0] === "lectura" || args[0] === "agente";
      const escrita = primerArgEsModo ? "" : args[0] ?? await consola.preguntar(`URL MCP de CloudStudio [${URL_CLOUDSTUDIO_POR_OMISION}]: `);
      const url = escrita.trim() || URL_CLOUDSTUDIO_POR_OMISION;
      const modo = modoStudio(primerArgEsModo ? args[0] : args[1]);
      if (modo === undefined) {
        consola.escribir("modo inválido; elige agente o lectura\n");
        return { seguir: true };
      }
      consola.escribir("Configurando CloudStudio…\n");
      const resultado = await consola.conectarCloudStudio(url, modo.scopes, consola.escribir);
      const guardado = consola.guardarCloudStudioDeProyecto(resultado.url, resultado.scopes);
      // El catálogo completo es material de configuración, no una respuesta de consola:
      // varias descripciones ocupan cientos de líneas y apartan al usuario de su tarea.
      // La URL y los scopes siguen guardados en `.xonecode/config.json` para diagnóstico.
      void guardado;
      consola.escribir("→ Entorno listo\n");
      return { seguir: true };
    },
  },
  sync: {
    descripcion: "sincroniza con CloudStudio: /sync [estado|bajar|subir]",
    manejador: async (args, estado, consola) => {
      if (consola.sincronizar === undefined) {
        consola.escribir("la sincronización no está disponible en esta ejecución\n");
        return { seguir: true };
      }
      const accion = args[0] ?? "estado";
      if (accion !== "estado" && accion !== "bajar" && accion !== "subir") {
        consola.escribir("uso: /sync [estado|bajar|subir]\n");
        return { seguir: true };
      }
      // El hueco de política solo se rellena para «subir»: es la única acción que
      // escribe. `agent/subida.ts#subir` la invoca con el plan YA CONSTRUIDO, así que
      // esto puede pasarse siempre — si el árbol está sucio o no hay nada que subir, ni
      // siquiera llega a invocarse.
      const politicaDeAprobacion = accion === "subir" ? politicaInteractiva(consola) : undefined;
      const resultado = await consola.sincronizar(accion, estado.raiz, politicaDeAprobacion, consola.escribir);
      if (resultado.tipo === "arbol-sucio") {
        // Al subir se sube el estado de un COMMIT, no un borrador: así «lo que está
        // arriba» es siempre un commit concreto y mover la ref significa algo. Al bajar
        // el motivo es otro y hay que decirlo: la descarga SOBRESCRIBE el disco.
        const porque =
          resultado.accion === "subir"
            ? "commitea antes de subir"
            : "la descarga sobrescribe el disco; commitea antes de bajar (o guarda una copia, si no llevas git)";
        consola.escribir(`hay cambios sin commitear (${resultado.pendientes.join(", ")}); ${porque}\n`);
        return { seguir: true };
      }
      consola.escribir(resultado.texto);
      return { seguir: true };
    },
  },
  hilo: {
    descripcion: "muestra el hilo (thread_id) de esta sesión",
    manejador: async (_args, estado, consola) => {
      consola.escribir(`${estado.hilo}\n`);
      return { seguir: true };
    },
  },
  nuevo: {
    descripcion: "abre un hilo nuevo sin salir de la sesión",
    manejador: async (_args, estado, consola) => {
      // Mismo patrón que run.ts: prefijo xonecode- + uuid.
      const nuevoHilo = `xonecode-${randomUUID()}`;
      consola.escribir(`hilo nuevo: ${nuevoHilo}\n`);
      return { seguir: true, estado: { ...estado, hilo: nuevoHilo } };
    },
  },
  provider: {
    descripcion: "lista credenciales o guarda una: /provider [proveedor]",
    manejador: async (args, estado, consola) => {
      const nombre = args[0];
      if (!nombre) {
        // El entorno gana sobre auth.json (aplicarAuth no pisa una variable que ya
        // existía): mismo orden de mirón que cmdConfig — primero env, luego disco.
        const cargado = cargar(estado.raiz);
        for (const p of PROVEEDORES) {
          const variable = VARIABLE_POR_PROVEEDOR[p];
          const enEntorno = variable !== undefined && process.env[variable] !== undefined;
          const enAuth = !enEntorno && cargado.auth[p] !== undefined;
          // ollama no se marca «sin credencial»: no la necesita, no le falta nada.
          const estadoClave = variable === undefined
            ? "no necesita credencial"
            : enEntorno || enAuth
              ? "✓ puesta"
              : "· sin credencial";
          consola.escribir(`  ${p}  ${estadoClave}\n`);
        }
        consola.escribir("--- modelos por omisión ---\n");
        for (const p of PROVEEDORES) {
          const papeles = PAPELES.filter((papel) => POR_OMISION[papel].proveedor === p);
          if (papeles.length > 0) {
            consola.escribir(
              `  ${p}: ${papeles.map((papel) => `${papel}=${POR_OMISION[papel].modelo}`).join(", ")}\n`
            );
          }
        }
        return { seguir: true };
      }
      if (!(PROVEEDORES as readonly string[]).includes(nombre)) {
        consola.escribir(`proveedor «${nombre}» desconocido. Los que hay: ${PROVEEDORES.join(", ")}\n`);
        return { seguir: true };
      }
      if (!consola.interactivo) {
        // Sin TTY no hay eco-off posible: la clave tecleada quedaría en el scrollback.
        consola.escribir(
          `sin TTY no se puede leer la clave sin eco; edita ${rutaAuthParaAviso()} a mano\n`
        );
        return { seguir: true };
      }
      const clave = (await consola.leerSecreto(`clave de ${nombre}: `)).trim();
      if (clave === "") {
        consola.escribir("clave vacía: no se guardó nada\n");
        return { seguir: true };
      }
      try {
        const { ruta, avisos } = guardarCredencial(nombre as Proveedor, clave);
        consola.escribir(`credencial de ${nombre} guardada en ${ruta}\n`);
        for (const a of avisos) {
          consola.escribir(`  ${a.severidad === "grave" ? "⚠" : "·"}  ${a.texto}\n`);
        }
      } catch (e) {
        // AuthRotoEnDisco no se relanza: su mensaje ya dice que no se sobrescribió y hay
        // que editar a mano — el catch genérico de correrConsola no diría eso.
        if (!(e instanceof AuthRotoEnDisco)) throw e;
        consola.escribir(`${e.message}\n`);
      }
      return { seguir: true };
    },
  },
  salir: {
    descripcion: "termina la sesión",
    manejador: async (_args, _estado, consola) => {
      consola.escribir("hasta luego.\n");
      return { seguir: false };
    },
  },
};

/**
 * El lazo: una línea, una acción, y a la siguiente.
 *
 * Tres cosas NO tumban la sesión: un comando de barra que lanza, un turno que lanza y un
 * comando desconocido (que jamás se manda al modelo). El hilo vive en el checkpointer, así
 * que lo que falle en un turno lo pierde ese turno, no la sesión.
 */
export async function correrConsola(
  consola: Consola,
  estado: EstadoDeSesion,
  ejecutarTurno: EjecutorDeTurno = ejecutarTurnoGuionizado
): Promise<number> {
  for await (const cruda of consola.lineas) {
    const linea = cruda.trim();
    // Un Enter de más no gasta ni una llamada al modelo ni un error: no hay nada que hacer.
    if (linea === "") continue;

    if (linea.startsWith("/")) {
      // El comando se compara en minúsculas; los args respetan lo tecleado (p.ej. un id
      // de Ollama con mayúsculas tiene que llegar entero a `parsear`).
      const trozos = linea.split(/\s+/);
      const comando = trozos[0]!.slice(1).toLowerCase();
      const args = trozos.slice(1);
      const entrada = COMANDOS[comando];
      if (!entrada) {
        consola.escribir(`comando desconocido: /${comando} (usa /ayuda)\n`);
        continue;
      }
      try {
        const resultado = await entrada.manejador(args, estado, consola);
        if (!resultado.seguir) return 0;
        // El estado MÁS RECIENTE manda: el turno siguiente parte de lo que devolvió el
        // último manejador, no del estado de arranque.
        if (resultado.estado !== undefined) estado = resultado.estado;
      } catch (e) {
        consola.escribir(`${describirError(e)}\n`);
      }
      continue;
    }

    try {
      await ejecutarTurno(linea, estado, consola);
    } catch (e) {
      consola.escribir(`${describirError(e)}\n`);
    }
  }

  // EOF: la misma salida que /salir — un pipe que se cierra no es un error.
  return 0;
}
