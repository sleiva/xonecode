/**
 * La validación PURA de los dos ficheros de configuración: sin tocar disco (eso es cosa
 * de `agent/configEnDisco.ts`) y sin importar nada de langchain — la frontera de `core/`
 * está probada en `imports.test.ts`.
 *
 * Dos ficheros con dos ciclos de vida distintos, como opencode:
 *
 *  - `config.json` (proyecto o global): modelos y proveedores. Comiteable. NUNCA claves.
 *    Una clave aquí no se avisa: se RECHAZA, porque un aviso dejaría el fichero
 *    funcionando y la clave camino del commit. La alternativa —`~/.xonecode/auth.json`—
 *    está a un comando de distancia.
 *  - `auth.json` (solo global): las credenciales. En un proyecto se rechaza entero, y se
 *    comprueba el modo: un `chmod` de más, un `cp -r` o un backup restaurado dejan el
 *    fichero legible por otros, y eso hay que cantarlo al leerlo, no al día del incidente.
 *
 * Y la regla que sostiene a las dos: un aviso NUNCA contiene el valor rechazado, ni
 * truncado. Un mensaje de error acaba en logs, capturas e issues; el aviso dice QUÉ
 * campo, no QUÉ contenía. Por eso estos mensajes no interpolan nunca el valor de entrada.
 */

import { PROVEEDORES, PAPELES, type Proveedor } from "./modelos.js";
import type { Papel } from "./ports.js";

/** La configuración: modelos y proveedores. Nunca claves. */
export interface ConfigDeFichero {
  modelo?: string;
  modelos?: Partial<Record<Papel, string>>;
  ollama?: { baseUrl?: string };
  /** Topes de ventana de contexto fijados a mano, por id «proveedor/modelo». */
  contextos?: Record<string, number>;
}

/** Las credenciales, que viven en OTRO fichero y solo global. */
export type Auth = Partial<Record<Proveedor, { type?: string; key: string }>>;

export type Procedencia = "proyecto" | "global";

export interface Aviso {
  texto: string;
  severidad: "aviso" | "grave";
}

/**
 * Formas plausibles de colar una clave dentro de un `config.json`. El intento se rechaza
 * sea cual sea el valor: lo que delata es el NOMBRE del campo, porque una clave con otro
 * nombre ya no es reconocible — y estas seis cubren lo que la gente escribe a mano.
 */
const CLAVES_DENEGADAS: readonly string[] = [
  "claves",
  "apiKey",
  "api_key",
  "key",
  "secret",
  "token",
];

/** Un JSON-array NO es un objeto a estos efectos: el raíz que no sea objeto se ignora. */
function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Valida un `config.json` sin tocar disco. Lo que no entiende lo descarta y lo avisa
 * nombrándolo: un campo mal escrito tiene que producir un mensaje que lo diga, si no el
 * usuario cree haber configurado algo y no.
 */
export function validar(
  bruto: unknown,
  ruta: string,
  procedencia: Procedencia
): { config: ConfigDeFichero; avisos: Aviso[] } {
  // La procedencia no cambia ninguna regla —una clave de API se rechaza igual venga del
  // proyecto o del global—: va en la firma por simetría con `validarAuth`, que sí la usa.
  void procedencia;

  const avisos: Aviso[] = [];

  if (!esObjeto(bruto)) {
    return {
      config: {},
      avisos: [
        {
          texto: `«${ruta}»: el JSON raíz debe ser un objeto; se ignora el fichero entero.`,
          severidad: "aviso",
        },
      ],
    };
  }

  const config: ConfigDeFichero = {};

  for (const clave of Object.keys(bruto)) {
    const valor = bruto[clave];

    // El rechazo se comprueba PRIMERO, para que una clave denegada no salga también como
    // «campo desconocido»: el mismo campo con dos avisos es ruido en la dirección mala.
    const proveedorConCadena =
      (PROVEEDORES as readonly string[]).includes(clave) && typeof valor === "string";
    if (CLAVES_DENEGADAS.includes(clave) || proveedorConCadena) {
      avisos.push({
        texto: `«${ruta}»: el campo «${clave}» parece una clave de API y NO se acepta en un config.json: las claves van en ~/.xonecode/auth.json.`,
        severidad: "grave",
      });
      continue;
    }

    if (clave === "modelo") {
      if (typeof valor === "string") {
        config.modelo = valor;
      } else {
        avisos.push({
          texto: `«${ruta}»: «modelo» debe ser la cadena «proveedor/modelo»; se descarta.`,
          severidad: "aviso",
        });
      }
      continue;
    }

    if (clave === "modelos") {
      if (!esObjeto(valor)) {
        avisos.push({
          texto: `«${ruta}»: «modelos» debe ser un objeto de papel → «proveedor/modelo»; se descarta.`,
          severidad: "aviso",
        });
        continue;
      }
      const modelos: Partial<Record<Papel, string>> = {};
      for (const papel of Object.keys(valor)) {
        const idModelo = valor[papel];
        if (!(PAPELES as readonly string[]).includes(papel)) {
          avisos.push({
            texto: `«${ruta}»: «modelos.${papel}» no es un papel válido (los que hay: ${PAPELES.join(", ")}); se descarta.`,
            severidad: "aviso",
          });
        } else if (typeof idModelo !== "string") {
          avisos.push({
            texto: `«${ruta}»: «modelos.${papel}» debe ser la cadena «proveedor/modelo»; se descarta.`,
            severidad: "aviso",
          });
        } else {
          modelos[papel as Papel] = idModelo;
        }
      }
      config.modelos = modelos;
      continue;
    }

    // El tope de la ventana de contexto que la tabla de `core/contextos.ts` no
    // sabe: cada entrada es «proveedor/modelo» → tope en tokens. Se fija a mano
    // porque el usuario sabe más de SU modelo (sobre todo del local) que la tabla.
    if (clave === "contextos") {
      if (!esObjeto(valor)) {
        avisos.push({
          texto: `«${ruta}»: «contextos» debe ser un objeto «proveedor/modelo» → tope en tokens; se descarta.`,
          severidad: "aviso",
        });
        continue;
      }
      const contextos: Record<string, number> = {};
      for (const id of Object.keys(valor)) {
        const tope = valor[id];
        if (typeof tope === "number" && Number.isInteger(tope) && tope > 0) {
          contextos[id] = tope;
        } else {
          avisos.push({
            texto: `«${ruta}»: «contextos.${id}» debe ser un número entero de tokens positivo; se descarta.`,
            severidad: "aviso",
          });
        }
      }
      config.contextos = contextos;
      continue;
    }

    if (clave === "ollama") {
      // «ollama» como objeto es configuración; como cadena ya la cogió arriba el rechazo
      // de proveedor-con-cadena. Por eso el orden del if importa.
      if (!esObjeto(valor)) {
        avisos.push({
          texto: `«${ruta}»: «ollama» debe ser un objeto con «baseUrl»; se descarta.`,
          severidad: "aviso",
        });
        continue;
      }
      const ollama: { baseUrl?: string } = {};
      const baseUrl = valor["baseUrl"];
      if (baseUrl !== undefined) {
        if (typeof baseUrl === "string") {
          ollama.baseUrl = baseUrl;
        } else {
          avisos.push({
            texto: `«${ruta}»: «ollama.baseUrl» debe ser una cadena; se descarta.`,
            severidad: "aviso",
          });
        }
      }
      config.ollama = ollama;
      continue;
    }

    avisos.push({
      texto: `«${ruta}»: el campo «${clave}» no se reconoce; se descarta.`,
      severidad: "aviso",
    });
  }

  return { config, avisos };
}

/**
 * Valida un `auth.json`. Las credenciales SOLO viven en la ruta global: en un proyecto
 * se rechaza el fichero entero — no es una regla de formato, es de dónde puede vivir
 * un secreto. El modo se comprueba al leerlo porque crearlo bien no basta.
 */
export function validarAuth(
  bruto: unknown,
  ruta: string,
  modo: number,
  procedencia: Procedencia
): { auth: Auth; avisos: Aviso[] } {
  const avisos: Aviso[] = [];

  if (procedencia === "proyecto") {
    return {
      auth: {},
      avisos: [
        {
          texto: `«${ruta}»: auth.json solo se acepta en la ruta global (~/.xonecode/auth.json), nunca dentro de un proyecto; se ignora el fichero entero.`,
          severidad: "grave",
        },
      ],
    };
  }

  if ((modo & 0o077) !== 0) {
    avisos.push({
      texto: `«${ruta}»: el fichero de credenciales es legible por otros usuarios (grupo y resto); ejecuta chmod 600 ${ruta}.`,
      severidad: "grave",
    });
  }

  if (!esObjeto(bruto)) {
    avisos.push({
      texto: `«${ruta}»: el JSON raíz debe ser un objeto; se ignora el fichero.`,
      severidad: "aviso",
    });
    return { auth: {}, avisos };
  }

  const auth: Auth = {};

  for (const clave of Object.keys(bruto)) {
    const valor = bruto[clave];

    if (!(PROVEEDORES as readonly string[]).includes(clave)) {
      avisos.push({
        texto: `«${ruta}»: «${clave}» no es un proveedor conocido (los que hay: ${PROVEEDORES.join(", ")}); se descarta.`,
        severidad: "aviso",
      });
      continue;
    }

    // La forma que va a escribir la gente a mano: {"proveedor": "sk-…"}.
    if (typeof valor === "string") {
      auth[clave as Proveedor] = { key: valor };
      continue;
    }

    if (esObjeto(valor)) {
      const key = valor["key"];
      if (typeof key === "string") {
        const tipo = valor["type"];
        auth[clave as Proveedor] =
          typeof tipo === "string" ? { key, type: tipo } : { key };
        continue;
      }
    }

    avisos.push({
      texto: `«${ruta}»: la credencial de «${clave}» debe ser «{ "key": "…" }» o una cadena; se descarta.`,
      severidad: "aviso",
    });
  }

  return { auth, avisos };
}