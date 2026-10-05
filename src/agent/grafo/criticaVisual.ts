import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  esRutaDeArtefacto,
  mimeDeArtefacto,
  nombreDeArtefacto,
  rutaRelativaDeArtefacto,
} from "../../core/artefactos.js";
import { imagenReferida, type ImagenReferida } from "../../core/referenciasDeImagen.js";
import {
  compararConMaqueta,
  controlesDelArbol,
  filas as filasDeCajas,
  filasDelAparato,
  hallazgosDeGeometria,
  informeDeGeometria,
  type GeometriaDelAparato,
  type MaquetaMedida,
} from "../../core/geometriaDePantalla.js";
import {
  compararDescripciones,
  hayQueArreglar,
  htmlComoAparato,
  informeDeComparacion,
  maquetaDeLaDescripcion,
  type ComparacionDeDescripciones,
  type PantallaDescrita,
} from "../../core/descripcionDePantalla.js";
import { compararBloques, pantallaMedida, type ControlAMedir } from "../../core/estiloMedido.js";
import type { ImagenRgba } from "../../core/compararCapturas.js";
import {
  juzgarPantalla,
  TOPE_DE_PETICIONES,
  type CapturaDePantalla,
  type InvocarVisual,
} from "../dispositivos/juezVisual.js";

/**
 * `xone_critica_visual`: enseñarle una captura al crítico y traer su veredicto.
 *
 * **Por qué es una TOOL y no un paso del cierre.** El crítico necesita PEDIR pantallas —juzga
 * la captura que le den, así que si el conductor fotografió el login, dictamina sobre el
 * login—, y quien puede ir a buscarlas es el conductor. Las tres formas de resolver eso se
 * midieron contra los invariantes del repo y dos se caen solas:
 *
 *  - Que el conductor haga de crítico es que el que trabaja se puntúe a sí mismo. Es lo que
 *    `juezDeTarea` ya prohíbe por escrito —«a un modelo se le puede pedir que avise y a veces
 *    no avisa»— y lo que el prompt del conductor tiene prohibido («no digas que hiciste un
 *    paso que no hiciste»). Medido el mismo día: un turno describió los 19 botones de una
 *    pantalla leyéndolos del `.xne` y se leía como si los hubiera visto.
 *  - Que el crítico conduzca el aparato es darle una shell, y el invariante es «backend con
 *    shell, exactamente UNO»: una shell no pasa por `permisosDe` ni por el `virtualMode`, o
 *    sea que concederla es conceder la máquina — y precisamente al que existe para ser
 *    independiente.
 *
 * Queda ésta: el crítico **pide por nombre** y el orquestador vuelve a delegar en el
 * conductor. La tool no toca el aparato, no escribe nada y solo lee de la carpeta de
 * artefactos de la sesión.
 *
 * **La guarda de ruta se RE-APLICA a mano**, como en las otras dos tools propias: una tool de
 * LangChain añadida por xonecode NO pasa por el middleware de permisos, así que sin esto sería
 * una forma de leer cualquier fichero de la máquina y mandárselo a un modelo.
 */
const Entrada = z.object({
  captura: z
    .string()
    .describe("La ruta virtual de la captura, siempre bajo /artefactos/ (la que anunció el evento)"),
  pantalla: z
    .string()
    .describe("De qué pantalla o colección es la captura, para que el crítico sepa qué mira"),
  /**
   * La MAQUETA, y su ausencia significa algo — por eso lo dice el `describe`.
   *
   * Sin ella el crítico solo busca ROTURAS y no dice nada de si la pantalla se parece a lo
   * que se pidió. Medido: dio verde sobre una calculadora cuyas teclas eran rectángulos donde
   * la maqueta tenía píldoras, y el verde se leyó como «está bien». Un parámetro que no dice
   * qué pasa cuando falta deja ese malentendido intacto.
   */
  referencia: z
    .string()
    .optional()
    .describe(
      "OPCIONAL. La ruta virtual de la MAQUETA o diseño de referencia: bajo /artefactos/, bajo /adjuntos/ o un PNG/JPEG del proyecto (/diseno/screen.png). " +
        "Pásala SIEMPRE que el encargo traiga un diseño: con ella comparo la captura contra " +
        "la maqueta (forma, tamaños, colocación). SIN ella solo busco roturas y NO digo nada " +
        "sobre si se parece al diseño."
    ),
});
type Entrada = z.infer<typeof Entrada>;

export interface DependenciasDeCritica {
  /** Los bytes de un artefacto, por su NOMBRE. Quien la monta sabe dónde está la carpeta. */
  leerArtefacto: (nombre: string) => Promise<Buffer>;
  invocar: InvocarVisual;
  /**
   * Lee la MAQUETA de donde esté: `/artefactos/`, `/adjuntos/` o el proyecto
   * (`core/referenciasDeImagen.ts`). Ausente, la referencia solo puede venir de `/artefactos/`, como
   * antes. La maqueta de un encargo casi nunca está ahí: la trae la persona en el chat o vive en
   * `/diseno/`, y sin esto el crítico corría a ciegas y su verde significaba solo «nada roto».
   */
  leerReferencia?: (imagen: ImagenReferida) => Promise<Buffer>;
  /**
   * La GEOMETRÍA guardada con la captura (`<captura>.geometria.json`, que deja `xone-captura-android`
   * o `xone-hotswap shot` en `/hotswap/` en el MISMO momento): el árbol de controles y las barras del
   * sistema. `undefined` = no hay. Ausente la dependencia, el crítico trabaja como antes.
   */
  leerGeometria?: (nombreDeCaptura: string) => Promise<unknown>;
  /**
   * Las cajas de la maqueta, si trae `code.html` al lado (la de Stitch): `undefined` = no hay HTML (una
   * maqueta que es solo un PNG); `{motivo}` = lo hay y no se pudo medir.
   */
  cajasDeMaqueta?: (imagen: ImagenReferida, bytes: Buffer) => Promise<MaquetaMedida | { motivo: string } | undefined>;
  /**
   * Una pantalla DESCRITA por el modelo mirándola SOLA, primero su geometría y después el estilo de cada control,
   * con el MISMO esquema para la maqueta y para la captura (`core/descripcionDePantalla.ts`,
   * `juezVisual.ts#describirPantalla`). A la captura se le pasan los controles que existen, del árbol.
   * `undefined` = no se entendió. Ausente la dependencia, el crítico trabaja como antes.
   */
  describirPantalla?: (imagen: CapturaDePantalla, controlesQueExisten?: readonly string[]) => Promise<PantallaDescrita | undefined>;
  /**
   * Saca los píxeles de un PNG o un JPEG (`decodificarImagen`). Con ella, el estilo de cada control se MIDE en su
   * caja (`core/estiloMedido.ts`) en vez de pedírselo a un modelo. Ausente, no hay comparación control a control.
   */
  decodificar?: (bytes: Buffer) => ImagenRgba;
  /** Guarda el informe junto a la captura (`<captura>.critica.txt` en `/hotswap/`), para poder auditar qué se dijo. */
  guardarInforme?: (nombreDeCaptura: string, informe: string) => Promise<void>;
}

/** Lo que la geometría le añade al crítico: el bloque para el agente, los hechos para el modelo y si hay algo bloqueante. */
interface GeometriaDeLaCritica {
  lineas: string[];
  hechos: string[];
  bloqueante: boolean;
  /** El aparato medido, si la captura trae su árbol: da las cajas en que se mide cada control. */
  aparato?: GeometriaDelAparato;
  /** Las cajas de la maqueta (de su `code.html`), si las hay. */
  maqueta?: MaquetaMedida;
}

/**
 * La geometría de esta captura (`core/geometriaDePantalla.ts`), o `undefined` si este montaje no la tiene.
 * Nunca lanza: lo que no se puede medir se dice en el bloque, y el crítico sigue con su opinión.
 */
async function geometriaDe(
  entrada: Entrada,
  referida: ImagenReferida | undefined,
  referencia: CapturaDePantalla | undefined,
  deps: DependenciasDeCritica,
  descrita: PantallaDescrita | undefined
): Promise<GeometriaDeLaCritica | undefined> {
  if (deps.leerGeometria === undefined) return undefined;
  let crudo: unknown;
  try {
    crudo = await deps.leerGeometria(nombreDeArtefacto(entrada.captura));
  } catch {
    crudo = undefined;
  }
  const g = crudo as { pantalla?: { ancho: number; alto: number }; barras?: GeometriaDelAparato["barras"]; arbol?: unknown } | undefined;
  if (g === undefined || g.arbol === undefined || g.pantalla === undefined) {
    return {
      lineas: [
        "GEOMETRÍA: esta captura no trae su árbol de controles, así que no hay nada MEDIDO (qué está tapado, qué",
        "falta, filas, tamaños). Sácala con `xone-captura-android` o `xone-hotswap shot`, que lo guardan a la vez.",
      ],
      hechos: [],
      bloqueante: false,
    };
  }
  const controles = controlesDelArbol(g.arbol);
  // Una captura de UN CONTROL (`shot name=…`) es más pequeña que lo que ocupa el árbol: sus cajas son de la pantalla
  // entera y medirían píxeles que no son. El script ya no la guarda así; esto cubre las de antes.
  const extension = controles.reduce((e, c) => ({ ancho: Math.max(e.ancho, c.caja.x + c.caja.ancho), alto: Math.max(e.alto, c.caja.y + c.caja.alto) }), { ancho: 0, alto: 0 });
  if (g.pantalla.alto < extension.alto * 0.95 || g.pantalla.ancho < extension.ancho * 0.95) {
    return {
      lineas: [
        "GEOMETRÍA: esta captura es de una PARTE de la pantalla (un control), no de la pantalla entera, así que no hay nada",
        "MEDIDO. Para comparar con la maqueta, captura la pantalla entera (`xone-hotswap shot` sin `name=`).",
      ],
      hechos: [],
      bloqueante: false,
    };
  }
  const aparato: GeometriaDelAparato = {
    pantalla: g.pantalla,
    ...(g.barras === undefined ? {} : { barras: g.barras }),
    controles,
  };
  let maqueta: MaquetaMedida | undefined;
  const notas: string[] = [];
  if (referida !== undefined && referencia !== undefined && deps.cajasDeMaqueta !== undefined) {
    let medida: MaquetaMedida | { motivo: string } | undefined;
    try {
      medida = await deps.cajasDeMaqueta(referida, Buffer.from(referencia.base64, "base64"));
    } catch {
      medida = { motivo: "no se pudo medir" };
    }
    const conDescripcion = descrita === undefined ? "" : " (la estructura de la maqueta va abajo, según su descripción)";
    if (medida === undefined) notas.push(`la maqueta es solo una imagen (sin code.html al lado): aquí, solo lo que se ve en el propio aparato${conDescripcion}.`);
    else if ("motivo" in medida) notas.push(`no pude medir las cajas de la maqueta: ${medida.motivo}. Aquí, solo lo del propio aparato${conDescripcion}.`);
    else maqueta = medida;
  }
  const h = hallazgosDeGeometria(aparato, maqueta);
  const lineas = informeDeGeometria({ ...h, notas: [...h.notas, ...notas] }, maqueta !== undefined);
  if (descrita !== undefined) lineas.push(...estructuraDescrita(descrita, aparato, maqueta));
  return {
    lineas,
    hechos: [...h.bloqueantes, ...h.diferencias],
    bloqueante: h.bloqueantes.length > 0,
    aparato,
    ...(maqueta === undefined ? {} : { maqueta }),
  };
}

/**
 * Lo que aporta la maqueta DESCRITA, en un bloque APARTE del medido: nunca decide el rojo.
 *
 * - **Sin `code.html`**, es la única estructura de la maqueta que hay: sus filas, orden y anchos contra el
 *   árbol medido. Así una maqueta que es solo un PNG también dice «la = va en otra fila».
 * - **Con `code.html`**, la estructura la dan las cajas medidas, y la descripción solo VIGILA que la imagen
 *   y el HTML cuenten lo mismo: la imagen es lo que se aprobó, y si el HTML se aparta, alguien tiene que
 *   decirlo.
 */
function estructuraDescrita(descrita: PantallaDescrita, aparato: GeometriaDelAparato, maqueta: MaquetaMedida | undefined): string[] {
  if (maqueta !== undefined) {
    const h = compararConMaqueta(maquetaDeLaDescripcion(descrita, false), htmlComoAparato(maqueta), {
      aproximada: true,
      nombres: { maqueta: "la imagen de la maqueta", aparato: "su code.html" },
    });
    if (h.diferencias.length === 0) return [];
    return [
      "",
      "LA IMAGEN DE LA MAQUETA Y SU code.html NO CUENTAN LO MISMO (según la descripción de la imagen, que hizo un modelo; míralo):",
      ...h.diferencias.map((d) => `- ${d}`),
    ];
  }
  const h = compararConMaqueta(maquetaDeLaDescripcion(descrita), aparato, { aproximada: true });
  return [
    "",
    "ESTRUCTURA CONTRA LA MAQUETA DESCRITA (las filas, el orden y los anchos de la maqueta los dijo un modelo mirándola sola; los del aparato están medidos. Orientativo: compruébalo antes de cambiar nada):",
    ...(h.diferencias.length === 0 ? ["- Nada: las filas y el orden cuadran con lo descrito."] : h.diferencias.map((d) => `- ${d}`)),
    ...h.notas.map((n) => `- (nota) ${n}`),
  ];
}

/**
 * Qué es esta ruta, o el motivo en palabras. **Comprueba y NO lee.**
 *
 * Separada de la lectura a propósito: con dos imágenes en juego, el orden importa. Si se
 * comprobara y abriera cada una por turno, una referencia con la ruta mal escrita se
 * descubriría DESPUÉS de haber leído la captura — y lo que la guarda promete es que no se
 * abre nada hasta que todo lo que se va a abrir está comprobado. Es lo mismo que exige el
 * test de siempre («no se lee NADA antes de comprobarlo»), solo que ahora hay dos.
 *
 * `que` cambia únicamente cómo se nombra en el mensaje: la comprobación es la MISMA para las
 * dos, porque las dos acaban dentro de un modelo.
 */
function veredictoDeImagen(ruta: string, que: string): { mime: string } | string {
  // Lista BLANCA de forma, sobre el TEXTO que escribe el modelo. `esRutaDeArtefacto` no es
  // un `startsWith`: comprueba la forma entera, segmento a segmento.
  if (!esRutaDeArtefacto(ruta)) {
    return `«${ruta}» no es ${que} de esta sesión. Solo puedo mirar lo que hay bajo /artefactos/.`;
  }
  const nombre = nombreDeArtefacto(ruta);
  const mime = mimeDeArtefacto(nombre);
  if (mime === undefined || !mime.startsWith("image/")) {
    return `«${nombre}» no es una imagen, así que no hay nada que mirar.`;
  }
  return { mime };
}

/**
 * Los bytes, ya con la ruta comprobada. Nunca lanza: que falte una imagen no puede llevarse
 * el turno por delante.
 *
 * **Se abre por la ruta RELATIVA y se NOMBRA por el último segmento**, que son dos preguntas
 * distintas y confundirlas era un botón muerto: un `unzip` deja un ÁRBOL, y una maqueta
 * descomprimida vive en `/artefactos/diseno/screen.png`. Con el basename, el `join` de quien
 * lee apuntaba a `<carpeta>/screen.png` y contestaba «no pude abrir» sobre un fichero que
 * estaba ahí y que la propia foto había anunciado.
 */
async function leer(
  ruta: string,
  mime: string,
  deps: DependenciasDeCritica
): Promise<CapturaDePantalla | string> {
  try {
    const bytes = await deps.leerArtefacto(rutaRelativaDeArtefacto(ruta));
    return { base64: bytes.toString("base64"), mime };
  } catch (error) {
    // El mensaje de un error de Node lleva la ruta absoluta y esto va al modelo: solo el
    // NOMBRE del error.
    return `No pude abrir «${nombreDeArtefacto(ruta)}» (${error instanceof Error ? error.name : "error"}).`;
  }
}

/** Como `leer`, para una referencia que puede salir de /adjuntos/ o del proyecto. Nunca lanza. */
async function leerReferida(
  imagen: ImagenReferida,
  mime: string,
  leerReferencia: (imagen: ImagenReferida) => Promise<Buffer>
): Promise<CapturaDePantalla | string> {
  try {
    return { base64: (await leerReferencia(imagen)).toString("base64"), mime };
  } catch (error) {
    // El mensaje de un error de Node lleva la ruta absoluta y esto va al modelo: solo su `code`.
    const codigo = (error as { code?: unknown }).code;
    return `No pude abrir «${imagen.nombre}» (${typeof codigo === "string" ? codigo : "error"}).`;
  }
}

/**
 * **Fail-closed: una referencia que se pidió y no se pudo usar es un NO.**
 *
 * Lo tentador es juzgar sin ella y avisar. Es justo el fallo que este parámetro existe para
 * cerrar: un veredicto sin maqueta vuelve como «verde» y se lee como «se parece al diseño».
 * Así que no se juzga nada, y el paso siguiente que se escribe es ARREGLAR LA RUTA — nunca
 * «o llámame sin ella», que sería dejar el modo ciego escrito dentro de la propia tool como
 * alternativa legítima.
 */
function sinJuzgar(motivo: string): string {
  return [
    motivo,
    "NO he juzgado la captura: comparar contra media maqueta no es comparar, y mi veredicto",
    "se leería como que la pantalla se parece al diseño. Comprueba la ruta de la maqueta",
    "—tiene que ser la que anunció su evento `artefacto`, con sus subcarpetas— y vuelve a",
    "llamarme.",
  ].join("\n");
}

/**
 * La comparación de estilo MEDIDA, o `undefined` si no hay con qué (sin decodificador, sin árbol, o la imagen no se
 * pudo leer). `completa`: hubo maqueta con cajas y la comparación es control a control; si no, solo los recortes de
 * la captura. Nunca lanza.
 */
function medirEstilo(
  captura: CapturaDePantalla,
  referencia: CapturaDePantalla | undefined,
  geometria: GeometriaDeLaCritica | undefined,
  deps: DependenciasDeCritica
): { comparacion: ComparacionDeDescripciones; completa: boolean } | undefined {
  if (deps.decodificar === undefined || geometria?.aparato === undefined) return undefined;
  try {
    const comoMedir = (fila: readonly { texto?: string; nombre?: string; caja: ControlAMedir["caja"] }[]): ControlAMedir[] =>
      fila.map((c) => ({ texto: c.texto ?? `[${c.nombre ?? "sin nombre"}]`, caja: c.caja }));
    const imagenDeLaCaptura = deps.decodificar(Buffer.from(captura.base64, "base64"));
    const vista = pantallaMedida(imagenDeLaCaptura, filasDelAparato(geometria.aparato).map(comoMedir));
    if (referencia === undefined || geometria.maqueta === undefined) {
      const sola = compararDescripciones({ filas: [], extras: [] }, vista);
      return { comparacion: { diferencias: [], faltan: [], recortes: sola.recortes, extras: { maqueta: [], captura: [] } }, completa: false };
    }
    // Las cajas del `code.html` están en el viewport de la maqueta; la imagen puede estar a 2x o 3x.
    const imagen = deps.decodificar(Buffer.from(referencia.base64, "base64"));
    const escala = imagen.ancho / geometria.maqueta.ancho;
    const m = geometria.maqueta;
    const indice = filasDeCajas(m.elementos.map((e) => e.caja));
    const porFila = new Map<number, ControlAMedir[]>();
    m.elementos.forEach((e, i) => {
      const caja = { x: e.caja.x * escala, y: e.caja.y * escala, ancho: e.caja.ancho * escala, alto: e.caja.alto * escala };
      porFila.set(indice[i]!, [...(porFila.get(indice[i]!) ?? []), { texto: e.texto, caja }]);
    });
    const filasDeLaMaqueta = [...porFila.entries()].sort((a, b) => a[0] - b[0]).map(([, f]) => f.sort((a, b) => a.caja.x - b.caja.x));
    const comparacion = compararDescripciones(pantallaMedida(imagen, filasDeLaMaqueta), vista);
    // Y los BLOQUES anchos (cabecera, visor, panel): su color y su forma también son el diseño.
    const g = geometria.aparato;
    const util = { arriba: g.barras?.estado?.abajo ?? 0, abajo: g.barras?.navegacion?.arriba ?? g.pantalla.alto };
    const bloquesDelAparato = g.controles
      .filter((c) => (c.tipo === "frame" || c.tipo === "group") && c.caja.ancho >= g.pantalla.ancho * 0.85 && c.caja.alto >= 40 && c.caja.alto <= g.pantalla.alto * 0.6 && c.caja.y >= util.arriba - 2)
      .map((c) => c.caja);
    const bloques =
      m.bloques === undefined || bloquesDelAparato.length === 0
        ? []
        : compararBloques(
            { img: imagen, bloques: m.bloques.map((b) => ({ x: b.x * escala, y: b.y * escala, ancho: b.ancho * escala, alto: b.alto * escala })), util: { arriba: 0, abajo: m.alto * escala } },
            { img: imagenDeLaCaptura, bloques: bloquesDelAparato, util }
          );
    return { comparacion: { ...comparacion, diferencias: [...bloques, ...comparacion.diferencias] }, completa: true };
  } catch {
    return undefined;
  }
}

export function crearCriticaVisual(deps: DependenciasDeCritica) {
  return tool(
    async (entrada: Entrada) => {
      // Se comprueban las DOS antes de abrir ninguna: ver `veredictoDeImagen`.
      const deLaCaptura = veredictoDeImagen(entrada.captura, "una captura");
      if (typeof deLaCaptura === "string") return deLaCaptura;
      // Con lector propio la referencia puede venir de /adjuntos/ y del proyecto; sin él, solo de artefactos.
      const referida = entrada.referencia !== undefined && deps.leerReferencia !== undefined ? imagenReferida(entrada.referencia) : undefined;
      if (typeof referida === "string") return sinJuzgar(referida);
      const deLaReferencia =
        entrada.referencia === undefined
          ? undefined
          : referida !== undefined
            ? { mime: referida.nombre.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" }
            : veredictoDeImagen(entrada.referencia, "la referencia");
      if (typeof deLaReferencia === "string") return sinJuzgar(deLaReferencia);

      const abierta = await leer(entrada.captura, deLaCaptura.mime, deps);
      if (typeof abierta === "string") return abierta;

      let referencia: CapturaDePantalla | undefined;
      if (entrada.referencia !== undefined && deLaReferencia !== undefined) {
        const abiertaRef =
          referida !== undefined && deps.leerReferencia !== undefined
            ? await leerReferida(referida, deLaReferencia.mime, deps.leerReferencia)
            : await leer(entrada.referencia, deLaReferencia.mime, deps);
        /**
         * **Fail-closed: una referencia que se pidió y no se pudo abrir es un NO.**
         *
         * Lo tentador es juzgar sin ella y avisar. Es justo el fallo que este parámetro
         * existe para cerrar: un veredicto sin maqueta vuelve como «verde» y se lee como
         * «se parece al diseño». Así que no se juzga nada, y el paso siguiente que se
         * escribe es ARREGLAR LA RUTA — nunca «o llámame sin referencia», que sería dejar
         * el modo ciego escrito dentro de la propia tool como alternativa legítima.
         */
        if (typeof abiertaRef === "string") return sinJuzgar(abiertaRef);
        referencia = abiertaRef;
      }

      // Lo MEDIDO primero: el modelo lo recibe como hechos y no tiene que adivinar la estructura.
      // La maqueta, DESCRITA aparte y antes —geometría y luego estilo—: sin ella, el estilo queda a la memoria
      // del modelo y una maqueta sin code.html no tiene estructura. No poder describirla no impide juzgar.
      let descrita: PantallaDescrita | undefined;
      if (referencia !== undefined && deps.describirPantalla !== undefined) {
        try {
          descrita = await deps.describirPantalla(referencia);
        } catch {
          descrita = undefined;
        }
      }
      const geometria = await geometriaDe(entrada, referida, referencia, deps, descrita);

      /**
       * **El estilo se MIDE en los píxeles de cada control**, con el MISMO esquema para la maqueta y para la captura
       * (`core/estiloMedido.ts`): en la captura, en las cajas del árbol; en la maqueta, en las de su `code.html`.
       * Describirlo con el modelo no valía —medido sobre la calculadora: la misma imagen descrita dos veces difería en
       * diecisiete teclas, y ninguna pasada vio el texto recortado—; medido, cada vez sale lo mismo, en milisegundos.
       * Sin `code.html` no hay cajas en la maqueta: se mide solo lo que se ve mal en el propio aparato (el recorte).
       */
      const estilo = medirEstilo(abierta, referencia, geometria, deps);
      const comparacion: ComparacionDeDescripciones | undefined = estilo?.comparacion;

      let veredicto;
      try {
        // Con la comparación MEDIDA contra la maqueta, decide ella; sin maqueta que medir, el crítico opina y los
        // recortes medidos le llegan como hechos.
        veredicto =
          comparacion !== undefined && estilo?.completa === true
            ? { veredicto: hayQueArreglar(comparacion) ? ("rojo" as const) : ("verde" as const), observaciones: [], necesito: [] }
            : await juzgarPantalla(abierta, { pantalla: entrada.pantalla }, deps.invocar, referencia, [...(geometria?.hechos ?? []), ...(comparacion?.recortes ?? [])]);
      } catch (error) {
        // Fallo del ENTORNO —sin modelo, sin clave, sin red—: se dice, y no se convierte en un
        // veredicto. Un rojo inventado culparía al trabajo de un problema de la máquina.
        return `No se pudo consultar al crítico visual: ${error instanceof Error ? error.message : "error"}`;
      }

      /**
       * **La cabecera dice si se COMPARÓ, y no repite la ruta de la referencia.** Lo primero
       * porque «verde» contesta dos preguntas distintas según el modo y quien lo lea tiene
       * que saber cuál le han contestado. Lo segundo porque el argumento lo acaba de escribir
       * quien llama: devolvérselo entero es el eco que ya paga el campo `pantalla`.
       */
      const comparado = referencia === undefined ? "" : " (comparado con la referencia)";
      /**
       * **Lo medido decide.** Un control tapado, fuera de la pantalla o que falta es rojo aunque el modelo
       * diga verde: lo saca el árbol de controles, no una opinión — y medido, el modelo no vio la «=»
       * tapada de la calculadora.
       */
      const medidoEnRojo = geometria?.bloqueante === true || (comparacion !== undefined && comparacion.recortes.length > 0);
      const final = medidoEnRojo ? "rojo" : veredicto.veredicto;
      const lineas = [
        `Veredicto visual de «${entrada.pantalla}»${comparado}: ${final}${medidoEnRojo && veredicto.veredicto !== "rojo" ? " (lo decide lo medido)" : ""}.`,
      ];
      if (geometria !== undefined) lineas.push("", ...geometria.lineas, "");
      if (comparacion !== undefined) {
        lineas.push(
          ...(estilo?.completa === true
            ? informeDeComparacion(comparacion, "medida")
            : [
                "MEDIDO en los píxeles de la captura (sin cajas de la maqueta que medir, solo lo que se ve mal en el aparato):",
                ...(comparacion.recortes.length === 0 ? ["- Ningún texto recortado."] : comparacion.recortes.map((r) => `- ${r}`)),
              ]),
          ""
        );
      }
      if (veredicto.observaciones.length > 0) {
        /**
         * **El aviso no es cortesía: está medido.** Seis vueltas sobre la misma captura
         * describieron un texto CORTADO como «girado 180°», y pedirle en el prompt que no
         * diagnostique no lo evitó. A dónde apunta sí acertó las seis veces. Sin esta línea,
         * el desarrollador se pone a buscar una rotación que no existe.
         */
        lineas.push(
          geometria === undefined
            ? "Lo que dice que ve (la REDACCIÓN no es fiable: describe mal la causa. Fíate de QUÉ"
            : "ESTILO, lo que dice el modelo que ve (una OPINIÓN; la redacción no es fiable: fíate de QUÉ",
          "control señala, no de su explicación, y míralo tú):"
        );
        for (const o of veredicto.observaciones) lineas.push(`- ${o}`);
      }
      /**
       * **Un rojo tiene que ENTERAR a alguien, y el sitio fuerte es aquí.**
       *
       * La regla de «lo que salga vuelve a `developer-xone`» vive en el prompt del
       * orquestador, o sea a miles de tokens del momento en que llega el veredicto. Eso es
       * una sugerencia. Este repo ya tiene escrito que «los avisos de honestidad son código,
       * no prompt», y el patrón para que un modelo haga lo siguiente es el de
       * `xone_navegacion` cuando no sabe contestar: se devuelve el PASO SIGUIENTE escrito, no
       * un consejo — a un modelo al que se le dice qué hacer sin decirle cómo se le inventa
       * los argumentos.
       *
       * **Pero quién arregla y CUÁNDO no lo decide esta tool, y eso se aprendió caro.** La
       * versión anterior mandaba a `developer-xone` sin condición, y era la CUARTA puerta
       * de la deriva: en una tarea de DOCUMENTAR, el conductor sacó una captura, el crítico
       * la vio en rojo y el turno se fue a arreglar la pantalla — nadie había pedido que se
       * tocara el código. Un paso siguiente escrito es fuerte justamente por eso, así que
       * escrito de más manda igual de fuerte.
       *
       * Lo que la tool NO puede saber es el encargo: se construye por SESIÓN y el encargo
       * es del TURNO. Y deducirlo del texto sería una heurística que falla en silencio, que
       * es lo que este repo no hace. Así que se escriben las DOS ramas y la elige quien sí
       * lo sabe — con la única parte que no depende del encargo dicha aparte: callárselo no
       * vale nunca.
       *
       * **Límite declarado, y es el que queda abierto**: esto no es un tope. No puede serlo
       * desde aquí, porque la tool se construye por SESIÓN y no por turno, así que no tiene
       * dónde contar las vueltas. Lo que acota hoy es que cada arreglo pasa por una
       * aprobación humana. Un tope de verdad exige que el bucle lo lleve el harness
       * (`conVerificacion`), y eso pide conducir el aparato desde código — medido: no se
       * puede, porque llegar a una pantalla necesita abrir cajones y mirar el árbol.
       */
      if (final === "rojo") {
        /**
         * **El arreglo es de `developer-xone`, haya maqueta o no.** Mandaba a `designer-xone` con referencia, y el
         * diseñador ya solo escribe en `icons/`: el layout y el CSS, también lo que se ve mal, son del desarrollador.
         * Un rojo dirigido a quien no puede tocar el `.xne` era un arreglo sin dueño.
         */
        const aQuien = "developer-xone";
        lineas.push(
          "Esto es un defecto del proyecto SIN ARREGLAR, y qué hacer con él depende de TU",
          "encargo — que lo sabes tú y no yo:",
          `- Si el encargo incluye ARREGLAR o dejar la app bien: encárgaselo a \`${aQuien}\``,
          "  pasándole estas observaciones tal cual, y cuando lo haya corregido manda otra vez",
          "  al conductor a esta misma pantalla y vuelve a llamarme con la captura nueva.",
          referencia === undefined
            ? "  No des la pantalla por buena hasta que yo la vea en verde."
            : "  Y vuelve CON LA MISMA `referencia`: sin ella mi verde solo diría que nada" +
              "\n  está roto, no que la pantalla se parezca al diseño.",
          "- Si el encargo es OTRO —documentar, medir, inventariar—: NO toques el proyecto por",
          "  esto. Anótalo donde estés contando lo que ves y sigue con lo tuyo.",
          "Lo que NO vale en ninguno de los dos casos es callártelo."
        );
      }
      if (veredicto.necesito.length > 0) {
        lineas.push(
          `Necesita ver ${veredicto.necesito.length === 1 ? "otra pantalla" : "otras pantallas"} para dictaminar: ${veredicto.necesito.join(", ")}.`,
          `Encarga al conductor que llegue ahí y capture, y vuelve a llamarme con esa captura (como mucho ${TOPE_DE_PETICIONES} veces).`
        );
      }
      const informe = lineas.join("\n");
      if (deps.guardarInforme !== undefined) {
        try {
          await deps.guardarInforme(nombreDeArtefacto(entrada.captura), informe);
        } catch {
          // Guardarlo es para auditar: que falle no cambia lo que se contesta.
        }
      }
      return informe;
    },
    {
      name: "xone_critica_visual",
      description:
        "Enseña una captura de pantalla del aparato a un revisor visual y devuelve qué se ve " +
        "mal: texto cortado, controles solapados o fuera de la pantalla, cosas ilegibles. " +
        "Ve lo que ninguna comprobación estática puede ver. Puede pedir otras pantallas. " +
        "Si el encargo trae un DISEÑO o una MAQUETA, pásala en `referencia` y además comparo " +
        "la pantalla contra ella (forma, tamaños, colocación, color). SIN `referencia` mi " +
        "verde significa «nada roto», NO «se parece al diseño».",
      schema: Entrada,
    }
  );
}
