/**
 * PROBAR en UNA orden: recargar lo editado, abrir la ventana, limpiar el log, los casos, el log de la app y la captura.
 *
 * Medido en la pasada 9 de la calculadora (03-11-2026): de las 412 llamadas del desarrollador, 334 pidieron UNA sola tool,
 * y 163 de esas eran un script del aparato. El ciclo era siempre el mismo —recargar → abrir → `--limpiar` → un caso por
 * orden → `--app` → captura—, cada paso una vuelta de ~100 mil tokens reenviados. Los demás harnesses lo resuelven igual:
 * una llamada que hace más (el `run_code` de deepseek-harness, el Code Mode de TrueForge), no un prompt que pida agrupar.
 *
 * Compone los scripts que ya hay, no los reimplementa: cada paso es el script hermano con sus argumentos, y su salida se
 * copia TAL CUAL (las líneas `{"comando":"caso",…}` y el «guardada como captura-….png» son lo que lee la ficha).
 *
 * Puro: aquí se lee la orden y se decide el plan; lanzar y esperar es de `scripts/xone-probar`.
 */
import { COMO_CASOS } from "./casos.mjs";

/**
 * Lo que `--recargar` toma como fichero: los que sabe llevar `xone-recargar-android`. Los ICONOS también: nombrados, el
 * script los sube y relanza la app (medido el 05-11-2026 con Codex, `icons/ic_person.svg → relanzada la app` en ~2 s);
 * sin esto, un SVG nuevo solo llegaba desplegando entero, que sustituye la base de datos y devuelve la app al login.
 * Las FUENTES no: siguen pidiendo `xone-desplegar-android`.
 */
const FICHERO_RECARGABLE = /\.(xne|js|css|xml|ini|json|svg|png|jpe?g|webp)$/i;

/** Lo que espera tras `abrir` antes del primer caso: la ventana se pinta un instante después (`xone-hotswap --help`). */
export const ESPERA_TRAS_ABRIR_MS = 1000;

/**
 * Lee la orden. Las opciones propias van DELANTE; desde el primer argumento que no es una de ellas, todo es de
 * `xone-hotswap` tal cual (`click name=A -- click name=B --- click name=C`), que es la sintaxis que el agente ya sabe.
 * Un `--` suelto también abre esa parte.
 */
export function leerOrden(argv) {
  const orden = { recargar: undefined, abrir: undefined, captura: false, serie: undefined, puerto: undefined, casos: [], ayuda: false };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      orden.ayuda = true;
      i += 1;
    } else if (a === "--recargar") {
      orden.recargar = [];
      i += 1;
      while (i < argv.length && FICHERO_RECARGABLE.test(argv[i]) && !argv[i].startsWith("--")) orden.recargar.push(argv[i++]);
    } else if (a === "--captura") {
      orden.captura = true;
      i += 1;
    } else if (a === "--abrir" || a === "--serie" || a === "--puerto") {
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith("--")) return { error: `${a} necesita un valor` };
      orden[a.slice(2)] = valor;
      i += 2;
    } else if (a === "--") {
      orden.casos = argv.slice(i + 1);
      break;
    } else if (a === "---") {
      // El separador de CASOS abre también los casos: medido en la pasada 11, `--abrir X --- screen` salía con 2.
      orden.casos = argv.slice(i);
      break;
    } else if (a.startsWith("--")) {
      return { error: `opción desconocida: ${a} (las de xone-probar van delante: --recargar, --abrir, --captura, --serie, --puerto)` };
    } else {
      orden.casos = argv.slice(i);
      break;
    }
  }
  return { orden };
}

/**
 * Los pasos, en orden. `para`: si falla, no se sigue (sin recarga no hay nada que probar). El resto se corre aunque uno
 * falle, porque el log y la captura son justo lo que explica el fallo.
 */
export function planDePrueba(orden) {
  const serie = orden.serie === undefined ? [] : ["--serie", orden.serie];
  const conexion = [...(orden.puerto === undefined ? [] : ["--puerto", orden.puerto]), ...serie];
  const pasos = [];
  // `xone-recargar-android` no lee `--serie`: tomaría el valor por un fichero. Va al aparato de la sesión.
  if (orden.recargar !== undefined) pasos.push({ etiqueta: "recargar", script: "xone-recargar-android", args: orden.recargar, para: true });
  pasos.push({ etiqueta: "limpiar el log", script: "xone-log-android", args: ["--limpiar", ...serie], para: false, callado: true });
  if (orden.abrir !== undefined) pasos.push({ etiqueta: `abrir ${orden.abrir}`, script: "xone-hotswap", args: [...conexion, "abrir", orden.abrir], para: true, esperaDespues: ESPERA_TRAS_ABRIR_MS });
  pasos.push(
    orden.casos.length > 0
      ? { etiqueta: "casos", script: "xone-hotswap", args: [...conexion, ...orden.casos], para: false, env: { [COMO_CASOS]: "1" } }
      : { etiqueta: "textos en pantalla", script: "xone-hotswap", args: [...conexion, "textos"], para: false }
  );
  pasos.push({ etiqueta: "log de la app", script: "xone-log-android", args: ["--app", ...serie], para: false });
  if (orden.captura) pasos.push({ etiqueta: "captura", script: "xone-captura-android", args: serie, para: false });
  return pasos;
}

/** La línea de cierre: cuántos pasos y cuál falló, con su código. */
export function cierreDePrueba(resultados) {
  const fallidos = resultados.filter((r) => r.codigo !== 0);
  const cortado = resultados.length > 0 && resultados[resultados.length - 1].cortado === true;
  if (fallidos.length === 0) return `xone-probar: ${resultados.length} paso(s), todos bien`;
  const lista = fallidos.map((r) => `«${r.etiqueta}» (código ${r.codigo})`).join(", ");
  return `xone-probar: falló ${lista}${cortado ? "; no se siguió: sin eso no hay nada que probar" : ""}`;
}

export const AYUDA_DE_PROBAR = `xone-probar — PROBAR en una orden: recarga, abre, limpia el log, corre los casos, lee el log de la app y captura.

  xone-probar --recargar calculadora.js --abrir Calculadora --captura \\
    click name=MAP_CK_AC -- click name=MAP_CK_7 -- click name=MAP_CK_EQ --- click name=MAP_CK_8 -- click name=MAP_CK_DIV -- click name=MAP_CK_0 -- click name=MAP_CK_EQ

  --recargar [ficheros]   xone-recargar-android con esos ficheros (sin ficheros: todo lo que cambió). Si falla, para
  --abrir <Colección>     ir directo a esa ventana antes del primer caso
  --captura               captura al final (la mide el harness contra la maqueta)
  --serie S / --puerto N  el aparato y el puerto, como en xone-hotswap
  lo demás                los casos de xone-hotswap tal cual: -- encadena pasos, --- separa casos

Sin casos, enseña los textos de la pantalla. Las opciones van DELANTE de los casos.
Para lo que no es probar (js, sql, elements, screen) sigue usando xone-hotswap.`;
