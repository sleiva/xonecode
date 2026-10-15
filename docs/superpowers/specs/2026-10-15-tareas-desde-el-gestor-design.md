# Tareas en background que viven en el gestor de tareas (Jira, Notion, …)

Fecha: 15-10-2026. Estado: fase 1 (puerta 1) HECHA y medida contra Jira real (MAS-1). Fase 2 pendiente.

## Qué se quiere

Un proyecto **con gestor de tareas vinculado** usa el gestor como fuente de sus tareas en background: lo que se
encarga al agente queda en el gestor, y el gestor refleja cómo va. Un proyecto **sin vínculo** sigue exactamente como
hoy. El modo lo decide el vínculo del proyecto (`config.json#gestorDeTareas`), en el SERVIDOR; nunca el cliente.

Hoy es Jira; tiene que valer para Notion y para el gestor que venga (Linear, GitHub Issues…) sin tocar el corredor ni
la interfaz.

## Las dos puertas

| | Puerta 1 — se crea desde xonecode | Puerta 2 — se crea en el gestor |
|---|---|---|
| Quién la inicia | «Nueva tarea» en la pestaña Tareas | Una persona mueve un ticket a un estado de DISPARO |
| Encargo | Se amplía y se revisa en la ventana, como hoy | REFINAR → xonecode amplía y lo sube como comentario → REVISAR ENCARGO → la persona lo revisa en el gestor → PARA EL AGENTE |
| Cómo llega a la cola | En el acto: se crea el ticket y la tarea ligada | Por SONDEO del proceso que ejecuta las tareas |
| Fase | **1 (ahora)** | 2 |

Las dos acaban igual: una `Tarea` con `ticket`, y el corredor reflejando su estado en el gestor.

## Reglas de diseño (lo que hace que valga para cualquier gestor)

1. **Todo entra por `GestorDeTareasPort`** (`core/gestorDeTareas.ts`). Cada adaptador (`gestorJira.ts`,
   `gestorNotion.ts`, …) es el ÚNICO fichero que conoce los nombres de tool y la forma de las respuestas de su gestor.
2. **Lo que no todos saben hacer es OPCIONAL en el puerto**, en el molde de `buscarProyectos?`: `crear?`. Quien no lo
   implementa no ofrece la puerta 1 y la ventana lo DICE (encola en local, como límite declarado).
3. **Nada propio de un gestor en el puerto.** Ni tipo de incidencia, ni `accountId`, ni `collection://`: el adaptador
   los resuelve dentro. Jira elige el tipo de los metadatos del proyecto (ver «Medido»); Notion crea la página en la
   base del vínculo con la propiedad de título que ya conoce `describirProyecto`.
4. **Los estados son datos del gestor, nunca nombres a fuego.** Fase 1: los destinos los propone
   `transicionPropuesta` (EN CURSO al empezar, PROBAR —o la categoría `terminada`— al cerrar), la misma regla que el
   «Cerrar en Jira» de un chat. Fase 2: una tabla por vínculo con el NOMBRE del estado destino, elegido de la lista que
   da el gestor; la transición se busca en cada ticket al aplicarla (los ids dependen del flujo).
5. **El ticket se COPIA a la tarea al crearla y nunca se recalcula** (`Tarea.ticket = {conector, sitio, clave, url?}`,
   la regla de `TicketDeSesion`): si la persona revincula el proyecto, las escrituras siguen yendo a ESE ticket. Por el
   cable cruzan `clave`, `conector` y `url`; el `sitio` se queda en el host.
6. **Escribe el HARNESS, nunca el agente.** Y en una tarea **crear es la autorización**: la ventana dice ANTES del clic
   todo lo que se va a escribir en el gestor (crear el ticket con la petición y el encargo, EN CURSO al empezar,
   comentario y PROBAR al terminar).

## Fase 1 — la puerta 1

### Crear (servidor)

`{clase:"tarea", accion:"crear"}` deja de ser fire-and-forget **solo cuando el proyecto tiene vínculo**:

1. Se resuelve el vínculo del `config.json` del proyecto y su gestor.
2. `await gestor.crear(vinculo, {titulo, descripcion: peticion})` → `TareaDelGestor` (clave, url).
3. `gestor.comentar(…, encargo con cabecera fija)`. Si falla, la tarea se crea IGUAL y se dice: el ticket ya existe.
4. Se guarda la `Tarea` con `ticket` puesto, y SOLO después `revisarTareas()`: si el corredor arrancara antes, el
   reflejo de «empezar» no encontraría el ticket.
5. Respuesta: `200 {id, ticket:{clave, url?}}`. Si el gestor no deja crear: **`409 {motivo}` y NO se crea la tarea
   local** — con vínculo, una tarea que no está en el gestor es justo lo que se pierde.

Sin vínculo, o con un gestor sin `crear`: el camino de hoy (204).

La cabecera del encargo es una constante de `core/` (`CABECERA_DEL_ENCARGO`), porque la fase 2 la buscará para leer
el último encargo revisado.

### Reflejar el estado (corredor)

Un ÚNICO punto de entrada, no uno por llamador: hay al menos cinco escritores de estado (`escribirSiSigueSiendoNuestra`,
`aparcar`, la reconciliación del arranque, terminar a mano, parar). Se decora el ALMACÉN: un envoltorio sobre
`guardar` compara por id el estado de antes y el de después y entrega cada cambio a una función PURA de `core/`
(`escrituraEnElGestor(antes, despues)`) que dice qué escribir:

| Cambio | Escritura |
|---|---|
| → `en-proceso` | transicionar a la propuesta de «empezar», **si la ficha no está ya en la categoría `en-curso`** (vuelve a pasar tras cada feedback y tras una reanudación) |
| → `requiere-atencion` | nada (fase 1) |
| → `terminada` | comentario de cierre (`comentarioDeCierre`) y LUEGO transición a la propuesta de «cerrar»; si la transición falla, el comentario ya está (la secuencia del `cerrar` de un chat, EXTRAÍDA a una función que usen los dos) |

Fire-and-forget con su propio `try` (el `alCambiar` del corredor corre sin él). Un fallo se apunta en la tarea
(`ticket.aviso`, releyendo y cambiando SOLO ese campo, que no cambia el estado y por tanto no vuelve a disparar) y se
pinta en su fila.

### Cliente

- La ventana «Nueva tarea» sabe si el proyecto tiene gestor (para el proyecto abierto, del estado del gestor; para otro,
  lo decide el servidor y se dice al volver). Con gestor: el botón es **«Crear en Jira»** (el nombre sale del
  catálogo, nunca a fuego), una línea dice lo que se escribirá, y la ventana NO se cierra hasta que el servidor
  conteste; un 409 deja la ventana abierta con el motivo.
- La fila de la tarea (En curso y Finalizadas) lleva la clave del ticket con enlace, y el aviso si un reflejo falló.

### Límites declarados de la fase 1

- Las tareas ENCADENADAS (`atenderCrearEncadenadas`) siguen solo en local; en la fase de subtareas serán hijas de un
  ticket padre.
- Al aparcar no se escribe nada en el gestor.
- DESCARTAR una tarea con ticket la borra en local y deja el ticket como esté (normalmente EN CURSO).
- En un flujo sin PROBAR (el de omisión de Jira: Tareas por hacer → En curso → En revisión → Finalizada, medido en
  KAN), «cerrar» pasa el ticket a su estado de terminada (Finalizada), no a «En revisión». Elegirlo es la tabla de la
  fase 2.
- Los adjuntos no suben al ticket.
- Los destinos son los de `transicionPropuesta`; la tabla configurable llega con el disparo de la fase 2.
- Notion: `crear` se implementa después de medir `notion-create-pages`; hasta entonces, un proyecto con Notion
  encola en local y la ventana lo dice.

## Fase 2 — la puerta 2: el gestor DISPARA

**xonecode no impone estados: se ADAPTA a los del proyecto.** Lo que necesita son PAPELES, y en cada vínculo la persona
dice qué estado SUYO cumple cada uno (el MAPEO, en Conectores → «Gestor de tareas», junto al vínculo: por vínculo y no
por conector, porque cada proyecto del gestor tiene su flujo).

| Papel | Qué hace xonecode | En MAS (Por hacer → En curso → Listo) |
|---|---|---|
| **preparar** (opcional) | Un ticket ASIGNADO a la cuenta del conector entra aquí y no tiene encargo → lo amplía (el aumentador, con el proyecto delante) y lo sube como comentario con `CABECERA_DEL_ENCARGO`. No lo mueve. | Por hacer |
| **lanzar** | Un ticket asignado entra aquí y no tiene tarea → crea la tarea en background con el ÚLTIMO comentario de encargo tal como esté (editado por la persona si lo cambió), más lo comentado debajo; sin encargo, con el texto del ticket. | En curso |
| **terminar** | Al terminar la tarea, comentario de cierre y transición a este estado. | Listo |

Revisar el encargo es moverlo de preparar a lanzar: el gesto que la persona ya hace en su tablero es la orden.

- **El mapeo manda también en la puerta 1**: al empezar, el estado de lanzar; al terminar, el de terminar. Se COPIA al
  ticket de la tarea al crearla (`TicketDeTarea.estados`), la misma regla que el resto del ticket. Sin mapeo, la regla
  de antes (`transicionPropuesta`).
- **Se PROPONE desde las categorías** (`mapeoPropuesto`): preparar = el primero «por hacer», lanzar = el primero «en
  curso», terminar = PROBAR si existe o el primero «terminada». La persona lo confirma o lo cambia; nada se escribe a
  mano.
- **La lista de estados sale del gestor** (`GestorDeTareasPort.estados?`, opcional): en Jira no hay tool de estados en
  el conector, así que sale de los estados de sus tickets y de los destinos de sus transiciones; en Notion, de las
  opciones de su propiedad de estado.
- **Leer el encargo** pide `GestorDeTareasPort.comentarios?` (opcional): sin él, lanzar usa el texto del ticket.
- **El disparo es un INTERRUPTOR por vínculo, apagado por omisión** (`VinculoGuardado.automatico`): quien mueve un
  ticket lanza un agente que escribe en esta máquina. Y solo cuentan los tickets asignados a la cuenta del conector.
- **Sondeo** cada `INTERVALO_DE_SONDEO_MS` (5 min) y con «Mirar ahora», SOLO en el proceso que tiene el cerrojo del
  corredor (dos consolas no crean la misma tarea dos veces). Sin duplicar: un ticket con una tarea que no está
  descartada no lanza otra; uno con encargo no se vuelve a preparar.
- **La decisión es PURA** (`core/tareasEnElGestor.ts#accionesDelSondeo`): tickets, mapeo, qué tiene encargo y qué tiene
  tarea → qué preparar y qué lanzar. La red y el disco, fuera.

Límites declarados de la fase 2: al aparcar sigue sin escribirse nada; un ticket movido a lanzar mientras el proceso
estaba apagado se recoge en el primer sondeo; el aumentador de preparar no ve los adjuntos del ticket.

## Medido (15-10-2026, conector Jira de xonecode, solo lectura)

- `tools/list`: 32 tools. `createJiraIssue` exige `cloudId`, `projectKey`, `issueTypeName`, `summary`; admite
  `description` (markdown), `assignee_account_id`, `parent` y `transition`. **No es el esquema del MCP de Atlassian de
  otra sesión** (allí el campo es `issueType`): se mide el del conector.
- `getJiraProjectIssueTypesMetadata {cloudId, projectIdOrKey}` sobre KAN: cuatro tipos, con `name` TRADUCIDO
  («Tarea», «Historia») y `untranslatedName` («Task», «Story»), `subtask` y `hierarchyLevel`. Regla del adaptador: el
  de `hierarchyLevel 0` y no subtarea, `untranslatedName` «Task» primero; se manda su `name`.
- `atlassianUserInfo` da `account_id` y también el correo: el correo no sale del adaptador.
- **Medido creando de verdad** (MAS-1 en el proyecto MAS, con permiso de la persona, por el `crear` del adaptador):
  `createJiraIssue` contesta `{id, key, self}` (la clave en la raíz, lo que lee `claveCreada`); acepta `issueTypeName`
  con el nombre TRADUCIDO («Tarea»); queda asignado a quien tiene la sesión y en «Por hacer»; el comentario con el
  encargo se sube. El flujo de MAS es Por hacer → En curso → Listo: al terminar, el ticket pasa a Listo. El conector no
  tiene tool de borrar: el ticket de prueba lo borra la persona.
