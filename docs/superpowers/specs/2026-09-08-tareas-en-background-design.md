# Tareas en background

Encargos por proyecto que se ejecutan solos: se crean, se encolan, se van corriendo, y cuando
una se topa con algo que necesita a una persona **se aparca y lo dice**. Un kanban global para
verlas todas y una lista por proyecto.

Estados, los cuatro que se pidieron y ninguno más: **nuevo**, **en proceso**,
**requiere atención**, **terminada**.

---

## 1. El hallazgo que gobierna el diseño

**Una consola de proyecto sin cliente enganchado hoy rechaza toda aprobación en silencio.**
`consolaWeb.eof()` es `!transporte.conectado()`, así que una tarea que corriera por ese camino
sin navegador delante vería rechazada cada escritura y recibiría cadena vacía a cada pregunta
— sin que nada lo contara.

Eso convierte «requiere atención» en el centro del diseño y no en una comodidad de la
interfaz: **es la única forma de que una tarea autónoma no mienta.** Es además la postura que
`xonecode run` ya tiene escrita para el modo de un disparo: «una pausa sin humano no es un
éxito», y sale con código distinto de cero antes que dar por buena una aprobación que nadie
iba a contestar.

De ahí la regla dura de todo el documento:

> Una tarea nunca aprueba nada por su cuenta, nunca contesta una pregunta por su cuenta, y
> nunca se declara terminada porque el tiempo se agotó. Lo que no puede resolver sola, lo
> aparca con el motivo.

## 2. Lo que NO se decide aquí

- **Un demonio que sobreviva al proceso.** Las tareas corren dentro del proceso de la consola.
  Ver §6: la cola sobrevive, el turno en vuelo no, y eso se dice.
- **Que el agente VEA una imagen.** Los adjuntos se montan como ficheros; pasarlos como
  imagen en el contexto del modelo es multimodal de verdad y es otra tanda (§7).
- **Un juez que decida si el trabajo está bien hecho.** «Terminada» significa que el turno
  acabó limpio, no que el resultado sea correcto — igual que hoy la subida autónoma está
  declarada y sin implementar porque el veredicto de un juez no basta solo
  (`core/cloudstudio.ts#PoliticaDeAprobacion`).
- **Tareas que se disparan por tiempo o por evento.** Aquí las crea una persona.

## 3. Los estados, y por qué cuatro bastan

| estado | significa | quién lo pone |
|---|---|---|
| `nuevo` | encolada, esperando turno | el usuario al crearla |
| `en-proceso` | un corredor la tiene, con su pid | el corredor al empezar |
| `requiere-atencion` | se paró y hace falta una persona | el corredor, con el MOTIVO |
| `terminada` | el turno acabó sin nada pendiente | el corredor |

**No hay «fallida», y es a propósito.** Un error del turno, un proyecto que ya no está, una
escritura que nadie aprobó y una pregunta sin contestar acaban todos en el mismo sitio —
`requiere-atencion`— porque la acción que piden es la misma: que alguien mire. Lo que
distingue unos de otros es el `motivo`, que es texto para leer y viaja siempre. Un estado
«fallida» separado obligaría a decidir en el código qué fallos son recuperables, y esa es
justo la decisión que se le devuelve a la persona.

**Tampoco hay «cancelada».** Descartar una tarea la BORRA (con su carpeta de adjuntos); dejar
un estado terminal de basura sería inventarse un archivo que nadie va a mirar. Es la misma
razón por la que «archivar» no está en el menú de una sesión.

Las transiciones válidas son pocas y se comprueban en `core/`: `nuevo → en-proceso`,
`en-proceso → {terminada, requiere-atencion}`, `requiere-atencion → nuevo` (reintentar) y
`requiere-atencion → terminada` (la persona da el trabajo por bueno). Cualquier otra se
rechaza en vez de aplicarse: un estado imposible en disco es más difícil de depurar que un
error al escribirlo.

## 4. Dónde vive cada cosa

```
~/.xonecode/tareas/
  indice.json              ← la COLA: qué hay, de qué proyecto, en qué estado
  corredor.lock            ← quién ejecuta en esta máquina (pid + hora)
  <id>/
    encargo.md             ← la petición original y el encargo augmentado
    adjuntos/…             ← lo que el usuario anexó

<proyecto>/.xonecode/
  sesiones/<sesion>/…      ← el transcript y los artefactos de la tarea, como cualquier sesión
  checkpoint.sqlite        ← su hilo, como cualquier sesión
```

**La cola es de la MÁQUINA, no de un proyecto.** El kanban es global y no puede depender de
tener descargados los dieciocho proyectos del entorno: con la cola dentro de cada uno, listar
las tareas obligaría a abrirlos todos. Es el mismo reparto que ya existe entre `settings.json`
—de la máquina, con los entornos y los ajustes de dispositivos— y el `config.json` de
proyecto.

**Los adjuntos van con la TAREA y no con el proyecto**, y esto cambia lo que se dijo primero
en la conversación. El motivo: una tarea existe antes de que su proyecto tenga sesión, y puede
crearse para un proyecto que todavía no se ha abierto nunca; escribir en su `.xonecode/` para
guardar un adjunto sería tocar una carpeta que el usuario no ha estrenado. Fuera del proyecto
se gana además, gratis, lo que importaba: **no entran en git y no suben a CloudStudio**, sin
depender de ninguna exclusión.

**Lo que la tarea PRODUCE sí se queda en el proyecto**, porque es una sesión normal: su
transcript en `sesiones/<id>.jsonl`, sus artefactos en `sesiones/<id>/artefactos/` y su hilo en
el checkpointer. Eso es lo que hace que atender una tarea sea abrir su conversación y verla.

### La ruta absoluta, y que falle cerrado

Una tarea referencia su proyecto por **raíz absoluta**. Mover o renombrar la carpeta la deja
huérfana, y entonces **no se ejecuta**: pasa a `requiere-atencion` con el motivo. Es la misma
situación que `seAplicaSinAprobacion`, que también se indexa por ruta absoluta y pierde el
ajuste al renombrar — y la misma dirección de fallo, la única posible aquí: antes no ejecutar
que ejecutar contra otra carpeta.

## 5. El corredor, y el cerrojo

`web/servidor/corredorDeTareas.ts`.

**Un solo corredor por máquina, con cerrojo de pid.** Dos consolas abiertas serían dos
ejecutores sobre la misma cola, y con ellos dos turnos del mismo proyecto a la vez — que es
exactamente lo que el cerrojo por proyecto existe para evitar. El segundo proceso **sirve el
dashboard y no ejecuta**, y lo dice en la interfaz: un kanban que se ve igual en dos ventanas
pero solo avanza en una tiene que decir en cuál.

**Al arrancar se RECONCILIA.** Toda tarea `en-proceso` cuyo pid no sea el nuestro pasa a
`requiere-atencion` con el motivo («la consola se cerró a mitad»). Dejarla diciendo «en
proceso» sin nadie ejecutándola sería afirmar lo que no se sabe, que es el pecado que este
repo persigue en todas partes.

### La planificación es pura

`core/tareas.ts#siguientesAEjecutar(tareas, { concurrencia })` decide, y es una función pura
con test: sin ella la política viviría dentro de un lazo con procesos y no se podría probar.

- **FIFO por fecha de creación**, global. Predecible y explicable; una prioridad es un campo
  más que hoy nadie ha pedido.
- **Tope de concurrencia** (`concurrencia`, configurable en Ajustes, por omisión 2).
- **Nunca dos del mismo proyecto.** Comparten disco, índice de git, checkpointer y `sync`:
  dos turnos a la vez sobre eso es una carrera con escrituras de por medio.

### Abrir el proyecto sin mover el cable

**El vestíbulo sirve UN proyecto a la vez** (`proyectoAbierto()` devuelve uno), y el cable se
muda a la consola que se abre. Si el corredor reusara `abrirProyecto`, cada tarea que
arrancara le movería la vista al navegador de quien esté trabajando.

Hace falta una segunda puerta al MISMO constructor: `abrirParaTarea(raiz)`, que devuelve una
`ConsolaDeProyecto` completa —backend con sus barreras, ejecutor, checkpointer, artefactos—
**sin registrarla como la abierta ni tocar el sumidero del cable**. Es el cambio quirúrgico de
esta tanda dentro de un fichero de mil líneas, y el riesgo hay que nombrarlo: si esa apertura
divergiera de la normal, una tarea correría con menos barreras que una sesión de humano. El
test tiene que ser que las dos puertas devuelven un backend con las MISMAS reglas montadas —
que es lo que `backendDeAgente` ya permite comprobar.

### La consola de una tarea

Una `Consola` propia (`consolaDeTarea`) que implementa lo que el lazo necesita **aparcando en
vez de contestando**:

- `aprobar(pendientes)` → **aparca**: la tarea pasa a `requiere-atencion` con las rutas que
  esperaban, y devuelve rechazo para que el turno cierre limpio en vez de quedarse colgado.
- `preguntar(...)` → aparca igual. Una pregunta contestada con cadena vacía es una respuesta
  inventada.
- `escribir(...)` → al transcript de la sesión, como siempre.
- `eof()` → `true`. No hay humano, y decirlo es lo correcto: lo que NO se hace es dejar que de
  ese `true` se deduzca un rechazo silencioso, que es el fallo de hoy.

**Cómo se retoma una aprobación aparcada.** No se guarda el `interrupt` en memoria esperando
—el proceso puede vivir días y morir en medio—: se aprovecha lo que el checkpointer ya hace y
está medido. Al abrir la sesión, `saldarAprobacionesHuerfanas` salda las llamadas colgadas con
una respuesta sintética que dice la verdad —no se aplicó, nadie decidió, el disco no se
tocó—, así el historial es válido y el modelo puede volver a proponer la escritura **con la
persona delante**, que es donde la aprobación significa algo. Atender una tarea es, entonces,
abrir su conversación y seguir hablando.

## 6. Qué sobrevive a cerrar la consola

- **Cerrar el NAVEGADOR no para nada.** El corredor vive en el proceso del servidor; el SSE
  se cae y la tarea sigue. Conviene decirlo en la interfaz, porque es la duda inmediata.
- **Parar el proceso mata el turno en vuelo.** La cola sobrevive, el hilo del checkpointer
  sobrevive (el modelo recuerda), pero el turno a medias no se reanuda solo: al arrancar, esa
  tarea aparece en `requiere-atencion` con el motivo. Reintentarla es un turno nuevo sobre el
  mismo hilo, que es exactamente lo que el checkpointer permite.

## 7. Crear una tarea

### El request se AUGMENTA, y se revisa antes de encolar

Al crear, **una llamada al modelo** convierte la frase del usuario en un encargo completo:
qué hay que conseguir, qué criterios lo dan por bueno, qué NO tocar, y qué adjuntos hay y para
qué sirven. **Se le enseña al usuario para que lo edite antes de encolar.**

El porqué no es cosmético: es lo que hace que `requiere-atencion` sea raro en vez de
constante. Una tarea autónoma que arranca de una frase ambigua se bloquea enseguida; una que
arranca de un encargo revisado, no. Y en una tarea que va a escribir sin nadie delante,
ejecutar algo que nadie ha leído es justo lo que la aprobación existe para evitar.

- Entra por **puerto** (`AumentadorPort`) con su doble, para que `npm test` siga sin red ni
  clave. La implementación real usa el papel `trabajo`: es una tarea de redacción, no una
  clasificación.
- Lo que se le da al aumentador: la petición, el nombre y la rama del proyecto, la lista de
  adjuntos (nombres y tipos, no su contenido) y la memoria del proyecto si existe. Nada más:
  el árbol entero sería contexto por gastar.
- **Si el aumentador falla, la tarea se puede encolar igual con el texto original**, y se
  dice. Que no haya modelo disponible no puede impedir apuntar un encargo.

### Los adjuntos

- Suben por una **ruta HTTP** (`POST /adjunto?tarea=<id>`), no por el cable: el SSE lleva
  JSON y esto son bytes. Con las mismas comprobaciones de `Host`, `Origin` y token que todo
  lo demás, y con tope por fichero y por tarea.
- El agente los ve montados en **`/adjuntos/`, de SOLO lectura** — la misma pieza que
  `/skills/` y `/artefactos/`, y de solo lectura por lo mismo que las skills: son material de
  entrada, no ficheros que reescribir.
- **Limitación declarada**: el agente puede LEER una imagen como fichero, pero no la VE. Que
  la mire de verdad es multimodal y va aparte. La UX lo dice mientras no esté, en vez de
  dejar creer que un mockup se va a interpretar.

## 8. El cable

Servidor → cliente:

- `{clase:"tareas", lista, concurrencia, corriendoAqui}` — la cola entera. Va a TODOS los
  clientes, como la foto de la máquina: la cola es de la máquina. `corriendoAqui` es falso en
  el segundo proceso, y es lo que deja decir que este kanban no avanza.
- `{clase:"tarea", ...}` — una sola, cuando cambia de estado. Sin reenviar la lista entera en
  cada transición.

Cliente → servidor:

- `{clase:"tarea", accion:"crear", proyecto, peticion, encargo}`
- `{clase:"tarea", accion:"augmentar", proyecto, peticion}` → contesta con el encargo
  propuesto (una llamada al modelo, bajo demanda)
- `{clase:"tarea", accion:"reintentar"|"descartar"|"terminar", id}`
- `{clase:"tareas", concurrencia}` — cambiar el tope

**Por el cable no viaja ninguna ruta de la máquina.** Ni la raíz del proyecto ni la del
adjunto: viajan el id del proyecto, su nombre y el nombre del fichero. Es la regla de
`sinRutas` y la de los comandos de la receta de instalación.

## 9. Las dos vistas

- **Kanban global**, cuatro columnas —una por estado—, en el **escritorio**: es de la
  aplicación, no de una sesión, igual que «Tu equipo». Cada tarjeta: proyecto, título, tiempo,
  y en `requiere-atencion` el MOTIVO a la vista, que es lo único accionable de esa columna.
  Pulsar una tarea abre su sesión, que es cómo se atiende.
- **Lista por proyecto**, como una pestaña más del proyecto junto a Artefactos, y con la misma
  regla: **solo existe si ese proyecto tiene tareas**. Una pestaña vacía es el control sin
  dato de siempre.
- **El tope de concurrencia se configura en Ajustes**, donde ya viven los ajustes de máquina.

Y una ausencia deliberada: **no hay barra de progreso de una tarea**. Un turno no sabe cuánto
le queda, y una barra que avanza sola es la mentira con forma de dato que este repo evita en
todas partes. Lo que se enseña es desde cuándo corre y su último paso, que es lo que se sabe.

## 10. Qué se prueba, y dónde

- **`core/tareas.ts`** — puro y con la mayor parte de los tests: la planificación (FIFO, tope,
  nunca dos del mismo proyecto), las transiciones válidas, y que un motivo viaja siempre con
  `requiere-atencion`.
- **La reconciliación al arrancar** — una tarea `en-proceso` con pid ajeno acaba aparcada.
- **El cerrojo** — el segundo corredor no ejecuta y lo dice.
- **La consola de tarea** — que una aprobación APARCA y no se traga en silencio, y que una
  pregunta hace lo mismo. Es el test que protege el hallazgo de §1.
- **Las dos puertas de apertura** — que `abrirParaTarea` monta las MISMAS barreras que la
  apertura normal, y que no mueve el proyecto abierto del cable.
- **El cable** — que la lista va a todos, que las rutas de la máquina no viajan, y que un
  adjunto se rechaza por nombre igual que un artefacto.
- **La UX** — que la tarjeta de `requiere-atencion` enseña el motivo, que la pestaña de
  proyecto no aparece sin tareas, y que el kanban dice cuándo no está ejecutando aquí.

## 11. Orden de implementación

1. `core/tareas.ts`: estados, transiciones y planificación. Puro, con sus tests.
2. `agent/tareasEnDisco.ts`: el índice, el cerrojo y la carpeta de la tarea.
3. `abrirParaTarea` en el vestíbulo + `consolaDeTarea`. **Aquí está el riesgo del trabajo**:
   es donde una tarea podría acabar corriendo con menos barreras que una persona.
4. El corredor: reconciliación, lazo, y las transiciones contra el índice.
5. El cable y el kanban; después la lista por proyecto.
6. La augmentación y los adjuntos, que son lo que hace la UX de crear.

Los pasos 1-4 valen por sí solos: con ellos una tarea se puede crear por el cable y correr,
aunque la UX de crear sea un campo de texto.
