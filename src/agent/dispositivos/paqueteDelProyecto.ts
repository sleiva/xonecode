/**
 * El paquete que se sube a un dispositivo: el ZIP del proyecto, montado EN MEMORIA.
 *
 * El nombre `debug_app_update.zip` es el de la query del endpoint de hotswap, no el de un
 * fichero temporal: aquí no se escribe nada en disco. Son los bytes que se le pasan al
 * `file_upload`, y por eso el recorrido es síncrono y sin puertos — no hay red, no hay
 * simulador y `npm test` puede montar un proyecto de mentira en un temporal.
 *
 * Las reglas del filtro, y las que se REUTILIZAN en vez de reescribirse:
 *
 * - **`.xonecode/**` y `.git/**` los corta `puedeLeerRuta`** (`agent/grafo/perfiles.ts`), la
 *   misma barrera que usan las tools propias y el lector de la pestaña Ficheros. Un
 *   segundo `startsWith` aquí sería el segundo sitio donde esa regla puede dejar de estar.
 * - **La basura del SO también sale, con la misma constante que la de git**
 *   (`BASURA_DEL_SO`): el motivo, abajo, en `nombreQueNoViaja`.
 * - **Las vistas aplanadas SÍ entran.** Lo que `esVistaAplanada` protege es el fichero que
 *   el agente puede EDITAR —el `.xne` es la fuente, el `.xml` lo regenera XOne Studio—,
 *   no lo que la app necesita tener al lado en el dispositivo. Filtrarlas aquí dejaría la
 *   app rota por un fichero que el framework espera encontrar.
 * - **`bd/` no viaja, y no es por ahorrar: es por no romper nada.** Tres razones, la
 *   primera medida en este repo: (1) `bd/gestion.db` lo genera el simulador FUERA de
 *   xonecode —lo que hay en el proyecto es la copia de haberlo arrancado aquí, no la
 *   fuente—; (2) la base del dispositivo va cifrada con SQLCipher, así que subir un `.db`
 *   en claro termina en `database disk image is malformed (code 11)`; y (3) **el ZIP no
 *   limpia el destino** —añade y sobrescribe—, de modo que los `-wal`/`-shm` de la base
 *   vieja se quedan ahí y mezclar dos bases deja un estado que la app descubre al
 *   arrancar. La app que se prueba **ya tiene su base en el dispositivo**: lo que se
 *   despliega es el código, no los datos. Por eso el tope por NOMBRE —`*.db` y sus
 *   auxiliares, `db.key`— vale en cualquier carpeta y no solo dentro de `bd/`: una base
 *   suelta en `files/` es la misma base.
 */
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import { BASURA_DEL_SO } from "../sesiones/gitSync.js";
import { puedeLeerRuta } from "../grafo/perfiles.js";

/** Bytes a partir de los cuales el endpoint contesta `413` y no se sube nada. */
export const TOPE_DE_PAQUETE = 512 * 1024 * 1024;

/**
 * Nivel de deflate. El 6 y no el 9: lo que más pesa en un proyecto XOne son las imágenes,
 * y un PNG o un JPG no comprimen mejor con más esfuerzo —el 9 se gasta segundos de CPU en
 * intentarlo delante de una persona que acaba de pulsar «subir»—.
 */
const NIVEL_DE_COMPRESION = 6;

/** La fecha más antigua que el formato ZIP sabe escribir (ver `fechaDelZip`). */
const FECHA_MINIMA_DEL_ZIP = Date.UTC(1980, 0, 1);

export interface PaqueteDelProyecto {
  /** El ZIP entero, en memoria: es el cuerpo de la subida. */
  bytes: Uint8Array;
  /** Lo que entró, relativo a la raíz, en POSIX y ordenado. */
  ficheros: string[];
  /**
   * Lo que SUMAN los ficheros que entraron, en disco: es la cifra que vigila el tope y la
   * que tiene sentido enseñar junto a la lista. No es `bytes.length` — el ZIP pesa menos
   * que su contenido, y cuánto menos depende de lo que ya venía comprimido.
   */
  total: number;
}

/** Un fichero que viaja, con lo que hace falta para leerlo y para fecharlo. */
interface Candidato {
  /** Como se escribe dentro del ZIP: relativa a la raíz y en POSIX. */
  ruta: string;
  absoluta: string;
  bytes: number;
  mtime: number;
}

/** El `.db` de SQLite y sus dos auxiliares del WAL y el `journal` de rollback. */
const BASE_SQLITE = /\.db(-wal|-shm|-journal)?$/i;

/**
 * Los nombres que no viajan aunque estén sueltos, fuera de `bd/`.
 *
 * **La basura del SO es LA MISMA constante que usa la exclusión de git** (`BASURA_DEL_SO`,
 * `agent/sesiones/gitSync.ts`), no una copia con los tres nombres escritos otra vez: una segunda
 * lista divergiría el día que se añada el cuarto, y ese día el fichero del Finder volvería
 * a colarse —en el repo o en la app del cliente, según cuál de las dos se actualizara—.
 *
 * Y aquí hace más falta que allí, si cabe: el ZIP aterriza en `app_<nombre>/` **del
 * dispositivo**, así que un `.DS_Store` que entre no se queda en una carpeta de trabajo,
 * se despliega en la app del cliente. Es la misma razón por la que el repo lo saca del
 * índice —`.gitignore` es un fichero del proyecto y subirlo acaba igual— aplicada al
 * paquete en vez de al repo.
 */
function nombreQueNoViaja(nombre: string): boolean {
  if (BASE_SQLITE.test(nombre) || nombre === "db.key") return true;
  return (BASURA_DEL_SO as readonly string[]).includes(nombre);
}

/**
 * Si una ruta del proyecto viaja al dispositivo. Se pregunta por la ruta VIRTUAL —con `/`
 * delante y relativa a la raíz—, que es la forma que esperan `puedeLeerRuta`,
 * `arbolDeProyecto` y `escrituraExterna`.
 *
 * Vale para ficheros Y para carpetas, y ahí está lo único que hay que saber: una carpeta
 * que no viaja se PODA entera. Filtrar hojas una a una dejaría entrar
 * `datos.db/informe.xml` —el nombre del fichero no dice nada de la carpeta que lo
 * contiene—, y recorrer `.git/` entero para tirar sus miles de objetos de uno en uno es
 * trabajo tirado. La regla es la misma en los dos sitios a propósito: un segundo predicado
 * para carpetas sería el sitio donde los dos criterios divergen sin que nadie lo note.
 *
 * Y una carpeta que se queda SIN nada dentro no deja rastro: el ZIP solo lleva entradas
 * de FICHERO, así que un `doc/` con un `.DS_Store` dentro desaparece entero —igual que
 * `bd/`, cuyos ficheros caen todos por su nombre— en vez de quedar como una carpeta vacía
 * que nadie pidió. Al extraer, cada entrada crea sus carpetas padre, como en
 * `extraerZipBase64`.
 */
function viaja(virtual: string): boolean {
  if (!puedeLeerRuta(virtual)) return false; // /.env, /.git, /.xonecode
  const partes = virtual.split("/").slice(1); // sin el "/" inicial
  if (partes[0] === "bd") return false;
  return !nombreQueNoViaja(partes[partes.length - 1] ?? "");
}

/**
 * El recorrido, modelado en `ficherosDelProyecto` (`agent/turno/turnoReal.ts`): `readdirSync`
 * por nombres y `lstatSync` por entrada. `lstat` y no `stat` porque **no se sigue ningún
 * enlace simbólico**: el paquete lo lee el disco de verdad (`readFileSync`), así que un
 * enlace que apunte fuera del proyecto metería en el ZIP un fichero que el proyecto no
 * tiene —la lección de `virtualMode: true` y el `dir-fuera/id_rsa` que ya se midió en la
 * pestaña Ficheros—. Al no seguirlos tampoco hay ciclos que temer, y no se pierde nada: el
 * destino de un enlace de dentro ya viaja por su nombre real.
 *
 * Se filtra ANTES de mirar la entrada: lo que no viaja ni se lista, y así `.xonecode/`
 * —cientos de megas de checkpoints— no se recorre para nada.
 */
function recorrer(directorio: string, prefijo: string, salida: Candidato[]): void {
  // Sin `try`: un proyecto que no se puede leer no se empaqueta. Tragares el error sería
  // subir un paquete incompleto y no decirlo, que es peor que fallar.
  for (const nombre of readdirSync(directorio)) {
    const ruta = prefijo === "" ? nombre : `${prefijo}/${nombre}`;
    if (!viaja(`/${ruta}`)) continue;
    const info = lstatSync(join(directorio, nombre));
    if (info.isDirectory()) {
      recorrer(join(directorio, nombre), ruta, salida);
      continue;
    }
    if (!info.isFile()) continue; // enlaces, sockets, FIFOs: no hay bytes que subir
    salida.push({ ruta, absoluta: join(directorio, nombre), bytes: info.size, mtime: info.mtimeMs });
  }
}

/**
 * La fecha que se escribe en el ZIP. **Sin esto `fflate` estampa `Date.now()`** —«Defaults
 * to the current time», dice su tipo—, así que el mismo árbol daría bytes distintos en
 * cada ejecución. Y el test que vigila eso no lo vería siempre: el formato DOS guarda los
 * segundos partidos por dos, de modo que dos ejecuciones dentro de la misma ventana de dos
 * segundos salen idénticas y la siguiente no. La mtime del fichero es el sustituto
 * honesto: es un dato que existe y no depende de cuándo se llamó.
 *
 * El suelo de 1980 no es un redondeo: por debajo de esa fecha `fflate` lanza `date not in
 * range 1980-2099` sin decir de qué fichero, y una mtime a 0 —la que dejan algunas
 * herramientas al extraer— convertiría la subida entera en un error incomprensible.
 */
function fechaDelZip(mtime: number): number {
  return Math.max(mtime, FECHA_MINIMA_DEL_ZIP);
}

/**
 * Un tamaño en MB con un decimal y en coma: es una cifra que lee una persona.
 *
 * Se EXPORTA porque la línea del recorrido de lanzamiento enseña los mismos tamaños
 * (`lanzamientoEnMaquina.ts`): un segundo formateador allí diría `12.3 MB` donde aquí se dice
 * `12,3 MB`, y dos formatos para la misma cifra enseñan a desconfiar de los dos.
 */
export function enMegas(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Los bytes del paquete. El `tope` entra por parámetro para poder probar el rechazo sin
 * fabricar medio giga —el mismo recurso que el reloj de `MS_ENTRE_PARCIALES`—: un tope
 * que solo se puede ejercitar con 512 MB de verdad es un tope que nadie prueba.
 */
export function empaquetarProyecto(raiz: string, tope: number = TOPE_DE_PAQUETE): PaqueteDelProyecto {
  const candidatos: Candidato[] = [];
  recorrer(raiz, "", candidatos);

  // El orden lo fija la RUTA, y el ZIP se escribe en el orden en que recibe sus entradas:
  // sin esto el mismo árbol daría bytes distintos en cada ejecución y dos paquetes iguales
  // parecerían dos despliegues distintos. Es `sort` a secas —orden de code units, igual en
  // cualquier máquina— y no el `ordenarRutas` del árbol de la web, que usa un
  // `Intl.Collator` para poner carpetas antes que ficheros: eso es una regla de
  // PRESENTACIÓN, y un collator que cambia con la versión de ICU sería una fuente de bytes
  // distintos que nadie sabría de dónde viene.
  candidatos.sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));

  const total = candidatos.reduce((suma, c) => suma + c.bytes, 0);
  if (total > tope) {
    // Se mira ANTES de leer: el recorrido solo ha mirado cabeceras, así que el tamaño del
    // mensaje es el real y no el de un corte a medias —y no se pide un giga de memoria
    // para acabar diciendo que no—.
    throw new Error(`el proyecto ocupa ${enMegas(total)} y el paquete admite ${enMegas(tope)}: no se sube nada`);
  }

  const entradas: Record<string, [Uint8Array, { mtime: number }]> = {};
  for (const c of candidatos) {
    entradas[c.ruta] = [readFileSync(c.absoluta), { mtime: fechaDelZip(c.mtime) }];
  }
  return {
    bytes: zipSync(entradas, { level: NIVEL_DE_COMPRESION }),
    ficheros: candidatos.map((c) => c.ruta),
    total,
  };
}
