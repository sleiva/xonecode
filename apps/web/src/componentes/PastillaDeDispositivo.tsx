import { useCallback, useRef, useState } from "react";
import { useCerrarAlPulsarFuera } from "../cerrarAlPulsarFuera.js";
import type { DispositivoElegido, InformeDeDispositivos } from "../tipos.js";
import { etiquetaDeEstado, inventario } from "../inventarioDeDispositivos.js";
import { IconoDeChevron, IconoDeDispositivo } from "./IconosDelCompositor.js";
import estilos from "./PastillaDeModelo.module.css";

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
}) {
  const [abierta, setAbierta] = useState(false);
  const envoltura = useRef<HTMLDivElement>(null);
  const cerrarMenu = useCallback(() => setAbierta(false), []);
  useCerrarAlPulsarFuera(abierta, envoltura, cerrarMenu);

  const { fisicos, virtuales } = informe === undefined ? { fisicos: [], virtuales: [] } : inventario(informe);
  const todos = [...fisicos, ...virtuales];
  // ¿El elegido sigue estando? Con `informe` ausente no se afirma ninguna de las dos cosas:
  // no hay medida contra la que comprobarlo, y decir «no está» sería inventarlo.
  const presente = informe === undefined || todos.some((d) => d.id === elegido?.id);

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
            {d.nombre} · {d.plataforma === "ios" ? "iOS" : "Android"} · {etiquetaDeEstado(d)}
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
        title={elegido === undefined ? "Elige el dispositivo de esta sesión" : presente ? elegido.nombre : `${elegido.nombre} — no está en la última medida`}
        onClick={() => setAbierta((v) => !v)}
      >
        <IconoDeDispositivo />
        <span>
          {elegido === undefined ? "Sin dispositivo" : elegido.nombre}
          {elegido !== undefined && !presente ? " ·" : null}
        </span>
        <IconoDeChevron />
      </button>
      {abierta ? (
        <div className={estilos.menu} role="menu" aria-label="dispositivo de la sesión">
          <div className={estilos.titulo} role="presentation">
            Dispositivo de esta sesión
          </div>
          <div className={estilos.modelos}>
            <button
              type="button"
              role="menuitem"
              className={estilos.modelo}
              data-actual={elegido === undefined ? "" : undefined}
              onClick={() => elegir(undefined)}
            >
              Ninguno
            </button>
            {/* El elegido que ya no está sigue en la lista y lo DICE: quitarlo de la vista
                haría desaparecer la elección sin que nadie la haya deshecho. */}
            {elegido !== undefined && !presente ? (
              <button type="button" role="menuitem" className={estilos.modelo} data-actual="" onClick={() => elegir(elegido.id)}>
                {elegido.nombre} · no está en la última medida
              </button>
            ) : null}
            {grupo("Teléfonos y tablets", fisicos)}
            {grupo("Simuladores y emuladores", virtuales)}
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
            Se guarda con la sesión. La usan la pestaña Ejecutar para lanzar la app y el agente
            cuando prueba en un aparato; sin elegir ninguno, prefiere un emulador.
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
