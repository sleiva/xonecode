/**
 * El veredicto de «¿se puede lanzar esta app en este dispositivo?»: el predicado de listo y el
 * catálogo de causas por las que NO lo está, cada una con su frase y con dónde se arregla.
 *
 * **Por qué esto existe, y es un caso medido.** El `launchApplication` del framework contesta
 * `{"result":true}` y eso es un ACUSE, no una medida: a un proyecto cuyo `app.xml` declara
 * `<connection name="main" connstring="bd/gestion.db" />` y que **no tiene** ese fichero le
 * contestó `true`, y la app murió detrás en un diálogo «Error opening database». El verificador
 * no lo caza —`xone-simulator validate` sobre ese mismo proyecto da `success: true`, 0 errores
 * y 0 avisos, porque **no mira la conexión**—, así que el síntoma es el peor de todos: nada
 * falla por ningún lado y la app no arranca.
 *
 * **Y lo que se comprueba NO se deduce de `app.xml`: la base es `bd/gestion.db` POR DEFECTO.**
 * Aquí hubo una regla que solo miraba los `connstring` declarados con forma de ruta, y es un
 * **falso negativo**, que es el error peligroso de este módulo: medido sobre los proyectos
 * reales, **solo MinitsMT declara su base** (`<connection name="NoReplica"
 * connstring="bd/gestion.db" />`); MyAllXOne y Replanteos_2026 declaran únicamente conexiones de
 * proveedor (`Provider=…`), AppDemo no declara **ninguna**, y **los cuatro tienen su
 * `bd/gestion.db`**. O sea: la declaración es la forma RARA, y una regla que dependiera de ella
 * dejaría sin comprobar justo lo que se quería comprobar —el caso medido, el diálogo «Database
 * not found»— en tres de cada cuatro proyectos. Comprobado en el aparato: XOne usa esa ruta por
 * defecto, se declare o no. Así que la comprobación tiene DOS entradas y una sola pregunta: la
 * ruta de la convención siempre, más cualquier otra ruta que el `app.xml` declare —una segunda
 * base es un sitio distinto donde puede faltar un fichero—.
 *
 * Datos puros y sin efectos: lo caro entra por parámetro (`existe`, los textos de los ficheros),
 * que es lo que deja `npm test` sin disco y sin dispositivo. Quien lee el proyecto y mide la
 * máquina es `web/servidor` / `agent/`.
 *
 * **Y el catálogo es una unión discriminada y no una lista de booleanos.** Cada causa lleva sus
 * datos (el nombre del dispositivo, el `connstring` que falta) porque la frase los necesita, y
 * el `switch` de `motivoDeBloqueo` va exhaustivo y sin `default`: añadir una causa es un error de
 * compilación hasta que alguien escriba qué decir y dónde se arregla. Una lista de booleanos se
 * amplía en silencio, y lo que se amplía en silencio es lo que acaba sin frase.
 */
import { esAlcanzable, type Dispositivo } from "./dispositivos.js";
import {
  type ConexionDeclarada,
  conexionesDeApp,
  esRutaDeFichero,
  nombreDeApp,
} from "./descriptoresDeApp.js";

/**
 * Lo MÍNIMO que el veredicto necesita saber del framework de XOne en el dispositivo.
 *
 * **Se declara aquí y no se importa de `agent/dispositivos/dispositivosEnMaquina.ts`**, que tiene el tipo
 * rico (`FrameworkEnDispositivo`, con `paquete` y `detalle`) y que lo satisface por ESTRUCTURA:
 * `core/` declara la forma que consume y no mira hacia `agent/`, que además importa de `core/`
 * y sería un ciclo. Y no lo caza ningún test —`core/imports.test.ts` vigila langchain, ink y
 * compañía, no esto—, así que el día que alguien «reutilice» el tipo de `agent/` no habrá rojo
 * que leer: habrá una capa mirando hacia arriba en silencio.
 */
export interface FrameworkMedido {
  instalado: boolean;
}

/**
 * La base local de una app XOne, siempre en el mismo sitio: `bd/gestion.db`.
 *
 * **Es una convención de la plataforma, no algo que haya que leer de `app.xml`.** XOne la usa
 * por defecto cuando no se declara ninguna conexión, así que un proyecto que no la declara **sí
 * la necesita**, y comprobar solo lo declarado dejaría sin comprobar el caso más común —está
 * medido: de cuatro proyectos reales, tres no la declaran y los cuatro la tienen—.
 *
 * Se comprueba tal cual, sin normalizar, porque es como la nombra el propio XOne y como la
 * declara el esqueleto de `core/esqueleto.ts`.
 */
export const RUTA_DE_LA_BASE = "bd/gestion.db";

/**
 * Todo lo que puede impedir un lanzamiento, con el dato que hace falta para decirlo.
 *
 * Las tres primeras son del eje DISPOSITIVO (no hay ninguno, el elegido ya no está, o está pero
 * no se llega a él), `plataforma-sin-camino` es del eje CAMINO, las dos del framework son del
 * eje MEDIDA, y las cuatro últimas del PROYECTO —de `app.xml` para abajo—.
 *
 * **Y no está «no declara ninguna conexión», que estuvo y se quitó.** Un proyecto que no declara
 * ninguna `<connection>` no tiene nada que comprobar, y no declarar ninguna no es síntoma de
 * nada: medido, AppDemo —la app con la que se prueba— declara cero y arranca. Bloquear ahí es el
 * mismo error que este catálogo evita para los `connstring` de proveedor, cometido con el caso
 * vecino, y además negaría el lanzamiento de la app que alguien nombró. Lo que el recorrido
 * quiera decir de las conexiones lo lleva `Veredicto.conexiones`, que es un DATO y no una causa.
 */
export type CausaDeBloqueo =
  | { causa: "sin-dispositivo-elegido" }
  | { causa: "dispositivo-desconocido" }
  | { causa: "dispositivo-no-alcanzable"; nombre: string; estado: Dispositivo["estado"] }
  | { causa: "framework-ausente"; nombre: string }
  | { causa: "framework-no-medido"; nombre: string }
  | { causa: "sin-app-xml" }
  | { causa: "app-xml-ilegible"; motivo: string }
  | { causa: "falta-el-fichero-de-la-conexion"; connstring: string }
  | { causa: "falta-la-base" }
  | { causa: "plataforma-sin-camino"; plataforma: Dispositivo["plataforma"] };

/**
 * Lo que el veredicto necesita, ya resuelto por quien SÍ puede tocar el disco y la máquina.
 *
 * El dispositivo llega resuelto porque resolverlo es cruzar la elección de la sesión con la
 * última medida, y eso pide el informe entero: aquí llega el `Dispositivo` o nada.
 */
export interface EntradaDeVeredicto {
  /** El dispositivo de la sesión, ya cruzado con la última medida. `undefined` = no hay ninguno. */
  dispositivo: Dispositivo | undefined;
  /**
   * El id que la sesión tiene ELEGIDO, cuando no se ha podido resolver contra la medida.
   *
   * Es lo único que separa «no has elegido nada» de «elegiste uno que ahora no está»: las dos
   * llegan aquí con `dispositivo: undefined`, y sin este campo la segunda se contaría como la
   * primera — decirle a alguien que no eligió cuando sí eligió es la clase de mentira que esta
   * casa no se permite. Con el elegido resuelto se deja sin poner: manda `dispositivo`.
   */
  elegido?: string;
  /** Lo que se midió del framework en ESE dispositivo. `undefined` = nadie lo ha medido. */
  framework: FrameworkMedido | undefined;
  /** El texto de `app.xml` del proyecto. */
  xml: string | undefined;
  /**
   * Por qué no se pudo leer `app.xml`: UNA línea, nunca la salida entera. Que venga puesto es
   * lo que distingue «no hay app.xml» de «hay algo que no se deja leer», que no son la misma
   * cosa ni se arreglan en el mismo sitio.
   */
  motivoDeLectura?: string;
  /** El texto de `app.ini`. **Su ausencia NO bloquea**: sin él solo se pierde el nombre. */
  ini: string | undefined;
  /** ¿Existe esa ruta del proyecto? Inyectado: `core/` no toca el disco. */
  existe: (rutaRelativa: string) => boolean;
}

export interface Veredicto {
  listo: boolean;
  /** TODAS las causas, no solo la primera. Ver `motivoDeBloqueo` para la frase de cada una. */
  causas: CausaDeBloqueo[];
  /** El nombre de la app que dice `app.ini`, si se pudo leer. Ausente = no consta. */
  app?: string;
  /** Las conexiones declaradas, para poder decirlas en el recorrido antes de lanzar. */
  conexiones: ConexionDeclarada[];
}

/**
 * ¿Está este dispositivo listo para lanzar? Alcanzable **y** con el framework instalado.
 *
 * **Un framework sin medir NO es un framework ausente, y aquí las dos cosas dan «no listo» pero
 * la frase que lo acompaña es distinta** —«no se sabe» no se arregla instalando nada—. El
 * predicado se queda con el lado conservador: un botón de lanzar sobre un «no se sabe» es la
 * promesa que este repo no se permite, porque el acuse del framework llega igual y el fallo
 * aparece detrás, en la app.
 *
 * Es el eje DISPOSITIVO de `puedeLanzarse`, no el veredicto entero: un proyecto sin `app.xml`
 * bloquea aunque esto diga que sí. `puedeLanzarse` no lo recalcula por su cuenta —el veredicto
 * sale de su lista de causas, que es exhaustiva sobre este eje— y hay un test que ata las dos
 * respuestas para que no puedan divergir.
 */
export function dispositivoListo(
  dispositivo: Dispositivo | undefined,
  framework: FrameworkMedido | undefined,
): boolean {
  if (dispositivo === undefined) return false;
  // El camino (adb, su túnel y la subida) todavía solo existe para Android: un iPhone
  // arrancado tampoco está listo, porque desde aquí no se llega a él.
  if (dispositivo.plataforma !== "android") return false;
  if (!esAlcanzable(dispositivo.estado)) return false;
  return framework?.instalado === true;
}

/**
 * El veredicto entero: el dispositivo, el camino, la medida del framework y el proyecto.
 *
 * **El orden de las causas es el de la lectura**, y no es alfabético a propósito: primero lo que
 * hay que arreglar antes de que nada más importe —elegir un dispositivo— y al final el proyecto,
 * para que quien esté mirando la pantalla no arregle una cosa y descubra la siguiente después.
 * Las causas son todas las que hay, no la primera.
 */
export function puedeLanzarse(entrada: EntradaDeVeredicto): Veredicto {
  const causas: CausaDeBloqueo[] = [];
  const { dispositivo } = entrada;

  if (dispositivo === undefined) {
    causas.push(
      entrada.elegido === undefined
        ? { causa: "sin-dispositivo-elegido" }
        : { causa: "dispositivo-desconocido" },
    );
  } else {
    if (!esAlcanzable(dispositivo.estado)) {
      causas.push({
        causa: "dispositivo-no-alcanzable",
        nombre: dispositivo.nombre,
        estado: dispositivo.estado,
      });
    }
    if (dispositivo.plataforma !== "android") {
      causas.push({ causa: "plataforma-sin-camino", plataforma: dispositivo.plataforma });
      // Y no se pregunta por el framework: `frameworkEnDispositivo` contesta «iOS todavía no»
      // sin lanzar nada, así que aquí no hay medida que leer y decir «falta el framework»
      // culparía al dispositivo de que el camino no exista.
    } else if (entrada.framework === undefined) {
      causas.push({ causa: "framework-no-medido", nombre: dispositivo.nombre });
    } else if (entrada.framework.instalado !== true) {
      causas.push({ causa: "framework-ausente", nombre: dispositivo.nombre });
    }
  }

  const conexiones = entrada.xml === undefined ? [] : conexionesDeApp(entrada.xml);
  const app = entrada.ini === undefined ? undefined : nombreDeApp(entrada.ini);

  if (entrada.xml === undefined) {
    causas.push(
      entrada.motivoDeLectura === undefined
        ? { causa: "sin-app-xml" }
        : { causa: "app-xml-ilegible", motivo: entrada.motivoDeLectura },
    );
  } else {
    // Un `app.xml` sin ninguna `<connection>` NO bloquea por eso y no se cuenta: no declarar
    // ninguna no es síntoma de nada —AppDemo, la app con la que se prueba, declara cero y
    // arranca—. Lo que el recorrido diga de las conexiones lo lleva `Veredicto.conexiones`, que
    // es un dato.
    //
    // **Pero la base se comprueba igual, porque la ruta es una convención y no una
    // declaración.** XOne arranca con `bd/gestion.db` sin que nadie la declare —medido, y es
    // como arrancan MyAllXOne, Replanteos_2026 y AppDemo—, así que mirar solo lo declarado
    // dejaría pasar el caso medido justo en los proyectos donde más pasa. Las dos entradas son
    // una sola pregunta: la convención siempre, y además cualquier OTRA ruta que el `app.xml`
    // declare, porque una segunda base es un sitio distinto donde puede faltar un fichero.
    //
    // **Y solo las declaradas que son RUTAS de fichero.** Medido: un `connstring` de proveedor
    // (`Provider=…;ProgID=…`) no es un fichero de aquí y esos proyectos arrancan perfectamente,
    // así que preguntar por su existencia bloquearía proyectos que funcionan. El fichero que
    // falta de verdad es el caso medido: `{"result":true}` y el diálogo de error detrás.
    const declaradas = conexiones.filter((c) => esRutaDeFichero(c.connstring));
    const candidatas: { ruta: string; declarada: boolean }[] = declaradas.map((c) => ({
      ruta: c.connstring,
      declarada: true,
    }));
    if (!declaradas.some((c) => c.connstring === RUTA_DE_LA_BASE)) {
      candidatas.push({ ruta: RUTA_DE_LA_BASE, declarada: false });
    }

    // Dos conexiones a la misma base son una frase y no dos: la segunda no dice nada nuevo. Y
    // una base que el `app.xml` SÍ declara se cuenta con la verdad más específica —que está
    // declarada y que no está—, que es la que dice dónde mirar.
    const yaDicho = new Set<string>();
    for (const { ruta, declarada } of candidatas) {
      if (yaDicho.has(ruta)) continue;
      if (entrada.existe(ruta)) continue;
      yaDicho.add(ruta);
      causas.push(
        declarada
          ? { causa: "falta-el-fichero-de-la-conexion", connstring: ruta }
          : { causa: "falta-la-base" },
      );
    }
  }

  return {
    // Las causas son exhaustivas sobre los tres ejes, así que esto ES `dispositivoListo(...)`
    // y el proyecto — y hay un test que lo comprueba, para que no puedan divergir.
    listo: causas.length === 0,
    causas,
    ...(app === undefined ? {} : { app }),
    conexiones,
  };
}

/** Cómo se escribe la plataforma en la ventana. Exhaustivo por tipo, como todo lo que reparte. */
function nombreDePlataforma(plataforma: Dispositivo["plataforma"]): string {
  switch (plataforma) {
    case "android":
      return "Android";
    case "ios":
      return "iOS";
  }
}

/**
 * El estado medido, como se dice en la ventana.
 *
 * Es la TERCERA copia de esta tabla en el repo —`Equipo.tsx` e `inventarioDeDispositivos.ts`
 * tienen las suyas— y el motivo es la frontera: `apps/web/` redeclara los tipos del cable y no
 * importa de aquí, y esta vive donde viven las frases que salen del servidor. El
 * `Record<…, string>` la deja exhaustiva por tipo: un estado nuevo no compila hasta que alguien
 * decida cómo se escribe.
 */
const ETIQUETA_DE_ESTADO: Record<Dispositivo["estado"], string> = {
  conectado: "conectado",
  arrancado: "arrancado",
  apagado: "apagado",
  "sin-autorizar": "sin autorizar",
  offline: "offline",
  "no-disponible": "no disponible",
};

/**
 * UNA frase por causa, en español, y **cada una dice DÓNDE se arregla**.
 *
 * El `switch` va exhaustivo y sin `default` a propósito: un `default` que devolviera «no se
 * puede» taparía la causa nueva en vez de obligar a escribir qué falta y con qué se arregla, que
 * es justo lo único que esta pestaña tiene que decir. Y por eso ninguna frase es un «no se
 * puede» a secas: quien la lee está mirando una pantalla que le acaba de negar algo, y lo único
 * que puede hacer con un «no se puede» es irse a buscar por su cuenta —o creer que xonecode
 * tenía que haberlo puesto él.
 */
export function motivoDeBloqueo(causa: CausaDeBloqueo): string {
  switch (causa.causa) {
    case "sin-dispositivo-elegido":
      return "Esta sesión no tiene ningún dispositivo elegido: elígelo en la pastilla del compositor, junto al modelo —es donde se elige el de ESTA sesión—, y vuelve a intentarlo.";
    case "dispositivo-desconocido":
      return "El dispositivo que esta sesión tenía elegido ya no aparece en la última medida del equipo: los identificadores no son estables (el de un emulador es un puerto). Vuelve a elegirlo en la pastilla del compositor.";
    case "dispositivo-no-alcanzable":
      return `«${causa.nombre}» no está alcanzable ahora: su estado es «${ETIQUETA_DE_ESTADO[causa.estado]}». Arranca el dispositivo o conéctalo del todo —y acepta la depuración si es un teléfono— y vuelve a mirar en Ajustes → Dispositivos.`;
    case "framework-ausente":
      return `«${causa.nombre}» no tiene instalado el framework de XOne, que es la app con la que se habla para lanzar (XOneStudio). Instálalo en el dispositivo —XOne Studio lo distribuye— y vuelve a mirar en Ajustes → Dispositivos.`;
    case "framework-no-medido":
      return `Todavía no se ha mirado si «${causa.nombre}» tiene el framework de XOne, así que no se puede prometer que la app vaya a arrancar. Vuelve a mirar en Ajustes → Dispositivos y espera a que llegue la medida.`;
    case "sin-app-xml":
      return "El proyecto no tiene app.xml —o la raíz que se abrió no es la carpeta que lo contiene—: es el fichero que declara la app, y sin él no hay nada que lanzar. Ábrelo en XOne Studio, o comprueba que abriste la carpeta del proyecto y no una de dentro.";
    case "app-xml-ilegible":
      return `No se pudo leer app.xml: ${causa.motivo}. Es el fichero que declara la app, así que sin leerlo no se sabe qué se va a lanzar: ábrelo y vuelve a guardarlo desde XOne Studio.`;
    case "falta-el-fichero-de-la-conexion":
      // Larga a propósito: lo que un despliegue tiene que decir es QUÉ falta, DE DÓNDE sale y
      // qué pasa si se ignora. Una frase corta aquí manda a la persona a buscar sola y la deja
      // creyendo que el fichero lo pone xonecode.
      return `app.xml declara la conexión «${causa.connstring}» y ese fichero no está en el proyecto. La base la genera el simulador fuera de xonecode —xonecode no la crea—, así que hay que abrir el proyecto en XOne Studio y arrancarlo una vez, o traerlo de donde se generó. Sin él la app recibe el lanzamiento y muere en un diálogo «Error opening database».`;
    case "falta-la-base":
      // La hermana de la de arriba, y la que más veces va a salir: medido, tres de cada cuatro
      // proyectos reales NO declaran su base y la necesitan igual, porque la ruta es la de por
      // defecto de XOne.
      //
      // **Y lleva la única frase que reconoce un falso positivo propio**: el fichero se mira en
      // el PROYECTO, y una app que ya se lanzó antes en ese dispositivo tiene allí su copia, así
      // que volver a lanzarla no la necesita. No se puede preguntar al aparato todavía, así que
      // lo honesto es decir que no se puede prometer — y lo que hay que hacer si ese es el caso.
      return `El proyecto no tiene ${RUTA_DE_LA_BASE}, que es la base local de XOne: la usa POR DEFECTO, se declare en app.xml o no, y sin ella la app recibe el lanzamiento y muere en un diálogo «Error opening database». La genera el simulador fuera de xonecode —xonecode no la crea—, así que hay que abrir el proyecto en XOne Studio y arrancarlo una vez, o traerla de donde se generó. (Se mira el proyecto, no el aparato: si esta app ya se lanzó antes en ese dispositivo, allí sigue su copia y no hace falta esto.)`;
    case "plataforma-sin-camino":
      return `Lanzar desde xonecode todavía solo está montado para Android —el túnel, el canal y la subida son los de esa plataforma—, así que sobre ${nombreDePlataforma(causa.plataforma)} no hay camino. Elige un dispositivo de Android en Ajustes → Dispositivos, o lanza la app desde XOne Studio.`;
  }
}
