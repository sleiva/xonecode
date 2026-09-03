# Cómo probar xonecode

## Antes de nada: el lanzador

```sh
npm run build && npm link      # o: ln -sf "$PWD/dist/bin.js" ~/.local/bin/xonecode
```

Y ya se usa `xonecode` desde cualquier sitio.

> **No uses `npm run xonecode` desde otro proyecto.** `npm run` cambia el directorio de
> trabajo al del `package.json`, así que xonecode creería que el proyecto es este repo y
> diría «no hay app.xml aquí» estés donde estés. Medido. Para desarrollar, `./bin/xonecode`
> llama a tsx directamente y preserva el cwd — y le ancla el `tsconfig.json` del repo con
> `--tsconfig`: tsx lo busca desde el cwd, y desde otro proyecto perdería el `jsx: react-jsx`
> y la TUI reventaría con «React is not defined» al montar. También medido.

---

## 1. Sin gastar nada: los comandos que no piden ni red ni claves

```sh
xonecode --help
xonecode describe          # qué hay montado y QUÉ ES DE PEGA
```

`describe` canta el verificador como `⚠ DE PEGA` — y es verdad: dentro de un turno
todavía no corre nadie. Está para eso.

Probar la selección de modelo, sin llamar a ninguno:

```sh
xonecode describe --modelo anthropic/claude-sonnet-4-5-20250929 \
                  --modelo-rapido ollama/glm-5.3-flash:cloud
xonecode describe --modelo olama/x     # sale con 64 y dice los proveedores válidos
```

## 2. La consola interactiva

```sh
cd /ruta/a/TuApp      # o a una copia
xonecode              # sin argumentos: entra en la consola
```

Arranca así:

```
xonecode · TuApp (7 colls) · ollama/glm-5.3-flash:cloud · 0 tokens
14 comandos: /ayuda /config /describe /doctor /verify /modelo /modelos /modelo-rapido
             /modelo-trabajo /modelo-afilado /hilo /nuevo /provider /salir
```

Dentro se escribe **una petición en prosa** o **un comando de barra**. Los comandos son los
mismos que desde la shell, y **es literalmente la misma función** detrás — `/config` llama a
`cmdConfig`, no a una copia. Por eso no pueden divergir.

| dentro | equivale a |
|---|---|
| `/ayuda` | la lista, generada del registro (no escrita a mano) |
| `/config` | `xonecode config` |
| `/describe` | `xonecode describe` |
| `/doctor` | `xonecode doctor` |
| `/verify` | `xonecode verify` — **el más útil**: se corre tras un turno que escribió |
| `/modelo ollama/qwen3.8:27b-mlx` | cambia los tres papeles **en caliente**, sin perder el hilo |
| `/modelo-afilado anthropic/…` | cambia solo un papel |
| `/modelos <proveedor>` | consulta el catálogo vivo, filtra modelos de conversación y guarda una selección global para un papel |
| `/hilo` · `/nuevo` | ver el hilo · abrir otro sin salir |
| `/provider` | los proveedores y **si** tienen credencial (nunca la clave) |
| `/provider anthropic` | configura la clave **sin eco** y la guarda en `~/.xonecode/auth.json` (0600); no lista modelos |
| `/salir` | salir (Ctrl-D también) |

Tab completa los comandos: `/mod` + Tab. Con varios candidatos los lista con su descripción.

### Probarla sin manos

**Con pipe también arranca** (no hay puerta de TTY), así que se puede guionizar:

```sh
printf '/ayuda\n/verify\n/config\n/salir\n' | xonecode
```

Dos cosas cambian sin TTY, las dos a propósito: el Tab no sirve, y **`/provider <nombre>`
se rechaza** — leer una clave de un pipe la deja en el historial de la shell o en el log de
CI.

### La TUI (Ink)

Con un terminal de verdad, la consola monta una TUI de Ink: transcript, sidebar (modelo por
papel, proyecto, rama, versión) y cuadro de entrada. **Es la MISMA consola** — los comandos, el
hilo y el ejecutor son los de arriba; solo cambia la piel.

| bandera | efecto |
|---|---|
| *(nada)* | TUI solo si stdin Y stdout son TTY; cualquier tubería cae al stdio de siempre |
| `--no-tui` | consola clásica (stdio), pase lo que pase |
| `--tui` | fuerza la TUI; sin TTY de verdad en ambos lados sale con **64** y lo dice |

Probarla **sin gastar**:

```sh
./bin/xonecode --guion --tui     # en un terminal de verdad
```

El agente de pega recorre el turno entero (fases, plan, verificación de pega) sin llamar a
ningún modelo, en la TUI montada de verdad. Y **contra Ollama de verdad**: `./bin/xonecode
--tui` sobre una copia de tu app — una petición que escribe abre el MODAL de aprobación con el
diff coloreado.

Dentro de la TUI:

- **El modal de aprobación es fail-closed por tecla**: solo `s`/`S` aprueba; `n`, Enter,
  Escape, Ctrl-C — y desmontar sin responder — **rechazan**. Lo mismo que en stdio, con otro
  teclado.
- **Ctrl-C durante un turno cancela el turno** (el paso en marcha termina; nada suyo se
  pierde a medias). No mata la app.
- `/modelo <proveedor>/<modelo>` cambia el modelo en caliente y la sidebar lo enseña al
  momento.
- `/salir` desmonta limpio y devuelve la shell. (El Ctrl-D que sirve en stdio aquí no: en la
  TUI es una tecla más y no está en el contrato de la Entrada.)

Los ejemplos guionizados de arriba (pipes, CI) NO montan la TUI: es lo que mantiene su salida
byte-idéntica. Y una nota de teclado: los paste de bloques Enter-incluido no se llevan bien
con el modo raw de ink — escríbelo tú, tecla a tecla.

### Lo que en la consola es de VERDAD y lo que no

| | |
|---|---|
| `/verify` | **real** — corre `xone-simulator` sobre el proyecto |
| `/config`, `/describe`, `/doctor` | **reales** |
| `/modelo`, `/provider`, `/hilo`, `/nuevo` | **reales** |
| **una petición en prosa** | **REAL** — va al agente de verdad (Ollama por omisión) |

La excepción es `--guion`: esa bandera SIEMPRE monta el agente de pega, sin gastar, y con
ella los tokens de la barra se quedan en `0` a propósito: el turno guionizado no corre
ningún modelo.

---

## 3. Ver un turno correr, sin llamar a ningún modelo


```sh
xonecode run "crea una coleccion de clientes" --lento
```

Un turno completo con un agente **de pega** que lo dice: fases, `🔧 read_file ×3`
colapsado por racha, verificación en rojo y luego verde, reparación, y la respuesta
apareciendo trozo a trozo (por eso `--lento`).

## 4. El verificador, de verdad

```sh
xonecode verify /ruta/a/UnProyectoLimpio       # verde, exit 0
xonecode verify /ruta/a/UnProyectoConErrores # 12 errores, exit 1
xonecode verify /no/existe                             # exit 70: es del ENTORNO
```

El tercero importa: dice «no se pudo verificar», no «tu proyecto está roto».

## 5. Sobre un proyecto de verdad

**Siempre sobre una copia mientras el harness sea joven.**

```sh
cp -r /ruta/a/TuApp /tmp/prueba && cd /tmp/prueba
xonecode doctor
```

`doctor` contesta lo que hace falta saber antes de dejarle escribir: si hay `app.xml`,
cuántas colecciones, si git puede dar el diff y el deshacer, y si el simulador responde.

### Una pregunta de solo lectura

```sh
xonecode run --real "¿qué colecciones tiene este proyecto?"
```

Lee los ficheros de verdad y contesta anclado en ellos. Al final dice **«sin cambios en
el proyecto»**: un turno que no tocó nada tiene que verse.

### Una petición que escribe: aquí se prueba el HITL

```sh
xonecode run --real "Crea un fichero NOTAS.md en la raiz con el texto: hola."
```

Se para y pregunta:

```
────────────────────────────────────────────────────────────
APROBACIÓN 1/1
  [dev] quiere escribir un fichero del proyecto
  fichero: /NOTAS.md
  quién:   dev
¿Aprobar? [S/n]
```

- **Con terminal**: Enter o `s` aprueba; `n` rechaza.
- **En un pipe o en CI**: el Enter **NO** aprueba. Hace falta un `s` explícito.
  Una línea en blanco no demuestra que haya nadie mirando, y esto escribe en un
  proyecto real.
- Cualquier cosa que no se entienda (`quizá`, `espera`) **rechaza**. Aprobar ejecuta;
  rechazar no toca nada, así que ante la duda va la recuperable.

Comprobarlo sin manos:

```sh
echo ""  | xonecode run --real "Crea NOTAS.md con: hola."   # rechaza, no escribe
printf 's\n' | xonecode run --real "Crea NOTAS.md con: hola."  # aprueba y escribe
diff -r /ruta/a/TuApp /tmp/prueba                            # qué cambió de verdad
```

Un turno puede pedir permiso **más de una vez** (aprueba un `write_file`, luego quiere
un `edit_file`). El tope es de 5 rondas.

## 6. Elegir modelo

Por omisión, Ollama local:

| papel | modelo | quién lo usa |
|---|---|---|
| `rapido` | `ollama/glm-5.3-flash:cloud` | orquestador y especialistas de lectura |
| `trabajo` | `ollama/glm-5.3-flash:cloud` | los que escriben |
| `afilado` | `ollama/kimi-k3:cloud` | reservado al juez (aún sin usar) |

```sh
xonecode run --real "…" --modelo gemini/gemini-3.6-flash
xonecode run --real "…" --modelo-trabajo anthropic/claude-sonnet-4-5-20250929
XONECODE_MODELO=ollama/qwen3.8:27b-mlx xonecode run --real "…"
```

Un turno de solo lectura sobre un proyecto pequeño va por **20-90 s** con `glm-5.3-flash`.

## 7. Códigos de salida

| código | qué significa |
|---|---|
| 0 | bien |
| 1 | el proyecto tiene errores, o no es un proyecto XOne |
| 2 | había escrituras esperando aprobación y **nada se aplicó** |
| 64 | error de uso (bandera o modelo mal escritos) |
| 70 | fallo del **entorno**, no del proyecto (falta el simulador, ruta inexistente) |

El 2 es deliberado: un turno que se quedó esperando un permiso que nadie dio **no es un
éxito**, y CI no puede leerlo como tal.

---

## Lo que TODAVÍA no hace, y conviene saber antes de fiarse

- **El verificador no corre dentro del turno.** Cada corrida te lo avisa:
  `⚠ el verificador no ha corrido en este turno`. Funciona como comando suelto
  (`xonecode verify`), pero nadie lo llama tras escribir.
- **No hay lazo**: ni planner, ni juez, ni reparación, ni presupuestos.
- **Un disparo, no conversación**: cada `run` abre un hilo nuevo. No hay `/estado` ni
  `/nuevo`.
- **La consola habla con el agente real por omisión** (y `--guion` la vuelve de pega, sin
  gastar). Antes era al revés; si algún otro texto dice lo contrario, el código manda.
- **La TUI es la piel por omisión SOLO con TTY en ambos lados**; en pipes y CI manda el stdio
  de siempre, y su salida sigue siendo byte-idéntica.
- **CloudStudio MCP puede autenticarse con `/connect-studio`**: abre el IDS, valida el
  endpoint y guarda su URL en `.xonecode/config.json`. El agente sigue trabajando sobre
  el proyecto local hasta que se incorpore la lista blanca de tools remotas por perfil.
