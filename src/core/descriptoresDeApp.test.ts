import { describe, expect, it } from "vitest";
import {
  TOPE_DE_XML,
  conexionesDeApp,
  esRutaDeFichero,
  nombreDeApp,
} from "./descriptoresDeApp.js";

/**
 * Los `app.xml` de aquí son RECORTES de ficheros reales, copiados tal cual —incluidos el
 * prólogo con su `encoding` y los comentarios—, porque lo que estas pruebas fijan es el censo
 * del 2026-09-16 y no una forma inventada: `~/Downloads/Replanteos_2026`, `MyAllXOne`,
 * `MinitsMT` y `.xonecode/webstudio/workspace/AppDemo`.
 */
const PROLOGO = `<?xml version="1.0" encoding="iso-8859-15" standalone="yes"?>\n<xml>\n`;

/** El del esqueleto de `core/esqueleto.ts`: una sola conexión, y es una RUTA. */
const APP_XML_DEL_ESQUELETO = `${PROLOGO}<app prefix="gen" version="1.0.0" debug="true">
        <connection name="main" connstring="bd/gestion.db" />
        <entry-point>
            <item name="EntradaApp" conditions="" />
        </entry-point>
        <style url="default.css" encoding="UTF-8" />
    </app>
</xml>
`;

/** El de Replanteos_2026: una sola conexión, y es de PROVEEDOR. */
const APP_XML_DE_REPLANTEOS = `${PROLOGO}  <app prefix="gen" version="2.0.4.4" debug="true">
    <connection name="ReplicaFilesConnection" connstring="Provider=Xone Remote Provider;ProgID=com.xone.db.impl.replicafiles.RplFilesConnection" objname="master_replica_files" updateobj="master_replica_files" progid="ASData.CASBasicDataObj" />
  </app>
</xml>
`;

describe("conexionesDeApp", () => {
  it("lee la conexión del esqueleto, que es una ruta", () => {
    expect(conexionesDeApp(APP_XML_DEL_ESQUELETO)).toEqual([
      { nombre: "main", connstring: "bd/gestion.db" },
    ]);
  });

  it("lee la de Replanteos_2026, que es una cadena de proveedor", () => {
    const conexiones = conexionesDeApp(APP_XML_DE_REPLANTEOS);
    expect(conexiones).toHaveLength(1);
    expect(conexiones[0]!.nombre).toBe("ReplicaFilesConnection");
    expect(conexiones[0]!.connstring).toContain("Provider=Xone Remote Provider");
    // El valor va tal cual: los `objname`/`progid` de la etiqueta no entran, y el `connstring`
    // no se recorta ni se normaliza.
    expect(conexiones[0]!.connstring).toBe(
      "Provider=Xone Remote Provider;ProgID=com.xone.db.impl.replicafiles.RplFilesConnection",
    );
  });

  /**
   * El caso MyAllXOne: dos conexiones, la segunda con un `=` DENTRO del valor (`Data
   * Source=http://…`) y la primera con un `prefix=""` delante del `name`. El orden de
   * aparición y un `=` que no es el separador son las dos cosas que se rompen solas.
   */
  it("devuelve varias en orden de aparición, con `=` dentro del valor", () => {
    const xml = `${PROLOGO}  <app prefix="gen" version="0.0.2.604">
    <connection prefix="" name="Info_ReplicaFiles" connstring="Provider=Xone Remote Provider;Data Source=local;ProgID=com.xone.db.impl.replicafiles.RplFilesConnection;Timeout=60" />
    <connection name="json" datemask="ymd" connstring="Provider=Xone Remote Provider;Data Source=http://xoneisp.com/XOneJSONAllbyXOne/default.aspx;ProgID=com.xone.db.json.JSONConnection;Timeout=60;Security Level=0" />
  </app>
</xml>
`;
    const conexiones = conexionesDeApp(xml);
    expect(conexiones.map((c) => c.nombre)).toEqual(["Info_ReplicaFiles", "json"]);
    expect(conexiones[1]!.connstring).toContain("Data Source=http://xoneisp.com");
  });

  it("no ve una conexión comentada", () => {
    const xml = `${PROLOGO}  <app prefix="gen">
    <!--  Conexiones utilizadas en el proyecto.  -->
    <!-- <connection name="comentada" connstring="bd/comentada.db" /> -->
    <!--
    <connection name="enVariasLineas" connstring="bd/otra.db" />
    -->
    <connection name="real" connstring="bd/gestion.db" />
  </app>
</xml>
`;
    expect(conexionesDeApp(xml)).toEqual([{ nombre: "real", connstring: "bd/gestion.db" }]);
  });

  it("no ve una conexión dentro de un CDATA", () => {
    const xml = `${PROLOGO}  <app prefix="gen">
    <include file="x.js" language="javascript" />
    <script><![CDATA[
        var plantilla = '<connection name="falsa" connstring="bd/falsa.db" />';
    ]]></script>
    <connection name="real" connstring="bd/gestion.db" />
  </app>
</xml>
`;
    expect(conexionesDeApp(xml).map((c) => c.nombre)).toEqual(["real"]);
  });

  it("no ve una conexión en el prólogo ni en el DOCTYPE", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE xml [<!ENTITY c "x>y<connection name='falsa' connstring='bd/falsa.db' />">]>
<xml>
  <app prefix="gen">
    <connection name="real" connstring="bd/gestion.db" />
  </app>
</xml>
`;
    expect(conexionesDeApp(xml)).toEqual([{ nombre: "real", connstring: "bd/gestion.db" }]);
  });

  it("un app.xml sin ninguna conexión devuelve la lista vacía (AppDemo, MinitsMT, Replanteos medidos)", () => {
    expect(conexionesDeApp(`${PROLOGO}  <app prefix="gen" version="1.0.0">
    <entry-point><item name="EntradaApp" conditions="" /></entry-point>
  </app>
</xml>
`)).toEqual([]);
    expect(conexionesDeApp("")).toEqual([]);
    expect(conexionesDeApp("<xml></xml>")).toEqual([]);
  });

  it("entiende comillas simples, espacios alrededor del `=` y atributos sin comillas", () => {
    expect(conexionesDeApp("<connection name='simple' connstring='bd/gestion.db' />")).toEqual([
      { nombre: "simple", connstring: "bd/gestion.db" },
    ]);
    expect(conexionesDeApp('<connection name = "espaciado" connstring = "bd/gestion.db" />')).toEqual(
      [{ nombre: "espaciado", connstring: "bd/gestion.db" }],
    );
    expect(conexionesDeApp("<connection name=desnudo connstring=bd/gestion.db />")).toEqual([
      { nombre: "desnudo", connstring: "bd/gestion.db" },
    ]);
  });

  it("no desescapa entidades: el valor es lo que dice el fichero", () => {
    // Desescapar sería inventar una ruta que XOne no va a abrir.
    expect(conexionesDeApp('<connection name="a&amp;b" connstring="bd/ges&amp;tion.db" />')).toEqual(
      [{ nombre: "a&amp;b", connstring: "bd/ges&amp;tion.db" }],
    );
  });

  it("una conexión sin `connstring` sale con la cadena vacía, no se descarta", () => {
    expect(conexionesDeApp('<connection name="sola" />')).toEqual([
      { nombre: "sola", connstring: "" },
    ]);
  });

  it("tolera atributos repartidos en varias líneas (la forma del `<app>` de MinitsMT)", () => {
    const xml = `${PROLOGO}<app prefix="gen"
    version="08.01.2026.8"
    debug="true"
    load-wait="false"
    >
    <connection
        name="MTDatosOnline"
        datemask="ymd"
        connstring="Provider=Xone Remote Provider;ProgID=com.xone.db.json.JSONConnection;Timeout=15"
        />
    <connection name="NoReplica" connstring="bd/gestion.db" />
</app>
</xml>
`;
    const conexiones = conexionesDeApp(xml);
    expect(conexiones.map((c) => c.nombre)).toEqual(["MTDatosOnline", "NoReplica"]);
    expect(conexiones[0]!.connstring).toContain("ProgID=com.xone.db.json.JSONConnection");
    expect(conexiones[1]!.connstring).toBe("bd/gestion.db");
  });

  it("un `>` dentro de un valor entrecomillado no cierra la etiqueta", () => {
    expect(
      conexionesDeApp('<connection name="raro" connstring="Provider=x;Proxy=1>0;b=y" />'),
    ).toEqual([{ nombre: "raro", connstring: "Provider=x;Proxy=1>0;b=y" }]);
  });

  it("un `<connection` sin cerrar NO cuelga, y conserva lo que se pudo leer", () => {
    expect(conexionesDeApp('<connection name="truncada" connstring="bd/gestion.db"')).toEqual([
      { nombre: "truncada", connstring: "bd/gestion.db" },
    ]);
  });

  it("un `<` suelto o un comentario sin cerrar tampoco cuelgan", () => {
    expect(conexionesDeApp("<app>if (a < b) { return 1; }</app>")).toEqual([]);
    expect(conexionesDeApp('<app><!-- sin cerrar <connection name="x" connstring="y" />')).toEqual(
      [],
    );
    // La conexión se declara —que es el dato que importa— y el valor queda vacío porque una
    // comilla sin cerrar no dice dónde acaba: inventarse el `b` sería afirmar una ruta que
    // nadie escribió.
    expect(conexionesDeApp('<connection name="a" connstring="b')).toEqual([
      { nombre: "a", connstring: "" },
    ]);
  });

  it("por encima de TOPE_DE_XML devuelve lo encontrado y para", () => {
    const relleno = `<!-- ${"x".repeat(TOPE_DE_XML)} -->`;
    const xml = `<connection name="pronto" connstring="bd/gestion.db" />${relleno}<connection name="tarde" connstring="bd/otra.db" />`;
    expect(xml.length).toBeGreaterThan(TOPE_DE_XML);
    expect(conexionesDeApp(xml)).toEqual([{ nombre: "pronto", connstring: "bd/gestion.db" }]);
  });

  it("el nombre de la etiqueta se compara entero: `connections` no es `connection`", () => {
    expect(conexionesDeApp('<connections name="x" connstring="y" />')).toEqual([]);
    expect(conexionesDeApp('<connectionless name="x" connstring="y" />')).toEqual([]);
    // Y una etiqueta de CIERRE no declara nada.
    expect(conexionesDeApp("<app></connection></app>")).toEqual([]);
    // Un atributo que solo se llama parecido tampoco.
    expect(conexionesDeApp('<connection xname="x" xconnstring="y" />')).toEqual([
      { nombre: "", connstring: "" },
    ]);
  });
});

describe("nombreDeApp", () => {
  it("lee `name=` en MINÚSCULA, que es como lo escriben los proyectos reales", () => {
    // Replanteos_2026/app.ini, tal cual.
    expect(
      nombreDeApp(
        "Environment=Pro\nname=Replanteos_2026\nicon=icon.png\nIconFolder=icons\nFilesFolder=files\nTitle=Replanteos_2026\nCaption=Replanteos_2026\n",
      ),
    ).toBe("Replanteos_2026");
    expect(nombreDeApp("name=MyAllXOne\nicon=icon.png\nTitle=MyAllXOne\n")).toBe("MyAllXOne");
    expect(nombreDeApp("name=AppDemo\nicon=icon.png\n")).toBe("AppDemo");
  });

  it("y `Name=` en MAYÚSCULA, que es como lo escribe el esqueleto de xonecode", () => {
    expect(nombreDeApp("Name=MiApp\nTitle=Mi App\nCaption=Mi App\n")).toBe("MiApp");
    // Cualquier mezcla, porque el censo tiene las dos y el fichero es el mismo.
    expect(nombreDeApp("nAmE=Mixta\n")).toBe("Mixta");
    expect(nombreDeApp("NAME=Gritona\n")).toBe("Gritona");
  });

  it("salta las líneas sin `=`, que el app.ini de AppDemo tiene", () => {
    expect(
      nombreDeApp(
        "name=AppDemo\nicon=icon.png\nIconFolder=icons\nFilesFolder=files\nTitle=AppDemo\nCaption=AppDemo\nvoConHuella\nCaption=LoginNuevoConHuella\n",
      ),
    ).toBe("AppDemo");
  });

  it("recorta, y lo vacío es `undefined`", () => {
    expect(nombreDeApp("name=  ConEspacios  \n")).toBe("ConEspacios");
    expect(nombreDeApp("name=\nTitle=x\n")).toBeUndefined();
    expect(nombreDeApp("name=   \n")).toBeUndefined();
    expect(nombreDeApp("Environment=Pro\nTitle=x\n")).toBeUndefined();
    expect(nombreDeApp("")).toBeUndefined();
  });

  it("`Name` a secas no cuela: la clave se compara entera", () => {
    expect(nombreDeApp("Filename=otra_cosa\n")).toBeUndefined();
    expect(nombreDeApp("DisplayName=Otra\n")).toBeUndefined();
  });

  it("aguanta el CRLF de un fichero tocado en Windows", () => {
    expect(nombreDeApp("Environment=Pro\r\nname=ConRetorno\r\nTitle=x\r\n")).toBe("ConRetorno");
  });
});

describe("esRutaDeFichero: el predicado que separa una ruta de una cadena de proveedor", () => {
  it("`bd/gestion.db` es una ruta: es la del esqueleto y la de la conexión local de MinitsMT", () => {
    expect(esRutaDeFichero("bd/gestion.db")).toBe(true);
    expect(esRutaDeFichero("  bd/gestion.db  ")).toBe(true);
    expect(esRutaDeFichero("../datos/gestion.db")).toBe(true);
    expect(esRutaDeFichero("BD/GESTION.DB")).toBe(true);
  });

  it("una cadena de proveedor NO es una ruta, y estos proyectos arrancan perfectamente", () => {
    // Los tres `connstring` de proveedor medidos, literalmente.
    expect(
      esRutaDeFichero(
        "Provider=Xone Remote Provider;ProgID=com.xone.db.impl.replicafiles.RplFilesConnection",
      ),
    ).toBe(false);
    expect(
      esRutaDeFichero(
        "Provider=Xone Remote Provider;ProgID=com.xone.db.json.JSONConnection;Content-Type=application/json;Timeout=15;Security Level=2;Auth=true",
      ),
    ).toBe(false);
    expect(
      esRutaDeFichero(
        "Provider=Xone Remote Provider;Data Source=http://xoneisp.com/XOneJSONAllbyXOne/default.aspx;ProgID=com.xone.db.json.JSONConnection;Timeout=60;Security Level=0",
      ),
    ).toBe(false);
  });

  it("los tres descartes son por forma: `;`, `=` o `://`", () => {
    expect(esRutaDeFichero("bd/gestion.db;Cache=Shared")).toBe(false);
    expect(esRutaDeFichero("File=bd/gestion.db")).toBe(false);
    expect(esRutaDeFichero("http://host/bd/gestion.db")).toBe(false);
    expect(esRutaDeFichero("sqlite://bd/gestion.db")).toBe(false);
  });

  it("lo que no acaba en fichero no se afirma que sea una ruta", () => {
    expect(esRutaDeFichero("bd")).toBe(false);
    expect(esRutaDeFichero("bd/gestion")).toBe(false);
    expect(esRutaDeFichero("")).toBe(false);
    expect(esRutaDeFichero("   ")).toBe(false);
  });
});
