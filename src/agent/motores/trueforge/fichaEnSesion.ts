/**
 * La ficha de trabajo VIVA de una sesión de TrueForge: la llena lo que pasa por el harness y se guarda en disco.
 * Las reglas son de `core/fichaDeTrabajo.ts`; aquí, quién lee el disco, calcula huellas y escribe el `TASKS.md`.
 *
 * Diseño: `docs/superpowers/specs/2026-11-03-ficha-de-trabajo-design.md` (F1).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  casosDeLaSalida,
  conEscritura,
  conEvidencia,
  conRespaldo,
  estadoDeCriterio,
  estadoDeTarea,
  fichaNueva,
  interpretarFicha,
  pruebaVigente,
  vigente,
  type EstadoDeCriterio,
  type FichaDeTrabajo,
} from "../../../core/fichaDeTrabajo.js";
import { criteriosAAuditar, type CriterioAAuditar, type CriterioAuditado } from "../../../core/auditoriaDeCierre.js";
import { CARPETA_DE_PLANES } from "../../../core/planes.js";
import { conEstadoDeTarea, leerTareasDelPlan, type EstadoDeTarea, type TareaDelPlan } from "../../../core/tareasDelPlan.js";

/** Lo que el agente ve fuera del proyecto: no forma parte de la versión del trabajo. */
const FUERA_DEL_PROYECTO = /^\/(artefactos|planes|hotswap|large_tool_results|conversation_history|adjuntos|skills|diseno)\//;
const ORDEN_DE_CAPTURA = /xone-captura-android|xone-hotswap\s+shot\b/;
const ORDEN_DE_CASOS = /^\s*xone-hotswap\b/;
/** Lo que se guarda del objetivo: la petición literal, sin los bloques que el harness pone detrás. */
const TOPE_DEL_OBJETIVO = 2_000;

export interface FichaDeSesion {
  alEmpezarTurno(peticion: string): void;
  /**
   * Una escritura PEDIDA, al llamar a la tool: la que pasa por aprobación no devuelve su respuesta por el mismo camino
   * (medido: 71 escrituras al proyecto, ninguna respuesta), así que se apunta aquí y su huella se toma al llegar al disco.
   */
  alPedir(nombre: string, args: Record<string, unknown>): void;
  alResultado(nombre: string, args: Record<string, unknown>, contenido: string, quien: string): void;
  /** Para `marcar_criterios_del_plan`: la prueba vigente que respalda marcar AHORA, o por qué no se puede. */
  respaldo(): { evidencia: string } | { motivo: string };
  alMarcar(plan: string, tarea: string, criterios: readonly number[], evidencia: string): void;
  /** Las casillas marcadas con prueba VIGENTE, para la auditoría de cierre (`core/auditoriaDeCierre.ts`). */
  paraAuditar(): CriterioAAuditar[];
  /**
   * Al cerrar el turno: el estado CALCULADO de cada tarea con marcas, escrito en su `TASKS.md`, y lo que se dice. Con la
   * auditoría, una casilla que no la pasa (`contradice` o `no-se-ve`) cuenta como `sin-sostener`: solo puede BAJAR.
   */
  alCerrar(verificador: "verde" | "rojo" | undefined, auditados?: ReadonlyMap<string, CriterioAuditado>): string[];
  ficha(): FichaDeTrabajo;
}

export function crearFichaDeSesion(opciones: {
  raiz: string;
  /** Dónde se guarda. Ausente: solo en memoria. */
  ruta?: string;
  /** Sin sesión con identidad (`run`), cada apertura empieza un trabajo nuevo aunque haya una ficha guardada. */
  continuar: boolean;
  ahora?: () => string;
}): FichaDeSesion {
  const ahora = opciones.ahora ?? (() => new Date().toISOString());
  let ficha = (opciones.continuar ? leer(opciones.ruta) : undefined) ?? fichaNueva();

  const huella = (virtual: string): string | undefined => {
    try {
      return createHash("sha1").update(readFileSync(join(opciones.raiz, virtual.replace(/^\/+/, "")))).digest("hex");
    } catch {
      return undefined;
    }
  };
  /**
   * Los ficheros que el trabajo ha pedido escribir, aplicados o no todavía. Una escritura que pasa por la cola de
   * aprobación se aplica DESPUÉS de que la tool conteste (medido en una pasada real: doce iconos escritos y la ficha
   * vacía), así que la huella se vuelve a mirar en el disco antes de registrar cada evidencia, de respaldar una marca y
   * de cerrar (`sincronizar`): recoge la escritura cuando de verdad llegó.
   */
  const pedidos = new Set<string>(Object.keys(ficha.escritos));
  const sincronizar = (quien = "harness"): void => {
    for (const ruta of pedidos) {
      const h = huella(ruta);
      if (h !== undefined && ficha.escritos[ruta] !== h) ficha = conEscritura(ficha, ruta, h, quien, ahora());
    }
  };
  const huellasActuales = (): Record<string, string | undefined> =>
    Object.fromEntries(Object.keys(ficha.escritos).map((r) => [r, huella(r)]));
  const guardar = (): void => {
    if (opciones.ruta === undefined) return;
    try {
      mkdirSync(dirname(opciones.ruta), { recursive: true });
      const tmp = `${opciones.ruta}.tmp`;
      writeFileSync(tmp, JSON.stringify(ficha, null, 2), { mode: 0o600 });
      renameSync(tmp, opciones.ruta);
    } catch {
      // Guardar la ficha nunca tumba un turno: se pierde la persistencia, no el trabajo.
    }
  };

  return {
    alEmpezarTurno(peticion) {
      const texto = peticion.trim().slice(0, TOPE_DEL_OBJETIVO);
      const dato = { texto, procedencia: "persona" as const, cuando: ahora() };
      ficha = ficha.objetivo === undefined ? { ...ficha, objetivo: dato } : { ...ficha, aclaraciones: [...ficha.aclaraciones, dato] };
      guardar();
    },
    alPedir(nombre, args) {
      if (nombre !== "write_file" && nombre !== "edit_file") return;
      const ruta = typeof args["file_path"] === "string" ? args["file_path"] : undefined;
      if (ruta === undefined || FUERA_DEL_PROYECTO.test(ruta)) return;
      pedidos.add(ruta);
    },
    alResultado(nombre, args, contenido, quien) {
      const cuando = ahora();
      const orden = typeof args["command"] === "string" ? args["command"] : "";
      if (nombre === "write_file" || nombre === "edit_file") {
        const ruta = typeof args["file_path"] === "string" ? args["file_path"] : undefined;
        if (ruta === undefined || FUERA_DEL_PROYECTO.test(ruta)) return;
        pedidos.add(ruta);
        sincronizar(quien);
        guardar();
        return;
      }
      // Antes de cualquier otra evidencia: las escrituras que ya llegaron al disco forman parte de su versión.
      sincronizar();
      if (nombre === "validar_fichero_xone") {
        const primera = contenido.split("\n")[0]?.slice(0, 160) ?? "";
        ficha = conEvidencia(ficha, { tipo: "validacion", resumen: primera, quien, cuando }).ficha;
      } else if ((nombre === "ejecutar_script" || nombre === "execute") && ORDEN_DE_CAPTURA.test(orden)) {
        // La ruta virtual si la salida la trae; si no, el NOMBRE que dice el script (`xone-captura-android`: «captura
        // guardada como captura-….png»), que vive en `/artefactos/`. Medido en la pasada 6: 13 de 14 capturas quedaron sin
        // ruta y la auditoría de cierre no tuvo imagen que mirar.
        const nombreDelScript = /guardada como (captura-[\w.-]+\.(?:png|jpe?g|webp))\b/.exec(contenido)?.[1];
        const ruta =
          /\/artefactos\/[^\s"'<>]+\.(?:png|jpe?g|webp)/.exec(contenido)?.[0] ??
          (nombreDelScript === undefined ? undefined : `/artefactos/${nombreDelScript}`) ??
          "captura";
        ficha = conEvidencia(ficha, { tipo: "captura", resumen: ruta, quien, cuando }).ficha;
      } else if ((nombre === "ejecutar_script" || nombre === "execute") && ORDEN_DE_CASOS.test(orden)) {
        const casos = casosDeLaSalida(contenido);
        if (casos === undefined) return;
        ficha = conEvidencia(ficha, { tipo: "casos", resumen: casos.resumen.slice(0, 400), quien, cuando }).ficha;
      } else if (nombre === "comparar_capturas") {
        const primera = contenido.split("\n")[0]?.slice(0, 200) ?? "";
        ficha = conEvidencia(ficha, { tipo: "medida", resumen: primera, quien, cuando }).ficha;
      } else return;
      guardar();
    },
    respaldo() {
      sincronizar();
      const e = pruebaVigente(ficha, huellasActuales());
      return e === undefined
        ? {
            motivo:
              "No marcado: no hay una prueba en el aparato posterior a tu último cambio (casos con `xone-hotswap … --- …` o una " +
              "captura). Prueba ESTA versión en el aparato y vuelve a marcar.",
          }
        : { evidencia: e.id };
    },
    alMarcar(plan, tarea, criterios, evidencia) {
      for (const criterio of criterios) ficha = conRespaldo(ficha, { plan, tarea, criterio, evidencia, cuando: ahora() });
      guardar();
    },
    paraAuditar() {
      sincronizar();
      const tareasPorPlan = new Map<string, TareaDelPlan[]>();
      for (const plan of new Set(ficha.respaldos.map((r) => r.plan))) {
        try {
          tareasPorPlan.set(plan, leerTareasDelPlan(readFileSync(join(opciones.raiz, CARPETA_DE_PLANES, plan, "TASKS.md"), "utf8")).tareas);
        } catch {
          // Sin TASKS.md no hay casilla que auditar.
        }
      }
      return criteriosAAuditar(ficha, tareasPorPlan, huellasActuales());
    },
    alCerrar(verificador, auditados) {
      sincronizar();
      const huellas = huellasActuales();
      const lineas: string[] = [];
      const porPlan = new Map<string, Set<string>>();
      for (const r of ficha.respaldos) (porPlan.get(r.plan) ?? porPlan.set(r.plan, new Set()).get(r.plan)!).add(r.tarea);
      for (const [plan, tareas] of porPlan) {
        const fichero = join(opciones.raiz, CARPETA_DE_PLANES, plan, "TASKS.md");
        let texto: string;
        try {
          texto = readFileSync(fichero, "utf8");
        } catch {
          continue;
        }
        const leido = leerTareasDelPlan(texto);
        let cambiado = texto;
        for (const numero of tareas) {
          const t = leido.tareas.find((x) => x.numero === numero);
          if (t === undefined) continue;
          const criterios: EstadoDeCriterio[] = Array.from({ length: t.criterios.total }, (_, i) => {
            const e = estadoDeCriterio(ficha, { plan, tarea: numero, criterio: i + 1 }, huellas);
            const a = auditados?.get(`${plan}/${numero}/${String(i + 1)}`);
            return e === "vigente" && a !== undefined && a.veredicto !== "cumple" ? "sin-sostener" : e;
          });
          const estado: EstadoDeTarea = estadoDeTarea(criterios, t.criterios.hechos, verificador);
          const caducados = criterios.filter((c) => c === "caducado").length;
          const sinSostener = criterios.filter((c) => c === "sin-sostener").length;
          lineas.push(
            `${plan} · tarea ${numero}: ${estado} (${String(t.criterios.hechos)}/${String(t.criterios.total)} marcados` +
              `${caducados > 0 ? `, ${String(caducados)} comprobado(s) antes del último cambio` : ""}` +
              `${sinSostener > 0 ? `, ${String(sinSostener)} que su prueba no sostiene` : ""})`
          );
          // «en curso» no se escribe: no hay una palabra del juez para él y la que ponga el desarrollador vale.
          if (estado !== "en curso") cambiado = conEstadoDeTarea(cambiado, numero, estado === "pendiente" ? "pendiente" : estado) ?? cambiado;
        }
        if (cambiado !== texto) {
          try {
            writeFileSync(fichero, cambiado, "utf8");
          } catch {
            lineas.push(`${plan}: no se pudo escribir el estado en su TASKS.md`);
          }
        }
      }
      const vigentes = ficha.evidencias.filter((e) => e.tipo !== "escritura" && vigente(e, huellas)).length;
      const caducadas = ficha.evidencias.filter((e) => e.tipo !== "escritura" && !vigente(e, huellas)).length;
      lineas.unshift(
        `evidencias: ${String(vigentes)} vigente(s), ${String(caducadas)} caducada(s); ficheros escritos: ${String(Object.keys(ficha.escritos).length)}`
      );
      guardar();
      return lineas;
    },
    ficha: () => ficha,
  };
}

function leer(ruta: string | undefined): FichaDeTrabajo | undefined {
  if (ruta === undefined || !existsSync(ruta)) return undefined;
  try {
    const f = interpretarFicha(JSON.parse(readFileSync(ruta, "utf8")));
    if (f === undefined) renameSync(ruta, `${ruta}.apartada-${String(Date.now())}`);
    return f;
  } catch {
    return undefined;
  }
}
