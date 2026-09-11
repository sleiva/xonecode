import { useEffect, useMemo, useRef } from "react";
import type { FicheroTocado } from "../tipos.js";
import { numerarParche } from "../numerarParche.js";
import { arbolDeRutas } from "../arbolDeRutas.js";
import { Arbol } from "./Arbol.js";
import estilos from "./Revision.module.css";

/**
 * Revisión: los ficheros que ESTA sesión ha tocado, apilados con su diff.
 *
 * Es la vista que faltaba para poder revisar lo que el agente ha hecho sin salir a un
 * terminal: la pila de bloques —uno por fichero, con su clase y su cuenta de líneas— y el
 * diff completo, numerado, al desplegar cada uno; a la derecha, el árbol de lo cambiado.
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
 * El parche se pide al DESPLEGAR un bloque, no al abrir la pestaña: un diff por fichero de un
 * turno largo son megas, y la mayoría no se miran. Y **no se despliega ninguno solo**: la
 * pestaña abre enseñando la lista de lo que tocó el agente, que es la pregunta que contesta.
 * Hubo una omisión de ocho bloques abiertos, y se cayó con los tamaños de verdad: dos
 * ficheros y +582 líneas volcaban un diff de 483 que nadie había pedido y dejaban la lista
 * fuera de la vista.
 */

export function Revision({
  via,
  mezclados,
  ficheros,
  parches,
  desplegados,
  alDesplegar,
  alPlegar,
  alRecargar,
  historica,
  conectado,
}: {
  /**
   * CÓMO se ha medido lo que se enseña, y de eso depende lo que la pestaña puede AFIRMAR:
   * `git` es atribución por commit —lo que hizo esta sesión— y `desde-apertura` es todo lo
   * que ha cambiado en la copia desde que se abrió, de quien sea. Ausente = todavía no ha
   * llegado la respuesta; se dice, en vez de enseñar vacío.
   */
  via?: "git" | "desde-apertura" | "sin-marca" | "sin-empezar";
  /** Commits de otras sesiones entre los de esta. Solo se pinta si hay alguno. */
  mezclados?: number;
  /**
   * La sesión es una relectura (`alta.historica`). Con «sin-marca» cambia lo que se dice:
   * el texto general ofrecía dos causas posibles cuando aquí se sabe cuál es.
   */
  historica?: boolean;
  ficheros: readonly FicheroTocado[];
  /** Los parches ya traídos, por ruta. El que falta está pedido y en camino. */
  parches: Record<string, { texto: string; recortado: boolean }>;
  /** Las rutas con el diff a la vista. Quien las recuerda es `App`. */
  desplegados: ReadonlySet<string>;
  alDesplegar: (ruta: string) => void;
  alPlegar: (ruta: string) => void;
  alRecargar: () => void;
  /** ¿Hay cable? Sin él no se pide nada: la petición se perdería sin decirlo. */
  conectado?: boolean;
}) {
  // Se pide siempre que NO se tenga la lista, no solo al montar: entrar a mirar ES la
  // petición, pero también volver a tenerla vacía. Al cambiar de proyecto el store tira la
  // revisión (es del anterior) sin que este componente se desmonte, y con la petición solo
  // en el montaje la pestaña se quedaba en «Consultando los ficheros…» para siempre — el
  // mismo fallo que tenía Ficheros, medido allí. `conectado` va en las dependencias para
  // que la reconexión la recupere, y para no pedirla mientras no hay a quién.
  useEffect(() => {
    if (conectado === false || via !== undefined) return;
    alRecargar();
  }, [via, conectado, alRecargar]);

  // Para desplazar la pila hasta un bloque cuando se pulsa su hoja en el árbol.
  const bloques = useRef(new Map<string, HTMLElement>());

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
  if (via === "sin-marca" && historica === true) {
    return (
      <p className={estilos.aviso}>
        Esta conversación se reabrió y no tiene foto del proyecto de cuando empezó, así que no
        hay con qué comparar lo que tocó entonces. No es que no hubiera cambios — es que no se
        puede saber. Lo que el agente escriba a partir de ahora sí aparecerá aquí.
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
    return (
      <p className={estilos.aviso}>
        {via === "git"
          ? "Esta sesión todavía no ha tocado ningún fichero."
          : "No ha cambiado ningún fichero del proyecto desde que se abrió esta sesión."}
      </p>
    );
  }

  const conCuenta = ficheros.filter((f) => f.mas !== undefined || f.menos !== undefined);
  const binarios = ficheros.length - conCuenta.length;
  const totalMas = conCuenta.reduce((s, f) => s + (f.mas ?? 0), 0);
  const totalMenos = conCuenta.reduce((s, f) => s + (f.menos ?? 0), 0);
  const claseDe = new Map(ficheros.map((f) => [f.ruta, f.clase] as const));

  const irA = (ruta: string): void => {
    alDesplegar(ruta);
    // Tras el render que despliega. Ni `requestAnimationFrame` ni `scrollIntoView` se dan
    // por hechos: en jsdom el segundo no existe.
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => bloques.current.get(ruta)?.scrollIntoView?.({ block: "start" }));
    }
  };

  return (
    <div className={estilos.revision}>
      <div className={estilos.pila}>
        {/* «Sesión» es el hueco del selector de turno que vendrá: la medida es de la sesión
            entera (`agent/sesionGit.ts`), y afirmar «último turno» aquí sería falso.

            Y solo dice «Sesión» cuando lo que hay debajo es SUYO. Con el respaldo
            —`desde-apertura`, una sesión sin commits sellados— lo que se mide es la copia
            del proyecto y no la sesión: ahí dentro puede estar el trabajo de una tarea de
            fondo, y eso pasó en pantalla (una conversación enseñando +1266 líneas que
            escribió una tarea veinte minutos después). El rótulo es lo único que separa las
            dos afirmaciones, así que cambia con la medida. */}
        <div className={estilos.cabecera}>
          <span className={estilos.alcance}>{via === "git" ? "Sesión" : "Desde que abriste"}</span>
          <span className={estilos.total}>
            {/* Sin ningún fichero con cuenta —todo binario— no se inventa un «+0 −0»: es la
                misma regla que ya evita esa mentira por fila, aplicada a la suma. */}
            {conCuenta.length > 0 ? (
              <>
                <span className={estilos.mas}>+{totalMas}</span> <span className={estilos.menos}>−{totalMenos}</span>
              </>
            ) : null}
            {binarios > 0 ? (
              <span className={estilos.binarios}>
                {conCuenta.length > 0 ? " y " : ""}
                {binarios} {binarios === 1 ? "binario" : "binarios"}
              </span>
            ) : null}
          </span>
          <button type="button" className={estilos.recargar} onClick={alRecargar}>
            Volver a mirar
          </button>
        </div>

        {via === "desde-apertura" ? (
          <p className={estilos.nota}>
            Esta sesión no tiene ningún commit suyo con el que atribuir sus cambios (es de antes
            de que xonecode los sellara), así que esto es todo lo que ha cambiado en la copia del
            proyecto desde que se abrió — incluido lo que hayan escrito otras sesiones o una tarea
            de fondo.
          </p>
        ) : null}

        {mezclados !== undefined && mezclados > 0 ? (
          <p className={estilos.nota}>
            {mezclados === 1
              ? "Hay 1 commit de otra sesión entremedias: la lista de ficheros es de esta sesión, pero un diff puede traer cambios de la otra."
              : `Hay ${mezclados} commits de otras sesiones entremedias: la lista de ficheros es de esta sesión, pero un diff puede traer cambios de las otras.`}
          </p>
        ) : null}

        {ficheros.map((f) => {
          const abierto = desplegados.has(f.ruta);
          const parche = abierto ? parches[f.ruta] : undefined;
          return (
            <section
              key={f.ruta}
              className={estilos.bloque}
              ref={(el) => {
                if (el === null) bloques.current.delete(f.ruta);
                else bloques.current.set(f.ruta, el);
              }}
            >
              {/* La cabecera del bloque es PEGAJOSA: en un diff de trescientas líneas hay
                  que seguir sabiendo de qué fichero es sin volver arriba. */}
              <button
                type="button"
                className={estilos.cabeceraDeBloque}
                aria-expanded={abierto}
                onClick={() => (abierto ? alPlegar(f.ruta) : alDesplegar(f.ruta))}
              >
                <span className={estilos.clase} data-clase={f.clase} aria-label={f.clase}>
                  {f.clase === "nuevo" ? "A" : f.clase === "borrado" ? "D" : "M"}
                </span>
                <span className={estilos.ruta}>
                  {carpeta(f.ruta) === "" ? null : <span className={estilos.carpeta}>{carpeta(f.ruta)}</span>}
                  <span className={estilos.hoja}>{hoja(f.ruta)}</span>
                </span>
                {/* Lo que nadie ha commiteado se dice EN la fila: puede ser el turno en vuelo
                    (se commitea al terminar) o algo que estaba suelto de antes, y en ninguno
                    de los dos casos consta de quién es. */}
                {f.sinCommitear === true ? <span className={estilos.pendiente}>sin commitear</span> : null}
                {f.mas === undefined && f.menos === undefined ? (
                  <span className={estilos.binario}>binario</span>
                ) : (
                  <span className={estilos.cuenta}>
                    <span className={estilos.mas}>+{f.mas ?? 0}</span> <span className={estilos.menos}>−{f.menos ?? 0}</span>
                  </span>
                )}
              </button>

              {abierto ? (
                parche === undefined ? (
                  <p className={estilos.aviso}>Trayendo el diff de {f.ruta}…</p>
                ) : parche.texto === "" ? (
                  <p className={estilos.aviso}>Sin diff que enseñar para este fichero.</p>
                ) : (
                  <ParcheNumerado texto={parche.texto} recortado={parche.recortado} />
                )
              ) : null}
            </section>
          );
        })}
      </div>

      {/* El índice, a la derecha: los mismos ficheros como árbol, con su letra de estado.
          Pulsar uno despliega su bloque y desplaza la pila hasta él. */}
      <aside className={estilos.indice} aria-label="Ficheros cambiados">
        <Arbol
          nodos={arbolDeRutas(ficheros.map((f) => f.ruta))}
          alElegir={irA}
          insignia={(ruta) => {
            const clase = claseDe.get(ruta) ?? "modificado";
            return (
              <span className={estilos.clase} data-clase={clase} aria-label={clase}>
                {clase === "nuevo" ? "A" : clase === "borrado" ? "D" : "M"}
              </span>
            );
          }}
        />
      </aside>
    </div>
  );
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
 * Un parche ya numerado. Es su propio componente por una razón de coste medible, no de
 * orden: durante un turno el store se reemite cada 80 ms, así que `App` re-renderiza
 * Revisión con esa frecuencia, y `numerarParche` —que recorre el diff entero— se volvía a
 * ejecutar en CADA render por cada bloque desplegado (hasta ocho al abrir la pestaña).
 * Con el `useMemo` sobre el texto, solo se recalcula cuando el parche cambia de verdad.
 * El DOM que pinta es exactamente el de antes.
 */
function ParcheNumerado({ texto, recortado }: { texto: string; recortado: boolean }) {
  const lineas = useMemo(() => numerarParche(texto), [texto]);
  return (
    <div className={estilos.parche}>
      {lineas.map((linea, i) => (
        <div key={i} className={estilos.linea} data-tipo={linea.tipo}>
          <span className={estilos.numero} data-viejo="">
            {linea.viejo ?? ""}
          </span>
          <span className={estilos.numero} data-nuevo="">
            {linea.nuevo ?? ""}
          </span>
          <span className={estilos.texto}>{linea.texto === "" ? " " : linea.texto}</span>
        </div>
      ))}
      {recortado ? (
        <p className={estilos.aviso}>El diff es demasiado grande y se ha cortado: míralo en tu editor.</p>
      ) : null}
    </div>
  );
}

