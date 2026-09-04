import { describe, it, expect } from "vitest";
import { crearConsolaWeb } from "./consolaWeb.js";

import { REJECT_MESSAGE, type Decision } from "../../vendor/hitl.js";

const PENDIENTE = { id: "1", origen: "dev", descripcion: "escribir src/app.xne", decisionesPermitidas: ["approve", "reject"] };
const OTRO_PENDIENTE = { id: "2", origen: "dev", descripcion: "escribir src/otro.xne", decisionesPermitidas: ["approve", "reject"] };

/**
 * `Decision` NO es una cadena: es `{ type: "approve" | "reject"; message?: string }`
 * (`vendor/hitl.ts:26`). Los ayudantes evitan que un test compare contra una forma
 * inventada y pase por accidente.
 */
const aprobado = (d: Decision | undefined) => d?.type === "approve";
const rechazado = (d: Decision | undefined) => d?.type === "reject";

describe("consolaWeb: la entrada", () => {
  it("la prosa que llega por accion sale por el iterador de líneas", async () => {
    const c = crearConsolaWeb();
    c.recibir({ clase: "prosa", texto: "haz un listado" });
    const it = c.consola.lineas[Symbol.asyncIterator]();
    expect((await it.next()).value).toBe("haz un listado");
  });

  it("cerrar agota las líneas: es EOF, y el lazo de correrConsola retorna", async () => {
    const c = crearConsolaWeb();
    c.cerrar();
    const it = c.consola.lineas[Symbol.asyncIterator]();
    expect((await it.next()).done).toBe(true);
  });

  it("cerrar despierta a quien YA estaba esperando: si no, correrConsola se cuelga", async () => {
    const c = crearConsolaWeb();
    const it = c.consola.lineas[Symbol.asyncIterator]();
    const siguiente = it.next();
    c.cerrar();
    expect((await siguiente).done).toBe(true);
  });

  it("la prosa deja su acto de USUARIO: el transcript se lo debe a quien la tecleó", () => {
    const c = crearConsolaWeb();
    c.recibir({ clase: "prosa", texto: "añade una colección de clientes" });
    expect(c.actos()).toEqual([{ tipo: "usuario", texto: "añade una colección de clientes" }]);
  });
});

describe("consolaWeb: la aprobación es fail-closed POR TRANSPORTE", () => {
  it("sin cliente conectado, todo se RECHAZA", async () => {
    const c = crearConsolaWeb();
    c.desconectar();
    const d = await c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    expect(rechazado(d.get("1"))).toBe(true);
    expect(d.get("1")?.message).toBe(REJECT_MESSAGE);
  });

  it("si expira el plazo, se RECHAZA: el silencio no aprueba", async () => {
    const c = crearConsolaWeb({ msDeEspera: 10 });
    c.conectar();
    const d = await c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    expect(rechazado(d.get("1"))).toBe(true);
  });

  it("solo un «si» explícito aprueba", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.recibir({ clase: "decision", decisiones: { "1": "approve" } });
    expect(aprobado((await promesa).get("1"))).toBe(true);
  });

  it("una decisión que no entendemos es RECHAZO, no un pase", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.recibir({ clase: "decision", decisiones: { "1": "quizá" } });
    expect(rechazado((await promesa).get("1"))).toBe(true);
  });

  it("desconectarse MIENTRAS se decide es rechazo", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.desconectar();
    expect(rechazado((await promesa).get("1"))).toBe(true);
  });

  it("una respuesta PARCIAL no arrastra a los demás: el que no se contestó queda rechazado", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE, OTRO_PENDIENTE], new Map(), new Map());
    c.recibir({ clase: "decision", decisiones: { "1": "approve" } });
    const d = await promesa;
    expect(aprobado(d.get("1"))).toBe(true);
    expect(rechazado(d.get("2"))).toBe(true);
    expect(d.get("2")?.message).toBe(REJECT_MESSAGE);
  });

  it("un id que no pedimos no aprueba nada, ni ensucia el mapa", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.recibir({ clase: "decision", decisiones: { "99": "approve" } });
    const d = await promesa;
    expect(rechazado(d.get("1"))).toBe(true);
    expect(d.has("99")).toBe(false);
  });

  it("cerrar la sesión sin contestar es rechazo: nunca contestar no puede colgar el turno", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.cerrar();
    expect(rechazado((await promesa).get("1"))).toBe(true);
  });

  /**
   * El plazo se pone en un MINUTO a propósito: si la promesa dependiera de él, estos dos
   * tests agotarían el suyo (5 s) en vez de pasar. Es la diferencia entre rechazar por
   * decisión y rechazar por agotamiento, que desde fuera se parecen demasiado.
   */
  it("`decisiones: null` termina enseguida en rechazo, y no revienta el POST", async () => {
    const c = crearConsolaWeb({ msDeEspera: 60_000 });
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.recibir({ clase: "decision", decisiones: null as unknown as Record<string, string> });
    expect(rechazado((await promesa).get("1"))).toBe(true);
  });

  it("sin la clave `decisiones` tampoco se espera al plazo", async () => {
    const c = crearConsolaWeb({ msDeEspera: 60_000 });
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.recibir({ clase: "decision" } as unknown as { clase: "decision"; decisiones: Record<string, string> });
    expect(rechazado((await promesa).get("1"))).toBe(true);
  });

  /**
   * El vocabulario del cable es EXACTAMENTE `Decision["type"]`, no el de una respuesta
   * tecleada. Un `"s"` es lo que aprueba en `interpretAnswer`, y aquí no aprueba nada:
   * son dos alfabetos distintos y este test es lo que impide confundirlos.
   */
  it("un «s» por el cable NO aprueba: aquí no se teclea, se pulsa un botón", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.recibir({ clase: "decision", decisiones: { "1": "s" } });
    expect(rechazado((await promesa).get("1"))).toBe(true);
  });

  it("aprobar algo que el pendiente no permite aprobar es rechazo", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const soloRechazable = { ...PENDIENTE, decisionesPermitidas: ["reject"] };
    const promesa = c.consola.aprobacionesTui!([soloRechazable], new Map(), new Map());
    c.recibir({ clase: "decision", decisiones: { "1": "approve" } });
    expect(rechazado((await promesa).get("1"))).toBe(true);
  });

  it("una decisión TARDÍA no asciende nada: cuando llega ya no hay aprobación viva", async () => {
    const c = crearConsolaWeb({ msDeEspera: 5 });
    c.conectar();
    const d = await c.consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    c.recibir({ clase: "decision", decisiones: { "1": "approve" } });
    expect(rechazado(d.get("1"))).toBe(true);
  });
});

describe("consolaWeb: qué NO viaja", () => {
  it("el diff va en el mensaje de aprobación y en ningún acto ni evento", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    // `LineaDeDiff` es `{ tipo: "igual"|"anadido"|"quitado"; texto }` (`core/diff.ts:12`).
    const diffs = new Map([["src/app.xne", [{ tipo: "anadido" as const, texto: "<coleccion/>" }]]]);
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], new Map(), diffs);
    expect(JSON.stringify(c.mensajesDeAprobacion())).toContain("<coleccion/>");
    expect(JSON.stringify(c.actos())).not.toContain("<coleccion/>");
    expect(JSON.stringify(c.eventosEmitidos())).not.toContain("<coleccion/>");
    c.recibir({ clase: "decision", decisiones: { "1": "reject" } });
    await promesa;
  });

  it("el contenido del fichero tampoco: solo el mensaje de aprobación lo lleva", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const ficheros = new Map([["1", "src/app.xne"]]);
    const promesa = c.consola.aprobacionesTui!([PENDIENTE], ficheros, new Map());
    c.recibir({ clase: "decision", decisiones: { "1": "reject" } });
    await promesa;
    // Resuelta la aprobación, el mensaje con contenido se SUELTA: nada de lo que el
    // humano decidió sigue vivo en memoria una vez decidido.
    expect(c.mensajesDeAprobacion()).toHaveLength(0);
  });

  it("un secreto no queda en actos ni en eventos", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.leerSecreto("clave de Anthropic");
    c.recibir({ clase: "secreto", valor: "sk-ant-NO-DEBE-SALIR" });
    expect(await promesa).toBe("sk-ant-NO-DEBE-SALIR");
    expect(JSON.stringify(c.actos())).not.toContain("sk-ant-NO-DEBE-SALIR");
    expect(JSON.stringify(c.eventosEmitidos())).not.toContain("sk-ant-NO-DEBE-SALIR");
  });
});

describe("consolaWeb: sin cliente, las preguntas contestan lo que un rl cerrado", () => {
  it("preguntar devuelve cadena vacía, que en aprobar.ts ya es rechazo", async () => {
    const c = crearConsolaWeb();
    c.desconectar();
    expect(await c.consola.preguntar("¿Aprobar? ")).toBe("");
  });

  it("leerSecreto devuelve cadena vacía", async () => {
    const c = crearConsolaWeb();
    c.desconectar();
    expect(await c.consola.leerSecreto("clave: ")).toBe("");
  });

  it("seleccionar devuelve undefined, que es cancelar", async () => {
    const c = crearConsolaWeb();
    c.desconectar();
    expect(await c.consola.seleccionar!({ titulo: "modo", opciones: [{ id: "cloud", etiqueta: "Cloud" }] })).toBe(undefined);
  });

  /**
   * `pedirDecisiones` hace `interactive && !eof()`: sin `eof` definido, «no se sabe» vale
   * por «hay humano», que es la dirección insegura. Y esta piel cumple las dos
   * precondiciones de la fuga —`interactivo: true` y `preguntar` devolviendo `""` al
   * desconectarse—, así que declararlo es lo que la deja fail-closed por diseño y no por
   * el sitio donde caiga el `if` de `main.ts`.
   */
  it("con el cliente caído, `eof()` dice que sí: la red de seguridad debajo de aprobacionesTui", () => {
    const c = crearConsolaWeb();
    c.conectar();
    expect(c.consola.eof!()).toBe(false);
    c.desconectar();
    expect(c.consola.eof!()).toBe(true);
  });

  it("desconectarse MIENTRAS se pregunta contesta cadena vacía en vez de colgarse", async () => {
    const c = crearConsolaWeb();
    c.conectar();
    const promesa = c.consola.preguntar("¿Aprobar? ");
    c.desconectar();
    expect(await promesa).toBe("");
  });
});

describe("consolaWeb: reconexión", () => {
  it("reconectar reemite todos los actos y no los duplica en el servidor", () => {
    const c = crearConsolaWeb();
    c.conectar();
    c.consola.escribir("primera\n");
    c.consola.escribir("segunda\n");
    const antes = c.actos().length;
    c.desconectar();
    const reemitidos = c.conectar();
    expect(reemitidos).toHaveLength(antes);
    expect(c.actos()).toHaveLength(antes);
  });
});

describe("consolaWeb: los actos de la piel no son solo altas", () => {
  /**
   * `pielWeb.alActo` dispara también cuando el ÚLTIMO acto se ACTUALIZA: el cierre de
   * una racha de tools sustituye a su apertura (`core/actos.ts#conLineaDeTool`). Un
   * transporte que anexara a ciegas dejaría las dos líneas en el cliente para siempre.
   */
  it("el cierre de una racha se emite como SUSTITUCIÓN, no como un acto más", () => {
    const c = crearConsolaWeb();
    c.conectar();
    const piel = c.consola.piel!();
    piel.linea("→ lee src/app.xne");
    piel.linea("→ lee ×3 — src/app.xne");
    expect(c.actos()).toHaveLength(1);
    expect(c.eventosEmitidos().map((m) => m.clase)).toEqual(["acto", "sustitucion"]);
  });

  it("si algo se escribió DESPUÉS del grupo, la sustitución cae en reemisión entera", () => {
    const c = crearConsolaWeb();
    c.conectar();
    const piel = c.consola.piel!();
    piel.linea("→ lee src/app.xne");
    // Un `escribir` intercalado mueve el grupo lejos del final: sustituir «el último»
    // en el cliente cambiaría el acto EQUIVOCADO.
    c.consola.escribir("aviso del sistema\n");
    piel.linea("→ lee ×3 — src/app.xne");
    expect(c.actos()).toHaveLength(2);
    expect(c.eventosEmitidos().map((m) => m.clase)).toEqual(["acto", "acto", "reemision"]);
  });
});
