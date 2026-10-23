/**
 * La pestaña «Lo aprendido» del panel del proyecto (diseño A, elegido por él): ver, editar, borrar y mover entre lo del
 * PROYECTO y lo de XONE. Las reglas son las de la tool (`core/aprendido.ts`) y las aplica el SERVIDOR: el cliente pide.
 *
 * **Lo sensible no viaja en el listado** (`aprendidoParaElCable`): va sin texto y solo sale con `ver`, a petición de la
 * persona. Es una excepción NOMBRADA a «ningún secreto viaja por el cable», como `leerSecreto`, y solo por la respuesta del
 * POST a quien la pidió: el panel del móvil no tiene esta acción.
 *
 * El disco entra por un puerto (`DiscoDeAprendido`), así que esto se prueba sin servidor ni casa.
 */
import {
  aprendidoParaElCable,
  conEntradaEditada,
  idDeAprendizaje,
  motivoDeXoneConDatosDelProyecto,
  sinEntrada,
  type AlcanceDeAprendizaje,
  type Aprendizaje,
  type AprendizajeDelCable,
} from "../../core/aprendido.js";

export interface DiscoDeAprendido {
  leer(alcance: AlcanceDeAprendizaje): Aprendizaje[];
  escribir(alcance: AlcanceDeAprendizaje, lista: readonly Aprendizaje[]): void;
  /** Lo que identifica al proyecto (`nombresDelProyecto`): lo de XOne que lo nombre se niega. */
  nombresDelProyecto(): readonly string[];
}

export interface ListadoDeAprendido {
  proyecto: AprendizajeDelCable[];
  xone: AprendizajeDelCable[];
}

export type RespuestaDeAprendido = { estado: 200; cuerpo: ListadoDeAprendido | { texto: string } } | { estado: 409; cuerpo: { motivo: string } };

const esAlcance = (v: unknown): v is AlcanceDeAprendizaje => v === "proyecto" || v === "xone";
const esTexto = (v: unknown): v is string => typeof v === "string";
const otro = (a: AlcanceDeAprendizaje): AlcanceDeAprendizaje => (a === "proyecto" ? "xone" : "proyecto");

const negar = (motivo: string): RespuestaDeAprendido => ({ estado: 409, cuerpo: { motivo } });

function listado(disco: DiscoDeAprendido): RespuestaDeAprendido {
  return { estado: 200, cuerpo: { proyecto: aprendidoParaElCable(disco.leer("proyecto")), xone: aprendidoParaElCable(disco.leer("xone")) } };
}

/** Lo de XOne no puede nombrar el proyecto: la MISMA guarda que la tool. */
function motivoDeXone(a: { tema: string; texto: string; comoLoSe: string }, disco: DiscoDeAprendido): string | undefined {
  const m = motivoDeXoneConDatosDelProyecto(a, disco.nombresDelProyecto());
  return m === undefined ? undefined : `no se guarda como de XOne: ${m}`;
}

/** Atiende UN mensaje del cable (`{clase: "aprendido", …}`). Lo que no se entiende es una negativa, nunca un «hecho». */
export function atenderAprendido(m: Record<string, unknown>, disco: DiscoDeAprendido): RespuestaDeAprendido {
  const accion = m["accion"];
  if (accion === "listar") return listado(disco);

  const id = m["id"];
  if (!esTexto(id) || id === "") return negar("falta qué entrada");

  if (accion === "ver") {
    if (!esAlcance(m["alcance"])) return negar("falta de dónde es");
    const a = disco.leer(m["alcance"]).find((x) => idDeAprendizaje(x) === id);
    return a === undefined ? negar("esa entrada ya no está: la lista ha cambiado, vuelve a abrirla") : { estado: 200, cuerpo: { texto: a.texto } };
  }

  if (accion === "borrar") {
    if (!esAlcance(m["alcance"])) return negar("falta de dónde es");
    const r = sinEntrada(disco.leer(m["alcance"]), id);
    if ("motivo" in r) return negar(r.motivo);
    disco.escribir(m["alcance"], r.lista);
    return listado(disco);
  }

  if (accion === "guardar") {
    const alcance = m["alcance"];
    const tema = m["tema"];
    const comoLoSe = m["comoLoSe"];
    const texto = m["texto"];
    if (!esAlcance(alcance) || !esTexto(tema) || !esTexto(comoLoSe) || (texto !== undefined && !esTexto(texto))) return negar("la edición no se entiende");
    const lista = disco.leer(alcance);
    const r = conEntradaEditada(lista, id, { tema, comoLoSe, ...(texto === undefined ? {} : { texto }) });
    if ("motivo" in r) return negar(r.motivo);
    if (alcance === "xone") {
      const editada = r.lista.find((a) => idDeAprendizaje(a) === idDeAprendizaje({ tema }))!;
      const motivo = motivoDeXone({ tema: editada.tema, texto: editada.texto, comoLoSe: editada.comoLoSe ?? "" }, disco);
      if (motivo !== undefined) return negar(motivo);
    }
    disco.escribir(alcance, r.lista);
    return listado(disco);
  }

  if (accion === "mover") {
    const de = m["de"];
    if (!esAlcance(de)) return negar("falta de dónde es");
    const a = otro(de);
    const origen = disco.leer(de);
    const entrada = origen.find((x) => idDeAprendizaje(x) === id);
    if (entrada === undefined) return negar("esa entrada ya no está: la lista ha cambiado, vuelve a abrirla");
    const destino = disco.leer(a);
    if (destino.some((x) => idDeAprendizaje(x) === id)) return negar(`ya hay una entrada con ese tema en lo de ${a === "xone" ? "XOne" : "este proyecto"}`);
    if (a === "xone") {
      const motivo = motivoDeXone({ tema: entrada.tema, texto: entrada.texto, comoLoSe: entrada.comoLoSe ?? "" }, disco);
      if (motivo !== undefined) return negar(motivo);
    }
    // Primero el destino: si algo falla entre las dos escrituras, queda duplicada y no perdida.
    disco.escribir(a, [...destino, entrada]);
    disco.escribir(de, origen.filter((x) => idDeAprendizaje(x) !== id));
    return listado(disco);
  }

  return negar("esa acción no existe");
}
