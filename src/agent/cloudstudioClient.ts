/**
 * `CloudStudioPort` sobre el MCP real.
 *
 * La costura es una función `invocar`, no el `Client` del SDK: así los tests prueban el
 * comportamiento —reapertura, desenvoltura, argumentos— sin red ni SDK. La sesión viva
 * que produce ese `invocar` la construye `sesionCloudStudio` (`agent/cloudstudioMcp.ts`);
 * este módulo no abre nada por su cuenta.
 */
import type { CloudStudioPort } from "../core/ports.js";
import type { ContextoRemoto, EstructuraRemota, ManifiestoRemoto } from "../core/cloudstudio.js";

export interface LlamadaMcp {
  nombre: string;
  argumentos: Record<string, unknown>;
}

export type Invocar = (nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>;

/**
 * El servidor pierde el proyecto abierto al caducar la sesión, y lo dice de DOS formas.
 *
 * A veces como error de tool (`isError: true`), que `invocarSobre` convierte en excepción.
 * Y a veces —medido contra el servidor real— como una respuesta CORRECTA cuyo contenido de
 * texto es «Error: No project is open…». Esa segunda es la que se colaba: nadie miraba el
 * resultado, así que la reapertura no se disparaba y el texto seguía camino hasta el
 * `JSON.parse` de quien lo llamó, que reventaba con «Unexpected token 'E'». Un fallo de
 * sesión disfrazado de fallo de formato.
 */
const SESION_PERDIDA = /no project is open/i;

/** Los SDK MCP envuelven el resultado en `content[].text`. */
function texto(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (typeof valor === "object" && valor !== null) {
    const contenido = (valor as Record<string, unknown>).content;
    if (Array.isArray(contenido)) {
      return contenido
        .filter((b): b is { type: string; text: string } =>
          typeof b === "object" && b !== null && (b as { type?: string }).type === "text")
        .map((b) => b.text)
        .join("");
    }
  }
  return "";
}

/** Desenvuelve y parsea como JSON; si no hay nada que parsear, el objeto crudo. */
function registro(valor: unknown): Record<string, unknown> {
  if (typeof valor === "string") {
    try { return JSON.parse(valor) as Record<string, unknown>; } catch { return {}; }
  }
  const desenvuelto = texto(valor);
  if (desenvuelto !== "") {
    try { return JSON.parse(desenvuelto) as Record<string, unknown>; } catch { /* sigue abajo */ }
  }
  return typeof valor === "object" && valor !== null ? valor as Record<string, unknown> : {};
}

/** Cuánto del cuerpo remoto se deja ver en un error de formato: lo justo para reconocerlo. */
const TOPE_DE_MUESTRA = 120;

/**
 * JSON, o un error que dice quién contestó y con qué.
 *
 * La alternativa —`JSON.parse` a secas— produce un `SyntaxError` que no nombra la tool ni
 * el contexto: «Unexpected token 'E', "Error: No "... is not valid JSON» fue justo el
 * mensaje que llegó a la interfaz cuando lo que pasaba era que la sesión estaba caída.
 */
function comoJson(bruto: string, tool: string): unknown {
  try {
    return JSON.parse(bruto) as unknown;
  } catch {
    const muestra = bruto.length > TOPE_DE_MUESTRA ? `${bruto.slice(0, TOPE_DE_MUESTRA)}…` : bruto;
    throw new Error(`${tool} no devolvió JSON: «${muestra}»`);
  }
}

/**
 * @param nombreDeProyecto El NOMBRE del proyecto, nunca su id. El servidor abre por nombre y
 * rechaza el identificador («not found for user», medido), y este valor es el que usa la
 * reapertura automática de `conSesion`. Pasarle el id daba un bucle sordo: se reabría con
 * algo que el servidor no encuentra, la tool volvía a decir «no project is open», y el
 * error hablaba de la tool y no del argumento equivocado.
 */
export function clienteCloudStudio(invocar: Invocar, nombreDeProyecto: string): CloudStudioPort {
  const proyecto = nombreDeProyecto;
  /**
   * Una llamada que sobrevive a la caducidad: reabre y reintenta UNA vez. Una segunda
   * vuelta convertiría un servidor caído en un bucle silencioso.
   *
   * Mira las DOS formas en que el servidor dice que perdió el proyecto (ver
   * `SESION_PERDIDA`): la excepción y el texto de una respuesta por lo demás correcta. Y
   * después de reabrir vuelve a mirar: si sigue diciendo lo mismo, se lanza con el nombre
   * de la tool delante en vez de devolver ese texto a quien llamó — devolverlo es como
   * acabó siendo un error de JSON en la interfaz.
   */
  const conSesion = async (nombre: string, argumentos: Record<string, unknown>): Promise<unknown> => {
    let perdida = false;
    try {
      const resultado = await invocar(nombre, argumentos);
      if (!SESION_PERDIDA.test(texto(resultado))) return resultado;
      perdida = true;
    } catch (error) {
      if (!SESION_PERDIDA.test((error as Error).message)) throw error;
      perdida = true;
    }
    if (!perdida) throw new Error(`${nombre}: no se pudo determinar el estado de la sesión`);

    // Reabrir es transparente a propósito: quien llamó pidió `studio_get_file`, no
    // gestionar una sesión. Lo único que no se puede hacer transparente es que falle otra
    // vez, y eso se dice.
    await invocar("studio_open_project", { project: proyecto });
    const reintento = await invocar(nombre, argumentos);
    if (SESION_PERDIDA.test(texto(reintento))) {
      throw new Error(
        `${nombre}: CloudStudio sigue diciendo que no hay proyecto abierto después de reabrir «${proyecto}»`
      );
    }
    return reintento;
  };

  const entradasDeArbol = (arbol: Record<string, unknown>): ManifiestoRemoto => {
    const salida: ManifiestoRemoto = [];
    const recorrer = (nodo: unknown): void => {
      if (typeof nodo !== "object" || nodo === null) return;
      const n = nodo as Record<string, unknown>;
      if (n.type === "file" && typeof n.path === "string") {
        salida.push({ ruta: n.path, bytes: typeof n.size === "number" ? n.size : 0 });
      }
      if (Array.isArray(n.children)) for (const hijo of n.children) recorrer(hijo);
    };
    recorrer(arbol.tree ?? arbol);
    return salida;
  };

  return {
    async abrir(nombre) {
      // Por NOMBRE: medido, el servidor rechaza el identificador («not found for user»).
      await invocar("studio_open_project", { project: nombre });
    },
    async contexto(): Promise<ContextoRemoto> {
      const r = registro(await conSesion("studio_get_context", {}));
      return { proyecto: String(r.project ?? ""), rama: String(r.branch ?? "") };
    },
    async descargarZip() {
      const r = registro(await conSesion("studio_download_project", { unified: false }));
      const zip = r.base64Zip;
      if (typeof zip !== "string" || zip === "") throw new Error("CloudStudio no devolvió el ZIP del proyecto");
      return zip;
    },
    async estructura(directorio): Promise<EstructuraRemota> {
      const arbol = registro(await conSesion("studio_get_project_structure", {
        mode: "filesystem",
        maxFiles: 2000,
        ...(directorio === undefined || directorio === "" ? {} : { directoryPath: directorio }),
      }));
      // El servidor manda `truncated` en la raíz del objeto (medido: con `maxFiles:60`
      // ya venía `true`). Tirarlo aquí sería repetir el mismo error que obligó a que el
      // puerto entero informara del recorte: el manifiesto sostiene el candado de borrado.
      return { entradas: entradasDeArbol(arbol), truncado: arbol.truncated === true };
    },
    async leerTexto(ruta) {
      const bruto = await conSesion("studio_get_file", { filePath: ruta });
      const desenvuelto = texto(bruto);
      return desenvuelto !== "" ? desenvuelto : typeof bruto === "string" ? bruto : "";
    },
    async escribirTexto(ruta, contenido) {
      await conSesion("studio_edit_file", { filePath: ruta, content: contenido, editMode: "replace" });
    },
    async borrarTexto(ruta) {
      // `studio_edit_file` es una tool de TEXTO: no hay borrado de binarios por MCP. Ese
      // caso tampoco llega hasta aquí — `planDeSubida` lo declara imposible y lo saca del
      // plan, con un motivo que le dice al usuario que lo borre en Studio a mano.
      await conSesion("studio_edit_file", { filePath: ruta, editMode: "delete" });
    },
    async subirBinario(ruta, datos) {
      // `base64` es el ÚNICO modo que xonecode implementa, y el puerto ni siquiera lleva
      // el campo: el `chunked` del servidor no está enchufado. Por eso `planDeSubida`
      // declara IMPOSIBLE —y saca del plan— cualquier binario por encima de
      // `TOPE_BASE64`, en vez de mandarlo aquí a fallar. Si algún día se implementa el
      // troceado, este es el sitio, y `OperacionDeSubida` vuelve a tener dos modos.
      await conSesion("studio_upload_file", {
        filePath: ruta,
        source: "base64",
        base64Content: Buffer.from(datos).toString("base64"),
      });
    },
    async ramas() {
      const bruto = await conSesion("studio_manage_branches", { operation: "list" });
      // `JSON.parse` a pelo era lo que convertía cualquier respuesta inesperada en un
      // «Unexpected token …» sin nombre de tool ni pista: el error que se veía en la
      // interfaz hablaba de JSON cuando el problema era la sesión. Aquí se falla diciendo
      // QUÉ tool contestó y CON QUÉ, acotado.
      const lista = comoJson(texto(bruto) || JSON.stringify(bruto), "studio_manage_branches");
      return Array.isArray(lista)
        ? lista.flatMap((r) => typeof r === "object" && r !== null && typeof (r as { Key?: unknown }).Key === "string"
            ? [(r as { Key: string }).Key] : [])
        : [];
    },
    async crearRama(nombre, desde) {
      await conSesion("studio_manage_branches", { operation: "create", branchName: nombre, targetBranch: desde });
    },
    async cambiarRama(nombre) {
      await conSesion("studio_manage_branches", { operation: "switch", branchName: nombre });
    },
  };
}
