/**
 * **Lo APRENDIDO en un proyecto**, de un encargo para los siguientes: cómo entrar en la app (usuario y clave), qué hay que
 * pulsar para llegar a una pantalla, una trampa del aparato. Lo apunta el agente con `apuntar_aprendizaje` y el HARNESS
 * se lo pone delante en cada encargo siguiente, sin depender de que se acuerde de leerlo.
 *
 * Existe por una medida: en Maset el agente redescubría en cada encargo que había que pulsar «Entrar» con el usuario
 * `08006`. La memoria del proyecto (`MEMORIA_PROYECTO.md`) existía, pero solo se escribía si al agente se le ocurría.
 *
 * Vive en `.xonecode/aprendido.json` del proyecto: no sube a CloudStudio ni entra en los commits, y **no viaja en un
 * paquete de soporte** (`SECRETOS_QUE_NO_VIAJAN`), porque puede llevar una contraseña. Puro: el disco va en `agent/`.
 *
 * **Solo lo COMPROBADO, y dicho cómo** (`comoLoSe`). Idea traída de Harness², el optimizador de harnesses de Google: su
 * librería de experiencia guarda, con cada lección, la EVIDENCIA en que se apoya, y declina apuntar cuando no la hay,
 * porque un dato adivinado envenena a todos los que lo leen después. Aquí pesa más: lo apuntado va delante de CADA
 * encargo sin que nadie lo revise. Y de ahí también la calibración de `USO_DE_APUNTAR_APRENDIZAJE`: un HECHO de este
 * proyecto, ni un consejo general (no cambia nada) ni el detalle del encargo de hoy (no vuelve a servir). Una entrada
 * de antes, sin `comoLoSe`, sigue valiendo: ausente no es vacío.
 *
 * **Dos ALCANCES, y los dos se guardan** (decisión suya): lo de ESTE proyecto (`proyecto`, en su `.xonecode/`) y lo de
 * XONE (`xone`, en `~/.xonecode/aprendido-xone.json`), que llega a los encargos de TODOS los proyectos. Medido en Maset:
 * de 12 entradas, casi todas eran de XOne en general («el alfa va primero en #AARRGGBB», «imgbk anula
 * border-corner-radius») y se quedaban encerradas en un proyecto. Es la distinción de Harness² entre el hecho del
 * espacio de trabajo y lo que vale para todo el dominio. Lo de XOne no puede llevar usuarios, claves ni nombres del
 * proyecto: cruza de un cliente a otro. Se pide en el texto y, en parte, se COMPRUEBA (`motivoDeXoneConDatosDelProyecto`):
 * medido en la primera tarea real, el diseñador apuntó como XOne «qué hay ahora en /artefactos/diseno» de Maset.
 */

export const FICHERO_DE_APRENDIDO = "aprendido.json";
/** Lo de XOne: en la carpeta GLOBAL (`~/.xonecode/`), no en la del proyecto. */
export const FICHERO_DE_APRENDIDO_DE_XONE = "aprendido-xone.json";

/** Dónde vale: solo en este proyecto, o en cualquier app XOne. */
export type AlcanceDeAprendizaje = "proyecto" | "xone";
export const ALCANCES_DE_APRENDIZAJE: readonly AlcanceDeAprendizaje[] = ["proyecto", "xone"];
export const NOMBRE_APUNTAR_APRENDIZAJE = "apuntar_aprendizaje";

export interface Aprendizaje {
  /** De qué va, corto y estable: el mismo tema se SUSTITUYE (`cómo entrar en la app`). */
  tema: string;
  texto: string;
  /** Cuándo se apuntó, ISO. */
  cuando: string;
  /** Quién lo apuntó (el agente). */
  quien?: string;
  /** Cómo se comprobó («entré en el emulador con él», «está en `usuarios.xne`»). Obligatorio al apuntar; las de antes no lo llevan. */
  comoLoSe?: string;
}

/** Cuántos se guardan: al pasar, se va el más viejo. Todos van delante de cada encargo, así que pocos y útiles. */
export const TOPE_DE_APRENDIZAJES = 30;
export const TOPE_DE_TEMA = 80;
export const TOPE_DE_TEXTO = 600;
/** Corto a propósito: va delante de cada encargo, con cada entrada. */
export const TOPE_DE_COMO_LO_SE = 200;

/** Por qué no se puede apuntar, o `undefined`. Sin `comoLoSe` no se apunta: lo supuesto no es un aprendizaje. */
export function motivoDeAprendizajeInaceptable(a: { tema: string; texto: string; comoLoSe: string }): string | undefined {
  const tema = a.tema.trim();
  const texto = a.texto.trim();
  const comoLoSe = a.comoLoSe.trim();
  if (tema === "") return "falta el tema";
  if (texto === "") return "falta el texto";
  if (comoLoSe === "") return "falta cómo lo sabes: apunta solo lo que COMPROBASTE (lo probaste, lo viste en un fichero), no lo que supones";
  if (tema.length > TOPE_DE_TEMA) return `el tema es demasiado largo (máximo ${TOPE_DE_TEMA} caracteres)`;
  if (texto.length > TOPE_DE_TEXTO) return `el texto es demasiado largo (máximo ${TOPE_DE_TEXTO} caracteres): apunta solo lo que hace falta`;
  if (comoLoSe.length > TOPE_DE_COMO_LO_SE) return `cómo lo sabes es demasiado largo (máximo ${TOPE_DE_COMO_LO_SE} caracteres): di solo cómo lo comprobaste`;
  return undefined;
}

/**
 * Nombres de ficheros que tiene CUALQUIER app XOne, o que no dicen nada del proyecto: no cuentan como dato suyo. Las
 * carpetas de fuentes y de base de datos tampoco (una «Inter-Bold» es de todos).
 */
const NOMBRES_GENERICOS = new Set(["app", "appwizard", "default", "funciones", "icon", "index", "mappings"]);
const CARPETAS_GENERICAS = ["fonts/", "bd/"];

/** Lo que identifica a ESTE proyecto: su nombre y el de sus ficheros (colecciones, iconos…), sin extensión ni carpeta. */
export function nombresDelProyecto(nombre: string, rutas: Iterable<string>): string[] {
  const nombres = new Set<string>([nombre]);
  for (const ruta of rutas) {
    const normal = ruta.replace(/\\/g, "/").replace(/^\/+/, "");
    if (CARPETAS_GENERICAS.some((c) => normal.startsWith(c))) continue;
    const base = normal.slice(normal.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
    if (base.length >= 4 && !NOMBRES_GENERICOS.has(base.toLowerCase())) nombres.add(base);
  }
  return [...nombres].filter((n) => n.trim() !== "");
}

const escapar = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Por qué una entrada de XOne no vale porque NOMBRA el proyecto, o `undefined`. Palabra ENTERA y con sus mayúsculas: una
 * colección «Menu» no casa en «menu» ni en «MenuItem». No lo atrapa todo (un dato del proyecto sin nombrarlo pasa): es
 * la guarda de lo medido, no la garantía.
 */
export function motivoDeXoneConDatosDelProyecto(a: { tema: string; texto: string; comoLoSe: string }, nombres: readonly string[]): string | undefined {
  const todo = `${a.tema}\n${a.texto}\n${a.comoLoSe}`;
  const nombrado = nombres.find((n) => new RegExp(`(?<![\\w-])${escapar(n)}(?![\\w-])`).test(todo));
  if (nombrado === undefined) return undefined;
  return (
    `nombra «${nombrado}», que es de este proyecto: lo de XOne lo leen los encargos de TODOS los proyectos. Si es un ` +
    "hecho de este proyecto, apúntalo con alcance «proyecto»; si de verdad vale para cualquier app, escríbelo sin nombrar nada suyo"
  );
}

const claveDe = (tema: string): string => tema.trim().toLowerCase().replace(/\s+/g, " ");

/** La lista con el nuevo: el mismo tema se SUSTITUYE (y pasa al final, el más reciente); pasado el tope, fuera el más viejo. */
export function conAprendizaje(lista: readonly Aprendizaje[], nuevo: Aprendizaje): Aprendizaje[] {
  const limpio: Aprendizaje = {
    ...nuevo,
    tema: nuevo.tema.trim(),
    texto: nuevo.texto.trim(),
    ...(nuevo.comoLoSe === undefined ? {} : { comoLoSe: nuevo.comoLoSe.trim() }),
  };
  const resto = lista.filter((a) => claveDe(a.tema) !== claveDe(limpio.tema));
  return [...resto, limpio].slice(-TOPE_DE_APRENDIZAJES);
}

/** El fichero leído: lo que no se entienda se deja fuera, entrada a entrada; un fichero roto es una lista vacía. */
export function interpretarAprendido(texto: string): Aprendizaje[] {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return [];
  }
  if (!Array.isArray(datos)) return [];
  return datos.filter(
    (a): a is Aprendizaje =>
      typeof a === "object" &&
      a !== null &&
      typeof a.tema === "string" &&
      typeof a.texto === "string" &&
      typeof a.cuando === "string" &&
      (a.comoLoSe === undefined || typeof a.comoLoSe === "string")
  );
}

const enUnaLinea = (texto: string): string => texto.replace(/\s*\n\s*/g, " ");

const lineaDe = (a: Aprendizaje): string =>
  `- ${a.tema}: ${enUnaLinea(a.texto)}${a.comoLoSe === undefined || a.comoLoSe.trim() === "" ? "" : ` (comprobado: ${enUnaLinea(a.comoLoSe)})`}`;

/** El bloque que el harness pone delante de cada encargo: lo del proyecto y lo de XOne, cada uno con su cabecera. Sin nada, nada. */
export function bloqueDeAprendido(delProyecto: readonly Aprendizaje[], deXone: readonly Aprendizaje[] = []): string | undefined {
  const partes = [
    ...(delProyecto.length === 0
      ? []
      : [
          [
            "LO APRENDIDO EN ESTE PROYECTO (lo apuntaron encargos anteriores: úsalo y no lo redescubras; si ya no es cierto, apúntalo corregido):",
            ...delProyecto.map(lineaDe),
          ].join("\n"),
        ]),
    ...(deXone.length === 0
      ? []
      : [
          [
            "LO APRENDIDO DE XONE (lo apuntaron encargos de cualquier proyecto y vale en todos; si lo que mides aquí lo contradice, gana lo medido y apúntalo corregido):",
            ...deXone.map(lineaDe),
          ].join("\n"),
        ]),
  ];
  return partes.length === 0 ? undefined : partes.join("\n\n");
}

/** Cuándo apuntar, para quien tiene la tool: una tool sin un «cuándo» no se usa. */
export const USO_DE_APUNTAR_APRENDIZAJE =
  `Cuando descubras algo que otro encargo va a necesitar, apúntalo con \`${NOMBRE_APUNTAR_APRENDIZAJE}\` en cuanto lo ` +
  "sepas, con un tema corto, con CÓMO lo comprobaste y con su ALCANCE. `proyecto`: un hecho de ESTE proyecto —cómo entrar " +
  "en la app (usuario y clave), qué pulsar para llegar a una pantalla, una trampa suya— («usuario 08006, sin clave; pulsar " +
  "Entrar»). `xone`: cómo se comporta XOne en CUALQUIER app —un atributo que no hace lo que parece, algo que exige desplegar " +
  "entero— («imgbk en un frame anula border-corner-radius»); ahí nunca usuarios, claves ni nombres de este proyecto, porque " +
  "lo leen los encargos de todos. Ni un consejo general («revisa bien los estilos»), que no cambia nada, ni el detalle de " +
  "tu encargo de hoy, que no vuelve a servir. Lo que supones no se apunta: un dato adivinado es peor que ninguno, porque " +
  "los encargos siguientes se lo creen. No apuntes lo que ya está en lo aprendido.";

/** Para un hijo de motor EXTERNO, que no tiene la tool: lo cuenta al volver y quien le llamó lo apunta. */
export const USO_DE_APRENDIDO_EXTERNO =
  "Si descubres algo del proyecto o del aparato que otro encargo va a necesitar (cómo entrar en la app, qué pulsar para " +
  "llegar a una pantalla, una trampa), dilo al final de tu respuesta en un apartado «Aprendido:», una línea por cosa con " +
  "cómo lo comprobaste («usuario 08006, pulsar Entrar — comprobado: entré en el emulador»). Si vale para cualquier app XOne " +
  "y no solo para este proyecto, empieza la línea por «XOne:». Solo lo comprobado, no lo que supones.";
