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
 */

export const FICHERO_DE_APRENDIDO = "aprendido.json";
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

/** El bloque que el harness pone delante de cada encargo. Sin nada apuntado, nada. */
export function bloqueDeAprendido(lista: readonly Aprendizaje[]): string | undefined {
  if (lista.length === 0) return undefined;
  return [
    "LO APRENDIDO EN ESTE PROYECTO (lo apuntaron encargos anteriores: úsalo y no lo redescubras; si ya no es cierto, apúntalo corregido):",
    ...lista.map((a) => `- ${a.tema}: ${enUnaLinea(a.texto)}${a.comoLoSe === undefined || a.comoLoSe.trim() === "" ? "" : ` (comprobado: ${enUnaLinea(a.comoLoSe)})`}`),
  ].join("\n");
}

/** Cuándo apuntar, para quien tiene la tool: una tool sin un «cuándo» no se usa. */
export const USO_DE_APUNTAR_APRENDIZAJE =
  `Cuando descubras algo del proyecto o del aparato que otro encargo va a necesitar —cómo entrar en la app (usuario y ` +
  `clave), qué pulsar para llegar a una pantalla, una trampa que te costó entender—, apúntalo con \`${NOMBRE_APUNTAR_APRENDIZAJE}\` ` +
  "en cuanto lo sepas, con un tema corto y con CÓMO lo comprobaste. Apunta un HECHO de este proyecto, concreto " +
  "(«usuario 08006, sin clave; pulsar Entrar»): ni un consejo general («revisa bien los estilos»), que no cambia nada, ni " +
  "el detalle de tu encargo de hoy, que no vuelve a servir. Lo que supones no se apunta: un dato adivinado es peor que " +
  "ninguno, porque los encargos siguientes se lo creen. No apuntes lo que ya está en lo aprendido.";

/** Para un hijo de motor EXTERNO, que no tiene la tool: lo cuenta al volver y quien le llamó lo apunta. */
export const USO_DE_APRENDIDO_EXTERNO =
  "Si descubres algo del proyecto o del aparato que otro encargo va a necesitar (cómo entrar en la app, qué pulsar para " +
  "llegar a una pantalla, una trampa), dilo al final de tu respuesta en un apartado «Aprendido:», una línea por cosa con " +
  "cómo lo comprobaste («usuario 08006, pulsar Entrar — comprobado: entré en el emulador»). Solo lo comprobado, no lo que supones.";
