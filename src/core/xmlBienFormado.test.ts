import { describe, expect, it } from "vitest";
import { generarEsqueleto } from "./esqueleto.js";
import { comprobarXml } from "./xmlBienFormado.js";

const COLL = `<?xml version="1.0" encoding="utf-8"?>
<coll name="Inicio" title="Inicio">
  <!-- un comentario -->
  <group name="General" id="1">
    <prop name="MAP_A" type="T" title="Año &amp; más &#233;"/>
    <frame name="f1" onclick="inicioIr('perfil');">
      <prop name="MAP_B" type="B"></prop>
    </frame>
  </group>
  <onclick><![CDATA[ if (a < b && c) {} ]]></onclick>
</coll>
`;

const sin = (busca: string, pon: string): string => {
  expect(COLL.includes(busca)).toBe(true);
  return COLL.replace(busca, pon);
};

describe("comprobarXml", () => {
  it("un .xne bien formado (prólogo, comentario, entidades, CDATA, comillas simples, BOM) es ok", () => {
    expect(comprobarXml(COLL)).toEqual({ ok: true });
    expect(comprobarXml(`﻿${COLL}`)).toEqual({ ok: true });
  });

  it("el caso del soporte: un atributo SIN su «=» se dice con su línea y columna", () => {
    expect(comprobarXml(sin('<prop name="MAP_A"', '<prop visible name="MAP_A"'))).toEqual({
      ok: false,
      linea: 5,
      columna: 19,
      motivo: "al atributo «visible» le falta el «=» y su valor",
    });
  });

  it("cada forma de romperlo, con su motivo", () => {
    const motivo = (x: string): string => {
      const r = comprobarXml(x);
      return r.ok ? "ok" : r.motivo;
    };
    expect(motivo(sin("</frame>", "</frmae>"))).toContain("no cierra la etiqueta abierta, que es «<frame>»");
    expect(motivo(sin("</coll>", ""))).toContain("«<coll>» se abre y no se cierra");
    expect(motivo(sin('type="T"', "type=T"))).toContain("entre comillas");
    expect(motivo('<a b="x>')).toContain("no cierra su comilla");
    expect(motivo(sin('type="B"', 'type="B" type="X"'))).toContain("está repetido");
    expect(motivo(sin('name="MAP_B" type="B"', 'name="MAP_B"type="B"'))).toContain("falta un espacio");
    expect(motivo(sin("&amp;", "&"))).toContain("un «&» suelto");
    expect(motivo(sin("&amp;", "&nbsp;"))).toContain("entidad desconocida «&nbsp;»");
    expect(motivo(sin("un comentario", "un -- comentario"))).toContain("«--» dentro de un comentario");
    expect(motivo(sin("<!-- un comentario -->", "<!-- sin cerrar"))).toContain("no se cierra con «-->»");
    expect(motivo(sin('title="Inicio"', 'title="a<b"'))).toContain("un «<» dentro del valor");
    expect(motivo(`${COLL}<otra/>`)).toContain("un segundo elemento raíz");
    expect(motivo(`texto${COLL}`)).toContain("texto antes del elemento raíz");
    expect(motivo("")).toContain("no hay ningún elemento raíz");
  });

  it("la línea y la columna cuentan desde 1, como el parser de Studio", () => {
    expect(comprobarXml("<a>\n  <b>\n</a>")).toMatchObject({ ok: false, linea: 3, columna: 1 });
  });

  it("todo el XML que genera el esqueleto de un proyecto nuevo está bien formado", () => {
    for (const login of [true, false]) {
      const fichas = generarEsqueleto({ nombre: "Prueba", titulo: "Prueba", orientacion: "portrait", login });
      const xml = fichas.filter((f) => /\.(xne|xml)$/.test(f.ruta));
      expect(xml.length).toBeGreaterThan(0);
      for (const f of xml) expect({ ruta: f.ruta, ...comprobarXml(f.contenido) }).toEqual({ ruta: f.ruta, ok: true });
    }
  });
});
