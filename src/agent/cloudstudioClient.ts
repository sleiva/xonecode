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

/** El servidor pierde el proyecto abierto al caducar la sesión; lo dice con este texto. */
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

export function clienteCloudStudio(invocar: Invocar, proyecto: string): CloudStudioPort {
  /**
   * Una llamada que sobrevive a la caducidad: reabre y reintenta UNA vez. Una segunda
   * vuelta convertiría un servidor caído en un bucle silencioso.
   */
  const conSesion = async (nombre: string, argumentos: Record<string, unknown>): Promise<unknown> => {
    try {
      return await invocar(nombre, argumentos);
    } catch (error) {
      if (!SESION_PERDIDA.test((error as Error).message)) throw error;
      await invocar("studio_open_project", { project: proyecto });
      return invocar(nombre, argumentos);
    }
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
      await conSesion("studio_edit_file", { filePath: ruta, editMode: "delete" });
    },
    async subirBinario(ruta, datos) {
      // El modo lo decide `planDeSubida`; aquí solo se ejecuta el envío directo.
      await conSesion("studio_upload_file", {
        filePath: ruta,
        source: "base64",
        base64Content: Buffer.from(datos).toString("base64"),
      });
    },
    async ramas() {
      const bruto = await conSesion("studio_manage_branches", { operation: "list" });
      const lista = JSON.parse(texto(bruto) || JSON.stringify(bruto)) as unknown;
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
