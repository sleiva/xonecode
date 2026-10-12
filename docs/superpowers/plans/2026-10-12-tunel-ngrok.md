# Túnel ngrok para la sesión remota — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers-extended-cc:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** que la sesión remota pueda abrirse por un túnel ngrok levantado por xonecode (puente local + ngrok), con el QR saliendo con la dirección de ngrok, e instalar/configurar ngrok desde Ajustes.

**Architecture:** el puente (`arrancarServidor`) y la web móvil compilada viajan en el paquete `@xone/xonecode-remoto` (subruta `./servidor`). xonecode, al encender por la vía «ngrok», arranca ese puente en un puerto libre de loopback, lanza `ngrok http <puerto>` con log JSON, lee la URL pública de ese log y abre la sala contra `wss://<publica>/ws`. Apagar mata el grupo de ngrok y cierra el puente. La instalación es una receta más del corredor de Dispositivos; el authtoken entra por `leerSecreto` y se escribe con `ngrok config add-authtoken`.

**Tech Stack:** TypeScript, Node 22, ws, vitest, React (apps/web), ngrok v3 CLI.

**Spec:** diseño aprobado en el chat el 12-10-2026 (sin fichero de spec; ver «Decisiones»). Spec padre: `docs/superpowers/specs/2026-10-09-sesion-remota-xonecode-design.md`.

## Global Constraints

- `npm test` no necesita ngrok, red, el paquete ni el puente: todo entra por un `TunelPort` con doble en `core/ports.ts` (marca `ES_DOBLE`).
- El paquete sigue cargándose por `import()` dinámico de un nombre en variable, y solo desde `src/agent/remoto/` (hoy `puenteWebSocket.ts`; el túnel puede vivir al lado, en `tunelNgrok.ts`). No se añade al `package.json` de xonecode.
- `core/` puro: no importa `agent/`, `web/`, el paquete, ni `node:child_process`.
- `sinRutas`: nada de la máquina cruza el cable. Ni la salida de ngrok, ni la ruta de su configuración, ni el authtoken. Un fallo cruza como texto FIJO nuestro (tabla en `core/tunel.ts`) o `code` de Node. La URL pública sí cruza (ya va dentro del enlace).
- El authtoken no se escribe en ningún fichero nuestro ni en logs; se pasa a `ngrok config add-authtoken` por `execFile` (sin shell).
- Procesos largos: `detached: true` y matar el GRUPO al apagar, al cerrar la consola y al salir el proceso; consumir stdout/stderr de ngrok (si no, se bloquea).
- La medida manda: «ngrok instalado» = `ngrok version` contesta; «con cuenta» = la configuración que `ngrok config check` nombra tiene `authtoken`. Nunca un flag recordado.
- Interruptor de la sesión remota sin cambios: apagado ⇒ nada de esto se pinta ni se lanza.
- CLAUDE.md sin fechas, recuentos ni duraciones sueltas (`src/documentacion.test.ts`).
- Ningún color literal en `.module.css` (`Barra.test.tsx`); iconos comprobados contra los exports reales del paquete de primitivas.
- Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01SF55UskepprwaEuqEF2PMm`; stage por rutas explícitas. Antes de cada commit: `npm run typecheck` y los tests del área (`FORCE_COLOR=0 npx vitest run <ruta> --maxWorkers=2`).

**User decisions (already made):**
- «y generar el qrcode basado en la direccion de ngrok» — el túnel expone el PUENTE de la sesión remota (no la consola).
- Recomendada aceptada («ok»): el puente viaja en el paquete `@xone/xonecode-remoto`; xonecode lo arranca en local.
- Instalar con `brew` en macOS como receta; en Windows/Linux, guía sin botón.
- Authtoken por `leerSecreto` → `ngrok config add-authtoken`; dominio estático opcional en `settings.remoto.ngrok.dominio`.
- En el diálogo «Sesión remota»: elegir «Servidor de XOne» o «Túnel local (ngrok)».

## Decisiones (del diseño aprobado + rulings del controlador)

- La elección de vía se GUARDA: `settings.remoto.via: "servidor" | "ngrok"` (ausente = `servidor`). Cambiarla con la sesión encendida no hace nada hasta apagar y encender (el diálogo solo deja cambiarla en `apagada`/`error`).
- La URL pública se lee del LOG JSON de ngrok (`--log stdout --log-format json`, línea con `url` de un túnel iniciado), no de la API en 4040 (se mueve a 4041+ si está ocupado). Tope `TOPE_DE_TUNEL_MS` (30 s). Si el formato real difiere, la tarea lo MIDE y ajusta el parser con un test sobre la línea real.
- Revocar con la vía ngrok conserva el túnel (misma dirección pública, sala y secreto nuevos).
- Errores con texto fijo: ngrok no instalado; falta el authtoken (ngrok sale con un error de autenticación); ngrok no dio una dirección a tiempo; ngrok se cerró; el dominio no es tuyo / no está reservado; el paquete no trae el puente (versión vieja).

---

### Task 1: el puente y la web dentro del paquete (repo `xonecode-server`)

**Goal:** `import { arrancarServidor } from "@xone/xonecode-remoto/servidor"` funciona y sirve la web móvil sin pasar `carpetaWeb`.

**Files:** `/Users/projects/xonecode-server`: mover `servidor/src/{servidor,salas}.ts` (y sus tests) a `packages/remoto/src/servidor/`; `packages/remoto/package.json` (exports `./servidor`, `ws` en dependencies, `@types/ws` dev, `files` con `web`); script de copia de `web/dist` → `packages/remoto/web/`; `package.json` raíz (orden de build: remoto-tipos → web → copia → remoto-servidor, o el que funcione sin ciclo); `servidor/src/principal.ts` pasa a importar del paquete; `servidor/Dockerfile`; README.

**Acceptance Criteria:**
- [ ] `arrancarServidor({ puerto: 0 })` sin `carpetaWeb` sirve `index.html` en `/r/<sala>`: la carpeta por omisión se resuelve RELATIVA al módulo (`new URL(…, import.meta.url)`), y un test lo prueba contra el paquete construido.
- [ ] `npm run build` en la raíz deja `packages/remoto/web/index.html` y `packages/remoto/dist/servidor/*.js`; `npm pack --dry-run -w @xone/xonecode-remoto` lista `web/` y `dist/servidor/`.
- [ ] La entrada principal `.` NO arrastra `ws` (la web la importa en el navegador): el servidor solo por la subruta.
- [ ] `npm start -w servidor` y la imagen Docker siguen funcionando igual; todos los tests en verde.

**Verify:** `npm run build && npm test` en `/Users/projects/xonecode-server` → verde; `node -e 'import("@xone/xonecode-remoto/servidor").then(async m=>{const s=await m.arrancarServidor({puerto:0});console.log(s.urlHttp);await s.cerrar()})'` desde `servidor/` imprime una URL.

Rama `tunel-ngrok` en ese repo. Sin push.

```json:metadata
{"repo":"xonecode-server","modelTier":"standard","files":["packages/remoto/","servidor/","package.json","README.md"]}
```

### Task 2: lo puro — ajustes, túnel, receta y cable (xonecode)

**Goal:** las reglas sin efectos: vía y dominio en los ajustes, parser del log de ngrok, conversión a `wss`, textos fijos de error, receta de instalación, y los tipos nuevos del cable en host y cliente.

**Files:** `src/core/settings.ts` (+test): `AjustesDeRemoto.via?`, `ngrok?: { dominio?: string }`, validación (dominio: nombre de host sin esquema ni ruta; malo → se descarta con aviso, como `servidor`), `remotoEnVigor` devuelve `via` y `dominio`. Nuevo `src/core/tunel.ts` (+test): `urlPublicaDeLinea(linea): string | undefined`, `servidorDeTunel(https): string` (`wss://host/ws`), `motivoDeDominioInaceptable`, `MOTIVOS_DEL_TUNEL` (textos fijos), `motivoDeSalidaDeNgrok(lineas): clave` (autenticación / dominio / otro — por CÓDIGO `ERR_NGROK_xxxx`, nunca devolviendo el texto). `src/core/dispositivos.ts` (+test): receta `ngrok` (id y plataforma ampliados; macOS: paso `brew install ngrok` ejecutable; Windows/Linux: pasos-guía no ejecutables con `winget install ngrok.ngrok` / enlace de descarga), `hecho` desde la medida. `src/web/servidor/transporte.ts` + `apps/web/src/tipos.ts`: `remoto` lleva `via?` y estado de ngrok (`ngrok?: { instalado: boolean; cuenta: boolean; dominio?: string; receta?: Receta }`); acciones del cliente `{clase:"remoto", accion:"via", via}`, `{clase:"remoto", accion:"authtoken"}`, `{clase:"remoto", accion:"dominio", dominio}`.

**Acceptance Criteria:**
- [ ] Tests de `urlPublicaDeLinea` sobre líneas JSON reales de ngrok v3 (medir con `ngrok http 9 --log stdout --log-format json` unos segundos y copiar las líneas; si no hay cuenta, la línea de error real sirve para `motivoDeSalidaDeNgrok`).
- [ ] `tipos.test.ts` sigue verde (literales iguales en host y cliente); `imports.test.ts` verde.
- [ ] La receta `ngrok` NO aparece en la pestaña de Dispositivos (su filtro por plataforma de aparato no la recoge).

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run src/core src/web/servidor/transporte apps/web/src/tipos --maxWorkers=2`

```json:metadata
{"repo":"xonecode","modelTier":"standard","files":["src/core/settings.ts","src/core/tunel.ts","src/core/dispositivos.ts","src/web/servidor/transporte.ts","apps/web/src/tipos.ts"]}
```

### Task 3: el túnel real y la instalación (xonecode, `agent/`)

**Goal:** `TunelPort` + doble; la implementación real que arranca puente + ngrok y la mide; el paso de receta `brew install ngrok`; la medida de ngrok (instalado, cuenta) y la escritura del authtoken.

**Files:** `src/core/ports.ts`: `TunelPort { abrir(o: { dominio?: string }): Promise<TunelAbierto> }`, `TunelAbierto { servidor: string; cerrar(): Promise<void>; alCaer(f: (motivo: string) => void): void }`, `TunelEnMemoria` (doble, `ES_DOBLE`). Nuevo `src/agent/remoto/tunelNgrok.ts` (+test con un `lanzar` y un módulo falsos): carga `@xone/xonecode-remoto/servidor` por nombre en variable (sin él → motivo fijo «el paquete no trae el puente»), `arrancarServidor({ puerto: 0 })`, `ngrok http <puerto> [--url <dominio>] --log stdout --log-format json` detached, lee la URL con tope, `cerrar` mata el grupo y cierra el puente (orden: ngrok primero), `alCaer` si ngrok sale. Nuevo `src/agent/remoto/ngrokEnMaquina.ts` (+test): `medirNgrok()` (versión + cuenta, sin ruta hacia fuera), `guardarAuthtoken(token)` por `execFile`. `src/agent/dispositivos/instalacionEnMaquina.ts`: entrada `ngrok:darwin:1` en `PASOS_EJECUTABLES` (binario `brew`, `conSdk:false`, mismo `entornoExtra` que el de Android); el test que compara `ejecutable` con la tabla en las dos direcciones, verde.

**Acceptance Criteria:**
- [ ] Test: el túnel real con un `ngrok` falso (script que escribe una línea JSON con `url` y se queda vivo) devuelve `wss://…/ws`; `cerrar()` deja el grupo muerto y el puente cerrado; un `ngrok` que sale con error de autenticación da el motivo fijo correspondiente; uno que no escribe nada da el de tiempo agotado.
- [ ] Nada de `tunelNgrok.ts` lo importa `core/` ni `web/` directamente (entra por opción, como `puertoRemoto`).
- [ ] Una prueba manual MEDIDA con el ngrok real de la máquina (apuntada en el informe): URL pública obtenida, `curl <url>/salud` → `ok`, `cerrar` deja sin proceso ngrok.

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run src/agent/remoto src/agent/dispositivos src/core --maxWorkers=2`

```json:metadata
{"repo":"xonecode","modelTier":"frontier","files":["src/core/ports.ts","src/agent/remoto/tunelNgrok.ts","src/agent/remoto/ngrokEnMaquina.ts","src/agent/dispositivos/instalacionEnMaquina.ts"]}
```

### Task 4: cableado en el servidor (xonecode, `web/servidor/`)

**Goal:** la sesión remota usa el túnel cuando la vía es ngrok; las acciones nuevas del cable funcionan; la receta de ngrok corre por el corredor de siempre.

**Files:** `src/web/servidor/puenteRemoto.ts` (+test): opción `preparar?: () => Promise<{ servidor: string; cerrar(): Promise<void>; alCaer(f) }>` usada en `encender` cuando existe (si no, `servidor()` como hoy); respeta el contador de generación (un túnel que llega tras apagar se cierra); `apagar` y el cierre de la consola cierran el túnel; `revocar` lo conserva; `alCaer` → estado `error` con motivo fijo. `src/web/servidor/arranque.ts`: `OpcionesDeArranque.tunel?` (test hook, como `puertoRemoto`), cableado real a `tunelNgrok`; `preparar` solo si `remotoEnVigor(...).via === "ngrok"`; acciones `via` (guarda en settings por el escritor existente), `authtoken` (`leerSecreto` → `guardarAuthtoken`, «"" = cancelar», vuelve a medir), `dominio` (valida, guarda); el mensaje `remoto` lleva `via` y la foto de ngrok (medida al conectar el primer cliente y tras cada acción/receta, no en sondeo); la receta `ngrok` entra en `atenderReceta`/`correrTrabajo` sin cerrojo nuevo y, al acabar, se vuelve a medir. `arranque.remoto.test.ts`: casos por `montarRutas` real.

**Acceptance Criteria:**
- [ ] Por `montarRutas` real con `TunelEnMemoria`: vía ngrok + encender → `activa` con la `url` del túnel (`https://<del doble>/r/...`); apagar → el doble registra `cerrar`; caída del túnel → `error` con el motivo fijo; vía servidor → el túnel no se toca.
- [ ] `authtoken` vacío no llama a `guardarAuthtoken`; el token no aparece en ningún mensaje del cable ni en `informar` (test que lo busca).
- [ ] Apagar el proceso (`cable.cerrarRemoto`) cierra el túnel.

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run src/web src/core --maxWorkers=2`

```json:metadata
{"repo":"xonecode","modelTier":"frontier","files":["src/web/servidor/puenteRemoto.ts","src/web/servidor/arranque.ts","src/web/servidor/arranque.remoto.test.ts"]}
```

### Task 5: la cara (xonecode, `apps/web`)

**Goal:** sección «Sesión remota» en Ajustes (solo con el interruptor encendido) con la tarjeta de ngrok, y el selector de vía en el diálogo.

**Files:** `apps/web/src/componentes/Ajustes.tsx` (sección `remoto` condicional como `conectores`), nuevo `apps/web/src/componentes/TunelNgrok.tsx` (+test): no instalado → `<Receta>` de ngrok (reutilizada) con su progreso; instalado sin cuenta → botón «Poner authtoken» (manda la acción; el campo lo pinta el diálogo de secreto de siempre); dominio → campo + guardar (valida con la misma regla, copia en el cliente atada por test o reutilizando la tabla de casos si existe el patrón); listo → versión y dominio. `apps/web/src/componentes/SesionRemota.tsx` (+test): conmutador «Servidor de XOne / Túnel local (ngrok)» (patrón `SelectorDeModo`, `aria-pressed` en las dos mitades) visible en `apagada`/`error`; con ngrok sin instalar o sin cuenta, el encender explica qué falta y lleva a Ajustes en vez de encender; en `activa` dice por qué vía. `store.ts`: lista blanca de los campos nuevos. `App.tsx`: hilos de props.

**Acceptance Criteria:**
- [ ] Tests de componente para los cuatro estados de la tarjeta y del conmutador; `Barra.test.tsx` y `estilosDelCliente.test.ts` verdes.
- [ ] `npm run build:web` construye; `npm run typecheck` limpio.

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run apps/web --maxWorkers=2 && npm run build:web`

```json:metadata
{"repo":"xonecode","modelTier":"standard","files":["apps/web/src/componentes/Ajustes.tsx","apps/web/src/componentes/TunelNgrok.tsx","apps/web/src/componentes/SesionRemota.tsx","apps/web/src/store.ts","apps/web/src/App.tsx"]}
```

### Task 6: documentación y prueba de punta a punta real

**Goal:** CLAUDE.md y DECISIONES.md lo cuentan; una pasada real (ngrok real + paquete construido + navegador) encendiendo por ngrok desde la consola, con el QR saliendo con la dirección de ngrok y un móvil simulado (Playwright con viewport de móvil) mandando un mensaje.

**Acceptance Criteria:**
- [ ] CLAUDE.md: la vía ngrok en el párrafo de la sesión remota (puente en el paquete, URL del log, matar el grupo, authtoken fuera de nuestros ficheros, límites: página de aviso de ngrok, dirección cambiante sin dominio); `documentacion.test.ts` verde.
- [ ] Prueba real apuntada (con `settings.json` respaldado y restaurado, enlace simbólico temporal al paquete, todo lo levantado parado y limpiado al acabar).
- [ ] Suite entera verde.

```json:metadata
{"repo":"xonecode","modelTier":"frontier","files":["CLAUDE.md","docs/DECISIONES.md"]}
```
