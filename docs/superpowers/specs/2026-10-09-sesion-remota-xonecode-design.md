# Sesión remota: el lado de xonecode

**Fecha:** 09-10-2026 · **Alcance:** consola web (servidor `src/web/` + cliente `apps/web/`) · **Estado:** diseño
aprobado, pendiente de plan

El sistema entero —protocolo del sobre, cifrado, servidor puente, web móvil— está en el spec de `xonecode-server`:
`/Users/projects/xonecode-server/docs/specs/2026-10-09-sesion-remota-design.md`. Aquí solo lo que cambia en xonecode,
que es poco a propósito: **un cliente más del cable**, que en vez de ser una pestaña del navegador es un WebSocket
saliente cifrado hacia el puente.

## Cómo está hoy (lo que el diseño reutiliza)

- El cable trata a cada navegador como un **sumidero** (`Transporte`, `web/servidor/transporte.ts`) y admite varios a
  la vez; la ráfaga de bienvenida va solo al recién llegado (`conectar` devuelve los actos a reemitir).
- El vestíbulo **muda los sumideros** a la consola en foco (`Transporte.soltar`): seguir el foco sale gratis.
- Todas las intenciones del navegador entran por **un despachador**, `POST /accion` (`RUTA_ACCION`, `arranque.ts`).
- La aprobación en vuelo se reemite al volver (`mensajesDeAprobacion()`) y se resuelve una sola vez.
- El servidor ya contempla un **anfitrión extra** para un túnel (`servidor.ts`), con la misma defensa de `Host`/`Origin`.

## Diseño

### 1. El puerto y el adaptador

- `PuenteRemotoPort` en `core/ports.ts` (conectar a una URL de servidor, enviar, al recibir, al cerrar) con su doble
  en memoria: `npm test` sigue sin red.
- La implementación real usa el `WebSocket` global de Node 22 (sin dependencia nueva) y el cifrado de
  `@xone/xonecode-remoto`, cargado con `import()` dinámico en UN fichero adaptador fuera de `core/` (sección 5).

### 2. El puente como sumidero

- Al encenderse, se registra en el `Transporte` de la consola en foco, como una pestaña. Al mudarse el foco, reenvía a
  los móviles el estado de la nueva consola.
- **Lista blanca de salida**, antes de cifrar: `acto`, `sustitucion`, `reemision`, `aprobacion` (con diffs: el
  contenido va cifrado de punta a punta), `pregunta` (de texto), `turno` y `remoto.estado` (nuevo: proyecto, título de
  la sesión en foco o «sin sesión»; lo compone el puente, **no** reenvía el `alta`, que lleva entornos, rutas y el
  workspace). Todo lo demás se descarta: modelos, agentes, skills, dispositivos, conectores, árbol, ficheros, Ajustes,
  `secreto`, y el propio `remoto`.
- **Lista blanca de entrada**, tras descifrar y validar la forma: `prosa` (sin adjuntos), `decision`, `respuesta` (sin
  `seleccion`), `cancelar`. Entran por **el mismo despachador que `POST /accion`**: una aprobación desde el móvil
  recorre el camino fail-closed de siempre. Cualquier otra clase se rechaza y se anota en el registro de fallos. El
  móvil no puede cambiar de sesión, de proyecto, de modelo ni de entorno.
- Las preguntas del **agente** son un `acto` `consulta` y se contestan con `prosa`; las de la **consola** son `pregunta`
  y se contestan con `respuesta`; una aprobación, con `decision` (como hace hoy `App.tsx`).
- **Un móvil nuevo** (la `presencia` trae un `id` que no estaba) recibe solo él la `reemision`, la aprobación en vuelo,
  el `turno` y `remoto.estado`.

### 3. El botón y el ciclo de vida

- Mensaje nuevo del cable `{clase:"remoto", accion:"encender"|"revocar"|"apagar"}` y respuesta
  `{clase:"remoto", estado, url?, moviles?, motivo?}`. La URL con el secreto es **el segundo secreto del cable** (tras
  `leerSecreto`): solo por el cable local, nunca por el puente.
- Diálogo en la consola: QR (librería empaquetada, sin CDN), copiar URL, «N aparatos conectados», «Revocar enlace»,
  «Apagar». Estados: activa, reconectando, error con motivo.
- Se apaga con «Apagar», en `vestibulo.cerrar()` (dentro del cierre ordenado) o al parar el proceso. Reintento con
  espera creciente reabriendo la MISMA sala y secreto.

### 4. Pruebas

- El puerto con su doble; las dos listas blancas; la reemisión a un móvil nuevo; seguir el foco; el apagado dentro de
  `vestibulo.cerrar()`.
- **Que la entrada pase por el despachador REAL de `arranque.ts`**, no por un doble: es el patrón de fallo de
  `CLAUDE.md` (una composición de producción en un cierre que los tests doblan).
- De punta a punta, junto con `xonecode-server`: aprobar en el móvil escribe; rechazar no.

### 5. Detrás de un interruptor, para seguir publicando releases

- `settings.json`: `"remoto": { "habilitado": true, "servidor": "wss://…" }`. Ausente o `false` = la función no existe:
  no se pinta el botón, no se abre ningún socket. `XONECODE_REMOTO=1` lo enciende para un arranque. Sin interfaz en
  Ajustes hasta que esté estable.
- **Sin dependencia nueva en `package.json`** mientras sea experimental: `import()` dinámico solo con el interruptor
  encendido; los tipos del puerto, declarados en xonecode. Sin el paquete instalado: «la sesión remota no está
  disponible en esta instalación», y lo demás igual. Para desarrollar: `npm link` desde `xonecode-server`.
- **Un test de frontera**: con el interruptor apagado no se importa el paquete ni se abre ningún socket.

## Límites declarados

Los del spec del sistema (quien tiene la URL controla; metadatos visibles al servidor; el QR en pantalla; sin push,
adjuntos, subida con casillas, cambio de sesión ni tareas de fondo desde el móvil), más: la entrada del móvil cuenta como
una pestaña más para la regla de «gana la primera respuesta».
