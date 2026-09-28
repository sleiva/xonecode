import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import type {
  DispositivoElegido, Esfuerzo, EsfuerzoDelCable, InformeDeDispositivos, ModoDeEscritura,
  ProveedorDeModelos,
} from "../tipos.js";
import { nombreDeAdjuntoSeguro } from "../nombreDeAdjunto.js";
import { PastillaDeModelo } from "./PastillaDeModelo.js";
import { PastillaDeEsfuerzo } from "./PastillaDeEsfuerzo.js";
import { PastillaDeDispositivo } from "./PastillaDeDispositivo.js";
import { SelectorDeModo } from "./SelectorDeModo.js";
import { IconoDeAnexar, IconoDeEnviar } from "./IconosDelCompositor.js";
import pastillas from "./PastillaDeModelo.module.css";
import { ContadorDeTokens, type ConsumoPintable } from "./ContadorDeTokens.js";
import estilos from "./Compositor.module.css";

/** Una ficha de adjunto EN VUELO en el compositor: lo que se ve mientras dura la subida y
 *  lo que decide si se puede enviar (ver `Compositor#enviar`). */
interface FichaDeAdjunto {
  nombre: string;
  estado: "subiendo" | "listo" | "falló";
  motivo?: string;
}

/**
 * El nombre CON sufijo si ya está tomado entre las fichas de ESTE compositor: `-2`, `-3`…
 * antes de la extensión. A diferencia de `NuevaTarea` —que RECHAZA el segundo con el mismo
 * nombre porque el servidor lo sobrescribiría—, aquí no hace falta: cada ficha se sube con
 * SU nombre único, así que dos capturas seguidas —o dos pegados— simplemente se numeran, en
 * vez de obligar a quitar la primera para poder soltar la segunda.
 */
function nombreUnicoEntreFichas(nombre: string, tomados: ReadonlySet<string>): string {
  if (!tomados.has(nombre)) return nombre;
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : "";
  let n = 2;
  while (tomados.has(`${base}-${n}${extension}`)) n += 1;
  return `${base}-${n}${extension}`;
}

/** La extensión que se le pone a un pegado, del tipo MIME (`image/png` → `png`). Sin tipo,
 *  o con uno raro (`image/svg+xml`), se queda con la parte de antes del `+` o cae en `bin`
 *  —una extensión rara es mejor que ninguna: es lo único de lo que depende el visor. */
function extensionDePegado(mime: string): string {
  const parte = mime.split("/")[1]?.split("+")[0];
  return parte === undefined || parte === "" ? "bin" : parte;
}

/**
 * El compositor: manda PROSA.
 *
 * Aquí no hay comandos de barra, y no es que falten: en el navegador no existen. Una línea
 * que empiece por «/» —una ruta del proyecto, `/artefactos/informe.html`— viaja al modelo
 * tal cual, porque lo que hay al otro lado de cada acción es un BOTÓN: el modelo en la
 * pastilla, el tema en Apariencia, la sincronización en su pestaña. Mientras esto despachó
 * comandos, escribir «/» para hablar de una ruta ejecutaba una orden.
 *
 * La sintaxis se queda en las pieles de TERMINAL, donde el teclado es la única puerta.
 * Dentro del servidor sigue viva igual —`consolaWeb.encolar` aplica `/modelo …` cuando
 * alguien elige modelo en Ajustes—, porque lo que se comparte es la FUNCIÓN y no la
 * sintaxis. Ver `cli/consola.ts#LineaDeConsola`.
 */
export function Compositor({
  conectado,
  turnoEnVuelo = false,
  hayPendiente = false,
  consumo,
  oculto = false,
  alParar,
  alDetener,
  modelos,
  alPedirCatalogo,
  alElegirModelo,
  alElegirEsfuerzo,
  alAbrirAjustes,
  dispositivo,
  dispositivos,
  modoDeEscritura,
  alElegirModoDeEscritura,
  alElegirDispositivo,
  alMedirDispositivos,
  alSubirAdjunto,
  alEnviar,
  borrador,
}: {
  conectado: boolean;
  /**
   * Hay un turno EN VUELO. Convierte la flecha en un botón de parar y marca la caja como
   * «trabajando» (`data-trabajando`, el borde animado).
   *
   * Hasta IXCODE-4 esto TAMBIÉN apagaba la entrada: una segunda petición mientras el agente
   * trabajaba se quedaba en la cola del lazo sin decirlo, y el usuario veía su texto
   * desaparecer del campo y no pasar nada durante minutos. Ahora la prosa escrita durante un
   * turno va a `agregarNota` —el servidor decide si se apunta al turno en marcha o abre uno
   * nuevo—, así que el turno en vuelo A SECAS ya no apaga nada; lo que apaga la entrada es
   * `hayPendiente`.
   */
  turnoEnVuelo?: boolean;
  /**
   * Hay una aprobación, pregunta, selector o secreto EN PANTALLA esperando respuesta. Apaga la
   * entrada — a diferencia de `turnoEnVuelo` a secas, que desde IXCODE-4 deja escribir una nota
   * mientras el agente trabaja EN SILENCIO. Con un diálogo delante, escribir aquí competiría
   * con la respuesta que de verdad se espera.
   */
  hayPendiente?: boolean;
  /** Lo consumido por la sesión. Ausente = no consta, y entonces no se pinta el contador. */
  consumo?: ConsumoPintable;
  /**
   * Fuera de la vista: se pone en las pestañas que no son el chat.
   *
   * En Trazas y en Ficheros no hay a quién escribirle —son un registro y un diff—, y una
   * caja de escribir debajo de ellos invita a mandar algo que no va a llegar donde el
   * usuario cree.
   *
   * Se OCULTA y no se desmonta, que es la diferencia que importa: desmontado se pierde el
   * borrador a medio escribir en cuanto miras un fichero y vuelves. Y `hidden` —no
   * `visibility`— porque lo que hace falta es que además salga del orden del Tab y del
   * árbol de accesibilidad: un campo invisible al que se llega tabulando es peor que uno
   * visible.
   */
  oculto?: boolean;
  /** Parar el turno en vuelo. Ausente = no se ofrece el botón. */
  alParar?: () => void;
  /**
   * DETENER y replanificar (IXCODE-4), con lo que haya escrito —puede ir vacío—. No es Parar:
   * Parar corta el turno y lo de los especialistas se pierde; esto les pide cerrar con un resumen
   * de lo hecho y deja que el orquestador replanifique con eso. Ausente = el turno no lo admite y
   * no se pinta.
   */
  alDetener?: (texto: string) => void;
  /** El estado de modelos del cable. Ausente = todavía no llegó: no se pinta pastilla, en
   *  vez de una que diga «Elige modelo» sin saber siquiera si hay algo que elegir. */
  modelos?: {
    actual?: string;
    proveedores: readonly ProveedorDeModelos[];
    /**
     * Lo que admite de esfuerzo el modelo EN VIGOR. Viaja DENTRO de `modelos` y no como
     * prop suelta por el mismo motivo por el que viaja dentro del mensaje: la lista
     * depende del modelo, y separarlos dejaría que llegara una sin la otra — la pastilla
     * ofreciendo los niveles del modelo anterior, que es un control que miente.
     */
    esfuerzo?: EsfuerzoDelCable;
  };
  alPedirCatalogo?: (proveedor: string) => void;
  /** Elegir modelo: el id `proveedor/modelo`. Lo manda como acción, no como comando. */
  alElegirModelo?: (id: string) => void;
  /**
   * Elegir el esfuerzo, o `undefined` para dejar de mandarlo.
   *
   * Opcional como `alElegirDispositivo`: sin manejador no se ofrece el control, que es lo
   * que mantiene honesto al compositor en los sitios donde no hay servidor detrás (los
   * tests, y cualquier montaje que no cablee el cable).
   */
  alElegirEsfuerzo?: (nivel: Esfuerzo | undefined) => void;
  /** Abrir Ajustes, para los proveedores que la pastilla no lista por no estar comprobados. */
  alAbrirAjustes?: () => void;
  /** El dispositivo de la sesión, tal como lo cuenta el servidor. Ausente = ninguno. */
  dispositivo?: DispositivoElegido;
  /** La última medida de la máquina, para la lista. Ausente = todavía no llegó. */
  dispositivos?: InformeDeDispositivos;
  /**
   * El modo de escritura de la sesión abierta. Ausente = no hay sesión, y entonces no se
   * pinta pastilla — nunca significa «supervisado».
   */
  modoDeEscritura?: ModoDeEscritura;
  /** Cambiar el modo. Ausente = no se pinta pastilla, como las otras tres. */
  alElegirModoDeEscritura?: (modo: ModoDeEscritura) => void;
  /** Elegir dispositivo: el id, o `undefined` para quitarlo. Ausente = no se pinta pastilla. */
  alElegirDispositivo?: (id: string | undefined) => void;
  /** Volver a medir la máquina desde el menú de la pastilla. Ausente = no se ofrece. */
  alMedirDispositivos?: () => void;
  /**
   * Sube los bytes de UN adjunto elegido, soltado o pegado. Ausente = no se pinta el «+» ni
   * se aceptan sueltos o pegados — la misma regla que ya siguen `alElegirDispositivo` y
   * `alElegirModoDeEscritura`: un control sin dato detrás no se pinta. El `nombre` ya viene
   * convertido a segmento llano por `nombreDeAdjuntoSeguro` y hecho único entre las fichas;
   * quien decide si vale de verdad es el servidor, dos veces.
   */
  alSubirAdjunto?: (fichero: File, nombre: string) => Promise<{ ok: boolean; motivo?: string }>;
  /**
   * Manda el turno con lo escrito y los NOMBRES de las fichas «listo» —`[]` sin ninguna—.
   * Los nombres y no los `File`: los bytes ya están en el servidor (`alSubirAdjunto` los
   * subió al elegirlos), así que el mensaje del cable solo necesita decir cuáles.
   */
  alEnviar: (texto: string, adjuntos: string[]) => void;
  /**
   * Un texto que alguien de FUERA deja escrito en la caja —hoy, «Pedir corrección» de un
   * hallazgo—, con un `id` que cambia en cada petición para que dos iguales seguidas cuenten
   * como dos. Se AÑADE a lo que haya, en su propia línea: pisar un borrador a medias sería
   * perder lo que la persona estaba escribiendo. Nunca se envía solo; la envía quien lo lee.
   */
  borrador?: { texto: string; id: number };
}) {
  const [valor, setValor] = useState("");
  const campo = useRef<HTMLTextAreaElement>(null);
  const entradaDeFicheros = useRef<HTMLInputElement>(null);
  const [fichas, setFichas] = useState<FichaDeAdjunto[]>([]);
  /** Solo mientras se arrastra algo POR ENCIMA: es lo que enciende `data-arrastrando`. Un
   *  soltado normal (drop) ya no está «arrastrando», así que se apaga ahí también. */
  const [arrastrando, setArrastrando] = useState(false);

  /**
   * Sube cada fichero elegido, soltado o pegado, UNO A UNO —igual que `NuevaTarea#añadir`,
   * y por la misma razón medida ahí: el Set de nombres tomados vive en una variable LOCAL y
   * no en el estado, porque React solo garantiza la vía *eager* del `setState` con la fibra
   * sin trabajo pendiente. Con dos ficheros del mismo nombre en una sola elección, la
   * segunda vuelta del bucle llega después de un `await` con una actualización
   * posiblemente en cola: leer `fichas` ahí vería la lista de ANTES del primero.
   */
  const añadirFicheros = async (elegidos: readonly File[]): Promise<void> => {
    if (alSubirAdjunto === undefined) return;
    const tomados = new Set(fichas.map((f) => f.nombre));
    for (const fichero of elegidos) {
      const base = nombreDeAdjuntoSeguro(fichero.name);
      if (base === undefined) {
        // No se inventa uno: se dice, y la ficha se queda ahí hasta que alguien la quite.
        setFichas((ya) => [...ya, { nombre: fichero.name, estado: "falló", motivo: "no se puede usar ese nombre aquí" }]);
        continue;
      }
      const nombre = nombreUnicoEntreFichas(base, tomados);
      tomados.add(nombre);
      setFichas((ya) => [...ya, { nombre, estado: "subiendo" }]);
      const r = await alSubirAdjunto(fichero, nombre);
      setFichas((ya) =>
        ya.map((f) =>
          f.nombre === nombre && f.estado === "subiendo"
            ? { ...f, estado: r.ok ? "listo" : "falló", ...(r.ok || r.motivo === undefined ? {} : { motivo: r.motivo }) }
            : f
        )
      );
    }
  };

  const quitarFicha = (nombre: string): void => setFichas((ya) => ya.filter((f) => f.nombre !== nombre));

  const alSoltar = (evento: DragEvent<HTMLDivElement>): void => {
    if (alSubirAdjunto === undefined) return;
    evento.preventDefault();
    setArrastrando(false);
    void añadirFicheros(Array.from(evento.dataTransfer.files));
  };

  /**
   * Un pegado CON ficheros —una captura de pantalla, lo más común— se sube como adjunto y
   * NUNCA pega texto: `preventDefault` es lo que lo impide. Sin ficheros el pegado sigue su
   * camino normal, que es lo que hace que pegar una frase copiada de otro sitio no cambie
   * de comportamiento.
   */
  const alPegar = (evento: ClipboardEvent<HTMLTextAreaElement>): void => {
    if (alSubirAdjunto === undefined) return;
    const pegados = Array.from(evento.clipboardData?.files ?? []);
    if (pegados.length === 0) return;
    evento.preventDefault();
    const renombrados = pegados.map(
      (fichero, i) => new File([fichero], `pegado-${i + 1}.${extensionDePegado(fichero.type)}`, { type: fichero.type })
    );
    void añadirFicheros(renombrados);
  };

  useEffect(() => {
    if (borrador === undefined) return;
    setValor((antes) => (antes.trim() === "" ? borrador.texto : `${antes.replace(/\s+$/, "")}\n${borrador.texto}`));
    // Con el foco dentro la caja se DESPLIEGA (`:focus-within`), que es donde se lee lo que
    // acaba de aparecer, y quien lo pidió puede retocarlo y mandarlo sin ir a pinchar nada.
    campo.current?.focus();
    // Solo el `id`: el texto de una petición no cambia sin que cambie su id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrador?.id]);

  /**
   * Al dejar de haber algo pendiente, el foco vuelve a la caja.
   *
   * No es una comodidad: la caja se APAGA con una aprobación, pregunta, selector o secreto
   * en pantalla (`disabled`, ver abajo), y un elemento que se deshabilita pierde el foco — el
   * navegador se lo devuelve al `<body>`. Así que quien acababa de resolver el diálogo se
   * encontraba con que teclear no escribía en ningún sitio y había que ir a pinchar la caja
   * con el ratón. Lo que se arregla aquí es eso, no un adorno.
   *
   * Desde IXCODE-4 esto mira `hayPendiente` y NO `turnoEnVuelo`: el turno en vuelo a secas ya
   * no apaga la caja, así que no hay flanco de bajada del que devolver nada.
   *
   * Solo en el flanco de bajada de `hayPendiente`, y solo si la caja está a la vista y
   * habilitada: robar el foco al montar, o mientras el usuario mira un diff en Ficheros,
   * sería lo contrario de lo que se quiere.
   */
  const veniaDePendiente = useRef(false);
  useEffect(() => {
    const acabaDeTerminar = veniaDePendiente.current && !hayPendiente;
    veniaDePendiente.current = hayPendiente;
    if (acabaDeTerminar && !oculto && conectado) campo.current?.focus();
  }, [hayPendiente, oculto, conectado]);

  // Una ficha «subiendo» o «falló» BLOQUEA el envío: los bytes tienen que estar en disco
  // ANTES de mandar el turno, y una que falló tiene que quitarse o reintentarse, no colarse
  // con un nombre que el servidor nunca recibió.
  const fichaEnVuelo = fichas.some((f) => f.estado === "subiendo");
  const fichaFallida = fichas.some((f) => f.estado === "falló");

  const enviar = (): void => {
    // Con algo pendiente no se manda: una aprobación o pregunta compite por la misma
    // respuesta. Con turno en vuelo y SIN nada pendiente, sí se manda — es la nota de
    // IXCODE-4, y el servidor decide si se apunta al turno en marcha o abre uno nuevo.
    if (hayPendiente) return;
    if (fichaEnVuelo || fichaFallida) return;
    const texto = valor.trim();
    const adjuntos = fichas.filter((f) => f.estado === "listo").map((f) => f.nombre);
    // Vacío se puede mandar SI lleva adjuntos: una captura sin comentario es un turno
    // válido. Sin ninguno de los dos no hay nada que mandar, como antes.
    if (texto === "" && adjuntos.length === 0) return;
    alEnviar(texto, adjuntos);
    setValor("");
    setFichas([]);
  };

  // Enter envía; Shift+Enter salta de línea (el `textarea` lo hace solo si no se
  // intercepta). `preventDefault` es lo que evita el salto EN VEZ de enviar.
  const alPulsarTecla = (evento: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault();
      enviar();
    }
  };

  return (
    <div className={estilos.envoltura} hidden={oculto}>
      {/*
        `data-trabajando` en la caja, no una clase más: es un ESTADO —lo dice el servidor y
        cambia solo— y el CSS lo lee como tal. De ahí cuelga el borde animado, que es la
        única señal de «está pasando algo» mientras el agente no habla.
      */}
      {/*
        `data-con-texto` abre la caja aunque no tenga el foco: un borrador a medias es
        trabajo empezado, y plegarle los controles a quien vuelve de mirar un fichero sería
        esconderle con qué modelo iba a mandarlo. Lo demás lo decide `:focus-within` en CSS
        y no un `onBlur` en React, y esa elección no es de estilo: con estado de React, al
        tabular desde el campo el navegador desmontaría la pastilla ANTES de que el foco
        llegara a ella y se quedaría en el `<body>`. Con `:focus-within` el campo todavía
        tiene el foco cuando se calcula el estilo, así que la banda está a la vista y el Tab
        la alcanza.
      */}
      <div
        className={estilos.compositor}
        data-trabajando={turnoEnVuelo ? "" : undefined}
        data-con-texto={valor === "" ? undefined : ""}
        // Soltar es de la CAJA entera y no solo del campo: la maqueta no lo distingue, y
        // un usuario que suelta un poco fuera del `<textarea>` no tiene por qué perder el
        // fichero. Sin `alSubirAdjunto` los tres manejadores se quedan mudos (ver arriba),
        // así que soltar algo aquí sin la capacidad no hace nada — ni siquiera enciende
        // `data-arrastrando`.
        data-arrastrando={arrastrando ? "" : undefined}
        onDragOver={(evento) => {
          if (alSubirAdjunto === undefined) return;
          // Sin esto el navegador no permite soltar: es su comportamiento por omisión.
          evento.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltar}
      >
        {/*
          **La banda de ARRIBA: con qué va a correr esto.** Modelo, esfuerzo y dispositivo
          viven encima del campo y separados por un filete, que es la forma de la maqueta de
          Stitch — y la que parte la caja por lo que significa cada mitad: arriba se
          configura el motor, abajo se decide qué pasa con lo que escriba y se manda.

          Ya estuvieron arriba una vez y volvieron abajo mirando la pantalla, con un
          argumento que hay que respetar: «un chip solo no era una fila, era un renglón».
          Entonces subía el dispositivo SOLO; aquí suben tres controles y abajo se quedan el
          modo, el gasto y el botón, así que ninguna de las dos bandas es un renglón huérfano.
        */}
        <div className={estilos.motor}>
          {/*
            **Lo consumido por la sesión, arriba a la izquierda.** Es un dato que se MIRA y
            no se toca, así que vive en la banda del estado y no junto a la acción: abajo
            compartía sitio con el botón de enviar, que es lo único de la caja que no es
            información.

            Conserva su caja propia porque de ella cuelga la regla que lo retira cuando el
            renglón no da de sí — el nombre de su clase lo hashea su módulo y desde aquí no
            se alcanza. Sin dato no se pinta: ausente es «no consta», no cero.
          */}
          <div className={estilos.gasto}>
            <ContadorDeTokens {...(consumo === undefined ? {} : { consumo })} />
          </div>
          {/*
            El dispositivo, arriba a la derecha, con el gasto al otro extremo: los dos son
            de la SESIÓN y se miran, no se pelean por el turno que vas a mandar. Ya no está
            al lado del modelo porque el modelo se ha ido abajo, con lo que decide el turno.
          */}
          {alElegirDispositivo === undefined ? null : (
            /* En su propia caja porque de ahí cuelga el `margin-left: auto` que lo manda al
               otro extremo de la banda: sin envoltorio habría que nombrar la clase de la
               pastilla, que vive en otro módulo y va hasheada. */
            <div className={estilos.dispositivo}>
              <PastillaDeDispositivo
                {...(dispositivo === undefined ? {} : { elegido: dispositivo })}
                {...(dispositivos === undefined ? {} : { informe: dispositivos })}
                conectado={conectado}
                alElegir={alElegirDispositivo}
                {...(alMedirDispositivos === undefined ? {} : { alMedir: alMedirDispositivos })}
              />
            </div>
          )}
        </div>
        <textarea
          ref={campo}
          className={estilos.entrada}
          value={valor}
          disabled={!conectado || hayPendiente}
          // Deshabilitado no puede quedarse mudo: dice POR QUÉ, en vez de dejar al usuario
          // adivinando si el campo está roto o si nadie escucha al otro lado. Y son DOS
          // motivos distintos: sin cable no llega nada; con algo pendiente, escribir aquí
          // competiría con la respuesta que de verdad se espera. Un turno en vuelo A SECAS
          // ya NO apaga la caja desde IXCODE-4: se puede escribir mientras el agente trabaja
          // en silencio.
          placeholder={
            !conectado
              ? "sin conexión con XOneCode"
              : hayPendiente
                ? "responde arriba antes de seguir"
                : // DOS líneas: lo que el harness sabe hacer, y debajo las teclas.
                  //
                  // Las teclas estaban en un `<p>` bajo la tarjeta y se han metido aquí para
                  // devolverle ese renglón al transcript, que es lo único elástico de la
                  // columna. Caben porque la caja en reposo mide 48 px, que son dos líneas:
                  // el aviso de «con la ventana estrecha el largo partía en dos» dejó de
                  // aplicar cuando las pastillas se pliegan y ya no hay contra qué apretar.
                  //
                  // **Y el precio declarado**: un placeholder se va en cuanto escribes, o
                  // sea que la ayuda desaparece justo mientras redactas un párrafo largo,
                  // que es cuando saber que Enter envía más importa. Lo que lo hace
                  // aceptable es que las dos teclas se aprenden una vez; si resulta que no,
                  // el sitio sin coste es el hueco libre de la banda de abajo.
                  "Pregunta sobre XOne, o /comando…\nEnter envía · Shift+Enter salta de línea"
          }
          /* Los ejemplos, donde caben: el placeholder se lee en cada turno y tiene que
             caber en una línea; esto se consulta una vez. */
          title="Pregunta sobre la plataforma, pide un cambio en una colección o en un script, o escribe /comando"
          onChange={(evento) => setValor(evento.target.value)}
          onKeyDown={alPulsarTecla}
          onPaste={alPegar}
        />
        {/*
          Las FICHAS, entre el campo y la banda de abajo: es donde ya vivía la lista de
          `NuevaTarea` respecto a su propio campo, y el mismo sitio dice lo mismo aquí —lo
          que se va a mandar con el próximo turno, antes de mandarlo. Vacía no se pinta.
        */}
        {fichas.length === 0 ? null : (
          <ul className={estilos.fichas}>
            {fichas.map((f) => (
              <li key={f.nombre} className={estilos.ficha} data-estado={f.estado}>
                <span className={estilos.nombreDeFicha}>{f.nombre}</span>
                <span className={estilos.estadoDeFicha}>
                  {f.estado === "subiendo" ? "subiendo…" : f.estado === "listo" ? "listo" : (f.motivo ?? "no se pudo subir")}
                </span>
                <button
                  type="button"
                  className={estilos.quitarFicha}
                  aria-label={`Quitar ${f.nombre}`}
                  onClick={() => quitarFicha(f.nombre)}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
        {/*
          **La banda de ABAJO: qué pasa con lo que escriba, y mandarlo.** El «+» abre la
          banda —anexar es lo primero que se decide, antes que el modo o el modelo—, luego
          el modo de escritura, y el gasto con la acción a la derecha. La pastilla de
          permisos de la referencia sigue sin estar por el motivo de siempre: no hay dato ni
          acción detrás, y un control así es la misma mentira que una lista vacía rellenada
          con un placeholder.
        */}
        <div className={estilos.controles}>
          {/*
            El «+»: sin `alSubirAdjunto` no se pinta —control sin dato detrás—, y entonces
            tampoco valen un soltado ni un pegado (los tres manejadores de arriba se quedan
            mudos solos). El `<input>` va ESCONDIDO y lo abre este botón, por lo mismo que
            documenta `NuevaTarea`: el selector nativo solo lo puede abrir un input de
            fichero, y su cromo no seguía el estilo de sus vecinos.
          */}
          {alSubirAdjunto === undefined ? null : (
            <>
              <button
                type="button"
                className={estilos.anexar}
                disabled={!conectado}
                aria-label="Anexar ficheros"
                title="Anexar ficheros (también puedes soltarlos o pegarlos)"
                onClick={() => entradaDeFicheros.current?.click()}
              >
                <IconoDeAnexar />
              </button>
              <input
                ref={entradaDeFicheros}
                hidden
                type="file"
                multiple
                onChange={(evento) => {
                  void añadirFicheros(Array.from(evento.target.files ?? []));
                  // El mismo fichero se puede volver a elegir tras un fallo: sin esto el
                  // `change` no vuelve a dispararse con el mismo nombre.
                  evento.target.value = "";
                }}
              />
            </>
          )}
          {/*
            El MODO DE ESCRITURA sigue al «+», y no está arriba con las otras tres a
            propósito: aquéllas dicen CON QUÉ va a correr, y ésta qué va a pasar con lo que
            escriba — que es la misma pregunta que contestan el gasto y el botón de al lado.
            Sin sesión no hay modo y no se pinta: un control sin dato detrás no se pinta.
          */}
          {alElegirModoDeEscritura === undefined ? null : (
            <SelectorDeModo
              {...(modoDeEscritura === undefined ? {} : { actual: modoDeEscritura })}
              conectado={conectado}
              alElegir={alElegirModoDeEscritura}
            />
          )}
          {/*
            **El motor, abajo a la derecha, pegado al botón.** Modelo y esfuerzo son lo que
            va a CORRER con lo próximo que mandes, así que se leen justo antes de pulsar —
            que es donde está el botón. Y de paso arreglan un límite del plegado: la banda
            de arriba se va en reposo, así que ahí el modelo en vigor dejaba de verse; aquí
            está siempre.

            Va DENTRO de `.acciones` y no al lado con su propio `margin-left: auto`, que es
            la lección ya pagada: los márgenes automáticos se REPARTEN el hueco libre, y con
            dos el conjunto se quedaría flotando a mitad de fila en vez de junto al botón.
          */}
          <div className={estilos.acciones}>
            {/*
              Modelo y esfuerzo en UNA caja con separador interno. Es lo que el código ya
              decía y la forma no sostenía: «el esfuerzo no es una elección independiente, es
              un ajuste DE ese modelo — qué niveles hay depende de cuál esté puesto». Estaban
              pegados y se leían como dos elecciones hermanas.

              La clase sale de `PastillaDeModelo.module.css`, la hoja que ya comparten las
              pastillas: el nombre de un módulo CSS va hasheado, así que agrupar desde aquí dos
              componentes de esa familia solo se puede nombrando su hoja. Y ahí es donde tiene
              que vivir la regla, que es de la familia y no de este renglón.
            */}
            <div className={pastillas.conjunto}>
              {modelos !== undefined ? (
                <PastillaDeModelo
                  {...(modelos.actual === undefined ? {} : { actual: modelos.actual })}
                  proveedores={modelos.proveedores}
                  alPedirCatalogo={(proveedor) => alPedirCatalogo?.(proveedor)}
                  // Una ACCIÓN, no un comando: por el cable viaja `{clase:"modelo", id}` y es
                  // el servidor quien decide que aplicarla es reusar el manejador de `/modelo`.
                  // Mandar aquí la prosa «/modelo …» apuntaba en el transcript un acto de
                  // usuario que nadie tecleó —y de ahí sale el título de la sesión— y dejaba la
                  // interfaz hablando en la sintaxis del terminal.
                  alElegir={(id) => alElegirModelo?.(id)}
                  // La pastilla solo lista lo COMPROBADO; los demás se cuentan con el camino
                  // para configurarlos, que es esta ventana.
                  {...(alAbrirAjustes === undefined ? {} : { alAbrirAjustes })}
                />
              ) : null}
              {/*
                El esfuerzo, DENTRO de la misma caja que el modelo: no es una elección
                independiente, es un ajuste DE ese modelo — qué niveles hay depende de cuál
                esté puesto, y la mitad de los modelos de este harness no admiten ninguno.
                Por eso se pinta solo cuando el servidor manda niveles, y por eso lleva el
                rótulo `pensar:` delante: un «low» a secas junto al nombre del modelo se lee
                como parte del modelo.
              */}
              {alElegirEsfuerzo === undefined ? null : (
                <PastillaDeEsfuerzo
                  {...(modelos?.esfuerzo === undefined ? {} : { niveles: modelos.esfuerzo.niveles })}
                  {...(modelos?.esfuerzo?.actual === undefined ? {} : { actual: modelos.esfuerzo.actual })}
                  {...(modelos?.esfuerzo?.nota === undefined ? {} : { nota: modelos.esfuerzo.nota })}
                  conectado={conectado}
                  alElegir={alElegirEsfuerzo}
                />
              )}
            </div>
            {/*
              La MISMA ranura, dos acciones: con turno en vuelo es parar, y si no, enviar.
              Dos botones a la vez —uno inerte al lado del otro— dejaría al usuario eligiendo
              entre dos cosas cuando solo una tiene sentido en cada momento.
            */}
            {turnoEnVuelo && alDetener !== undefined && !hayPendiente ? (
              <button
                type="button"
                className={estilos.detener}
                disabled={!conectado}
                title="Los especialistas cierran con lo que llevan hecho y el orquestador replanifica con lo que hayas escrito"
                onClick={() => {
                  alDetener(valor.trim());
                  setValor("");
                }}
              >
                Detener y replanificar
              </button>
            ) : null}
            {turnoEnVuelo ? (
              <button
                type="button"
                className={`${estilos.enviar} ${estilos.parar}`}
                disabled={!conectado || alParar === undefined}
                aria-label="Parar"
                title="Parar el turno"
                onClick={() => alParar?.()}
              >
                ■
              </button>
            ) : (
              <button
                type="button"
                className={estilos.enviar}
                disabled={!conectado || fichaEnVuelo || fichaFallida}
                aria-label="Enviar"
                // Deshabilitado por una ficha DICE por qué, la misma regla que ya sigue el
                // campo: un botón mudo deja adivinando si está roto o si nadie escucha.
                {...(fichaEnVuelo
                  ? { title: "espera a que termine de subir el adjunto" }
                  : fichaFallida
                    ? { title: "quita el adjunto que falló antes de enviar" }
                    : {})}
                onClick={enviar}
              >
                {/* El glifo de la maqueta en vez del carácter `↑`, que dependía de la
                    fuente del sistema y se pintaba de un peso distinto en cada una. */}
                <IconoDeEnviar />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
