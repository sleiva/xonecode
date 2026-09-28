# Panel del proyecto y gestor de tareas (IXCODE-11)

**Estado:** diseño aprobado en conversación el 28-09-2026. Prerrequisito de IXCODE-10 (las
tools de los conectores MCP en el agente).

## Qué se construye

Hoy pulsar un proyecto en la barra crea una sesión nueva. Pasa a abrir el **panel del
proyecto**, con pestañas. Desde el panel se vincula un **gestor de tareas** (Jira, por su
conector MCP), se ven y buscan las tareas **pendientes**, se abre una **sesión nueva con una
tarea**, y al terminar se **cierra en Jira** con un comentario de lo hecho y un cambio de
estado. Jira pasa a ser, además de la fuente de trabajo, la memoria de cómo se hizo cada
tarea.

## Decisiones (suyas, 28-09-2026)

1. Pulsar un proyecto abre su panel; pulsar una sesión sigue llevando a su chat; el «+» de la
   barra sigue siendo «sesión nueva» directa.
2. El panel va **con pestañas** desde el principio: después se añadirán más.
3. Vincular un proyecto de Jira sirve para **buscar las tareas pendientes** y empezar una
   sesión sobre una («Nueva sesión con esta tarea»).
4. **En Jira escribe el HARNESS, con tarjeta de aprobación, nunca el agente.** Dos escrituras:
   pasar a EN CURSO al empezar, y comentario + transición al cerrar.
5. El ticket se deja en el campo de texto: **lo envía la persona**, no se manda solo.

## Enfoque: el servidor habla con Jira por el conector MCP

Se usa el conector `jira` que ya se da de alta y autoriza en Ajustes → Conectores, con su
credencial OAuth. No hay credenciales nuevas, y lo que ve el panel es lo que verá el agente.
Descartados: la API REST de Jira con token propio (duplica credenciales) y preguntarle al
agente desde el panel (una llamada al modelo por cada vista, y la escritura saldría de él).

**Medido (28-09-2026) contra `https://mcp.atlassian.com/v1/mcp`:** 32 tools, TODAS con
`readOnlyHint`: 21 de lectura y 11 de escritura. Las que usa esto:
`getAccessibleAtlassianResources`, `getVisibleJiraProjects`, `searchJiraIssuesUsingJql`,
`getJiraIssue`, `getTransitionsForJiraIssue` (lectura) y `transitionJiraIssue`,
`addCommentToJiraIssue` (escritura).

## Unidades

### 1. El puerto del gestor de tareas (`core/gestorDeTareas.ts`, puro)

```ts
interface TareaDelGestor { clave: string; titulo: string; estado: string; categoria: "por-hacer" | "en-curso" | "terminada"; asignado?: string; url?: string }
interface FichaDelGestor extends TareaDelGestor { descripcion: string }
interface TransicionDelGestor { id: string; nombre: string; destino: string }
interface GestorDeTareasPort {
  sitios(): Promise<{ id: string; nombre: string }[]>;
  proyectos(sitio: string): Promise<{ clave: string; nombre: string }[]>;
  pendientes(v: Vinculo, texto?: string): Promise<TareaDelGestor[]>;   // categoría ≠ terminada
  ficha(v: Vinculo, clave: string): Promise<FichaDelGestor>;
  transiciones(v: Vinculo, clave: string): Promise<TransicionDelGestor[]>;
  transicionar(v: Vinculo, clave: string, transicion: string): Promise<void>;
  comentar(v: Vinculo, clave: string, texto: string): Promise<void>;
}
interface Vinculo { conector: string; sitio: string; proyecto: string }
```

Con un doble en `core/ports.ts` (marca `ES_DOBLE`). También puro en `core/`:
- la JQL de pendientes (`project = "<clave>" AND statusCategory != Done ORDER BY updated DESC`),
  con la clave validada por forma (`^[A-Z][A-Z0-9_]+$`) y el texto de búsqueda escapado, porque
  entra en una JQL;
- `transicionPropuesta(transiciones, hacia)`: la que lleva a EN CURSO al empezar, y a PROBAR
  (o la siguiente) al cerrar;
- `comentarioDeCierre(datos)`: el texto del comentario a partir de lo que el harness sabe.

### 2. Llamar a una tool de un conector (`agent/conectores/`)

`RedDeConectores` gana `llamarTool(url, credencial, nombre, args, senal)` junto a
`listarTools`, con los mismos dos transportes y el mismo tope. `ServicioDeConectores` gana
`llamar(id, nombre, args)`, que resuelve la credencial igual que `probar`.

**Antes, el arreglo A del refresh OAuth** (diagnosticado en la memoria
`puerto-del-callback-oauth-mcp`): si `autorizar` o una llamada falla con credencial muerta
(`InvalidGrantError`/`InvalidClientError`/`UnauthorizedClientError`, por clase), se llama a
`proveedor.invalidateCredentials("tokens")` y se reintenta UNA vez, lo que abre el navegador.
Hoy ese caso deja «no responde» para siempre.

### 3. El adaptador Jira (`agent/conectores/gestorJira.ts`)

Implementa `GestorDeTareasPort` sobre `servicio.llamar("jira", …)`. Es el ÚNICO fichero que
conoce nombres de tools y la forma de sus respuestas. Una respuesta que no se entiende es un
error con motivo, no una lista vacía. `cloudId` es el `sitio` del vínculo.

### 4. El vínculo en el proyecto (`core/config.ts`, `agent/config/configEnDisco.ts`)

Dos claves nuevas en `ConfigDeFichero` (hoy `validar` descarta lo que no conoce):
- `conectores: string[]` — los ids que el proyecto usa.
- `gestorDeTareas: { conector: string; sitio: string; proyecto: string }`.

Escritor `guardarGestorDeProyecto` / `guardarConectoresDeProyecto`, con el molde de los
`guardar…DeProyecto` que ya hay (leer, mezclar, escritura atómica). **Se guarda solo lo que
contestó**: vincular pide a Jira ese proyecto antes de escribir.

### 5. La sesión ligada a un ticket (`web/servidor/sesiones.ts`)

`EntradaIndice.ticket?: { conector: string; sitio: string; clave: string }`. Se estampa al
abrir la sesión con una tarea y viaja por el cable como `ticket: "IXCODE-12"` en la lista de
sesiones del `alta`. De ahí salen el rótulo «IXCODE-12 · título» y el botón «Cerrar en Jira».

### 6. El cable (`web/servidor/arranque.ts`, `transporte.ts`, `apps/web/src/tipos.ts`)

Mensajes nuevos, INTENCIONES del cliente, y el servidor decide:
- `gestor` con `accion`: `sitios`, `proyectos`, `vincular`, `pendientes` (con `texto?`),
  `transiciones`, `empezar` (clave + transición elegida o ninguna), `cerrar` (clave +
  comentario + transición o ninguna), `conectores` (la lista del proyecto).
- Respuesta `gestor` con el resultado o `error` con motivo. Ni tokens ni URL de autorización
  cruzan el cable; la `url` pública de un ticket sí, porque es un enlace para abrir en Jira.

`empezar` abre la sesión nueva, estampa `ticket` y devuelve el **borrador** del primer
mensaje (clave, título, descripción, criterios), que el cliente pone en el compositor sin
enviarlo. Si la persona eligió transición, se aplica ANTES de abrir y, si falla, se dice y la
sesión se abre igual.

### 7. El cliente (`apps/web/src/`)

- `App.tsx`: un tercer estado del centro, **panel**. Pulsar un proyecto en la barra → abre el
  proyecto (el mismo `{clase:"sesion", proyecto}` de hoy, que ya no construye el agente hasta
  el primer mensaje) y enseña el panel en vez del chat. «Nueva sesión» y pulsar una sesión
  pasan al chat.
- `componentes/PanelDelProyecto.tsx` con pestañas:
  - **Resumen**: cabecera (proyecto, entorno, rama, estado de sincronización), sesiones con
    «Nueva sesión» (las ligadas, con su clave), planes con su barra de progreso, tareas en
    background (el `TareasDelProyecto` de hoy).
  - **Tareas**: pendientes del gestor vinculado, con búsqueda y «Nueva sesión con esta
    tarea». Sin vínculo lo DICE y lleva a la pestaña Conectores; nunca una lista vacía que
    parezca «no hay pendientes». Una FOTO con hora y «Reintentar»; sin sondeo.
  - **Conectores**: los conectores conectados en la máquina con «usar en este proyecto»; en
    los que saben ser gestor (hoy `jira`), sitio y proyecto con desplegables y «Vincular».
    Uno no conectado se cuenta con el camino a Ajustes.
- Tarjetas de aprobación, con la puerta de `Pregunta`/`Aprobacion` (diálogo; solo el botón
  que escribe autoriza; Escape y el velo cancelan):
  - **Empezar**: «¿Pasar IXCODE-12 a EN CURSO?» con el desplegable de transiciones y «Seguir
    sin tocar Jira».
  - **Cerrar**: comentario EDITABLE, desplegable de transiciones, y «Comentar y pasar a …» /
    «Solo comentar» / «Cancelar». Si Jira rechaza, el motivo se enseña y el texto se queda.

### 8. El comentario de cierre, con lo que el harness ya sabe

Sin llamada al modelo: ficheros y commits de la sesión (`sesionGit.ts`, la atribución por
commit), el último veredicto del verificador (sin correr NO es verde), el estado del plan si la
sesión trabajó con uno (`progresoDeTarea`), y la última respuesta del agente, recortada.

## Fallos

- Conector no conectado o credencial muerta → la pestaña lo dice con el camino (Ajustes o
  «Conectar»); el resto del panel funciona.
- Jira lento → tope como el de `probar` (`TOPE_DE_CONEXION_MS`); «no respondió», con hora.
- Una escritura rechazada no pierde el comentario.

## Pruebas

- `core/`: JQL (escape y clave inválida), transición propuesta, comentario de cierre.
- El adaptador Jira contra un servidor MCP en proceso con las tools por su nombre y forma
  reales. El arreglo A del OAuth con el SDK real, sin red.
- Servidor: los mensajes `gestor` contra el doble del puerto, incluido que el escritor de
  config SOLO escribe tras contestar Jira, y que `empezar` estampa `ticket`.
- Cliente: el panel en lugar del chat al pulsar un proyecto; las tres pestañas; las dos
  tarjetas (solo el botón que escribe autoriza); el borrador en el compositor sin enviarse.
- `npm test` sin red ni clave. La pasada real contra su Jira (proyecto IXCODE), juntos, al
  final.

## Dos pasos de implementación

1. Panel con pestañas, vínculo, pendientes con búsqueda y «Nueva sesión con esta tarea»
   (sin escribir en Jira). Incluye el arreglo A del OAuth y `llamarTool`.
2. Escribir en Jira: EN CURSO al empezar y «Cerrar en Jira».

## Fuera de esta versión

Las tools de Jira en el agente (IXCODE-10), otros gestores, crear tickets desde xonecode, y
las pestañas que se añadan después.
