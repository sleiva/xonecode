import { useEffect, useRef, useState } from "react";
import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import clsx from "clsx";
import type { EstadoDelCliente } from "../store.js";
import type { EleccionDeFramework, FrameworksDelAparato, OpcionDeFramework } from "../tipos.js";
import estilos from "./NuevaSesion.module.css";
import propiosDelProgreso from "./EliminarEmulador.module.css";
import propios from "./InstalarFramework.module.css";

/**
 * Cuánto se espera a que llegue un progreso PROPIO (`instalar-framework`) tras pulsar. Las negativas
 * del servidor llegan como un `instalacion` en `fallo`, pero si se pierde la respuesta el diálogo no
 * puede quedarse en «Instalando…» para siempre.
 */
export const MS_SIN_RESPUESTA_AL_INSTALAR = 15_000;

/** La clave de una opción, para el `value` del selector: sha o id de fichero, nunca una URL. */
export function claveDeOpcion(o: OpcionDeFramework): string {
  return o.origen === "local" ? `local:${o.sha256}` : `catalogo:${o.ficheroId}`;
}

function eleccionDe(o: OpcionDeFramework): EleccionDeFramework {
  return o.origen === "local" ? { local: o.sha256 } : { catalogo: o.ficheroId };
}

function tamano(bytes: number | undefined): string {
  return bytes === undefined ? "" : ` · ${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/** ¿Es esta versión la que el aparato tiene? El catálogo titula `v5.0.5.9dev`; Android dice `5.0.5.9dev`. */
export function esLaInstalada(titulo: string, instalada: string | undefined): boolean {
  if (instalada === undefined) return false;
  const limpia = (s: string): string => s.trim().replace(/^v/i, "").toLowerCase();
  return limpia(titulo) === limpia(instalada);
}

/**
 * Las ETIQUETAS de una versión, en el texto de la opción del combo (un `<option>` no admite marcado):
 * de dónde sale —descargada en este equipo o en byXOne— y si es la recomendada o la que ya tiene.
 */
export function etiquetasDe(o: OpcionDeFramework, instalada: string | undefined): string[] {
  return [
    o.origen === "local" ? "descargada" : "en byXOne",
    ...(o.preferida ? ["recomendada"] : []),
    ...(esLaInstalada(o.titulo, instalada) ? ["instalada"] : []),
  ];
}

/** Lo que el aparato tiene AHORA, siempre dicho: la versión, que no lo tiene, o que no se pudo leer. */
function estadoDelAparato(oferta: FrameworksDelAparato | undefined): string {
  if (oferta === undefined) return "Mirando qué tiene…";
  if (oferta.instalada !== undefined) return `Tiene el framework ${oferta.instalada}.`;
  if (oferta.sinFramework === true) return "No tiene el framework instalado.";
  return "No se pudo leer qué versión del framework tiene.";
}

/**
 * Instalar el framework de XOne en un aparato Android, desde Ajustes → Dispositivos o desde Ejecutar.
 *
 * Pide al abrir lo que se puede instalar (`frameworks`): las versiones ya DESCARGADAS primero —la más
 * nueva va marcada y se instala sin red— y después las del catálogo de byXOne que no se tengan. Si el
 * catálogo no está (sin credencial, sin red), se dice por qué y se ofrece lo local igual.
 *
 * Lo que se elige vuelve como sha o id de fichero; el servidor solo acepta lo que acaba de servir. El
 * progreso es el `instalacion` con `receta: "instalar-framework"` (lo filtra quien monta), comparado
 * por identidad con el que había al pulsar —uno viejo no cuenta—. Con `ok` lo dice y se queda abierto
 * para que se vea; con un fallo se queda con el motivo y se puede reintentar.
 */
export function InstalarFramework({
  aparato,
  frameworks,
  progreso,
  alPedir,
  alInstalar,
  alCancelar,
  alCerrar,
  inicial,
}: {
  aparato: { id: string; nombre: string };
  /**
   * El TÍTULO de la versión que se abre elegida (la de «Actualizar framework»), en vez de la
   * recomendada: la recomendada es la local más nueva, y puede ser MÁS VIEJA que la instalada. Si no
   * está en la oferta, la recomendada.
   */
  inicial?: string;
  /** Lo último que ofreció el servidor. Solo cuenta si es de ESTE aparato. */
  frameworks?: FrameworksDelAparato;
  /** El `instalacion` del store YA filtrado a `instalar-framework`. */
  progreso?: EstadoDelCliente["instalacion"];
  alPedir: () => void;
  alInstalar: (eleccion: EleccionDeFramework, bajarVersion: boolean) => void;
  /** Cancela el trabajo en marcha (la descarga o el `adb install`). */
  alCancelar: () => void;
  alCerrar: () => void;
}) {
  const [elegida, setElegida] = useState<string | undefined>(undefined);
  const [bajarVersion, setBajarVersion] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [sinRespuesta, setSinRespuesta] = useState(false);
  const anterior = useRef(progreso);

  // Se pide al abrir, y cada vez que se abre para otro aparato.
  useEffect(() => {
    alPedir();
  }, [aparato.id]);

  const oferta = frameworks?.serie === aparato.id ? frameworks : undefined;
  const opciones = oferta?.opciones ?? [];
  const porOmision =
    (inicial === undefined ? undefined : opciones.find((o) => o.titulo === inicial)) ?? opciones.find((o) => o.preferida) ?? opciones[0];
  const claveElegida = elegida ?? (porOmision === undefined ? undefined : claveDeOpcion(porOmision));
  const opcionElegida = opciones.find((o) => claveDeOpcion(o) === claveElegida);

  const propio = enviado && progreso !== anterior.current ? progreso : undefined;
  const corriendo = propio?.estado === "corriendo";
  const instalando = enviado && (propio === undefined || corriendo);
  const hecho = propio?.estado === "ok";

  useEffect(() => {
    if (!enviado || propio !== undefined) return;
    const t = setTimeout(() => {
      setEnviado(false);
      setSinRespuesta(true);
    }, MS_SIN_RESPUESTA_AL_INSTALAR);
    return () => clearTimeout(t);
  }, [enviado, propio]);

  const instalar = (): void => {
    if (opcionElegida === undefined) return;
    anterior.current = progreso;
    setSinRespuesta(false);
    setEnviado(true);
    alInstalar(eleccionDe(opcionElegida), bajarVersion);
  };

  const locales = opciones.filter((o) => o.origen === "local");
  const remotas = opciones.filter((o) => o.origen === "catalogo");

  return (
    <Modal open onClose={() => (corriendo ? undefined : alCerrar())} title="Instalar framework" headless className={estilos.capa}>
      <div
        className={estilos.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget && !corriendo) alCerrar();
        }}
      >
        <div className={estilos.ventana} role="dialog" aria-label={`Instalar el framework en ${aparato.nombre}`}>
          <h2 className={estilos.titulo}>Instalar framework</h2>
          <p className={propios.aparato} role="status">
            <strong>{aparato.nombre}</strong> · {estadoDelAparato(oferta)}
          </p>
          <p className={estilos.nota}>
            Se instala encima del que haya: <strong>no se desinstala nada</strong> y los datos de las apps se conservan.
          </p>

          {oferta === undefined ? (
            <p className={estilos.nota} role="status">
              Buscando versiones…
            </p>
          ) : opciones.length === 0 ? (
            <p className={estilos.fallo} role="alert">
              No hay ninguna versión que instalar
              {oferta.motivoDelCatalogo === undefined ? "." : `: ${oferta.motivoDelCatalogo}`}
            </p>
          ) : (
            <div className={propios.lista}>
              <label className={estilos.etiqueta} htmlFor="version-de-framework">
                Versión
              </label>
              <select
                id="version-de-framework"
                className={estilos.campo}
                value={claveElegida ?? ""}
                disabled={instalando}
                onChange={(e) => setElegida(e.target.value)}
              >
                {locales.length === 0 ? null : (
                  <optgroup label="Descargadas en este equipo">
                    {locales.map((o) => (
                      <option key={claveDeOpcion(o)} value={claveDeOpcion(o)}>
                        {o.titulo}
                        {tamano(o.bytes)} — {etiquetasDe(o, oferta.instalada).join(" · ")}
                      </option>
                    ))}
                  </optgroup>
                )}
                {remotas.length === 0 ? null : (
                  <optgroup label="En byXOne (se descargan)">
                    {remotas.map((o) => (
                      <option key={claveDeOpcion(o)} value={claveDeOpcion(o)}>
                        {o.titulo}
                        {tamano(o.bytes)} — {etiquetasDe(o, oferta.instalada).join(" · ")}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {/* Las etiquetas de la ELEGIDA, a la vista y no solo dentro del desplegable cerrado. */}
              {opcionElegida === undefined ? null : (
                <p className={propios.etiquetas}>
                  {etiquetasDe(opcionElegida, oferta.instalada).map((e) => (
                    <span key={e} className={propios.etiqueta} data-etiqueta={e}>
                      {e}
                    </span>
                  ))}
                </p>
              )}
              {oferta.motivoDelCatalogo === undefined ? null : (
                <p className={estilos.nota}>El catálogo de byXOne no está disponible: {oferta.motivoDelCatalogo}</p>
              )}
              <label className={propios.casilla}>
                <input type="checkbox" checked={bajarVersion} disabled={instalando} onChange={(e) => setBajarVersion(e.target.checked)} />
                Permitir bajar de versión (si el aparato tiene una más nueva)
              </label>
            </div>
          )}

          {!sinRespuesta ? null : (
            <p className={estilos.fallo} role="alert">
              El servidor no empezó a instalarlo: puede que haya otro trabajo en marcha. Vuelve a intentarlo.
            </p>
          )}
          {propio === undefined || corriendo ? null : hecho ? (
            <p className={estilos.nota} role="status">
              Instalado.
            </p>
          ) : (
            <p className={estilos.fallo} role="alert">
              No se ha instalado: {propio.motivo ?? `acabó en «${propio.estado}»`}
            </p>
          )}
          {propio === undefined || propio.lineas.length === 0 ? null : (
            <pre className={propiosDelProgreso.log}>{propio.lineas.slice(-5).join("\n")}</pre>
          )}

          <div className={estilos.acciones}>
            {corriendo ? (
              <Button variant="outline" className={estilos.accion} onClick={alCancelar}>
                Detener
              </Button>
            ) : (
              <Button variant="outline" className={estilos.accion} onClick={alCerrar}>
                {hecho ? "Cerrar" : "Cancelar"}
              </Button>
            )}
            {hecho ? null : (
              <Button
                variant="primary"
                className={clsx(estilos.accion, estilos.principal)}
                disabled={opcionElegida === undefined || instalando}
                onClick={instalar}
              >
                {instalando ? "Instalando…" : opcionElegida?.origen === "catalogo" ? "Descargar e instalar" : "Instalar"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
