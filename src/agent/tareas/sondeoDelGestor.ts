/**
 * El SONDEO de la puerta 2: el gestor de tareas DISPARA tareas en background. Cada `INTERVALO_DE_SONDEO_MS`, y con
 * «Mirar ahora», mira los proyectos con el disparo encendido (`VinculoGuardado.automatico`) y, con los tickets ASIGNADOS
 * a la cuenta del conector:
 *  - en el estado de PREPARAR y sin encargo → amplía el encargo y lo sube como comentario;
 *  - en el estado de LANZAR y sin tarea → crea la tarea con el último encargo (y lo comentado debajo).
 * Ver `docs/superpowers/specs/2026-10-15-tareas-desde-el-gestor-design.md`.
 *
 * La DECISIÓN es pura (`core/tareasEnElGestor.ts#accionesDelSondeo`); aquí solo la red y el disco, todo inyectado. Solo
 * corre en el proceso que EJECUTA las tareas (`esDueño`): dos consolas no crean la misma tarea dos veces. Una pasada no
 * se solapa con otra. Un fallo de un ticket no para los demás: se cuenta en el resultado.
 */
import { randomUUID } from "node:crypto";
import type { GestorDeTareasPort, TareaDelGestor, VinculoGuardado } from "../../core/gestorDeTareas.js";
import type { PeticionDeTarea } from "../../core/ports.js";
import { tituloDeTarea, type Tarea, type TicketDeTarea } from "../../core/tareas.js";
import {
  INTERVALO_DE_SONDEO_MS,
  accionesDelSondeo,
  comentarioDeEncargo,
  encargoConAñadidos,
  encargoDeLosComentarios,
  esComentarioDeEncargo,
  esEstado,
} from "../../core/tareasEnElGestor.js";
import type { TareasEnDisco } from "./tareasEnDisco.js";

/** Una copia local con su identidad y su vínculo (lo que sale de su `config.json`). */
export interface CopiaConGestor {
  proyecto: { id: string; raiz: string; nombre: string };
  vinculo: VinculoGuardado;
}

/** Lo que pasó en una pasada: lo que se hizo y lo que falló, por ticket. Para «Mirar ahora» y para la traza. */
export interface ResultadoDelSondeo {
  preparadas: string[];
  lanzadas: string[];
  fallos: { clave?: string; proyecto: string; motivo: string }[];
}

export interface OpcionesDelSondeo {
  /** Las copias locales con gestor vinculado. Se relee en cada pasada: el interruptor se cambia con todo en marcha. */
  copias: () => CopiaConGestor[];
  gestorDe: (conector: string) => GestorDeTareasPort | undefined;
  /** El aumentador de «Nueva tarea»: amplía el encargo con el proyecto delante. Sin él, preparar no se hace. */
  augmentar?: (p: { texto: string; proyecto: CopiaConGestor["proyecto"]; adjuntos: PeticionDeTarea["adjuntos"] }) => Promise<string>;
  /** La cola (la ENVUELTA: lo que se guarda aquí también se refleja en el gestor). */
  cola: Pick<TareasEnDisco, "listar" | "guardar">;
  /** Que el corredor mire la cola: una tarea lanzada arranca en el acto si puede. */
  revisar: () => void;
  /** Si este proceso es el que ejecuta las tareas. Sin cerrojo no se crea nada. */
  esDueño: () => boolean;
  motivoDe: (error: unknown) => string;
  informar?: (texto: string) => void;
  ahora?: () => Date;
}

export interface SondeoDelGestor {
  /** Una pasada ya. Si hay otra en marcha, espera a esa y devuelve su resultado. */
  mirar(): Promise<ResultadoDelSondeo>;
  arrancar(): void;
  parar(): void;
}

/** El texto de un ticket como petición: el título y, debajo, su descripción. */
function peticionDelTicket(titulo: string, descripcion: string): string {
  return descripcion.trim() === "" ? titulo : `${titulo}\n\n${descripcion.trim()}`;
}

export function crearSondeoDelGestor(o: OpcionesDelSondeo): SondeoDelGestor {
  let enMarcha: Promise<ResultadoDelSondeo> | undefined;
  let reloj: ReturnType<typeof setInterval> | undefined;

  const pasada = async (): Promise<ResultadoDelSondeo> => {
    const resultado: ResultadoDelSondeo = { preparadas: [], lanzadas: [], fallos: [] };
    if (!o.esDueño()) return resultado;
    for (const copia of o.copias()) {
      const { vinculo: v, proyecto } = copia;
      if (v.automatico !== true || (v.estados?.lanzar === undefined && v.estados?.preparar === undefined)) continue;
      const g = o.gestorDe(v.conector);
      if (g === undefined) continue;
      try {
        await pasadaDeUnProyecto(copia, g, resultado);
      } catch (error) {
        resultado.fallos.push({ proyecto: proyecto.nombre, motivo: o.motivoDe(error) });
      }
    }
    if (resultado.lanzadas.length > 0) o.revisar();
    return resultado;
  };

  const pasadaDeUnProyecto = async ({ proyecto, vinculo: v }: CopiaConGestor, g: GestorDeTareasPort, resultado: ResultadoDelSondeo): Promise<void> => {
    const estados = v.estados ?? {};
    // Solo los ASIGNADOS a la cuenta del conector: quien mueve un ticket lanza un agente que escribe en esta máquina.
    const tickets = await g.pendientes(v, undefined, { mias: true });
    // Con tarea (no descartada: descartar la borra) en ESTE gestor y ESTE proyecto del gestor.
    const conTarea = new Set(
      o
        .cola.listar()
        .filter((t) => t.ticket !== undefined && t.ticket.conector === v.conector && t.ticket.sitio === v.sitio && t.ticket.proyecto === v.proyecto)
        .map((t) => t.ticket!.clave)
    );
    // Solo se preguntan los comentarios de los que están en PREPARAR: es lo único que decide si ya tienen encargo.
    const conEncargo = new Set<string>();
    if (g.comentarios !== undefined) {
      for (const t of tickets) {
        if (!esEstado(t.estado, estados.preparar) || conTarea.has(t.clave)) continue;
        const comentarios = await g.comentarios(v, t.clave);
        if (comentarios.some((c) => esComentarioDeEncargo(c.texto))) conEncargo.add(t.clave);
      }
    } else {
      // Sin poder leer comentarios no se sabe si ya se preparó: no se prepara (se subiría otra vez en cada pasada).
      for (const t of tickets) conEncargo.add(t.clave);
    }
    for (const accion of accionesDelSondeo({ tickets, estados, conEncargo, conTarea, revisarEncargo: v.revisarEncargo === true })) {
      try {
        if (accion.tipo === "preparar") {
          await preparar(proyecto, v, g, accion.ticket);
          resultado.preparadas.push(accion.ticket.clave);
        } else {
          // Sin revisión: se prepara y se lanza en la misma pasada CON ese encargo (sin releerlo del gestor, que podría no
          // devolver todavía el comentario recién creado).
          let recien: string | undefined;
          if (accion.preparar === true) {
            recien = await preparar(proyecto, v, g, accion.ticket);
            resultado.preparadas.push(accion.ticket.clave);
          }
          await lanzar(proyecto, v, g, accion.ticket, recien);
          resultado.lanzadas.push(accion.ticket.clave);
        }
      } catch (error) {
        resultado.fallos.push({ clave: accion.ticket.clave, proyecto: proyecto.nombre, motivo: o.motivoDe(error) });
      }
    }
  };

  /** Ampliar el encargo y subirlo. Sin aumentador no se prepara (y se dice una vez por pasada en el resultado). */
  const preparar = async (proyecto: CopiaConGestor["proyecto"], v: VinculoGuardado, g: GestorDeTareasPort, t: TareaDelGestor): Promise<string> => {
    if (o.augmentar === undefined) throw new Error("esta ejecución no puede preparar encargos");
    const ficha = await g.ficha(v, t.clave);
    const encargo = await o.augmentar({ texto: peticionDelTicket(ficha.titulo, ficha.descripcion), proyecto, adjuntos: [] });
    await g.comentar(v, t.clave, comentarioDeEncargo(encargo));
    o.informar?.(`${t.clave}: encargo preparado y subido`);
    return encargo;
  };

  /** Crear la tarea ligada al ticket, con el último encargo tal como esté en el gestor. */
  const lanzar = async (
    proyecto: CopiaConGestor["proyecto"],
    v: VinculoGuardado,
    g: GestorDeTareasPort,
    t: TareaDelGestor,
    /** El encargo recién subido en esta misma pasada (sin revisión): se usa tal cual. */
    recien?: string
  ): Promise<void> => {
    const ficha = await g.ficha(v, t.clave);
    const peticion = peticionDelTicket(ficha.titulo, ficha.descripcion);
    const leido = recien !== undefined || g.comentarios === undefined ? undefined : encargoDeLosComentarios(await g.comentarios(v, t.clave));
    const encargo = recien ?? (leido === undefined ? peticion : encargoConAñadidos(leido.encargo, leido.añadidos));
    const ticket: TicketDeTarea = {
      conector: v.conector,
      sitio: v.sitio,
      proyecto: v.proyecto,
      clave: t.clave,
      ...(ficha.url === undefined ? {} : { url: ficha.url }),
      ...(v.estados === undefined ? {} : { estados: v.estados }),
    };
    // Releída justo antes de escribir: otra pasada o la ventana pudieron crear la suya entre medias.
    const lista = o.cola.listar();
    if (lista.some((x) => x.ticket?.conector === v.conector && x.ticket.sitio === v.sitio && x.ticket.clave === t.clave)) return;
    const nueva: Tarea = {
      id: randomUUID(),
      proyecto,
      titulo: tituloDeTarea(ficha.titulo),
      peticion,
      encargo,
      adjuntos: [],
      estado: "nuevo",
      creada: (o.ahora?.() ?? new Date()).toISOString(),
      ticket,
    };
    o.cola.guardar([...lista, nueva]);
    o.informar?.(`${t.clave}: tarea en background creada desde el gestor`);
  };

  const mirar = (): Promise<ResultadoDelSondeo> => {
    if (enMarcha !== undefined) return enMarcha;
    enMarcha = pasada().finally(() => {
      enMarcha = undefined;
    });
    return enMarcha;
  };

  return {
    mirar,
    arrancar() {
      if (reloj !== undefined) return;
      reloj = setInterval(() => {
        void mirar().then(
          (r) => {
            for (const f of r.fallos) o.informar?.(`el gestor de ${f.proyecto}${f.clave === undefined ? "" : ` (${f.clave})`}: ${f.motivo}`);
          },
          (error) => o.informar?.(`el sondeo del gestor falló (${o.motivoDe(error)})`)
        );
      }, INTERVALO_DE_SONDEO_MS);
      // No retiene el proceso vivo por sí solo.
      reloj.unref?.();
    },
    parar() {
      if (reloj !== undefined) clearInterval(reloj);
      reloj = undefined;
    },
  };
}
