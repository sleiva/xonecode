# Avisos de terceros

## deepseek-harness (estilos de `apps/web/estilos/`)

Los seis ficheros CSS de `apps/web/estilos/` (`base.css`, `corner-shape.css`,
`design-platform.css`, `gradient-shadow-text.css`, `scrollbar.css`, `shiki.css`) están
tomados, sin cambios en su contenido, de:

    deepseek-harness — packages/client/ui-theme/src/styles/

Cada fichero lleva su propia cabecera de atribución. No se ha copiado ningún logo,
wordmark ni otro activo de marca de DeepSeek — solo tokens de diseño (variables CSS
`--dsw-*`, sin renombrar todavía: ver comentario en `apps/web/estilos/`) y reglas CSS.

Licencia del proyecto de origen (MIT):

```
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## deepseek-harness (paquete `@deepseek-ai/dsh-client-ui-primitives`)

`apps/web` instala `@deepseek-ai/dsh-client-ui-primitives@0.0.1-rc.1` (npm) para
`MarkdownText` (Chat) y `ConnectionBanner`, en vez de la combinación `marked` +
`dompurify` de la Task 13 (Task 13b).

Corrección sobre el encargo de la tarea: pedía documentarlo como MIT «igual que el CSS»
de más arriba, pero el propio `package.json` del paquete instalado declara
`"license": "BSD-3-Clause"`, y el fichero `LICENSE` que trae el tarball es, en efecto,
BSD de 3 cláusulas — no MIT. Los seis CSS de la sección de arriba y este paquete de npm
vienen del mismo repositorio (`deepseek-harness`) pero bajo licencias DISTINTAS; se deja
constancia aquí en vez de copiar el aviso equivocado.

Licencia real del paquete (BSD 3-Clause), tomada de su `LICENSE`:

```
BSD 3-Clause License

Copyright (c) 2026, DeepSeek

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

Ningún logo ni wordmark de DeepSeek se usa: `FishLogo` y `BrandWordmark`, que el paquete
exporta, no se importan en ningún fichero de este repositorio (XOne no es DeepSeek).
