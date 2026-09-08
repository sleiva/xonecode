import { describe, expect, it } from "vitest";
import {
  crearConsolaDeTarea,
  ErrorDeTareaSinHumano,
  MENSAJE_DE_RECHAZO_DE_TAREA,
} from "./consolaDeTarea.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import type { Piel } from "../../core/turno.js";

const PENDIENTE: PendienteDeAprobacion = {
  id: "1",
  origen: "dev",
  descripcion: "[dev] quiere escribir un fichero del proyecto",
  decisionesPermitidas: ["approve", "reject"],
};
const OTRO: PendienteDeAprobacion = { ...PENDIENTE, id: "2", origen: "mockup" };

function montar() {
  const aparcado: string[] = [];
  const escrito: string[] = [];
  const consola = crearConsolaDeTarea({
    aparcar: (motivo) => aparcado.push(motivo),
    escribir: (texto) => escrito.push(texto),
    catalogoModelos: new CatalogoModelosEnMemoria(),
    guardarModeloGlobal: (_papel, id) => ({ ruta: "/casa/.xonecode/config.json", id }),
  });
  return { consola, aparcado, escrito };
}

describe("crearConsolaDeTarea", () => {
  it("una aprobación APARCA con las rutas, y devuelve rechazo para que el turno cierre", async () => {
    // El hallazgo que gobierna el diseño: hoy una consola sin cliente contesta rechazo en
    // SILENCIO. Aquí el rechazo sigue siendo el valor devuelto —medido: con él el turno se
    // reanuda, el modelo se entera y el turno cierra con `cortadoPorTope` en false— pero lo
    // que cuenta es que la tarea queda aparcada y con el motivo.
    const { consola, aparcado } = montar();
    const decisiones = await consola.aprobacionesTui!(
      [PENDIENTE],
      new Map([["1", "/src/app.xne"]]),
      new Map()
    );
    expect(decisiones.get("1")).toMatchObject({ type: "reject" });
    expect(aparcado).toHaveLength(1);
    expect(aparcado[0]).toMatch(/src\/app\.xne/);
    expect(aparcado[0]).toMatch(/aprobaci/i);
  });

  it("el rechazo lleva el MENSAJE: sin él el modelo remata como si hubiera escrito", async () => {
    // `vendor/hitl.ts` documenta este modo de fallo en el propio `REJECT_MESSAGE`: un
    // rechazo pelado deja al modelo sintetizar la respuesta final como si la escritura
    // hubiese quedado lista. En una tarea de fondo el transcript es lo ÚNICO que una
    // persona leerá después, así que ahí esa mentira es la que cuenta.
    const { consola } = montar();
    const decisiones = await consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    const mensaje = decisiones.get("1")?.message ?? "";
    expect(mensaje).toBe(MENSAJE_DE_RECHAZO_DE_TAREA);
    expect(mensaje).toMatch(/NO se ha ejecutado/);
    // Y no dice «por el usuario»: en una tarea de fondo nadie rechazó nada, y esa
    // atribución acabaría en la respuesta final como un rechazo que nunca hubo.
    expect(mensaje).not.toMatch(/por el usuario/i);
  });

  it("la ruta va RELATIVA a la raíz, como los hallazgos del verificador", async () => {
    // Las rutas del interrupt son las del backend virtual (`/app.xne`): nunca de la
    // máquina, pero con una barra delante que las hace parecer absolutas. El motivo viaja
    // por el cable, y el cable puede ir por un túnel.
    const { consola, aparcado } = montar();
    await consola.aprobacionesTui!([PENDIENTE], new Map([["1", "/app.xne"]]), new Map());
    expect(aparcado[0]).toMatch(/\bapp\.xne\b/);
    expect(aparcado[0]).not.toMatch(/\/app\.xne/);
  });

  it("sin ruta conocida se dice la DESCRIPCIÓN, no un hueco", async () => {
    const { consola, aparcado } = montar();
    await consola.aprobacionesTui!([PENDIENTE], new Map(), new Map());
    expect(aparcado[0]).toContain("[dev] quiere escribir un fichero del proyecto");
  });

  it("una pregunta APARCA y CORTA: cualquier cadena sería una respuesta inventada", async () => {
    // Medido: `preguntar` no tiene valor de «rechazo» —16 de sus 18 llamadores leen la
    // cadena vacía como «cancela / usa el valor por omisión», que es una decisión que aquí
    // nadie ha tomado—. Cortar desde dentro es el camino que este repo ya usa para el «sin
    // humano» de `run.ts`, y el motivo queda puesto ANTES de cortar.
    const { consola, aparcado } = montar();
    await expect(consola.preguntar("¿Sigo?")).rejects.toBeInstanceOf(ErrorDeTareaSinHumano);
    expect(aparcado).toHaveLength(1);
    expect(aparcado[0]).toMatch(/¿Sigo\?/);
  });

  it("una credencial APARCA y CORTA: una clave vacía es una clave equivocada", async () => {
    const { consola, aparcado } = montar();
    await expect(consola.leerSecreto("clave de anthropic:")).rejects.toBeInstanceOf(
      ErrorDeTareaSinHumano
    );
    expect(aparcado).toHaveLength(1);
    expect(aparcado[0]).toMatch(/credencial/i);
    // El enunciado sí; el valor no existe. Y de la pregunta no se copia nada más.
    expect(aparcado[0]).not.toMatch(/clave de anthropic/);
  });

  it("se aparca UNA vez por turno: el modelo que insiste no encadena cuatro motivos", async () => {
    // Medido en `turnoReal.ts` con un agente que vuelve a proponer tras cada rechazo:
    // `pedirAprobacion` se llama CUATRO veces en un solo turno antes de que el tope corte.
    // Cuatro motivos encadenados taparían el primero, que es el que explica por qué paró.
    const { consola, aparcado } = montar();
    for (let i = 0; i < 4; i += 1) {
      const decisiones = await consola.aprobacionesTui!(
        [PENDIENTE],
        new Map([["1", `/ronda${i}.xne`]]),
        new Map()
      );
      // Las rondas siguientes siguen rechazando: callar el motivo no es callar la decisión.
      expect(decisiones.get("1")).toMatchObject({ type: "reject" });
    }
    expect(aparcado).toHaveLength(1);
    expect(aparcado[0]).toMatch(/ronda0\.xne/);
  });

  it("dos pendientes en la MISMA tanda son un solo motivo con las dos rutas", async () => {
    const { consola, aparcado } = montar();
    const decisiones = await consola.aprobacionesTui!(
      [PENDIENTE, OTRO],
      new Map([
        ["1", "/a.xne"],
        ["2", "/b.xne"],
      ]),
      new Map()
    );
    expect([...decisiones.keys()]).toEqual(["1", "2"]);
    expect(aparcado).toHaveLength(1);
    expect(aparcado[0]).toMatch(/a\.xne/);
    expect(aparcado[0]).toMatch(/b\.xne/);
  });

  it("`eof` dice la verdad —no hay humano— y no se usa para aprobar ni rechazar por detrás", () => {
    const { consola } = montar();
    expect(consola.eof!()).toBe(true);
    expect(consola.interactivo).toBe(false);
  });

  it("lo que se escribe va al transcript", async () => {
    const { consola, escrito } = montar();
    consola.escribir("hola\n");
    expect(escrito).toEqual(["hola\n"]);
  });

  it("aparcar no es MUDO en el transcript: quien lea la sesión ve por qué paró", async () => {
    // El estado de la tarea lo lee el kanban; el transcript lo lee la persona que abre la
    // sesión para atenderla, y ahí un turno que se corta sin decir nada se lee como que el
    // agente se quedó callado.
    const { consola, escrito } = montar();
    await consola.aprobacionesTui!([PENDIENTE], new Map([["1", "/app.xne"]]), new Map());
    expect(escrito.join("")).toMatch(/app\.xne/);
    expect(escrito.join("")).toMatch(/aparcad/i);
  });

  it("la piel se REENVÍA si se le da, y no está si no", () => {
    // Sin piel, `crearEjecutorReal` cae en `crearPielStdio(escribir)` y el turno entero
    // entra en el transcript como actos `sistema`: se guarda, pero sin actos de asistente
    // ni de razonamiento. Quien monta esta consola tiene que poder darle la de su proyecto,
    // y `piel: undefined` no vale — un `"piel" in consola` diría que sí.
    const { consola } = montar();
    expect(consola.piel).toBeUndefined();
    expect("piel" in consola).toBe(false);

    const piel = {} as unknown as Piel;
    const conPiel = crearConsolaDeTarea({
      aparcar: () => {},
      escribir: () => {},
      piel: () => piel,
      catalogoModelos: new CatalogoModelosEnMemoria(),
      guardarModeloGlobal: (_papel, id) => ({ ruta: "/casa/.xonecode/config.json", id }),
    });
    expect(conPiel.piel!()).toBe(piel);
  });

  it("las líneas se agotan en cuanto se pide una: una tarea es UN turno, no una conversación", async () => {
    const { consola } = montar();
    const leidas: string[] = [];
    for await (const linea of consola.lineas) leidas.push(linea);
    expect(leidas).toEqual([]);
  });
});
