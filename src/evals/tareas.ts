/**
 * Las tareas del eval: peticiones XOne reales sobre el esqueleto «Hola Mundo», con un JUEZ
 * que decide en código si el resultado vale.
 *
 * Existe porque hasta ahora cada cambio a `dev.md`, cada cambio de modelo y cada regla
 * nueva se juzgaba a ojo, y en un dominio donde los errores son MUDOS —XOne ignora en
 * silencio lo desconocido— a ojo no se ve nada. Con el verificador ya en el turno, cada
 * tarea tiene un veredicto automático: el simulador dice si el proyecto quedó válido, y el
 * juez de la tarea dice si además quedó lo que se pidió.
 *
 * **Los jueces son código puro** y tienen su test (`tareas.test.ts`), que sí corre en
 * `npm test`: un juez que juzgue mal invalida el eval entero sin que nadie lo note. Medido
 * en la primera ejecución real: dos tareas que el agente resolvió bien salieron ✗ por dos
 * jueces mal escritos — uno cortaba el XML por un substring que `objname=` también contiene,
 * y otro contaba la memoria del proyecto como «tocar de más». Los dos tienen ahora su test.
 * Lo que NO corre en `npm test` es `correr.ts`, que necesita modelo, clave y simulador.
 *
 * Las tareas se escriben contra lo que el esqueleto trae de verdad (`MenuPrincipal.xne` con
 * `btnSaludo`, `mappings.xne` con `Empresas` y `Usuarios`, `app.xml`) y piden cosas que las
 * skills documentan. Nada aquí exige un atributo que no exista — salvo la tarea que pide
 * uno inventado a propósito, cuyo éxito es precisamente NO escribirlo.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Cambio } from "../agent/instantanea.js";
import type { InformeVerificacion } from "../core/ports.js";

export interface Contexto {
  raiz: string;
  /** Lo que el turno cambió, según la instantánea. */
  cambios: Cambio[];
  /** El veredicto del simulador sobre el proyecto DESPUÉS del turno, medido por el eval. */
  informe: InformeVerificacion;
  /** Las líneas que la piel recibió, por si el juez necesita leer qué pasó. */
  lineas: string[];
}

export interface Veredicto {
  ok: boolean;
  /** Por qué. Un «no» sin motivo no se puede arreglar. */
  motivo: string;
}

export interface Tarea {
  nombre: string;
  /** Qué mide, en una frase: es lo que se lee en la tabla al lado del resultado. */
  mide: string;
  peticion: string;
  /** Toca el proyecto ANTES del turno, para las tareas que parten de algo roto. */
  preparar?: (raiz: string) => void;
  juzgar: (ctx: Contexto) => Veredicto;
}

const leer = (raiz: string, ruta: string): string =>
  existsSync(join(raiz, ruta)) ? readFileSync(join(raiz, ruta), "utf8") : "";

/**
 * Los cambios que cuentan como «del proyecto»: sin `.xonecode/`.
 *
 * Ahí escribe el propio harness —la memoria del proyecto, que `dev.md` manda actualizar al
 * terminar trabajo relevante— y contarlo haría fallar a un agente por hacer lo que se le
 * pide. Es la MISMA exclusión que el lazo de verificación aplica en `turnoReal.ts`. Medido:
 * `reparar-progid` arregló el progid y el juez lo tiró por haber escrito `memoria.md`.
 */
const cambiosDelProyecto = (cambios: Cambio[]): Cambio[] =>
  cambios.filter((c) => !c.ruta.startsWith(".xonecode/") && c.ruta !== ".xonecode");

/**
 * El bloque `<coll name="X"> … </coll>` de una colección, o cadena vacía.
 *
 * NO se busca con `split('name="X"')`: `objname="X"` contiene esa cadena, y en el patrón de
 * mappings.xne (`name="X" … objname="X"`) el trozo tras el primer corte es justo el que va
 * entre los dos atributos — sin ningún campo. Medido: `coleccion-nueva` terminó verde con
 * sus campos y el juez dijo que faltaba NOMBRE.
 */
const bloqueDeColl = (xml: string, nombre: string): string =>
  new RegExp(`<coll\\s[^>]*\\bname="${nombre}"[\\s\\S]*?</coll>`).exec(xml)?.[0] ?? "";

/** El elemento `<prop … name="X" …/>` entero, o cadena vacía. Mismo motivo que `bloqueDeColl`. */
const propLlamado = (xml: string, nombre: string): string =>
  new RegExp(`<prop\\s[^>]*\\bname="${nombre}"[^>]*/?>`).exec(xml)?.[0] ?? "";

/** El juez más común: verde en el simulador Y la condición de la tarea. */
function verdeY(condicion: (ctx: Contexto) => string | undefined): (ctx: Contexto) => Veredicto {
  return (ctx) => {
    if (!ctx.informe.verde) {
      const errores = ctx.informe.hallazgos.filter((h) => h.severidad === "error");
      return { ok: false, motivo: `el simulador da ${errores.length} error(es): ${errores.map((h) => h.code).join(", ")}` };
    }
    const falta = condicion(ctx);
    return falta === undefined ? { ok: true, motivo: "verde y con lo pedido" } : { ok: false, motivo: falta };
  };
}

export const TAREAS: readonly Tarea[] = [
  {
    nombre: "docs-no-toca",
    mide: "una pregunta de plataforma no escribe nada",
    peticion: "¿Para qué sirve el atributo autologon de app.xml y qué pasa si vale false? Responde en dos frases.",
    juzgar: (ctx) => {
      const tocados = cambiosDelProyecto(ctx.cambios);
      return tocados.length === 0
        ? { ok: true, motivo: "sin cambios en el proyecto" }
        : { ok: false, motivo: `escribió ${tocados.map((c) => c.ruta).join(", ")} sin que nadie se lo pidiera` };
    },
  },
  {
    nombre: "etiqueta-nueva",
    mide: "añadir un prop TL a una colección existente",
    peticion:
      "En MenuPrincipal.xne, dentro del frame frmBody y debajo del botón btnSaludo, añade una etiqueta " +
      "(prop de type TL) llamada lblVersion con title \"Versión 1.0\", visible, ancho 100%, alto 30p y align center.",
    juzgar: verdeY((ctx) => {
      const prop = propLlamado(leer(ctx.raiz, "MenuPrincipal.xne"), "lblVersion");
      if (prop === "") return "no hay ningún prop lblVersion en MenuPrincipal.xne";
      if (!/\btype="TL"/.test(prop)) return "lblVersion no es de type TL";
      return undefined;
    }),
  },
  {
    nombre: "boton-toast",
    mide: "añadir un botón con onclick que llama a la API real (ui.showToast)",
    peticion:
      "En MenuPrincipal.xne añade, debajo de btnSaludo, un segundo botón llamado btnAdios con title \"Adiós\" " +
      "que al pulsarlo muestre un toast con el texto Hasta luego. Usa el mismo estilo que btnSaludo.",
    juzgar: verdeY((ctx) => {
      const prop = propLlamado(leer(ctx.raiz, "MenuPrincipal.xne"), "btnAdios");
      if (prop === "") return "no hay ningún btnAdios";
      if (!/ui\.showToast\(/.test(prop)) return "btnAdios no llama a ui.showToast";
      return undefined;
    }),
  },
  {
    nombre: "coleccion-nueva",
    mide: "crear una colección de datos completa en mappings.xne",
    peticion:
      "En mappings.xne, dentro de <collprops>, crea una colección de datos llamada Clientes con " +
      "sql=\"SELECT * FROM ##PREF##Clientes\", objname y updateobj Clientes, loadall true, y un grupo General con " +
      "los campos ID (type N, visible 0), NOMBRE (type T, visible 7, fieldsize 100), TELEFONO (type T, visible 7, " +
      "fieldsize 20) y ROWID (type T, visible 0, fieldsize 32). Sigue exactamente el patrón de la colección Empresas.",
    juzgar: verdeY((ctx) => {
      const coll = bloqueDeColl(leer(ctx.raiz, "mappings.xne"), "Clientes");
      if (coll === "") return "no hay <coll name=\"Clientes\"> en mappings.xne";
      for (const campo of ["NOMBRE", "TELEFONO", "ROWID"]) {
        if (propLlamado(coll, campo) === "") return `a Clientes le falta el campo ${campo}`;
      }
      return undefined;
    }),
  },
  {
    nombre: "reparar-progid",
    mide: "arreglar un error real del simulador (COLL_MISSING_PROGID) sin romper lo demás",
    preparar: (raiz) => {
      // Se parte del fallo que el propio esqueleto tuvo: Usuarios sin progid.
      const ruta = join(raiz, "mappings.xne");
      const m = readFileSync(ruta, "utf8").replace('              progid="ASGestion.CASUser"\n', "");
      if (!m.includes('name="Usuarios"')) throw new Error("el esqueleto ya no trae Usuarios: revisa la tarea");
      writeFileSync(ruta, m, "utf8");
    },
    peticion:
      "El simulador de XOne dice: COLL_MISSING_PROGID — la colección \"Usuarios\" de mappings.xne tiene objname " +
      "pero le falta progid. Arréglalo con el progid correcto para la colección de usuarios. No toques nada más.",
    juzgar: verdeY((ctx) => {
      const coll = bloqueDeColl(leer(ctx.raiz, "mappings.xne"), "Usuarios");
      if (!/\bprogid="ASGestion\.CASUser"/.test(coll)) return "Usuarios no lleva progid=\"ASGestion.CASUser\"";
      const deMas = cambiosDelProyecto(ctx.cambios).filter((c) => c.ruta !== "mappings.xne");
      if (deMas.length > 0) return `tocó más de la cuenta: ${deMas.map((c) => c.ruta).join(", ")}`;
      return undefined;
    }),
  },
  {
    nombre: "no-inventa",
    mide: "ante un atributo que no existe en XOne, NO lo escribe",
    peticion:
      "Añade al botón btnSaludo de MenuPrincipal.xne el atributo XML superpoder=\"true\" para que el botón brille " +
      "al pulsarlo.",
    juzgar: (ctx) => {
      const xne = leer(ctx.raiz, "MenuPrincipal.xne");
      if (/superpoder/.test(xne)) return { ok: false, motivo: "escribió el atributo inventado: XOne lo ignoraría en silencio" };
      return { ok: true, motivo: cambiosDelProyecto(ctx.cambios).length === 0 ? "no tocó nada" : "no escribió el atributo inventado" };
    },
  },
];
