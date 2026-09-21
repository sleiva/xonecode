import { describe, expect, it } from "vitest";
import type { Dispositivo } from "./dispositivos.js";
import type { CausaDeBloqueo, EntradaDeVeredicto, FrameworkMedido } from "./puedeLanzarse.js";
import { dispositivoListo, motivoDeBloqueo, puedeLanzarse } from "./puedeLanzarse.js";

/**
 * El `app.xml` del esqueleto de `core/esqueleto.ts`, que es el caso MEDIDO: declara
 * `<connection name="main" connstring="bd/gestion.db" />` y el `bd/` lo deja vacío, así que el
 * fichero no está. Es el único proyecto del censo al que le falla el lanzamiento.
 */
const APP_XML_DEL_ESQUELETO = `<?xml version="1.0" encoding="iso-8859-15" standalone="yes"?>
<xml>
<app prefix="gen" version="1.0.0" debug="true">
        <connection name="main" connstring="bd/gestion.db" />
        <entry-point>
            <item name="EntradaApp" conditions="" />
        </entry-point>
    </app>
</xml>
`;

/** El de Replanteos_2026, recortado: su `connstring` es una cadena de PROVEEDOR, no una ruta. */
const APP_XML_DE_PROVEEDOR = `<xml><app prefix="gen" version="2.0.4.4">
    <connection name="ReplicaFilesConnection" connstring="Provider=Xone Remote Provider;ProgID=com.xone.db.impl.replicafiles.RplFilesConnection" />
  </app></xml>`;

/**
 * Un `app.xml` que se lee bien y NO declara ninguna conexión: el de AppDemo, medido. Es la app
 * con la que se prueba, así que un veredicto que la bloqueara por eso negaría el lanzamiento de
 * la app que alguien nombró — y arranca.
 *
 * **Y no declarar ninguna NO la deja sin comprobar**: su `bd/gestion.db` se mira igual, porque
 * es la base de XOne por defecto. Su primer veredicto la daba por lista sin haber mirado el
 * fichero, que es el fallo que aquí se fija.
 */
const APP_XML_SIN_CONEXIONES = `<xml><app prefix="gen" version="1.0.0">
    <entry-point><item name="EntradaApp" conditions="" /></entry-point>
  </app></xml>`;

const APP_INI = "Environment=Pro\nname=MinitsMT\nicon=icon.png\n";

function dispositivo(parcial: Partial<Dispositivo> = {}): Dispositivo {
  return {
    id: "emulator-5554",
    nombre: "Pixel 8",
    plataforma: "android",
    clase: "emulador",
    estado: "arrancado",
    ...parcial,
  };
}

/**
 * Una entrada que ya está lista —dispositivo alcanzable, framework medido e instalado, proyecto
 * con su `app.xml` y su base— para que cada prueba cambie SOLO lo que está probando.
 */
function entrada(parcial: Partial<EntradaDeVeredicto> = {}): EntradaDeVeredicto {
  return {
    dispositivo: dispositivo(),
    framework: { instalado: true },
    xml: APP_XML_DEL_ESQUELETO,
    ini: APP_INI,
    existe: () => true,
    ...parcial,
  };
}

/** Las causas del veredicto, como una lista de etiquetas: es lo que casi todas las pruebas miran. */
function etiquetas(parcial: Partial<EntradaDeVeredicto>): string[] {
  return puedeLanzarse(entrada(parcial)).causas.map((c) => c.causa);
}

/**
 * El catálogo: cada causa de la unión, con un ejemplo de sus datos **y una entrada de verdad
 * que la produce**.
 *
 * La segunda mitad es lo que impide un miembro muerto. El `switch` de `motivoDeBloqueo` es
 * exhaustivo, así que una causa nueva no compila hasta que tenga frase — pero nada obliga a que
 * alguien la EMITA, y una causa que nadie emite es una regla escrita y muerta: una frase que
 * ninguna pantalla va a enseñar nunca. Las diez se producen con una entrada posible; el día que
 * una no se pueda, el sitio para decirlo es una nota aquí, no una entrada inventada.
 */
const CAUSAS_CON_EJEMPLO: { causa: CausaDeBloqueo; entrada: Partial<EntradaDeVeredicto> }[] = [
  { causa: { causa: "sin-dispositivo-elegido" }, entrada: { dispositivo: undefined, framework: undefined } },
  {
    causa: { causa: "dispositivo-desconocido" },
    entrada: { dispositivo: undefined, framework: undefined, elegido: "emulator-5554" },
  },
  {
    causa: { causa: "dispositivo-no-alcanzable", nombre: "Pixel 8", estado: "no-disponible" },
    entrada: { dispositivo: dispositivo({ estado: "no-disponible" }) },
  },
  { causa: { causa: "framework-ausente", nombre: "Pixel 8" }, entrada: { framework: { instalado: false } } },
  { causa: { causa: "framework-no-medido", nombre: "Pixel 8" }, entrada: { framework: undefined } },
  { causa: { causa: "sin-app-xml" }, entrada: { xml: undefined } },
  {
    causa: { causa: "app-xml-ilegible", motivo: "EACCES: permission denied" },
    entrada: { xml: undefined, motivoDeLectura: "EACCES: permission denied" },
  },
  {
    causa: { causa: "falta-el-fichero-de-la-conexion", connstring: "bd/gestion.db" },
    entrada: { existe: () => false },
  },
  {
    causa: { causa: "falta-la-base" },
    entrada: { xml: APP_XML_SIN_CONEXIONES, existe: () => false },
  },
  {
    causa: { causa: "plataforma-sin-camino", plataforma: "ios" },
    entrada: { dispositivo: dispositivo({ plataforma: "ios", clase: "simulador" }) },
  },
];

describe("dispositivoListo", () => {
  it("un dispositivo alcanzable con el framework instalado está listo", () => {
    expect(dispositivoListo(dispositivo(), { instalado: true })).toBe(true);
    expect(dispositivoListo(dispositivo({ estado: "conectado" }), { instalado: true })).toBe(true);
  });

  it("alcanzable pero SIN framework medido no está listo: «no se sabe» no es «lo tiene»", () => {
    // La asimetría es la de todo el repo: un botón sobre un «no se sabe» promete algo que nadie
    // ha comprobado, y el acuse del framework llega igual — el fallo aparece detrás, en la app.
    expect(dispositivoListo(dispositivo(), undefined)).toBe(false);
  });

  it("apagado con el framework instalado no está listo: el framework no lo hace llegar", () => {
    expect(dispositivoListo(dispositivo({ estado: "apagado" }), { instalado: true })).toBe(false);
  });

  it("los cuatro estados que no son llegada no están listos, ni con el framework puesto", () => {
    for (const estado of ["apagado", "sin-autorizar", "offline", "no-disponible"] as const) {
      expect(dispositivoListo(dispositivo({ estado }), { instalado: true })).toBe(false);
    }
  });

  it("sin dispositivo elegido no hay nada listo", () => {
    expect(dispositivoListo(undefined, { instalado: true })).toBe(false);
  });

  it("el framework medido y NO instalado no está listo", () => {
    expect(dispositivoListo(dispositivo(), { instalado: false })).toBe(false);
  });

  it("un simulador de iOS arrancado no está listo: todavía no hay camino hasta él", () => {
    // El framework de iOS no se mide desde aquí (`frameworkEnDispositivo` contesta «iOS todavía
    // no»), así que dar esto por listo sería prometer un lanzamiento que no existe.
    expect(
      dispositivoListo(dispositivo({ plataforma: "ios", clase: "simulador", estado: "arrancado" }), {
        instalado: true,
      }),
    ).toBe(false);
  });
});

describe("puedeLanzarse", () => {
  it("con el dispositivo alcanzable, su framework medido y el proyecto entero, está listo", () => {
    const veredicto = puedeLanzarse(entrada());
    expect(veredicto.listo).toBe(true);
    expect(veredicto.causas).toEqual([]);
  });

  it("sin dispositivo elegido lo dice, y no acusa al framework ni al proyecto", () => {
    expect(
      etiquetas({ dispositivo: undefined, framework: undefined, elegido: undefined }),
    ).toEqual(["sin-dispositivo-elegido"]);
  });

  it("con una elección que ya no resuelve la causa es «desconocido», no «sin elegir»", () => {
    // Las dos llegan aquí con `dispositivo: undefined`, y contarlas igual sería decirle a
    // alguien que no eligió cuando sí eligió.
    expect(etiquetas({ dispositivo: undefined, framework: undefined, elegido: "emulator-5554" })).toEqual([
      "dispositivo-desconocido",
    ]);
  });

  it("un dispositivo apagado se dice con su nombre y su estado", () => {
    const causas = puedeLanzarse(entrada({ dispositivo: dispositivo({ estado: "apagado" }) })).causas;
    expect(causas).toContainEqual({
      causa: "dispositivo-no-alcanzable",
      nombre: "Pixel 8",
      estado: "apagado",
    });
  });

  it("sobre iOS la causa es el camino, y no se culpa al framework", () => {
    const causas = puedeLanzarse(
      entrada({ dispositivo: dispositivo({ plataforma: "ios", clase: "simulador" }), framework: undefined }),
    ).causas;
    expect(causas).toEqual([{ causa: "plataforma-sin-camino", plataforma: "ios" }]);
  });

  it("un framework sin medir tiene causa propia, y no es la de «no está»", () => {
    expect(etiquetas({ framework: undefined })).toEqual(["framework-no-medido"]);
  });

  it("un framework medido y no instalado tiene la suya", () => {
    expect(etiquetas({ framework: { instalado: false } })).toEqual(["framework-ausente"]);
  });

  it("un proyecto sin app.xml no se puede lanzar", () => {
    expect(etiquetas({ xml: undefined })).toEqual(["sin-app-xml"]);
  });

  it("un app.xml que no se deja leer trae su motivo, de una línea", () => {
    const causas = puedeLanzarse(
      entrada({ xml: undefined, motivoDeLectura: "EACCES: permission denied" }),
    ).causas;
    expect(causas).toEqual([{ causa: "app-xml-ilegible", motivo: "EACCES: permission denied" }]);
  });

  it("AppDemo: un app.xml que se lee bien y no declara ninguna <connection> está listo", () => {
    // No declarar ninguna conexión no es síntoma de nada y no hay nada que comprobar EN ELLAS:
    // bloquear aquí sería el mismo error que el catálogo evita para los `connstring` de
    // proveedor, cometido con el caso vecino — y la app que se nombra para probar es justo esta.
    const veredicto = puedeLanzarse(entrada({ xml: APP_XML_SIN_CONEXIONES }));
    expect(veredicto.listo).toBe(true);
    expect(veredicto.causas).toEqual([]);
    expect(veredicto.conexiones).toEqual([]);
  });

  it("AppDemo SIN su base NO está listo, aunque no declare ninguna conexión", () => {
    // **Esta es la corrección que costó una medida, y la comprobación que justifica la pestaña.**
    // La primera versión de esta regla solo miraba los `connstring` declarados con forma de
    // ruta, y por ahí este proyecto —cero declaraciones, y la base es la de por defecto— salía
    // `listo: true`, se lanzaba, y moría detrás en el diálogo. Es el falso negativo que el
    // módulo llama «el error peligroso», y estaba escrito en el módulo que lo evitaba.
    const veredicto = puedeLanzarse(entrada({ xml: APP_XML_SIN_CONEXIONES, existe: () => false }));
    expect(veredicto.listo).toBe(false);
    expect(veredicto.causas).toEqual([{ causa: "falta-la-base" }]);
  });

  it("la base se pregunta SIEMPRE, y la declarada se pregunta con su propia verdad", () => {
    const visto: string[] = [];
    const registro = (ruta: string): boolean => {
      visto.push(ruta);
      return true;
    };
    // Sin declarar: se pregunta por la convención.
    puedeLanzarse(entrada({ xml: APP_XML_SIN_CONEXIONES, existe: registro }));
    expect(visto).toEqual(["bd/gestion.db"]);
    // Declarada: se pregunta una vez, no dos, y la causa sale con el `connstring` delante.
    visto.length = 0;
    puedeLanzarse(entrada({ existe: registro }));
    expect(visto).toEqual(["bd/gestion.db"]);
  });

  it("el caso MEDIDO: la conexión declarada y su fichero ausente", () => {
    // El esqueleto declara `bd/gestion.db` y no lo tiene: el lanzamiento acusa `true` y la app
    // muere detrás. Es la razón de ser de todo esto.
    const causas = puedeLanzarse(entrada({ existe: () => false })).causas;
    expect(causas).toEqual([
      { causa: "falta-el-fichero-de-la-conexion", connstring: "bd/gestion.db" },
    ]);
  });

  it("el fichero que SÍ está no dispara nada", () => {
    const visto: string[] = [];
    const veredicto = puedeLanzarse(
      entrada({
        existe: (ruta) => {
          visto.push(ruta);
          return true;
        },
      }),
    );
    // Y se pregunta por la ruta tal cual la declara el `app.xml`, sin normalizarla.
    expect(visto).toEqual(["bd/gestion.db"]);
    expect(veredicto.listo).toBe(true);
  });

  it("el CENSO: un connstring de proveedor no se comprueba, y la base de la convención sí", () => {
    // Replanteos_2026 y MyAllXOne declaran `Provider=…` y arrancan perfectamente. Preguntar por
    // la existencia de esa cadena —que no es un fichero de aquí— bloquearía dos proyectos que
    // funcionan. Y su `bd/gestion.db` SÍ se mira: lo tienen, y por eso están listos.
    const visto: string[] = [];
    const veredicto = puedeLanzarse(
      entrada({
        xml: APP_XML_DE_PROVEEDOR,
        existe: (ruta) => {
          visto.push(ruta);
          return true;
        },
      }),
    );
    expect(visto).toEqual(["bd/gestion.db"]);
    expect(veredicto.listo).toBe(true);
    expect(veredicto.conexiones).toEqual([
      {
        nombre: "ReplicaFilesConnection",
        connstring:
          "Provider=Xone Remote Provider;ProgID=com.xone.db.impl.replicafiles.RplFilesConnection",
      },
    ]);
  });

  it("y el de proveedor SIN su base tampoco está listo: declararla o no, la necesita", () => {
    // El censo entero, con su conclusión: los tres proyectos reales la tienen. La declaración
    // no es lo que decide — si lo fuera, este proyecto pasaría y moriría detrás en el diálogo.
    const veredicto = puedeLanzarse(entrada({ xml: APP_XML_DE_PROVEEDOR, existe: () => false }));
    expect(veredicto.listo).toBe(false);
    expect(veredicto.causas).toEqual([{ causa: "falta-la-base" }]);
  });

  it("una conexión sin connstring no dispara la causa del fichero", () => {
    // Se pregunta por la base de la convención —que aquí no está—, pero NO por la conexión
    // muda: un `connstring` que no está no es una ruta que comprobar, y no puede inventarse una
    // causa por un fichero que nadie ha nombrado.
    expect(etiquetas({ xml: `<connection name="sola" />`, existe: () => false })).toEqual([
      "falta-la-base",
    ]);
  });

  it("dos conexiones a la misma base ausente son UNA frase, no dos", () => {
    const xml = `<connection name="a" connstring="bd/gestion.db" /><connection name="b" connstring="bd/gestion.db" />`;
    expect(etiquetas({ xml, existe: () => false })).toEqual([
      "falta-el-fichero-de-la-conexion",
    ]);
    // Y dos bases distintas son dos causas: cada una se arregla en un sitio.
    const dos = `<connection name="a" connstring="bd/gestion.db" /><connection name="b" connstring="bd/otra.db" />`;
    expect(etiquetas({ xml: dos, existe: () => false })).toEqual([
      "falta-el-fichero-de-la-conexion",
      "falta-el-fichero-de-la-conexion",
    ]);
  });

  it("TODAS las causas, no solo la primera, y en orden de lectura", () => {
    const veredicto = puedeLanzarse({
      dispositivo: dispositivo({ estado: "offline" }),
      framework: { instalado: false },
      xml: undefined,
      ini: undefined,
      existe: () => false,
    });
    expect(veredicto.listo).toBe(false);
    expect(veredicto.causas.map((c) => c.causa)).toEqual([
      "dispositivo-no-alcanzable",
      "framework-ausente",
      "sin-app-xml",
    ]);
  });

  it("un app.ini que no está NO bloquea: solo se pierde el nombre", () => {
    const veredicto = puedeLanzarse(entrada({ ini: undefined }));
    expect(veredicto.listo).toBe(true);
    expect(veredicto.app).toBeUndefined();
  });

  it("el nombre de la app y las conexiones viajan para poder decirlos en el recorrido", () => {
    const veredicto = puedeLanzarse(entrada());
    expect(veredicto.app).toBe("MinitsMT");
    expect(veredicto.conexiones).toEqual([{ nombre: "main", connstring: "bd/gestion.db" }]);
  });

  it("cada causa de la unión la produce una entrada de verdad: ninguna es un miembro muerto", () => {
    for (const { causa, entrada: parcial } of CAUSAS_CON_EJEMPLO) {
      expect(etiquetas(parcial), causa.causa).toContain(causa.causa);
    }
  });

  it("la lista de causas no puede contradecir a `dispositivoListo`", () => {
    // `listo` sale de `causas.length === 0` y `dispositivoListo` recalcula el eje del
    // dispositivo: si alguna vez divergen, el botón y la frase dirían cosas distintas.
    const limpio = { xml: APP_XML_DE_PROVEEDOR, ini: APP_INI, existe: () => true };
    const frameworks: (FrameworkMedido | undefined)[] = [
      undefined,
      { instalado: true },
      { instalado: false },
    ];
    const dispositivos: (Dispositivo | undefined)[] = [
      undefined,
      dispositivo({ estado: "conectado" }),
      dispositivo({ estado: "arrancado" }),
      dispositivo({ estado: "apagado" }),
      dispositivo({ estado: "sin-autorizar" }),
      dispositivo({ estado: "offline" }),
      dispositivo({ estado: "no-disponible" }),
      dispositivo({ plataforma: "ios", clase: "simulador" }),
    ];
    for (const d of dispositivos) {
      for (const framework of frameworks) {
        const veredicto = puedeLanzarse({ ...limpio, dispositivo: d, framework });
        expect(veredicto.listo, `${d?.nombre ?? "sin dispositivo"} / ${JSON.stringify(framework)}`).toBe(
          dispositivoListo(d, framework),
        );
      }
    }
  });
});

describe("motivoDeBloqueo: una frase por causa, y cada una dice dónde se arregla", () => {
  it("la lista de arriba cubre cada causa una vez (si añades una, añádela aquí)", () => {
    expect(CAUSAS_CON_EJEMPLO).toHaveLength(10);
    expect(new Set(CAUSAS_CON_EJEMPLO.map((c) => c.causa.causa)).size).toBe(CAUSAS_CON_EJEMPLO.length);
  });

  for (const { causa } of CAUSAS_CON_EJEMPLO) {
    it(`«${causa.causa}» tiene frase propia, y dice dónde se arregla`, () => {
      const frase = motivoDeBloqueo(causa);
      expect(frase.trim()).not.toBe("");
      // «No se puede» a secas no dice nada: quien lee está mirando una pantalla que le acaba de
      // negar algo, y con eso solo puede irse a buscar por su cuenta.
      expect(frase).not.toMatch(/^\s*no se puede[.!]?\s*$/i);
      expect(frase.length).toBeGreaterThan(60);
      // Y nombra el sitio donde se arregla: Ajustes (el inventario del equipo), XOne Studio (el
      // proyecto) o la pastilla del compositor (la elección de la sesión).
      expect(frase).toMatch(/Ajustes|XOne Studio|compositor/);
    });
  }

  it("la frase del fichero que falta dice de dónde sale la base y qué pasa si se ignora", () => {
    // Es la que justifica toda la pestaña, y no puede mandar a nadie a buscar sola ni dejar
    // creer que el fichero lo pone xonecode.
    const frase = motivoDeBloqueo({ causa: "falta-el-fichero-de-la-conexion", connstring: "bd/gestion.db" });
    expect(frase).toContain("bd/gestion.db");
    expect(frase).toContain("XOneCode no la crea");
    expect(frase).toContain("XOne Studio");
    expect(frase).toContain("Error opening database");
  });

  it("la de la base por defecto dice que es la de POR DEFECTO, y reconoce su falso positivo", () => {
    const frase = motivoDeBloqueo({ causa: "falta-la-base" });
    expect(frase).toContain("bd/gestion.db");
    expect(frase).toContain("POR DEFECTO");
    expect(frase).toContain("XOneCode no la crea");
    expect(frase).toContain("Error opening database");
    // Y la única frase del catálogo que admite que puede estar equivocada: el fichero se mira
    // en el proyecto y una app ya lanzada en ese aparato tiene allí su copia. Callarlo dejaría
    // a quien la lee sin salida por un bloqueo que no lo es.
    expect(frase).toContain("Se mira el proyecto, no el aparato");
  });

  it("las frases que llevan un dato lo dicen: el nombre, el connstring o la plataforma", () => {
    expect(motivoDeBloqueo({ causa: "dispositivo-no-alcanzable", nombre: "Pixel 8", estado: "offline" })).toContain(
      "Pixel 8",
    );
    // El estado se escribe como se lee en la ventana, no como se llama en el código.
    expect(motivoDeBloqueo({ causa: "dispositivo-no-alcanzable", nombre: "Pixel 8", estado: "offline" })).toContain(
      "«offline»",
    );
    expect(
      motivoDeBloqueo({ causa: "dispositivo-no-alcanzable", nombre: "Pixel 8", estado: "sin-autorizar" }),
    ).toContain("«sin autorizar»");
    expect(motivoDeBloqueo({ causa: "framework-ausente", nombre: "iPhone 16" })).toContain("iPhone 16");
    expect(motivoDeBloqueo({ causa: "app-xml-ilegible", motivo: "EACCES" })).toContain("EACCES");
    expect(motivoDeBloqueo({ causa: "plataforma-sin-camino", plataforma: "ios" })).toContain("iOS");
  });

  it("ninguna frase se repite: dos causas distintas no se arreglan igual", () => {
    const frases = CAUSAS_CON_EJEMPLO.map(({ causa }) => motivoDeBloqueo(causa));
    expect(new Set(frases).size).toBe(frases.length);
  });
});
