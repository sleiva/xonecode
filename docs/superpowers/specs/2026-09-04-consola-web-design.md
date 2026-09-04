# La consola web

Diseño de la consola web de xonecode: la web pasa a ser lo que sale al teclear `xonecode`,
la consola de terminal queda detrás de `--cli`, y el alta completa —cuenta, entorno,
proyecto, sesión— se hace en el navegador.

Fecha: 2026-09-04. Estado: diseño pendiente de aprobación.

---

## Decisiones que tomé yo — revísalas primero

El usuario narró la arquitectura; estas son las decisiones que no dictó y que tomé para
que el spec no tenga huecos. Cada una es reversible antes del plan.

| # | Decisión | Por qué, y qué costaría cambiarla |
|---|---|---|
| D1 | **Reabrir una sesión es RELEER, no seguir hablando.** Se persisten los `DomainEvent` del turno; al reabrir se ve lo que pasó y se empieza hilo nuevo. | Seguir hablando exige un checkpointer de LangGraph en disco, y ese estado lleva **mensajes enteros** —contenido de ficheros, y potencialmente secretos— escritos fuera de `auth.json`. Los eventos de dominio ya viajan limpios por tipo. Cambiarlo es una fase aparte, no un ajuste. |
| D2 | **Tokens de tema `--dsw-*` verbatim** en esta fase; el renombrado a `--xone-*` y el repunte del acento a los colores de XOne, después. | Renombrar 769 líneas antes de ver nada en pantalla es trabajo sin señal. El renombrado es un pase mecánico cuando la pantalla ya existe. |
| D3 | **Vite + React + react-dom + clsx** como dependencias del paquete nuevo. | Es lo que usa deepseek y React ya está en el repo por Ink. Sin build el cliente no puede usar CSS Modules, que es la regla de estilo que heredamos. |
| D4 | **El workspace por omisión queda como lo dictaste**: `~/.xonecode/<entorno>/workspace/<proyecto>`. | Dejo constancia de mi reserva y no insisto: el trabajo del usuario cuelga de una carpeta que en el resto del código significa «interno, no se toca», y algún día alguien escribirá una comprobación por prefijo que lo rompa. Es configurable, así que el riesgo es de convención, no de corrección. |
| D5 | **El `config.json` del proyecto sigue escribiendo `cloudstudio.url`**, y además gana `entorno: <id>`. | Es lo que hace literalmente cierto que «la sincronización no se toca»: `crearSincronizador` y compañía leen la URL igual que hoy. El `entorno` es la referencia nueva; la URL es la copia operativa. |
| D6 | **La web es solo modo `cloud`** en esta fase. Un proyecto offline se abre con `--cli`. | La web se organiza entorno → proyecto → sesión; un proyecto offline no tiene entorno. `configurarModoInicial` no corre en la ruta web. |
| D7 | **Transporte: SSE (servidor→cliente) + POST (cliente→servidor)**, no WebSocket. | Cero dependencias, y la reconexión es trivial porque el servidor guarda la lista de actos y la reemite. El mux de WebSocket de deepseek existe para 40 paquetes con streams lógicos; aquí hay un stream. |
| D8 | **Una consola de proyecto activa a la vez.** Cambiar de proyecto termina la actual y abre otra. | `correrConsola` es un lazo sobre UNA `raiz`. N raíces concurrentes en un proceso es un rediseño del motor, no una piel. |

---

## De dónde sale esto

Hoy `xonecode` abre una consola de terminal sobre el cwd: `decidirTui` (`cli/main.ts:273`)
elige TUI de Ink o stdio según los TTY, y el alta —proveedor y modelo, modo del proyecto,
proyecto de CloudStudio y su rama, modelo del proyecto— se pregunta en el terminal
(`cli/main.ts:787-797`). La copia local vive en la carpeta que el usuario abrió.

Lo que se pide es otra cosa: una consola web que gestione **varios entornos de CloudStudio,
varios proyectos y varias sesiones**, con la copia local en un workspace gestionado, y que
sea lo que sale por omisión al teclear `xonecode`.

## Hallazgos medidos

### En deepseek-harness (visto en ejecución, `http://127.0.0.1:3080/`)

| Hecho | Consecuencia para nosotros |
|---|---|
| El tema entero son **769 líneas de CSS** en `packages/client/ui-theme/src/styles/`, MIT, sin dependencias | Los estilos son portables tal cual: escala estática `--dsw-static-*` + alias semánticos `--dsw-alias-*`, light/dark, superelipse en esquinas, sombras de elevación con el filo de 0,5 px como primera capa, scrollbars |
| Reglas de estilo: **CSS Modules + `clsx`, sin Tailwind y sin librería de componentes**; los componentes consumen alias semánticos, nunca colores literales; los selectores de tema son del tema, no del componente | Se heredan tal cual. Son baratas y evitan que el tema se disperse |
| `apps/web` es un paquete propio: build de Vite cuyo `dist/` **lo sirve el comando `dsh web` de `apps/cli`** | Es exactamente la forma que pidió el usuario: paquete nuevo para el cliente, servido por el host |
| El servidor es `node:http` en loopback, con `host` restringido a `127.0.0.1`/`0.0.0.0` y el `0.0.0.0` **rechazado por el comando `dsh web`** | Confirma la postura: loopback y nada más en fase 1 |
| Encima hay Cordis (DI por plugins), Typert (RPC generado por decoradores), grafo de módulos en el navegador, registro de *slots* y ~40 paquetes `client/ui-*` | **No se hereda.** Ese andamio existe para que decenas de paquetes compongan sin conocerse; xonecode tiene cuatro capas y un `core/` puro |
| La vista **Trajectory** enseña los argumentos crudos de las tools (`bash {"command": "cd /Users/…"`) | **No se hereda.** Ver «Invariantes», más abajo |
| La sesión tiene barra de estado inferior con turnos, pasos, tiempo de LLM, TTFT, tok/s, cache hit e input | Es nuestra `formatearBarra` con más columnas; el modelo de datos ya existe (`vendor/tokenTracking.ts`) |

### En xonecode (leído en el código, no supuesto)

| Hecho | Consecuencia |
|---|---|
| **`Consola` (`cli/consola.ts:37`) ya es una interfaz neutra de UI**: `lineas`, `escribir`, `preguntar`, `leerSecreto`, `interactivo`, `catalogoModelos`, `guardarModeloGlobal`, y los opcionales `seleccionar?`, `piel?`, `aprobacionesTui?`, `aplicarTema?`, `conectarCloudStudio?` | La web es una **tercera implementación** de esa interfaz. El wizard de cuenta no se reescribe: `asistenteDeModelo` ya pregunta por `consola.seleccionar` y `consola.leerSecreto` |
| `puedeLeerRuta` (`agent/perfiles.ts:91`) compara **rutas virtuales con raíz `/`** (`/.env`, `/.git/`, `/.xonecode/`) | Un workspace bajo `~/.xonecode/…` **no** ciega al agente: su raíz virtual es el proyecto. La reserva de D4 es de convención, no de corrección |
| `EstadoOAuth` (`agent/cloudstudioMcp.ts:34`) es un objeto **plano**: un único `clientInformation`/`tokens`/`codeVerifier`/`scopes` en `~/.xonecode/cloudstudio-oauth.json` | Multi-entorno obliga a **indexarlo por entorno**, con migración: el juego que ya existe se conserva |
| `agent/gitSync.ts`, `descarga.ts`, `subida.ts` y `core/planDeSubida.ts` toman `raiz` **por parámetro**; ninguno sabe de dónde sale | Mover la copia local no toca la sincronización. Solo cambia **quién calcula `raiz`**: hoy el cwd, mañana la selección entorno+proyecto |
| El alta de cuatro pasos corre **dentro** de las ramas de consola (`cli/main.ts:787-797` en stdio; su equivalente en `correrTui.ts`) | `decidirPiel` tiene que bifurcar **antes**, o `xonecode` con TTY preguntaría proveedor en el terminal y luego abriría un navegador |
| `SesionReal` (`agent/turnoReal.ts:31`) **no tiene `cerrar()`** | Cambiar de proyecto necesita una salida limpia: o se añade, o se documenta qué queda vivo |
| No hay `vitest.config.ts`; el `include` por omisión barre el repo entero y `.worktrees/` no está excluido | El cliente web necesita `environment` por glob → **este es el momento de añadir la config**, con el `exclude` de `.worktrees/` que CLAUDE.md ya pide a mano |

---

## Arquitectura

### La web es la tercera piel

La misma costura que la TUI de Ink, y por la misma razón: el lazo de comandos, el estado
de sesión y el ejecutor **entran inyectados**; la piel solo aporta entrada, preguntas,
render y aprobaciones.

```
core/turno.ts  ──Piel──▶  cli/stdio.ts        (líneas estáticas)
                       ▶  cli/tui/pielTui.ts  (Ink)
                       ▶  web/servidor/pielWeb.ts   ← NUEVO: serializa a SSE

cli/consola.ts ──Consola──▶ stdio (readline)
                          ▶ TUI (correrTui.ts)
                          ▶ web/servidor/consolaWeb.ts  ← NUEVO
```

Los doce `DomainEvent` de `core/events.ts` son el protocolo del cable. No hay canal crudo
ni un segundo formato: lo que la TUI pinta es lo que la web recibe.

### El paquete nuevo

Se convierte el repo en **workspaces de npm** con un paquete nuevo para el cliente, que es
la forma de deepseek (`apps/web` construido con Vite, `dist/` servido por el host):

```
package.json            (raíz: workspaces, sigue siendo el paquete publicable `xonecode`)
src/                    el host de siempre — core, agent, cli
src/web/servidor/       NUEVO: el servidor HTTP, la Piel y la Consola web
apps/web/               NUEVO PAQUETE: el cliente (Vite + React + CSS Modules)
  package.json          vite, react, react-dom, clsx — nada de esto entra en el host
  tsconfig.json         `lib: dom`, aislado del tsconfig del host
  src/                  la SPA
  estilos/              el tema de deepseek, copiado con su aviso MIT
  dist/                 lo que sirve `xonecode` (no se versiona)
```

El servidor vive en `src/web/servidor/` y no en el paquete nuevo **a propósito**: necesita
`core/`, `agent/` y `cli/`, y sacarlo obligaría a publicar el host como librería. Lo que se
separa es el cliente, que es lo que arrastra el DOM y el build.

### Dos clases de consola, no una

`correrConsola` es un lazo sobre **una** `raiz`. La jerarquía entorno → proyecto → sesión
necesita algo antes de que exista ninguna raíz:

- **Vestíbulo** (`ConsolaDeVestibulo`): sin `raiz`. Corre el wizard inicial —cuenta y
  entorno—, registra entornos, hace OAuth, lista proyectos y descarga. Es lo que se ve
  antes de abrir nada. `asistenteDeModelo` funciona aquí sin cambios: no necesita `raiz`
  (`hayCredencial` y `guardarCredencial` entran inyectados).
- **Consola de proyecto**: un `correrConsola` con su `raiz` y su `crearEjecutorReal`.
  **Una activa a la vez** (D8). Cambiar de proyecto agota su `lineas` —que es EOF, no
  cuelgue: el lazo retorna— y abre otra.

---

## El despachador

`decidirPiel(argv)`, función pura al lado de `decidirTui`, con la misma forma de test:

| Invocación | Resultado |
|---|---|
| `xonecode` con stdin TTY | **web** |
| `xonecode` sin stdin TTY | consola stdio de siempre |
| `xonecode --cli` | consola de siempre (que decide TUI/stdio con `decidirTui` tal cual) |
| `xonecode --web` | web, aunque no haya TTY (servidores headless) |
| `xonecode run` / `verify` / `config` / `describe` / `doctor` / `modelos` | **no se mueven**: los códigos de salida son contrato y CI los lee |

Sin TTY la omisión **no** es la web: si lo fuera, un `echo "…" | xonecode` intentaría abrir
un navegador y se llevaría por delante el e2e de tubería byte-idéntica, que es lo que
sostiene que `npm test` no necesite terminal.

`decidirPiel` bifurca **antes** del alta de cuatro pasos, no dentro de una rama de consola.

Banderas nuevas: `--web`, `--cli`, `--no-abrir` (no abrir el navegador), `--puerto <n>`.
El puerto por omisión es fijo y **no es 7634**, que está reservado al callback OAuth
porque el IDS registra ese `redirect_uri`. `EADDRINUSE` se reporta con un mensaje que dice
el puerto y la bandera para cambiarlo, no con una traza.

---

## Datos

### `~/.xonecode/settings.json` (global, nuevo)

```jsonc
{
  "entornos": [
    { "id": "webstudio", "nombre": "XOne WebStudio", "url": "https://mcp.xonewebstudio.com/mcp" },
    { "id": "manager",   "nombre": "XOne Manager",   "url": "https://mcp.xonemanager.com/mcp" }
  ],
  "workspace": "~/.xonecode"
}
```

`workspace` es la **base**, no la ruta completa: la copia local de un proyecto queda en
`<workspace>/<entorno>/workspace/<proyecto>`, que con la base por omisión da
`~/.xonecode/<entorno>/workspace/<proyecto>`. La base es lo único configurable; la
disposición de dentro la fija xonecode, porque es lo que hace predecible encontrar una
copia sin consultar un índice.

Un **entorno es un servidor CloudStudio**: hoy los dos oficiales, mañana el on-premise de
un cliente. El escritor obedece el contrato de `agent/authEnDisco.ts`: la base de la fusión
es el objeto CRUDO, una escritura nunca destruye lo que había, y ante un JSON roto **para
sin escribir** en vez de recuperar el fichero por su cuenta.

`settings.json` **rechaza claves de API**, igual que `config.json`. Las credenciales de
modelo siguen solo en `~/.xonecode/auth.json`, modo 0600.

### `~/.xonecode/cloudstudio-oauth.json` (cambia de forma)

Pasa de plano a **indexado por entorno**:

```jsonc
{ "version": 2, "porEntorno": { "webstudio": { "tokens": …, "scopes": […] } } }
```

Migración: un fichero sin `version` es el juego único de hoy y se conserva tal cual bajo el
entorno que corresponda a la URL que tuviera el proyecto. Cerrar sesión en un entorno no
puede tocar los demás.

### `<proyecto>/.xonecode/config.json` (gana una clave)

Gana `entorno: "<id>"` y **conserva `cloudstudio.url`** (D5).

### Sesiones: `<proyecto>/.xonecode/sesiones/`

`indice.json` con `{id, titulo, creada, ultimoTurno}` por sesión, y un `<id>.jsonl` con los
`DomainEvent` del turno, uno por línea. Va en el `.xonecode` del proyecto, que ya tiene
precedente (`conversation_history/`), está denegado entero al agente y **no sube nunca** a
CloudStudio.

Reabrir es releer (D1): se reemiten los eventos guardados y se abre hilo nuevo. La interfaz
lo dice: la sesión reabierta se marca como histórica hasta el primer turno nuevo. Fingir que
la conversación continúa cuando el modelo no recuerda nada sería la clase de mentira muda
que este repo evita.

---

## El wizard inicial

Corre en el vestíbulo, en el navegador, y son **tres pasos**; cada uno solo aparece si falta
lo que decide, que es la regla que ya sigue el alta de terminal.

1. **Cuenta**: proveedor y modelo. Es `asistenteDeModelo` (`cli/wizardInicial.ts`) sin
   tocar, con la `Consola` web detrás. Solo aparece si el papel `trabajo` resuelve por
   `omision` —o sea, si nadie eligió nunca—, que es como se detecta hoy el primer arranque
   sin inventar una marca. La clave de API se teclea en un campo de contraseña; viaja a
   loopback y **no entra en ningún evento ni en ningún log**.
2. **Entorno**: registrar el primero. Nombre + URL del MCP, y OAuth (Authorization Code +
   PKCE) contra su IDS. Los dos oficiales se ofrecen pre-rellenados; «otro» es un campo
   libre, que es lo que cubre el on-premise.
3. **Proyecto**: listar los del entorno (`herramientaDeProyectos`, que ya prueba los
   nombres conocidos en orden y cae en heurística), elegir rama origen y descargar al
   workspace.

Cancelar antes de elegir no escribe nada. Cancelar **después** de elegir proyecto deja el
`config.json` escrito a propósito, y se dice —negarlo sería mentir—, igual que hoy. Una
credencial tecleada en el paso 1 queda escrita aunque se cancele el paso 2, y el asistente
lo dice en el momento.

El callback OAuth (puerto 7634) hoy termina diciendo «vuelve a la terminal». En modo web
redirige a la URL de la web.

---

## El servidor

`node:http` en `127.0.0.1`. Sin `0.0.0.0` en esta fase, ni bandera para pedirlo.

- **Transporte** (D7): `GET /eventos` es un SSE que emite los `DomainEvent` serializados;
  `POST /accion` lleva lo que el usuario hace (prosa, comando, decisión de aprobación,
  respuesta a un selector, secreto). El servidor guarda la lista de actos de la sesión
  activa, así que una reconexión reemite y no pierde nada.
- **Autenticación**: token aleatorio por arranque, en la URL que se imprime y se abre;
  se cambia por una cookie en la primera petición. **Comprobación de `Origin` y `Host` en
  toda petición**, que es la defensa contra DNS rebinding — el ataque real a un servidor
  local, no un adorno.
- **Qué no se sirve jamás**: `~/.xonecode/` entero y el `.xonecode/` de cualquier proyecto.
  El servidor de estáticos sirve `apps/web/dist` y nada fuera de esa raíz: recorrido hacia
  arriba es 403, método distinto de GET/HEAD es 405, ausente es 404 vacío.
- **Modo desarrollo**: `npm run build:web` es requisito. Si falta `apps/web/dist`, el
  comando lo dice con esa frase exacta y sale; no hay proxy de Vite en esta fase.

`web/servidor/pielWeb.ts` implementa `Piel` entera, `fase?` y `notificacion?` incluidos —la
web sí sabe animar fases y sí sabe reciclar avisos, así que los implementa en vez de
dejarlos caer a línea estática.

## La aprobación

**Fail-closed por transporte**, que es el equivalente web del «fail-closed por tecla» del
modal de Ink:

- Desconexión del SSE, cierre de pestaña o timeout = **rechazo**.
- Solo un «sí» explícito aprueba. Nada implícito, y ningún Enter a secas.
- `MAX_APPROVAL_ROUNDS = 5` por turno, sin cambios.
- El **diff viaja solo en el mensaje de aprobación**, que es el paso donde se decide sobre
  él. No entra en el stream de eventos ni se guarda en el `.jsonl` de la sesión.

## El cliente

Vite + React + CSS Modules + `clsx`. Sin Tailwind y sin librería de componentes, que es la
regla que heredamos.

**Estilos**: `packages/client/ui-theme/src/styles/*.css` de deepseek copiados a
`apps/web/estilos/`, con el aviso MIT conservado en cabecera y anotados en un
`THIRD_PARTY_NOTICES.md`. **No se copia ningún logo ni marca denominativa** — las guías de
marca de DeepSeek lo piden explícitamente, y el nombre del producto aquí es XOne.

**Maqueta**, calcada de lo que se vio funcionando, con la barra **a la derecha** como pidió
el usuario y un nivel más de jerarquía:

- Barra lateral derecha: **entorno** (selector arriba) → **proyectos** → **sesiones**
  anidadas con su antigüedad. Botón de sesión nueva. Ajustes abajo.
- Centro sin sesión: héroe con el compositor —pastillas de proyecto, modo, modelo, y el
  botón de enviar—.
- Centro con sesión: cabecera con nombre y modelo, pestañas **Chat / Trayectoria**,
  markdown renderizado, compositor abajo, y la **barra de estado inferior** con lo que ya
  calcula `formatearBarra` más lo que el tracker sabe.

**Un renderizador de markdown es una dependencia nueva del cliente.** Se nombra en el plan
y se elige ahí; no se inventa uno.

---

## Invariantes que no se negocian

1. **Ningún evento lleva argumentos de tool.** La vista de Trayectoria tendrá la pinta de
   la de deepseek —franja, filas monoespaciadas, buscador— pero sus filas llevan
   `tool.nombre` y `tool.detalle`, y `detalle` es un campo de la lista blanca por nombre de
   tool (`agent/resumenDeTool.ts`): ruta o patrón, nunca contenido. Deepseek enseña
   `bash {"command": …}`; nosotros no podemos, porque `write_file` lleva el fichero entero
   y una tool MCP lleva el bearer. Si algún día se quieren los argumentos ahí, se abre a
   propósito decidiendo qué se redacta — no se hereda copiando una pantalla.
2. **`npm test` sigue sin necesitar clave, red, simulador ni navegador.** El servidor se
   prueba sin navegador; nada de Playwright en la suite.
3. **La frontera de `core/` sigue probada** (`core/imports.test.ts`), y se añade **una
   frontera nueva** con la misma forma que `cli/tui/frontera.test.ts`: `react-dom`, `vite`
   y cualquier API de DOM solo dentro de `apps/web/`. El host no importa nada del cliente.
4. **Las tools remotas de CloudStudio no se inyectan en el agente.** La web no cambia eso:
   descarga y subida las sigue ejecutando el host, nunca una tool que el agente invoque.
5. **La aprobación humana es fail-closed.** Lo que no se entiende es rechazo.
6. **Los avisos de honestidad son código, no prompt**, y siguen teniendo alcance de turno.

---

## Herramienta que hay que tocar sí o sí

- **`vitest.config.ts` deja de no existir.** El cliente necesita `environment` por glob, y
  aprovechamos para meter el `exclude` de `.worktrees/` que CLAUDE.md documenta hoy como
  un coste medido que hay que sortear a mano.
- **`tsconfig` del cliente aparte**, con `lib: dom`. El host no gana el DOM.
- `npm run build:web` en la raíz, y `npm run build` lo encadena.

## Fuera de alcance en esta fase

Sesiones concurrentes. Sesiones que continúan la conversación (checkpointer persistente).
La franja temporal del Trajectory. Los iconos de feedback (👍/👎/reintentar). La descarga
del «session log». Una pantalla de ajustes más allá de entornos, workspace y modelo.
`0.0.0.0`. Que el cwd preseleccione proyecto. El renombrado de tokens a `--xone-*`.
Proyectos offline en la web (van por `--cli`).

## Asunciones a confirmar

1. **El `redirect_uri` de un CloudStudio on-premise.** El puerto 7634 es fijo porque el IDS
   registra esa URL. Un IDS de cliente tiene que tenerla registrada también — o el entorno
   necesita llevar su propio puerto en la ficha. Es pregunta para el equipo de servidor.
2. **`SesionReal` no tiene `cerrar()`.** Cambiar de proyecto necesita una salida limpia:
   o se añade, o se documenta qué queda vivo. Se decide en el plan.
