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
  /** Cómo se abrió este proyecto. Las credenciales nunca se guardan aquí. */
  modo?: "offline" | "cloud";
  modelo?: string;
  modelos?: Partial<Record<Papel, string>>;
  /** Tema visual de la consola, persistido solo cuando pertenece al proyecto. */
  tema?: string;
  /**
   * A qué entorno de `~/.xonecode/settings.json` pertenece este proyecto.
   *
   * Convive con `cloudstudio.url` y no la sustituye: el `entorno` es la referencia (la que
   * dice de qué juego de credenciales OAuth se lee, `porEntorno[id]` en
   * `agent/cloudstudioMcp.ts`) y la URL es la copia operativa que la sincronización lee
   * exactamente igual que antes de que los entornos existieran. Quitar la URL habría
   * obligado a tocar `crearSincronizador` y todo lo que cuelga de él, que es justo lo que
   * el diseño de la consola web se comprometió a no tocar.
   */
  entorno?: string;
  /** Endpoint MCP de CloudStudio. Las credenciales OAuth viven solo en el almacén global. */
  cloudstudio?: {
    url: string;
    scopes?: string[];
    /** Identidad no sensible del proyecto remoto elegido. */
    proyecto?: { id: string; nombre: string };
    /** La rama ORIGEN: de la que se baja y contra la que se compara. */
    rama?: string;
  };
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
 *
 * Exportada porque `core/settings.ts` la reutiliza tal cual: dos listas de nombres de
 * credencial que empiezan iguales y divergen con el tiempo es justo el bug que se midió
 * («key» —el campo que usa `auth.json`— faltaba en la copia que tenía `settings.ts`).
 */
/**
 * ¿Vale eso como clave de API? Devuelve el MOTIVO del rechazo, o `undefined` si pasa.
 *
 * La regla no es nuestra: es la que aplica el harness de DeepSeek en su panel de modelos,
 * y la razón es que una clave de API acaba siendo el valor de una cabecera HTTP — todo
 * carácter ASCII imprimible (`\x21`–`\x7E`) cabe ahí y ninguno más. Un espacio, un
 * tabulador, un salto de línea o una eñe no llegan al proveedor: fallan al construir la
 * petición, o peor, viajan mutilados y el error que vuelve habla de autorización.
 *
 * Las otras dos son de pegado, no de formato, y las dos se han visto de verdad:
 * - `ANTHROPIC_API_KEY=sk-…`, la línea entera del `.env` copiada de un tirón;
 * - `"sk-…"`, con las comillas de la línea de la que salió.
 *
 * Ninguna de las dos se «arregla» por nuestra cuenta quitando lo que sobra: no se puede
 * saber si el usuario quería eso, y una clave adivinada que resulta ser válida enseña a
 * pegar mal. Se rechaza diciendo qué pasa, que es lo que se puede afirmar.
 *
 * Lo que NO comprueba es que la clave sirva — eso solo lo sabe el proveedor, y el sitio
 * donde se pregunta es el catálogo (`cli/wizardInicial.ts`, que lista antes de escribir).
 * Ésta es la criba de balde: la que evita gastar una llamada para que te digan lo que el
 * propio campo ya decía.
 */
export function motivoDeClaveInaceptable(clave: string): string | undefined {
  const limpia = clave.trim();
  if (limpia === "") return "la clave está vacía";
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(limpia)) {
    return "eso parece una línea de entorno («NOMBRE=valor»): pega solo el valor, sin el nombre ni el «=»";
  }
  if (/^"[^]*"$/.test(limpia) || /^'[^]*'$/.test(limpia)) {
    return "la clave viene entre comillas: pega solo el valor, sin ellas";
  }
  // eslint-disable-next-line no-control-regex
  if (!/^[\x21-\x7e]+$/.test(limpia)) {
    return "la clave lleva espacios o caracteres que no pueden viajar en una cabecera HTTP";
  }
  return undefined;
}

export const CLAVES_DENEGADAS: readonly string[] = [
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

    if (clave === "modo") {
      if (valor === "offline" || valor === "cloud") {
        config.modo = valor;
      } else {
        avisos.push({
          texto: `«${ruta}»: «modo» debe ser «offline» o «cloud»; se descarta.`,
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

    if (clave === "tema") {
      if (typeof valor === "string") {
        config.tema = valor;
      } else {
        avisos.push({
          texto: `«${ruta}»: «tema» debe ser una cadena; se descarta.`,
          severidad: "aviso",
        });
      }
      continue;
    }

    if (clave === "entorno") {
      // Un id vacío no es «sin entorno»: es un id que no se puede buscar en
      // `settings.json`, y dejarlo pasar haría que el juego de credenciales se leyera bajo
      // la clave "" en vez de caer en `legado` como cae un proyecto de antes de los entornos.
      if (typeof valor === "string" && valor.trim() !== "") {
        config.entorno = valor;
      } else {
        avisos.push({
          texto: `«${ruta}»: «entorno» debe ser el id no vacío de un entorno de settings.json; se descarta.`,
          severidad: "aviso",
        });
      }
      continue;
    }

    if (clave === "cloudstudio") {
      if (!esObjeto(valor) || typeof valor.url !== "string") {
        avisos.push({
          texto: `«${ruta}»: «cloudstudio» debe ser un objeto con la URL HTTPS «url»; se descarta.`,
          severidad: "aviso",
        });
        continue;
      }
      try {
        const url = new URL(valor.url);
        if (url.protocol !== "https:" || url.username !== "" || url.password !== "") throw new Error();
        const scopes = valor.scopes;
        const proyectoBruto = valor.proyecto;
        const proyecto = proyectoBruto === undefined
          ? undefined
          : esObjeto(proyectoBruto) && typeof proyectoBruto.id === "string" && proyectoBruto.id.trim() !== "" &&
              typeof proyectoBruto.nombre === "string" && proyectoBruto.nombre.trim() !== ""
            ? { id: proyectoBruto.id, nombre: proyectoBruto.nombre }
            : undefined;
        if (proyectoBruto !== undefined && proyecto === undefined) {
          avisos.push({
            texto: `«${ruta}»: «cloudstudio.proyecto» debe tener «id» y «nombre» no vacíos; se descarta.`,
            severidad: "aviso",
          });
        }
        const ramaBruta = valor.rama;
        const rama = typeof ramaBruta === "string" && ramaBruta.trim() !== "" ? ramaBruta : undefined;
        if (ramaBruta !== undefined && rama === undefined) {
          avisos.push({
            texto: `«${ruta}»: «cloudstudio.rama» debe ser un nombre no vacío; se descarta.`,
            severidad: "aviso",
          });
        }
        if (scopes !== undefined && (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === "string" && scope.trim() !== ""))) {
          avisos.push({
            texto: `«${ruta}»: «cloudstudio.scopes» debe ser una lista de permisos no vacíos; se descarta.`,
            severidad: "aviso",
          });
          config.cloudstudio = {
            url: url.toString(),
            ...(proyecto === undefined ? {} : { proyecto }),
            ...(rama === undefined ? {} : { rama }),
          };
        } else {
          config.cloudstudio = {
            url: url.toString(),
            ...(scopes === undefined ? {} : { scopes: [...scopes] }),
            ...(proyecto === undefined ? {} : { proyecto }),
            ...(rama === undefined ? {} : { rama }),
          };
        }
      } catch {
        avisos.push({
          texto: `«${ruta}»: «cloudstudio.url» debe ser una URL HTTPS sin credenciales; se descarta.`,
          severidad: "aviso",
        });
      }
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
