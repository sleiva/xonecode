/**
 * Las reglas PURAS de «Nuevo emulador a partir de uno existente»: qué se lee de un AVD base y qué
 * se copia al nuevo. El disco y `avdmanager` viven en `agent/dispositivos/instalacionEnMaquina.ts`.
 *
 * Dos modos, y la diferencia es cuánto de la base viaja:
 *  - CONFIGURACIÓN: `avdmanager` crea un AVD vacío con la imagen y el perfil de la base, y se le
 *    pone encima el `config.ini` de la base (RAM, disco…). Vale con la base encendida.
 *  - CLON: se copia la carpeta entera (lo instalado), salvo lo que `seCopiaEnClon` excluye. La base
 *    tiene que estar apagada: sus discos están bloqueados mientras corre.
 */

/** Las líneas `clave=valor` de un `.ini` de AVD. Sin `=` o en blanco se ignoran; el valor va tal cual. */
export function leerIni(texto: string): Map<string, string> {
  const r = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const i = linea.indexOf("=");
    if (i <= 0) continue;
    r.set(linea.slice(0, i).trim(), linea.slice(i + 1).trim());
  }
  return r;
}

const FORMA_DE_SYSDIR = /^system-images\/([^/;\s]+)\/([^/;\s]+)\/([^/;\s]+)\/?$/;

/**
 * El paquete de imagen para `avdmanager -k`, de `image.sysdir.1`:
 * `system-images/android-35/google_apis/arm64-v8a/` → `system-images;android-35;google_apis;arm64-v8a`.
 * Sin esa forma no se adivina nada: `undefined`.
 */
export function paqueteDeImagen(config: ReadonlyMap<string, string>): string | undefined {
  const m = FORMA_DE_SYSDIR.exec(config.get("image.sysdir.1") ?? "");
  return m === null ? undefined : `system-images;${m[1]};${m[2]};${m[3]}`;
}

const FORMA_DE_PERFIL = /^[A-Za-z0-9._-]+$/;

/** El perfil de teléfono (`-d`) de la base: `hw.device.name`, si tiene forma de un nombre de perfil. */
export function perfilDeTelefono(config: ReadonlyMap<string, string>): string | undefined {
  const p = config.get("hw.device.name");
  return p !== undefined && FORMA_DE_PERFIL.test(p) ? p : undefined;
}

/**
 * El `<nombre>.ini` del clon: el de la base con `path` y `path.rel` apuntando a la carpeta nueva.
 * Lo demás (`target`, codificación…) se conserva. Si la base no traía alguna de las dos claves se
 * AÑADE: un `.ini` sin `path` no lo encuentra nadie.
 */
export function iniDeClon(iniBase: string, nombre: string, carpetaAvd: string): string {
  const nuevas: Record<string, string> = { path: carpetaAvd, "path.rel": `avd/${nombre}.avd` };
  const puestas = new Set<string>();
  const lineas = iniBase.split(/\r?\n/).filter((l, i, todas) => !(l === "" && i === todas.length - 1));
  const salida = lineas.map((linea) => {
    const i = linea.indexOf("=");
    const clave = i > 0 ? linea.slice(0, i).trim() : undefined;
    if (clave !== undefined && clave in nuevas) {
      puestas.add(clave);
      return `${clave}=${nuevas[clave]}`;
    }
    return linea;
  });
  for (const [clave, valor] of Object.entries(nuevas)) if (!puestas.has(clave)) salida.push(`${clave}=${valor}`);
  return `${salida.join("\n")}\n`;
}

/** Ficheros sueltos de la carpeta de un AVD que NO viajan al clon: son de la última ejecución del original. */
const FICHEROS_QUE_NO_SE_COPIAN = new Set([
  "hardware-qemu.ini", // lleva la ruta absoluta del original, tres veces; el emulador lo regenera
  "emu-launch-params.txt", // ídem
  "read-snapshot.txt",
  "snapshot.trace",
  "tmpAdbCmds",
  "bootcompleted.ini",
]);

/**
 * ¿Entra en el clon esta ruta, relativa a la carpeta del AVD (separada por `/` o `\`)? Lista NEGRA:
 * los `.lock` en cualquier nivel (el original los tiene cogidos) y los ficheros de la última
 * ejecución. `snapshots/` SÍ viaja (medido): al parar, el emulador guarda la memoria en la
 * instantánea, y lo que aún no se volcó al disco solo vive ahí; sin ella, el clon ve un disco a
 * medias (un fichero escrito salía con 0 bytes). Hay que reescribirles la identidad
 * (`hardwareIniDeClon`) o el emulador las rechaza.
 */
export function seCopiaEnClon(relativa: string): boolean {
  const partes = relativa.split(/[\\/]/).filter((p) => p !== "" && p !== ".");
  if (partes.length === 0) return true;
  const ultimo = partes[partes.length - 1]!;
  if (ultimo.endsWith(".lock")) return false;
  return !(partes.length === 1 && FICHEROS_QUE_NO_SE_COPIAN.has(ultimo));
}

/**
 * El `hardware.ini` de una instantánea del clon, con la identidad del original cambiada por la del
 * clon (medido: con solo las rutas el emulador rechaza la instantánea —«cannot load snapshot»—; con
 * las dos cosas la carga). Formato `clave = valor`, con espacios. Solo se tocan:
 *  - `avd.name` y `avd.id`, si valen exactamente la base;
 *  - en cualquier otro valor, los segmentos de ruta `<base>.avd` EXACTOS (entre `/` o `\`, o al
 *    final), nunca el nombre suelto: la base podría aparecer dentro de otra palabra.
 */
export function hardwareIniDeClon(texto: string, base: string, nombre: string): string {
  const escapada = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const segmento = new RegExp(`(^|[\\\\/])${escapada}\\.avd(?=[\\\\/]|$)`, "g");
  return texto
    .split("\n")
    .map((linea) => {
      const m = /^(\s*)([^=\s][^=]*?)(\s*=\s*)(.*?)(\r?)$/.exec(linea);
      if (m === null) return linea;
      const [, sangria, clave, igual, valor, cr] = m as unknown as string[];
      if (clave === "avd.name" || clave === "avd.id") return `${sangria}${clave}${igual}${valor === base ? nombre : valor}${cr}`;
      return `${sangria}${clave}${igual}${valor!.replace(segmento, `$1${nombre}.avd`)}${cr}`;
    })
    .join("\n");
}
