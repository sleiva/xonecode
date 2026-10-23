import { useEffect, useRef, useState } from "react";
import { selloDeFecha } from "../selloDeFecha.js";
import type { AprendizajeDelCable, ListadoDeAprendido } from "../tipos.js";
import { GiroDeCarga } from "./GiroDeCarga.js";
import estilos from "./LoAprendido.module.css";

export type AlcanceDeAprendido = "proyecto" | "xone";

/** Lo que la pestaña pide al servidor (`{clase: "aprendido", …}`); el proyecto lo pone quien llama. */
export type PeticionDeAprendido =
  | { accion: "listar" }
  | { accion: "ver"; alcance: AlcanceDeAprendido; id: string }
  | { accion: "guardar"; alcance: AlcanceDeAprendido; id: string; tema: string; texto?: string; comoLoSe: string }
  | { accion: "borrar"; alcance: AlcanceDeAprendido; id: string }
  | { accion: "mover"; de: AlcanceDeAprendido; id: string };

/** Lo que contesta: el listado, el texto de una oculta, o la negativa del servidor con su motivo. */
export type RespuestaDeAprendido = { listado: ListadoDeAprendido } | { texto: string } | { motivo: string };

/**
 * Un texto con `código` partido en trozos: los de entre dos acentos graves son código. Uno suelto, sin pareja, se queda
 * como texto con su acento: lo que el agente escribió no se pierde. Sin HTML: React lo escapa.
 */
export function trozosConCodigo(texto: string): { codigo: boolean; texto: string }[] {
  const partes = texto.split("`");
  // Con un número PAR de partes hay un acento sin cerrar: el último trozo vuelve a llevarlo y va como texto.
  const sinCerrar = partes.length % 2 === 0;
  const trozos = partes.map((t, i) => ({ codigo: i % 2 === 1, texto: t }));
  if (sinCerrar) {
    const ultimo = trozos.pop()!;
    trozos.push({ codigo: false, texto: "`" + ultimo.texto });
  }
  return trozos.filter((t) => t.texto !== "");
}

function ConCodigo({ texto }: { texto: string }) {
  return (
    <>
      {trozosConCodigo(texto).map((t, i) =>
        t.codigo ? (
          <code key={i} className={estilos.codigo}>
            {t.texto}
          </code>
        ) : (
          <span key={i}>{t.texto}</span>
        )
      )}
    </>
  );
}

interface Medida {
  proyecto: string;
  respondida: boolean;
  listado?: ListadoDeAprendido;
  motivo?: string;
}

interface Borrador {
  id: string;
  tema: string;
  /** Ausente = el texto estaba oculto y no se pidió: el servidor conserva el que hay. */
  texto?: string;
  comoLoSe: string;
}

/**
 * La pestaña «LO APRENDIDO» del panel del proyecto (diseño A del lienzo, elegido por él): lo que los encargos se ponen
 * delante, de ESTE proyecto y de XONE (todos los proyectos), para verlo, editarlo, borrarlo y moverlo de alcance.
 *
 * **Decide el servidor** (`web/servidor/aprendidoDelPanel.ts`): una negativa llega con su motivo y se enseña tal cual. Lo
 * SENSIBLE llega sin texto y solo se pide con «Ver»; lo visto vive en ESTE montaje y se olvida al salir.
 */
export function LoAprendido({
  proyecto,
  nombre,
  conectado,
  alPedir,
}: {
  /** El id del proyecto (el del alta). */
  proyecto: string;
  /** Su nombre, para decir a quién deja de llegar algo. */
  nombre: string;
  conectado: boolean;
  /** `undefined` = no se pudo hablar con el servidor. */
  alPedir: (proyecto: string, peticion: PeticionDeAprendido) => Promise<RespuestaDeAprendido | undefined>;
}) {
  const [medida, setMedida] = useState<Medida | undefined>(undefined);
  const [alcance, setAlcance] = useState<AlcanceDeAprendido>("proyecto");
  const [vistos, setVistos] = useState<Record<string, string>>({});
  const [borrador, setBorrador] = useState<Borrador | undefined>(undefined);
  const [confirmando, setConfirmando] = useState<string | undefined>(undefined);
  const [motivo, setMotivo] = useState<{ id: string; texto: string } | undefined>(undefined);
  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState(false);
  // `App` recompone el manejador en cada render: como dependencia, pediría el listado en cada uno.
  const pedir = useRef(alPedir);
  pedir.current = alPedir;

  useEffect(() => {
    if (!conectado) return;
    let vigente = true;
    setMedida({ proyecto, respondida: false });
    setVistos({});
    setBorrador(undefined);
    setConfirmando(undefined);
    void pedir.current(proyecto, { accion: "listar" }).then((r) => {
      if (!vigente) return;
      setMedida({
        proyecto,
        respondida: true,
        ...(r !== undefined && "listado" in r ? { listado: r.listado } : {}),
        ...(r !== undefined && "motivo" in r ? { motivo: r.motivo } : {}),
      });
    });
    return () => {
      vigente = false;
    };
  }, [proyecto, conectado]);

  const delProyecto = medida?.proyecto === proyecto ? medida : undefined;
  const listado = delProyecto?.listado;

  /** Una acción que cambia la lista: con el listado nuevo se repinta; con un motivo, se dice en SU entrada. */
  const cambiar = async (id: string, peticion: PeticionDeAprendido): Promise<boolean> => {
    setOcupado(true);
    setMotivo(undefined);
    const r = await pedir.current(proyecto, peticion);
    setOcupado(false);
    if (r !== undefined && "listado" in r) {
      setMedida({ proyecto, respondida: true, listado: r.listado });
      return true;
    }
    setMotivo({ id, texto: r !== undefined && "motivo" in r ? r.motivo : "no se pudo hablar con el servidor" });
    return false;
  };

  const ver = async (e: AprendizajeDelCable): Promise<string | undefined> => {
    const r = await pedir.current(proyecto, { accion: "ver", alcance, id: e.id });
    if (r !== undefined && "texto" in r) {
      setVistos((v) => ({ ...v, [e.id]: r.texto }));
      return r.texto;
    }
    setMotivo({ id: e.id, texto: r !== undefined && "motivo" in r ? r.motivo : "no se pudo hablar con el servidor" });
    return undefined;
  };

  const editar = async (e: AprendizajeDelCable) => {
    setConfirmando(undefined);
    setMotivo(undefined);
    // Una oculta se edita CON su texto: se pide antes de abrir el editor, como «Ver».
    const texto = e.texto ?? vistos[e.id] ?? (e.oculto === true ? await ver(e) : undefined);
    setBorrador({ id: e.id, tema: e.tema, comoLoSe: e.comoLoSe ?? "", ...(texto === undefined ? {} : { texto }) });
  };

  const guardar = async () => {
    if (borrador === undefined) return;
    const { id, tema, texto, comoLoSe } = borrador;
    const bien = await cambiar(id, { accion: "guardar", alcance, id, tema, comoLoSe, ...(texto === undefined ? {} : { texto }) });
    if (bien) {
      setBorrador(undefined);
      // Lo visto se recuerda por id; si cambió el tema, el id es otro y se vuelve a ocultar.
      setVistos((v) => {
        const resto = { ...v };
        delete resto[id];
        return resto;
      });
    }
  };

  const lista = listado === undefined ? [] : listado[alcance];
  const filtro = busqueda.trim().toLowerCase();
  const visibles =
    filtro === ""
      ? lista
      : lista.filter((e) => [e.tema, e.texto ?? vistos[e.id] ?? "", e.comoLoSe ?? ""].some((t) => t.toLowerCase().includes(filtro)));

  return (
    <div className={estilos.aprendido}>
      <div className={estilos.barra}>
        <div className={estilos.alcances} role="tablist" aria-label="Alcance">
          {(["proyecto", "xone"] as const).map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={alcance === a}
              className={estilos.alcance}
              onClick={() => {
                setAlcance(a);
                setBorrador(undefined);
                setConfirmando(undefined);
                setMotivo(undefined);
              }}
            >
              {a === "proyecto" ? "De este proyecto" : "De XOne · todos los proyectos"}
              {listado === undefined ? null : <span className={estilos.cuenta}>{listado[a].length}</span>}
            </button>
          ))}
        </div>
        <label className={estilos.buscar}>
          Buscar
          <input type="search" value={busqueda} placeholder="tema o texto" onChange={(e) => setBusqueda(e.target.value)} />
        </label>
      </div>

      <p className={estilos.aviso}>
        {alcance === "proyecto"
          ? `El harness pone esto delante de cada encargo de ${nombre}. Puede llevar usuarios y claves: lo sensible sale oculto hasta pulsar «Ver».`
          : "Lo leen los encargos de TODOS tus proyectos. No puede nombrar nada de un proyecto: guardar una entrada que lo haga se niega con el motivo."}
      </p>

      {delProyecto === undefined || !delProyecto.respondida ? (
        <p className={estilos.aviso} role="status">
          <GiroDeCarga /> Leyendo lo aprendido…
        </p>
      ) : listado === undefined ? (
        <p className={estilos.error} role="status">
          {delProyecto.motivo ?? "No se pudo pedir lo aprendido al servidor."}
        </p>
      ) : visibles.length === 0 ? (
        <p className={estilos.aviso}>
          {filtro !== "" ? "Nada coincide con la búsqueda." : alcance === "proyecto" ? "Este proyecto no tiene nada apuntado todavía." : "No hay nada apuntado de XOne todavía."}
        </p>
      ) : (
        <ul className={estilos.lista} aria-label="Lo aprendido">
          {visibles.map((e) => {
            const enEdicion = borrador?.id === e.id ? borrador : undefined;
            const texto = e.texto ?? vistos[e.id];
            return (
              <li key={e.id} className={estilos.entrada}>
                {enEdicion !== undefined ? (
                  <form
                    className={estilos.editor}
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      void guardar();
                    }}
                  >
                    <label>
                      Tema
                      <input type="text" value={enEdicion.tema} onChange={(ev) => setBorrador({ ...enEdicion, tema: ev.target.value })} />
                    </label>
                    {enEdicion.texto === undefined ? null : (
                      <label>
                        Lo aprendido
                        <textarea rows={3} value={enEdicion.texto} onChange={(ev) => setBorrador({ ...enEdicion, texto: ev.target.value })} />
                      </label>
                    )}
                    <label>
                      Cómo se comprobó (obligatorio)
                      <input type="text" value={enEdicion.comoLoSe} onChange={(ev) => setBorrador({ ...enEdicion, comoLoSe: ev.target.value })} />
                    </label>
                    {motivo?.id === e.id ? (
                      <p className={estilos.error} role="alert">
                        {motivo.texto}
                      </p>
                    ) : null}
                    <div className={estilos.acciones}>
                      <button type="button" className={estilos.secundario} onClick={() => setBorrador(undefined)}>
                        Cancelar
                      </button>
                      <button type="submit" className={estilos.primario} disabled={ocupado}>
                        Guardar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className={estilos.cabecera}>
                      <div className={estilos.cuerpo}>
                        <div className={estilos.titulo}>
                          <h3>
                            <ConCodigo texto={e.tema} />
                          </h3>
                          <span className={estilos.pastilla} data-alcance={alcance}>
                            {alcance === "proyecto" ? "proyecto" : "XOne"}
                          </span>
                        </div>
                        <p className={estilos.texto}>{texto === undefined ? "•••••• oculto: puede llevar una clave" : <ConCodigo texto={texto} />}</p>
                        {e.comoLoSe === undefined ? null : (
                          <p className={estilos.comprobado}>
                            Comprobado: <ConCodigo texto={e.comoLoSe} />
                          </p>
                        )}
                        <span className={estilos.meta}>
                          {[e.quien, selloDeFecha(e.cuando) ?? e.cuando].filter((t) => t !== undefined).join(" · ")}
                        </span>
                      </div>
                      <div className={estilos.acciones}>
                        {e.oculto === true ? (
                          <button
                            type="button"
                            className={estilos.secundario}
                            onClick={() =>
                              vistos[e.id] === undefined
                                ? void ver(e)
                                : setVistos((v) => {
                                    const resto = { ...v };
                                    delete resto[e.id];
                                    return resto;
                                  })
                            }
                          >
                            {vistos[e.id] === undefined ? "Ver" : "Ocultar"}
                          </button>
                        ) : null}
                        <button type="button" className={estilos.secundario} onClick={() => void editar(e)}>
                          Editar
                        </button>
                        <button type="button" className={estilos.secundario} disabled={ocupado} onClick={() => void cambiar(e.id, { accion: "mover", de: alcance, id: e.id })}>
                          {alcance === "proyecto" ? "Pasar a XOne" : "Pasar a este proyecto"}
                        </button>
                        <button type="button" className={estilos.peligro} onClick={() => setConfirmando(e.id)}>
                          Borrar
                        </button>
                      </div>
                    </div>
                    {motivo?.id === e.id ? (
                      <p className={estilos.error} role="alert">
                        {motivo.texto}
                      </p>
                    ) : null}
                    {confirmando === e.id ? (
                      <div className={estilos.confirmar} role="alert">
                        <span>
                          {alcance === "proyecto"
                            ? `Se deja de poner delante de los encargos de ${nombre}.`
                            : "Se deja de poner delante de los encargos de todos tus proyectos."}
                        </span>
                        <div className={estilos.acciones}>
                          <button type="button" className={estilos.secundario} onClick={() => setConfirmando(undefined)}>
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className={estilos.peligro}
                            disabled={ocupado}
                            onClick={() => {
                              setConfirmando(undefined);
                              void cambiar(e.id, { accion: "borrar", alcance, id: e.id });
                            }}
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
