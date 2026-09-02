#!/usr/bin/env python3
"""Colapsa un HTML con ficheros locales a UN solo fichero autocontenido.

Mismo trabajo que `html-inline` de la skill original de Anthropic, pero sin
npm: el contenedor tiene python3 y node, no npm.

Los recursos absolutos (http/https, //) se dejan como estan — el CSP decide que
CDNs se permiten (ver `validate_artifact.py`, que es quien enforza esa lista
blanca de hosts); este script no repite esa lista, solo distingue local de
absoluto por el esquema de la URL.

Solo libreria estandar.
"""
from __future__ import annotations

import base64
import mimetypes
import pathlib
import re
import sys
from urllib.parse import urlparse

# Un unico regex con alternancia: `re.sub` solo escanea el string ORIGINAL, no
# vuelve a mirar lo que el propio callback acaba de insertar. Con tres pases
# separados (link, luego script, luego img) el pase de imagenes podia colarse
# DENTRO de un <script> ya inlineado si el JS traia algo con pinta de
# `<img src="...">` en un string literal — corrupcion silenciosa del JS.
_RECURSO = re.compile(
    r"""<link\b[^>]*\bhref\s*=\s*["'](?P<css>[^"']+)["'][^>]*>"""
    r"""|<script\b[^>]*\bsrc\s*=\s*["'](?P<js>[^"']+)["'][^>]*>\s*</script>"""
    r"""|(?P<imgpre><img\b[^>]*\bsrc\s*=\s*["'])(?P<img>[^"']+)(?P<imgpost>["'])""",
    re.I,
)


def _es_local(url: str) -> bool:
    u = (url or "").strip()
    if not u or u.startswith(("data:", "blob:", "#")):
        return False
    p = urlparse(u)
    if p.scheme in ("http", "https") or u.startswith("//"):
        return False
    return True


def _leer(base: pathlib.Path, url: str) -> bytes | None:
    ruta = (base / url.lstrip("/")).resolve()
    try:
        # No salir del directorio del artifact.
        ruta.relative_to(base.resolve())
    except ValueError:
        print(f"[bundle] fuera del directorio, se ignora: {url}", file=sys.stderr)
        return None
    if not ruta.is_file():
        print(f"[bundle] no encontrado, se deja el tag: {url}", file=sys.stderr)
        return None
    return ruta.read_bytes()


def empaquetar(html: str, base: pathlib.Path) -> str:
    """Devuelve el HTML con todo recurso LOCAL embebido."""
    base = pathlib.Path(base)

    def _sub(m: re.Match[str]) -> str:
        if m.group("css") is not None:
            url = m.group("css")
            if not _es_local(url) or "stylesheet" not in m.group(0).lower():
                return m.group(0)
            datos = _leer(base, url)
            if datos is None:
                return m.group(0)
            return "<style>\n" + datos.decode("utf-8", "replace") + "\n</style>"

        if m.group("js") is not None:
            url = m.group("js")
            if not _es_local(url):
                return m.group(0)
            datos = _leer(base, url)
            if datos is None:
                return m.group(0)
            return "<script>\n" + datos.decode("utf-8", "replace") + "\n</script>"

        # Imagen.
        pre, url, post = m.group("imgpre"), m.group("img"), m.group("imgpost")
        if not _es_local(url):
            return m.group(0)
        datos = _leer(base, url)
        if datos is None:
            return m.group(0)
        mime = mimetypes.guess_type(url)[0] or "application/octet-stream"
        return pre + f"data:{mime};base64," + base64.b64encode(datos).decode() + post

    return _RECURSO.sub(_sub, html)


def main(argv: list[str]) -> int:
    if len(argv) not in (2, 3):
        print("uso: bundle_artifact.py <entrada.html> [salida.html]", file=sys.stderr)
        return 2
    entrada = pathlib.Path(argv[1])
    salida = pathlib.Path(argv[2]) if len(argv) == 3 else entrada
    resultado = empaquetar(entrada.read_text(encoding="utf-8"), entrada.parent)
    salida.write_text(resultado, encoding="utf-8")
    print(f"OK: {salida} ({len(resultado.encode('utf-8')) / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
