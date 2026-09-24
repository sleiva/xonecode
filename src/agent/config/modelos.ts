import { randomUUID } from "node:crypto";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";
import type { ModelosPort, Papel } from "../../core/ports.js";
import {
  COMPATIBLES_OPENAI, compatibleConOpenAi, esProveedorPersonalizado, parsear, resolver,
  pideThinkingAdaptativo, aceptaThinkingAdaptativo,
  type Eleccion, type FuentesDeEleccion, type Proveedor, type ProveedorDeclarado,
} from "../../core/modelos.js";
import { topeDeSalida } from "../../core/contextos.js";
import { esfuerzoAplicable, type CapacidadesVivas, type Esfuerzo } from "../../core/esfuerzo.js";
import { baseUrlDeOllama, baseUrlDeOllamaCloud } from "./catalogoModelos.js";
import { crearMemoriaDeEco, fetchConEcoDeRazonamiento } from "./ecoDeRazonamiento.js";
import { ChatGoogleGenerativeAICompatible } from "./gemini.js";
import { userIdDeDeepSeekEnDisco } from "./identidadEnDisco.js";

/**
 * Construye el modelo de cada papel. NO lleva la marca de doble: es real.
 *
 * Los clientes se construyen PEREZOSAMENTE, al pedir el papel: `describe` solo llama a
 * `descripcion()`, y construir cuatro clientes para imprimir un texto obligaría a tener
 * las claves puestas para poder mirar la configuración — justo lo que este comando evita.
 */
export class Modelos implements ModelosPort {
  private readonly eleccion: Record<Papel, Eleccion>;

  /**
   * Los proveedores personalizados, y es una FUNCIÓN y no una lista a propósito.
   *
   * `fuentes` se lee UNA vez, al arrancar el proceso, así que una lista capturada aquí
   * dejaba muerto el flujo que el usuario hace primero: dar de alta un proveedor en
   * Ajustes, ponerle la clave, elegir su modelo y hablar — y el turno reventaba con «no
   * está dado de alta; añádelo en Ajustes», que es justo lo que acababa de hacer. Quien
   * construye pasa `proveedoresPersonalizados` (`agent/config/configEnDisco.ts`), que relee el
   * config global; sin nada, se cae a lo que trajera `fuentes`, que es lo que había.
   *
   * Del `config.json` GLOBAL y de ningún otro: la regla la impone `core/config.ts` al
   * validar, y aquí no se vuelve a mirar el del proyecto ni por descuido.
   */
  private readonly personalizados: () => readonly ProveedorDeclarado[];

  /**
   * Lo que el servidor ya sabe de un modelo porque se lo PREGUNTÓ, y entra por aquí en vez
   * de consultarse dentro.
   *
   * Hoy solo Ollama: sus capacidades se piden con `POST /api/show`, que es asíncrono y toca
   * la red, mientras que construir un modelo es síncrono —`paraPapel` devuelve el cliente,
   * no una promesa— y lo llama el grafo en mitad de un turno. Son las dos cadencias que ya
   * declara `contextos.ts` sobre el `max_input_tokens` del catálogo vivo, y la salida es la
   * misma que con los proveedores personalizados: una FUNCIÓN que quien construye rellena
   * con lo que ya midió, en vez de una consulta escondida aquí dentro.
   *
   * **Ausente es la dirección segura**: sin capacidades, `nivelesDeEsfuerzo` no afirma nada
   * de un modelo de Ollama y el parámetro no se manda. Eso importa porque pedirle pensar a
   * un modelo que no piensa NO es una respuesta peor — medido, `ministral-3:3b` contesta
   * `"ministral-3:3b" does not support thinking` y el turno se cae.
   */
  private readonly capacidades: (proveedor: Proveedor, modelo: string) => CapacidadesVivas | undefined;

  /**
   * El esfuerzo de la SESIÓN, que es el que vale cuando quien pide un modelo no dice otro.
   *
   * Va en el constructor y no en cada llamada porque así los diez llamadores de
   * `paraPapel` —el turno, el juez, el aumentador, el juez visual— no cambian ni una línea:
   * la sesión ya reconstruye `Modelos` cuando el usuario toca algo (es como funciona
   * `/modelo`), así que el sitio donde esto entra ya existe.
   *
   * Un subagente que fije el SUYO gana, porque `paraModelo` recibe el nivel explícito.
   */
  private readonly esfuerzoDeLaSesion: Esfuerzo | undefined;

  /**
   * El `user_id` que DeepSeek usa para separar a las personas de una misma cuenta
   * (`core/identidadDeProveedor.ts` explica por qué hace falta con claves distintas).
   *
   * **Por omisión es el lector REAL** (`userIdDeDeepSeekEnDisco`), y no `undefined`: un
   * parámetro opcional que nadie pasa es el patrón de fallo de este repo en su forma más
   * limpia —el `Calificador`—, y aquí hay diez `new Modelos(` en producción. Así los diez
   * quedan cableados sin tocar ninguno, y lo que se pasa a mano es la EXCEPCIÓN (un test).
   * Es una función y se llama en cada construcción: el login puede llegar con la consola
   * abierta.
   */
  private readonly identidad: () => string | undefined;

  constructor(
    fuentes: FuentesDeEleccion = {},
    personalizados?: () => readonly ProveedorDeclarado[],
    capacidades?: (proveedor: Proveedor, modelo: string) => CapacidadesVivas | undefined,
    esfuerzo?: Esfuerzo,
    identidad?: () => string | undefined,
  ) {
    this.eleccion = resolver(fuentes);
    this.identidad = identidad ?? (() => userIdDeDeepSeekEnDisco(fuentes));
    this.personalizados = personalizados ?? (() => fuentes.global?.proveedores ?? []);
    this.capacidades = capacidades ?? (() => undefined);
    this.esfuerzoDeLaSesion = esfuerzo;
  }

  paraPapel(papel: Papel, esfuerzo?: Esfuerzo): unknown {
    return construirModelo(
      this.eleccion[papel], this.personalizados(), esfuerzo ?? this.esfuerzoDeLaSesion, this.capacidades, this.identidad,
    );
  }

  /**
   * Un modelo concreto por su «proveedor/modelo». `parsear` es la MISMA función que valida
   * `--modelo` y `/modelo`, no una copia: un id mal escrito en el `.md` de un agente tiene
   * que fallar igual y con el mismo mensaje que uno mal escrito en la línea de comandos.
   */
  paraModelo(id: string, esfuerzo?: Esfuerzo): unknown {
    return construirModelo(
      parsear(id), this.personalizados(), esfuerzo ?? this.esfuerzoDeLaSesion, this.capacidades, this.identidad,
    );
  }

  descripcion(): Record<Papel, string> {
    const salida = {} as Record<Papel, string>;
    for (const [papel, e] of Object.entries(this.eleccion) as [Papel, Eleccion][]) {
      salida[papel] = `${e.proveedor}/${e.modelo}  (${e.origen})`;
    }
    return salida;
  }
}

/**
 * El cliente de OpenAI apuntado a otro host: NVIDIA, Groq y xAI publican la misma API.
 *
 * La clave se exige AQUÍ y no se deja en `undefined`, que es lo que hace el caso de
 * `openai`. No es simetría rota: `ChatOpenAI` sin `apiKey` se la busca él en
 * `OPENAI_API_KEY`, así que un `NVIDIA_API_KEY` sin poner haría que la clave de OpenAI
 * del usuario viajara a `integrate.api.nvidia.com` con la primera petición. El mensaje es
 * el mismo que da el catálogo cuando falta la credencial, porque es el mismo problema.
 */
/**
 * **`reasoningEffort` NO sirve aquí, y falla EN SILENCIO.** Medido en `@langchain/openai`
 * 1.5.5: `_getReasoningParams` empieza con `if (!isReasoningModel(this.model)) return;`, y
 * ese predicado (`utils/misc.js`) solo reconoce los nombres de OpenAI — `/^o\d/` y
 * `gpt-5*`. Un `deepseek-flash`, un `openai/gpt-oss-20b` o un `nvidia/nemotron-3-…` no
 * casan, así que el campo se descarta antes de componer la petición y el payload sale sin
 * él: ni error, ni aviso, ni diferencia visible — el mismo patrón que el `max_tokens` de
 * 4096 de Anthropic, y descubierto igual, preguntándole al cliente por sus parámetros.
 *
 * `modelKwargs` es la puerta que sí llega: el cliente lo vuelca tal cual en el cuerpo.
 * Comprobado en la prueba de costura, que es lo único que puede sostener esta afirmación.
 */
/**
 * El `User-Agent` que llevan las peticiones a OpenCode (Go y Zen). Su documentación exige uno
 * propio — sin él, el servidor contesta 400. No es una tabla porque hoy solo lo pide un
 * proveedor: el día que otro lo exija, esto se convierte en una fila más.
 */
const AGENTE_DE_USUARIO_OPENCODE = "xonecode/1.0";

function construirCompatibleOpenAi(
  proveedor: Proveedor,
  modelo: string,
  { baseUrl, variable }: { baseUrl: string; variable: string },
  esfuerzo?: Esfuerzo,
  identidad: () => string | undefined = () => undefined,
): unknown {
  const apiKey = process.env[variable];
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new Error(`falta la credencial para ${proveedor} (${variable}); usa /provider ${proveedor}`);
  }
  /**
   * **A DeepSeek se le RESTAURA el eco del razonamiento, y por eso puede pensar aquí.**
   *
   * Su documentación: con el parámetro `tools` presente, el `reasoning_content` de TODOS
   * los turnos anteriores hay que devolvérselo, y si no, 400. Un agente manda siempre
   * `tools`. Y `@langchain/openai` no lo devuelve nunca —lo guarda al entrar y lo tira al
   * salir, por los dos conversores—, así que el eco hay que reponerlo.
   *
   * Se repone en el `fetch`, que es la única costura declarada que alcanza al cuerpo de la
   * petición: la conversión de mensajes es interna al cliente y no la toca ni un método
   * sobrescribible ni un middleware. Ver `ecoDeRazonamiento.ts`, que explica el emparejado
   * por id de tool call y el `tee()` que no bufferiza el flujo.
   *
   * **La memoria es por CLIENTE**, o sea una por modelo construido, y eso es lo que se
   * quiere: los ids de tool call viven dentro de una conversación, y compartir una memoria
   * global entre sesiones solo serviría para que creciera.
   *
   * **Honesto sobre lo probado**: el mecanismo está medido de punta a punta contra la API
   * real —captura el razonamiento del flujo SSE y lo vuelve a pegar—, pero el 400 original
   * NO se pudo reproducir en el experimento (cuatro vueltas con tools, pensamiento y
   * streaming pasaron sin él). O sea que esto hace lo que su documentación pide, y que eso
   * CURE aquel fallo concreto está por confirmar. Si vuelve, el registro de fallos
   * (`registroDeFallos.ts`) ya lo captura entero.
   */
  /**
   * **Y a DeepSeek se le dice QUIÉN pide**, con el `user_id` del login de CloudStudio. Va en
   * la RAÍZ del cuerpo —es lo que su documentación pide para la API compatible con OpenAI— y
   * por `modelKwargs`, la misma puerta que el esfuerzo; no por el `user` nativo del SDK, que
   * es otro campo. Solo DeepSeek: a los otros compatibles sería mandarles un campo que no
   * conocen. Sin login no se manda, y **un personalizado apuntado a DeepSeek no lo lleva**:
   * la regla es por proveedor de serie, y ahí no sabemos a quién estamos hablando.
   */
  const userId = proveedor === "deepseek" ? identidad() : undefined;
  const kwargs = {
    ...(esfuerzo === undefined ? {} : { reasoning_effort: esfuerzo }),
    ...(userId === undefined ? {} : { user_id: userId }),
  };
  /**
   * **OpenCode (Go y Zen) exige un `User-Agent` propio y un `x-opencode-session` estable**,
   * o el servidor contesta 400. El id se genera UNA vez, al construir el cliente — no en
   * cada llamada —, así que vale como «id estable durante la conversación»: este cliente se
   * reconstruye al abrir la sesión y en `/modelo` (`turnoReal.ts#construir`), que es
   * exactamente el ciclo de vida al que la documentación de OpenCode ata la sesión. Solo
   * estos dos proveedores: mandarle esta cabecera a otro compatible sería un campo que no
   * pidió y que no hace nada.
   */
  const esOpenCode = proveedor === "opencode-go" || proveedor === "opencode-zen";
  return new ChatOpenAI({
    model: modelo, apiKey,
    configuration: {
      baseURL: baseUrl,
      ...(proveedor === "deepseek"
        ? { fetch: fetchConEcoDeRazonamiento(crearMemoriaDeEco()) }
        : {}),
      ...(esOpenCode
        ? {
            defaultHeaders: {
              "User-Agent": AGENTE_DE_USUARIO_OPENCODE,
              "x-opencode-session": randomUUID(),
            },
          }
        : {}),
    },
    ...(Object.keys(kwargs).length === 0 ? {} : { modelKwargs: kwargs }),
  });
}

/** El cliente de un `{proveedor, modelo}`, venga de un papel o de la elección de un agente. */
function construirModelo(
  { proveedor, modelo }: { proveedor: Proveedor; modelo: string },
  personalizados: readonly ProveedorDeclarado[] = [],
  esfuerzoPedido?: Esfuerzo,
  capacidades: (proveedor: Proveedor, modelo: string) => CapacidadesVivas | undefined = () => undefined,
  identidad: () => string | undefined = () => undefined,
): unknown {
    /**
     * **El nivel se criba AQUÍ y contra ESTE modelo, no donde se eligió.**
     *
     * Elegir y aplicar están separados en el tiempo: el esfuerzo se fija una vez y el
     * modelo se cambia después, así que un `xhigh` puesto con Opus 5 sigue puesto cuando
     * alguien se pasa a Gemini —que no lo tiene— o a un Ollama que no piensa. Mandarlo
     * entonces no da una respuesta peor: da un 400 en Gemini y un
     * `does not support thinking` en Ollama.
     *
     * `esfuerzoAplicable` devuelve `undefined` en ese caso y cada rama omite el parámetro,
     * que es exactamente lo que este harness hacía antes de que esto existiera. No se
     * sustituye por el nivel más parecido: bajar un `xhigh` a `high` por nuestra cuenta
     * sería decidir en nombre de alguien, y aquí eso se paga en tokens que no pidió.
     */
    const esfuerzo = esfuerzoAplicable(esfuerzoPedido, proveedor, modelo, capacidades(proveedor, modelo));
    // Un personalizado se resuelve ANTES del switch, contra el registro: sin él no hay URL
    // base, y eso es un alta que falta y no un proveedor roto. El switch de abajo sigue
    // siendo exhaustivo sobre los de serie.
    if (esProveedorPersonalizado(proveedor)) {
      const fila = compatibleConOpenAi(proveedor, personalizados);
      if (fila === undefined) {
        throw new Error(
          `el proveedor personalizado «${proveedor}» no está dado de alta; añádelo en Ajustes → Proveedores`,
        );
      }
      return construirCompatibleOpenAi(proveedor, modelo, fila, esfuerzo);
    }
    switch (proveedor) {
      case "nvidia":
      case "groq":
      case "xai":
      case "deepseek":
      case "opencode-go":
      case "opencode-zen":
        // Enumerados uno a uno, y no un `default`, para que el switch siga siendo
        // exhaustivo: el día que se añada un proveedor, esto tiene que dar un error de
        // compilación y no construir un cliente equivocado en silencio.
        return construirCompatibleOpenAi(proveedor, modelo, COMPATIBLES_OPENAI[proveedor], esfuerzo, identidad);
      case "openai":
        return new ChatOpenAI({
          model: modelo,
          apiKey: process.env.OPENAI_API_KEY,
          // Sin fila en la tabla, `esfuerzo` siempre llega `undefined` y esto no manda nada:
          // el cableado está puesto para el día que alguien MIDA qué modelos de OpenAI lo
          // aceptan, que es una fila de datos y no un cambio aquí. Va por `modelKwargs`
          // como los compatibles —y no por `reasoningEffort`— para que sea EL MISMO camino
          // en los cinco: el filtro `isReasoningModel` reconoce los ids de OpenAI, pero un
          // segundo camino sería un segundo sitio donde esto puede dejar de llegar.
          ...(esfuerzo === undefined ? {} : { modelKwargs: { reasoning_effort: esfuerzo } }),
        });
      case "anthropic":
        // El tope de salida se fija A MANO y el razonamiento se pide cuando hace falta;
        // las dos decisiones son datos de `core/` (`topeDeSalida`,
        // `pideThinkingAdaptativo`) y están ahí documentadas con lo que se midió.
        //
        // En corto: el `max_tokens` por omisión de la dependencia sale de una tabla por
        // prefijo y un id que no conoce cae en 4096 SIN DECIRLO —medido con
        // `claude-sonnet-5`—, que en un harness que escribe ficheros corta a media
        // escritura; y omitir `thinking` corre sin pensar en la generación 4.6-4.8,
        // mientras que pedirlo a Haiku o a lo anterior a 4.6 sería un 400.
        return new ChatAnthropic({
          model: modelo,
          apiKey: process.env.ANTHROPIC_API_KEY,
          ...(topeDeSalida("anthropic", modelo) === undefined
            ? {}
            : { maxTokens: topeDeSalida("anthropic", modelo) }),
          // El razonamiento se pide cuando hace falta (la generación 4.6-4.8, que sin
          // pedirlo corre sin pensar) Y TAMBIÉN cuando se manda esfuerzo: las dos cosas
          // están acopladas, y `claude-opus-5` con `effort:"max"` y sin `thinking` explícito
          // es una petición que el propio cliente se niega a componer. Medido contra su
          // validador, que corre en local y por eso lo caza la prueba de costura.
          ...(pideThinkingAdaptativo("anthropic", modelo)
            || (esfuerzo !== undefined && aceptaThinkingAdaptativo("anthropic", modelo))
            ? { thinking: { type: "adaptive" as const } }
            : {}),
          // El esfuerzo va DENTRO de `outputConfig`, no suelto, y acompaña al `thinking`:
          // omitirlo ya es `high` en esta casa, así que esto solo viaja cuando se pide otra
          // cosa. La frontera de qué modelos lo aceptan es hermana de la del `thinking`
          // —Haiku 4.5 y lo anterior dan error con los dos— y vive en `core/esfuerzo.ts`.
          ...(esfuerzo === undefined ? {} : { outputConfig: { effort: esfuerzo } }),
        });
      case "ollama":
        return new ChatOllama({
          model: modelo,
          baseUrl: baseUrlDeOllama(),
          ...(esfuerzo === undefined ? {} : { think: esfuerzo as unknown as boolean }),
        });
      case "ollama-cloud":
        return new ChatOllama({
          model: modelo,
          baseUrl: baseUrlDeOllamaCloud(),
          headers: { authorization: `Bearer ${process.env.OLLAMA_API_KEY ?? ""}` },
          ...(esfuerzo === undefined ? {} : { think: esfuerzo as unknown as boolean }),
        });
      case "gemini":
        return new ChatGoogleGenerativeAICompatible({
          model: modelo,
          apiKey: process.env.GOOGLE_API_KEY,
          // Gemini no lo llama esfuerzo: lo suyo es `thinkingConfig.thinkingLevel` y en
          // VERSALES. La traducción se hace aquí y no en `core/` porque es la forma del
          // cliente, igual que `outputConfig` es la de Anthropic — la tabla dice QUÉ
          // niveles hay, y cada rama sabe cómo se escriben los suyos.
          ...(esfuerzo === undefined
            ? {}
            : { thinkingConfig: { thinkingLevel: esfuerzo.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" } }),
        });
    }
    /**
     * **La guarda que hacía que el comentario de arriba fuera verdad.**
     *
     * Ese comentario promete que añadir un proveedor da un error de compilación aquí, y no
     * lo daba: sin esto el `switch` sin salida devuelve `undefined`, que encaja en el
     * `unknown` del retorno. Se vio al añadir `deepseek`: compilaba limpio y el proveedor
     * nuevo se habría colado devolviendo un modelo `undefined`, para reventar más adelante
     * lejos de la causa. Con el `never`, el caso que falte no compila — que es lo que el
     * comentario decía y no cumplía.
     */
    return ((nunca: never) => {
      throw new Error(`proveedor sin construir: ${String(nunca)}`);
    })(proveedor);
}
