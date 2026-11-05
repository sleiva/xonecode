/**
 * El `node` de XOneCode en un Mac, envuelto en una `.app` para que macOS le deje hablar con la RED LOCAL (la granja de
 * dispositivos). Puro: las reglas; los efectos (copiar, firmar, abrir) en `agent/config/nodeDeRedLocal.ts`.
 *
 * ## Por qué (medido el 05-11-2026, macOS 27.2)
 *
 * La granja se abría en el navegador y el servidor daba `EHOSTUNREACH`. Desde el terminal de WebStorm y desde
 * Terminal.app, `/usr/bin/curl` y `/usr/bin/nc` llegaban y `node` no (ni `/usr/bin/python3`); internet, sí. macOS deniega
 * en silencio la red local a un ejecutable SIN identidad de app: no pregunta, no sale en Ajustes → Red local y el «+» no
 * lo admite, aunque la app que lo lanza tenga el permiso encendido. Una copia de `node` dentro de una `.app` con
 * `NSLocalNetworkUsageDescription`, firmada ad hoc, sí:
 *
 * - **El aviso solo sale si la app se ABRE por LaunchServices** (`open -n`): ejecutada directamente, una app nueva falló
 *   cuatro de cuatro sin aviso; abierta, el primer intento falla, sale el aviso y tras «Permitir» llega.
 * - **Con el permiso dado, basta ejecutar su `node` directamente** desde cualquier terminal: así se relanza XOneCode.
 *
 * **Límite**: el permiso va con la FIRMA de esa copia; al cambiar el `node` de origen (una actualización) se rehace la app
 * y macOS vuelve a preguntar una vez.
 */

/** La carpeta, dentro de `~/.xonecode/`, con la app y la ficha de su origen. */
export const CARPETA_DE_RED_LOCAL = "red-local";
export const NOMBRE_DE_LA_APP = "XOneCodeNode.app";
export const ID_DE_LA_APP = "es.xone.xonecode.node";
/** El nombre que enseña macOS en el aviso y en Ajustes → Privacidad y seguridad → Red local. */
export const NOMBRE_VISIBLE = "XOneCode Node";

/** La lleva el proceso relanzado: ya corre en el `node` de la app y no se vuelve a relanzar. */
export const MARCA_DE_RELANZADO = "XONECODE_NODE_DE_RED_LOCAL";
/** `=1` apaga el envoltorio: XOneCode corre con el `node` con que se lanzó. */
export const APAGAR_NODE_DE_RED_LOCAL = "XONECODE_SIN_NODE_DE_RED_LOCAL";

export function infoPlistDeLaApp(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    `<key>CFBundleIdentifier</key><string>${ID_DE_LA_APP}</string>`,
    `<key>CFBundleName</key><string>${NOMBRE_VISIBLE}</string>`,
    "<key>CFBundleExecutable</key><string>node</string>",
    "<key>CFBundlePackageType</key><string>APPL</string>",
    "<key>CFBundleVersion</key><string>1</string>",
    "<key>LSBackgroundOnly</key><true/>",
    "<key>NSLocalNetworkUsageDescription</key><string>XOneCode habla con la granja de dispositivos XOne de tu red local.</string>",
    "</dict></plist>",
    "",
  ].join("\n");
}

/** ¿Se envuelve? Solo en un Mac, no en el proceso ya relanzado y no si la persona lo apagó. */
export function debeEnvolverNode(plataforma: string, env: Readonly<Record<string, string | undefined>>): boolean {
  return plataforma === "darwin" && env[MARCA_DE_RELANZADO] === undefined && env[APAGAR_NODE_DE_RED_LOCAL] !== "1";
}

/** De qué `node` se copió la app: si cambia, se rehace. */
export interface OrigenDelNode {
  ruta: string;
  tamano: number;
  mtimeMs: number;
}

export function mismoOrigen(guardado: unknown, actual: OrigenDelNode): boolean {
  const g = guardado as Partial<OrigenDelNode> | null;
  return g !== null && typeof g === "object" && g.ruta === actual.ruta && g.tamano === actual.tamano && g.mtimeMs === actual.mtimeMs;
}

/** Una interfaz de red como la da `os.networkInterfaces()`, lo que se usa de ella. */
export interface InterfazDeRed {
  family: string | number;
  internal: boolean;
  address: string;
  netmask: string;
}

const aEntero = (ip: string): number | undefined => {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return undefined;
  return ((p[0]! << 24) >>> 0) + (p[1]! << 16) + (p[2]! << 8) + p[3]!;
};
const aIp = (n: number): string => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");

/**
 * A dónde se conecta la app al abrirla para que macOS SAQUE el aviso: el primer equipo de cada red local IPv4 (la red
 * más uno, casi siempre el router). Lo que cuenta es intentar la conexión a la red local, no que conteste. Como mucho tres.
 */
export function destinosDelAviso(interfaces: Readonly<Record<string, readonly InterfazDeRed[] | undefined>>): string[] {
  const destinos: string[] = [];
  for (const lista of Object.values(interfaces)) {
    for (const i of lista ?? []) {
      if (i.internal || (i.family !== "IPv4" && i.family !== 4)) continue;
      const ip = aEntero(i.address);
      const mascara = aEntero(i.netmask);
      if (ip === undefined || mascara === undefined || mascara === 0xffffffff || mascara === 0) continue;
      const primero = aIp(((ip & mascara) >>> 0) + 1);
      if (primero !== i.address && !destinos.includes(primero)) destinos.push(primero);
    }
  }
  return destinos.slice(0, 3);
}

/** El programa que corre la app al ABRIRLA: intenta conectar a cada destino y sale sola. */
export function programaDelAviso(destinos: readonly string[]): string {
  return [
    'const net = require("net");',
    `for (const d of ${JSON.stringify(destinos)}) { const s = net.connect(80, d); s.on("error", () => {}); s.on("connect", () => s.destroy()); s.setTimeout(4000, () => s.destroy()); }`,
    "setTimeout(() => process.exit(0), 5000);",
  ].join("\n");
}

/** Señales que se REENVÍAN al proceso relanzado. SIGINT no: la terminal ya se lo manda a todo el grupo. */
export const SENALES_QUE_SE_REENVIAN = ["SIGTERM", "SIGHUP"] as const;

/** El código con que sale quien relanzó: el del hijo, o 128 + la señal que lo mató (la convención de la shell). */
export function codigoDeSalidaDelRelanzado(codigo: number | null, senal: string | null, numeroDeSenal: (s: string) => number | undefined): number {
  if (codigo !== null) return codigo;
  const n = senal === null ? undefined : numeroDeSenal(senal);
  return n === undefined ? 70 : 128 + n;
}
