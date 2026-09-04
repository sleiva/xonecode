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

## deepseek-harness (CSS de componentes de `apps/web/estilos/`)

Además de las hojas de tokens de la sección anterior, `apps/web/estilos/` lleva el CSS de
COMPONENTES de deepseek, para que la consola web use el mismo CSS y recolorearla sea
cambiar valores de token en un sitio en vez de editar componentes. Cada fichero lleva su
propia cabecera de atribución, que dice si es copia entera o RECORTE y —cuando es
recorte— qué se dejó fuera y por qué.

| fichero en `apps/web/estilos/` | origen (`packages/client/…`) | paquete | licencia | líneas copiadas |
|---|---|---|---|---|
| `AppFrame.module.css` | `ui-layout/src/client/AppFrame.module.css` | `@deepseek-ai/dsh-client-ui-layout` | MIT | 119 (entero) |
| `SidebarRoot.module.css` | `ui-sidebar/src/client/SidebarRoot.module.css` | `@deepseek-ai/dsh-client-ui-sidebar` | MIT | 359 (entero) |
| `ConversationRoot.module.css` | `ui-conversation/src/client/skeleton/ConversationRoot.module.css` | `@deepseek-ai/dsh-client-ui-conversation` | MIT | 238 de 452 (recorte) |
| `ChatView.module.css` | `ui-chat/src/client/chat/ChatView.module.css` | `@deepseek-ai/dsh-client-ui-chat` | MIT | 58 de 223 (recorte) |
| `WorkspaceBrowser.module.css` | `ui-workspace/src/client/rows/WorkspaceBrowser.module.css` | `@deepseek-ai/dsh-client-ui-workspace` | MIT | 138 de 505 (recorte) |
| `Rows.module.css` | `ui-workspace/src/client/rows/Rows.module.css` | `@deepseek-ai/dsh-client-ui-workspace` | MIT | 179 de 368 (recorte) |
| `SettingsRoot.module.css` | `ui-settings-general/src/client/SettingsRoot.module.css` | `@deepseek-ai/dsh-client-ui-settings-general` | MIT | 57 de 236 (recorte) |
| `AgentPresetLabel.module.css` | `ui-agent-preset/src/client/AgentPresetLabel.module.css` | `@deepseek-ai/dsh-client-ui-agent-preset` | MIT | 22 de 23 (recorte) |

La licencia es MIT en los OCHO casos, declarada por el `package.json` de cada paquete en
el árbol de fuentes (`"license": "MIT"`, versión `0.1.2-rc.1`). Es la misma MIT que ya
está transcrita en la primera sección de este fichero; no se repite.

**Ojo con la sección siguiente**: el paquete de npm `@deepseek-ai/dsh-client-ui-primitives`
que este repo INSTALA declara BSD-3-Clause, no MIT. Los CSS de arriba vienen del árbol de
FUENTES; el paquete instalado es otra cosa y va bajo otra licencia. Se dejan las dos
constancias por separado a propósito, y no una que cubra las dos.

**Nada de marca.** Ninguna de estas hojas trae un activo de marca: son reglas de
geometría y color por token. `SidebarRoot.module.css` da la geometría de las ranuras
`.brand`/`.brandName`, y quien las ocupa aquí es el nombre de xonecode; `.brandMark`
—donde el original monta su `FishLogo`— se queda vacía.

**Una línea que NO se copió, y es un hallazgo.** `AgentPresetLabel.module.css` declara
`background: var(--dsw-alias-fill-tsp-secondary)`, y ese alias no está definido en NINGÚN
CSS de deepseek-harness (comprobado con `grep -rn -- "--dsw-alias-fill-tsp-secondary:"
--include='*.css'` sobre el árbol entero: cero resultados). Un alias que no existe
resuelve a transparente sin dar error. Se copia la hoja sin esa declaración, en vez de
inventarle un relleno que el original nunca pinta.

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
