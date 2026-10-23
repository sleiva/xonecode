/**
 * Instalar el framework de XOne en un Android: UNA función para las tres puertas —el botón de Ajustes,
 * el de Ejecutar y la tool del agente—, que devuelve un `Trabajo` como los de las recetas para correr
 * por el MISMO cerrojo de la máquina (`arranque.ts#correrTrabajo`).
 *
 * En orden, y cada paso con su NO:
 * 1. Si la versión es del catálogo, se baja a la copia local (`byxoneEnRed.ts`), comprobada. Sin
 *    permiso para descargar (una tarea de fondo) o sin credencial, es un fallo con su motivo.
 * 2. **El paquete se mira ANTES de instalar**, leído del manifiesto del propio APK: uno del otro
 *    flavor quedaría AL LADO del estándar, y dos frameworks se pelean por el puerto del canal.
 * 3. `adb -s <serie> install -r -g <apk>`. **`-r` y nunca desinstalar**: desinstalar borraría los
 *    datos de las apps del aparato. `-g` concede los permisos de ejecución, como el despliegue.
 *    `-d` (bajar de versión) solo si se pide a propósito.
 * 4. Un fallo de `adb` se dice con la frase que dice qué hacer (`motivoDeFalloDeInstalacion`).
 *
 * Nunca lanza: todo vuelve como `ResultadoDeTrabajo`.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { motivoDeFalloDeInstalacion, motivoDePaqueteInaceptable, type FrameworkLocal } from "../../core/frameworkLocal.js";
import type { ClienteByxone } from "./byxoneEnRed.js";
import { localizadorDeAndroid } from "./dispositivosEnMaquina.js";
import { paqueteDeApk, rutaDeApk } from "./frameworkEnDisco.js";
import type { DependenciasDeInstalacion, ResultadoDeTrabajo, Trabajo } from "./instalacionEnMaquina.js";
import { crearEjecutor, TOPE_SIN_SALIDA_MS } from "./procesosEnMaquina.js";

/** Qué se instala, ya resuelto contra la lista servida: nunca una URL. */
export type VersionAInstalar =
  | { origen: "local"; local: FrameworkLocal }
  | { origen: "catalogo"; ficheroId: number; titulo: string };

export interface PeticionDeInstalarFramework {
  serie: string;
  /** Cómo se llama el aparato, para el título del trabajo. */
  nombre: string;
  version: VersionAInstalar;
  /** Falso en una tarea de fondo: allí solo se instala lo que ya está en local. */
  puedeDescargar: boolean;
  /** Bajar de versión a propósito (`adb install -d`). */
  bajarVersion?: boolean;
  /** Sin credencial no hay cliente, y una versión del catálogo no se puede bajar. */
  cliente?: ClienteByxone;
  casa?: string;
}

export function instalarFramework(peticion: PeticionDeInstalarFramework, deps: DependenciasDeInstalacion = {}): Trabajo {
  const titulo =
    peticion.version.origen === "local"
      ? `Instalando el framework ${peticion.version.local.titulo} en «${peticion.nombre}»`
      : `Descargando e instalando el framework ${peticion.version.titulo} en «${peticion.nombre}»`;
  const ahora = deps.ahora ?? (() => Date.now());
  const t0 = ahora();
  const decir = (linea: string): void => deps.alSalirLinea?.(linea);
  const termina = (estado: ResultadoDeTrabajo["estado"], motivo?: string): ResultadoDeTrabajo => ({
    estado,
    ...(motivo === undefined ? {} : { motivo }),
    ms: ahora() - t0,
  });

  const abortador = new AbortController();
  const ejecutor = crearEjecutor({ lanzar: deps.lanzar, matarGrupo: deps.matarGrupo, entorno: deps.entorno ?? process.env });

  const terminado = (async (): Promise<ResultadoDeTrabajo> => {
    const { enSdk } = localizadorDeAndroid({
      plataforma: deps.plataforma ?? process.platform,
      entorno: deps.entorno ?? process.env,
      home: deps.home ?? homedir(),
      existe: deps.existe ?? existsSync,
    });
    const adb = enSdk("adb", "platform-tools");
    if (adb === undefined) return termina("fallo", "falta adb: instala las herramientas de Android en Ajustes → Dispositivos");

    // 1. La copia local, bajándola si hace falta.
    let local: FrameworkLocal;
    if (peticion.version.origen === "local") {
      local = peticion.version.local;
    } else {
      if (!peticion.puedeDescargar) {
        return termina("fallo", "no hay ninguna versión del framework descargada, y aquí no se descarga: instálala desde Ajustes → Dispositivos");
      }
      if (peticion.cliente === undefined) {
        return termina("fallo", "sin credencial de byXOne no se puede descargar: instala una versión ya descargada");
      }
      const bajada = await peticion.cliente.descargarApk(peticion.version.ficheroId, peticion.version.titulo, {
        alSalirLinea: decir,
        senal: abortador.signal,
      });
      if (abortador.signal.aborted) return termina("cancelada");
      if (!bajada.ok) return termina("fallo", bajada.motivo);
      local = bajada.valor;
    }

    // 2. El paquete, del APK que de verdad se va a instalar (no del índice: el fichero manda).
    const ruta = rutaDeApk(local.sha256, peticion.casa);
    // Con el disco DE VERDAD: `deps.existe` es para localizar el SDK, y la copia local es nuestra.
    if (!existsSync(ruta)) return termina("fallo", `la versión ${local.titulo} ya no está en la copia local: vuelve a descargarla`);
    const motivoDelPaquete = motivoDePaqueteInaceptable(paqueteDeApk(ruta));
    if (motivoDelPaquete !== undefined) return termina("fallo", motivoDelPaquete);

    // 3. adb install, sin desinstalar nunca.
    if (abortador.signal.aborted) return termina("cancelada");
    decir(`instalando ${local.titulo}…`);
    const salida: string[] = [];
    const args = ["-s", peticion.serie, "install", "-r", "-g", ...(peticion.bajarVersion === true ? ["-d"] : []), ruta];
    // **Ninguna ruta de la máquina viaja por el cable**: `adb` repite la del APK al fallar
    // («failed to install <ruta>/<sha>.apk»), y el motivo de un spawn fallido lleva la suya.
    const sinRutas = (texto: string): string => texto.split(ruta).join(`${local.titulo}.apk`).split(adb).join("adb");
    const fin = await ejecutor.correr(adb, args, {
      alSalirLinea: (bruta) => {
        const linea = sinRutas(bruta);
        salida.push(linea);
        decir(linea);
      },
    });
    if (fin.estado === "ok") {
      // `adb install` sale con 0 en algunos fallos viejos: la palabra que manda es la suya.
      if (salida.some((l) => /^\s*Failure\b/.test(l))) return termina("fallo", motivoDeFalloDeInstalacion(salida.join("\n")));
      decir(`framework ${local.titulo} instalado`);
      return termina("ok");
    }
    if (fin.estado === "cancelada") return termina("cancelada");
    if (fin.estado === "colgada") return termina("colgada", `adb no dijo nada en ${Math.round(TOPE_SIN_SALIDA_MS / 60_000)} min`);
    // 4. El fallo, con la frase que dice qué hacer.
    return termina("fallo", motivoDeFalloDeInstalacion([...salida, sinRutas(fin.motivo)].join("\n")));
  })();

  return {
    titulo,
    cancelar: () => {
      abortador.abort();
      ejecutor.cancelar();
    },
    terminado,
  };
}
