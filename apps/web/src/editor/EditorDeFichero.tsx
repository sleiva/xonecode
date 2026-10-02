import { useCallback, useEffect, useRef, useState } from "react";
import { EditorState, Prec, RangeSet, StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  WidgetType,
  drawSelection,
  gutter,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type DecorationSet,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { classHighlighter } from "@lezer/highlight";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import type { BaseDelFichero, BaseElegida } from "../tipos.js";
import {
  SIN_MARCAS,
  cambioDeDeshacer,
  marcasDeCambio,
  todoNuevo,
  trozoDeLaLinea,
  trozosDeLineas,
  type MarcasDeCambio,
  type TrozoDeLineas,
} from "./marcasDeCambio.js";
import estilos from "./EditorDeFichero.module.css";

/**
 * El editor de la pestaña Ficheros. Se carga en DIFERIDO (`React.lazy` en `Ficheros.tsx`): quien no
 * edita no paga CodeMirror. Por eso la exportación es la de omisión, y por eso nada fuera de
 * `editor/` lo importa de forma estática (`editor/frontera.test.ts`).
 *
 * - **El texto no es suyo**: lo recibe al montar y avisa de cada cambio (`alCambiar`); quien lo
 *   guarda es `App` (`usarEdicion.ts`). Para cambiar el texto desde fuera se REMONTA con otra
 *   `key`, no se le empuja: dos dueños del mismo documento acaban pisándose.
 * - **El tema son variables CSS** de `EditorDeFichero.module.css` (`classHighlighter` pone las
 *   clases `.tok-*`, y la hoja las pinta con `--shiki-token-*` y los alias del puente). Nada de
 *   `EditorView.theme` con colores: escaparía a `Barra.test.tsx` y no seguiría los temas.
 * - **Las marcas** se recalculan con el motor de diff de CodeMirror a `MS_ENTRE_DIFFS` de la última
 *   tecla, contra la base que llega por props. Sin base, ninguna marca —y la barra dice por qué—.
 */

/** Cuánto se espera tras la última tecla para recalcular las marcas: un diff por tecla en un
 *  fichero grande se notaría al escribir. */
export const MS_ENTRE_DIFFS = 150;

export interface PropsDelEditor {
  texto: string;
  lenguaje?: string;
  base?: BaseDelFichero;
  baseElegida: BaseElegida;
  alCambiar: (texto: string) => void;
  alGuardar: () => void;
  alElegirBase: (base: BaseElegida) => void;
}

/** Los cinco lenguajes del diseño; lo demás (ini, html…) como texto plano. */
function lenguajeDelEditor(lenguaje: string | undefined): Extension {
  switch (lenguaje) {
    case "xml":
      return xml();
    case "javascript":
      return javascript();
    case "css":
      return css();
    case "markdown":
      return markdown();
    case "json":
      return json();
    default:
      return [];
  }
}

const fijarMarcas = StateEffect.define<MarcasDeCambio>();
const abrirTrozo = StateEffect.define<number | undefined>();

const campoDeMarcas = StateField.define<MarcasDeCambio>({
  create: () => SIN_MARCAS,
  update(valor, tr) {
    for (const e of tr.effects) if (e.is(fijarMarcas)) return e.value;
    return valor;
  },
});

/** El trozo desplegado. Un cambio de texto o de marcas lo cierra: los índices ya no apuntan a lo mismo. */
const campoAbierto = StateField.define<number | undefined>({
  create: () => undefined,
  update(valor, tr) {
    for (const e of tr.effects) if (e.is(abrirTrozo)) return e.value;
    if (tr.docChanged || tr.effects.some((e) => e.is(fijarMarcas))) return undefined;
    return valor;
  },
});

/** Una marca del margen. Los tipos van en `data-marca` (los pinta la hoja, y los tests los buscan). */
class MarcaDelMargen extends GutterMarker {
  constructor(readonly tipos: string) {
    super();
  }
  override eq(otra: GutterMarker): boolean {
    return otra instanceof MarcaDelMargen && otra.tipos === this.tipos;
  }
  override toDOM(): Node {
    const marca = document.createElement("span");
    marca.className = estilos.marca ?? "";
    marca.dataset.marca = this.tipos;
    return marca;
  }
}

function margenDe(estado: EditorState): RangeSet<GutterMarker> {
  const m = estado.field(campoDeMarcas);
  const porLinea = new Map<number, string[]>();
  const anadir = (linea: number, tipo: string): void => {
    porLinea.set(linea, [...(porLinea.get(linea) ?? []), tipo]);
  };
  for (const [linea, marca] of m.lineas) anadir(linea, marca.clase);
  for (const b of m.borrados) anadir(Math.max(b.trasLinea, 1), b.trasLinea === 0 ? "borrado-encima" : "borrado-debajo");
  const rangos: Range<GutterMarker>[] = [];
  for (const linea of [...porLinea.keys()].sort((x, y) => x - y)) {
    // Las marcas se calculan con retraso: una línea que ya no existe se salta.
    if (linea > estado.doc.lines) continue;
    rangos.push(new MarcaDelMargen(porLinea.get(linea)!.join(" ")).range(estado.doc.line(linea).from));
  }
  return RangeSet.of(rangos);
}

/** El margen en un campo: se rehace al llegar marcas nuevas y, mientras, se desplaza con el texto. */
const campoDelMargen = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(valor, tr) {
    if (tr.effects.some((e) => e.is(fijarMarcas))) return margenDe(tr.state);
    return tr.docChanged ? valor.map(tr.changes) : valor;
  },
});

/** Lo de antes de un trozo, con el botón que lo devuelve. `textContent`, nunca marcado inyectado. */
class LoQueHabia extends WidgetType {
  constructor(
    readonly trozo: TrozoDeLineas,
    readonly indice: number
  ) {
    super();
  }
  override eq(otro: WidgetType): boolean {
    return (
      otro instanceof LoQueHabia &&
      otro.indice === this.indice &&
      otro.trozo.desdeB === this.trozo.desdeB &&
      otro.trozo.lineasA.join("\n") === this.trozo.lineasA.join("\n")
    );
  }
  override toDOM(vista: EditorView): HTMLElement {
    const caja = document.createElement("div");
    caja.className = estilos.loQueHabia ?? "";
    const rotulo = document.createElement("p");
    rotulo.className = estilos.rotuloDelTrozo ?? "";
    rotulo.textContent = this.trozo.lineasA.length === 0 ? "Antes no había nada aquí: son líneas nuevas." : "Antes:";
    caja.append(rotulo);
    if (this.trozo.lineasA.length > 0) {
      const antes = document.createElement("pre");
      antes.className = estilos.antes ?? "";
      antes.textContent = this.trozo.lineasA.join("\n");
      caja.append(antes);
    }
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = estilos.deshacer ?? "";
    boton.textContent = "Deshacer este cambio";
    boton.addEventListener("click", () => {
      const c = cambioDeDeshacer(vista.state.doc.toJSON(), this.trozo);
      // Una edición más, con su propio evento: Cmd/Ctrl+Z la deshace y hay que guardar.
      vista.dispatch({ changes: { from: c.desde, to: c.hasta, insert: c.insertar }, effects: abrirTrozo.of(undefined), userEvent: "input.deshacerTrozo" });
      vista.focus();
    });
    caja.append(boton);
    return caja;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** El desplegable, como decoración de BLOQUE debajo del trozo (las de bloque solo pueden salir de un campo). */
const campoDelDesplegable = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(_valor, tr) {
    const abierto = tr.state.field(campoAbierto);
    if (abierto === undefined) return Decoration.none;
    const trozo = tr.state.field(campoDeMarcas).trozos[abierto];
    if (trozo === undefined) return Decoration.none;
    const doc = tr.state.doc;
    const ultima = Math.min(trozo.lineasB.length > 0 ? trozo.desdeB + trozo.lineasB.length - 1 : trozo.desdeB - 1, doc.lines);
    const widget = new LoQueHabia(trozo, abierto);
    if (ultima < 1) return Decoration.set([Decoration.widget({ widget, block: true, side: -1 }).range(0)]);
    return Decoration.set([Decoration.widget({ widget, block: true, side: 1 }).range(doc.line(ultima).to)]);
  },
  provide: (campo) => EditorView.decorations.from(campo),
});

const margenDeCambios = gutter({
  class: estilos.margen ?? "",
  markers: (vista) => vista.state.field(campoDelMargen),
  domEventHandlers: {
    mousedown(vista, linea) {
      const numero = vista.state.doc.lineAt(linea.from).number;
      const trozo = trozoDeLaLinea(vista.state.field(campoDeMarcas), numero);
      if (trozo === undefined) return false;
      const abierto = vista.state.field(campoAbierto);
      vista.dispatch({ effects: abrirTrozo.of(abierto === trozo ? undefined : trozo) });
      return true;
    },
  },
});

const plural = (n: number, una: string, varias: string): string => `${n} ${n === 1 ? una : varias}`;

export default function EditorDeFichero({ texto, lenguaje, base, baseElegida, alCambiar, alGuardar, alElegirBase }: PropsDelEditor) {
  const caja = useRef<HTMLDivElement>(null);
  const vista = useRef<EditorView | undefined>(undefined);
  const [cuentas, setCuentas] = useState(SIN_MARCAS.cuentas);
  // Los manejadores cambian en cada render de `App`; el editor se crea UNA vez y lee los de ahora.
  const manejadores = useRef({ alCambiar, alGuardar });
  manejadores.current = { alCambiar, alGuardar };
  const baseActual = useRef(base);
  baseActual.current = base;

  const recalcular = useCallback(() => {
    const v = vista.current;
    if (v === undefined) return;
    const b = baseActual.current;
    const actual = v.state.doc.toString();
    const marcas =
      b?.texto !== undefined ? marcasDeCambio(trozosDeLineas(b.texto, actual)) : b?.vacio === true ? marcasDeCambio(todoNuevo(actual)) : SIN_MARCAS;
    v.dispatch({ effects: fijarMarcas.of(marcas) });
    setCuentas(marcas.cuentas);
  }, []);

  useEffect(() => {
    const padre = caja.current;
    if (padre === null) return;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const v = new EditorView({
      parent: padre,
      state: EditorState.create({
        doc: texto,
        extensions: [
          campoDeMarcas,
          campoAbierto,
          campoDelMargen,
          campoDelDesplegable,
          margenDeCambios,
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search({ top: true }),
          syntaxHighlighting(classHighlighter),
          lenguajeDelEditor(lenguaje),
          // Por encima de todo: el Cmd/Ctrl+S del navegador guardaría la PÁGINA.
          Prec.highest(
            keymap.of([
              {
                key: "Mod-s",
                preventDefault: true,
                run: () => {
                  manejadores.current.alGuardar();
                  return true;
                },
              },
            ])
          ),
          // Sin `indentWithTab`, a propósito: atrapar el Tab deja a quien navega con teclado sin salida.
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            manejadores.current.alCambiar(u.state.doc.toString());
            clearTimeout(reloj);
            reloj = setTimeout(recalcular, MS_ENTRE_DIFFS);
          }),
        ],
      }),
    });
    vista.current = v;
    recalcular();
    return () => {
      clearTimeout(reloj);
      v.destroy();
      vista.current = undefined;
    };
    // Una vez por montaje: otro texto llega remontando con otra `key` (ver la cabecera).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Una base nueva (otra elegida, o la de después de guardar) se aplica en el acto.
  useEffect(() => {
    recalcular();
  }, [base, recalcular]);

  const rotulo =
    base === undefined
      ? "Trayendo la base…"
      : base.sinBase !== undefined
        ? `Sin marcas: ${base.sinBase}`
        : `${plural(cuentas.cambiadas, "cambiada", "cambiadas")} · ${plural(cuentas.nuevas, "nueva", "nuevas")} · ${plural(cuentas.borradas, "borrada", "borradas")}`;

  return (
    <div className={estilos.editor}>
      <div className={estilos.codigo} ref={caja} />
      <div className={estilos.barra}>
        <span>{rotulo}</span>
        <label className={estilos.selector}>
          Comparar con
          <select value={baseElegida} onChange={(e) => alElegirBase(e.target.value === "commit" ? "commit" : "sesion")}>
            <option value="sesion">Inicio de la sesión</option>
            <option value="commit">Último commit</option>
          </select>
        </label>
      </div>
    </div>
  );
}
