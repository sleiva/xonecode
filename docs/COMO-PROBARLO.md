# Cómo probar xonecode

## Antes de nada: el lanzador

```sh
npm run build && npm link      # o: ln -sf "$PWD/dist/bin.js" ~/.local/bin/xonecode
```

Y ya se usa `xonecode` desde cualquier sitio.

> **No uses `npm run xonecode` desde otro proyecto.** `npm run` cambia el directorio de
> trabajo al del `package.json`, así que xonecode creería que el proyecto es este repo y
> diría «no hay app.xml aquí» estés donde estés. Medido. Para desarrollar, `./bin/xonecode`
> llama a tsx directamente y preserva el cwd.

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
13 comandos: /ayuda /config /describe /doctor /verify /modelo /modelo-rapido
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
| `/hilo` · `/nuevo` | ver el hilo · abrir otro sin salir |
| `/provider` | los proveedores y **si** tienen credencial (nunca la clave) |
| `/provider anthropic` | pide la clave **sin eco** y la guarda en `~/.xonecode/auth.json` (0600) |
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

### Lo que en la consola es de VERDAD y lo que no

| | |
|---|---|
| `/verify` | **real** — corre `xone-simulator` sobre el proyecto |
| `/config`, `/describe`, `/doctor` | **reales** |
| `/modelo`, `/provider`, `/hilo`, `/nuevo` | **reales** |
| **una petición en prosa** | **GUION.** La consola todavía no está cableada al agente real |

Ese último es el hueco: `xonecode run --real "…"` sí conversa con el agente de verdad, pero
la **consola** usa el agente guionizado. Por eso los tokens de la cabecera se quedan en `0`.

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
- **La consola no habla con el agente real** todavía: una petición en prosa la
  contesta un guion. Los comandos de barra sí son reales.
- **No hay TUI** con paneles todavía; la consola es stdio.
- **No usa los MCP de Studio**: el proyecto tiene que estar en disco.
