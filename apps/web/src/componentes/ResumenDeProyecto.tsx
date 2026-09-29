import { useEffect, useRef, useState } from "react";
import { IconCheckOutline16, IconDownloadOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./ResumenDeProyecto.module.css";
import { IconoCompartido } from "./IconosDeProyecto.js";
import { BorrarCopiaLocal } from "./BorrarCopiaLocal.js";
import { GastoDelProyecto } from "./GastoDelProyecto.js";
import { gastoDelProyecto } from "../gastoDelProyecto.js";
import type { ConsumoDeTurno, FotoDelResumen } from "../tipos.js";

/** Lo que el gasto necesita de una sesión: su id, su título y su acumulado. NO es una lista
 *  de sesiones para abrirlas —esas son de la barra—: es la serie del gráfico. */
export interface SesionDelResumen {
  id: string;
  titulo: string;
  ultimoTurno?: string;
  consumo?: ConsumoDeTurno;
}

/** Lo que el resumen sabe de un proyecto: la misma fila de `alta.proyectos`. */
export interface ProyectoDelResumen {
  id: string;
  nombre: string;
  /** Ausente = no está bajado: el servidor lo MIDE para todo proyecto, nunca «no lo sé». */
  local?: boolean;
  /** Ausente = el servidor no lo dijo, que NO es «propio». Solo `true` pinta algo. */
  compartido?: boolean;
  sesiones?: readonly SesionDelResumen[];
}

/**
 * La foto pedida al servidor, CON el id del proyecto del que es. Pulsar A y luego B no puede
 * pintar la respuesta de A en B —el mismo fallo que `ramasDe` cerró en la ventana de la rama—,
 * así que una respuesta cuyo id ya no es el que se mira se tira.
 */
interface Medida {
  proyecto: string;
  respondida: boolean;
  /** Ausente con `respondida` = no se pudo pedir (sin red, o el servidor se negó). */
  foto?: FotoDelResumen;
}

/** Los manejadores de la copia: los pone `App`, que es quien habla con el servidor. */
export interface AccionesDeLaCopia {
  /** Sin copia local: abre la ventana de descarga (la de sesión nueva, con su rama). */
  alDescargar: () => void;
  /** Abre la carpeta de la copia en el explorador del sistema. Devuelve el MOTIVO si el
   *  servidor se negó (409), o nada. */
  alAbrirCarpeta: (proyecto: string) => Promise<string | undefined>;
  /** Borra la copia local. Devuelve el MOTIVO si el servidor se negó (409), o nada. */
  alBorrarCopia: (proyecto: string) => Promise<string | undefined>;
  /** Pide la FOTO del servidor (pendientes de subir). `undefined` = no se pudo: ni red ni
   *  respuesta que entender. */
  alPedirResumen: (proyecto: string) => Promise<FotoDelResumen | undefined>;
}

/**
 * Lo de la COPIA de un proyecto, arriba de la pestaña Resumen de su panel
 * (`PanelDelProyecto.tsx`). Una sola pantalla por proyecto: esto NO es una vista aparte, es lo
 * primero de su Resumen, y el nombre lo pone el panel. Cada cosa trae su dato detrás: un
 * control sin dato no se pinta, y AUSENTE nunca se pinta como cero ni como vacío.
 *
 * - **Pastillas y acciones**: bajado / compartido (los glifos de la barra), y Descargar, o
 *   Abrir carpeta y Borrar copia local (con su ventana, `BorrarCopiaLocal`).
 * - **Lo que queda por subir**: una FOTO del servidor, la MISMA medida que la banda de
 *   CloudStudio en Revisión (`lecturaDeSync`). Se pide al entrar y con «Actualizar».
 * - **Gasto**, en tokens: la consola no guarda precio.
 *
 * Las SESIONES no se listan (son de la barra) y las TAREAS tampoco: van en la pestaña Tareas.
 */
export function ResumenDeProyecto({
  proyecto,
  conectado,
  alDescargar,
  alAbrirCarpeta,
  alBorrarCopia,
  alPedirResumen,
}: { proyecto: ProyectoDelResumen; conectado?: boolean } & AccionesDeLaCopia) {
  const apagado = conectado === false;
  const [confirmando, setConfirmando] = useState(false);
  const [negativa, setNegativa] = useState<string | undefined>(undefined);

  // La foto del servidor, pedida al entrar en ESTE proyecto y al pulsar «Actualizar».
  // `enVista` es el id que se mira AHORA: una respuesta que llega para otro se tira.
  const [medida, setMedida] = useState<Medida | undefined>(undefined);
  const enVista = useRef(proyecto.id);
  enVista.current = proyecto.id;
  const pedir = (): void => {
    const id = proyecto.id;
    // Sin copia no hay nada que subir: ni se pregunta.
    if (proyecto.local !== true) return;
    setMedida({ proyecto: id, respondida: false });
    void alPedirResumen(id)
      .catch(() => undefined)
      .then((foto) => {
        if (enVista.current !== id) return;
        setMedida({ proyecto: id, respondida: true, ...(foto === undefined ? {} : { foto }) });
      });
  };
  // `local` también: al terminar de bajarse, lo que hay que medir cambia.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(pedir, [proyecto.id, proyecto.local]);
  const vigente = medida?.proyecto === proyecto.id ? medida : undefined;

  return (
    <>
      <div className={estilos.cabecera} role="group" aria-label="Copia local">
        <div className={estilos.pastillas}>
          {proyecto.local === true ? (
            <span className={estilos.pastilla} data-estado="local">
              <IconCheckOutline16 size={14} />
              en tu equipo
            </span>
          ) : (
            <span className={estilos.pastilla} data-estado="sin-descargar">
              <IconDownloadOutline16 size={14} />
              sin descargar
            </span>
          )}
          {proyecto.compartido === true ? (
            <span className={estilos.pastilla} data-estado="compartido">
              <IconoCompartido size={14} />
              compartido contigo
            </span>
          ) : null}
        </div>
        {/* Abrir carpeta y borrar son de la COPIA, así que solo existen con ella: sin copia no
            hay carpeta que enseñar ni nada que borrar, y en su sitio va «Descargar». Con el
            proyecto trabajando siguen pintadas: quien dice por qué no se puede borrar es el
            servidor, en la ventana. */}
        {proyecto.local === true ? (
          <div className={estilos.acciones}>
            <button
              type="button"
              className={estilos.secundario}
              disabled={apagado}
              title="Abre la carpeta del proyecto en el explorador de ficheros de este equipo"
              onClick={async () => {
                setNegativa(undefined);
                setNegativa(await alAbrirCarpeta(proyecto.id).catch(() => "no se pudo hablar con el servidor"));
              }}
            >
              Abrir carpeta
            </button>
            <button type="button" className={estilos.borrar} disabled={apagado} onClick={() => setConfirmando(true)}>
              Borrar copia local
            </button>
          </div>
        ) : (
          // Sin copia, su única acción: bajarla. Abre la MISMA ventana que el «+» —rama de
          // origen y aviso de la descarga—, que es donde esa decisión se toma.
          <div className={estilos.acciones}>
            <button type="button" className={estilos.primario} disabled={apagado} onClick={alDescargar}>
              Descargar
            </button>
          </div>
        )}
      </div>

      {negativa === undefined ? null : (
        <p className={estilos.negativa} role="alert">
          No se ha abierto la carpeta: {negativa}
        </p>
      )}

      {/* Sin copia no hay nada que subir, ni sesiones de las que contar gasto. */}
      {proyecto.local === true ? (
        <>
          <TiraDePendientes medida={vigente} apagado={apagado} alActualizar={pedir} />
          <section className={estilos.bloque} aria-label="Gasto del proyecto">
            <h2 className={estilos.tituloDeBloque}>Gasto</h2>
            <BloqueDeGasto sesiones={proyecto.sesiones ?? []} />
          </section>
        </>
      ) : null}

      {confirmando ? (
        <BorrarCopiaLocal
          nombre={proyecto.nombre}
          alCerrar={() => setConfirmando(false)}
          alConfirmar={async () => {
            const motivo = await alBorrarCopia(proyecto.id);
            if (motivo === undefined) setConfirmando(false);
            return motivo;
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Lo que queda por subir a CloudStudio, en una línea. La cifra es la MISMA que la banda de
 * Revisión: sale de la misma función del servidor (`lecturaDeSync`). Cinco estados, y ninguno
 * se confunde con otro: midiendo, N, cero MEDIDO, no se pudo medir, y no vinculado.
 */
function TiraDePendientes({
  medida,
  apagado,
  alActualizar,
}: {
  medida: Medida | undefined;
  apagado: boolean;
  alActualizar: () => void;
}) {
  const sync = medida?.foto?.sync;
  let contenido: React.ReactNode;
  let estado: string;
  if (medida === undefined || !medida.respondida) {
    estado = "midiendo";
    contenido = (
      <>
        <span className={estilos.girando} aria-hidden="true" />
        midiendo lo que queda por subir…
      </>
    );
  } else if (medida.foto === undefined) {
    estado = "error";
    contenido = "No se ha podido medir lo que queda por subir.";
  } else if (sync === undefined || sync.proyecto === undefined) {
    estado = "sin-vincular";
    contenido = "No está vinculado a CloudStudio: no hay nada con lo que comparar.";
  } else if (sync.error !== undefined) {
    estado = "error";
    contenido = `No se ha podido medir: ${sync.error}`;
  } else if (sync.pendientes === undefined) {
    estado = "error";
    contenido = "No se ha podido medir lo que queda por subir.";
  } else if (sync.pendientes === 0) {
    estado = "al-dia";
    contenido = "Nada por subir: la copia está igual que la rama en CloudStudio.";
  } else {
    estado = "pendientes";
    contenido = (
      <span title="Ficheros distintos de lo que consta en CloudStudio. Un renombrado cuenta como dos; un fichero nuevo que git aún no sigue no cuenta.">
        <strong>
          {sync.pendientes} {sync.pendientes === 1 ? "fichero" : "ficheros"}
        </strong>{" "}
        con cambios sin subir{sync.rama === undefined ? "" : ` a «${sync.rama}»`}
      </span>
    );
  }
  return (
    <div className={estilos.tira} data-estado={estado} role="status">
      <span className={estilos.textoDeTira}>{contenido}</span>
      <button
        type="button"
        className={estilos.secundario}
        disabled={apagado || medida?.respondida === false}
        onClick={alActualizar}
      >
        Actualizar
      </button>
    </div>
  );
}

/** El gasto, o por qué no lo hay: sin ninguna sesión con gasto que conste no se pinta un
 *  gráfico vacío. */
function BloqueDeGasto({ sesiones }: { sesiones: readonly SesionDelResumen[] }) {
  const datos = gastoDelProyecto(sesiones);
  if (datos.conGasto === 0) return <p className={estilos.vacio}>Todavía no consta gasto en este proyecto.</p>;
  return <GastoDelProyecto datos={datos} />;
}
