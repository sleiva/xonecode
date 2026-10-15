import { useEffect, useState } from "react";
import type { EstadoDelGestor, MapeoDeEstados, VinculoDelCable } from "../tipos.js";
import estilos from "./TareasDesdeElGestor.module.css";

/** Lo que contesta el servidor a `estadosDelFlujo`: la lista del flujo, la propuesta por categoría y lo guardado. */
export type EstadosDelFlujo = { lista: EstadoDelGestor[]; propuesto: MapeoDeEstados; actual?: MapeoDeEstados } | { motivo: string };

const PAPELES: { papel: keyof MapeoDeEstados; rotulo: string; ayuda: string; opcional: boolean }[] = [
  { papel: "preparar", rotulo: "Preparar el encargo en", ayuda: "un ticket asignado a ti que entra aquí recibe el encargo ampliado como comentario, para revisarlo", opcional: true },
  { papel: "lanzar", rotulo: "Lanzar la tarea en", ayuda: "moverlo aquí crea la tarea en background con el encargo tal como esté en el ticket", opcional: false },
  { papel: "terminar", rotulo: "Al terminar, pasar a", ayuda: "con un comentario de lo hecho", opcional: true },
];

/**
 * Las tareas en background que DISPARA el gestor (la puerta 2), junto al vínculo: qué estado DEL PROYECTO cumple cada
 * papel —xonecode no impone estados, se adapta a los del flujo— y el interruptor, apagado por omisión. Plegado es una
 * línea con lo guardado; desplegado pide al servidor los estados del flujo (de la red, por eso solo al abrir) y
 * PROPONE el mapeo por categoría cuando no hay ninguno guardado. Lo plegado se desmonta.
 */
export function TareasDesdeElGestor({
  vinculo,
  nombre,
  conectado,
  alPedirEstados,
  alGuardar,
}: {
  vinculo: VinculoDelCable;
  /** El nombre del gestor, del catálogo («Jira»). */
  nombre: string;
  conectado: boolean;
  alPedirEstados: () => Promise<EstadosDelFlujo>;
  /** Devuelve el motivo si el servidor se negó. */
  alGuardar: (estados: MapeoDeEstados, automatico: boolean, revisarEncargo: boolean) => Promise<string | undefined>;
}) {
  const [abierto, setAbierto] = useState(false);
  const resumen =
    vinculo.estados?.lanzar === undefined
      ? "Sin configurar: los tickets no lanzan tareas."
      : `${vinculo.automatico === true ? "Encendido" : "Apagado"} · lanzar en «${vinculo.estados.lanzar}»` +
        (vinculo.estados.preparar === undefined ? "" : ` · preparar en «${vinculo.estados.preparar}»`) +
        (vinculo.estados.terminar === undefined ? "" : ` · al terminar, «${vinculo.estados.terminar}»`) +
        (vinculo.revisarEncargo === true ? " · revisas el encargo" : " · sin revisar el encargo");
  return (
    <section className={estilos.caja} aria-label={`Tareas en background desde ${nombre}`}>
      <div className={estilos.cabecera}>
        <span className={estilos.titulo}>Tareas en background desde {nombre}</span>
        <button type="button" className={estilos.plegable} aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
          {abierto ? "Cerrar" : "Configurar"}
        </button>
      </div>
      {abierto ? (
        <Editor vinculo={vinculo} nombre={nombre} conectado={conectado} alPedirEstados={alPedirEstados} alGuardar={alGuardar} alCerrar={() => setAbierto(false)} />
      ) : (
        <p className={estilos.resumen}>{resumen}</p>
      )}
    </section>
  );
}

function Editor({
  vinculo,
  nombre,
  conectado,
  alPedirEstados,
  alGuardar,
  alCerrar,
}: {
  vinculo: VinculoDelCable;
  nombre: string;
  conectado: boolean;
  alPedirEstados: () => Promise<EstadosDelFlujo>;
  alGuardar: (estados: MapeoDeEstados, automatico: boolean, revisarEncargo: boolean) => Promise<string | undefined>;
  alCerrar: () => void;
}) {
  const [flujo, setFlujo] = useState<EstadosDelFlujo | undefined>(undefined);
  const [mapeo, setMapeo] = useState<MapeoDeEstados>(vinculo.estados ?? {});
  const [automatico, setAutomatico] = useState(vinculo.automatico === true);
  // Desmarcada por omisión (decisión suya): se prepara y se lanza a la vez.
  const [revisar, setRevisar] = useState(vinculo.revisarEncargo === true);
  const [guardando, setGuardando] = useState(false);
  const [motivo, setMotivo] = useState<string | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    void alPedirEstados().then(
      (r) => {
        if (!vivo) return;
        setFlujo(r);
        // Sin nada guardado, la PROPUESTA: la persona solo la confirma o la cambia.
        if ("lista" in r && vinculo.estados === undefined) setMapeo(r.propuesto);
      },
      () => vivo && setFlujo({ motivo: "el envío falló" })
    );
    return () => {
      vivo = false;
    };
    // Una vez por apertura: los estados vienen de la red.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (flujo === undefined) return <p className={estilos.resumen}>{`Leyendo los estados del flujo en ${nombre}…`}</p>;
  if ("motivo" in flujo) return <p className={estilos.error} role="alert">{`No se pudieron leer los estados: ${flujo.motivo}`}</p>;
  // El flujo se ve a través de los tickets (el conector no tiene una tool de estados): sin ninguno, no hay qué elegir.
  if (flujo.lista.length === 0) {
    return <p className={estilos.resumen}>{`No veo estados en este proyecto de ${nombre}: crea un ticket allí para que xonecode vea su flujo, y vuelve a configurarlo.`}</p>;
  }

  const guardar = async (): Promise<void> => {
    setGuardando(true);
    setMotivo(undefined);
    const m = await alGuardar(mapeo, automatico, revisar).catch(() => "el envío falló");
    setGuardando(false);
    if (m === undefined) alCerrar();
    else setMotivo(m);
  };

  return (
    <div className={estilos.editor}>
      <p className={estilos.explicacion}>
        {`Elige qué estado de tu flujo en ${nombre} cumple cada papel. Solo cuentan los tickets asignados a ti: quien mueve un ticket lanza un agente que escribe en este equipo.`}
      </p>
      {PAPELES.map(({ papel, rotulo, ayuda, opcional }) => (
        <label key={papel} className={estilos.fila}>
          <span className={estilos.rotulo}>{rotulo}</span>
          <select
            value={mapeo[papel] ?? ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setMapeo((antes) => {
                const { [papel]: _quitado, ...resto } = antes;
                return v === "" ? resto : { ...resto, [papel]: v };
              });
            }}
          >
            <option value="">{opcional ? "— nada —" : "— elige un estado —"}</option>
            {flujo.lista.map((e) => (
              <option key={e.nombre} value={e.nombre}>
                {e.nombre}
              </option>
            ))}
          </select>
          <span className={estilos.ayuda}>{ayuda}</span>
        </label>
      ))}
      <label className={estilos.interruptor}>
        <input type="checkbox" checked={revisar} onChange={(e) => setRevisar(e.currentTarget.checked)} />
        <span>
          {revisar
            ? "Revisar el encargo antes de lanzar: se sube como comentario y la tarea arranca cuando muevas el ticket al estado de lanzar."
            : "Revisar el encargo antes de lanzar (desmarcada: se sube el encargo y la tarea arranca a la vez; xonecode mueve el ticket)."}
        </span>
      </label>
      <label className={estilos.interruptor}>
        <input type="checkbox" checked={automatico} onChange={(e) => setAutomatico(e.currentTarget.checked)} />
        <span>{`Que los tickets lancen tareas solos (se mira ${nombre} cada 5 minutos)`}</span>
      </label>
      {motivo === undefined ? null : (
        <p className={estilos.error} role="alert">
          {motivo}
        </p>
      )}
      <div className={estilos.acciones}>
        <button type="button" className={estilos.secundario} onClick={alCerrar} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className={estilos.principal} onClick={() => void guardar()} disabled={!conectado || guardando || (automatico && mapeo.lanzar === undefined)}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
