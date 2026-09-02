#!/usr/bin/env python3
"""Comprueba que un HTML cumple el contrato de artifact de NappAI.

Contrato (nivel 0): el artifact es autocontenido y NO habla con nadie. Cada
regla de aqui espeja una directiva del CSP con que se sirve; si se cambia una,
se cambia la otra.

OJO: esto es analisis estatico y se puede enganar (JS ofuscado). La garantia
real es el CSP de la respuesta, que lo impone el navegador. Esto da
realimentacion rapida al modelo, no seguridad.

Solo libreria estandar: corre en un contenedor pelado sin pip.
"""
from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from urllib.parse import urlparse

TOPE_BYTES = 5 * 1024 * 1024

CDN_SCRIPT = {"cdnjs.cloudflare.com", "cdn.jsdelivr.net"}
CDN_ESTILO = CDN_SCRIPT | {"fonts.googleapis.com"}
CDN_FUENTE = {"fonts.gstatic.com"}

_RED = [
    (re.compile(r"\bfetch\s*\("), "fetch()"),
    (re.compile(r"\bXMLHttpRequest\b"), "XMLHttpRequest"),
    (re.compile(r"\bWebSocket\s*\("), "WebSocket"),
    (re.compile(r"\bEventSource\s*\("), "EventSource"),
    (re.compile(r"\bsendBeacon\s*\("), "navigator.sendBeacon()"),
    (re.compile(r"\bimport\s*\("), "import() dinamico"),
]


# Almacenamiento del navegador. **Estas tres LANZAN en el sandbox del widget**, que pinta el
# artifact en un iframe con `sandbox="allow-scripts allow-downloads allow-modals"` y SIN
# `allow-same-origin`: el documento tiene origen opaco y merely LEER una de ellas da
#
#     Failed to read the 'localStorage' property from 'Window':
#     The document is sandboxed and lacks the 'allow-same-origin' flag.
#
# Es la MISMA clase que `fetch`: no es un gusto, es que el navegador lo rompe. Y es PEOR que
# `fetch`, porque el throw se lleva el bloque `<script>` entero y el fallo es MUDO --- medido en
# produccion el 2026-08-31: la pagina se veia perfecta y el diagrama era un rectangulo vacio.
_ALMACEN = ("localStorage", "sessionStorage", "indexedDB")

#: Ventanas alrededor de un acceso donde se busca su `try`/`catch`. Es analisis de texto y se
#: puede enganar --- como todo este fichero, que lo dice en su docstring--- pero caza el caso
#: comun: el acceso suelto, sin nada que lo envuelva.
_ANTES = 240
_DESPUES = 400


def _accesos_sin_guarda(html: str) -> list[str]:
    """Los accesos a almacenamiento que NO parecen envueltos en `try`/`catch`.

    Para cada aparicion se mira hacia atras si hay un `try` cerca y hacia delante si hay un
    `catch`. No es un parser de JS --- no lo hay en la libreria estandar y este fichero corre en
    un contenedor pelado--- asi que se elige el error del lado seguro: se avisa del acceso
    suelto, y un acceso envuelto de forma rara puede colarse. La alternativa (prohibirlo del
    todo) obligaria a renunciar a recordar una pestana o un filtro por un fallo que tiene
    arreglo de una linea.
    """
    fuera: list[str] = []
    for api in _ALMACEN:
        for m in re.finditer(rf"\b{api}\b", html):
            antes = html[max(0, m.start() - _ANTES) : m.start()]
            despues = html[m.end() : m.end() + _DESPUES]
            if "try" in antes and ("catch" in despues or "catch" in antes):
                continue
            fuera.append(api)
            break  # uno por API basta: el mensaje es el mismo
    return fuera


def _host(url: str) -> str | None:
    """Host de una URL absoluta; None si es relativa, data: o blob:."""
    url = (url or "").strip()
    if not url or url.startswith(("data:", "blob:", "#")):
        return None
    p = urlparse(url)
    if p.scheme in ("http", "https") or url.startswith("//"):
        return (p.netloc or "").lower() or None
    return None


class _Escaner(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.problemas: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k.lower(): (v or "") for k, v in attrs}

        if tag == "base":
            self.problemas.append("<base> no esta permitido: reescribe el destino de los enlaces.")
            return

        if tag == "script":
            h = _host(a.get("src", ""))
            if h and h not in CDN_SCRIPT:
                self.problemas.append(
                    f"<script src> de '{h}': solo se permiten {sorted(CDN_SCRIPT)}."
                )
        elif tag == "link":
            h = _host(a.get("href", ""))
            if h and h not in CDN_ESTILO | CDN_FUENTE:
                self.problemas.append(
                    f"<link href> de '{h}': solo se permiten {sorted(CDN_ESTILO | CDN_FUENTE)}."
                )
        elif tag in ("img", "video", "audio", "source", "embed"):
            h = _host(a.get("src", ""))
            if h:
                self.problemas.append(
                    f"<{tag} src> de '{h}': usa data: o blob:. Un src externo saca datos "
                    "por la query string."
                )
        elif tag == "iframe":
            if _host(a.get("src", "")):
                self.problemas.append("<iframe src> externo no esta permitido.")
        elif tag == "form":
            if _host(a.get("action", "")):
                self.problemas.append("<form action> externo no esta permitido.")


#: Etiquetas de mermaid con PARENTESIS sin comillas. Es un error de SINTAXIS, no de estilo, y
#: rompe el diagrama entero: la pagina carga perfecta y en su sitio sale «Syntax error in text».
#:
#: **Medido contra mermaid 10.9.0 en un navegador, con `mermaid.parse` y su control**
#: (2026-09-01, sobre un panel real que fallo asi):
#:
#: | construccion | |
#: |---|---|
#: | `A[Uno] --> B[Dos]` | OK |
#: | `A[Mapeos (mapcol)]` | **ROMPE** |
#: | `A["Mapeos (mapcol)"]` | OK |
#: | `subgraph Vistas (contents)` | **ROMPE** |
#: | `subgraph S1 [Vistas (contents)]` | **ROMPE** |
#: | `subgraph "Vistas (contents)"` | OK |
#: | `A[Salida ##EXIT##]`, `A[LoginColl.xne]`, acentos, `:`, `@` | OK |
#:
#: **Las almohadillas estan INOCENTES** y es la segunda vez que se acusan en falso: `##EXIT##`
#: parsea sin problema. Lo que rompe son los parentesis, y en un proyecto XOne salen solos
#: (`(mapcol)`, `(contents)`), asi que esto no es un caso raro: es el caso normal.
#: Con que empieza un diagrama de mermaid, para reconocerlo dentro de una plantilla de JS.
_EMPIEZA_DIAGRAMA = re.compile(
    r"\s*(?:%%\{.*?\}%%\s*)?"
    r"(?:graph|flowchart|sequenceDiagram|stateDiagram(?:-v2)?|erDiagram|classDiagram|"
    r"journey|gantt|pie|mindmap|timeline)\b",
    re.S,
)

_MERMAID_NODO = re.compile(r"\[([^\]\n]*)\]")
_MERMAID_SUBGRAPH = re.compile(r"^[ \t]*subgraph[ \t]+(.*)$", re.M)
#: Los tramos ENTRE COMILLAS, que es lo que hay que quitar antes de buscar un parentesis.
#:
#: **Y esto es el arreglo de un falso positivo, cazado a los diez minutos de escribir el
#: check**: la primera version exigia la comilla PEGADA al corchete (`\[(?!["\'])`), asi que
#: `Header ["Cabecera (frmTop)"]` --- con un espacio en medio, que es como lo escribe el modelo
#: --- se leia como sin comillas y el validador RECHAZABA un panel correcto. Un aviso que
#: desmiente trabajo bueno hace mas daño que uno que falta: el constructor habria reescrito
#: tres veces algo que ya estaba bien y habria acabado sin publicar.
_ENTRE_COMILLAS = re.compile(r"\"[^\"]*\"|'[^']*'")

#: Los delimitadores de FORMA en los bordes de una etiqueta. `A[("x")]` es un cilindro (base de
#: datos), `A([\"x\"])` un estadio, `A[[\"x\"]]` un subproceso: los parentesis y corchetes de los
#: extremos son ESTRUCTURA, no texto.
#:
#: **Segundo falso positivo de este check, y otra vez habria bloqueado un panel correcto**: sin
#: quitarlos, `A[("Coleccion Usuarios")]` se leia como una etiqueta con parentesis sin comillas
#: --- las comillas estaban DENTRO de la forma --- y el validador lo rechazaba. Los dos falsos
#: positivos han venido de lo mismo: mirar la cadena cruda en vez de la ETIQUETA.
_BORDES_DE_FORMA = re.compile(r"^[\[\(\{>/\\]+|[\]\)\}/\\]+$")


def _solo_la_etiqueta(cruda: str) -> str:
    """El texto de la etiqueta: sin los delimitadores de forma y sin los tramos citados."""
    return _ENTRE_COMILLAS.sub("", _BORDES_DE_FORMA.sub("", cruda.strip()))


def _sin_lo_citado(texto: str) -> str:
    """El texto con los tramos entre comillas fuera. Lo que quede es lo NO citado."""
    return _ENTRE_COMILLAS.sub("", texto)


def _bloques_mermaid(html: str) -> list[str]:
    """El texto de cada diagrama mermaid del HTML.

    Se buscan las DOS formas en que llega: el `<pre class="mermaid">`/`<div class="mermaid">`
    del render automatico y la cadena que se le pasa a `mermaid.render`/`mermaid.parse` desde
    JS. Con solo la primera, un panel que construye el diagrama en una constante de JavaScript
    --- que es lo que hacen la mitad de los que se han visto --- pasaria sin mirar.
    """
    fuera: list[str] = []
    for m in re.finditer(
        r"<(?:pre|div)[^>]*class=[\"'][^\"']*mermaid[^\"']*[\"'][^>]*>(.*?)</(?:pre|div)>",
        html,
        re.S | re.I,
    ):
        fuera.append(m.group(1))
    # **La segunda forma: el diagrama dentro de una PLANTILLA de JS** (`const src = \`graph TD
    # …\`;`), que es como lo escribe la mitad de los paneles. Se acota a la plantilla completa
    # —de comilla invertida a comilla invertida— y **eso es el arreglo del TERCER falso positivo
    # de este check**: la version anterior buscaba `graph TD` y se llevaba hasta 20.000 chars
    # «hasta la comilla o el `</script>`», asi que cuando el diagrama no estaba en una plantilla
    # se tragaba el CSS de Tailwind que venia detras y marcaba `rounded-[var(--radius)]` como una
    # etiqueta con parentesis sin comillas. Rechazaba un panel correcto.
    #
    # Los tres falsos positivos de este check han salido de lo mismo: **mirar texto que no es una
    # etiqueta de mermaid.** Delimitar bien lo que se mira vale mas que afinar el patron.
    for m in re.finditer(r"`([^`]*)`", html, re.S):
        cuerpo = m.group(1)
        if _EMPIEZA_DIAGRAMA.match(cuerpo):
            fuera.append(cuerpo)
    return fuera


def _mermaid_roto(html: str) -> list[str]:
    """Etiquetas de mermaid con un parentesis FUERA de comillas, con la culpable delante."""
    problemas: list[str] = []
    vistas: set[str] = set()
    for bloque in _bloques_mermaid(html):
        candidatas = [m.group(1) for m in _MERMAID_NODO.finditer(bloque)]
        candidatas += [m.group(1) for m in _MERMAID_SUBGRAPH.finditer(bloque)]
        for cruda in candidatas:
            if "(" not in _solo_la_etiqueta(cruda):
                continue
            etiqueta = cruda.strip()[:80]
            if etiqueta in vistas:
                continue
            vistas.add(etiqueta)
            problemas.append(
                f"Etiqueta de mermaid con parentesis SIN comillas: `{etiqueta}`. mermaid 10.9 "
                f"no la parsea y el diagrama entero sale como «Syntax error in text» (medido "
                f"con mermaid.parse). Pon el TEXTO entre comillas dobles: `[\"...\"]` en un "
                f"nodo, `subgraph \"...\"` en un subgrafo."
            )
    return problemas


def validar(html: str) -> tuple[bool, list[str]]:
    """Devuelve (ok, problemas). Cada problema dice que hacer, no solo que pasa."""
    problemas: list[str] = []

    tam = len(html.encode("utf-8"))
    if tam > TOPE_BYTES:
        problemas.append(
            f"El artifact ocupa {tam / 1024 / 1024:.1f} MB y el tope son 5 MB. "
            "Reduce los datos horneados o baja la resolucion de las imagenes."
        )

    for patron, nombre in _RED:
        if patron.search(html):
            problemas.append(
                f"Usa {nombre}: el artifact es autocontenido y no puede hablar con el "
                "servidor. Hornea los datos dentro del HTML."
            )

    problemas.extend(_mermaid_roto(html))

    for api in _accesos_sin_guarda(html):
        problemas.append(
            f"Usa {api} sin try/catch: en el sandbox del visor LANZA "
            f"(«The document is sandboxed and lacks the 'allow-same-origin' flag») y se lleva "
            f"el bloque <script> entero, asi que la pagina se rompe EN SILENCIO. Para el tema "
            f"basta matchMedia('(prefers-color-scheme: dark)'). Si necesitas guardar algo, "
            f"envuelve cada acceso: try {{ {api}.getItem(k) }} catch {{}}."
        )

    escaner = _Escaner()
    try:
        escaner.feed(html)
    except AssertionError as e:  # lo unico que HTMLParser levanta con markup patologico
        problemas.append(f"El HTML no se puede parsear: {e}")
    problemas.extend(escaner.problemas)

    return (not problemas), problemas


def avisos(html: str) -> list[str]:
    """Calidad, no rotura: se publica igual y se le dice.

    **La distincion es la que hace que el contrato signifique algo.** Si un `alt` que falta
    bloqueara la publicacion igual que una pagina que no arranca, el modelo aprenderia a leer la
    lista entera como ruido. Aqui van las cosas que hacen el panel peor sin hacerlo imposible.
    """
    fuera: list[str] = []
    bajo = html.lower()

    if not re.search(r"<!doctype\s+html", html, flags=re.IGNORECASE):
        fuera.append("falta el doctype de HTML5: el navegador entra en modo quirks.")
    if not re.search(r"<html[^>]*\slang=", html, flags=re.IGNORECASE):
        fuera.append('falta `lang` en <html>: los lectores de pantalla no saben en que idioma leer.')
    if "name=\"viewport\"" not in bajo and "name='viewport'" not in bajo:
        fuera.append("falta el meta viewport: en movil se vera reducido al 25%.")
    if not re.search(r"<title>\s*\S", html, flags=re.IGNORECASE):
        fuera.append("falta un <title> con contenido: es el nombre del panel en la pestana.")

    sin_alt = [
        m.group(0)
        for m in re.finditer(r"<img\b[^>]*>", html, flags=re.IGNORECASE)
        if not re.search(r"\salt=", m.group(0), flags=re.IGNORECASE)
    ]
    if sin_alt:
        fuera.append(f"{len(sin_alt)} imagen(es) sin `alt`.")

    botones_mudos = len(
        [m for m in re.finditer(r"<button\b[^>]*>\s*</button>", html, flags=re.IGNORECASE)]
    )
    if botones_mudos:
        fuera.append(
            f"{botones_mudos} boton(es) sin texto ni etiqueta accesible: usa texto o aria-label."
        )

    ids = re.findall(r"\sid=[\"']([^\"']+)[\"']", html)
    repetidos = sorted({i for i in ids if ids.count(i) > 1})
    if repetidos:
        fuera.append(f"ids repetidos: {', '.join(repetidos[:5])}.")

    interactivo = "<button" in bajo or "<a " in bajo
    if interactivo and not re.search(r":focus-visible|:focus\b", html, flags=re.IGNORECASE):
        fuera.append("ningun estilo de foco visible: con teclado no se ve donde estas.")

    return fuera


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("uso: validate_artifact.py <fichero.html>", file=sys.stderr)
        return 2
    with open(argv[1], encoding="utf-8") as fh:
        ok, problemas = validar(fh.read())
    if ok:
        print("OK: el artifact cumple el contrato.")
        return 0
    print("El artifact NO cumple el contrato:")
    for p in problemas:
        print(f"  - {p}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
