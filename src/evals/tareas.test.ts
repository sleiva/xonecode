import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { TAREAS, type Contexto } from "./tareas.js";
import { crearProyecto } from "../agent/crearProyecto.js";

/**
 * Los JUECES se prueban en `npm test`; el corredor no. Un juez que juzgue mal invalida el
 * eval entero sin que nadie lo note — un «ok» falso es peor que no tener eval.
 */
const tarea = (nombre: string) => TAREAS.find((t) => t.nombre === nombre)!;
const verde = { verde: true, hallazgos: [] };
const rojo = { verde: false, hallazgos: [{ code: "XML_PARSE", severidad: "error" as const, mensaje: "mal" }] };

function esqueleto(): string {
  const raiz = mkdtempSync(join(tmpdir(), "xonecode-eval-juez-"));
  crearProyecto(raiz, { nombre: "P", titulo: "P", orientacion: "portrait", login: false });
  return raiz;
}
const ctx = (raiz: string, extra: Partial<Contexto> = {}): Contexto => ({
  raiz,
  cambios: [],
  informe: verde,
  lineas: [],
  ...extra,
});

describe("los jueces del eval", () => {
  it("cada tarea tiene nombre único, petición y qué mide", () => {
    expect(new Set(TAREAS.map((t) => t.nombre)).size).toBe(TAREAS.length);
    for (const t of TAREAS) {
      expect(t.peticion.length, t.nombre).toBeGreaterThan(20);
      expect(t.mide.length, t.nombre).toBeGreaterThan(10);
    }
  });

  it("docs-no-toca: pasa sin cambios y falla si escribió", () => {
    const raiz = esqueleto();
    expect(tarea("docs-no-toca").juzgar(ctx(raiz)).ok).toBe(true);
    expect(tarea("docs-no-toca").juzgar(ctx(raiz, { cambios: [{ ruta: "app.xml", clase: "modificado" }] })).ok).toBe(false);
  });

  it("los jueces «verde y…» exigen las DOS cosas: rojo falla aunque el fichero esté bien", () => {
    const raiz = esqueleto();
    writeFileSync(join(raiz, "MenuPrincipal.xne"), '<coll><prop name="lblVersion" type="TL"/></coll>');
    expect(tarea("etiqueta-nueva").juzgar(ctx(raiz)).ok).toBe(true);
    const v = tarea("etiqueta-nueva").juzgar(ctx(raiz, { informe: rojo }));
    expect(v.ok).toBe(false);
    expect(v.motivo).toContain("XML_PARSE");
  });

  it("etiqueta-nueva: sobre el esqueleto sin tocar, falla y dice qué falta", () => {
    const v = tarea("etiqueta-nueva").juzgar(ctx(esqueleto()));
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/lblVersion/);
  });

  it("reparar-progid: `preparar` rompe de verdad el proyecto y el juez exige el arreglo exacto", () => {
    const raiz = esqueleto();
    tarea("reparar-progid").preparar!(raiz);
    // Roto: el juez no puede aprobarlo aunque el simulador (falso) diga verde.
    expect(tarea("reparar-progid").juzgar(ctx(raiz)).ok).toBe(false);
    // Arreglado, pero tocando otro fichero de paso: tampoco.
    const m = readFileSync(join(raiz, "mappings.xne"), "utf8")
      .replace('objname="Usuarios"', 'objname="Usuarios"\n              progid="ASGestion.CASUser"');
    writeFileSync(join(raiz, "mappings.xne"), m);
    expect(tarea("reparar-progid").juzgar(ctx(raiz, { cambios: [{ ruta: "mappings.xne", clase: "modificado" }, { ruta: "app.xml", clase: "modificado" }] })).ok).toBe(false);
    expect(tarea("reparar-progid").juzgar(ctx(raiz, { cambios: [{ ruta: "mappings.xne", clase: "modificado" }] })).ok).toBe(true);
  });

  it("no-inventa: escribir el atributo inventado es fallo, y no escribirlo es éxito incluso sin cambios", () => {
    const raiz = esqueleto();
    expect(tarea("no-inventa").juzgar(ctx(raiz)).ok).toBe(true);
    writeFileSync(join(raiz, "MenuPrincipal.xne"), '<coll><prop name="btnSaludo" superpoder="true"/></coll>');
    expect(tarea("no-inventa").juzgar(ctx(raiz)).ok).toBe(false);
  });

  it("coleccion-nueva: `objname=\"Clientes\"` NO engaña al juez — se mira el bloque <coll> entero", () => {
    // Medido en la primera ejecución real: el agente escribió la colección completa, con
    // NOMBRE, TELEFONO y ROWID, siguiendo el patrón de Empresas (`name="X" … objname="X"`),
    // el simulador dio verde, y el juez dijo «le falta NOMBRE» porque cortaba el texto por
    // la PRIMERA aparición de `name="Clientes"` —la del `name=` de la coll— y el trozo
    // siguiente terminaba en el `objname=`. Un juez roto tira un turno bueno.
    const raiz = esqueleto();
    const m = readFileSync(join(raiz, "mappings.xne"), "utf8").replace(
      "    </collprops>",
      `        <coll name="Clientes"
              sql="SELECT * FROM ##PREF##Clientes"
              objname="Clientes"
              updateobj="Clientes"
              loadall="true">
            <group name="General" id="1">
                <prop name="ID" type="N" visible="0" />
                <prop name="NOMBRE" type="T" visible="7" fieldsize="100" />
                <prop name="TELEFONO" type="T" visible="7" fieldsize="20" />
                <prop name="ROWID" type="T" visible="0" fieldsize="32" />
            </group>
        </coll>
    </collprops>`
    );
    writeFileSync(join(raiz, "mappings.xne"), m);
    const v = tarea("coleccion-nueva").juzgar(ctx(raiz));
    expect(v.ok, v.motivo).toBe(true);
  });

  it("escribir `.xonecode/memoria.md` NO es tocar de más: es lo que `dev.md` manda hacer", () => {
    // Medido: `reparar-progid` arregló el progid y el juez lo tiró por la memoria. Es la
    // misma exclusión que el lazo de verificación aplica en `turnoReal.ts`.
    const raiz = esqueleto();
    tarea("reparar-progid").preparar!(raiz);
    const m = readFileSync(join(raiz, "mappings.xne"), "utf8")
      .replace('objname="Usuarios"', 'objname="Usuarios"\n              progid="ASGestion.CASUser"');
    writeFileSync(join(raiz, "mappings.xne"), m);
    const cambios = [
      { ruta: "mappings.xne", clase: "modificado" as const },
      { ruta: ".xonecode/memoria.md", clase: "modificado" as const },
    ];
    expect(tarea("reparar-progid").juzgar(ctx(raiz, { cambios })).ok).toBe(true);
    expect(tarea("docs-no-toca").juzgar(ctx(raiz, { cambios: [cambios[1]!] })).ok).toBe(true);
  });
});
