import { describe, expect, it } from "vitest";
import {
  motivoDelRechazo,
  TOPE_DE_HALLAZGOS,
  veredictoDeEscritura,
  type HallazgoDeEscritura,
} from "./validacionDeEscritura.js";

const h = (codigo: string, linea?: number, mensaje = "lo que sea"): HallazgoDeEscritura => ({
  codigo,
  mensaje,
  ...(linea === undefined ? {} : { linea }),
});

describe("veredictoDeEscritura", () => {
  it("un fichero nuevo no tiene nada preexistente: todo es suyo", () => {
    const v = veredictoDeEscritura(undefined, [h("XML_MALFORMED", 5)]);
    expect(v.introducidos).toHaveLength(1);
    expect(v.preexistentes).toHaveLength(0);
  });

  it("sin hallazgos nuevos no hay nada que rechazar", () => {
    const v = veredictoDeEscritura([h("CSS_WEB_PROPERTY", 7)], [h("CSS_WEB_PROPERTY", 7)]);
    expect(v.introducidos).toHaveLength(0);
    expect(v.preexistentes).toHaveLength(1);
  });

  /**
   * **La decisión que hace esto usable.** Medido sobre siete proyectos reales: quedan
   * hallazgos en ficheros que están en producción. Si la guarda mirase solo el contenido
   * nuevo, editar uno de ellos para arreglar OTRA cosa se rechazaría por algo que el agente
   * no escribió — y ésa es la guarda que se desactiva al segundo día.
   */
  it("lo que ya estaba no bloquea, aunque siga estando", () => {
    const antes = [h("PROP_MISSING_TYPE", 42), h("CSS_WEB_PROPERTY", 7)];
    const despues = [h("PROP_MISSING_TYPE", 42), h("CSS_WEB_PROPERTY", 7), h("XML_MALFORMED", 3)];

    const v = veredictoDeEscritura(antes, despues);

    expect(v.introducidos.map((x) => x.codigo)).toEqual(["XML_MALFORMED"]);
    expect(v.preexistentes).toHaveLength(2);
  });

  /** Arreglar algo tampoco es introducir nada. */
  it("si la escritura QUITA hallazgos, no introduce ninguno", () => {
    const v = veredictoDeEscritura([h("A", 1), h("B", 2)], [h("A", 1)]);
    expect(v.introducidos).toHaveLength(0);
  });

  /**
   * **Se descuenta por MULTIPLICIDAD, no con un `Set`.** Si antes había un `font-size` y
   * ahora hay dos, el segundo es nuevo; con un conjunto, todas las repeticiones a partir de
   * la primera colarían para siempre.
   */
  it("el segundo hallazgo igual SÍ es nuevo", () => {
    const v = veredictoDeEscritura([h("CSS_WEB_PROPERTY", 7)], [h("CSS_WEB_PROPERTY", 7), h("CSS_WEB_PROPERTY", 7)]);
    expect(v.introducidos).toHaveLength(1);
    expect(v.preexistentes).toHaveLength(1);
  });

  /**
   * La huella es CÓDIGO + LÍNEA, nunca el mensaje: el mensaje lleva el nombre de la prop o el
   * fragmento y cambia en cuanto se toca la línea de al lado, y entonces un hallazgo que ya
   * estaba se leería como nuevo.
   */
  it("la huella no depende del mensaje", () => {
    const v = veredictoDeEscritura(
      [h("CSS_WEB_PROPERTY", 7, "decía una cosa")],
      [h("CSS_WEB_PROPERTY", 7, "ahora dice otra")],
    );
    expect(v.introducidos).toHaveLength(0);
  });

  /** Pero SÍ de la línea: el mismo fallo cuatro líneas más abajo es otro sitio. */
  it("el mismo código en otra línea es un hallazgo nuevo", () => {
    const v = veredictoDeEscritura([h("CSS_WEB_PROPERTY", 7)], [h("CSS_WEB_PROPERTY", 11)]);
    expect(v.introducidos).toHaveLength(1);
  });

  /** Un hallazgo sin línea sigue teniendo huella estable. */
  it("los que no sitúan línea también se comparan", () => {
    const v = veredictoDeEscritura([h("COLL_UNREADABLE")], [h("COLL_UNREADABLE")]);
    expect(v.introducidos).toHaveLength(0);
  });
});

describe("motivoDelRechazo", () => {
  it("dice que NO se ha escrito nada, y lleva código, línea y mensaje", () => {
    const texto = motivoDelRechazo("/calculadora.css", [
      h("CSS_WEB_PROPERTY", 3, '"font-size" es CSS web; en XOne es "fontsize"'),
    ]);

    expect(texto).toContain("/calculadora.css");
    expect(texto).toMatch(/no hay nada a medias/i);
    expect(texto).toContain("CSS_WEB_PROPERTY");
    expect(texto).toContain("línea 3");
    expect(texto).toContain("fontsize");
  });

  /** Una lista recortada en silencio se lee como la lista entera. */
  it("lo que no cabe se CUENTA", () => {
    const muchos = Array.from({ length: TOPE_DE_HALLAZGOS + 4 }, (_, i) => h("X", i));
    const texto = motivoDelRechazo("/a.xne", muchos);
    expect(texto).toMatch(/y 4 más/);
  });

  /**
   * **No nombra lo preexistente**: es ruido para quien viene a arreglar otra cosa, e invita a
   * tocar lo que nadie ha pedido — la deriva que este repo ya ha pagado tres veces.
   */
  it("el motivo solo habla de lo introducido", () => {
    const texto = motivoDelRechazo("/a.xne", [h("NUEVO", 1, "esto es nuevo")]);
    expect(texto).not.toMatch(/preexistente|ya estaba/i);
  });

  it("con un solo problema no habla en plural", () => {
    expect(motivoDelRechazo("/a.xne", [h("X", 1)])).toMatch(/introduce un problema que antes no estaba\./);
  });
});
