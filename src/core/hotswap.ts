/**
 * Dónde deja una shell lo que saca del CONTEXTO, y por qué eso no es un artefacto.
 *
 * El script `xone-hotswap` (skill de serie) no imprime una respuesta del aparato que pase de
 * un par de miles de caracteres: la escribe a fichero y en la salida del comando deja una
 * línea que dice dónde está. El motivo es bueno —el árbol de controles de una pantalla llena
 * son varios miles de caracteres, y volcarlo en la salida es meterlo en el contexto del
 * agente para siempre—. Lo que estaba mal era el DESTINO: escribía en la carpeta de
 * artefactos, que es la que se ANUNCIA.
 *
 * **Y se anunciaban diez volcados de los que seis no volvía a abrir nadie.** Medido sobre una
 * sesión real de `device-controller` (MyAllXOne, 22-09-2026): de 10 `respuesta-status-*.json`
 * de 8 KB, 4 se volvieron a tocar y 6 no se abrieron jamás; los que sí, 9 veces por shell y 4
 * por `read_file`, y cuando se abrían se recortaban —`print(json.dumps(d)[:1500])` de un
 * fichero de 8 KB—. Ningún otro lector los mira: ni el juez del turno, ni el verificador, ni
 * la persona. El contraste está medido al lado: las CAPTURAS sí tienen un segundo lector
 * —`capturasDelTurno` se lleva la última al crítico de pantalla—, y por eso las capturas se
 * quedan donde estaban.
 *
 * Y había un segundo efecto, que es el que esta carpeta arregla de paso: **el agente no sabía
 * cómo volver a abrirlos**. El script devolvía un nombre pelado (`<guardado como
 * respuesta-status-….json>`) y lo único que el entorno le daba era `XONECODE_ARTEFACTOS`, que
 * es la carpeta del DISCO. En la traza se le ve intentando leer el mismo fichero por tres
 * rutas —la absoluta de la máquina y `/.xonecode/sesiones/…`, denegada— antes de rendirse y
 * usar `python3`. De regalo, esa ruta absoluta viajó por el cable dentro de la línea de la
 * tool, que es justo lo que `sinRutas` existe para impedir.
 *
 * Así que esto es la MISMA pieza que `/large_tool_results/` (`core/descargas.ts`) y por la
 * misma razón declarada allí: «un artefacto es una salida para una persona y por eso se
 * anuncia; esto es el andamio del agente». Cambia quién descarga —allí la librería, aquí un
 * script nuestro— y no cambia nada más.
 *
 * Este módulo es `core/`: el nombre y dónde va la carpeta. Quién la monta es de `agent/`
 * (`agent/grafo/proyecto.ts#backendConHotswap`), y quién escribe ahí es el script.
 */
import { dirname, join } from "node:path";

/**
 * El prefijo virtual, con barra final: `CompositeBackend` la exige para no reconstruir
 * `//nombre` fuera de la raíz montada — la misma trampa medida con `/skills/`.
 *
 * **El nombre ata el harness a UNA skill, y eso se declara en vez de disimularse.** Lo
 * honesto sería un nombre que diga la función y no el protocolo (`/volcados/`), porque
 * mañana otra skill querrá lo mismo; se deja `hotswap` porque hoy hay exactamente un
 * escritor, y un nombre genérico con un solo usuario es una abstracción que nadie ha medido.
 * El día que haya un segundo, el sitio de la decisión es este.
 */
export const RUTA_HOTSWAP = "/hotswap/";

/** El nombre llano de la carpeta en disco: `/hotswap/` → `hotswap`. */
const CARPETA = RUTA_HOTSWAP.replace(/^\/+/, "").replace(/\/+$/, "");

/**
 * Dónde cae en DISCO: al LADO de la de artefactos de la sesión, nunca dentro.
 *
 * **Hermana y no subcarpeta**, y eso no es estética: desde que la foto de
 * `anunciarArtefactosDeLaShell` es recursiva, cualquier cosa que cuelgue de `artefactos/` se
 * anuncia — o sea que un `artefactos/hotswap/` volvería a llenar la pestaña de volcados, que
 * es justo lo que esto viene a quitar.
 *
 * Se deriva de la carpeta de artefactos en vez de recibir su propio parámetro, por lo mismo
 * que `carpetaDeDescargas`: esa carpeta ya lleva dentro la única decisión que hace falta
 * —¿hay una sesión con IDENTIDAD?—, que `turnoReal.ts` resuelve pasando
 * `.xonecode/sesiones/<id>/artefactos` en la web y cayendo a `.xonecode/artefactos` en el
 * terminal. Dos parámetros serían dos sitios donde contestar la misma pregunta, y el segundo
 * es justo el que se cae en un cableado de ocho saltos.
 *
 * Y de vivir ahí cuelga gratis lo que si no habría que escribir: `borrarSesion` borra la
 * carpeta `<id>` entera, así que borrar una conversación se lleva también sus volcados.
 */
export function carpetaDeHotswap(carpetaDeArtefactos: string): string {
  return join(dirname(carpetaDeArtefactos), CARPETA);
}
