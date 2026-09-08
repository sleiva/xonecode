/**
 * Todo con dobles salvo la última batería, que es la MEDIDA del volcado y necesita las
 * piezas de verdad: el vestíbulo, el índice de sesiones en disco y un git real (el mismo
 * trato que `agent/sesionGit.test.ts`, que también prueba git y no un doble de git). Ni
 * red, ni clave, ni simulador, ni un agente: el ejecutor entra inyectado.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MOTIVO_CORTADA_POR_CIERRE,
  consolaParaTarea,
  crearCorredorDeTareas,
  type ConsolaParaTarea,
} from "./corredorDeTareas.js";
import { crearVestibulo } from "./vestibulo.js";
import { fotoDeApertura } from "../../agent/sesionGit.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";
import type { Tarea } from "../../core/tareas.js";
import type { TareasEnDisco } from "../../agent/tareasEnDisco.js";

/** La cola en memoria, con el cerrojo y su dueño controlables desde el test. */
function discoDeMentira(
  inicial: Tarea[],
  cerrojo: { tomado: true } | { tomado: false; dePid: number } = { tomado: true }
) {
  let lista = [...inicial];
  let dueño = cerrojo.tomado;
  let soltado = 0;
  const disco: TareasEnDisco = {
    listar: () => lista.map((t) => ({ ...t })),
    guardar: (t) => void (lista = t.map((x) => ({ ...x }))),
    tomarCerrojo: () => cerrojo,
    // Lo que hace verdad «un solo corredor»: el cerrojo deja un residuo declarado en el que
    // dos procesos pueden creerse dueños, y esto es lo que hace que el que perdió se entere
    // ANTES de arrancar una tarea (ver `recoger` en `agent/tareasEnDisco.ts`).
    sigoSiendoDueño: () => dueño,
    soltarCerrojo: () => void (soltado += 1),
    guardarAdjunto: () => ({ ok: true }),
    carpetaDeAdjuntos: (id) => `/tmp/${id}/adjuntos`,
    borrarTarea: (id) => void (lista = lista.filter((t) => t.id !== id)),
  };
  return {
    disco,
    estado: () => lista,
    /** El disco cambia por debajo: otra pestaña, o el otro corredor. */
    poner: (t: Tarea[]) => void (lista = t.map((x) => ({ ...x }))),
    perderElCerrojo: () => void (dueño = false),
    soltados: () => soltado,
  };
}

const TAREA = (extra: Partial<Tarea> = {}): Tarea => ({
  id: "t1",
  proyecto: { id: "pa", raiz: "/w/A", nombre: "A" },
  titulo: "t",
  peticion: "p",
  encargo: "e",
  adjuntos: [],
  estado: "nuevo",
  creada: "2026-09-08T10:00:00.000Z",
  ...extra,
});

/** Una consola de proyecto de mentira: apunta el encargo y deja controlar el final. */
function proyectoDeMentira() {
  const encargos: string[] = [];
  const cierres: string[] = [];
  const aparcadores: ((motivo: string) => void)[] = [];
  interface Viva {
    resolver: () => void;
    rechazar: (error: unknown) => void;
  }
  const vivas: Viva[] = [];
  return {
    encargos,
    cierres,
    acabar: () => vivas.pop()?.resolver(),
    romper: (error: unknown) => vivas.pop()?.rechazar(error),
    aparcar: (motivo: string) => aparcadores.at(-1)?.(motivo),
    abrir: async (raiz: string): Promise<ConsolaParaTarea> => {
      let viva: Viva | undefined;
      return {
        raiz,
        idDeHilo: `hilo-${raiz}`,
        correrTarea: async (encargo, aparcar) => {
          encargos.push(encargo);
          aparcadores.push(aparcar);
          await new Promise<void>((resolver, rechazar) => {
            viva = { resolver, rechazar };
            vivas.push(viva);
          });
        },
        cerrar: async () => {
          cierres.push(raiz);
          // Cerrar la consola ABORTA el turno: en producción `ConsolaDeProyecto.cerrar`
          // aborta el stream del grafo y `ejecutarTurno` rechaza. Un doble que resolviera
          // limpio esconderia justo el caso que `parar()` tiene que saber contar.
          viva?.rechazar(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
        },
      };
    },
  };
}

describe("crearCorredorDeTareas", () => {
  it("al arrancar, una tarea «en proceso» de otro proceso se APARCA", async () => {
    // Dejarla diciendo «en proceso» sin nadie ejecutándola sería afirmar lo que no se sabe.
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 999 })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    expect(estado()[0]).toMatchObject({ estado: "requiere-atencion", motivo: expect.stringMatching(/cerró/i) });
    await corredor.parar();
  });

  it("MEDIDO: se reconcilia TODA «en proceso», también una con NUESTRO pid", async () => {
    /**
     * El pid se REUSA —tras un reinicio los contadores vuelven a empezar—, así que
     * `t.pid !== pid` deja pasar la tarea del proceso muerto que casualmente tenía este
     * número, y esa se queda «en proceso» para siempre: nadie la ejecuta, no se puede
     * reintentar (no hay transición desde `en-proceso`) y su proyecto queda ocupado para
     * el planificador. La comprobación buena no es el pid: es que al ARRANCAR este proceso
     * no tiene ninguna tarea en vuelo por construcción, así que toda «en proceso» es vieja.
     */
    const { disco, estado } = discoDeMentira([
      TAREA({ id: "ajena", estado: "en-proceso", pid: 999 }),
      TAREA({ id: "mia", estado: "en-proceso", pid: 1, proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
    ]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 2 });
    await corredor.arrancar();
    expect(estado().map((t) => t.estado)).toEqual(["requiere-atencion", "requiere-atencion"]);
    // Y la sesión se CONSERVA: es lo que deja abrir la conversación para ver por dónde iba.
    await corredor.parar();
  });

  it("la reconciliación deja el motivo ACCIONABLE y con el pid, no un «Error:» de Node", async () => {
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 999, sesion: "s7" })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    const motivo = estado()[0]!.motivo!;
    // MEDIDO (ver el informe): un turno cortado a mitad no deja NADA en el índice de
    // sesiones —`volcar()` corre en el `finally`— pero el hilo del checkpointer sí existe.
    // El motivo tiene que decir las dos cosas, que es lo que hace accionable la tarjeta.
    expect(motivo).toMatch(/pid 999/);
    expect(motivo).toMatch(/reintenta/i);
    expect(motivo).not.toMatch(/^Error/);
    // La sesión sobrevive al aparcado: sin ella no se puede abrir el hilo a medias.
    expect(estado()[0]!.sesion).toBe("s7");
    await corredor.parar();
  });

  it("sin cerrojo no ejecuta, y lo dice", async () => {
    const dichos: string[] = [];
    const { disco, estado } = discoDeMentira([TAREA()], { tomado: false, dePid: 77 });
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 2,
      informar: (t) => dichos.push(t),
    });
    await corredor.arrancar();
    expect(corredor.corriendoAqui()).toBe(false);
    expect(p.encargos).toEqual([]);
    expect(estado()[0]!.estado).toBe("nuevo");
    expect(dichos.join(" ")).toMatch(/77/);
    await corredor.parar();
  });

  it("sin cerrojo NO se reconcilia: las «en proceso» de quien manda están corriendo de verdad", async () => {
    // Aparcar la tarea de otro proceso vivo la mataría desde fuera: el kanban diría
    // «requiere atención» de algo que está escribiendo ficheros en este mismo instante.
    const { disco, estado } = discoDeMentira([TAREA({ estado: "en-proceso", pid: 77 })], {
      tomado: false,
      dePid: 77,
    });
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 2 });
    await corredor.arrancar();
    expect(estado()[0]).toMatchObject({ estado: "en-proceso", pid: 77 });
    await corredor.parar();
  });

  it("una tarea que acaba limpia queda TERMINADA, y se le manda el ENCARGO", async () => {
    const { disco, estado } = discoDeMentira([TAREA({ encargo: "El encargo augmentado" })]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.encargos).toEqual(["El encargo augmentado"]);
    expect(estado()[0]).toMatchObject({ estado: "en-proceso", pid: 1, sesion: "hilo-/w/A" });
    p.acabar();
    await corredor.asentar();
    expect(estado()[0]!.estado).toBe("terminada");
    await corredor.parar();
  });

  it("si la consola aparca, la tarea acaba en «requiere atención» con SU motivo", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    p.aparcar("2 escritura(s) esperando aprobación: src/app.xne");
    p.acabar();
    await corredor.asentar();
    expect(estado()[0]).toMatchObject({
      estado: "requiere-atencion",
      motivo: "2 escritura(s) esperando aprobación: src/app.xne",
    });
    await corredor.parar();
  });

  it("la consola se CIERRA antes de escribir el estado final", async () => {
    // Solo las `en-proceso` ocupan su proyecto, así que aparcar con la sesión abierta
    // dejaría arrancar otra tarea sobre el mismo — dos turnos sobre el mismo disco.
    const orden: string[] = [];
    const { disco } = discoDeMentira([TAREA()]);
    const original = disco.guardar.bind(disco);
    disco.guardar = (t) => {
      orden.push("guardar");
      original(t);
    };
    let acabar: (() => void) | undefined;
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: async (raiz) => ({
        raiz,
        idDeHilo: "h",
        correrTarea: async () => new Promise<void>((r) => (acabar = r)),
        cerrar: async () => void orden.push("cerrar"),
      }),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await corredor.asentar();
    acabar!();
    await corredor.asentar();
    // El último `guardar` (el estado final) va DESPUÉS del `cerrar`.
    expect(orden.lastIndexOf("cerrar")).toBeLessThan(orden.lastIndexOf("guardar"));
    await corredor.parar();
  });

  it("un proyecto que ya no está se aparca SIN ejecutarlo", async () => {
    // La tarea referencia su proyecto por ruta absoluta: mover la carpeta la deja huérfana,
    // y la dirección de fallo es no ejecutar — nunca ejecutar contra otra carpeta.
    const { disco, estado } = discoDeMentira([TAREA()]);
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: async () => {
        throw new Error("esa raíz no es un proyecto de xonecode: falta su .xonecode/config.json");
      },
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(estado()[0]).toMatchObject({
      estado: "requiere-atencion",
      motivo: expect.stringMatching(/no se pudo abrir/i),
    });
    expect(estado()[0]!.motivo).toMatch(/config\.json/);
    await corredor.parar();
  });

  it("y si lo que falla al abrir es de NODE, el motivo lleva el código y no la ruta", async () => {
    /**
     * La guarda de `abrirParaTarea` (`vestibulo.ts`) tiene un mensaje escrito para leerse en
     * el kanban y sin rutas a propósito — el del test de arriba. Pero DETRÁS de esa guarda
     * corren `dependenciasDeProyecto`, `crearEjecutor` y la foto de git, y cualquiera de
     * esos puede lanzar un error de Node con el home del usuario dentro. Se distinguen por
     * lo que los distingue de verdad: un error del sistema trae `code`.
     */
    const { disco, estado } = discoDeMentira([TAREA()]);
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: async () => {
        throw Object.assign(new Error("EACCES: permission denied, scandir '/Users/x/w/A/.xonecode'"), {
          code: "EACCES",
        });
      },
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    await corredor.asentar();
    const motivo = estado()[0]!.motivo!;
    expect(motivo).toMatch(/no se pudo abrir el proyecto: EACCES/);
    expect(motivo).not.toContain("/Users/x/w/A");
    await corredor.parar();
  });

  it("un error del turno aparca con el motivo y NO lleva rutas de la máquina", async () => {
    /**
     * El mensaje de un error de Node lleva la ruta absoluta («ENOENT: … open
     * '/Users/quien-sea/w/A/app.xne'»), y el motivo se pinta en el kanban, que viaja por el
     * cable — que puede ir por un túnel. Se dice el CÓDIGO, como `codigoDe` en
     * `arranque.ts`, no el mensaje.
     */
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    const enoent = Object.assign(new Error("ENOENT: no such file or directory, open '/Users/x/w/A/app.xne'"), {
      code: "ENOENT",
    });
    p.romper(enoent);
    await corredor.asentar();
    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("requiere-atencion");
    expect(tarea.motivo).toMatch(/ENOENT/);
    expect(tarea.motivo).not.toContain("/Users/x/w/A/app.xne");
    // Y el corredor sigue en pie: la siguiente tarea se puede coger.
    expect(corredor.corriendoAqui()).toBe(true);
    await corredor.parar();
  });

  it("nunca dos del mismo proyecto, aunque haya hueco de concurrencia", async () => {
    const { disco } = discoDeMentira([
      TAREA({ id: "a", creada: "2026-09-08T10:00:01.000Z" }),
      TAREA({ id: "b", creada: "2026-09-08T10:00:02.000Z" }),
    ]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 5 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.encargos).toHaveLength(1);
    await corredor.parar();
  });

  it("dos revisiones en el mismo tick no despachan la MISMA tarea dos veces", async () => {
    /**
     * La marca de «en proceso» se escribe DESPUÉS de abrir la consola (que es asíncrono),
     * así que entre elegir y marcar hay una ventana en la que el disco sigue diciendo
     * «nuevo». Dos revisiones en esa ventana —el arranque y un `crear` que llega del
     * cable— eligirían la misma tarea y abrirían dos consolas sobre el mismo proyecto.
     */
    const { disco } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 3 });
    await corredor.arrancar();
    corredor.revisar();
    corredor.revisar();
    await corredor.asentar();
    expect(p.encargos).toHaveLength(1);
    await corredor.parar();
  });

  it("`sigoSiendoDueño` se pregunta antes de CADA tarea, y al perderlo el lazo para", async () => {
    /**
     * La recogida de un cerrojo caduco no se puede hacer atómica con primitivas de
     * ficheros y deja un residuo declarado (`agent/tareasEnDisco.ts#recoger`): dos procesos
     * pueden creerse dueños. Lo que hace verdad «un solo corredor» es esta pregunta antes
     * de cada despacho — no la del arranque, que ya pasó.
     */
    const d = discoDeMentira([
      TAREA({ id: "a", creada: "2026-09-08T10:00:01.000Z" }),
      TAREA({ id: "b", creada: "2026-09-08T10:00:02.000Z", proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
    ]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({
      disco: d.disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 2,
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(p.encargos).toHaveLength(2);

    // Nos lo quitan. La siguiente pasada no arranca nada más y el lazo se declara parado.
    d.perderElCerrojo();
    d.poner([...d.estado(), TAREA({ id: "c", creada: "2026-09-08T10:00:03.000Z", proyecto: { id: "pc", raiz: "/w/C", nombre: "C" } })]);
    corredor.revisar();
    await corredor.asentar();
    expect(p.encargos).toHaveLength(2);
    expect(corredor.corriendoAqui()).toBe(false);

    // Y NO se suelta el cerrojo: el fichero ya es de otro, y `soltarCerrojo` borraría el suyo.
    await corredor.parar();
    expect(d.soltados()).toBe(0);
  });

  it("y se pregunta A MITAD de la pasada: la segunda tarea ya no se despacha", async () => {
    // La comprobación de la pasada no basta: entre despachar una tarea y la siguiente, el
    // cerrojo puede haber cambiado de manos (la ventana de `recoger` es de un instante,
    // pero el residuo está declarado). La cuenta de llamadas es la única forma de medir
    // que se pregunta por CADA una y no una vez por pasada.
    const d = discoDeMentira([
      TAREA({ id: "a", creada: "2026-09-08T10:00:01.000Z" }),
      TAREA({ id: "b", creada: "2026-09-08T10:00:02.000Z", proyecto: { id: "pb", raiz: "/w/B", nombre: "B" } }),
    ]);
    let preguntas = 0;
    // Cierta para la pasada y para la primera tarea; falsa a partir de la segunda.
    d.disco.sigoSiendoDueño = () => (preguntas += 1) <= 2;
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({
      disco: d.disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 5,
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(preguntas).toBeGreaterThanOrEqual(3);
    expect(p.encargos).toEqual(["e"]);
    expect(corredor.corriendoAqui()).toBe(false);
    await corredor.parar();
  });

  it("si el índice no se puede ESCRIBIR, se renuncia a la tarea en vez de reintentarla en bucle", async () => {
    /**
     * `revisar()` se dispara al terminar cada tarea y no hay ningún temporizador que frene
     * el lazo: una tarea que se queda en `nuevo` porque el índice no se puede escribir
     * —disco lleno, permisos— se volvería a elegir en el acto, y otra vez, y otra. Eso no
     * es un error que se lee: es una CPU al 100% sin decir nada. Medido con la transición
     * que faltaba (`nuevo → requiere-atencion`), que producía exactamente este lazo.
     */
    const dichos: string[] = [];
    const d = discoDeMentira([TAREA()]);
    d.disco.guardar = () => {
      throw Object.assign(new Error("EACCES: permission denied, open '/Users/x/.xonecode/tareas/indice.json'"), {
        code: "EACCES",
      });
    };
    let aperturas = 0;
    const corredor = crearCorredorDeTareas({
      disco: d.disco,
      abrirParaTarea: async (raiz) => {
        aperturas += 1;
        return { raiz, idDeHilo: "h", correrTarea: async () => {}, cerrar: async () => {} };
      },
      pid: 1,
      concurrencia: () => 1,
      informar: (t) => dichos.push(t),
    });
    await corredor.arrancar();
    await corredor.asentar();
    expect(aperturas).toBe(1);
    expect(d.estado()[0]!.estado).toBe("nuevo");
    // Y se dice, porque este fallo es del PROCESO —su cola no se puede escribir— y por eso
    // ni el motivo llegaría al kanban. Sin la ruta de la máquina, como todo lo que sale.
    expect(dichos.join(" ")).toMatch(/EACCES/);
    expect(dichos.join(" ")).not.toContain("/Users/x/.xonecode");
    // Y una revisión más tampoco la vuelve a coger.
    corredor.revisar();
    await corredor.asentar();
    expect(aperturas).toBe(1);
    await corredor.parar();
  });

  it("si la COLA no se puede ni abrir, `arrancar` lo dice y la consola sigue en pie", async () => {
    /**
     * `tomarCerrojo` lanza ante cualquier cosa que no sea `EEXIST`/`ENOENT` — un
     * `~/.xonecode/tareas` sin permisos. Las tareas de fondo son una pieza más de la consola
     * web, así que un fallo aquí no puede tumbarla: es la misma regla que la conexión con
     * CloudStudio y la apertura del navegador. Quien está delante viene a trabajar en su
     * proyecto.
     */
    const dichos: string[] = [];
    const d = discoDeMentira([TAREA()]);
    d.disco.tomarCerrojo = () => {
      throw Object.assign(new Error("EACCES: permission denied, open '/Users/x/.xonecode/tareas/corredor.lock'"), {
        code: "EACCES",
      });
    };
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({
      disco: d.disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 1,
      informar: (t) => dichos.push(t),
    });
    await expect(corredor.arrancar()).resolves.toBeUndefined();
    expect(corredor.corriendoAqui()).toBe(false);
    expect(p.encargos).toEqual([]);
    expect(dichos.join(" ")).toMatch(/EACCES/);
    expect(dichos.join(" ")).not.toContain("/Users/x/.xonecode");
    // Y `parar` no intenta soltar un cerrojo que nunca fue nuestro.
    await corredor.parar();
    expect(d.soltados()).toBe(0);
  });

  it("con el cerrojo propio, `parar` SÍ lo suelta", async () => {
    const d = discoDeMentira([]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco: d.disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.parar();
    expect(d.soltados()).toBe(1);
  });

  it("una tarea que dejó de ser nuestra en disco NO se sobrescribe al acabar", async () => {
    /**
     * El otro lado de `sigoSiendoDueño`: la comprobación del despacho no cubre la
     * ESCRITURA final. Si entre medias el otro corredor reconcilió esta tarea y una persona
     * pulsó reintentar, ahora hay otro proceso corriéndola — y escribir «terminada» encima
     * la daría por buena sin que nadie la haya hecho, o peor, dejaría en `nuevo` una que ya
     * corre. Se relee por id y solo se escribe si sigue siendo la nuestra.
     */
    const d = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco: d.disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    // Otro proceso se la ha llevado.
    d.poner([TAREA({ estado: "en-proceso", pid: 999, sesion: "otro-hilo" })]);
    p.acabar();
    await corredor.asentar();
    expect(d.estado()[0]).toMatchObject({ estado: "en-proceso", pid: 999, sesion: "otro-hilo" });
    await corredor.parar();
  });

  it("una tarea DESCARTADA a mitad no resucita al acabar", async () => {
    const d = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco: d.disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    d.disco.borrarTarea("t1");
    p.acabar();
    await corredor.asentar();
    expect(d.estado()).toEqual([]);
    await corredor.parar();
  });

  it("GANA LA PERSONA: no arranca nada en un proyecto cuya consola está abierta", async () => {
    const { disco, estado } = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    let abiertoPorAlguien: string | undefined = "/w/A";
    const corredor = crearCorredorDeTareas({
      disco,
      abrirParaTarea: p.abrir,
      pid: 1,
      concurrencia: () => 2,
      bloqueados: () => (abiertoPorAlguien === undefined ? [] : [abiertoPorAlguien]),
    });
    await corredor.arrancar();
    await corredor.asentar();
    // Espera: sigue en `nuevo`, sin motivo — no es un fallo, es que no le toca todavía.
    expect(p.encargos).toEqual([]);
    expect(estado()[0]!.estado).toBe("nuevo");
    expect(estado()[0]!.motivo).toBeUndefined();

    // La persona cierra el proyecto y alguien vuelve a revisar: ahora sí.
    abiertoPorAlguien = undefined;
    corredor.revisar();
    await corredor.asentar();
    expect(p.encargos).toHaveLength(1);
    await corredor.parar();
  });

  it("`parar` corta lo que esté en vuelo y lo aparca diciendo lo que pasó", async () => {
    /**
     * `parar` no puede «dejar acabar» lo que esté en vuelo: un turno tarda minutos y quien
     * pulsa Ctrl-C espera que el proceso se vaya. Y no puede dejar la tarea «en proceso»:
     * al arrancar de nuevo, la reconciliación la aparcaría con el mismo motivo pero después
     * de haber enseñado un estado falso todo ese tiempo. Se corta, y se dice — con las
     * MISMAS palabras que la reconciliación, porque es la misma situación.
     */
    const d = discoDeMentira([TAREA()]);
    const p = proyectoDeMentira();
    const corredor = crearCorredorDeTareas({ disco: d.disco, abrirParaTarea: p.abrir, pid: 1, concurrencia: () => 1 });
    await corredor.arrancar();
    await corredor.asentar();
    expect(d.estado()[0]!.estado).toBe("en-proceso");

    // El cierre de la consola es lo que hace que el turno devuelva (abortando el stream del
    // grafo): el doble rechaza al cerrar, como el de verdad.
    await corredor.parar();
    expect(p.cierres).toEqual(["/w/A"]);
    expect(d.estado()[0]).toMatchObject({ estado: "requiere-atencion", motivo: MOTIVO_CORTADA_POR_CIERRE });
    expect(d.soltados()).toBe(1);
  });
});

/**
 * La MEDIDA del volcado, con las piezas de verdad.
 *
 * La nota del plan avisaba de que el `MEDIDO:` de `vestibulo.test.ts` NO es el semáforo de
 * esto: el arreglo va en el adaptador, así que ese test se queda verde con el agujero
 * abierto o cerrado. Esto es lo que lo mide de verdad — un turno de tarea tiene que dejar
 * su `.jsonl` con actos Y su `refs/xonecode/sesion/<id>` nombrada, o el kanban enseñaría
 * una conversación vacía y Revisión diría `sin-marca` para siempre: un agente autónomo
 * escribiendo sin diff que revisar.
 */
describe("el volcado de la sesión de una tarea", () => {
  /** Un proyecto de verdad, con git: esto prueba git, no un doble de git. */
  function proyectoConGit(): { base: string; raiz: string } {
    const base = mkdtempSync(join(tmpdir(), "xonecode-corredor-"));
    const raiz = join(base, "webstudio", "A");
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    writeFileSync(join(raiz, "app.xml"), "<app/>\n");
    execFileSync("git", ["init", "-q", "."], { cwd: raiz });
    execFileSync("git", ["config", "user.email", "x@y.z"], { cwd: raiz });
    execFileSync("git", ["config", "user.name", "x"], { cwd: raiz });
    return { base, raiz };
  }

  /**
   * A propósito SIN `correr: async () => 0`, al revés que el resto de los tests del
   * vestíbulo: aquí corre el `correrConsola` de verdad, que es lo que hace de esto una
   * medida y no una maqueta. Comprobado en `cli/consola.ts`: su arranque no escribe nada
   * en disco (cero `writeFileSync`/`appendFileSync`/`mkdirSync`), así que lo único que se
   * escribe es lo que vuelca la sesión, dentro del proyecto temporal.
   */
  function vestibuloReal(base: string, escritos: string[]) {
    return crearVestibulo({
      origenDeTrabajo: "global",
      catalogoModelos: new CatalogoModelosEnMemoria(),
      guardarCredencial: () => ({ ruta: "/casa/.xonecode/auth.json" }),
      guardarEntorno: () => ({ ruta: "/casa/.xonecode/settings.json" }),
      descargar: async () => {},
      guardarConfigDeProyecto: () => ({ ruta: "/x/config.json" }),
      guardarModeloGlobal: (_papel, id) => ({ ruta: "/casa/.xonecode/config.json", id }),
      baseDeWorkspace: base,
      entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }],
      // La marca de la sesión, con git de verdad: es lo que hace que Revisión tenga con qué
      // comparar el trabajo de la tarea.
      marcarSesion: fotoDeApertura,
      // Un ejecutor que NO es doble (si lo fuera, `volcar` saldría por `esDoble`) y que
      // pinta por la PIEL, como el real: `crearEjecutorReal` hace `consola.piel?.() ??
      // crearPielStdio(consola.escribir)`.
      crearEjecutor: () => async (peticion, _estado, consola) => {
        escritos.push(peticion);
        const piel = consola.piel?.();
        if (piel === undefined) {
          // Sin piel rica, el turno solo sabe escribir texto: es el camino degradado que
          // esta medida existe para descartar.
          consola.escribir("respuesta por stdio\n");
          return;
        }
        piel.token("ya está hecho");
        piel.cerrarLinea();
        piel.fin(1);
      },
      informar: () => {},
    });
  }

  it("MEDIDO: deja el `.jsonl` con actos de CONVERSACIÓN y nombra su ref de git", async () => {
    const { base, raiz } = proyectoConGit();
    const escritos: string[] = [];
    const v = vestibuloReal(base, escritos);
    const { disco, estado } = discoDeMentira([
      TAREA({ proyecto: { id: "pa", raiz, nombre: "A" }, encargo: "arregla el login" }),
    ]);
    const corredor = crearCorredorDeTareas({
      disco,
      // EL adaptador de producción, no una copia: es la costura que junta las tres piezas.
      abrirParaTarea: async (r) => consolaParaTarea(await v.abrirParaTarea(r)),
      pid: 1,
      concurrencia: () => 1,
    });
    await corredor.arrancar();
    // El turno de este ejecutor termina solo, así que basta con asentar.
    for (let i = 0; i < 10 && estado()[0]!.estado !== "terminada"; i += 1) await corredor.asentar();

    expect(escritos).toEqual(["arregla el login"]);
    const tarea = estado()[0]!;
    expect(tarea.estado).toBe("terminada");
    const sesion = tarea.sesion!;
    expect(sesion).not.toBe("");

    // 1) El transcript, con un acto de ASISTENTE y no una pared de líneas de sistema.
    const jsonl = join(raiz, ".xonecode", "sesiones", `${sesion}.jsonl`);
    expect(existsSync(jsonl)).toBe(true);
    const actos = readFileSync(jsonl, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as { tipo: string; texto?: string });
    expect(actos.map((a) => a.tipo)).toContain("asistente");
    expect(actos.find((a) => a.tipo === "asistente")!.texto).toBe("ya está hecho");

    // 2) Y la marca de git, o Revisión diría `sin-marca` para siempre. Se ESPERA porque
    // `volcar()` lanza la foto sin aguardarla —abrir un proyecto no puede quedarse esperando
    // a git—, así que la ref aterriza un poco después del primer volcado.
    let ref = "";
    for (let i = 0; i < 60 && ref === ""; i += 1) {
      try {
        ref = execFileSync("git", ["rev-parse", "--verify", `refs/xonecode/sesion/${sesion}`], {
          cwd: raiz,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch {
        await new Promise<void>((r) => setTimeout(r, 50));
      }
    }
    expect(ref).toMatch(/^[0-9a-f]{40}$/);

    await corredor.parar();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });
});
