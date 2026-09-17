import { describe, it, expect } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indiceEnDisco } from "./indiceEnDisco.js";

/**
 * **La precisión del índice, contra un oráculo que NO comparte implementación.**
 *
 * La verdad se extrae de los `.xne` leyéndolos como TEXTO, no con `xone-linter`. Si se sacara
 * con el linter estaríamos comprobando el código contra sí mismo, que es la forma más cómoda
 * de tener un test verde sobre un índice equivocado. Dos caminos distintos que coinciden sí
 * dicen algo.
 *
 * El oráculo es deliberadamente tonto —regex sobre el texto— y por eso el fixture es rico
 * pero no retorcido: lo que se comprueba es que el índice no pierde ni inventa lo que está a
 * la vista. Las diferencias donde el oráculo tonto se equivocaría (XML anidado raro, CDATA)
 * quedan fuera a propósito: ahí el oráculo no es autoridad.
 *
 * **Esto se corrió además contra un proyecto REAL de 42 colecciones** y dio exacto: mismas
 * colecciones, mismos ficheros, mismos campos, mismas referencias. Lo que aquel proyecto sí
 * destapó fue un HUECO y no un error — una referencia a una colección que no existe, que el
 * índice guarda y ninguna operación sabe buscar (`evals/preguntasDeNavegacion.ts`).
 */

/**
 * Un proyecto con las cuatro relaciones que XOne usa de verdad, y con su FORMA real.
 *
 * La primera versión de este fixture inventaba la forma —`<colls>` y `<prop>` colgando
 * directamente de `<coll>`— y el índice solo cogía la primera colección. **No era un fallo del
 * índice: era un fixture que no es XOne**, y lo destapó justamente el oráculo. Copiado ahora
 * de un proyecto real: los `<prop>` viven dentro de `<group>` (y a veces de un `<frame>`
 * dentro del grupo), y un fichero con varias colecciones las cuelga de
 * `<xml><collprops>`. Un fixture con una forma que no existe prueba que sabemos leer XML, no
 * que sabemos leer XOne.
 */
function proyectoRico(): string {
  const raiz = mkdtempSync(join(tmpdir(), "precision-xone-"));
  writeFileSync(
    join(raiz, "app.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<app name="Demo">
  <include file="Clientes.xne"/>
  <include file="Pedidos.xne"/>
  <include file="Lineas.xne"/>
  <include file="mappings.xne"/>
</app>
`
  );
  // Props dentro de un `<frame>` dentro de un `<group>`, como el proyecto real.
  writeFileSync(
    join(raiz, "Clientes.xne"),
    `<?xml version="1.0" encoding="UTF-8"?>
<coll name="Clientes" title="Clientes" sql="SELECT * FROM ##PREF##Clientes">
    <group name="General" id="1">
        <frame name="frmDatos" id="frmDatos">
            <prop name="ID" type="N" visible="0"/>
            <prop name="NOMBRE" type="T" title="Nombre"/>
            <prop name="EMAIL" type="T" title="Email"/>
        </frame>
    </group>
</coll>
`
  );
  writeFileSync(
    join(raiz, "Pedidos.xne"),
    `<?xml version="1.0" encoding="UTF-8"?>
<coll name="Pedidos" title="Pedidos" sql="SELECT * FROM ##PREF##Pedidos">
    <group name="General" id="1">
        <prop name="ID" type="N"/>
        <prop name="CLIENTE" type="N" mapcol="Clientes" mapfld="NOMBRE"/>
        <prop name="COMERCIAL" type="N" mapcol="Clientes" linkedfield="ID"/>
    </group>
    <contents name="det" src="Lineas"/>
</coll>
`
  );
  writeFileSync(
    join(raiz, "Lineas.xne"),
    `<?xml version="1.0" encoding="UTF-8"?>
<coll name="Lineas" title="Lineas" inherits="Pedidos" sql="SELECT * FROM ##PREF##Lineas">
    <group name="General" id="1">
        <prop name="CANTIDAD" type="N"/>
    </group>
</coll>
`
  );
  // Dos colecciones en UN fichero, con la forma real de `mappings.xne`: es el caso que hace
  // que buscar por nombre de fichero no sirva para encontrar una declaración.
  writeFileSync(
    join(raiz, "mappings.xne"),
    `<?xml version="1.0" encoding="UTF-8"?>
<xml>
  <collprops type="general">
    <coll name="Empresas" title="Empresa" sql="select e.* from ##PREF##empresa e" objname="empresa">
      <group name="General" id="1">
        <prop name="ID" type="N"/>
        <prop name="NOMBRE" type="T"/>
      </group>
    </coll>
    <coll name="Usuarios" title="usuario" sql="select u.* from ##PREF##usuarios u" objname="usuarios">
      <group name="General" id="1">
        <prop name="IDEMPRESA" type="N" mapcol="Empresas" mapfld="ID"/>
        <prop name="LOGIN" type="T"/>
      </group>
    </coll>
  </collprops>
</xml>
`
  );
  return raiz;
}

/** La verdad, sacada del TEXTO. Otro camino, a propósito. */
function oraculo(raiz: string): {
  colls: Map<string, string>;
  campos: Map<string, Set<string>>;
  refs: Set<string>;
} {
  const colls = new Map<string, string>();
  const campos = new Map<string, Set<string>>();
  const refs = new Set<string>();

  for (const f of readdirSync(raiz)) {
    if (!f.endsWith(".xne")) continue;
    const texto = readFileSync(join(raiz, f), "utf8");
    const virtual = `/${f}`;
    const aperturas = [...texto.matchAll(/<coll\b([^>]*)>/gi)];
    for (let i = 0; i < aperturas.length; i++) {
      const attrs = aperturas[i]![1]!;
      const nombre = /\bname\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
      if (!nombre) continue;
      colls.set(nombre, virtual);

      const desde = aperturas[i]!.index! + aperturas[i]![0]!.length;
      const hasta = i + 1 < aperturas.length ? aperturas[i + 1]!.index! : texto.length;
      const cuerpo = texto.slice(desde, hasta);

      const hereda = /\binherits\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
      if (hereda) refs.add(`${nombre}|inherits|${hereda}`);

      const suyos = new Set<string>();
      for (const p of cuerpo.matchAll(/<prop\b([^>]*)\/?>/gi)) {
        const a = p[1]!;
        const n = /\bname\s*=\s*"([^"]*)"/i.exec(a)?.[1];
        if (!n) continue;
        suyos.add(n);
        const mapcol = /\bmapcol\s*=\s*"([^"]*)"/i.exec(a)?.[1];
        if (!mapcol) continue;
        refs.add(`${nombre}.${n}|mapcol|${mapcol}`);
        for (const clave of ["mapfld", "linkedfield"] as const) {
          const v = new RegExp(`\\b${clave}\\s*=\\s*"([^"]*)"`, "i").exec(a)?.[1];
          if (v) refs.add(`${nombre}.${n}|${clave}|${mapcol}.${v}`);
        }
      }
      campos.set(nombre, suyos);

      for (const c of cuerpo.matchAll(/<contents\b([^>]*)\/?>/gi)) {
        const src = /\bsrc\s*=\s*"([^"]*)"/i.exec(c[1]!)?.[1];
        if (src) refs.add(`${nombre}|contents|${src}`);
      }
    }
  }
  return { colls, campos, refs };
}

describe("precisión del índice contra un oráculo independiente", () => {
  it("ni pierde ni inventa colecciones, y las pone en su fichero", async () => {
    const raiz = proyectoRico();
    const indice = await indiceEnDisco(raiz)(new Set(readdirSync(raiz).map((f) => `/${f}`)));
    const v = oraculo(raiz);

    const delIndice = new Map(indice.inventario().map((d) => [d.nombre, d.fichero]));
    expect([...delIndice.keys()].sort()).toEqual([...v.colls.keys()].sort());
    for (const [nombre, fichero] of v.colls) {
      expect(delIndice.get(nombre), `fichero de ${nombre}`).toBe(fichero);
    }
  });

  it("dos colecciones en UN fichero salen las dos, cada una con su nombre", async () => {
    // El caso de `mappings.xne`: buscar por nombre de fichero no las encuentra, y es
    // exactamente por lo que la pregunta «¿dónde está Empresas?» merece una tool.
    const raiz = proyectoRico();
    const indice = await indiceEnDisco(raiz)(new Set(readdirSync(raiz).map((f) => `/${f}`)));
    expect(indice.definicion("Empresas").map((d) => d.fichero)).toEqual(["/mappings.xne"]);
    expect(indice.definicion("Usuarios").map((d) => d.fichero)).toEqual(["/mappings.xne"]);
  });

  it("los campos de cada colección cuadran con los del texto", async () => {
    const raiz = proyectoRico();
    const indice = await indiceEnDisco(raiz)(new Set(readdirSync(raiz).map((f) => `/${f}`)));
    const v = oraculo(raiz);
    for (const [coll, esperados] of v.campos) {
      const suyos = indice.campos(coll).map((c) => c.nombre).sort();
      expect(suyos, `campos de ${coll}`).toEqual([...esperados].sort());
    }
  });

  it("las CUATRO relaciones salen todas, y ninguna de más", async () => {
    const raiz = proyectoRico();
    const indice = await indiceEnDisco(raiz)(new Set(readdirSync(raiz).map((f) => `/${f}`)));
    const v = oraculo(raiz);

    // Se pregunta por TODO lo que el oráculo ve como destino, incluidas las colecciones que
    // no existen: preguntar solo por las conocidas fue el fallo de la primera auditoría —
    // daba una referencia por perdida que en realidad estaba.
    const destinos = new Set([...v.refs].map((r) => r.split("|")[2]!.split(".")[0]!));
    const delIndice = new Set<string>();
    for (const d of destinos) {
      for (const r of indice.referencias(d)) delIndice.add(`${r.desde}|${r.por}|${r.hacia}`);
    }
    expect([...delIndice].sort()).toEqual([...v.refs].sort());
  });

  it("una referencia a una colección que NO existe se conserva, no se descarta", async () => {
    // El índice no es un validador: si el `.xne` apunta a algo que no está, eso es un dato
    // del proyecto —el linter lo reporta como error— y tirarlo escondería justo el fallo.
    // Encontrado en un proyecto real (`contents src="OperQueue"`).
    const raiz = proyectoRico();
    writeFileSync(
      join(raiz, "Rota.xne"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<coll name="Rota" sql="select * from r">\n  <group name="General" id="1"/>\n  <contents name="x" src="NoExiste"/>\n</coll>\n`
    );
    writeFileSync(
      join(raiz, "app.xml"),
      `<?xml version="1.0" encoding="utf-8"?>\n<app name="Demo">\n  <include file="Rota.xne"/>\n</app>\n`
    );
    const indice = await indiceEnDisco(raiz)(new Set(readdirSync(raiz).map((f) => `/${f}`)));
    expect(indice.definicion("NoExiste")).toEqual([]);
    expect(indice.referencias("NoExiste")).toEqual([
      { desde: "Rota", por: "contents", hacia: "NoExiste", fichero: "/Rota.xne" },
    ]);
  });
});
