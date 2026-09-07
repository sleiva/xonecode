import { statSync } from "node:fs";
import { join } from "node:path";
import { CompositeBackend, FilesystemBackend } from "deepagents";
import { RUTA_MEMORIA_INTERNA, RUTA_MEMORIA_VIRTUAL } from "./memoriaDeProyecto.js";
import { RAIZ_SKILLS } from "./skills.js";
import {
  artefactoFueraDeSitio,
  mimeDeArtefacto,
  nombreDeArtefacto,
  RUTA_ARTEFACTOS,
  type Artefacto,
} from "../core/artefactos.js";

/**
 * El backend del proyecto: confinado, y sin las vistas aplanadas.
 *
 * **`virtualMode: true` no es configurable.** Medido contra deepagents 1.13.2: con el
 * default (`false`) el backend LEYÓ una ruta absoluta de fuera de la raíz. La propia
 * librería lo dice de su default — «absolute paths and `..` can bypass rootDir».
 *
 * Y nada de `LocalShellBackend`: la librería avisa de que `virtualMode` **no restringe los
 * comandos de shell**. El simulador lo invoca el código de xonecode, no el modelo.
 */
export function backendDelProyecto(raiz: string): FilesystemBackend {
  return new FilesystemBackend({ rootDir: raiz, virtualMode: true });
}

/**
 * Añade las skills del harness como una ruta virtual de solo lectura del agente.
 *
 * El proyecto del usuario sigue siendo la raíz predeterminada. `/skills` apunta al
 * catálogo que se distribuye con xonecode: así SkillsMiddleware puede descubrir y
 * cargar bajo demanda cada `SKILL.md` sin conceder al modelo acceso al repositorio
 * del harness ni sacarlo de la raíz del proyecto.
 */
export function backendConSkills<T extends object>(backend: T): T {
  return new CompositeBackend(backend as never, {
    // La barra final importa: CompositeBackend la retira antes de delegar. Sin ella
    // reconstruye `//archify/...`, que FilesystemBackend interpreta fuera de su raíz.
    "/skills/": new FilesystemBackend({ rootDir: RAIZ_SKILLS, virtualMode: true }),
  }) as T;
}

/**
 * Cuelga `/artefactos/` de la carpeta de la SESIÓN, fuera del proyecto.
 *
 * El porqué está en `core/artefactos.ts`: hoy los diagramas del `mockup` acaban en la raíz
 * del proyecto y de ahí a git y a CloudStudio. Esto es el mismo mecanismo que `/skills/`
 * —otra raíz en el `CompositeBackend`— con dos diferencias que importan:
 *
 * - **Se puede ESCRIBIR.** `/skills/` está denegada en `permisosDe` porque son instrucciones
 *   del harness; esta es justamente donde el agente deja lo que produce.
 * - **Se APUNTA lo que se escribe.** El backend es el único sitio que sabe que una escritura
 *   ocurrió y cuánto pesó, y un artefacto que nadie nombra es un fichero en una carpeta que
 *   nadie abre. El Proxy va sobre el sub-backend y no sobre el compuesto: así solo ve lo de
 *   esta carpeta, sin filtrar las escrituras del proyecto por el mismo sitio.
 *
 * La carpeta **no se crea aquí**. Medido contra deepagents: `FilesystemBackend` no exige que
 * su `rootDir` exista y el `write` lo crea. Crearla al montar dejaría un `artefactos/` vacío
 * en cada sesión que no dibuja nada, que es la mayoría.
 */
export function backendConArtefactos<T extends object>(
  backend: T,
  carpeta: string,
  alEscribir: (artefacto: Artefacto) => void,
): T {
  const destino = new FilesystemBackend({ rootDir: carpeta, virtualMode: true });

  const anotado = new Proxy(destino, {
    get(objetivo, prop, receptor) {
      const valor = Reflect.get(objetivo, prop, receptor);
      if (typeof valor !== "function") return valor;
      if (prop !== "write" && prop !== "edit") {
        return (valor as (...a: unknown[]) => unknown).bind(objetivo);
      }
      return async (...args: unknown[]) => {
        const resultado = await (valor as (...a: unknown[]) => unknown).apply(objetivo, args);
        // La ruta que llega aquí ya viene sin el prefijo (`CompositeBackend` lo retira antes
        // de delegar), así que se rehace para que lo apuntado sea lo que el agente escribió
        // y lo que después se le pide al lector.
        const relativa = String(args[0] ?? "").replace(/^\/+/, "");
        const ruta = RUTA_ARTEFACTOS + relativa;
        const nombre = nombreDeArtefacto(ruta);
        const mime = mimeDeArtefacto(nombre);
        // El tamaño se mide del DISCO y no del argumento: por aquí pasa también `edit`,
        // cuyo segundo argumento es el texto a sustituir y no el fichero resultante.
        let bytes = 0;
        try {
          bytes = statSync(join(carpeta, relativa)).size;
        } catch {
          // Si no se puede medir, se dice cero: es un dato de adorno, no la existencia.
        }
        alEscribir({ ruta, nombre, bytes, ...(mime === undefined ? {} : { mime }) });
        return resultado;
      };
    },
  });

  return new CompositeBackend(backend as never, { [RUTA_ARTEFACTOS]: anotado as never }) as T;
}

/**
 * El backend con el que el agente ve el proyecto, compuesto entero.
 *
 * Vivía dentro de `construirAgente`, y eso dejaba sin probar justo la parte que decide si
 * las reglas están puestas: los tests de este fichero comprobaban cada envoltorio por
 * separado y `construirAgente` se simula en todos los suyos, así que **el cableado no lo
 * miraba nadie**. Una regla que existe y no está montada es peor que no tenerla, porque
 * hay un test en verde diciendo que sí.
 *
 * El orden es lo que hay que leer aquí:
 * 1. La raíz confinada (`virtualMode`), con la memoria del proyecto expuesta por su ruta
 *    virtual.
 * 2. Las dos reglas del PROYECTO: las vistas aplanadas no existen, y un artefacto no se
 *    puede escribir dentro.
 * 3. `/skills/` colgada, de solo lectura por `permisosDe`.
 * 4. Y `/artefactos/` colgada por FUERA, que es lo que hace que escribir ahí no pase por la
 *    guarda de (2) — son dos raíces distintas del mismo compuesto.
 */
export function backendDeAgente(opciones: {
  raiz: string;
  ficheros: ReadonlySet<string>;
  artefactos?: { carpeta: string; alEscribir: (artefacto: Artefacto) => void };
}): FilesystemBackend {
  const delProyecto = sinArtefactosEnElProyecto(
    sinVistasAplanadas(exponerMemoriaDeProyecto(backendDelProyecto(opciones.raiz)), opciones.ficheros)
  );
  const conSkills = backendConSkills(delProyecto);
  return opciones.artefactos === undefined
    ? conSkills
    : backendConArtefactos(conSkills, opciones.artefactos.carpeta, opciones.artefactos.alEscribir);
}

/**
 * Expone la memoria del proyecto sin abrir la carpeta interna `.xonecode`.
 *
 * Los permisos siguen denegando esa carpeta completa (puede contener configuración), pero
 * esta única ruta virtual permite al agente conservar decisiones aprobadas entre sesiones.
 */
export function exponerMemoriaDeProyecto<T extends object>(backend: T): T {
  const rutaReal = (ruta: unknown): unknown => ruta === RUTA_MEMORIA_VIRTUAL ? RUTA_MEMORIA_INTERNA : ruta;

  return new Proxy(backend, {
    get(destino, prop, receptor) {
      const valor = Reflect.get(destino, prop, receptor);
      if (typeof valor !== "function") return valor;

      if (prop === "read" || prop === "readRaw" || prop === "write" || prop === "edit") {
        return async (...args: unknown[]) => {
          args[0] = rutaReal(args[0]);
          return (valor as (...a: unknown[]) => unknown).apply(destino, args);
        };
      }

      return (valor as (...a: unknown[]) => unknown).bind(destino);
    },
  }) as T;
}

/**
 * El motivo con el que se rechaza escribir un artefacto en el proyecto.
 *
 * Mismo criterio que `porQueNo`: rechazar y EXPLICAR. Un error seco haría que el modelo
 * probara otra ruta —o que diera el trabajo por hecho—; diciéndole la ruta buena, corrige a
 * la primera. Y nombra las tres consecuencias porque son el porqué: sin ellas, «usa otra
 * carpeta» se lee como una preferencia de estilo.
 */
export const porQueNoAhi = (ruta: string, destino: string): string =>
  `«${ruta}» está en el PROYECTO, y un artefacto ahí acaba dentro de la app XOne del usuario: ` +
  `pasa por aprobación humana, entra en git y sube a CloudStudio. ` +
  `Los artefactos van en «${destino}», la carpeta de ESTA sesión: se escribe sin aprobación, ` +
  `no entra en git y no sale de aquí. Escríbelo ahí.`;

/**
 * Envuelve el backend del proyecto para que un artefacto NO se pueda escribir dentro.
 *
 * **Por qué es código y no una frase más en el prompt.** La carpeta buena ya la nombran los
 * cuatro sitios que el modelo puede leer, y aun así, medido el 2026-09-07 en dos
 * delegaciones consecutivas del mismo proyecto: la primera escribió
 * `/artifacts/login_flow.html` —la raíz— y la segunda `/artefactos/diagrama.html`. Con la
 * instrucción puesta en los cuatro sitios, añadir un quinto no cambia nada; lo que cambia es
 * que la regla deje de depender de que el modelo la recuerde. Es exactamente el argumento de
 * `sinVistasAplanadas`, y también el de los avisos de honestidad: en este repo lo que tiene
 * que cumplirse es código.
 *
 * Va sobre el backend del PROYECTO, por dentro del compuesto, así que una escritura en
 * `/artefactos/` —que es otra raíz montada— no pasa por aquí y no se ve afectada.
 *
 * **Solo `write` y `edit`.** Leer un artefacto mal puesto de una sesión anterior tiene que
 * seguir funcionando: si no, el agente no podría ni mirar lo que hay que mover. Y borrarlo
 * tampoco se toca — quitar de la app del cliente un diagrama que no debería estar ahí es
 * justo lo que se quiere poder hacer.
 */
export function sinArtefactosEnElProyecto<T extends object>(backend: T): T {
  const motivo = (ruta: unknown): string | undefined => {
    if (typeof ruta !== "string") return undefined;
    const destino = artefactoFueraDeSitio(ruta);
    return destino === undefined ? undefined : porQueNoAhi(ruta, destino);
  };

  return new Proxy(backend, {
    get(destino, prop, receptor) {
      const valor = Reflect.get(destino, prop, receptor);
      if (typeof valor !== "function") return valor;
      if (prop !== "write" && prop !== "edit") {
        return (valor as (...a: unknown[]) => unknown).bind(destino);
      }
      return async (...args: unknown[]) => {
        // **Se DEVUELVE `{error}`, no se lanza**, y esta es la diferencia entre corregir al
        // modelo y tumbarle el turno. Leído en deepagents 1.13.2: los cuatro tools de
        // fichero hacen `const result = await backend.write(...); if (result.error) return
        // result.error`, así que un error DEVUELTO vuelve al modelo como resultado de la
        // tool y puede reintentar. Un `throw` se sale de la tool y se lleva el turno por
        // delante — medido en vivo el 2026-09-07: el mensaje salió impecable en el chat, el
        // fichero no se escribió, y el agente no reintentó porque el turno ya había muerto.
        const porQue = motivo(args[0]);
        if (porQue !== undefined) return { error: porQue };
        return (valor as (...a: unknown[]) => unknown).apply(destino, args);
      };
    },
  }) as T;
}

/** ¿Es `ruta` una vista aplanada, teniendo a la vista el conjunto de ficheros del proyecto? */
export function esVistaAplanada(ruta: string, todas: ReadonlySet<string>): boolean {
  return ruta.endsWith(".xml") && todas.has(`${ruta.slice(0, -4)}.xne`);
}

/**
 * El mensaje con el que se rechaza tocar una vista aplanada.
 *
 * **Rechazar y explicar, no fallar en seco.** Un «fichero no encontrado» hace que el modelo
 * pruebe otra ruta, o peor, que dé por hecho que el cambio no hacía falta. Diciéndole dónde
 * está la fuente puede corregir — pero solo si el mensaje LLEGA, y para eso hay que
 * devolverlo como `{error}` y no lanzarlo (ver `sinVistasAplanadas`).
 */
export const porQueNo = (ruta: string): string =>
  `«${ruta}» es una vista APLANADA que genera XOne Studio a partir de «${ruta.slice(0, -4)}.xne». ` +
  `No se lee ni se edita: los cambios se hacen en el .xne y Studio regenera esta. ` +
  `Abre «${ruta.slice(0, -4)}.xne».`;

/**
 * Envuelve un backend para que las vistas aplanadas no existan para el agente.
 *
 * **Por qué no basta con decirlo en el prompt.** La regla ya vivía ahí en el harness
 * anterior, solo en el del ejecutor, y falló por donde tenía que fallar: *un permiso solo
 * protege a quien lo choca*. El planner planificaba sobre el `.xml` y el juez exigía el
 * cambio ahí — ninguno de los dos podía conocer una regla que vivía en otro prompt.
 * Retirarlas del backend la convierte en una propiedad del PROYECTO, no de un prompt.
 *
 * **Se ocultan, no se borran.** El disco es del usuario. (El harness con MCP sí las
 * borraba de su copia, pero aquella copia era suya y se tiraba al final.)
 *
 * `app.xml` no tiene hermano `.xne`, así que el propio predicado lo conserva: es fuente.
 */
export function sinVistasAplanadas<T extends object>(backend: T, todas: ReadonlySet<string>): T {
  const motivo = (ruta: unknown): string | undefined =>
    typeof ruta === "string" && esVistaAplanada(ruta, todas) ? porQueNo(ruta) : undefined;

  return new Proxy(backend, {
    get(destino, prop, receptor) {
      const valor = Reflect.get(destino, prop, receptor);
      if (typeof valor !== "function") return valor;

      // Las que reciben una ruta y la tocan: se rechazan con explicación.
      if (prop === "read" || prop === "readRaw" || prop === "write" || prop === "edit" || prop === "delete") {
        return async (...args: unknown[]) => {
          // **Devolver `{error}` y no lanzar.** Esto LANZABA, y el comentario de al lado
          // prometía que así el modelo «corrige a la primera» — que era falso y no estaba
          // medido. Leído en deepagents 1.13.2, los cuatro tools de fichero comprueban
          // `result.error` y lo devuelven al modelo; una excepción, en cambio, se sale de la
          // tool y se lleva el turno. Medido en vivo con la guarda hermana
          // (`sinArtefactosEnElProyecto`): mensaje impecable en el chat, fichero no escrito,
          // y ningún reintento porque el turno ya había muerto.
          const porQue = motivo(args[0]);
          if (porQue !== undefined) return { error: porQue };
          return (valor as (...a: unknown[]) => unknown).apply(destino, args);
        };
      }

      // Las que LISTAN: se filtra el resultado, para que ni aparezcan.
      if (prop === "ls" || prop === "grep") {
        return async (...args: unknown[]) => {
          const r = await (valor as (...a: unknown[]) => Promise<unknown>).apply(destino, args);
          return filtrarResultado(r, todas);
        };
      }

      return (valor as (...a: unknown[]) => unknown).bind(destino);
    },
  }) as T;
}

/**
 * Quita las vistas aplanadas de lo que devuelve un `ls`/`grep`.
 *
 * La forma del resultado varía entre versiones de la librería, así que se filtra lo que se
 * reconoce y lo que no se deja pasar TAL CUAL: perder resultados en silencio sería peor que
 * enseñar un `.xml` de más, y esto no es la barrera —la barrera es la guarda de arriba—.
 */
function filtrarResultado(r: unknown, todas: ReadonlySet<string>): unknown {
  const quita = (v: unknown): boolean => typeof v === "string" && esVistaAplanada(v, todas);
  if (Array.isArray(r)) return r.filter((v) => !quita(v));
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    const salida: Record<string, unknown> = { ...o };
    for (const clave of ["files", "matches", "paths", "results", "entries"]) {
      if (Array.isArray(o[clave])) {
        salida[clave] = (o[clave] as unknown[]).filter((v) => {
          if (quita(v)) return false;
          if (v && typeof v === "object") {
            const f = (v as Record<string, unknown>).file ?? (v as Record<string, unknown>).path;
            return !quita(f);
          }
          return true;
        });
      }
    }
    return salida;
  }
  return r;
}
