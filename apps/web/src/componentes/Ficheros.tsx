import { useEffect } from "react";
import type { FicheroTocado } from "../tipos.js";
import estilos from "./Ficheros.module.css";

/**
 * Los ficheros que ESTA sesión ha tocado, y el parche de cada uno.
 *
 * Es la vista que faltaba para poder revisar lo que el agente ha hecho sin salir a un
 * terminal: la lista con su clase y su cuenta de líneas, y el diff completo al desplegar.
 *
 * **De dónde sale la verdad**: al abrir el proyecto se fotografía el árbol de git y se
 * apunta con una ref propia, `refs/xonecode/sesion/<id>` (ver `agent/sesionGit.ts` para por
 * qué una ref y no un tag). Lo que se lista es la diferencia entre esa foto y el estado de
 * ahora, así que cuenta también lo que el agente creó de cero —git todavía no lo seguía— y
 * lo que tocaste tú a mano.
 *
 * **«Sin marca» NO es «no tocaste nada», y «sin empezar» tampoco es lo mismo que ninguna de
 * las dos.** Si la sesión se abrió sin git usable —o antes de que esto existiera— no hay con
 * qué comparar, y se dice; si acaba de abrirse y aún no ha volcado ningún acto, no ha tocado
 * nada y eso SÍ se sabe. Las tres con una lista vacía se leerían igual, y la del medio haría
 * creer que un turno que escribió tres ficheros no escribió ninguno.
 *
 * El parche se pide al DESPLEGAR una fila, no al abrir la pestaña: un diff por fichero de un
 * turno largo son megas, y la mayoría no se miran.
 */
export function Ficheros({
  via,
  ficheros,
  parches,
  abierto,
  alAbrir,
  alRecargar,
}: {
  /** Ausente = todavía no ha llegado la respuesta; se dice, en vez de enseñar vacío. */
  via?: "git" | "sin-marca" | "sin-empezar";
  ficheros: readonly FicheroTocado[];
  /** Los parches ya traídos, por ruta. El que falta está pedido y en camino. */
  parches: Record<string, { texto: string; recortado: boolean }>;
  /** La ruta desplegada, si hay alguna. */
  abierto?: string;
  alAbrir: (ruta: string | undefined) => void;
  alRecargar: () => void;
}) {
  // Se piden al montar la pestaña: entrar a mirar ES la petición. Y `alRecargar` es estable
  // (viene de `App`), así que esto no se repite en cada render.
  useEffect(() => {
    alRecargar();
  }, [alRecargar]);

  if (via === undefined) {
    return <p className={estilos.aviso}>Consultando los ficheros de la sesión…</p>;
  }
  if (via === "sin-empezar") {
    return (
      <p className={estilos.aviso}>
        Esta sesión todavía no ha empezado: no ha tocado ningún fichero. En cuanto le mandes
        algo al agente, lo que escriba aparecerá aquí.
      </p>
    );
  }
  if (via === "sin-marca") {
    return (
      <p className={estilos.aviso}>
        No se puede saber qué ha tocado esta sesión: hace falta que el proyecto sea un repositorio
        de git, y que la sesión se abriera después de que xonecode empezara a marcarlas. No es que
        no haya cambios — es que no hay con qué compararlos.
      </p>
    );
  }
  if (ficheros.length === 0) {
    return <p className={estilos.aviso}>Esta sesión todavía no ha tocado ningún fichero.</p>;
  }

  const elegido = ficheros.find((f) => f.ruta === abierto);
  const parche = elegido === undefined ? undefined : parches[elegido.ruta];

  return (
    /*
      Dos paneles y no un acordeón. El acordeón metía el diff DENTRO de la fila, así que en
      cuanto el fichero tenía cien líneas la lista se iba de la pantalla: te quedabas mirando
      un diff sin saber de qué fichero era ni cuántos más había. La lista se queda siempre a
      la izquierda —es el índice de lo que ha hecho la sesión— y el diff ocupa su propio
      panel. Es la disposición de cualquier visor de diffs, y por este motivo exacto.
    */
    <div className={estilos.ficheros}>
      <div className={estilos.panel}>
        <div className={estilos.cabecera}>
          <span>
            {ficheros.length} {ficheros.length === 1 ? "fichero" : "ficheros"}
          </span>
          <button type="button" className={estilos.recargar} onClick={alRecargar}>
            Actualizar
          </button>
        </div>
        <ul className={estilos.lista}>
          {ficheros.map((f) => (
            <li key={f.ruta}>
              <button
                type="button"
                className={estilos.nombre}
                // `aria-current` y no `aria-expanded`: ya no despliega nada, elige cuál se
                // está mirando. Y va además del fondo, que solo no basta cuando la fila de
                // al lado está en `:hover`.
                {...(f.ruta === abierto ? { "aria-current": "true" as const } : {})}
                data-elegido={f.ruta === abierto ? "" : undefined}
                onClick={() => alAbrir(f.ruta === abierto ? undefined : f.ruta)}
              >
                <span className={estilos.clase} data-clase={f.clase} aria-label={f.clase}>
                  {f.clase === "nuevo" ? "A" : f.clase === "borrado" ? "D" : "M"}
                </span>
                {/* La carpeta cede y el nombre no: cuando la fila se queda corta, lo que se
                    recorta es el principio del árbol —«…/collections/»— y nunca el fichero,
                    que es lo que identifica la línea. Recortar por el final dejaría cuatro
                    rutas que empiezan igual y no se distinguen. */}
                <span className={estilos.ruta}>
                  {carpeta(f.ruta) === "" ? null : (
                    <span className={estilos.carpeta}>{carpeta(f.ruta)}</span>
                  )}
                  <span className={estilos.hoja}>{hoja(f.ruta)}</span>
                </span>
                {/* Un binario no trae cuenta de líneas y no se le inventa un cero. */}
                {f.mas === undefined && f.menos === undefined ? (
                  <span className={estilos.binario}>binario</span>
                ) : (
                  <span className={estilos.cuenta}>
                    <span className={estilos.mas}>+{f.mas ?? 0}</span>{" "}
                    <span className={estilos.menos}>−{f.menos ?? 0}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={estilos.detalle}>
        {elegido === undefined ? (
          <p className={estilos.aviso}>Elige un fichero de la lista para ver qué cambió.</p>
        ) : parche === undefined ? (
          <p className={estilos.aviso}>Trayendo el diff de {elegido.ruta}…</p>
        ) : (
          <>
            <div className={estilos.cabeceraDeParche}>{elegido.ruta}</div>
            <div className={estilos.parche}>
              {parche.texto === "" ? (
                <p className={estilos.aviso}>Sin diff que enseñar para este fichero.</p>
              ) : (
                lineasDeParche(parche.texto).map((linea, i) => (
                  <div key={i} className={estilos.linea} data-tipo={tipoDeLinea(linea)}>
                    {linea === "" ? " " : linea}
                  </div>
                ))
              )}
              {parche.recortado ? (
                <p className={estilos.aviso}>
                  El diff es demasiado grande y se ha cortado: míralo en tu editor.
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Las líneas del parche que hay algo que enseñar, o sea sin la cabecera de git.
 *
 * `diff --git a/x b/x`, `index b6545b0..e8ba3a8`, `--- a/x` y `+++ b/x` son cuatro líneas de
 * ruido al principio de CADA fichero: no dicen nada que no diga ya el nombre de la fila, y
 * empujan el primer cambio de verdad fuera de la vista. Se corta en el primer `@@`, que es
 * donde empieza el contenido. Si no hay ninguno —un fichero binario, un cambio de modo— no
 * se corta nada: eso es todo lo que git tiene que decir de ese fichero, y esconderlo dejaría
 * un panel vacío sin explicación.
 */
export function lineasDeParche(texto: string): string[] {
  const lineas = texto.split("\n");
  const primerTrozo = lineas.findIndex((l) => l.startsWith("@@"));
  return primerTrozo === -1 ? lineas : lineas.slice(primerTrozo);
}

/** La parte de la ruta que se puede recortar: todo menos el nombre del fichero. */
function carpeta(ruta: string): string {
  const corte = ruta.lastIndexOf("/");
  return corte === -1 ? "" : ruta.slice(0, corte + 1);
}

/** El nombre del fichero, que nunca se recorta. */
function hoja(ruta: string): string {
  const corte = ruta.lastIndexOf("/");
  return corte === -1 ? ruta : ruta.slice(corte + 1);
}

/**
 * De qué tipo es una línea del parche, para pintarla.
 *
 * `+++`/`---` van ANTES que `+`/`-`: son la cabecera del fichero, no líneas añadidas o
 * quitadas, y pintarlas de verde y rojo es lo que hace que un diff se lea como si cada
 * fichero empezara con una línea añadida y otra borrada.
 */
function tipoDeLinea(linea: string): "cabecera" | "trozo" | "anadido" | "quitado" | "igual" {
  if (linea.startsWith("+++") || linea.startsWith("---") || linea.startsWith("diff ") || linea.startsWith("index ")) {
    return "cabecera";
  }
  if (linea.startsWith("@@")) return "trozo";
  if (linea.startsWith("+")) return "anadido";
  if (linea.startsWith("-")) return "quitado";
  return "igual";
}
