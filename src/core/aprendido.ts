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
}

/** Cuántos se guardan: al pasar, se va el más viejo. Todos van delante de cada encargo, así que pocos y útiles. */
export const TOPE_DE_APRENDIZAJES = 30;
export const TOPE_DE_TEMA = 80;
export const TOPE_DE_TEXTO = 600;

/** Por qué no se puede apuntar, o `undefined`. */
export function motivoDeAprendizajeInaceptable(a: { tema: string; texto: string }): string | undefined {
  const tema = a.tema.trim();
  const texto = a.texto.trim();
  if (tema === "") return "falta el tema";
  if (texto === "") return "falta el texto";
  if (tema.length > TOPE_DE_TEMA) return `el tema es demasiado largo (máximo ${TOPE_DE_TEMA} caracteres)`;
  if (texto.length > TOPE_DE_TEXTO) return `el texto es demasiado largo (máximo ${TOPE_DE_TEXTO} caracteres): apunta solo lo que hace falta`;
  return undefined;
}

const claveDe = (tema: string): string => tema.trim().toLowerCase().replace(/\s+/g, " ");

/** La lista con el nuevo: el mismo tema se SUSTITUYE (y pasa al final, el más reciente); pasado el tope, fuera el más viejo. */
export function conAprendizaje(lista: readonly Aprendizaje[], nuevo: Aprendizaje): Aprendizaje[] {
  const limpio: Aprendizaje = { ...nuevo, tema: nuevo.tema.trim(), texto: nuevo.texto.trim() };
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
      typeof a === "object" && a !== null && typeof a.tema === "string" && typeof a.texto === "string" && typeof a.cuando === "string"
  );
}

/** El bloque que el harness pone delante de cada encargo. Sin nada apuntado, nada. */
export function bloqueDeAprendido(lista: readonly Aprendizaje[]): string | undefined {
  if (lista.length === 0) return undefined;
  return [
    "LO APRENDIDO EN ESTE PROYECTO (lo apuntaron encargos anteriores: úsalo y no lo redescubras; si ya no es cierto, apúntalo corregido):",
    ...lista.map((a) => `- ${a.tema}: ${a.texto.replace(/\s*\n\s*/g, " ")}`),
  ].join("\n");
}

/** Cuándo apuntar, para quien tiene la tool: una tool sin un «cuándo» no se usa. */
export const USO_DE_APUNTAR_APRENDIZAJE =
  `Cuando descubras algo del proyecto o del aparato que otro encargo va a necesitar —cómo entrar en la app (usuario y ` +
  `clave), qué pulsar para llegar a una pantalla, una trampa que te costó entender—, apúntalo con \`${NOMBRE_APUNTAR_APRENDIZAJE}\` ` +
  "en cuanto lo sepas, con un tema corto. No apuntes lo que ya está en lo aprendido ni el detalle de tu encargo.";

/** Para un hijo de motor EXTERNO, que no tiene la tool: lo cuenta al volver y quien le llamó lo apunta. */
export const USO_DE_APRENDIDO_EXTERNO =
  "Si descubres algo del proyecto o del aparato que otro encargo va a necesitar (cómo entrar en la app, qué pulsar para " +
  "llegar a una pantalla, una trampa), dilo al final de tu respuesta en un apartado «Aprendido:», una línea por cosa.";
