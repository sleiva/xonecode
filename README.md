# xonecode

Consola CLI y harness de agente para desarrollar aplicaciones **XOne**, sobre LangChain,
LangGraph y deepagents.

XOne es una plataforma propietaria de apps móviles nativas: se programa con XML (ficheros
`.xne`), JavaScript ES5 y un CSS propio. **No es desarrollo web** — no existe el DOM, ni
`async/await` en el runtime, ni ningún framework tipo React.

```
$ cd MiApp && xonecode

xonecode · MiApp (7 colls) · ollama/glm-5.3-flash:cloud · 0 tokens
14 comandos: /ayuda /config /describe /doctor /verify /modelo /modelos … /salir

─ MiApp (7 colls) · ollama/glm-5.3-flash:cloud · 0 tokens · /ayuda
❯ ¿qué colecciones tiene este proyecto?
  🔧 task · ls · glob · read_file ×7
El proyecto tiene 9 colecciones repartidas en 7 ficheros .xne: …
  ⚠ el verificador no ha corrido en este turno
(9.0s)
```

## Estado

**Funciona y es usable, pero no es un producto terminado.** Lo que hay:

| | |
|---|---|
| Consola interactiva | prompt, barra de estado, 14 comandos de barra, autocompletado con Tab |
| Un disparo | `xonecode run "…"` — pipeable, para tuberías y CI |
| Aprobación humana | el agente **para y pregunta** antes de escribir; sin un sí explícito, rechaza |
| Verificador real | `xone-simulator` sobre el proyecto, con `/verify` y `xonecode verify` |
| Multi-proveedor | Gemini, OpenAI, Anthropic y **Ollama local**, con modelo por papel |
| Diagnóstico sin coste | `describe`, `doctor` y `config` no gastan una llamada al modelo |

Lo que **todavía no hay**, y conviene saber antes de fiarse:

- **Nadie verifica lo que el agente escribe.** El verificador existe y funciona, pero no
  corre dentro del turno: la consola te lo avisa en cada uno. Hay que lanzar `/verify`.
- **No hay lazo** de plan → ejecuta → verifica → juzga → repara, con presupuestos.
- **No usa los servidores MCP de XOne Studio**: el proyecto tiene que estar en disco.
- **No hay TUI con paneles**; la consola es stdio.

## Instalación

Requiere **Node ≥ 20** y, para verificar, [`xone-linter`](https://www.npmjs.com/package/xone-linter)
(que instala el binario `xone-simulator`).

```sh
git clone https://github.com/sleiva/xonecode && cd xonecode
npm install
npm run build
npm link          # o: ln -sf "$PWD/dist/bin.js" ~/.local/bin/xonecode
```

Comprueba que el entorno está listo, sin gastar nada:

```sh
cd /ruta/a/TuApp
xonecode doctor
```

## Configuración

Dos ficheros con dos ciclos de vida distintos, y **las claves nunca van en el proyecto**:

| Fichero | Qué lleva |
|---|---|
| `<proyecto>/.xonecode/config.json` | modelos y proveedores. **Rechaza claves de API.** |
| `<proyecto>/.xonecode/memoria.md` | decisiones, convenciones y pendientes confirmados. El agente solo la ve como `/MEMORIA_PROYECTO.md`; escribirla pide aprobación. |
| `<proyecto>/.xonecode/conversation_history/` | historial técnico descargado al resumir contexto. Es interno: no se expone al agente ni se mezcla con la app. |
| `~/.xonecode/config.json` | lo mismo, para todos los proyectos |
| `~/.xonecode/auth.json` | las credenciales, con modo **0600**. Se escribe con `/provider <nombre>` |

```json
{
  "modelo": "ollama/glm-5.3-flash:cloud",
  "modelos": { "afilado": "anthropic/claude-sonnet-4-5-20250929" }
}
```

Precedencia, y cada valor recuerda de dónde vino (`xonecode config` lo dice):

```
--modelo-<papel>  >  --modelo  >  XONECODE_MODELO  >  proyecto  >  global  >  omisión
```

`/modelos <proveedor>` consulta el catálogo vivo del proveedor, filtra modelos de
conversación y permite guardar una selección global para `rapido`, `trabajo` o `afilado`.
Las claves siguen exclusivamente en `~/.xonecode/auth.json`; `/provider` solo las configura.

Hay **tres papeles** porque el reparto es la palanca de coste: `rapido` corre en todos los
turnos, `trabajo` desarrolla y `afilado` está reservado al juez. Por omisión, Ollama local.

## Cómo está construido, y por qué

Las decisiones que explican la forma del código. Ninguna es preferencia estética: todas
salen de un fallo medido.

**El motor de turno no sabe pintar.** `core/turno.ts` consume eventos de dominio y decide
qué se cuenta; la consola de stdio y la TUI son pieles. Así el turno se prueba
entero sin montar un renderizador.

**Frontera de imports, y está probada.** `core/` es TypeScript puro: no importa langchain,
langgraph, deepagents, MCP, Ink ni React. Toda la suciedad del grafo vive en `agent/`. Hay
un test que recorre los ficheros de `core/` y falla si aparece un import prohibido — una
convención que nadie verifica dura dos semanas.

**La TUI es una piel, y su frontera también está probada.** Ink y React viven SOLO en
`src/cli/tui/`: otro test recorre `src/` y falla si un import de ink o react se cuela fuera
— el mismo truco. Y el lazo de comandos es UNO: la TUI no lo duplica, se lo inyectan, así
que `/config` llama a la misma función con stdio y con la TUI. La TUI monta por omisión solo
con un terminal de verdad en ambos lados; cualquier tubería cae al stdio de siempre, y por
eso los pipes y CI siguen viendo la salida byte-idéntica de siempre.

**Todo lo caro entra por un puerto, con su doble al lado.** Consecuencia buscada: la suite
entera corre **sin API, sin red y sin el simulador**.

**Un doble nunca se disfraza de verdad.** La marca de «esto es de pega» es un `Symbol` que
solo los dobles llevan, no un booleano que alguien rellena: un campo se puede olvidar, o
poner mal, y entonces el aviso calla justo cuando hace falta. `xonecode describe` lo canta.

**Los avisos son código, no prompt.** A un modelo al que le pides «avisa de que el
verificador es de pega» a veces no avisa — y ese es justo el aviso que no puede faltar.

**Y tienen alcance de TURNO.** Un aviso que salta cuando no ha pasado nada enseña al
usuario a ignorarlo, que es lo contrario de lo que compra.

**Aprobar ejecuta; rechazar no toca nada.** Así que lo que no se entiende es **rechazo**, y
el Enter a secas solo aprueba con un terminal de verdad detrás: en un pipe o en CI una línea
en blanco no demuestra que haya nadie mirando.

**El agente está confinado.** `FilesystemBackend` con `virtualMode: true` — medido: con el
default de la librería, el backend **leyó una ruta absoluta de fuera de la raíz**. Nada de
backends con shell: los comandos acceden a cualquier ruta y la propia librería lo impide.

**Se le ocultan las vistas aplanadas.** En XOne cada colección existe como `.xne` (la
fuente) y como `.xml` que genera Studio. La regla «se edita el `.xne`» no puede vivir solo
en un prompt: un permiso solo protege a quien lo choca. Se retira del backend, y así es una
propiedad del proyecto.

**La foto del ANTES es un árbol de git en un índice privado.** `GIT_INDEX_FILE` a un
temporal propio, `git add` y `write-tree`. No necesita commits, no necesita que el proyecto
sea la raíz del repo, y **no toca tu índice ni tu staging**. Medido contra un repo con cero
commits: `git status` daba **una** línea; el árbol privado, 107 ficheros.

## Códigos de salida

| | |
|---|---|
| 0 | bien |
| 1 | el proyecto tiene errores, o no es un proyecto XOne |
| 2 | había escrituras esperando aprobación y **nada se aplicó** |
| 64 | error de uso (bandera o modelo mal escritos) |
| 70 | fallo del **entorno**, no del proyecto |

El 2 es deliberado: un turno que se quedó esperando un permiso que nadie dio **no es un
éxito**, y CI no puede leerlo como tal.

## Desarrollo

```sh
npm run typecheck     # tsc --noEmit
npm test              # la suite entera, sin red ni claves
./bin/xonecode …      # corre el TypeScript con tsx: siempre el código actual
```

`npm test` no puede necesitar una clave ni una conexión. Si un cambio lo rompe, está mal el
cambio, no el test.

`src/vendor/` son módulos propios traídos de un laboratorio anterior, con sus tests. Se
copiaron en vez de publicarse aparte porque son 290 líneas y no merecen un paquete.

## Más

- [`docs/COMO-PROBARLO.md`](docs/COMO-PROBARLO.md) — la guía de pruebas, paso a paso
- [`docs/PROBLEMA.md`](docs/PROBLEMA.md) — el enunciado del que salió el diseño
- [`docs/SEGUNDA-OPINION-K3.md`](docs/SEGUNDA-OPINION-K3.md) — una segunda opinión
  independiente sobre la arquitectura, pedida a ciegas
