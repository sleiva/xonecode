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
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearVestibulo, ENTORNOS_OFICIALES, escribirProyectoEnDisco } from "./vestibulo.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";
import type { Acto } from "../../core/actos.js";
import type { DispositivoElegido } from "./sesiones.js";
import type { Entorno } from "../../core/settings.js";
import { validar } from "../../core/config.js";
import type { Consola, EjecutorDeTurno } from "../../cli/consola.js";

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
  /** El dispositivo preferido, por clave `raiz|id` — como lo guarda el índice de verdad. */
  const dispositivos = new Map<string, DispositivoElegido | undefined>();
  /** Con qué tarea se dio de alta cada sesión, como lo guarda el índice de verdad. */
  const tareas = new Map<string, string | undefined>();
  return {
    jsonl,
    dispositivos,
    tareas,
    puerto: {
      listar: (raiz: string) =>
        [...jsonl.keys()]
          .filter((clave) => clave.startsWith(`${raiz}|`))
          .map((clave) => ({ id: clave.slice(raiz.length + 1), titulo: "sesión" })),
      // El id ENTRA, desde que es también el `thread_id` del grafo: quien abre la consola
      // lo decide al abrir. Sin id se genera uno corto, que es lo que usan los tests que
      // solo necesitan una sesión guardada.
      crear: (raiz: string, id: string = `s${jsonl.size + 1}`, tarea?: string) => {
        jsonl.set(`${raiz}|${id}`, []);
        tareas.set(`${raiz}|${id}`, tarea);
        return id;
      },
      anotar: (raiz: string, id: string, acto: Acto) => {
        const clave = `${raiz}|${id}`;
        jsonl.set(clave, [...(jsonl.get(clave) ?? []), acto]);
      },
      reabrir: (raiz: string, id: string) => {
        const dispositivo = dispositivos.get(`${raiz}|${id}`);
        return {
          id,
          actos: [...(jsonl.get(`${raiz}|${id}`) ?? [])],
          historica: true,
          ...(dispositivo === undefined ? {} : { dispositivo }),
        };
      },
      borrar: (raiz: string, id: string) => jsonl.delete(`${raiz}|${id}`),
      renombrar: (raiz: string, id: string) => jsonl.has(`${raiz}|${id}`),
      elegirDispositivo: (raiz: string, id: string, dispositivo: DispositivoElegido | undefined) => {
        // Como el índice real: sin entrada no hay nada que anotar, y se dice con `false`.
        if (!jsonl.has(`${raiz}|${id}`)) return false;
        dispositivos.set(`${raiz}|${id}`, dispositivo);
        return true;
      },
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

  /**
   * La trampa del ORDEN, y es la que hace falta un test: `cerrar()` llama a `volcar()`, que
   * anota los actos pendientes — y anotar RESUCITA la entrada del índice recién borrada. Si
   * se borrara antes de cerrar, la sesión reaparecería en la barra al siguiente refresco,
   * como si el botón no hubiera hecho nada.
   */
  it("borrar la sesión ABIERTA la cierra primero, y no reaparece al volcar", async () => {
    const s = sesionesEnMemoria();
    const olvidadas: string[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      olvidarMarcaDeSesion: async (_raiz, id) => {
        olvidadas.push(id);
      },
    });
    // La sesión nace al volcar el primer acto, así que se crea a mano y se REABRE: es el
    // camino por el que una sesión guardada llega a estar abierta.
    const id = s.puerto.crear("/w/a");
    s.puerto.anotar("/w/a", id, { tipo: "usuario", texto: "hola" });
    const abierta = await v.abrirProyecto({ raiz: "/w/a", sesion: id });
    expect(abierta.sesion).toBe(id);

    const resultado = await v.borrarSesion("/w/a", id);

    expect(resultado).toEqual({ borrada: true, cerroLaAbierta: true });
    expect(abierta.cerrada).toBe(true);
    expect(v.proyectoAbierto()).toBeUndefined();
    expect(v.sesionesDe("/w/a")).toEqual([]);
    // La ref de git se va con la sesión: si no, mantiene vivo para siempre un árbol que ya
    // no mira nadie (`agent/sesionGit.ts#olvidarSesion`).
    expect(olvidadas).toEqual([id]);
    await v.cerrar();
  });

  describe("el dispositivo preferido de la sesión", () => {
    const GALAXY = { id: "R58", nombre: "Galaxy S21", plataforma: "android" as const, clase: "fisico" as const };

    it("una sesión REABIERTA vuelve con el suyo puesto", async () => {
      const s = sesionesEnMemoria();
      const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
      const id = s.puerto.crear("/w/a");
      s.puerto.elegirDispositivo("/w/a", id, GALAXY);
      const abierta = await v.abrirProyecto({ raiz: "/w/a", sesion: id });
      expect(abierta.dispositivo).toEqual(GALAXY);
      await v.cerrar();
    });

    it("elegirlo con la sesión ya creada lo escribe en el acto", async () => {
      const s = sesionesEnMemoria();
      const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
      const id = s.puerto.crear("/w/a");
      const abierta = await v.abrirProyecto({ raiz: "/w/a", sesion: id });
      abierta.elegirDispositivo(GALAXY);
      expect(abierta.dispositivo).toEqual(GALAXY);
      expect(s.dispositivos.get(`/w/a|${id}`)).toEqual(GALAXY);
      await v.cerrar();
    });

    it("elegido ANTES de que la sesión tenga id, se anota en cuanto la hay", async () => {
      // El id nace al volcar el primer acto. Sin esta espera en memoria, elegir dispositivo
      // nada más abrir y hablar después perdía la elección al reabrir: no había entrada en
      // el índice donde escribirla, y nadie volvía a intentarlo.
      const s = sesionesEnMemoria();
      // El turno avisa de que corrió: esperar a un `setTimeout(0)` es una carrera —bajo
      // carga el EOF de `cerrar()` puede llegar antes de que el lazo saque la línea de la
      // cola, y entonces no hay acto, ni sesión, ni nada que comprobar. Medido: falló una
      // vez de cada varias.
      let turnoCorrido: () => void;
      const corrio = new Promise<void>((r) => {
        turnoCorrido = r;
      });
      const v = crearVestibulo({
        ...dobles(),
        origenDeTrabajo: "global",
        sesiones: s.puerto,
        crearEjecutor: () => async (_peticion, _estado, consola) => {
          consola.escribir("hecho");
          turnoCorrido();
        },
      });
      const abierta = await v.abrirProyecto({ raiz: "/w/a" });
      expect(abierta.sesion).toBeUndefined();
      abierta.elegirDispositivo(GALAXY);
      // Todavía no hay dónde escribirlo, pero la consola ya lo sabe.
      expect(abierta.dispositivo).toEqual(GALAXY);
      expect([...s.dispositivos.values()]).toEqual([]);

      abierta.recibir({ clase: "prosa", texto: "hola" });
      await corrio;
      await abierta.cerrar();

      const id = abierta.sesion!;
      expect(id).toBeDefined();
      expect(s.dispositivos.get(`/w/a|${id}`)).toEqual(GALAXY);
      await v.cerrar();
    });

    it("quitarlo lo quita también del índice", async () => {
      const s = sesionesEnMemoria();
      const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
      const id = s.puerto.crear("/w/a");
      s.puerto.elegirDispositivo("/w/a", id, GALAXY);
      const abierta = await v.abrirProyecto({ raiz: "/w/a", sesion: id });
      abierta.elegirDispositivo(undefined);
      expect(abierta.dispositivo).toBeUndefined();
      expect(s.dispositivos.get(`/w/a|${id}`)).toBeUndefined();
      await v.cerrar();
    });
  });

  it("borrar OTRA sesión no cierra el proyecto que estás mirando", async () => {
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
    const vieja = s.puerto.crear("/w/a");
    s.puerto.anotar("/w/a", vieja, { tipo: "usuario", texto: "de antes" });
    const otra = s.puerto.crear("/w/a");
    s.puerto.anotar("/w/a", otra, { tipo: "usuario", texto: "la abierta" });
    const abierta = await v.abrirProyecto({ raiz: "/w/a", sesion: otra });

    const resultado = await v.borrarSesion("/w/a", vieja);

    expect(resultado).toEqual({ borrada: true, cerroLaAbierta: false });
    expect(abierta.cerrada).toBe(false);
    expect(v.proyectoAbierto()).toBe(abierta);
    expect(v.sesionesDe("/w/a").map((x) => x.id)).toEqual([otra]);
    await v.cerrar();
  });

  /**
   * VARIAS consolas de persona vivas: cambiar de sesión ya no mata el turno que corría.
   *
   * Es el encargo entero de este cambio, y el test lo mide por donde se nota: la consola de
   * antes sigue sin cerrarse, su turno sigue en vuelo, y las dos raíces salen en
   * `proyectosAbiertos()` — que es la lista de la que cuelgan la guarda de «gana la persona»
   * y la marca de la barra.
   *
   * La costura es un turno que se queda esperando: sin eso no hay «turno en vuelo» que
   * medir, y con un ejecutor que devuelve en el acto el caso no existe.
   */
  it("cambiar de proyecto NO mata el turno que estaba corriendo en el anterior", async () => {
    const s = sesionesEnMemoria();
    let soltarElTurno: (() => void) | undefined;
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: () => async () => {
        await new Promise<void>((resuelto) => {
          soltarElTurno = resuelto;
        });
      },
    });
    const a = await v.abrirProyecto({ raiz: "/w/a" });
    // Sin esperarlo: es lo que deja el turno EN VUELO mientras se abre el otro proyecto.
    const turno = a.ejecutarTurno("arregla el login", a.estadoDeSesion, a.consola.consola);
    expect(a.turnoEnVuelo).toBe(true);
    const b = await v.abrirProyecto({ raiz: "/w/b" });
    expect(a.cerrada).toBe(false);
    expect(a.turnoEnVuelo).toBe(true);
    expect(v.proyectoAbierto()).toBe(b);
    expect(v.proyectosAbiertos().map((c) => c.raiz).sort()).toEqual(["/w/a", "/w/b"]);
    soltarElTurno!();
    await turno;
    await v.cerrar();
  });

  /**
   * Y la contrapartida, que es lo que hace que esto sea acotado en vez de una fuga: la
   * consola de segundo plano se cierra ELLA cuando su turno acaba. Nada se pierde —el hilo
   * lo reanuda el checkpointer al reabrir la sesión— y lo que se evita es un `correrConsola`
   * por proyecto visitado, vivo para siempre.
   */
  it("la consola de segundo plano se cierra cuando su turno acaba", async () => {
    const s = sesionesEnMemoria();
    let soltarElTurno: (() => void) | undefined;
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: () => async () => {
        await new Promise<void>((resuelto) => {
          soltarElTurno = resuelto;
        });
      },
    });
    const a = await v.abrirProyecto({ raiz: "/w/a" });
    const turno = a.ejecutarTurno("arregla el login", a.estadoDeSesion, a.consola.consola);
    await v.abrirProyecto({ raiz: "/w/b" });
    soltarElTurno!();
    await turno;
    // El cierre va por la COLA del vestíbulo, así que se espera por ella: cualquier
    // operación encolada detrás resuelve después.
    await v.abrirProyecto({ raiz: "/w/b" });
    expect(a.cerrada).toBe(true);
    expect(v.proyectosAbiertos().map((c) => c.raiz)).toEqual(["/w/b"]);
    await v.cerrar();
  });

  /**
   * DOS sesiones del MISMO proyecto no pueden convivir, y con una trabajando no se cambia:
   * se DECLINA con motivo.
   *
   * No es una limitación del mapa: es la copia de trabajo. Dos conversaciones escribiendo
   * los mismos ficheros no tienen aislamiento de ninguna clase —el mismo motivo por el que
   * una tarea no arranca donde hay una persona— y cerrar la que trabaja para abrir la otra
   * sería la interrupción que este cambio viene a quitar.
   */
  it("otra sesión del MISMO proyecto, con la que hay trabajando, se declina con motivo", async () => {
    const s = sesionesEnMemoria();
    s.puerto.crear("/w/a", "vieja");
    let soltarElTurno: (() => void) | undefined;
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: () => async () => {
        await new Promise<void>((resuelto) => {
          soltarElTurno = resuelto;
        });
      },
    });
    const a = await v.abrirProyecto({ raiz: "/w/a" });
    const turno = a.ejecutarTurno("arregla el login", a.estadoDeSesion, a.consola.consola);
    await expect(v.abrirProyecto({ raiz: "/w/a", sesion: "vieja" })).rejects.toThrow(/turno en marcha/u);
    expect(a.cerrada).toBe(false);
    soltarElTurno!();
    await turno;
    await v.cerrar();
  });

  /**
   * Abrir el PROYECTO —sin nombrar sesión— que está trabajando lleva a la consola que
   * trabaja, no a una nueva y no a un rechazo.
   *
   * Es la única forma de llegar a esa conversación mientras no tenga fila en la barra: su id
   * nace al volcar el primer acto, o sea al final del turno. Medido en la pantalla del
   * usuario: arrancó una sesión, se fue a otra cosa, pulsó el nombre del proyecto para ver
   * qué hacía y se llevó el rechazo cinco veces seguidas.
   */
  it("abrir el proyecto que trabaja lleva a SU consola, aunque su sesión no tenga fila", async () => {
    const s = sesionesEnMemoria();
    let soltarElTurno: (() => void) | undefined;
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: () => async () => {
        await new Promise<void>((resuelto) => {
          soltarElTurno = resuelto;
        });
      },
    });
    // Sin `sesion`: una conversación nueva, que todavía no está en el índice.
    const a = await v.abrirProyecto({ raiz: "/w/a" });
    expect(a.sesion).toBeUndefined();
    const turno = a.ejecutarTurno("arregla el login", a.estadoDeSesion, a.consola.consola);
    await v.abrirProyecto({ raiz: "/w/b" });
    const otraVez = await v.abrirProyecto({ raiz: "/w/a" });
    expect(otraVez).toBe(a);
    expect(a.cerrada).toBe(false);
    expect(v.proyectoAbierto()).toBe(a);
    soltarElTurno!();
    await turno;
    await v.cerrar();
  });

  /** Y con la de ese proyecto OCIOSA sí se cambia de sesión: es lo de siempre. */
  it("otra sesión del mismo proyecto, con la de ahí ociosa, cierra y abre", async () => {
    const s = sesionesEnMemoria();
    s.puerto.crear("/w/a", "vieja");
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
    const a = await v.abrirProyecto({ raiz: "/w/a" });
    const b = await v.abrirProyecto({ raiz: "/w/a", sesion: "vieja" });
    expect(a.cerrada).toBe(true);
    expect(b.idDeHilo).toBe("vieja");
    expect(v.proyectosAbiertos()).toEqual([b]);
    await v.cerrar();
  });

  /**
   * Volver a la MISMA sesión que ya está abierta solo muda el foco: no se cierra ni se
   * reabre nada. Sin esto, volver a mirar la conversación que está trabajando la habría
   * matado — el peor caso posible, porque es justo lo que uno hace cuando quiere ver cómo va.
   */
  it("volver a la sesión que sigue trabajando devuelve LA MISMA consola, sin reabrir nada", async () => {
    const s = sesionesEnMemoria();
    s.puerto.crear("/w/a", "esa");
    let soltarElTurno: (() => void) | undefined;
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: () => async () => {
        await new Promise<void>((resuelto) => {
          soltarElTurno = resuelto;
        });
      },
    });
    const a = await v.abrirProyecto({ raiz: "/w/a", sesion: "esa" });
    const turno = a.ejecutarTurno("arregla el login", a.estadoDeSesion, a.consola.consola);
    await v.abrirProyecto({ raiz: "/w/b" });
    const otraVez = await v.abrirProyecto({ raiz: "/w/a", sesion: "esa" });
    expect(otraVez).toBe(a);
    expect(a.cerrada).toBe(false);
    expect(a.turnoEnVuelo).toBe(true);
    expect(v.proyectoAbierto()).toBe(a);
    soltarElTurno!();
    await turno;
    await v.cerrar();
  });

  /**
   * Mudarse de consola SUELTA sus sumideros, no la desconecta.
   *
   * `desconectar` significa «se ha ido el humano»: despierta con cadena vacía a quien
   * esperara y da por rechazada la aprobación que hubiera delante. Al cambiar de sesión eso
   * es falso —la persona sigue ahí, mirando otra cosa— y aplicarlo habría rechazado la
   * escritura de un turno de segundo plano sin que nadie decidiera nada. Se mide por
   * `eof()`, que es de donde cuelgan las cuatro esperas de `consolaWeb.ts`.
   */
  it("soltar el cable de una consola no la deja sin humano", async () => {
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
    const a = await v.abrirProyecto({ raiz: "/w/a" });
    a.conectar(() => {});
    expect(a.consola.consola.eof?.()).toBe(false);
    a.soltar();
    expect(a.consola.consola.eof?.()).toBe(false);
    a.desconectar();
    expect(a.consola.consola.eof?.()).toBe(true);
    await v.cerrar();
  });

  /**
   * La sesión entra en el índice con el MENSAJE del usuario, no cuando el asistente
   * termina de contestar.
   *
   * Lo dijo el usuario mirando la pantalla: la conversación no aparecía en la barra hasta
   * que el turno acababa —minutos— y hasta entonces no había fila que marcar, ni que
   * enseñar trabajando, ni que reabrir. La entrada la creaba `volcar()`, que corre en la
   * frontera del turno.
   */
  it("una prosa del usuario da de alta la sesión en el ACTO, con su título", async () => {
    const s = sesionesEnMemoria();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      // Un ejecutor REAL (no el doble): `volcar` no persiste nada de un agente de pega, así
      // que con el guionizado este test pasaría por vacío.
      crearEjecutor: () => async () => {},
    });
    const a = await v.abrirProyecto({ raiz: "/w/a" });
    // Abrir NO da de alta nada: esa pereza sigue igual, y es la que evita una sesión vacía
    // en la barra cada vez que alguien mira un proyecto y se va.
    expect(a.sesion).toBeUndefined();
    expect(v.sesionesDe("/w/a")).toEqual([]);

    a.recibir({ clase: "prosa", texto: "arregla el login" });
    // En el acto, sin esperar al turno: hay fila, y con el id de la sesión.
    expect(a.sesion).toBe(a.idDeHilo);
    expect(v.sesionesDe("/w/a").map((x) => x.id)).toEqual([a.idDeHilo]);
    // Y el acto del usuario ya está en su `.jsonl`: es de donde sale el título de la fila,
    // y nunca muta, que es lo que hace seguro volcarlo suelto.
    expect(s.jsonl.get(`/w/a|${a.idDeHilo}`)).toEqual([{ tipo: "usuario", texto: "arregla el login" }]);

    await v.cerrar();
  });

  /**
   * Y a mitad de turno NO se vuelca: el último acto de la piel todavía muta (el cierre de
   * una racha de tools sustituye a su apertura dentro del mismo acto) y el `.jsonl` solo
   * sabe anexar, así que guardaría las dos líneas. No hace falta: la entrada ya la creó la
   * prosa que arrancó ese turno.
   */
  it("una prosa que llega a MITAD de turno no vuelca nada", async () => {
    const s = sesionesEnMemoria();
    /** Todos los turnos esperan, y se sueltan todos: el segundo lo arranca el lazo con la
     *  prosa que este test manda, y sin soltarlo `cerrar()` se quedaría esperándolo. */
    const esperando: (() => void)[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: () => async () => {
        await new Promise<void>((resuelto) => esperando.push(resuelto));
      },
    });
    const a = await v.abrirProyecto({ raiz: "/w/a" });
    const turno = a.ejecutarTurno("el primero", a.estadoDeSesion, a.consola.consola);
    expect(a.turnoEnVuelo).toBe(true);
    const antes = s.jsonl.get(`/w/a|${a.idDeHilo}`)?.length ?? 0;
    a.recibir({ clase: "prosa", texto: "y esto también" });
    expect(s.jsonl.get(`/w/a|${a.idDeHilo}`)?.length ?? 0).toBe(antes);
    for (const soltar of esperando) soltar();
    await turno;
    // El lazo arranca el turno de la prosa en cuanto este devuelve: se suelta también.
    await Promise.resolve();
    for (const soltar of esperando) soltar();
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

  it("con memoria del hilo, reabrir NO es histórico: la conversación continúa de verdad", async () => {
    // El `thread_id` es el id de la sesión (`agent/checkpointer.ts`), así que se puede
    // PREGUNTAR si queda checkpoint en vez de dar por hecho que reabrir es releer. Es lo
    // que convierte el aviso en un hecho comprobado.
    const s = sesionesEnMemoria();
    s.jsonl.set("/w/a|vieja", [{ tipo: "usuario", texto: "lo de ayer" }]);
    const preguntados: string[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      hayMemoriaDeHilo: async (_raiz, hilo) => {
        preguntados.push(hilo);
        return true;
      },
    });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a", sesion: "vieja" });
    expect(preguntados).toEqual(["vieja"]);
    expect(proyecto.historica).toBe(false);
    // Y el hilo del grafo ES el id de la sesión: sin esa igualdad no hay nada que reanudar.
    expect(proyecto.estadoDeSesion.hilo).toBe("vieja");
    await proyecto.cerrar();
  });

  it("sin memoria del hilo sigue siendo histórica: no se promete un recuerdo que no está", async () => {
    const s = sesionesEnMemoria();
    s.jsonl.set("/w/a|vieja", [{ tipo: "usuario", texto: "lo de ayer" }]);
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      hayMemoriaDeHilo: async () => false,
    });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a", sesion: "vieja" });
    expect(proyecto.historica).toBe(true);
    await proyecto.cerrar();
  });

  it("el id de la sesión se decide al ABRIR, pero el índice sigue siendo perezoso", async () => {
    // El hilo tiene que existir antes del primer turno; la ENTRADA del índice no, o cada
    // proyecto que alguien abre y deja dejaría una sesión vacía en la barra.
    const s = sesionesEnMemoria();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: () => async () => {},
    });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
    const hilo = proyecto.estadoDeSesion.hilo;
    expect(hilo).toMatch(/^[0-9a-f-]{36}$/);
    // Todavía no está en el índice, así que hacia fuera no hay sesión que marcar.
    expect(proyecto.sesion).toBeUndefined();
    expect(s.puerto.listar("/w/a")).toHaveLength(0);

    proyecto.recibir({ clase: "prosa", texto: "hola" });
    await new Promise((r) => setTimeout(r, 0));
    await proyecto.cerrar();
    // Y al anotarse, la entrada lleva EL MISMO id que el hilo: es lo que se reanuda.
    expect(proyecto.sesion).toBe(hilo);
    expect(s.puerto.listar("/w/a").map((e) => e.id)).toEqual([hilo]);
  });

  it("borrar una sesión se lleva también su memoria: un checkpoint huérfano es un secreto en disco", async () => {
    const s = sesionesEnMemoria();
    const olvidados: string[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      olvidarMemoriaDeHilo: async (_raiz, hilo) => {
        olvidados.push(hilo);
      },
    });
    const id = s.puerto.crear("/w/a");
    await v.borrarSesion("/w/a", id);
    expect(olvidados).toEqual([id]);
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

/**
 * La SEGUNDA puerta: abrir un proyecto para una tarea de fondo.
 *
 * El punto de riesgo declarado del plan es que esta apertura divergiera de la normal: una
 * tarea correría entonces con menos barreras que una persona. De ahí que estos tests no
 * comprueben «devuelve algo» sino DOS propiedades: que el cable no se mueve (ni el
 * proyecto abierto, ni el aviso de turno, ni el de modelo) y que las dos puertas pasan por
 * las MISMAS costuras —la del ejecutor real incluida, que es de donde cuelga el backend con
 * las vistas aplanadas retiradas y la guarda de artefactos.
 */
describe("abrirParaTarea — la segunda puerta", () => {
  /** Un proyecto de verdad en disco: la puerta de tareas exige `.xonecode/config.json`. */
  function proyectoEnDisco(base: string, nombre: string): string {
    const raiz = join(base, "webstudio", nombre);
    mkdirSync(join(raiz, ".xonecode"), { recursive: true });
    writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
    return raiz;
  }

  /** Un temporal que se borra al terminar el test que lo pidió. */
  function baseTemporal(): string {
    return mkdtempSync(join(tmpdir(), "xonecode-tareas-vest-"));
  }

  /**
   * Una `Consola` AJENA a la consola de proyecto: es la forma que tendrá la del corredor
   * (`consolaDeTarea`, tarea 4). Lo mínimo del contrato y nada más.
   */
  function consolaAjena(): Consola {
    return {
      lineas: (async function* () {})(),
      escribir: () => {},
      preguntar: async () => "",
      interactivo: false,
      leerSecreto: async () => "",
      catalogoModelos: new CatalogoModelosEnMemoria(),
      guardarModeloGlobal: (_papel, id) => ({ ruta: "/casa/.xonecode/config.json", id }),
    };
  }

  it("NO mueve el proyecto abierto del cable, y no cierra el que estaba", async () => {
    // Si el corredor reusara `abrirProyecto`, cada tarea que arrancara le movería la vista
    // al navegador de quien esté trabajando: `abrirDeVerdad` CIERRA lo abierto y se pone en
    // su sitio, y `arranque.ts#adjuntar` muda el sumidero a la consola que devuelve
    // `proyectoAbierto()`.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
    });
    const raizA = proyectoEnDisco(base, "A");
    const raizB = proyectoEnDisco(base, "B");

    const abierta = await v.abrirProyecto({ raiz: raizA });
    expect(v.proyectoAbierto()).toBe(abierta);

    const deTarea = await v.abrirParaTarea(raizB);
    expect(deTarea.raiz).toBe(raizB);
    // Lo que importa: el cable sigue donde estaba, y sigue VIVO.
    expect(v.proyectoAbierto()).toBe(abierta);
    expect(abierta.cerrada).toBe(false);

    await deTarea.cerrar();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("un turno de tarea no toca el cable: ni el aviso de turno ni el de modelo", async () => {
    // Es la razón de que el envoltorio esté PARTIDO en dos. `escuchaDeTurno` es lo que
    // apaga el compositor del navegador y saca el botón de parar (`arranque.ts`), y
    // `escuchaDeEstado` reemite el estado de modelos: una tarea de fondo no puede encender
    // ni apagar nada en la pantalla de nadie.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const turnos: boolean[] = [];
    let estados = 0;
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: () => async (_peticion, _estado, consola) => {
        consola.escribir("hecho\n");
      },
      correr: async () => 0,
    });
    v.alCambiarTurno((activo) => turnos.push(activo));
    v.alCambiarEstadoDeSesion(() => estados++);

    const deTarea = await v.abrirParaTarea(proyectoEnDisco(base, "A"));
    await deTarea.ejecutarTurno("arregla el login", deTarea.estadoDeSesion, consolaAjena());
    expect(turnos).toEqual([]);
    deTarea.consola.consola.alEstado?.({ ...deTarea.estadoDeSesion, hilo: "otro" });
    expect(estados).toBe(0);

    // Y por la puerta de siempre SÍ se avisa: si no, este test pasaría con las dos mudas.
    const humana = await v.abrirProyecto({ raiz: proyectoEnDisco(base, "B") });
    await humana.ejecutarTurno("arregla el login", humana.estadoDeSesion, consolaAjena());
    expect(turnos).toEqual([true, false]);
    humana.consola.consola.alEstado?.({ ...humana.estadoDeSesion, hilo: "otro" });
    expect(estados).toBe(1);

    await deTarea.cerrar();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("dos tareas de proyectos distintos pueden estar abiertas a la vez", async () => {
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
    });
    const raices = ["A", "B"].map((n) => proyectoEnDisco(base, n));
    const consolas = await Promise.all(raices.map((r) => v.abrirParaTarea(r)));
    expect(consolas.map((c) => c.raiz)).toEqual(raices);
    // Cada una con su hilo: son sesiones distintas.
    expect(consolas[0]!.idDeHilo).not.toBe(consolas[1]!.idDeHilo);
    // Y las dos vivas: la segunda no se llevó por delante a la primera.
    expect(consolas.map((c) => c.cerrada)).toEqual([false, false]);
    // Ninguna es «el proyecto abierto»: nadie las está mirando.
    expect(v.proyectoAbierto()).toBeUndefined();
    for (const c of consolas) await c.cerrar();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("el `ejecutarTurno` que se expone es el MISMO que corre el lazo, en las dos puertas", async () => {
    // Sin este aserto, el campo podría ser un segundo envoltorio: el lazo correría uno y
    // quien abre por la segunda puerta otro, y las dos versiones divergirían en la primera
    // corrección que solo tocara una.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const recibidos = new Map<string, EjecutorDeTurno | undefined>();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      correr: async (_consola, estado, ejecutar) => {
        recibidos.set(estado.raiz, ejecutar);
        return 0;
      },
    });
    const raizA = proyectoEnDisco(base, "A");
    const raizB = proyectoEnDisco(base, "B");
    const humana = await v.abrirProyecto({ raiz: raizA });
    const deTarea = await v.abrirParaTarea(raizB);

    expect(recibidos.get(raizA)).toBe(humana.ejecutarTurno);
    expect(recibidos.get(raizB)).toBe(deTarea.ejecutarTurno);

    await deTarea.cerrar();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  /**
   * El HOP de los adjuntos por la puerta de las TAREAS.
   *
   * La carpeta la conoce el corredor —es el único que sabe de qué tarea se trata— y tiene
   * que llegar hasta `crearEjecutor`, que es de donde cuelga el backend del agente. El
   * camino entero (`abrirParaTarea` → `construirConsolaDeProyecto` → `crearEjecutor` →
   * `crearEjecutorReal` → `abrirSesionReal` → `construirAgente` → `backendDeAgente`) tiene
   * un test por salto a propósito: es la clase de cableado que en este plan ha dejado cuatro
   * veces una regla sin montar con todo en verde, porque el eslabón de producción vivía
   * donde todos los tests doblan.
   */
  it("la puerta de tareas le pasa la carpeta de adjuntos a `crearEjecutor`", async () => {
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const extras: unknown[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: (_alAbrir, opciones) => {
        extras.push(opciones);
        return async () => {};
      },
      correr: async () => 0,
    });
    const raiz = proyectoEnDisco(base, "A");
    const deTarea = await v.abrirParaTarea(raiz, undefined, "/casa/.xonecode/tareas/t1/adjuntos");
    expect(extras).toEqual([{ adjuntos: "/casa/.xonecode/tareas/t1/adjuntos" }]);
    await deTarea.cerrar();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("y la puerta de las PERSONAS no monta ninguna: los adjuntos son de una tarea", async () => {
    // Sin esto, una consola de persona podría acabar con `/adjuntos/` montada apuntando a
    // la carpeta de la última tarea que corrió — un fichero de otra conversación dentro de
    // la vista del agente.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const extras: unknown[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: (_alAbrir, opciones) => {
        extras.push(opciones);
        return async () => {};
      },
      correr: async () => 0,
    });
    await v.abrirProyecto({ raiz: proyectoEnDisco(base, "A") });
    expect(extras).toEqual([undefined]);
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("al terminar el turno se COMMITEA, por las dos puertas y con quién lo hizo en el mensaje", async () => {
    // Sin esto no se commitea nunca: `prepararRepo` hace UN commit de baseline al descargar
    // y ahí se acaba. Dos consecuencias, y la segunda es la que aprieta: las sesiones se
    // mezclan sin que nada pueda atribuir ni revertir lo de cada una, y `/sync subir` se
    // vuelve inalcanzable — su guarda exige árbol limpio.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const commits: { raiz: string; mensaje: string }[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: () => async () => {},
      commitearTurno: async (raiz, mensaje) => {
        commits.push({ raiz, mensaje });
        return undefined;
      },
    });
    const raizA = proyectoEnDisco(base, "A");
    const raizB = proyectoEnDisco(base, "B");

    const humana = await v.abrirProyecto({ raiz: raizA });
    humana.recibir({ clase: "prosa", texto: "arregla el login" });
    const deTarea = await v.abrirParaTarea(raizB, undefined, undefined, "669c9b79");
    deTarea.recibir({ clase: "prosa", texto: "documenta las colecciones" });
    await new Promise((r) => setTimeout(r, 0));
    await humana.cerrar();
    await deTarea.cerrar();

    expect(commits).toEqual([
      { raiz: raizA, mensaje: "xonecode: sesión" },
      // La de una tarea lo dice: es lo que permite leer el historial y saber qué escribió
      // algo que corría solo.
      { raiz: raizB, mensaje: "xonecode: sesión [tarea 669c9b79]" },
    ]);
    rmSync(base, { recursive: true, force: true });
  });

  it("si el commit falla se DICE, y el turno cierra igual", async () => {
    // Va en el `finally` del turno: una excepción ahí se llevaría por delante el cierre —el
    // compositor apagado para siempre— y un fallo mudo dejaría el árbol sucio sin que nadie
    // se enterase hasta que `/sync subir` se negara.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const dichos: string[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      informar: (texto) => dichos.push(texto),
      crearEjecutor: () => async () => {},
      commitearTurno: async () => "no se pudo commitear el turno: git no está",
    });
    const abierta = await v.abrirProyecto({ raiz: proyectoEnDisco(base, "A") });
    abierta.recibir({ clase: "prosa", texto: "hola" });
    await new Promise((r) => setTimeout(r, 0));
    await abierta.cerrar();

    expect(dichos.some((t) => t.includes("no se pudo commitear"))).toBe(true);
    expect(abierta.cerrada).toBe(true);
    rmSync(base, { recursive: true, force: true });
  });

  it("y una excepción del commit tampoco se lleva el turno por delante", async () => {
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: () => async () => {},
      commitearTurno: async () => {
        throw new Error("git reventó");
      },
    });
    const abierta = await v.abrirProyecto({ raiz: proyectoEnDisco(base, "A") });
    abierta.recibir({ clase: "prosa", texto: "hola" });
    await new Promise((r) => setTimeout(r, 0));
    await abierta.cerrar();

    expect(abierta.cerrada).toBe(true);
    rmSync(base, { recursive: true, force: true });
  });

  it("la sesión de una TAREA queda marcada con su id; la de una persona, no", async () => {
    // Sin esto, la sesión de una tarea entra en el índice como una más — y encima con el
    // título VACÍO, porque el título sale del primer acto de `usuario` y una tarea no
    // manda ninguno. Medido en el proyecto real del usuario: en la barra es una fila en
    // blanco indistinguible de una conversación.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      // Sin `correr` inyectado corre el `correrConsola` de verdad, que es lo que hace que
      // la prosa se convierta en un turno y el turno vuelque. Con un `correr` que devuelve
      // en el acto, el lazo se acaba antes de que haya nada que anotar.
      crearEjecutor: () => async () => {},
    });
    const raizA = proyectoEnDisco(base, "A");
    const raizB = proyectoEnDisco(base, "B");

    // SIN id de sesión: es la primera ejecución de la tarea, que es cuando nace la entrada
    // del índice. En un reintento el id ya viene y la entrada existe (con su marca puesta).
    const humana = await v.abrirProyecto({ raiz: raizA });
    humana.recibir({ clase: "prosa", texto: "hola" });
    const deTarea = await v.abrirParaTarea(raizB, undefined, undefined, "669c9b79");
    deTarea.recibir({ clase: "prosa", texto: "el encargo" });
    await new Promise((r) => setTimeout(r, 0));
    await humana.cerrar();
    await deTarea.cerrar();

    expect(s.tareas.get(`${raizB}|${deTarea.idDeHilo}`)).toBe("669c9b79");
    expect(s.tareas.get(`${raizA}|${humana.idDeHilo}`)).toBeUndefined();
    // Y la humana SÍ se dio de alta: la marca ausente es una decisión, no que no pasara nada.
    expect(s.tareas.has(`${raizA}|${humana.idDeHilo}`)).toBe(true);
    rmSync(base, { recursive: true, force: true });
  });

  it("las dos puertas MIDEN el trabajo sin commitear al abrir, cada una con su raíz", async () => {
    // La medida va en el instante de ABRIR y no en cada anuncio, y eso es lo que la hace
    // honesta por construcción: nada de lo que escriba esta sesión —o esta tarea— puede
    // aparecer en ella. Una tarea que escribe deja el árbol sucio POR DEFINICIÓN (es la
    // razón de que `revisable` no sea «árbol limpio»), así que una medida tomada más tarde
    // acabaría acusando a la propia tarea de lo que la tarea acaba de hacer.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const medidas: string[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: () => async () => {},
      sinCommitear: async (raiz) => {
        medidas.push(raiz);
        return { via: "git", ficheros: ["app.xml"] };
      },
      correr: async () => 0,
    });
    const raizA = proyectoEnDisco(base, "A");
    const raizB = proyectoEnDisco(base, "B");

    const humana = await v.abrirProyecto({ raiz: raizA });
    const deTarea = await v.abrirParaTarea(raizB);

    expect(medidas).toEqual([raizA, raizB]);
    expect(await humana.trabajoAlAbrir).toEqual({ via: "git", ficheros: ["app.xml"] });
    expect(await deTarea.trabajoAlAbrir).toEqual({ via: "git", ficheros: ["app.xml"] });
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("si la medida REVIENTA, la consola se abre igual y no afirma nada", async () => {
    // Es un dato accesorio: abrir un proyecto no puede depender de que git conteste. Y
    // `undefined` es «no se sabe», que arriba no pinta ningún aviso.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: () => async () => {},
      sinCommitear: async () => {
        throw new Error("git no está");
      },
      correr: async () => 0,
    });

    const abierta = await v.abrirProyecto({ raiz: proyectoEnDisco(base, "A") });

    expect(await abierta.trabajoAlAbrir).toBeUndefined();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("sin medida inyectada no se inventa ninguna", async () => {
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: () => async () => {},
      correr: async () => 0,
    });

    const abierta = await v.abrirProyecto({ raiz: proyectoEnDisco(base, "A") });

    expect(await abierta.trabajoAlAbrir).toBeUndefined();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("las dos puertas pasan por las MISMAS costuras: una construcción, no dos", async () => {
    // El criterio de aceptación es «el backend de las dos puertas monta las mismas
    // barreras», y esto es lo que lo prueba sin tautología: el backend con las vistas
    // aplanadas retiradas, la guarda de artefactos y `/skills/` lo compone
    // `backendDeAgente` DENTRO del ejecutor real, que entra por `crearEjecutor` — una sola
    // fábrica. Comparar dos `backendDeAgente` entre sí no puede fallar nunca; comprobar
    // que las dos puertas llaman a las mismas costuras, con su raíz, sí falla el día que
    // alguien le dé a la puerta de tareas una fábrica propia o se salte un gancho.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const llamadas: string[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: () => {
        llamadas.push("crearEjecutor");
        return async () => {};
      },
      dependenciasDeProyecto: (raiz) => {
        llamadas.push(`dependencias:${raiz}`);
        return {};
      },
      marcarSesion: async (raiz) => {
        llamadas.push(`marcar:${raiz}`);
        return async () => true;
      },
      correr: async (_consola, estado) => {
        llamadas.push(`correr:${estado.raiz}`);
        return 0;
      },
    });
    const raizA = proyectoEnDisco(base, "A");
    const raizB = proyectoEnDisco(base, "B");

    await v.abrirProyecto({ raiz: raizA });
    const porLaHumana = [...llamadas];
    llamadas.length = 0;
    const deTarea = await v.abrirParaTarea(raizB);
    const porLaDeTarea = [...llamadas];

    // La misma secuencia de costuras, en el mismo orden, con la raíz de cada una.
    expect(porLaDeTarea).toEqual(porLaHumana.map((c) => c.replace(raizA, raizB)));
    // Y no está vacía: un test que compare dos listas vacías no prueba nada.
    expect(porLaHumana).toContain("crearEjecutor");
    expect(porLaHumana).toContain(`dependencias:${raizA}`);
    expect(porLaHumana).toContain(`marcar:${raizA}`);

    await deTarea.cerrar();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  /**
   * **Cerrar un proyecto NO espera a la marca de git, y esperarla es de quien la necesita.**
   *
   * La espera estuvo un rato dentro de `cerrar()` y era una regresión para quien está
   * sentado delante: `fotoDeApertura` es un `git add -A` + `write-tree` sobre el árbol
   * entero, o sea una pausa visible en un proyecto grande, por un camino que no la
   * necesita. Quien la necesita es el corredor de tareas —mide si lo escrito se puede
   * revisar justo después de cerrar—, así que la pide él con `esperarMarca()`.
   *
   * El doble no resuelve NUNCA su marcado: si `cerrar()` la aguardara, este test se
   * quedaría colgado hasta el plazo de vitest, que es exactamente la medida.
   */
  it("cerrar un proyecto no aguarda la marca de git; `esperarMarca` sí", async () => {
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    let apuntada = false;
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      // El turno emite un acto, que es lo que hace que `volcar()` nombre la foto.
      crearEjecutor: () => async (_peticion, _estado, consola) => void consola.escribir("hecho\n"),
      marcarSesion: async () => (_id) =>
        new Promise<boolean>(() => {
          // No resuelve jamás: es el `git update-ref` que se queda a medias.
          apuntada = true;
        }),
    });
    const abierta = await v.abrirProyecto({ raiz: proyectoEnDisco(base, "A") });
    await abierta.ejecutarTurno("haz algo", abierta.estadoDeSesion, abierta.consola.consola);
    expect(apuntada).toBe(true);

    // Lo que se mide: cerrar devuelve, con el marcado todavía en vuelo.
    await abierta.cerrar();

    // Y `esperarMarca` sí aguarda — se comprueba con una carrera, porque esperarla de
    // verdad colgaría el test: gana el testigo, o sea que no había devuelto.
    const testigo = new Promise<string>((r) => setTimeout(() => r("sigue esperando"), 30));
    expect(await Promise.race([abierta.esperarMarca().then(() => "devolvió"), testigo])).toBe("sigue esperando");

    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("una raíz que no es un proyecto se rechaza con motivo, sin crear nada", async () => {
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    let construidas = 0;
    let lazos = 0;
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: () => {
        construidas++;
        return async () => {};
      },
      correr: async () => {
        lazos++;
        return 0;
      },
    });
    const abierta = await v.abrirProyecto({ raiz: proyectoEnDisco(base, "A") });
    const antes = readdirSync(base).sort();

    // Una carpeta que no existe, y una que existe pero no es un proyecto: las dos.
    const vacia = join(base, "vacia");
    mkdirSync(vacia);
    await expect(v.abrirParaTarea(join(base, "no", "existe"))).rejects.toThrow(/no es un proyecto/i);
    await expect(v.abrirParaTarea(vacia)).rejects.toThrow(/no es un proyecto/i);

    // Nada construido, ningún lazo nuevo, y el cable donde estaba.
    expect(construidas).toBe(1);
    expect(lazos).toBe(1);
    expect(v.proyectoAbierto()).toBe(abierta);
    // Y en disco solo la carpeta que este test creó a mano.
    expect(readdirSync(base).sort()).toEqual([...antes, "vacia"].sort());
    // El motivo NO lleva la ruta: puede ser la del home del usuario, y de aquí el error
    // sube al registro de la tarea, que sí se lee desde el navegador.
    await expect(v.abrirParaTarea(vacia)).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(base) }) as Error
    );

    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  it("cerrar el vestíbulo se lleva también las consolas de tarea", async () => {
    // Sin esto, cerrar la consola web deja vivo un `correrConsola` por tarea abierta y el
    // proceso no termina. `cerrar()` promete «el proyecto abierto y el propio vestíbulo», y
    // una consola de tarea no es ninguno de los dos: había que nombrarla.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
    });
    const deTarea = await v.abrirParaTarea(proyectoEnDisco(base, "A"));
    expect(deTarea.cerrada).toBe(false);
    await v.cerrar();
    expect(deTarea.cerrada).toBe(true);
    rmSync(base, { recursive: true, force: true });
  });

  /**
   * El agujero que abre exponer el ejecutor, y por qué se cierra AQUÍ.
   *
   * `EjecutorDeTurno` recibe el `EstadoDeSesion` por parámetro, y de su `raiz` sale el
   * backend del agente (`crearEjecutorReal` → `abrirSesionReal` → `backendDeAgente`). Por
   * la puerta de las personas eso es inofensivo: el estado lo lleva `correrConsola` y
   * ningún comando cambia `raiz` (medido: `/modelo`, `/modelos` y `/nuevo` tocan `fuentes`,
   * `seleccionesDeCatalogo` y `hilo`, nada más). Por la de las tareas el estado lo construye
   * quien llama, así que una raíz equivocada haría que el agente trabajara —y escribiera—
   * en OTRO proyecto, sin que nadie lo aprobara y sin síntoma. Se para en el mismo
   * envoltorio, para las dos puertas.
   */
  it("un turno con la raíz de OTRO proyecto se rechaza, no se corre en el sitio equivocado", async () => {
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    let corridos = 0;
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: () => async () => {
        corridos++;
      },
      correr: async () => 0,
    });
    const raizA = proyectoEnDisco(base, "A");
    const otra = proyectoEnDisco(base, "B");
    const deTarea = await v.abrirParaTarea(raizA);

    await expect(
      deTarea.ejecutarTurno("escribe algo", { ...deTarea.estadoDeSesion, raiz: otra }, consolaAjena())
    ).rejects.toThrow(/ra[ií]z/i);
    expect(corridos).toBe(0);
    // Y con la suya corre: la guarda no es un «no» a todo.
    await deTarea.ejecutarTurno("escribe algo", deTarea.estadoDeSesion, consolaAjena());
    expect(corridos).toBe(1);

    await deTarea.cerrar();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  /**
   * Borrar la sesión que una TAREA está usando: se declina, no se borra ni se resucita.
   *
   * `borrarSesion` cierra antes de borrar solo la sesión ABIERTA, porque `cerrar()` llama a
   * `volcar()` y anotar RESUCITA la entrada del índice. Una consola de tarea tiene la misma
   * `volcar` y no está en `abierto`, así que nadie la cerraba: el usuario borraba, la barra
   * se lo confirmaba, y al siguiente refresco la sesión estaba otra vez ahí — como si el
   * botón no hubiera hecho nada. Y con las sesiones de tarea persistiéndose eso deja de ser
   * hipotético.
   *
   * Cerrar la consola de la tarea tampoco vale: sería matar un turno en curso porque alguien
   * limpió una fila de la barra. Así que se declina CON MOTIVO — y antes de tocar nada, que
   * es lo que importa: `olvidarMarcaDeSesion` y `olvidarMemoriaDeHilo` no son condicionales,
   * así que borrar aquí se habría llevado la ref de git y el checkpoint de una conversación
   * que el agente sigue escribiendo.
   */
  it("borrar la sesión de una tarea en curso se DECLINA: ni se borra ni resucita", async () => {
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const olvidadas: string[] = [];
    const memoriasOlvidadas: string[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      olvidarMarcaDeSesion: async (_raiz, id) => {
        olvidadas.push(id);
      },
      olvidarMemoriaDeHilo: async (_raiz, id) => {
        memoriasOlvidadas.push(id);
      },
      // Un ejecutor que NO es doble: `volcar` sale antes por `esDoble` con el guionizado, y
      // sin volcado no hay entrada en el índice que borrar.
      crearEjecutor: () => async (_peticion, _estado, consola) => {
        consola.escribir("hecho\n");
      },
      // Con el `correrConsola` de verdad, y no un `correr` que devuelve al instante: la
      // guarda es sobre una tarea EN CURSO, y un lazo que retorna ya deja `cerrada` en
      // `true` — el test no probaría el caso que le importa.
    });
    const raiz = proyectoEnDisco(base, "A");
    const deTarea = await v.abrirParaTarea(raiz);
    // Un turno vuelca, y con el volcado nace la entrada del índice: desde ahí la sesión de
    // la tarea se ve en la barra y tiene un «…» con «eliminar».
    await deTarea.ejecutarTurno("arregla el login", deTarea.estadoDeSesion, deTarea.consola.consola);
    const id = deTarea.sesion;
    expect(id).toBe(deTarea.idDeHilo);
    expect(v.sesionesDe(raiz).map((x) => x.id)).toEqual([id]);

    const resultado = await v.borrarSesion(raiz, id!);

    // El DAÑO primero, y con `soft` para que se vean todos: lo que hay que vigilar no es el
    // valor devuelto sino que no se haya tocado nada. La entrada sigue ahí en el INSTANTE
    // de después —no «vuelve» en el siguiente volcado, que es cómo el usuario lo veía—, y
    // ni la ref de git ni el checkpoint se han ido: las dos llamadas son incondicionales en
    // ese camino, y el agente sigue escribiendo en esa conversación.
    expect.soft(v.sesionesDe(raiz).map((x) => x.id)).toEqual([id]);
    expect.soft(olvidadas).toEqual([]);
    expect.soft(memoriasOlvidadas).toEqual([]);
    // La tarea sigue trabajando, sin enterarse.
    expect.soft(deTarea.cerrada).toBe(false);
    // Y ya después, lo que se le contesta a quien pulsó.
    expect.soft(resultado.borrada).toBe(false);
    expect.soft(resultado.motivo).toMatch(/tarea/i);
    // El motivo sale al cable, que puede ir por un túnel: ninguna ruta de la máquina.
    expect.soft(resultado.motivo).not.toContain(base);
    await deTarea.ejecutarTurno("y ahora el logout", deTarea.estadoDeSesion, deTarea.consola.consola);
    expect(v.sesionesDe(raiz).map((x) => x.id)).toEqual([id]);

    await deTarea.cerrar();
    // Cerrada la tarea, la sesión ya se puede borrar: la guarda es «en curso», no «para
    // siempre».
    expect(await v.borrarSesion(raiz, id!)).toEqual({ borrada: true, cerroLaAbierta: false });
    expect(v.sesionesDe(raiz)).toEqual([]);
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  /**
   * **Y ABRIR la sesión de una tarea en curso se declina igual, por lo mismo** (Task 16).
   *
   * Es el hermano del test de arriba y nació con la vista en vivo: hasta ahora el título de
   * una tarjeta «en proceso» abría su sesión como la tuya —`abrirProyecto({raiz, sesion})`—
   * y eso pone DOS consolas sobre el mismo `thread_id` del checkpointer, con el agente
   * escribiendo en una de ellas. Es el mismo daño que `borrarSesion` ya cerró y por el mismo
   * motivo: el hilo lo está escribiendo alguien. Antes se podía argumentar que era un botón
   * raro; con «Ver lo que hace» al lado, un botón correcto pegado a uno peligroso enseña que
   * los dos son igual de seguros.
   *
   * **Se declina ANTES de tocar nada, y eso es la mitad que importa**: `abrirDeVerdad` empieza
   * con `cerrarProyectoAbierto()`, así que una guarda puesta después habría cerrado la sesión
   * de la persona para luego negarse a abrir la otra — dos daños en vez de uno.
   *
   * Y el motivo DICE qué sí se puede hacer. Un «no puedes» a secas, con la vista en vivo
   * existiendo justo al lado, es la clase de mensaje que hace que alguien insista.
   */
  it("abrir la sesión de una tarea en curso se DECLINA, y no cierra la que estaba abierta", async () => {
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      crearEjecutor: () => async (_peticion, _estado, consola) => {
        consola.escribir("hecho\n");
      },
    });
    const raizA = proyectoEnDisco(base, "A");
    const raizB = proyectoEnDisco(base, "B");
    // Alguien trabajando en A, y una tarea corriendo en B.
    const humana = await v.abrirProyecto({ raiz: raizA });
    const deTarea = await v.abrirParaTarea(raizB);
    const hilo = deTarea.idDeHilo;

    // 1) Por el id del HILO, que existe desde el primer instante: es el caso normal, porque
    //    `sesion` no nace hasta que se vuelca el primer acto.
    await expect(v.abrirProyecto({ raiz: raizB, sesion: hilo })).rejects.toThrow(/tarea en curso/i);
    // El daño primero: ni se cerró lo de la persona, ni se tocó la tarea.
    expect.soft(v.proyectoAbierto()).toBe(humana);
    expect.soft(humana.cerrada).toBe(false);
    expect.soft(deTarea.cerrada).toBe(false);

    // 2) Y por el id de SESIÓN, en cuanto el volcado la crea: es el que viaja en la tarjeta
    //    del kanban (`TareaDelCable.sesion`), o sea el que el botón manda de verdad.
    await deTarea.ejecutarTurno("arregla el login", deTarea.estadoDeSesion, deTarea.consola.consola);
    expect(deTarea.sesion).toBe(hilo);
    await expect(v.abrirProyecto({ raiz: raizB, sesion: deTarea.sesion })).rejects.toThrow(/tarea en curso/i);

    // 3) El motivo no lleva ninguna ruta de la máquina: sale por el cable, que puede ir por
    //    un túnel — la misma regla que el de `borrarSesion`.
    const motivo = await v
      .abrirProyecto({ raiz: raizB, sesion: hilo })
      .then(() => "", (e: Error) => e.message);
    expect.soft(motivo).not.toContain(base);
    // Y dice qué SÍ se puede hacer: con la vista en vivo al lado, un «no puedes» a secas es
    // lo que hace que alguien insista.
    expect.soft(motivo).toMatch(/ver lo que hace|mirar/i);

    // 4) La guarda es por SESIÓN y no por proyecto: otra conversación del mismo proyecto se
    //    abre con normalidad, y abrirlo SIN sesión también.
    await v.abrirProyecto({ raiz: raizB, sesion: "otra-sesion" });
    expect(v.proyectoAbierto()?.raiz).toBe(raizB);

    // 5) Y es «en curso», no «para siempre»: cerrada la tarea, su sesión se abre.
    await deTarea.cerrar();
    await v.abrirProyecto({ raiz: raizB, sesion: hilo });
    expect(v.proyectoAbierto()?.idDeHilo).toBe(hilo);

    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  /**
   * El volcado sigue a la PIEL, no a la puerta — y por eso el adaptador del corredor le
   * pasa la de esta consola.
   *
   * Este test se escribió como «lo que esta puerta NO resuelve», esperando ponerse ROJO
   * cuando alguien lo arreglara. No es el semáforo de nada, y eso ya se sabía al planificar
   * la tarea 5: el arreglo vive en el adaptador (`corredorDeTareas.ts#consolaParaTarea`,
   * que le pasa `consola.consola.consola.piel`), así que este test se queda verde con el
   * agujero abierto o cerrado. Lo que sí es cierto —y es la razón de ser de ese adaptador—
   * es lo que aquí se afirma: `volcar()` lee `consolaWeb.actos()`, o sea la piel de ESTA
   * consola, y un turno corrido con una `Consola` ajena que no la reenvíe escribe sus
   * eventos en otra parte y deja la sesión sin `.jsonl` y sin entrada en el índice.
   *
   * Que el volcado de una tarea ocurre de verdad se mide con las piezas reales —el
   * transcript con actos de asistente y la ref de git nombrada— en
   * `corredorDeTareas.test.ts`, «el volcado de la sesión de una tarea». Ese es el semáforo.
   */
  it("el volcado sigue a la PIEL de la consola, no a la puerta por la que se abrió", async () => {
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      baseDeWorkspace: base,
      // Un ejecutor que NO es doble: si lo fuera, `volcar` saldría antes por `esDoble` y
      // este test no mediría lo que dice medir.
      crearEjecutor: () => async (_peticion, _estado, consola) => {
        consola.escribir("hecho\n");
      },
      correr: async () => 0,
    });
    const raiz = proyectoEnDisco(base, "A");
    const deTarea = await v.abrirParaTarea(raiz);

    await deTarea.ejecutarTurno("arregla el login", deTarea.estadoDeSesion, consolaAjena());
    expect(deTarea.sesion).toBeUndefined();
    expect(v.sesionesDe(raiz)).toEqual([]);

    // Con la piel de la propia consola sí se vuelca: lo que decide es la piel, no la puerta.
    await deTarea.ejecutarTurno("y ahora sí", deTarea.estadoDeSesion, deTarea.consola.consola);
    expect(deTarea.sesion).toBe(deTarea.idDeHilo);

    await deTarea.cerrar();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });
});
