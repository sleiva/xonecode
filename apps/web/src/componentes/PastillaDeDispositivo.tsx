import { useCallback, useRef, useState } from "react";
import { useCerrarAlPulsarFuera } from "../cerrarAlPulsarFuera.js";
import type { DispositivoElegido, InformeDeDispositivos } from "../tipos.js";
import { etiquetaDeEstado, inventario, seLlegaAlDispositivo } from "../inventarioDeDispositivos.js";
import { IconoDeChevron, IconoDeDispositivo } from "./IconosDelCompositor.js";
import estilos from "./PastillaDeModelo.module.css";
import conmutador from "./SelectorDeModo.module.css";
import type { EstadoDeGranja } from "../store.js";

/**
 * Con qué dispositivo trabaja ESTA sesión, al lado de la pastilla del modelo.
 *
 * Es el mismo tipo de dato que el modelo y por eso vive en el mismo sitio: una elección de
 * la sesión que decide el servidor y el cliente pinta. En Ajustes NO se elige —esa ventana
 * dice «Configuración global» en su cabecera y ahí solo se ve el inventario del equipo—:
 * mezclarlas es lo que hacía que un botón junto a un punto verde se leyera como si
 * concediera la capacidad.
 *
 * Cuatro reglas, las mismas que sostienen la pastilla del modelo:
 * - **Lo que hay en vigor lo dice el SERVIDOR** (`alta.dispositivoActivo`), y viaja como
 *   una FOTO —id, nombre, plataforma y clase—, no como un id suelto: los ids no son
 *   estables (`emulator-5554` es un puerto) y al reabrir una sesión la pastilla tiene que
 *   poder decir «iPhone 16 · no está ahora» en lugar de un serial crudo o nada.
 * - **Si el elegido no está en la última medida, se DICE**, no se borra ni se finge. Lo
 *   sabe el cliente porque tiene las dos cosas: la elección y la foto de la máquina.
 * - **La lista son los dispositivos medidos**, en los dos grupos de siempre —lo que se
 *   enchufa y lo que se arranca— y con su propio desplazamiento: esta máquina tiene 35
 *   simuladores.
 * - **Elegir manda el ID y nada más.** El servidor resuelve el resto contra su medida: el
 *   navegador no es fuente sobre la máquina.
 *
 * **La elección la consumen la pestaña Ejecutar**, que lanza la app en ese aparato, **y el
 * `device-controller`**: los scripts de `xone-hotswap` la leen de un fichero de la sesión en cada
 * ejecución (`core/dispositivoDeSesion.ts`). El pie lo dice ahora; hasta que existió eso, decía
 * solo lo de la pestaña, porque era lo único cierto.
 */
export function PastillaDeDispositivo({
  elegido,
  informe,
  conectado = true,
  alElegir,
  alMedir,
  enUso,
  proyectoActual,
  titulo = "Dispositivo de esta sesión",
  pie = "Se guarda con la sesión. La usan la pestaña Ejecutar para lanzar la app y el agente cuando prueba en un aparato; sin elegir ninguno, prefiere un emulador.",
  enLinea = false,
  origen,
  proyecto,
  granja,
  alCambiarOrigen,
  ofrecerGranja = false,
  copiaDeGranja,
}: {
  /** El de la sesión, tal como lo cuenta el servidor. Ausente = ninguno elegido. */
  elegido?: DispositivoElegido;
  /** La última medida de la máquina. Ausente = todavía no ha llegado ninguna. */
  informe?: InformeDeDispositivos;
  conectado?: boolean;
  /** El id, o `undefined` para quitar la elección. */
  alElegir: (id: string | undefined) => void;
  /**
   * Volver a medir la máquina desde el propio menú. La lista es una FOTO —se mide al conectar y
   * al pedirlo, sin sondeo—, y un emulador que arrancó un script después no sale hasta que se
   * vuelve a medir: tener que ir a «Tu equipo» para eso es no saber que hace falta. Ausente = no
   * se ofrece.
   */
  alMedir?: () => void;
  /**
   * Qué aparato tiene elegido CADA consola abierta, tal como lo cuenta el servidor. Es un AVISO,
   * no un bloqueo: dos sesiones pueden querer el mismo aparato y decidirlo es de la persona.
   * Ausente = no se sabe, y todo se pinta como siempre.
   */
  enUso?: { id: string; proyecto: string; tarea?: string }[];
  /** El proyecto de ESTA consola, con la forma que usa el servidor en `enUso`: la propia no cuenta como «otra». */
  proyectoActual?: string;
  /** De qué pregunta habla el menú. En Ajustes es el aparato de las sesiones NUEVAS (IXCODE-51), no el de ésta. */
  titulo?: string;
  /** La nota del pie del menú, por lo mismo. */
  pie?: string;
  /**
   * En línea y no flotando, como `PastillaDeModelo#enLinea`: dentro del panel de Ajustes, que ya se
   * desplaza, un menú en absoluto lo recortaría el borde. La lista y sus reglas son las MISMAS.
   */
  enLinea?: boolean;
  /**
   * De dónde saca los aparatos el PROYECTO de esta sesión (la granja de dispositivos, `core/granja.ts`).
   * Ausente = esta consola no ofrece la granja, y el menú es el de siempre.
   */
  origen?: "local" | "granja";
  /** El nombre del proyecto, para decir de QUIÉN es la elección («Maset usa»). */
  proyecto?: string;
  /** La granja de Ajustes, para decir si está configurada y qué contestó la última prueba. */
  granja?: EstadoDeGranja;
  /** Cambia el origen del proyecto. Ausente = no se ofrece el conmutador. */
  alCambiarOrigen?: (origen: "local" | "granja") => void;
  /**
   * Ofrecer la granja como una fila más, SIN conmutador: es el aparato por omisión de Ajustes → General, donde
   * elegirla es elegir el origen global. Solo con la granja configurada.
   */
  ofrecerGranja?: boolean;
  /** La copia que tiene ahora la sesión («Pixel 3 · copia 1»). Ausente = ninguna cogida. */
  copiaDeGranja?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const envoltura = useRef<HTMLDivElement>(null);
  const cerrarMenu = useCallback(() => setAbierta(false), []);
  useCerrarAlPulsarFuera(abierta, envoltura, cerrarMenu);

  const { fisicos, virtuales } = informe === undefined ? { fisicos: [], virtuales: [] } : inventario(informe);
  const todos = [...fisicos, ...virtuales];
  /**
   * **Lo que está a mano va ARRIBA, en su propio grupo y con punto verde**, sea un teléfono o un
   * emulador. Pedido mirando la pantalla: con los grupos por clase, un iPhone «no disponible»
   * iba delante del emulador arrancado, que es el que se iba a elegir. Android antes que iOS
   * dentro del grupo, por la misma preferencia que el agente. El verde nunca va solo: el texto
   * de la fila dice el estado con palabras.
   */
  const orden = (d: (typeof todos)[number]): number => (d.plataforma === "android" ? 0 : 1);
  // Con la granja, los Android de este equipo no se ofrecen: el Android ES la granja. iOS sigue local.
  const enGranja = origen === "granja";
  const ofrecible = (d: (typeof todos)[number]): boolean => !enGranja || d.plataforma === "ios";
  const disponibles = todos.filter((d) => ofrecible(d) && seLlegaAlDispositivo(d)).sort((a, b) => orden(a) - orden(b));
  const fisicosApagados = fisicos.filter((d) => ofrecible(d) && !seLlegaAlDispositivo(d));
  const virtualesApagados = virtuales.filter((d) => ofrecible(d) && !seLlegaAlDispositivo(d));
  // ¿El elegido sigue estando? Con `informe` ausente no se afirma ninguna de las dos cosas:
  // no hay medida contra la que comprobarlo, y decir «no está» sería inventarlo. La granja no se mide aquí.
  const presente = elegido?.clase === "granja" || informe === undefined || todos.some((d) => d.id === elegido?.id);
  const granjaConfigurada = granja?.direccion !== undefined && granja.hayToken;
  /** Lo que se dice bajo la fila de la granja: si está configurada y qué contestó la última prueba. */
  const detalleDeGranja = copiaDeGranja !== undefined
    ? `ahora: ${copiaDeGranja}, hasta que acabe el turno`
    : !granjaConfigurada
    ? "sin configurar"
    : granja?.prueba?.estado === "conectada"
      ? `${granja.prueba.resumen.copias.libres} copias libres en ${granja.prueba.resumen.telefonos} teléfonos`
      : granja?.prueba !== undefined
        ? "no conecta: mira Ajustes → Dispositivos → Granja"
        : "se pide una copia libre al probar";

  // Las entradas de esta misma consola no avisan de nada: el aparato es suyo. Una TAREA sí, aunque sea del mismo
  // proyecto: es otra consola probando en ese teléfono (IXCODE-58).
  const otros = (enUso ?? []).filter((u) => u.proyecto !== proyectoActual || u.tarea !== undefined);
  const usoDe = (id: string): string | undefined => {
    const uso = otros.find((u) => u.id === id);
    return uso === undefined ? undefined : uso.tarea === undefined ? uso.proyecto : `la tarea «${uso.tarea}»`;
  };
  const usoDelElegido = elegido === undefined ? undefined : usoDe(elegido.id);

  const elegir = (id: string | undefined): void => {
    setAbierta(false);
    alElegir(id);
  };

  const grupo = (titulo: string, lista: readonly (typeof todos)[number][]) =>
    lista.length === 0 ? null : (
      <div className={estilos.grupo}>
        <div className={estilos.titulo} role="presentation">
          {titulo}
        </div>
        {lista.map((d) => (
          /**
           * **Un AVD que solo existe como definición NO se puede elegir, y se dice.**
           *
           * Esas filas las inventa `inventario()` a partir de `informe.avds`, y el servidor
           * resuelve el elegido contra `informe.dispositivos`, donde no están: elegirlas no
           * encontraba nada, no hacía nada y no lo decía. El arreglo es no ofrecer lo que no
           * se puede dar — con el motivo en el `title`, porque un botón apagado sin decir por
           * qué es el otro fallo mudo de la pareja.
           *
           * Se mira `soloDefinicion` y no el estado: un simulador de iOS APAGADO sí se puede
           * elegir —viene del informe y el servidor lo resuelve—, así que apagar por «no está
           * arrancado» quitaría treinta y cinco filas legítimas.
           */
          <button
            key={d.id}
            type="button"
            role="menuitem"
            className={estilos.modelo}
            data-actual={d.id === elegido?.id ? "" : undefined}
            {...(d.id === elegido?.id ? { "aria-current": "true" as const } : {})}
            disabled={d.soloDefinicion === true}
            {...(d.soloDefinicion === true
              ? { title: "apagado — arráncalo para poder elegirlo" }
              : {})}
            onClick={() => elegir(d.id)}
          >
            <span
              className={estilos.puntoDeDispositivo}
              data-vivo={seLlegaAlDispositivo(d) ? "" : undefined}
              aria-hidden="true"
            />
            {/* Los nombres de iOS ya traen su plataforma desde el host («iPhone 16 · iOS 18.2»):
                añadirla otra vez salía como «iOS · iOS». Solo a los de Android. */}
            {d.plataforma === "android" ? `${d.nombre} · Android` : d.nombre} · {etiquetaDeEstado(d)}
            {usoDe(d.id) === undefined ? null : <span className={estilos.espera}>{`en uso en ${usoDe(d.id)}`}</span>}
          </button>
        ))}
      </div>
    );

  return (
    <div className={estilos.envoltura} ref={envoltura}>
      <button
        type="button"
        className={estilos.pastilla}
        aria-expanded={abierta}
        aria-haspopup="menu"
        disabled={!conectado}
        // El nombre a secas en la pastilla y el aviso en el título: la fila de controles del
        // compositor es estrecha, y «iPhone 16 (no está ahora)» la parte en dos.
        title={
          elegido === undefined
            ? "Elige el dispositivo de esta sesión"
            : `${presente ? elegido.nombre : `${elegido.nombre} — no está en la última medida`}${usoDelElegido === undefined ? "" : ` — también lo usa ${usoDelElegido}`}`
        }
        onClick={() => setAbierta((v) => !v)}
      >
        <IconoDeDispositivo />
        <span>
          {elegido === undefined ? "Sin dispositivo" : elegido.clase === "granja" && copiaDeGranja !== undefined ? `Granja · ${copiaDeGranja}` : elegido.nombre}
          {elegido !== undefined && !presente ? " ·" : null}
          {usoDelElegido === undefined ? null : (
            <span role="img" aria-label={`también lo usa ${usoDelElegido}`}>
              {" ⚠"}
            </span>
          )}
        </span>
        <IconoDeChevron />
      </button>
      {abierta ? (
        <div className={estilos.menu} role="menu" aria-label={titulo} data-en-linea={enLinea ? "" : undefined}>
          <div className={estilos.titulo} role="presentation">
            {titulo}
          </div>
          {origen === undefined || alCambiarOrigen === undefined ? null : (
            <div className={estilos.espera}>
              {/* De QUIÉN es la elección: del proyecto, para todas sus sesiones. */}
              <div className={estilos.titulo} role="presentation">
                {proyecto === undefined ? "Este proyecto usa" : `${proyecto} usa`}
              </div>
              <div className={conmutador.pista} role="group" aria-label="Origen de los aparatos del proyecto">
                {(["local", "granja"] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={conmutador.mitad}
                    aria-pressed={origen === o}
                    data-puesto={origen === o ? "" : undefined}
                    disabled={!conectado}
                    onClick={() => {
                      if (origen !== o) alCambiarOrigen(o);
                    }}
                  >
                    {o === "local" ? "Este equipo" : "Granja"}
                  </button>
                ))}
              </div>
              <div>Vale para todas las sesiones de este proyecto.</div>
            </div>
          )}
          <div className={estilos.modelos}>
            {enGranja ? (
              <>
                <div className={estilos.titulo} role="presentation">
                  Granja XOne
                </div>
                {granjaConfigurada ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={estilos.modelo}
                    data-actual={elegido?.clase === "granja" ? "" : undefined}
                    {...(elegido?.clase === "granja" ? { "aria-current": "true" as const } : {})}
                    onClick={() => elegir("granja")}
                  >
                    Un teléfono de la granja · {detalleDeGranja}
                  </button>
                ) : (
                  <p className={estilos.espera}>
                    La granja no está configurada: pon su dirección y tu token en Ajustes → Dispositivos → Granja.
                  </p>
                )}
              </>
            ) : (
              <>
            <button
              type="button"
              role="menuitem"
              className={estilos.modelo}
              data-actual={elegido === undefined ? "" : undefined}
              onClick={() => elegir(undefined)}
            >
              Ninguno
            </button>
                {ofrecerGranja && granjaConfigurada ? (
                  <div className={estilos.grupo}>
                    <div className={estilos.titulo} role="presentation">
                      Granja XOne
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      className={estilos.modelo}
                      data-actual={elegido?.clase === "granja" ? "" : undefined}
                      {...(elegido?.clase === "granja" ? { "aria-current": "true" as const } : {})}
                      onClick={() => elegir("granja")}
                    >
                      Un teléfono de la granja · {detalleDeGranja}
                    </button>
                  </div>
                ) : null}
              </>
            )}
            {/* El elegido que ya no está sigue en la lista y lo DICE: quitarlo de la vista
                haría desaparecer la elección sin que nadie la haya deshecho. */}
            {elegido !== undefined && !presente ? (
              <button type="button" role="menuitem" className={estilos.modelo} data-actual="" onClick={() => elegir(elegido.id)}>
                {elegido.nombre} · no está en la última medida
              </button>
            ) : null}
            {grupo(enGranja ? "iPhone en este equipo" : "Disponibles ahora", disponibles)}
            {grupo(enGranja ? "iPhone de este equipo, apagados" : "Teléfonos y tablets", fisicosApagados)}
            {grupo(enGranja ? "Simuladores de iOS" : "Simuladores y emuladores", virtualesApagados)}
            {informe === undefined ? (
              <p className={estilos.espera}>Todavía no ha llegado ninguna medida de este equipo.</p>
            ) : todos.length === 0 ? (
              <p className={estilos.espera}>No se ha encontrado ningún dispositivo. Los requisitos se instalan en Ajustes.</p>
            ) : null}
          </div>
          {alMedir === undefined ? null : (
            // La HORA de la foto al lado del botón: es lo que dice si hace falta pulsarlo.
            <div className={estilos.espera}>
              {informe === undefined ? null : `Medido a las ${horaDeMedida(informe.medido)}. `}
              <button type="button" className={estilos.volverAMedir} disabled={!conectado} onClick={() => alMedir()}>
                Volver a medir
              </button>
            </div>
          )}
          <p className={estilos.espera}>
            {enGranja
              ? "No se reserva ningún teléfono: al probar se pedirá una copia libre a la granja, y al acabar el turno se liberará. Todavía no se prueba en ella: Ejecutar y el agente lo dicen."
              : pie}
          </p>
        </div>
      ) : null}
    </div>
  );
}


/** «12:30» de una medida en ISO, en la hora de ESTE navegador. Una fecha rota no se pinta. */
function horaDeMedida(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "—" : fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
