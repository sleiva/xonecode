import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";
import { crearStoreDelCliente } from "./store.js";

describe("store del cliente", () => {
  it("un acto se anexa", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } });
    expect(s.leer().actos).toHaveLength(1);
  });

  it("una reemisión SUSTITUYE el transcript: es lo que hace idempotente reconectar", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } });
    const lote = [{ tipo: "usuario", texto: "hola" }, { tipo: "asistente", texto: "qué tal" }] as const;
    s.aplicar({ clase: "reemision", actos: [...lote] });
    s.aplicar({ clase: "reemision", actos: [...lote] });
    expect(s.leer().actos).toHaveLength(2);
  });

  it("desconectado se refleja en el estado, para poder deshabilitar el compositor", () => {
    const s = crearStoreDelCliente();
    s.marcarDesconectado();
    expect(s.leer().conectado).toBe(false);
    s.marcarConectado();
    expect(s.leer().conectado).toBe(true);
  });

  it("no importa React: es estado, no presentación", async () => {
    // `new URL("./store.ts", import.meta.url)` —la forma del brief— es el patrón que el
    // plugin de Vite para assets reescribe en el entorno jsdom del proyecto «cliente»
    // (ver el comentario de `tipos.test.ts`); `fileURLToPath` lo esquiva.
    const aqui = dirname(fileURLToPath(import.meta.url));
    const fuente = await import("node:fs").then((fs) =>
      fs.readFileSync(join(aqui, "store.ts"), "utf8"));
    expect(fuente).not.toMatch(/from ["']react["']/);
  });

  it("una sustitución reemplaza el ÚLTIMO acto, no lo anexa: dos líneas para una racha es el bug que evita", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "acto", acto: { tipo: "herramientas", lineas: ["→ lee src/app.xne"] } });
    s.aplicar({ clase: "sustitucion", acto: { tipo: "herramientas", lineas: ["→ lee ×3 — a, b, c"] } });
    expect(s.leer().actos).toHaveLength(1);
    expect(s.leer().actos[0]).toEqual({ tipo: "herramientas", lineas: ["→ lee ×3 — a, b, c"] });
  });

  it("una sustitución sobre un transcript vacío cae a anexar, no lanza: F2 de la revisión — antes solo lo razonaba un comentario", () => {
    const s = crearStoreDelCliente();
    // El servidor nunca manda `sustitucion` sin un último acto que sustituir
    // (`transporte.ts`): esto es solo la red bajo un mensaje del que ya no se fía nada.
    s.aplicar({ clase: "sustitucion", acto: { tipo: "asistente", texto: "huérfano" } });
    expect(s.leer().actos).toEqual([{ tipo: "asistente", texto: "huérfano" }]);
  });

  it("un mensaje malformado no lanza y no muta el estado", () => {
    const s = crearStoreDelCliente();
    expect(() => s.aplicar(null)).not.toThrow();
    expect(() => s.aplicar("texto suelto")).not.toThrow();
    expect(() => s.aplicar({ clase: "acto", acto: { tipo: "fantasma" } })).not.toThrow();
    expect(() => s.aplicar({ clase: "reemision", actos: "no es una lista" })).not.toThrow();
    expect(s.leer().actos).toHaveLength(0);
  });

  it("marcarDesconectado limpia los apartados de espera: el servidor ya los resolvió al caer el SSE", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "pregunta", texto: "¿nombre?" });
    s.aplicar({ clase: "selector", selector: { titulo: "elige", opciones: [{ id: "a", etiqueta: "A" }] } });
    s.aplicar({ clase: "secreto", pregunta: "clave" });
    s.aplicar({ clase: "aprobacion", pendientes: [], ficheros: {}, diffs: {} });
    s.marcarDesconectado();
    const estado = s.leer();
    expect(estado.pregunta).toBeUndefined();
    expect(estado.selector).toBeUndefined();
    expect(estado.secreto).toBeUndefined();
    expect(estado.aprobacion).toBeUndefined();
  });

  it("contestarPregunta y cerrarAprobacion retiran solo lo suyo: el servidor no manda ningún «ya está»", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "pregunta", texto: "¿nombre?" });
    s.aplicar({ clase: "aprobacion", pendientes: [], ficheros: {}, diffs: {} });
    s.contestarPregunta();
    expect(s.leer().pregunta).toBeUndefined();
    // La aprobación sigue: contestar una pregunta no zanja lo otro que estuviera esperando.
    expect(s.leer().aprobacion).toBeDefined();
    s.cerrarAprobacion();
    expect(s.leer().aprobacion).toBeUndefined();
  });

  it("el estado de modelos llega entero, y al desconectar se TIRA en vez de quedarse viejo", () => {
    const s = crearStoreDelCliente();
    s.aplicar({
      clase: "modelos",
      actual: "ollama/qwen3",
      proveedores: [
        { id: "ollama", nombre: "Ollama", credencial: "nativa", modelos: [{ id: "qwen3", nombre: "Qwen 3" }] },
        { id: "openai", nombre: "OpenAI", credencial: "falta", error: "credencial no autorizada" },
        // Basura: se descarta la FILA, no el mensaje entero.
        { id: 7, nombre: "Siete", credencial: "puesta" },
        { id: "gemini", nombre: "Google Gemini", credencial: "inventada" },
        // Sin `nombre` tampoco entra: el componente lo pinta sin comprobarlo, y una fila
        // sin nombre saldría en blanco en vez de decir de quién es.
        { id: "groq", credencial: "falta" },
      ],
    });
    const modelos = s.leer().modelos!;
    expect(modelos.actual).toBe("ollama/qwen3");
    expect(modelos.proveedores.map((p) => p.id)).toEqual(["ollama", "openai"]);
    expect(modelos.proveedores[0]!.nombre).toBe("Ollama");
    expect(modelos.proveedores[1]!.error).toBe("credencial no autorizada");

    // Sin cable no se puede AFIRMAR qué modelo está en vigor: pudo cambiarlo otra pestaña
    // o pudo morir el proceso. La reconexión lo trae entero.
    s.marcarDesconectado();
    expect(s.leer().modelos).toBeUndefined();
  });

  /**
   * La lista blanca del `case "modelos"` es la misma trampa que dejó a las imágenes de
   * Ficheros sin `mime` ni `base64`: un campo que no se nombra ahí no llega al componente
   * aunque venga por el cable, y los tests de jsdom siguen en verde porque le dan las
   * props a mano. Sin `personalizado` la fila no sabría en qué grupo va; sin `baseUrl` no
   * se vería a dónde iría su clave.
   */
  it("un proveedor personalizado llega con su marca y su URL: la lista blanca los nombra", () => {
    const s = crearStoreDelCliente();
    s.aplicar({
      clase: "modelos",
      proveedores: [
        {
          id: "custom:mi-llm",
          nombre: "Mi LLM",
          credencial: "falta",
          personalizado: true,
          baseUrl: "https://uno.example.com/v1",
        },
      ],
    });
    expect(s.leer().modelos!.proveedores[0]).toEqual({
      id: "custom:mi-llm",
      nombre: "Mi LLM",
      credencial: "falta",
      personalizado: true,
      baseUrl: "https://uno.example.com/v1",
    });
  });

  it("el acuse de un alta de proveedor se guarda, y se TIRA al caerse el cable", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "proveedor", hecho: false, motivo: "ya hay uno con ese identificador" });
    expect(s.leer().proveedor).toEqual({ hecho: false, motivo: "ya hay uno con ese identificador" });
    // Es el acuse de UNA operación, no un estado: guardado entre conexiones, al reconectar
    // reaparecería un error que ya nadie recuerda.
    s.marcarDesconectado();
    expect(s.leer().proveedor).toBeUndefined();
    // Y un mensaje sin `hecho` no muta nada.
    s.aplicar({ clase: "proveedor", motivo: "suelto" } as never);
    expect(s.leer().proveedor).toBeUndefined();
  });

  it("un `actual` que no es texto no se pinta: mejor «Elige modelo» que una fila inventada", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "modelos", actual: 7, proveedores: [] } as never);
    expect(s.leer().modelos).toEqual({ proveedores: [] });
  });

  it("el aviso del selector llega hasta el estado; sin aviso, no se inventa ninguno", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "selector", selector: { titulo: "elige", opciones: [{ id: "a", etiqueta: "A" }] } });
    expect(s.leer().selector?.aviso).toBeUndefined();
    s.aplicar({
      clase: "selector",
      selector: { titulo: "elige", opciones: [{ id: "a", etiqueta: "A" }], aviso: "no se pudo conectar" },
    });
    expect(s.leer().selector?.aviso).toBe("no se pudo conectar");
    // Y un aviso que no es texto se descarta entero, como el resto del store.
    s.aplicar({
      clase: "selector",
      selector: { titulo: "elige", opciones: [{ id: "a", etiqueta: "A" }], aviso: 7 },
    } as never);
    expect(s.leer().selector?.aviso).toBeUndefined();
  });

  /**
   * La carrera que esto vigila: desde que el asistente de cuenta es un lazo, el servidor
   * puede emitir el selector SIGUIENTE sin ningún viaje de red por medio (volver atrás,
   * cancelar con la puerta puesta), así que el mensaje del SSE puede llegar ANTES de que
   * resuelva el `POST` de la respuesta anterior. Retirando «lo que haya» se borraba el
   * selector nuevo: tarjeta vacía y el servidor esperando hasta el plazo.
   */
  it("contestarSelector retira SOLO el que se contestó: el siguiente puede haber llegado ya", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "selector", selector: { titulo: "Proveedor", opciones: [{ id: "a", etiqueta: "A" }] } });
    const contestado = s.leer().selector;
    // Llega el siguiente antes de que el POST del anterior resuelva.
    s.aplicar({ clase: "selector", selector: { titulo: "Proveedor", opciones: [{ id: "b", etiqueta: "B" }] } });
    s.contestarSelector(contestado);
    expect(s.leer().selector?.opciones[0]?.id).toBe("b");
    // Y el nuevo sí se retira cuando se contesta ÉL.
    s.contestarSelector(s.leer().selector);
    expect(s.leer().selector).toBeUndefined();
  });

  it("el secreto y el selector también se retiran uno a uno", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "secreto", pregunta: "clave" });
    s.aplicar({ clase: "selector", selector: { titulo: "elige", opciones: [{ id: "a", etiqueta: "A" }] } });
    s.contestarSecreto();
    expect(s.leer().secreto).toBeUndefined();
    expect(s.leer().selector).toBeDefined();
    s.contestarSelector();
    expect(s.leer().selector).toBeUndefined();
  });

  it("las cuatro avisan a los suscriptores: si no, lo contestado se quedaría pintado", () => {
    const s = crearStoreDelCliente();
    let avisos = 0;
    s.suscribir(() => { avisos += 1; });
    s.contestarPregunta();
    s.contestarSecreto();
    s.contestarSelector();
    s.cerrarAprobacion();
    expect(avisos).toBe(4);
  });

  it("el registro de comandos llega entero y sobrevive a la desconexión: es un catálogo, no una espera", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "comandos", comandos: [{ nombre: "/sync", descripcion: "sincroniza" }] });
    expect(s.leer().comandos).toEqual([{ nombre: "/sync", descripcion: "sincroniza" }]);
    s.marcarDesconectado();
    expect(s.leer().comandos).toEqual([{ nombre: "/sync", descripcion: "sincroniza" }]);
    expect(() => s.aplicar({ clase: "comandos", comandos: [{ nombre: "/sync" }] })).not.toThrow();
    expect(s.leer().comandos).toEqual([{ nombre: "/sync", descripcion: "sincroniza" }]);
  });

  it("suscribir avisa de cada mutación y la baja para de avisar, tolerante a doble baja", () => {
    const s = crearStoreDelCliente();
    let avisos = 0;
    const baja = s.suscribir(() => { avisos += 1; });
    s.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } });
    expect(avisos).toBe(1);
    baja();
    baja();
    s.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "de nuevo" } });
    expect(avisos).toBe(1);
  });

  /**
   * El servidor contesta «sin-empezar» a una sesión recién abierta (`arranque.ts`), y el
   * store solo admitía «git» y «sin-marca»: el mensaje se tiraba y la pestaña se quedaba
   * en «consultando…» para siempre. Aquí se guardan los tres.
   */
  it("«revision» guarda los tres via, «sin-empezar» incluido", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "revision", via: "sin-empezar", ficheros: [] });
    expect(s.leer().revision).toEqual({ via: "sin-empezar", lista: [] });
    s.aplicar({ clase: "revision", via: "git", ficheros: [{ ruta: "a.xne", clase: "nuevo", mas: 1, menos: 0 }] });
    expect(s.leer().revision).toEqual({ via: "git", lista: [{ ruta: "a.xne", clase: "nuevo", mas: 1, menos: 0 }] });
  });

  it("«arbol» y «fichero» se guardan, y se tiran al cambiar de sesión y al caerse el cable", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "arbol", rutas: ["app.xml", "src/a.xne"], recortado: false });
    s.aplicar({ clase: "fichero", ruta: "src/a.xne", texto: "<a/>", recortado: false, binario: false, bytes: 4, codificacion: "utf-8" });
    expect(s.leer().arbol).toEqual({ rutas: ["app.xml", "src/a.xne"], recortado: false });
    expect(s.leer().contenidos?.["src/a.xne"]).toMatchObject({ texto: "<a/>", bytes: 4, codificacion: "utf-8" });

    s.marcarDesconectado();
    expect(s.leer().arbol).toBeUndefined();
    expect(s.leer().contenidos).toBeUndefined();
  });

  it("«artefacto» se guarda por su ruta virtual, y se tira con la sesión y sin cable", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "artefacto", ruta: "/artefactos/d.html", texto: "<p/>", recortado: false, binario: false, bytes: 4 });
    expect(s.leer().artefactos?.["/artefactos/d.html"]).toMatchObject({ texto: "<p/>", bytes: 4 });
    s.marcarDesconectado();
    expect(s.leer().artefactos).toBeUndefined();
  });

  it("un artefacto de imagen conserva mime y base64: la misma lista blanca que ya mordió", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "artefacto", ruta: "/artefactos/c.png", recortado: false, binario: true, bytes: 7, mime: "image/png", base64: "QUJD" });
    expect(s.leer().artefactos?.["/artefactos/c.png"]).toMatchObject({ mime: "image/png", base64: "QUJD", binario: true });
  });

  it("una imagen conserva su MIME y sus bytes: el fichero se copia campo a campo", () => {
    // La trampa de esta lista blanca: un campo que no se nombre aquí se cae en silencio.
    // Medido en el navegador —no en jsdom, donde el componente sí pintaba la imagen porque
    // el test le pasaba el contenido a mano—: ninguna imagen se enseñaba, porque `mime` y
    // `base64` no llegaban a `contenidos`.
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "fichero", ruta: "logo.png", recortado: false, binario: true, bytes: 7, mime: "image/png", base64: "QUJD" });
    expect(s.leer().contenidos?.["logo.png"]).toMatchObject({ mime: "image/png", base64: "QUJD", binario: true });
  });
});

describe("el dispositivo de la sesión, en el alta", () => {
  const alta = (extra: Record<string, unknown> = {}) => ({
    clase: "alta" as const,
    pasos: [],
    proveedores: [],
    entornos: [],
    registrados: [],
    proyectos: [],
    ramas: [],
    proyectoAbierto: true,
    ...extra,
  });

  it("llega la FOTO entera, y una a medias se descarta", () => {
    const s = crearStoreDelCliente();
    const d = { id: "R58", nombre: "Galaxy S21", plataforma: "android", clase: "fisico" };
    s.aplicar(alta({ dispositivoActivo: d }));
    expect(s.leer().alta?.dispositivoActivo).toEqual(d);
    // Media foto —un id sin nombre— pintaría un serial crudo en la pastilla, que es justo
    // lo que guardar la foto viene a evitar.
    s.aplicar(alta({ dispositivoActivo: { id: "R58" } }));
    expect(s.leer().alta?.dispositivoActivo).toBeUndefined();
  });

  it("una plataforma o una clase que no existen no cuelan", () => {
    const s = crearStoreDelCliente();
    s.aplicar(alta({ dispositivoActivo: { id: "x", nombre: "X", plataforma: "windows", clase: "fisico" } }));
    expect(s.leer().alta?.dispositivoActivo).toBeUndefined();
  });
});

describe("las sesiones de la barra: de quién es cada una y cuándo se tocó", () => {
  const alta = (sesiones: unknown) => ({
    clase: "alta" as const,
    pasos: [],
    proveedores: [],
    entornos: [],
    registrados: [],
    proyectos: [{ id: "p1", nombre: "Tienda", sesiones }],
    ramas: [],
    proyectoAbierto: true,
  });

  it("`ultimoTurno` y `deTarea` sobreviven a la lista blanca", () => {
    // Esta lista blanca ya se comió `mime` y `base64` en silencio y ninguna imagen se veía
    // con los tests en verde. Rojo si uno de los dos se cae.
    const s = crearStoreDelCliente();
    s.aplicar(alta([{ id: "s9", titulo: "", ultimoTurno: "2026-09-09T06:23:12.784Z", deTarea: true }]));
    expect(s.leer().alta?.proyectos[0]?.sesiones).toEqual([
      { id: "s9", titulo: "", ultimoTurno: "2026-09-09T06:23:12.784Z", deTarea: true },
    ]);
  });

  it("ausente se queda ausente: «no consta» no se convierte en «es un chat»", () => {
    const s = crearStoreDelCliente();
    s.aplicar(alta([{ id: "s7", titulo: "arreglar el alta" }]));
    expect(s.leer().alta?.proyectos[0]?.sesiones).toEqual([{ id: "s7", titulo: "arreglar el alta" }]);
  });

  it("un `deTarea` que no es el booleano se descarta, no se toma por verdadero", () => {
    // La trampa del `"false"` de CloudStudio, en la dirección de aquí: marcar una
    // conversación de una persona como sesión de una tarea de fondo.
    const s = crearStoreDelCliente();
    s.aplicar(alta([{ id: "s7", titulo: "x", deTarea: "true" }]));
    expect(s.leer().alta?.proyectos[0]?.sesiones?.[0]).toEqual({ id: "s7", titulo: "x" });
  });
});

describe("el trabajo sin commitear que ya había al abrir", () => {
  const alta = (extra: Record<string, unknown> = {}) => ({
    clase: "alta" as const,
    pasos: [],
    proveedores: [],
    entornos: [],
    registrados: [],
    proyectos: [],
    ramas: [],
    proyectoAbierto: true,
    ...extra,
  });

  it("sobrevive al store: la lista y el total llegan enteros", () => {
    // La lista blanca de este `case` ya se ha comido un campo del cable en silencio
    // (`mime` y `base64` de un fichero, y NINGUNA imagen se enseñaba mientras los tests de
    // jsdom seguían en verde). Esto es rojo si uno de los dos se cae.
    const s = crearStoreDelCliente();
    s.aplicar(alta({ trabajoAlAbrir: { ficheros: ["app.xml"], total: 4 } }));
    expect(s.leer().alta?.trabajoAlAbrir).toEqual({ ficheros: ["app.xml"], total: 4 });
  });

  it("una forma a medias se descarta: sin lista no hay aviso que pintar", () => {
    const s = crearStoreDelCliente();
    s.aplicar(alta({ trabajoAlAbrir: { total: 4 } }));
    expect(s.leer().alta?.trabajoAlAbrir).toBeUndefined();
  });

  it("una lista vacía no es un aviso, y no se guarda como si lo fuera", () => {
    // El servidor no la manda —se calla las tres respuestas que no son un aviso—, pero el
    // store no puede depender de eso: aquí llegaría un aviso que dice «ya había cambios» y
    // no nombra ninguno, que es peor que no decir nada.
    const s = crearStoreDelCliente();
    s.aplicar(alta({ trabajoAlAbrir: { ficheros: [], total: 0 } }));
    expect(s.leer().alta?.trabajoAlAbrir).toBeUndefined();
  });
});

describe("el alta del wizard", () => {
  it("guarda pasos, entornos y listas tal cual llegan", () => {
    const store = crearStoreDelCliente();
    store.aplicar({
      clase: "alta",
      // «proyecto» ya no es un paso PENDIENTE de verdad (salió del alta — cambio de
      // rumbo del usuario), pero sigue siendo un valor válido del tipo (reusado para la
      // acción de abrir uno desde la barra): el store no distingue de dónde viene el
      // mensaje, así que esto sigue probando que guarda la lista tal cual llega.
      pasos: ["entorno", "proyecto"],
      proveedores: [{ id: "ollama", nombre: "ollama" }],
      entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }],
      proyectos: [{ id: "p1", nombre: "Tienda" }],
      ramas: ["master"],
      proyectoAbierto: false,
    });
    expect(store.leer().alta?.pasos).toEqual(["entorno", "proyecto"]);
    expect(store.leer().alta?.ramas).toEqual(["master"]);
  });

  it("otra sesionActiva en el alta tira el árbol y los contenidos, igual que la revisión y los parches", () => {
    const s = crearStoreDelCliente();
    const alta = (sesionActiva: string) =>
      s.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        proyectos: [],
        ramas: [],
        proyectoAbierto: true,
        sesionActiva,
      });
    alta("s1");
    s.aplicar({ clase: "arbol", rutas: ["app.xml"], recortado: false });
    s.aplicar({ clase: "fichero", ruta: "app.xml", texto: "<app/>", recortado: false, binario: false, bytes: 6 });
    s.aplicar({ clase: "artefacto", ruta: "/artefactos/d.html", texto: "<p/>", recortado: false, binario: false, bytes: 4 });
    alta("s1");
    expect(s.leer().arbol).toBeDefined(); // misma sesión: se conserva
    alta("s2");
    expect(s.leer().arbol).toBeUndefined();
    expect(s.leer().contenidos).toBeUndefined();
    expect(s.leer().artefactos).toBeUndefined();
  });

  it("un paso que no existe descarta el mensaje entero en vez de pintar un formulario inventado", () => {
    const store = crearStoreDelCliente();
    store.aplicar({
      clase: "alta",
      pasos: ["fantasma"],
      proveedores: [],
      entornos: [],
      proyectos: [],
      ramas: [],
      proyectoAbierto: false,
    });
    expect(store.leer().alta).toBeUndefined();
  });

  it("`proyectoAbierto` que no es booleano descarta el mensaje entero", () => {
    const store = crearStoreDelCliente();
    store.aplicar({
      clase: "alta",
      pasos: [],
      proveedores: [],
      entornos: [],
      proyectos: [],
      ramas: [],
      proyectoAbierto: "sí" as unknown as boolean,
    });
    expect(store.leer().alta).toBeUndefined();
  });

  it("con pasos vacíos hay alta pero sin nada que pedir: es lo que retira el wizard", () => {
    const store = crearStoreDelCliente();
    store.aplicar({
      clase: "alta",
      pasos: [],
      proveedores: [],
      entornos: [],
      proyectos: [],
      ramas: [],
      proyectoAbierto: true,
    });
    expect(store.leer().alta?.pasos).toEqual([]);
    expect(store.leer().alta?.proyectoAbierto).toBe(true);
  });

  it("sin nombre no hay nombre — nunca uno inventado", () => {
    const store = crearStoreDelCliente();
    store.aplicar({
      clase: "alta",
      pasos: [],
      proveedores: [],
      entornos: [],
      proyectos: [],
      ramas: [],
      proyectoAbierto: false,
    });
    expect(store.leer().alta?.nombre).toBeUndefined();
  });

  it("con nombre, se guarda tal cual", () => {
    const store = crearStoreDelCliente();
    store.aplicar({
      clase: "alta",
      pasos: [],
      proveedores: [],
      entornos: [],
      proyectos: [],
      ramas: [],
      proyectoAbierto: false,
      nombre: "Ana",
    });
    expect(store.leer().alta?.nombre).toBe("Ana");
  });
});

describe("aplicar: bienvenida", () => {
  /**
   * El motivo de que este mensaje exista: llega ANTES que `alta` (`arranque.ts` lo manda
   * antes de `conducirCuenta()`), así que el nombre tiene que quedar en un campo propio
   * del estado y no esperar a que `alta` aparezca — `App.tsx` lee `estado.nombre` con
   * `estado.alta?.nombre` de red, nunca al revés.
   */
  it("guarda el nombre SIN que haya llegado ningún `alta` todavía", () => {
    const store = crearStoreDelCliente();
    store.aplicar({ clase: "bienvenida", nombre: "Ana" });
    expect(store.leer().nombre).toBe("Ana");
    expect(store.leer().alta).toBeUndefined();
  });

  it("sin nombre no hay nombre — nunca uno inventado", () => {
    const store = crearStoreDelCliente();
    store.aplicar({ clase: "bienvenida" });
    expect(store.leer().nombre).toBeUndefined();
  });

  it("una reconexión sin nombre BORRA el de la conexión anterior, no lo deja colgado", () => {
    const store = crearStoreDelCliente();
    store.aplicar({ clase: "bienvenida", nombre: "Ana" });
    expect(store.leer().nombre).toBe("Ana");
    store.aplicar({ clase: "bienvenida" });
    expect(store.leer().nombre).toBeUndefined();
  });
});

describe("la relectura viaja en el alta", () => {
  const base = {
    clase: "alta" as const,
    pasos: [] as const,
    proveedores: [],
    entornos: [],
    registrados: [],
    proyectos: [],
    ramas: [],
    proyectoAbierto: true,
  };

  it("`historica: true` se guarda: es lo que enseña el aviso del chat", () => {
    const store = crearStoreDelCliente();
    store.aplicar({ ...base, historica: true });
    expect(store.leer().alta?.historica).toBe(true);
  });

  it("ausente, o cualquier cosa que no sea `true`, es «no»: no se afirma de una sesión viva", () => {
    const store = crearStoreDelCliente();
    store.aplicar({ ...base, historica: true });
    // El siguiente alta (el primer turno nuevo) ya no la trae, y el estado la suelta.
    store.aplicar({ ...base });
    expect(store.leer().alta?.historica).toBeUndefined();
    store.aplicar({ ...base, historica: "sí" } as never);
    expect(store.leer().alta?.historica).toBeUndefined();
  });
});

describe("la foto de la máquina («dispositivos»)", () => {
  const informe = {
    sistema: "mac" as const,
    herramientas: [{ nombre: "adb" as const, estado: "ok" as const }],
    dispositivos: [{ id: "U", nombre: "iPhone 17 · iOS 26.0", plataforma: "ios" as const, clase: "simulador" as const, estado: "arrancado" as const }],
    avds: ["Pixel_8"],
    // Sin receta: esta máquina de mentira ya lo tiene todo. Va explícito porque el store lo
    // resuelve siempre a una lista, y comparar el informe entero es lo que hace ese test.
    recetas: [],
    medido: "2026-09-06T10:00:00.000Z",
  };

  it("las RECETAS llegan al store: la lista blanca se come lo que no se nombre", () => {
    // La misma trampa que ya mordió con `mime`/`base64` de una imagen: este `case` es una
    // lista blanca, así que un campo nuevo no llega hasta que se escribe aquí — y el
    // síntoma sería una ventana sin la receta con todos los tests en verde.
    const s = crearStoreDelCliente();
    s.aplicar({
      clase: "dispositivos",
      informe: {
        sistema: "mac",
        medido: "2026-09-07T10:00:00.000Z",
        herramientas: [],
        dispositivos: [],
        avds: [],
        recetas: [
          {
            id: "android-emulador",
            titulo: "Instalar el emulador de Android",
            descripcion: "Cuatro pasos.",
            pasos: [
            { titulo: "Instalar", comandos: ["brew install x"], nota: "ojo", hecho: false, ejecutable: false },
            // El paso ejecutable, con lo que se acepta al pulsarlo: MEDIDO en el navegador,
            // esta lista blanca se comió `ejecutable`, `porQueNo` y `acepta`, y el botón no
            // apareció con todos los tests de componente en verde. Otra vez la misma trampa.
            { titulo: "Descargar", comandos: ["sdkmanager --install x"], hecho: false, ejecutable: true, acepta: "las licencias" },
            { titulo: "Crear", comandos: ["avdmanager create"], hecho: false, ejecutable: false, porQueNo: "hazlo después del paso 3" },
            // Un `"false"` de CADENA no puede encender el botón: es verdadero en JavaScript.
            { titulo: "Otro", comandos: ["x"], hecho: false, ejecutable: "false" },
          ],
            completa: false,
            despues: "emulator -avd pixel8",
          },
        ],
      },
      ajustes: {},
    });
    const receta = s.leer().dispositivos?.recetas?.[0];
    expect(receta).toMatchObject({ id: "android-emulador", completa: false, despues: "emulator -avd pixel8" });
    expect(receta?.pasos).toEqual([
      { titulo: "Instalar", comandos: ["brew install x"], nota: "ojo", hecho: false, ejecutable: false },
      { titulo: "Descargar", comandos: ["sdkmanager --install x"], hecho: false, ejecutable: true, acepta: "las licencias" },
      { titulo: "Crear", comandos: ["avdmanager create"], hecho: false, ejecutable: false, porQueNo: "hazlo después del paso 3" },
      { titulo: "Otro", comandos: ["x"], hecho: false, ejecutable: false },
    ]);
  });

  it("un informe SIN recetas no revienta: llega la lista vacía", () => {
    // Windows y Linux no tienen receta todavía, y una versión anterior del servidor tampoco
    // manda el campo. Ausente no puede tumbar la foto entera de la máquina.
    const s = crearStoreDelCliente();
    s.aplicar({
      clase: "dispositivos",
      informe: { sistema: "windows", medido: "2026-09-07T10:00:00.000Z", herramientas: [], dispositivos: [], avds: [] },
      ajustes: {},
    });
    expect(s.leer().dispositivos?.recetas).toEqual([]);
  });

  it("se guarda campo a campo, y un campo de más del servidor no entra", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "dispositivos", informe: { ...informe, extra: 1 } as unknown as typeof informe, ajustes: {} });
    expect(s.leer().dispositivos).toEqual(informe);
  });

  it("un informe malformado se descarta en vez de pintarse a medias", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "dispositivos", informe: { sistema: "mac" } as unknown as typeof informe, ajustes: {} });
    expect(s.leer().dispositivos).toBeUndefined();
  });

  it("NO se tira al caerse el cable: es una foto con hora de la máquina, no un estado del servidor", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "dispositivos", informe, ajustes: { ios: false } });
    s.marcarDesconectado();
    expect(s.leer().dispositivos).toEqual(informe);
    // Los interruptores tampoco: son configuración del equipo, no un estado en vuelo.
    expect(s.leer().ajustesDeDispositivos).toEqual({ ios: false });
  });

  it("los cuatro interruptores llegan, y un «false» de CADENA no apaga nada", () => {
    // La lista blanca de este `case` ya se comió `mime` y `base64` una vez: un campo nuevo
    // no llega hasta que se nombra. Y `"false"` es verdadero en JavaScript, así que se
    // descarta y manda la omisión —mirar—, que es el lado que no esconde nada.
    const s = crearStoreDelCliente();
    s.aplicar({
      clase: "dispositivos",
      informe,
      ajustes: { android: false, ios: true, iosSimulador: "false" } as unknown as { android: boolean },
    });
    expect(s.leer().ajustesDeDispositivos).toEqual({ android: false, ios: true });
  });
});

describe("el paso de receta que se está ejecutando", () => {
  const progreso = (extra: Record<string, unknown> = {}) => ({
    clase: "instalacion" as const,
    receta: "android-emulador",
    paso: 3,
    titulo: "Descargando el emulador",
    estado: "corriendo" as const,
    lineas: ["58%"],
    ms: 1200,
    ...extra,
  });

  it("se guarda tal cual lo dice el servidor", () => {
    const s = crearStoreDelCliente();
    s.aplicar(progreso());
    expect(s.leer().instalacion).toEqual({
      receta: "android-emulador",
      paso: 3,
      titulo: "Descargando el emulador",
      estado: "corriendo",
      lineas: ["58%"],
      ms: 1200,
    });
  });

  it("un estado que no conocemos descarta el mensaje: el botón no puede quedarse en un limbo", () => {
    const s = crearStoreDelCliente();
    s.aplicar(progreso({ estado: "regular" }));
    expect(s.leer().instalacion).toBeUndefined();
  });

  it("NO se tira al caerse el cable: el proceso sigue en la máquina aunque se caiga el SSE", () => {
    // Es la misma regla que la foto de la máquina: `sdkmanager` sigue descargando, y borrar
    // el estado diría que no pasó nada.
    const s = crearStoreDelCliente();
    s.aplicar(progreso({ estado: "corriendo" }));
    s.marcarDesconectado();
    expect(s.leer().instalacion?.estado).toBe("corriendo");
  });

  it("el motivo llega cuando lo hay", () => {
    const s = crearStoreDelCliente();
    s.aplicar(progreso({ estado: "fallo", motivo: "Warning: Failed to find package" }));
    expect(s.leer().instalacion).toMatchObject({ estado: "fallo", motivo: "Warning: Failed to find package" });
  });
});

describe("la cola de tareas", () => {
  it("se guarda campo a campo, y un estado inventado cae en «nuevo»", () => {
    const s = crearStoreDelCliente();
    s.aplicar({
      clase: "tareas",
      concurrencia: 3,
      corriendoAqui: false,
      lista: [
        {
          id: "t1",
          proyecto: "p1",
          proyectoNombre: "AppDemo",
          titulo: "T",
          peticion: "p",
          encargo: "e",
          adjuntos: [{ nombre: "a.png", bytes: 10, mime: "image/png" }],
          estado: "requiere-atencion",
          motivo: "una escritura sin aprobar",
          creada: "2026-09-08T10:00:00.000Z",
        },
        { id: "", proyecto: "p1", estado: "nuevo" },
      ],
    });
    const cola = s.leer().tareas!;
    expect(cola.concurrencia).toBe(3);
    expect(cola.corriendoAqui).toBe(false);
    // La fila sin id se descarta: no hay nada que hacer con ella y la tarjeta no tendría clave.
    expect(cola.lista).toHaveLength(1);
    expect(cola.lista[0]).toMatchObject({ estado: "requiere-atencion", motivo: "una escritura sin aprobar" });
    expect(cola.lista[0]!.adjuntos).toEqual([{ nombre: "a.png", bytes: 10, mime: "image/png" }]);
  });

  it("«lo ejecuta otro proceso» pasa con sus TRES valores: sí, no, y no se sabe", () => {
    // «No soy yo» manda a esperar; «no hay nadie» dice que no va a pasar nada. Colapsar el
    // tercero (ausente) en `false` haría que la interfaz prometiera lo segundo sin saberlo.
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: false, lista: [], ejecutaOtroProceso: true });
    expect(s.leer().tareas!.ejecutaOtroProceso).toBe(true);
    s.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: false, lista: [], ejecutaOtroProceso: false });
    expect(s.leer().tareas!.ejecutaOtroProceso).toBe(false);
    s.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: false, lista: [] });
    expect(s.leer().tareas!.ejecutaOtroProceso).toBeUndefined();
    // Y un valor que no es booleano no se toma por verdadero: la trampa del `"false"`.
    s.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: false, lista: [], ejecutaOtroProceso: "false" });
    expect(s.leer().tareas!.ejecutaOtroProceso).toBeUndefined();
  });

  it("NO se tira al caerse el cable: las tareas siguen corriendo en la máquina", () => {
    // Misma regla que la foto de la máquina y que el paso de instalación en marcha.
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: true, lista: [] });
    s.marcarDesconectado();
    expect(s.leer().tareas).toBeDefined();
  });

  it("un campo del mensaje que la lista blanca no nombra no llega al estado", () => {
    // La lista blanca ya se comió `mime`, `recetas` y `ejecutable` en versiones anteriores
    // del cable; este test es el que caza que un campo nuevo se nombre aquí antes de fiarse
    // de él en un componente.
    const s = crearStoreDelCliente();
    s.aplicar({
      clase: "tareas",
      concurrencia: 2,
      corriendoAqui: true,
      lista: [
        {
          id: "t1",
          proyecto: "p1",
          proyectoNombre: "AppDemo",
          titulo: "T",
          peticion: "p",
          encargo: "e",
          adjuntos: [],
          estado: "nuevo",
          creada: "2026-09-08T10:00:00.000Z",
          pid: 12345,
        },
      ],
    });
    const fila = s.leer().tareas!.lista[0]!;
    expect((fila as Record<string, unknown>)["pid"]).toBeUndefined();
  });

  it("sin lista (mensaje malformado) no se guarda nada", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: true });
    expect(s.leer().tareas).toBeUndefined();
  });

  it("«autorizadas» pasa campo a campo; ausente y vacío no son lo mismo", () => {
    const s = crearStoreDelCliente();
    s.aplicar({
      clase: "tareas",
      concurrencia: 2,
      corriendoAqui: true,
      lista: [
        {
          id: "t1",
          proyecto: "p1",
          proyectoNombre: "AppDemo",
          titulo: "T",
          peticion: "p",
          encargo: "e",
          adjuntos: [],
          estado: "requiere-atencion",
          creada: "2026-09-08T10:00:00.000Z",
          autorizadas: ["src/app.xne", 7, "src/Login.xne"],
        },
        {
          id: "t2",
          proyecto: "p1",
          proyectoNombre: "AppDemo",
          titulo: "T2",
          peticion: "p",
          encargo: "e",
          adjuntos: [],
          estado: "nuevo",
          creada: "2026-09-08T10:00:00.000Z",
        },
      ],
    });
    const [t1, t2] = s.leer().tareas!.lista;
    // Lo que no es cadena se descarta, como en cualquier otra lista blanca de aquí.
    expect(t1!.autorizadas).toEqual(["src/app.xne", "src/Login.xne"]);
    // La que nunca corrió no consta: no se sintetiza un `[]`.
    expect(t2!.autorizadas).toBeUndefined();
  });

  /**
   * Medido tres veces en este repo con `mime`, `recetas` y `ejecutable`: una lista blanca
   * que se olvida un campo es una interfaz vacía con todos los tests en verde — porque el
   * mensaje de fuera cambia sin que el store se entere. `feedback` es el campo que Task 12
   * añade a `TareaDelCable`, y este test es la comprobación de que se copió.
   */
  it("«feedback» pasa campo a campo; ausente cuando nunca se le pidió nada a la tarea", () => {
    const s = crearStoreDelCliente();
    s.aplicar({
      clase: "tareas",
      concurrencia: 2,
      corriendoAqui: true,
      lista: [
        {
          id: "t1",
          proyecto: "p1",
          proyectoNombre: "AppDemo",
          titulo: "T",
          peticion: "p",
          encargo: "e",
          adjuntos: [],
          estado: "nuevo",
          creada: "2026-09-08T10:00:00.000Z",
          feedback: [
            { texto: "primero", creado: "2026-09-08T10:00:00.000Z", consumido: true },
            // Cada campo se convierte por separado — el mismo trato que ya recibe
            // `adjuntos` (`nombre`/`bytes`) —, y no una entrada entera que se descarta.
            { texto: 7, creado: "2026-09-08T11:00:00.000Z", consumido: "sí" },
          ],
        },
        {
          id: "t2",
          proyecto: "p1",
          proyectoNombre: "AppDemo",
          titulo: "T2",
          peticion: "p",
          encargo: "e",
          adjuntos: [],
          estado: "nuevo",
          creada: "2026-09-08T10:00:00.000Z",
        },
      ],
    });
    const [t1, t2] = s.leer().tareas!.lista;
    expect(t1!.feedback).toEqual([
      { texto: "primero", creado: "2026-09-08T10:00:00.000Z", consumido: true },
      // `String(7)` y la trampa de siempre: un `"sí"` no es el booleano `true`, y solo
      // ese exacto cuenta como consumido.
      { texto: "7", creado: "2026-09-08T11:00:00.000Z", consumido: false },
    ]);
    // La que nunca ha pedido feedback no lleva el campo: ausente, no `[]`.
    expect(t2!.feedback).toBeUndefined();
  });

  /**
   * F1 de la revisión final: el veredicto del juez es lo que separa las tres formas de estar
   * «Terminada», así que la lista blanca no puede fiarse de lo que llegue. Que el campo
   * SOBREVIVE lo prueba `tipos.test.ts` contra los campos declarados del tipo; esto prueba
   * las dos trampas de siempre.
   */
  it("un veredicto que no es ninguno de los tres se descarta ENTERO, no cae en verde", () => {
    const s = crearStoreDelCliente();
    const base = {
      proyecto: "p1",
      proyectoNombre: "AppDemo",
      titulo: "T",
      peticion: "p",
      encargo: "e",
      adjuntos: [],
      estado: "terminada",
      creada: "2026-09-08T10:00:00.000Z",
    };
    s.aplicar({
      clase: "tareas",
      concurrencia: 2,
      corriendoAqui: true,
      lista: [
        { ...base, id: "t1", veredicto: { veredicto: "casi", resumen: "algo" } },
        // Sin resumen no hay nada que leer, y un veredicto sin palabras en la tarjeta sería
        // una etiqueta sin dato detrás.
        { ...base, id: "t2", veredicto: { veredicto: "verde" } },
        { ...base, id: "t3", veredicto: "verde" },
        {
          ...base,
          id: "t4",
          veredicto: { veredicto: "verde", resumen: "vale", hallazgos: ["uno", 7], salvedad: 3 },
        },
      ],
    });
    const [t1, t2, t3, t4] = s.leer().tareas!.lista;
    expect(t1!.veredicto).toBeUndefined();
    expect(t2!.veredicto).toBeUndefined();
    expect(t3!.veredicto).toBeUndefined();
    // Lo que no es cadena se descarta dentro de los hallazgos, y una salvedad que no es
    // texto no se pinta: el resto del veredicto sigue valiendo.
    expect(t4!.veredicto).toEqual({ veredicto: "verde", resumen: "vale", hallazgos: ["uno"] });
  });

  it("«terminadaAMano» solo con el booleano true: un «false» de cadena no marca nada", () => {
    const s = crearStoreDelCliente();
    const base = {
      proyecto: "p1",
      proyectoNombre: "AppDemo",
      titulo: "T",
      peticion: "p",
      encargo: "e",
      adjuntos: [],
      estado: "terminada",
      creada: "2026-09-08T10:00:00.000Z",
    };
    s.aplicar({
      clase: "tareas",
      concurrencia: 2,
      corriendoAqui: true,
      lista: [
        { ...base, id: "t1", terminadaAMano: "false" },
        { ...base, id: "t2", terminadaAMano: true },
        { ...base, id: "t3" },
      ],
    });
    const [t1, t2, t3] = s.leer().tareas!.lista;
    // La trampa de siempre: `"false"` es verdadero en JavaScript, y aquí marcaría como dada
    // por buena a mano una entrega del corredor.
    expect(t1!.terminadaAMano).toBeUndefined();
    expect(t2!.terminadaAMano).toBe(true);
    // Ausente = no consta, que no es `false`.
    expect("terminadaAMano" in t3!).toBe(false);
  });

  /**
   * El ENCARGO propuesto por el aumentador, y la mitad que hay que contar: **el mensaje va a
   * TODOS los clientes** (el cable habla con todos, no con el último), así que el store
   * guarda el último y quien abre la ventana de crear lo LIMPIA — si no, un encargo que pidió
   * otra pestaña prerrellenaría el campo de esta.
   */
  describe("el encargo augmentado", () => {
    it("un encargo llega y se guarda; el fallo llega como motivo, nunca los dos", () => {
      const s = crearStoreDelCliente();
      s.aplicar({ clase: "tarea", accion: "augmentado", encargo: "## Objetivo\nBuscar por NIF" });
      expect(s.leer().encargoPropuesto).toEqual({ encargo: "## Objetivo\nBuscar por NIF" });
      s.aplicar({ clase: "tarea", accion: "augmentado", error: "falta la credencial para openai" });
      expect(s.leer().encargoPropuesto).toEqual({ error: "falta la credencial para openai" });
    });

    it("se puede LIMPIAR: la ventana lo hace al abrirse, porque este mensaje va a todas las pestañas", () => {
      const s = crearStoreDelCliente();
      s.aplicar({ clase: "tarea", accion: "augmentado", encargo: "E" });
      s.limpiarEncargoPropuesto();
      expect(s.leer().encargoPropuesto).toBeUndefined();
    });

    it("lo que no trae ni encargo ni error no cambia nada: campo a campo, como todo lo de aquí", () => {
      const s = crearStoreDelCliente();
      s.aplicar({ clase: "tarea", accion: "augmentado", encargo: "E" });
      s.aplicar({ clase: "tarea", accion: "augmentado" } as never);
      expect(s.leer().encargoPropuesto).toEqual({ encargo: "E" });
    });
  });
});

/**
 * **Mirar en vivo lo que hace una tarea** (Task 16).
 *
 * Lo que llega es el transcript de la sesión de ESA tarea, etiquetado con su id porque por
 * el mismo cable llega el de la sesión propia. Dos reglas que este bloque fija:
 *  - **Nunca se mezcla con `actos`**: los actos de una tarea de fondo no pueden aparecer en
 *    el chat de quien la mira, que es el aserto que hay que conservar de todo esto.
 *  - **Se tira al caerse el cable**, como `modelos` y al contrario que la cola de tareas: la
 *    mirada es un enganche que vive en el servidor, y al caerse el SSE ese enganche se va con
 *    él (`arranque.ts`, el `close`). Guardarla haría que la pantalla siguiera enseñando un
 *    transcript congelado como si estuviera en vivo.
 */
describe("mirar en vivo una tarea", () => {
  const ACTOS = [
    { tipo: "usuario" as const, texto: "arregla el login" },
    { tipo: "razonamiento" as const, texto: "mirando app.xne" },
  ];

  it("`todos` deja el transcript de esa tarea, y no toca los actos de la sesión propia", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "lo mío" } });
    s.aplicar({ clase: "mirada", tarea: "t1", via: "todos", actos: ACTOS });
    expect(s.leer().mirada).toEqual({ tarea: "t1", actos: ACTOS });
    // La regla que no se puede romper: el transcript de una tarea de fondo no entra en la
    // conversación de nadie.
    expect(s.leer().actos).toEqual([{ tipo: "usuario", texto: "lo mío" }]);
  });

  it("`alta` anexa y `sustitucion` reemplaza el último", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "mirada", tarea: "t1", via: "todos", actos: [ACTOS[0]!] });
    s.aplicar({ clase: "mirada", tarea: "t1", via: "alta", actos: [{ tipo: "herramientas", lineas: ["→ lee"], detalles: [{}] }] });
    expect(s.leer().mirada!.actos).toHaveLength(2);
    s.aplicar({ clase: "mirada", tarea: "t1", via: "sustitucion", actos: [{ tipo: "herramientas", lineas: ["→ lee ×3"], detalles: [{}] }] });
    expect(s.leer().mirada!.actos).toEqual([
      ACTOS[0],
      { tipo: "herramientas", lineas: ["→ lee ×3"], detalles: [{}] },
    ]);
  });

  it("un trozo de OTRA tarea no se anexa al transcript de la que se mira", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "mirada", tarea: "t1", via: "todos", actos: [ACTOS[0]!] });
    // El servidor solo manda lo que este cliente pidió, pero el store no puede fiarse de
    // eso: mezclar dos transcripts sería la peor forma de fallar aquí — una conversación
    // que cuenta lo que hizo otro agente.
    s.aplicar({ clase: "mirada", tarea: "t2", via: "alta", actos: [{ tipo: "asistente", texto: "de otra" }] });
    expect(s.leer().mirada).toEqual({ tarea: "t1", actos: [ACTOS[0]] });
  });

  it("un `todos` de otra tarea SÍ cambia de tarea: es lo que hace «mirar esta otra»", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "mirada", tarea: "t1", via: "todos", actos: [ACTOS[0]!] });
    s.aplicar({ clase: "mirada", tarea: "t2", via: "todos", actos: [{ tipo: "asistente", texto: "de otra" }] });
    expect(s.leer().mirada).toEqual({ tarea: "t2", actos: [{ tipo: "asistente", texto: "de otra" }] });
  });

  it("un mensaje sin `via` conocida o con actos que no lo son se ignora", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "mirada", tarea: "t1", via: "todos", actos: ACTOS });
    s.aplicar({ clase: "mirada", tarea: "t1", via: "fantasma", actos: ACTOS } as never);
    s.aplicar({ clase: "mirada", tarea: "t1", via: "alta", actos: [{ tipo: "inventado" }] } as never);
    s.aplicar({ clase: "mirada", tarea: "t1", via: "alta" } as never);
    expect(s.leer().mirada).toEqual({ tarea: "t1", actos: ACTOS });
  });

  it("se tira al caerse el cable: la mirada la sostiene el servidor, no este navegador", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "mirada", tarea: "t1", via: "todos", actos: ACTOS });
    s.marcarDesconectado();
    // Y la cola de tareas NO se tira, que es la otra mitad: las tareas siguen corriendo en
    // la máquina, pero el enganche a esta pantalla no.
    expect(s.leer().mirada).toBeUndefined();
  });

  it("`dejarDeMirar` la borra sin esperar al servidor: el panel se cierra al pulsar", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "mirada", tarea: "t1", via: "todos", actos: ACTOS });
    s.dejarDeMirar();
    expect(s.leer().mirada).toBeUndefined();
  });
});

describe("la revisión que llega por el cable", () => {
  const revisionCon = (mensaje: Record<string, unknown>) => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "revision", ficheros: [], ...mensaje } as never);
    return s.leer().revision;
  };

  it("acepta las CUATRO medidas, y `mezclados` solo si es un número mayor que cero", () => {
    expect(revisionCon({ via: "git" })).toEqual({ via: "git", lista: [] });
    expect(revisionCon({ via: "desde-apertura" })).toEqual({ via: "desde-apertura", lista: [] });
    expect(revisionCon({ via: "sin-marca" })).toEqual({ via: "sin-marca", lista: [] });
    expect(revisionCon({ via: "sin-empezar" })).toEqual({ via: "sin-empezar", lista: [] });
    // Una medida que este cliente no conoce no se pinta como si fuera otra.
    expect(revisionCon({ via: "inventada" })).toBeUndefined();
    expect(revisionCon({ via: "git", mezclados: 3 })?.mezclados).toBe(3);
    // Cero no es un dato: es la ausencia de mezcla, y una línea que lo diga no dice nada.
    expect(revisionCon({ via: "git", mezclados: 0 })?.mezclados).toBeUndefined();
    expect(revisionCon({ via: "git", mezclados: "3" })?.mezclados).toBeUndefined();
  });

  it("`sinCommitear` sobrevive, y solo con el booleano `true`", () => {
    // La trampa de siempre: `"false"` es una cadena verdadera en JavaScript, y marcaría
    // como «no commiteado» —o sea, como no atribuible— algo que sí lo está.
    const revision = revisionCon({
      via: "git",
      ficheros: [
        { ruta: "a.md", clase: "modificado", sinCommitear: true },
        { ruta: "b.md", clase: "modificado" },
        { ruta: "c.md", clase: "modificado", sinCommitear: "false" },
      ],
    });
    expect(revision?.lista).toEqual([
      { ruta: "a.md", clase: "modificado", sinCommitear: true },
      { ruta: "b.md", clase: "modificado" },
    ]);
  });
});
