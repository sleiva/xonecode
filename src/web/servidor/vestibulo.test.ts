/**
 * Todo offline: el catálogo de modelos es el doble de `core/ports.ts`, la conexión con
 * CloudStudio y las cuatro escrituras entran inyectadas, y ningún test toca el
 * `~/.xonecode` de verdad — las rutas que se afirman son las que devuelven los dobles.
 *
 * Correcciones al enunciado, y por qué: `ModeloDisponible` (`core/ports.ts:83`) es
 * `{proveedor, id, nombre?}`, no `{id, etiqueta}`, así que el doble del catálogo se
 * escribe con la forma que existe — un doble con la forma inventada compila mal y, si
 * compilara, probaría un contrato que nadie implementa. Y `dobles()` gana los entornos
 * registrados y el escritor de `config.json`: sin ellos, `completarProyecto` escribiría en
 * el workspace de verdad del usuario que corre los tests.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearVestibulo, ENTORNOS_OFICIALES, escribirProyectoEnDisco } from "./vestibulo.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";
import type { Acto } from "../../core/actos.js";
import type { Entorno } from "../../core/settings.js";
import { validar } from "../../core/config.js";

function dobles() {
  const escrituras: string[] = [];
  const entornos: Entorno[] = [
    { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
  ];
  return {
    catalogoModelos: new CatalogoModelosEnMemoria({
      anthropic: [{ proveedor: "anthropic" as const, id: "claude-x", nombre: "Claude X" }],
    }),
    guardarCredencial: (p: string) => {
      escrituras.push(`cred:${p}`);
      return { ruta: "/casa/.xonecode/auth.json" };
    },
    guardarEntorno: (e: { id: string }) => {
      escrituras.push(`entorno:${e.id}`);
      return { ruta: "/casa/.xonecode/settings.json" };
    },
    guardarConfigDeProyecto: (raiz: string) => {
      escrituras.push(`config:${raiz}`);
      return { ruta: `${raiz}/.xonecode/config.json` };
    },
    descargar: async () => {
      escrituras.push("descarga");
    },
    adoptarLegado: (e: { id: string }) => {
      escrituras.push(`legado:${e.id}`);
    },
    guardarModeloGlobal: (papel: string, id: string) => {
      escrituras.push(`modelo:${papel}`);
      return { ruta: "/casa/.xonecode/config.json", id };
    },
    entornos,
    baseDeWorkspace: "/w",
    escrituras,
  };
}

/** Un puerto de sesiones en memoria: los tests no escriben en ningún `.xonecode`. */
function sesionesEnMemoria() {
  const jsonl = new Map<string, Acto[]>();
  return {
    jsonl,
    puerto: {
      listar: (raiz: string) =>
        [...jsonl.keys()]
          .filter((clave) => clave.startsWith(`${raiz}|`))
          .map((clave) => ({ id: clave.slice(raiz.length + 1), titulo: "sesión" })),
      crear: (raiz: string) => {
        const id = `s${jsonl.size + 1}`;
        jsonl.set(`${raiz}|${id}`, []);
        return id;
      },
      anotar: (raiz: string, id: string, acto: Acto) => {
        const clave = `${raiz}|${id}`;
        jsonl.set(clave, [...(jsonl.get(clave) ?? []), acto]);
      },
      reabrir: (raiz: string, id: string) => ({
        id,
        actos: [...(jsonl.get(`${raiz}|${id}`) ?? [])],
        historica: true,
      }),
    },
  };
}

describe("vestíbulo", () => {
  it("el paso de cuenta NO aparece si ya hay una elección", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, origenDeTrabajo: "global" });
    expect(await v.pasosPendientes()).not.toContain("cuenta");
  });

  it("el paso de cuenta aparece si `trabajo` resuelve por omisión, sin marca de primer arranque", async () => {
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "omision" });
    expect(await v.pasosPendientes()).toContain("cuenta");
  });

  it("el paso de entorno solo falta si no hay ninguno registrado", async () => {
    const con = crearVestibulo({ ...dobles(), origenDeTrabajo: "global" });
    expect(await con.pasosPendientes()).not.toContain("entorno");
    const sin = crearVestibulo({ ...dobles(), entornos: [], origenDeTrabajo: "global" });
    expect(await sin.pasosPendientes()).toContain("entorno");
  });

  it("el paso de entorno ofrece los dos oficiales y un «otro»", async () => {
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "omision" });
    const opciones = v.opcionesDeEntorno();
    expect(opciones.map((o) => o.id)).toContain("webstudio");
    expect(opciones.map((o) => o.id)).toContain("manager");
    expect(opciones.map((o) => o.id)).toContain("otro");
  });

  it("los dos oficiales van pre-rellenados y «otro» no inventa una URL", () => {
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "omision" });
    const porId = new Map(v.opcionesDeEntorno().map((o) => [o.id, o]));
    expect(porId.get("webstudio")!.url).toBe("https://mcp.xonewebstudio.com/mcp");
    expect(porId.get("manager")!.url).toMatch(/^https:\/\//);
    expect(porId.get("otro")!.url).toBe("");
    expect(ENTORNOS_OFICIALES).toHaveLength(2);
  });

  it("cancelar antes de elegir no escribe NADA", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, origenDeTrabajo: "omision" });
    await v.cancelar();
    expect(d.escrituras).toEqual([]);
  });

  it("una credencial tecleada queda escrita aunque se cancele después, y se DICE", async () => {
    const d = dobles();
    const dichos: string[] = [];
    const v = crearVestibulo({ ...d, origenDeTrabajo: "omision", informar: (t) => dichos.push(t) });
    await v.guardarCredencialDe("anthropic", "sk-…");
    await v.cancelar();
    expect(d.escrituras).toContain("cred:anthropic");
    expect(dichos.join("\n")).toMatch(/auth\.json/);
  });

  it("registrar un entorno adopta el fichero OAuth plano de antes de los entornos", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, entornos: [], origenDeTrabajo: "global" });
    await v.registrarEntorno({ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" });
    expect(d.escrituras).toEqual(["entorno:webstudio", "legado:webstudio"]);
    // Y queda registrado, así que el paso de entorno deja de faltar.
    expect(await v.pasosPendientes()).not.toContain("entorno");
  });

  it("un entorno con URL que no es HTTPS no se registra", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, entornos: [], origenDeTrabajo: "global" });
    await expect(v.registrarEntorno({ id: "malo", nombre: "Malo", url: "http://interno/mcp" })).rejects.toThrow(/HTTPS/);
    // `mcp.localhost.ejemplo.com` es la máquina de OTRO, no un loopback: la lista de hosts
    // exentos es cerrada justo para que «lo que parezca local» no cuele.
    await expect(
      v.registrarEntorno({ id: "casi", nombre: "Casi", url: "http://mcp.localhost.ejemplo.com/mcp" })
    ).rejects.toThrow(/HTTPS/);
    expect(d.escrituras).toEqual([]);
  });

  /**
   * El formulario del navegador pide SOLO la URL desde este cambio. Lo demás se deduce
   * aquí: un nombre tecleado a mano es un dato inventado que después hay que creerse en la
   * barra lateral, y un id «otro» sería la misma carpeta de workspace para todos los
   * on-premise del mundo.
   */
  describe("identidad del entorno: lo único que se teclea es la URL", () => {
    it("un «otro» saca id y nombre del host, y el id vale como segmento de ruta", async () => {
      const d = dobles();
      const v = crearVestibulo({ ...d, entornos: [], origenDeTrabajo: "global" });
      const { entorno } = await v.registrarEntorno({ id: "otro", nombre: "", url: "https://mcp.casa.local:8443/mcp" });
      // Los dos puntos del puerto no sobreviven: esto acaba siendo una carpeta, y en
      // Windows un «:» parte la ruta.
      expect(entorno.id).toBe("mcp.casa.local-8443");
      expect(entorno.nombre).toBe("mcp.casa.local:8443");
      expect(d.escrituras).toContain("entorno:mcp.casa.local-8443");
      // Y queda registrado con ESE id: quien pida sus proyectos lo va a buscar por él.
      expect(v.entornosRegistrados().map((e) => e.id)).toEqual(["mcp.casa.local-8443"]);
    });

    it("la URL de un oficial tecleada en el hueco de «otro» NO crea un entorno paralelo", async () => {
      // Dos entradas para el mismo servidor son dos carpetas de workspace y dos huecos de
      // OAuth para la misma cuenta.
      const d = dobles();
      const v = crearVestibulo({ ...d, entornos: [], origenDeTrabajo: "global" });
      const { entorno } = await v.registrarEntorno({
        id: "otro",
        nombre: "",
        url: "https://mcp.xonewebstudio.com/mcp/",
      });
      expect(entorno).toMatchObject({ id: "webstudio", nombre: "XOne WebStudio" });
    });

    /**
     * El nombre del host es verdad comprobable pero fea («mcp.casa.local»). La primera vez
     * que se habla de verdad con el servidor —`proyectosDe`, que hace OAuth e `initialize`—
     * llega su `serverInfo`, y solo entonces se puede poner el nombre bueno.
     */
    it("al listar proyectos, el nombre deducido se sustituye por el que dice el servidor", async () => {
      const d = dobles();
      const dichos: string[] = [];
      const v = crearVestibulo({
        ...d,
        entornos: [],
        origenDeTrabajo: "global",
        informar: (t) => dichos.push(t),
        proyectosDeEntorno: async () => ({
          proyectos: [{ id: "p1", nombre: "Tienda" }],
          servidor: { nombre: "CloudStudio de Acme" },
        }),
      });
      const { entorno } = await v.registrarEntorno({ id: "otro", nombre: "", url: "https://mcp.casa.local/mcp" });
      expect(entorno.nombre).toBe("mcp.casa.local");

      await v.proyectosDe(entorno.id);

      const registrado = v.entornosRegistrados()[0]!;
      expect(registrado.nombre).toBe("CloudStudio de Acme");
      // El id NO se toca: es un segmento de ruta y ya cuelga de él la copia local.
      expect(registrado.id).toBe("mcp.casa.local");
      expect(d.escrituras.filter((e) => e.startsWith("entorno:"))).toEqual([
        "entorno:mcp.casa.local",
        "entorno:mcp.casa.local",
      ]);
      expect(dichos.join("\n")).toMatch(/dice llamarse «CloudStudio de Acme»/);
    });

    it("un nombre que NO se dedujo no lo cambia un servidor remoto por su cuenta", async () => {
      const d = dobles();
      const v = crearVestibulo({
        ...d,
        entornos: [],
        origenDeTrabajo: "global",
        proyectosDeEntorno: async () => ({
          proyectos: [],
          servidor: { nombre: "Lo Que El Servidor Diga" },
        }),
      });
      // El oficial: su nombre lo pone xonecode, no el otro extremo del cable.
      const { entorno } = await v.registrarEntorno({
        id: "otro",
        nombre: "",
        url: "https://mcp.xonewebstudio.com/mcp",
      });
      await v.proyectosDe(entorno.id);
      expect(v.entornosRegistrados()[0]!.nombre).toBe("XOne WebStudio");
    });

    it("un servidor que no publica nombre no borra el que había", async () => {
      const d = dobles();
      const v = crearVestibulo({
        ...d,
        entornos: [],
        origenDeTrabajo: "global",
        proyectosDeEntorno: async () => ({ proyectos: [] }),
      });
      const { entorno } = await v.registrarEntorno({ id: "otro", nombre: "", url: "https://mcp.casa.local/mcp" });
      await v.proyectosDe(entorno.id);
      expect(v.entornosRegistrados()[0]!.nombre).toBe("mcp.casa.local");
    });

    it("un id y un nombre puestos por quien llama se respetan: otra piel puede traerlos", async () => {
      const d = dobles();
      const v = crearVestibulo({ ...d, entornos: [], origenDeTrabajo: "global" });
      const { entorno } = await v.registrarEntorno({ id: "casa", nombre: "La casa", url: "https://mcp.casa.local/mcp" });
      expect(entorno).toMatchObject({ id: "casa", nombre: "La casa" });
    });
  });

  /**
   * Medido contra el servidor real: `studio_open_project` abre por NOMBRE y rechaza el
   * identificador. Como el cable trae el id, la web pedía las ramas con
   * «5cd2327f_53f3_40b9…» y el servidor contestaba «no project is open» a todo — un bucle
   * sordo en el que el error hablaba de la tool y no del argumento equivocado.
   */
  it("las ramas se piden por NOMBRE aunque quien llama tenga el id", async () => {
    const pedidos: string[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      ramasDeProyecto: async (_entorno, proyecto) => {
        pedidos.push(proyecto);
        return ["master"];
      },
    });

    await v.ramasDe("webstudio", { id: "5cd2327f_53f3_40b9", nombre: "AppForTest" });
    // Y un nombre suelto sigue valiendo: es lo que pasa el alta de terminal.
    await v.ramasDe("webstudio", "OtroProyecto");

    expect(pedidos).toEqual(["AppForTest", "OtroProyecto"]);
  });

  it("los proyectos visibles se guardan CON el entorno, y ninguno es una elección", async () => {
    const d = dobles();
    const dichos: string[] = [];
    const v = crearVestibulo({ ...d, origenDeTrabajo: "global", informar: (t) => dichos.push(t) });
    await v.guardarProyectosVisibles("webstudio", ["p1", "p3"]);
    expect(v.entornosRegistrados()[0]!.proyectos).toEqual(["p1", "p3"]);
    expect(d.escrituras).toContain("entorno:webstudio");

    // Lista vacía = «ninguno», y se guarda como tal: no es lo mismo que no haber elegido,
    // que es lo que significa el campo AUSENTE.
    await v.guardarProyectosVisibles("webstudio", []);
    expect(v.entornosRegistrados()[0]!.proyectos).toEqual([]);
    expect(dichos.join("\n")).toMatch(/ninguno/);
  });

  it("un on-premise en loopback SÍ se registra: es la misma regla que aplica quien conecta", async () => {
    // Antes había dos criterios: el wizard del navegador aceptaba este loopback y este
    // fichero lo rechazaba, con dos mensajes claros que se contradecían. Ahora los tres
    // gates tiran de `cloudstudioMcp.ts#urlDeMcpAceptable`.
    const d = dobles();
    const v = crearVestibulo({ ...d, entornos: [], origenDeTrabajo: "global" });
    await v.registrarEntorno({ id: "local", nombre: "On-premise", url: "http://127.0.0.1:8080/mcp" });
    expect(d.escrituras).toContain("entorno:local");
  });

  /**
   * El aviso de turno es lo que apaga el compositor, saca el botón de parar y enciende el
   * borde vivo. Va en un `finally` a propósito: un turno que revienta o que se cancela
   * también TERMINA, y dejar el compositor apagado para siempre sería peor que no haberlo
   * apagado nunca.
   */
  it("avisa de que el turno empieza y de que acaba, también si el turno revienta", async () => {
    const avisos: boolean[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      correr: async (consola, estado, ejecutar) => {
        await ejecutar!("una petición", estado, consola).catch(() => undefined);
        return 0;
      },
      crearEjecutor: () => async () => {
        throw new Error("el turno revienta");
      },
    });
    v.alCambiarTurno((activo) => avisos.push(activo));
    const abierto = await v.abrirProyecto({ raiz: "/w/a" });
    await abierto.terminada;
    expect(avisos).toEqual([true, false]);
    await v.cerrar();
  });

  it("abrir un proyecto con otro abierto cierra el primero", async () => {
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
    const a = await v.abrirProyecto({ raiz: "/w/a" });
    const b = await v.abrirProyecto({ raiz: "/w/b" });
    expect(a.cerrada).toBe(true);
    expect(b.cerrada).toBe(false);
    expect(v.proyectoAbierto()).toBe(b);
    await v.cerrar();
  });

  it("el lazo anterior TERMINA antes de que arranque el siguiente, no solo se le pide que acabe", async () => {
    const s = sesionesEnMemoria();
    // La costura `correr` registra el orden de inicio y fin de cada lazo. Es lo único que
    // distingue «se esperó al retorno» de «se pidió el cierre y se siguió»: sin el `await`,
    // los dos `correrConsola` conviven un rato y comparten el ejecutor real, que es
    // exactamente lo que «una consola de proyecto a la vez» prohíbe.
    const traza: string[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      correr: async (consola, estado) => {
        traza.push(`inicio ${estado.raiz}`);
        for await (const _linea of consola.lineas) {
          // El lazo real consume líneas hasta el EOF; aquí basta con llegar a él.
        }
        // El EOF no devuelve al instante: `correrConsola` puede estar DENTRO de un turno
        // cuando llega, y no lo mira hasta que ese turno acaba. Sin esta espera el test no
        // distingue nada — el cierre resuelve la cola en el mismo microtask y el orden sale
        // bien incluso sin esperar al retorno (medido).
        await new Promise((r) => setTimeout(r, 5));
        traza.push(`fin ${estado.raiz}`);
        return 0;
      },
    });
    await v.abrirProyecto({ raiz: "/w/a" });
    await v.abrirProyecto({ raiz: "/w/b" });
    expect(traza).toEqual(["inicio /w/a", "fin /w/a", "inicio /w/b"]);
    await v.cerrar();
    expect(traza).toEqual(["inicio /w/a", "fin /w/a", "inicio /w/b", "fin /w/b"]);
  });

  it("cerrar la consola de proyecto ABORTA la sesión real: si no, un turno en vuelo la colgaría", async () => {
    const s = sesionesEnMemoria();
    let cerrada = false;
    // Un ejecutor que no resuelve NUNCA por su cuenta: solo el `cerrar()` de la sesión
    // real puede desbloquearlo. Es el turno largo del caso real, sin esperar minutos.
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: (alAbrirSesion) => {
        return async () => {
          await new Promise<void>((resuelto) => {
            alAbrirSesion({
              cerrar: () => {
                cerrada = true;
                resuelto();
              },
            });
          });
        };
      },
    });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
    proyecto.recibir({ clase: "prosa", texto: "haz algo largo" });
    // La consola arranca el turno en cuanto la línea entra en la cola.
    await new Promise((r) => setTimeout(r, 0));
    await proyecto.cerrar();
    expect(cerrada).toBe(true);
    expect(proyecto.cerrada).toBe(true);
  });

  it("cerrar DURANTE la construcción de la sesión real también aborta: el aviso llega tarde", async () => {
    const s = sesionesEnMemoria();
    let cerrada = false;
    // `crearEjecutorReal` avisa de la sesión DESPUÉS de `inspeccionar` y `abrirSesionReal`.
    // Este ejecutor reproduce esa ventana: el `cerrar()` del vestíbulo llega antes de que
    // `sesionReal` exista, así que solo la bandera de «cerrando» puede salvarlo.
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: (alAbrirSesion) => async () => {
        await new Promise<void>((r) => setTimeout(r, 5));
        await new Promise<void>((resuelto) => {
          alAbrirSesion({
            cerrar: () => {
              cerrada = true;
              resuelto();
            },
          });
        });
      },
    });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
    proyecto.recibir({ clase: "prosa", texto: "haz algo largo" });
    await new Promise((r) => setTimeout(r, 0));
    await proyecto.cerrar();
    expect(cerrada).toBe(true);
  });

  it("dos aperturas A LA VEZ siguen dejando una sola consola viva", async () => {
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
    // Sin serializar, las dos ven `abierto === undefined` en el `await` de cierre y las dos
    // arrancan su `correrConsola`: la primera se queda viva y sin nadie que la cierre.
    const [a, b] = await Promise.all([v.abrirProyecto({ raiz: "/w/a" }), v.abrirProyecto({ raiz: "/w/b" })]);
    expect(a.cerrada).toBe(true);
    expect(b.cerrada).toBe(false);
    expect(v.proyectoAbierto()).toBe(b);
    await v.cerrar();
  });

  it("una sesión reabierta es histórica hasta el PRIMER turno nuevo", async () => {
    const s = sesionesEnMemoria();
    s.jsonl.set("/w/a|vieja", [{ tipo: "usuario", texto: "lo de ayer" }]);
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: () => async () => {},
    });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a", sesion: "vieja" });
    expect(proyecto.historica).toBe(true);
    // Lo releído se enseña, pero no se vuelve a escribir.
    expect(proyecto.actos()).toHaveLength(1);

    proyecto.recibir({ clase: "prosa", texto: "sigue por aquí" });
    await new Promise((r) => setTimeout(r, 0));
    expect(proyecto.historica).toBe(false);
    await proyecto.cerrar();
    // El acto del usuario se volcó a la MISMA sesión, sin duplicar lo releído.
    expect(s.jsonl.get("/w/a|vieja")).toEqual([
      { tipo: "usuario", texto: "lo de ayer" },
      { tipo: "usuario", texto: "sigue por aquí" },
    ]);
  });

  it("un proyecto abierto y cerrado sin decir nada no deja una sesión vacía", async () => {
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
    await proyecto.cerrar();
    expect(s.jsonl.size).toBe(0);
    expect(proyecto.sesion).toBeUndefined();
  });

  it("un turno con el ejecutor de PEGA no deja sesión: un transcript de pega no es historia del proyecto", async () => {
    // Sin `crearEjecutor` (como sin `--guion` NO se puede, `arranque.ts#banderaDeEjecutor`
    // lo exige) el vestíbulo cae en `ejecutarTurnoGuionizado`, que es SIEMPRE de pega — la
    // marca vive en la función (`cli/consola.ts`), no aquí. Sin la guarda de
    // `vestibulo.ts#ejecutarTurno`, este turno habría escrito su respuesta guionizada al
    // `.jsonl` del proyecto, indistinguible mañana de una respuesta real.
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
    proyecto.recibir({ clase: "prosa", texto: "hola" });
    await new Promise((r) => setTimeout(r, 0));
    await proyecto.cerrar();
    expect(s.jsonl.size).toBe(0);
    expect(proyecto.sesion).toBeUndefined();
  });

  it("las dos consolas reciben el guardarModeloGlobal REAL: sin inyectarlo, consolaWeb lanza", async () => {
    const d = dobles();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...d, origenDeTrabajo: "global", sesiones: s.puerto });
    expect(v.consola.consola.guardarModeloGlobal("trabajo", "anthropic/claude-x")).toEqual({
      ruta: "/casa/.xonecode/config.json",
      id: "anthropic/claude-x",
    });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
    expect(() => proyecto.consola.consola.guardarModeloGlobal("trabajo", "anthropic/claude-x")).not.toThrow();
    expect(d.escrituras).toEqual(["modelo:trabajo", "modelo:trabajo"]);
    await v.cerrar();
  });

  it("completar el proyecto escribe el alta y baja la copia al workspace del entorno", async () => {
    const d = dobles();
    const dichos: string[] = [];
    const v = crearVestibulo({ ...d, origenDeTrabajo: "global", informar: (t) => dichos.push(t) });
    const { raiz } = await v.completarProyecto({ entorno: "webstudio", proyecto: "MinitMT", rama: "master" });
    expect(raiz).toBe("/w/webstudio/workspace/MinitMT");
    // El alta se escribe ANTES de bajar: el consejo «/sync bajar» de un fallo posterior
    // solo es cierto si el proyecto y la rama ya están en disco.
    expect(d.escrituras).toEqual(["config:/w/webstudio/workspace/MinitMT", "descarga"]);
  });

  it("un fallo de descarga NO crea .xonecode a medias y dice cómo reintentar", async () => {
    const d = dobles();
    const dichos: string[] = [];
    const v = crearVestibulo({
      ...d,
      origenDeTrabajo: "global",
      informar: (t) => dichos.push(t),
      descargar: async () => {
        throw new Error("el ZIP vino vacío");
      },
    });
    await expect(v.completarProyecto({ entorno: "webstudio", proyecto: "MinitMT", rama: "master" })).rejects.toThrow();
    expect(dichos.join("\n")).toMatch(/\/sync bajar/);
  });

  it("no se puede completar un proyecto de un entorno que no está registrado", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, origenDeTrabajo: "global" });
    await expect(
      v.completarProyecto({ entorno: "on-prem", proyecto: "MinitMT", rama: "master" })
    ).rejects.toThrow(/no está registrado/);
    expect(d.escrituras).toEqual([]);
  });
});

describe("el config.json que escribe el alta", () => {
  it("gana «entorno» y CONSERVA cloudstudio.url, que es lo que lee la sincronización", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-vestibulo-"));
    const { ruta } = escribirProyectoEnDisco(raiz, {
      entorno: "webstudio",
      url: "https://mcp.xonewebstudio.com/mcp",
      scopes: ["mcp.read"],
      proyecto: { id: "42", nombre: "MinitMT" },
      rama: "master",
    });
    const bruto: unknown = JSON.parse(readFileSync(ruta, "utf8"));
    const { config, avisos } = validar(bruto, ruta, "proyecto");
    expect(config.entorno).toBe("webstudio");
    expect(config.cloudstudio?.url).toBe("https://mcp.xonewebstudio.com/mcp");
    expect(config.cloudstudio?.proyecto).toEqual({ id: "42", nombre: "MinitMT" });
    expect(config.cloudstudio?.rama).toBe("master");
    expect(config.modo).toBe("cloud");
    // Y «entorno» no es un campo desconocido: si lo fuera, /config lo cantaría en cada arranque.
    expect(avisos).toEqual([]);
  });
});
