/**
 * Los puertos: todo lo caro entra por aquí, con su doble determinista al lado.
 *
 * La regla dura: los puertos se PASAN al construir, nunca se importan dentro de quien
 * los usa. Es lo que hace que el lazo completo se recorra sin API, sin red y sin
 * CloudStudio — la propiedad que sostiene los tests offline del laboratorio.
 *
 * Este fichero es TypeScript puro: no importa langchain, langgraph, deepagents, MCP,
 * Ink ni React. La frontera está probada en `core/imports.test.ts`.
 */

import type { Proveedor } from "./modelos.js";
import type {
  ContextoRemoto, EntradaRemota, EstructuraRemota, ManifiestoRemoto,
} from "./cloudstudio.js";

/**
 * La marca de «esto es un doble», y por qué es un Symbol y no un booleano.
 *
 * En el harness Python equivalente el flag `verifier_is_stub` no es un campo que alguien
 * rellene: es una propiedad derivada de la CLASE del objeto. La diferencia importa —
 * un booleano se puede olvidar, o poner a false sobre un doble, y entonces los tres
 * avisos de honestidad callan justo cuando más falta hacen.
 *
 * Aquí la traducción fiel es una marca que solo los dobles llevan: un puerto real no
 * puede fingir que no lo es porque no la tiene, y un doble no puede quitársela sin
 * editar su propia definición.
 */
export const ES_DOBLE: unique symbol = Symbol.for("xonecode.es-doble");

/**
 * Acepta objeto O función: en JS una función también es un objeto en tiempo de ejecución
 * y puede llevar una propiedad-symbol igual que cualquier otro. Hace falta para
 * `cli/consola.ts#ejecutarTurnoGuionizado` — un `EjecutorDeTurno` es un tipo función, no
 * una clase con instancia, y es SIEMPRE de pega (todo turno que pasa por ahí usa
 * `new AgenteGuionizado()`), así que la marca vive en la función exportada y no en un
 * booleano en quien la invoca (`web/servidor/vestibulo.ts#volcar`).
 */
export function esDoble(puerto: unknown): boolean {
  return (
    (typeof puerto === "object" || typeof puerto === "function") &&
    puerto !== null &&
    ES_DOBLE in puerto
  );
}

/** Una tool publicada por un servidor MCP, reducida a lo que xonecode necesita. */
export interface ToolInfo {
  nombre: string;
  descripcion: string;
  /** Coste aproximado en tokens de prompt. Se mide, no se estima. */
  tokens: number;
}

export interface CatalogoMcp {
  cloudstudio: ToolInfo[];
  ide: ToolInfo[];
}

/** El acceso al proyecto del cliente, que vive en CloudStudio y se habla por MCP. */
export interface McpPort {
  catalogo(): Promise<CatalogoMcp>;
  invocar(tool: string, args: Record<string, unknown>): Promise<unknown>;
  cerrar(): Promise<void>;
}

export interface SkillInfo {
  nombre: string;
  descripcion: string;
  tokens: number;
}

/** Las skills de XOne: el catálogo y el contenido. */
export interface SkillsPort {
  catalogo(): SkillInfo[];
  cargar(nombre: string): string;
}

export type Papel = "rapido" | "trabajo" | "afilado";

/**
 * La fábrica de modelos, por PAPEL y no por nombre.
 *
 * Se reparte por papel porque es la palanca de coste: una sola pregunta de solo lectura
 * midió 213.895 tokens de entrada y 11 llamadas al modelo. El papel que corre en TODOS
 * los turnos arranca en `rapido`, y se sube solo con una medición delante.
 */
export interface ModelosPort {
  paraPapel(papel: Papel): unknown;
  /** Qué modelo concreto resuelve cada papel, para que `describe` lo pueda enseñar. */
  descripcion(): Record<Papel, string>;
}

/** Modelo normalizado publicado por un proveedor, sin detalles de su cliente. */
export interface ModeloDisponible {
  proveedor: Proveedor;
  id: string;
  nombre?: string;
  contexto?: number;
}

/** Catálogo offline de modelos disponibles por proveedor. */
export interface CatalogoModelosPort {
  listar(proveedor: Proveedor): Promise<ModeloDisponible[]>;
}

/**
 * Un hallazgo del verificador. La forma NO es de diseño: es la que emite
 * `xone-simulator validate --json` (xone-linter 1.4.0), medida contra un proyecto real.
 *
 * Tres cosas que la medición corrigió respecto al primer borrador, y las tres importan:
 *
 * 1. **`linea` es OPCIONAL.** `SourceLocation` la declara `line?: number`
 *    (`xone-linter/src/model/XoneModel.ts:3`) y en la corrida medida NINGÚN hallazgo la
 *    traía. Con un `linea: number` obligatorio, el adaptador tendría que inventarse un 0
 *    — y un número inventado en un informe de hechos es exactamente la mentira que este
 *    diseño existe para no contar.
 * 2. **Las severidades son TRES**, no dos: `error | warning | info`
 *    (`xone-linter/src/validator/ValidationResult.ts:3`). Colapsar `info` en `warning`
 *    es una decisión de producto que nadie ha tomado.
 * 3. **Se llama `code`, no `regla`**, y se conserva su nombre. El vocabulario del
 *    verificador es el que viaja al ejecutor como brief de reparación y al juez como
 *    hecho; traducirlo aquí obliga a destraducirlo en los dos sitios.
 */
export interface Hallazgo {
  code: string;
  severidad: "error" | "warning" | "info";
  mensaje: string;
  /** Ruta ABSOLUTA tal como la da el simulador. Opcional: no todo hallazgo tiene fichero. */
  fichero?: string;
  linea?: number;
  columna?: number;
}

export interface InformeVerificacion {
  verde: boolean;
  hallazgos: Hallazgo[];
  /**
   * La copia que se midió era de edad desconocida: se INTENTÓ traerla de CloudStudio y no
   * se pudo. Viaja DENTRO del informe y no en una bitácora aparte porque el informe es lo
   * que se mueve —al ejecutor como brief, al juez como hecho, al `--json` de quien lo
   * consuma— y ninguno de los tres lee la bitácora.
   *
   * Es un TERCER estado, no una variante de «no hay copia»: «nadie la ha traído» es
   * honesto, «se creía que sí y no» produce hallazgos con código, fichero y línea de otra
   * versión del proyecto.
   */
  copiaVieja?: boolean;
}

/**
 * La huella de un hallazgo, para detectar NO-PROGRESO: la misma huella dos veces seguidas
 * significa que reparar no está avanzando, y se bloquea ANTES de agotar el presupuesto.
 *
 * Ignora el mensaje a propósito: lleva nombres interpolados que varían sin que el problema
 * cambie. Y tolera la ausencia de línea, que es el caso normal según la medición.
 */
export function huella(h: Hallazgo): string {
  return [h.code, h.fichero ?? "", h.linea ?? ""].join("|");
}

/** El verificador determinista. Establece HECHOS: no opina y no auto-corrige. */
export interface VerifierPort {
  verificar(rutaProyecto: string): Promise<InformeVerificacion>;
}

// ─────────────────────────── LOS DOBLES ───────────────────────────
// Viven aquí, junto a los puertos, y NO en una carpeta de tests. El motivo: el modo
// offline es un modo de USO de primera clase (`xonecode describe` lo enseña al usuario),
// no un detalle de la suite. Un doble escondido en fixtures no lo puede reportar.

export class McpVacio implements McpPort {
  readonly [ES_DOBLE] = true;
  async catalogo(): Promise<CatalogoMcp> {
    return { cloudstudio: [], ide: [] };
  }
  async invocar(tool: string): Promise<unknown> {
    throw new Error(
      `[DOBLE] No hay MCP: la tool «${tool}» no se ha ejecutado y el proyecto NO se ha tocado.`
    );
  }
  async cerrar(): Promise<void> {}
}

export class SkillsEnMemoria implements SkillsPort {
  readonly [ES_DOBLE] = true;
  constructor(private readonly contenido: Record<string, string> = {}) {}
  catalogo(): SkillInfo[] {
    return Object.keys(this.contenido).map((nombre) => ({
      nombre,
      descripcion: `[DOBLE] skill en memoria`,
      tokens: Math.ceil(this.contenido[nombre]!.length / 4),
    }));
  }
  cargar(nombre: string): string {
    const c = this.contenido[nombre];
    if (c === undefined) throw new Error(`[DOBLE] no hay skill «${nombre}» en memoria`);
    return c;
  }
}

export class ModeloGuionizado implements ModelosPort {
  readonly [ES_DOBLE] = true;
  constructor(private readonly respuestas: string[] = ["(respuesta guionizada)"]) {}
  paraPapel(): unknown {
    return { guion: this.respuestas };
  }
  descripcion(): Record<Papel, string> {
    return {
      rapido: "[DOBLE] guionizado",
      trabajo: "[DOBLE] guionizado",
      afilado: "[DOBLE] guionizado",
    };
  }
}

/** Catálogo determinista para recorrer la CLI sin red ni credenciales. */
export class CatalogoModelosEnMemoria implements CatalogoModelosPort {
  readonly [ES_DOBLE] = true;
  constructor(
    private readonly porProveedor: Partial<Record<Proveedor, ModeloDisponible[]>> = {}
  ) {}

  async listar(proveedor: Proveedor): Promise<ModeloDisponible[]> {
    return this.porProveedor[proveedor] ?? [];
  }
}

/**
 * Verificador que siempre dice verde.
 *
 * Peligroso a propósito: es el doble que más miente si nadie lo declara, porque un verde
 * falso deja pasar código roto. Por eso lleva la marca y por eso `describe` lo canta.
 */
export class StubVerifier implements VerifierPort {
  readonly [ES_DOBLE] = true;
  async verificar(): Promise<InformeVerificacion> {
    return { verde: true, hallazgos: [] };
  }
}

/** Verificador con guion, para recorrer el lazo de reparación sin LLM: [rojo, rojo, verde]. */
export class VerifierGuionizado implements VerifierPort {
  readonly [ES_DOBLE] = true;
  private i = 0;
  constructor(private readonly guion: InformeVerificacion[]) {}
  async verificar(): Promise<InformeVerificacion> {
    const r = this.guion[Math.min(this.i, this.guion.length - 1)]!;
    this.i++;
    return r;
  }
}

/**
 * El proyecto del cliente en CloudStudio.
 *
 * Modela lo MEDIDO contra el servidor, no lo que sería cómodo: el proyecto abierto es
 * estado de sesión que caduca (`abrir` se repite), la rama activa solo se sabe por
 * `contexto`, y la descarga completa es un ZIP entero que jamás pasa por el transcript.
 */
export interface CloudStudioPort {
  abrir(nombre: string): Promise<void>;
  contexto(): Promise<ContextoRemoto>;
  /** Devuelve el ZIP en base64. Puede fallar por un fichero roto en Studio. */
  descargarZip(): Promise<string>;
  estructura(directorio?: string): Promise<EstructuraRemota>;
  leerTexto(ruta: string): Promise<string>;
  escribirTexto(ruta: string, contenido: string): Promise<void>;
  borrarTexto(ruta: string): Promise<void>;
  subirBinario(ruta: string, datos: Uint8Array): Promise<void>;
  ramas(): Promise<string[]>;
  crearRama(nombre: string, desde: string): Promise<void>;
  cambiarRama(nombre: string): Promise<void>;
}

export interface OpcionesCloudStudioEnMemoria {
  rama?: string;
  textos?: Record<string, string>;
  binarios?: Record<string, number>;
  /** Motivo con el que `descargarZip` rechaza; ausente = el ZIP funciona. */
  zipFalla?: string;
  /** Tope de entradas por llamada, para reproducir el truncado del servidor real. */
  topeEstructura?: number;
  /** ZIP ya fabricado (por el test, fuera de la frontera) para que `descargarZip` lo devuelva. */
  zipBase64?: string;
}

/** El proyecto remoto en memoria: recorre el flujo entero sin red ni credenciales. */
export class CloudStudioEnMemoria implements CloudStudioPort {
  readonly [ES_DOBLE] = true;
  /** Lo escrito, para poder afirmar sobre ello en los tests. */
  readonly escrituras: Array<
    | { tipo: "texto"; ruta: string; bytes: number }
    | { tipo: "binario"; ruta: string; bytes: number }
    | { tipo: "borrado"; ruta: string }
  > = [];
  private abierto: string | undefined;
  private ramaActual: string;

  constructor(private readonly opciones: OpcionesCloudStudioEnMemoria = {}) {
    this.ramaActual = opciones.rama ?? "master";
  }

  async abrir(nombre: string): Promise<void> {
    this.abierto = nombre;
  }

  private exigirAbierto(): void {
    // El servidor real responde «No project is open»; el doble no puede ser más blando,
    // o el adaptador nunca ejercitaría su reapertura.
    if (this.abierto === undefined) throw new Error("No project is open");
  }

  async contexto(): Promise<ContextoRemoto> {
    this.exigirAbierto();
    return { proyecto: this.abierto!, rama: this.ramaActual };
  }

  async descargarZip(): Promise<string> {
    this.exigirAbierto();
    if (this.opciones.zipFalla !== undefined) throw new Error(this.opciones.zipFalla);
    if (this.opciones.zipBase64 === undefined) throw new Error("[DOBLE] falta `zipBase64`");
    return this.opciones.zipBase64;
  }

  async estructura(directorio = ""): Promise<EstructuraRemota> {
    this.exigirAbierto();
    const todas: EntradaRemota[] = [
      ...Object.entries(this.opciones.textos ?? {}).map(([ruta, texto]) => ({ ruta, bytes: texto.length })),
      ...Object.entries(this.opciones.binarios ?? {}).map(([ruta, bytes]) => ({ ruta, bytes })),
    ].filter((e) => directorio === "" || e.ruta.startsWith(`${directorio}/`));
    const tope = this.opciones.topeEstructura;
    const truncado = tope !== undefined && todas.length > tope;
    return { entradas: truncado ? todas.slice(0, tope) : todas, truncado };
  }

  async leerTexto(ruta: string): Promise<string> {
    this.exigirAbierto();
    const texto = this.opciones.textos?.[ruta];
    // El servidor rechaza por EXTENSIÓN, no por ausencia: el mensaje se replica para que
    // la vía degradada aprenda a distinguir «no existe» de «no se puede bajar así».
    if (texto === undefined) throw new Error(`File extension not allowed or missing: ${ruta}`);
    return texto;
  }

  async escribirTexto(ruta: string, contenido: string): Promise<void> {
    this.exigirAbierto();
    this.escrituras.push({ tipo: "texto", ruta, bytes: contenido.length });
  }

  async borrarTexto(ruta: string): Promise<void> {
    this.exigirAbierto();
    this.escrituras.push({ tipo: "borrado", ruta });
  }

  async subirBinario(ruta: string, datos: Uint8Array): Promise<void> {
    this.exigirAbierto();
    this.escrituras.push({ tipo: "binario", ruta, bytes: datos.byteLength });
  }

  async ramas(): Promise<string[]> {
    this.exigirAbierto();
    return [this.ramaActual];
  }

  async crearRama(nombre: string): Promise<void> {
    this.exigirAbierto();
    this.ramaActual = nombre;
  }

  async cambiarRama(nombre: string): Promise<void> {
    this.exigirAbierto();
    this.ramaActual = nombre;
  }
}
