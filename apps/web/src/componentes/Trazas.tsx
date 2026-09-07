import { useMemo, useState } from "react";
import clsx from "clsx";
import type { Acto } from "../tipos.js";
import { formatearMs } from "../tiempo.js";
import estilos from "./Trazas.module.css";

/**
 * Las TRAZAS del turno: la vista técnica, con la anatomía de fila de la de deepseek
 * —`#índice · [ETIQUETA] · texto · tiempo`, monoespaciada— pero **sin lo que ellos ponen
 * dentro**.
 *
 * Se llamaba «Trayectoria», y el nombre nuevo lo pidió el usuario con su encargo detrás:
 * esta pestaña es para desarrollar el HARNESS, no para trabajar en una app XOne. Quien está
 * escribiendo una colección mira el chat y los ficheros; quien viene aquí está depurando
 * qué hizo el agente y en qué orden. «Trayectoria» sonaba a resumen para el usuario final;
 * «Trazas» dice lo que es. Que el destinatario sea otro también explica por qué esta vista
 * puede permitirse ser densa a propósito.
 *
 * **Lo que NO se copia de la suya, y es lo que la hace parecer más detallada.** Su panel
 * tiene cinco pestañas: Summary, Payload, Result, Schema y Timing. Payload y Result son los
 * argumentos y la salida ENTEROS de cada tool — en su captura se lee
 * `bash {"command": "echo NAVIGATION_OK"}` y el contenido completo de los ficheros leídos.
 * Aquí eso no puede pasar por TIPO: el acto de herramientas llega con líneas ya resumidas
 * por `agent/resumenDeTool.ts` (lista blanca de ruta o patrón por nombre de tool, nunca
 * contenido), porque `write_file` lleva el fichero entero y una tool MCP lleva el bearer.
 * Esta vista no añade nada al texto de esas líneas: si algún día `resumenDeTool.ts` empezara
 * a colar un argumento, esta fila lo repetiría — la barrera vive allí, no aquí. Por eso el
 * panel de detalle tiene DOS pestañas y no cinco: las tres que faltan no es que estén sin
 * hacer, es que no hay con qué llenarlas sin romper esa regla.
 */

/** El tipo gobierna el COLOR de la etiqueta, no solo su texto. */
export type TipoDeFila =
  | "usuario"
  | "asistente"
  | "razonamiento"
  | "tool"
  /** Una línea de tool que FALLÓ. Se separa de `tool` para que tenga su propio color: en un
   *  turno de cuarenta líneas, la que reventó es la única que se viene a buscar. */
  | "toolError"
  /** Un paso del motor —plan, tarea, verificación— que viaja por el MISMO canal que las
   *  tools pero no es una llamada a nada. Antes se etiquetaba «TOOL», que era falso. */
  | "paso"
  | "sistema"
  /** Un artefacto que dejó el agente. Etiqueta propia y no «SISTEMA»: es la única escritura
   *  del turno que no pasó por la aprobación, y aquí se viene justamente a eso. */
  | "artefacto"
  | "fase"
  | "fin"
  | "error";

export interface FilaDeTrazas {
  /** Posición global, 1 en adelante: es la que se enseña como `#N`. */
  indice: number;
  tipo: TipoDeFila;
  etiqueta: string;
  /** Recortado a una línea: la tabla es paisaje. */
  texto: string;
  /** Sin recortar, para el panel de detalle — que es donde SÍ se lee. */
  completo: string;
  /** A qué turno pertenece. 0 es lo que pasó antes de la primera petición. */
  turno: number;
  /** Solo donde el acto lo trae: `fase` y `fin`. Ausente NO es cero. */
  ms?: number;
  /** La tool que produjo la línea, cuando se sabe. Ausente en todo lo que no es una tool
   *  —y también en las sesiones guardadas ANTES de que el acto lo llevara. */
  nombre?: string;
  /** El motivo del fallo, si la llamada falló. */
  error?: string;
  /** La categoría de la fase (`core/events.ts#Fase`), aparte de su texto en español. */
  fase?: string;
}

const LARGO_MAXIMO_DE_FILA = 200;

/** Colapsa saltos de línea y recorta: la fila es de una línea por contrato del componente. */
function aUnaLinea(texto: string): string {
  const plana = texto.replace(/\s+/g, " ").trim();
  return plana.length > LARGO_MAXIMO_DE_FILA ? plana.slice(0, LARGO_MAXIMO_DE_FILA) : plana;
}

/** Lo que cada acto aporta ANTES de numerarlo y asignarle turno, que es cosa del recorrido. */
type FilaCruda = Omit<FilaDeTrazas, "indice" | "turno">;

function cruda(
  tipo: TipoDeFila,
  etiqueta: string,
  texto: string,
  extra: Partial<Pick<FilaDeTrazas, "ms" | "nombre" | "error" | "fase">> = {}
): FilaCruda {
  return { tipo, etiqueta, texto: aUnaLinea(texto), completo: texto, ...extra };
}

/**
 * Un acto puede dar VARIAS filas (`herramientas` trae una lista de líneas ya resumidas);
 * el resto da una sola. Exhaustivo por `switch`: añadir un `tipo` a `Acto` sin tocar esto
 * falla en `tsc` por la rama `default` tipada `never`, igual que `TIPOS_DE_ACTO` en
 * `store.ts` falla al olvidar un caso.
 */
function filasDe(acto: Acto): FilaCruda[] {
  switch (acto.tipo) {
    case "usuario":
      return [cruda("usuario", "USUARIO", acto.texto)];
    case "asistente":
      return [cruda("asistente", "ASISTENTE", acto.texto)];
    case "razonamiento":
      // Las trazas son el registro COMPLETO: lo que el modelo pensó también consta, con
      // su propia etiqueta para no confundirlo con lo que dijo.
      return [cruda("razonamiento", "PIENSA", acto.texto)];
    case "herramientas":
      return acto.lineas.map((linea, i) => {
        // `detalles` AUSENTE y `detalles[i]` VACÍO no son lo mismo, y la diferencia se
        // pinta: ausente es una sesión guardada antes de que el acto llevara la estructura
        // —no se sabe de qué es la línea, y se deja la etiqueta genérica de siempre—;
        // vacío es «esta línea no vino de una tool», que sí se sabe y se dice («PASO»:
        // por este canal pasan también el plan, las tareas y la verificación).
        const d = acto.detalles?.[i];
        if (d === undefined) return cruda("tool", "TOOL", linea);
        if (d.nombre === undefined) return cruda("paso", "PASO", linea);
        return cruda(d.error === undefined ? "tool" : "toolError", d.nombre, linea, {
          nombre: d.nombre,
          ...(d.error === undefined ? {} : { error: d.error }),
        });
      });
    case "sistema":
      return [cruda("sistema", "SISTEMA", acto.texto)];
    case "artefacto":
      // La etiqueta es propia y no «SISTEMA»: es la única escritura del turno que no pasó
      // por la aprobación, y quien viene aquí a depurar qué hizo el agente necesita verla
      // como lo que es. La ruta VIRTUAL, que es la que viaja; nunca la de la máquina.
      return [
        cruda("artefacto", "ARTEFACTO", `${acto.nombre} · ${acto.bytes} B · ${acto.ruta}`),
      ];
    case "fase":
      // La etiqueta lleva la CATEGORÍA cuando el acto la trae: «VERIFICANDO» dice más que
      // «FASE», y no hay que re-parsear la prosa para saberlo. Sin ella —sesión anterior—
      // se queda la genérica, que es lo honesto: no se sabe de qué fase es.
      return [
        cruda("fase", acto.fase === undefined ? "FASE" : acto.fase.toUpperCase(), acto.texto, {
          ms: acto.ms,
          ...(acto.fase === undefined ? {} : { fase: acto.fase }),
        }),
      ];
    case "fin":
      return [
        cruda(
          "fin",
          "FIN",
          // Sin el tiempo en el texto: ya va en la columna de la derecha, y medido en
          // pantalla salía dos veces por turno.
          acto.modelo !== undefined ? `fin del turno · ${acto.modelo}` : "fin del turno",
          { ms: acto.ms }
        ),
      ];
    case "error":
      return [cruda("error", "ERROR", acto.texto)];
    default: {
      const _exhaustivo: never = acto;
      return _exhaustivo;
    }
  }
}

/**
 * Numera y agrupa por turno.
 *
 * **Un turno empieza en cada acto de USUARIO**, que es la única frontera que el cliente
 * puede ver sin que el servidor mande nada nuevo: el `fin` cierra el trabajo del agente,
 * pero no todo turno deja `fin` —uno que revienta no siempre lo hace, que es justo el
 * motivo por el que el compositor no deduce de ahí si hay turno en vuelo—, así que abrir
 * por el `usuario` es lo robusto. Lo que llega ANTES de la primera petición (el saludo del
 * sistema, un aviso del arranque) cae en el turno 0, que se enseña aparte: no es de nadie.
 */
export function filasDeTrazas(actos: readonly Acto[]): FilaDeTrazas[] {
  let turno = 0;
  let indice = 0;
  return actos.flatMap((acto) => {
    if (acto.tipo === "usuario") turno += 1;
    return filasDe(acto).map((f) => {
      indice += 1;
      return { ...f, indice, turno };
    });
  });
}

export interface GrupoDeTrazas {
  turno: number;
  filas: FilaDeTrazas[];
  /** El `fin` del turno, si llegó: es el único total que se puede afirmar. */
  ms?: number;
}

/** Agrupa las filas ya numeradas. No reordena: el orden es el de los actos, que es el real. */
export function gruposDeTrazas(filas: readonly FilaDeTrazas[]): GrupoDeTrazas[] {
  const grupos: GrupoDeTrazas[] = [];
  for (const f of filas) {
    let grupo = grupos.at(-1);
    if (grupo === undefined || grupo.turno !== f.turno) {
      grupo = { turno: f.turno, filas: [] };
      grupos.push(grupo);
    }
    grupo.filas.push(f);
    // El total del turno es el `ms` del `fin`, no la suma de las fases: las fases no cubren
    // el turno entero y sumarlas daría una cifra que no es ningún tiempo real.
    if (f.tipo === "fin") grupo.ms = f.ms;
  }
  return grupos;
}

/** Sin distinguir mayúsculas ni acentos: se busca a ciegas, no se filtra un listado. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function Trazas({ actos }: { actos: readonly Acto[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [plegados, setPlegados] = useState<readonly number[]>([]);
  const [elegida, setElegida] = useState<number | undefined>(undefined);
  const [pestanaDetalle, setPestanaDetalle] = useState<"resumen" | "tiempos">("resumen");

  const filas = useMemo(() => filasDeTrazas(actos), [actos]);

  /**
   * El filtro se aplica ANTES de agrupar, y busca en el texto COMPLETO y no en el recortado:
   * si no, una palabra que cae más allá de los 200 caracteres no se encontraría nunca, y el
   * buscador mentiría justo en las filas largas, que son las que hay que buscar.
   */
  const visibles = useMemo(() => {
    const aguja = normalizar(busqueda.trim());
    if (aguja === "") return filas;
    // Se busca también en el nombre de la tool y en el motivo del error: son lo que se
    // teclea cuando se viene aquí («write_file», «ENOENT»), y el primero puede no estar en
    // el texto de la línea —«→ lee app.xne» no dice `read_file` en ninguna parte.
    return filas.filter((f) =>
      [f.completo, f.etiqueta, f.nombre ?? "", f.error ?? ""].some((c) =>
        normalizar(c).includes(aguja)
      )
    );
  }, [filas, busqueda]);

  const grupos = useMemo(() => gruposDeTrazas(visibles), [visibles]);
  const detalle = filas.find((f) => f.indice === elegida);

  if (filas.length === 0) {
    return <p className={estilos.vacio}>Todavía no hay trazas: esta sesión no ha hecho nada.</p>;
  }

  return (
    <div className={estilos.trazas}>
      <div className={estilos.barra} role="toolbar" aria-label="Herramientas de las trazas">
        <input
          type="search"
          className={estilos.buscador}
          placeholder="Buscar en las trazas…"
          aria-label="Buscar en las trazas"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
        />
        {/* Cuántas se están viendo de cuántas hay. Con el buscador vacío las dos cifras son
            la misma y decirlo igual no sobra: es lo que hace evidente que el filtro no está
            escondiendo nada. */}
        <span className={estilos.cuenta}>
          {visibles.length === filas.length
            ? `${filas.length} filas`
            : `${visibles.length} de ${filas.length} filas`}
        </span>
        <button
          type="button"
          className={estilos.accion}
          onClick={() => setPlegados(plegados.length > 0 ? [] : grupos.map((g) => g.turno))}
        >
          {plegados.length > 0 ? "Desplegar turnos" : "Plegar turnos"}
        </button>
      </div>

      <div className={estilos.cuerpo}>
        <div className={estilos.tabla}>
          {visibles.length === 0 ? (
            <p className={estilos.vacio}>Ninguna fila contiene «{busqueda.trim()}».</p>
          ) : (
            grupos.map((g) => {
              const plegado = plegados.includes(g.turno);
              return (
                <section key={g.turno} className={estilos.grupo}>
                  <button
                    type="button"
                    className={estilos.cabeceraDeGrupo}
                    aria-expanded={!plegado}
                    onClick={() =>
                      setPlegados(
                        plegado ? plegados.filter((t) => t !== g.turno) : [...plegados, g.turno]
                      )
                    }
                  >
                    <span className={estilos.flecha} aria-hidden="true">
                      {plegado ? "▸" : "▾"}
                    </span>
                    {/* El turno 0 no es un turno: es lo que llegó antes de la primera
                        petición. Llamarlo «Turno 0» sería inventarle un dueño. */}
                    <span>{g.turno === 0 ? "Antes del primer turno" : `Turno ${g.turno}`}</span>
                    <span className={estilos.cuentaDeGrupo}>
                      {g.filas.length} {g.filas.length === 1 ? "fila" : "filas"}
                      {g.ms === undefined ? "" : ` · ${formatearMs(g.ms)}`}
                    </span>
                  </button>
                  {plegado
                    ? null
                    : g.filas.map((f) => (
                        <button
                          key={f.indice}
                          type="button"
                          className={estilos.fila}
                          data-tipo={f.tipo}
                          data-elegida={f.indice === elegida ? "" : undefined}
                          aria-pressed={f.indice === elegida}
                          onClick={() => setElegida(f.indice === elegida ? undefined : f.indice)}
                        >
                          <span className={estilos.indice}>#{f.indice}</span>
                          <span className={estilos.etiquetaHueco}>
                            <span className={estilos.etiqueta} data-tipo={f.tipo}>
                              {f.etiqueta}
                            </span>
                          </span>
                          <span className={estilos.texto}>{f.texto}</span>
                          {/* El tiempo solo donde lo hay. Un «0 ms» en las filas que no lo
                              traen sería una cifra inventada, que es peor que un hueco. */}
                          <span className={estilos.tiempo}>
                            {f.ms === undefined ? "" : formatearMs(f.ms)}
                          </span>
                        </button>
                      ))}
                </section>
              );
            })
          )}
        </div>

        {detalle === undefined ? null : (
          <aside className={estilos.panel} aria-label="Detalle de la fila">
            <header className={estilos.cabeceraDePanel}>
              <span className={estilos.etiqueta} data-tipo={detalle.tipo}>
                {detalle.etiqueta}
              </span>
              <span className={estilos.situacion}>
                #{detalle.indice} ·{" "}
                {detalle.turno === 0 ? "antes del primer turno" : `turno ${detalle.turno}`}
              </span>
              <button
                type="button"
                className={estilos.cerrar}
                aria-label="Cerrar el detalle"
                onClick={() => setElegida(undefined)}
              >
                ✕
              </button>
            </header>
            <div className={estilos.pestanasDePanel} role="tablist" aria-label="Detalle">
              <button
                type="button"
                role="tab"
                aria-selected={pestanaDetalle === "resumen"}
                className={clsx(estilos.pestanaDePanel, pestanaDetalle === "resumen" && estilos.pestanaActiva)}
                onClick={() => setPestanaDetalle("resumen")}
              >
                Resumen
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pestanaDetalle === "tiempos"}
                className={clsx(estilos.pestanaDePanel, pestanaDetalle === "tiempos" && estilos.pestanaActiva)}
                onClick={() => setPestanaDetalle("tiempos")}
              >
                Tiempos
              </button>
            </div>
            {pestanaDetalle === "resumen" ? (
              detalle.error === undefined ? (
              // El texto ENTERO, que es lo que el panel aporta: la tabla recorta a 200 y el
              // chat corta las rachas de herramientas a cuatro líneas.
                <pre className={estilos.completo}>{detalle.completo}</pre>
              ) : (
                <>
                  {/* El fallo, aparte y con su color: en la línea va detrás de la ruta y
                      con cuarenta líneas alrededor se pierde. */}
                  <p className={estilos.fallo} role="alert">
                    {detalle.nombre} falló: {detalle.error}
                  </p>
                  <pre className={estilos.completo}>{detalle.completo}</pre>
                </>
              )
            ) : (
              <div className={estilos.tiempos}>
                {detalle.ms === undefined ? (
                  <p className={estilos.nota}>
                    Esta fila no lleva tiempo. Solo lo traen las fases y el fin del turno: el
                    resto de actos no viaja con marca de tiempo, y ponerle una calculada aquí
                    sería inventarla.
                  </p>
                ) : (
                  <p className={estilos.dato}>
                    <span className={estilos.cifra}>{detalle.ms}</span> ms
                  </p>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
