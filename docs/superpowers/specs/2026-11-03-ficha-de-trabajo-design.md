# La ficha de trabajo

Estado: **F1 construida** (03-11-2026, sin medir con modelo); F2–F5 propuestas. Recomendaciones §1 y §5 de `docs/RECOMENDACIONES-HARNESS-TRUEFORGE.md`,
con la forma de los objetivos de Codex (`codex-rs/ext/goal`) y de su `update_plan` (`core/src/tools/handlers/plan_spec.rs`).
Dentro de TrueForge; nada de un motor nuevo.

## 1. Para qué

Medido en las pasadas de la calculadora:

- **Los documentos del plan se releen enteros**: `PLAN.md`, `TASKS.md` y `DISENO.md` suman 50–80 mil caracteres leídos por
  pasada, cuando a cada agente le hace falta su tarea y sus criterios.
- **Nadie sabe con qué se da algo por hecho**: el juez recibe cuatro hechos (`core/juezDelTurno.ts#HechosDelTurno`:
  verificador, ficheros, escrituras sin resolver, especialista cortado). No sabe qué casos pasaron en el aparato, ni si la
  captura que vio el crítico es de la versión que se entrega.
- **El contexto del developer crece con su propio razonamiento** (de 26 a 201 mil en un encargo) y la única forma barata
  de quitarlo es empezar cada vuelta desde un resumen corto: hace falta ese resumen.
- **Una compactación puede perder una restricción** (soporte de APPSalud): el objetivo tiene que vivir fuera del resumen.

Codex lo resuelve con estado del harness, no con documentos: el objetivo se guarda fuera de la conversación y se vuelve a
poner delante en cada turno con el gasto y una **auditoría de cierre** (cada requisito con la evidencia actual que lo
prueba); los pasos son una lista corta con un estado cada uno. La ficha es eso, en xonecode.

## 2. Qué guarda

Tipos puros en `core/fichaDeTrabajo.ts`; nada de langchain ni de disco.

```ts
interface FichaDeTrabajo {
  version: 1;
  objetivo: Dato;                       // la petición de la persona, LITERAL
  aclaraciones: Dato[];                 // lo que la persona añade después en el mismo trabajo
  plan?: { tasks: string; tarea?: string };   // referencia: TASKS.md sigue siendo la autoridad
  criterios: Criterio[];
  evidencias: Evidencia[];
}
interface Dato { texto: string; procedencia: "persona" | "plan" | "agente" | "harness"; cuando: string }
interface Criterio extends Dato { id: string; tarea?: string }
type TipoDeEvidencia = "escritura" | "validacion" | "verificador" | "casos" | "captura" | "medida";
interface Evidencia {
  id: string; tipo: TipoDeEvidencia; cuando: string; quien: string;   // el agente que la produjo
  resumen: string;                      // «8/10 casos», «verde», «/artefactos/captura-….png en CalculadoraDemo»
  version: Record<string, string>;      // ruta → huella de los ficheros del trabajo en ese momento
  pantalla?: string; dispositivo?: string;
}
```

**Reglas puras**, con sus tests:

- **Procedencia, siempre.** Lo que propone un agente no se convierte en requisito: queda como `procedencia: "agente"` y así
  se enseña. La persona y el plan son la fuente de los criterios.
- **Vigencia derivada, no guardada.** Una evidencia vale si las huellas de los ficheros que registró siguen siendo las de
  ahora; editar uno de ellos la deja **caducada**. Primera versión conservadora: se registran todos los ficheros que el
  trabajo ha escrito.
- **Tres estados por criterio, nunca dos**: con evidencia vigente, con evidencia caducada, sin evidencia. «No ejecutado»
  no es «correcto».

## 3. Quién la escribe

Solo el código, a partir de lo que ya pasa por el harness. Ningún modelo escribe la ficha directamente.

| Dato | De dónde |
|---|---|
| objetivo, aclaraciones | la petición del turno y los mensajes de la persona (`turnoReal.ts`, notas de IXCODE-4) |
| plan, criterios | `TASKS.md` del plan abierto (`core/tareasDelPlan.ts` ya los lee), con `procedencia: "plan"` |
| escritura | cada `write_file`/`edit_file` aplicado, con la huella del fichero |
| validación, verificador | `validar_fichero_xone` y el verificador del turno |
| casos | las líneas `{"comando":"caso",…}` de `xone-hotswap` con `---` (0.69.0): pasos, lo que cambió |
| captura, medida | `xone-captura-android` / `shot` (ruta del artefacto, `screen` para la colección) y `comparar_capturas` |

## 4. Quién la lee

- **El orquestador**: una vista breve detrás de la petición del turno, como los planes abiertos
  (`core/planesAbiertos.ts`), y otra vez tras compactar (`resumenSeguro.ts`). Al principio del turno y no en cada llamada:
  cambiarla en cada llamada rompería la caché (lo medido con la vista del encargo).
- **Cada hijo, en su encargo**: el código añade su porción (objetivo, criterios de SU tarea, evidencias vigentes, lo
  pendiente) a la nota que ya acompaña a cada `create_sub_agent`. Los documentos del plan quedan para consultar un detalle,
  no para releerlos enteros.
- **El juez**: `HechosDelTurno` gana la **auditoría de cierre** —cada criterio con su estado y su evidencia— y la ruta de
  la última captura vigente. Lo determinista lo sigue decidiendo `core/entrega.ts`; el juez se ocupa de lo ambiguo.
- **El corte grande del developer**: al empezar una vuelta, lo anterior se sustituye en la vista por la porción de la
  ficha (`vistaDelEncargo.ts`, que ya funciona sin errores).
- **La persona**: el cierre del turno dice qué criterio quedó probado, cuál caducó y cuál no se probó.

## 4 bis. El estado de cada tarea y del plan

Hoy lo deciden los agentes: `marcar_criterios_del_plan` cambia `- [ ]` a `- [x]` cuando un agente dice que comprobó algo,
sin pedirle prueba; la línea `**Estado:**` la edita el developer con `edit_file` (en una tarea de fondo, el juez al cerrar,
`corredorDeTareas.ts#actualizarElPlan`); y una casilla marcada no se desmarca aunque se edite después.

Con la ficha, `TASKS.md` sigue siendo el plan que ve la persona y el que se guarda, pero lo que entra en él lo controla
el código:

1. **Marcar un criterio exige una evidencia VIGENTE.** `marcar_criterios_del_plan` comprueba la ficha: sin casos ni
   captura posteriores a la última edición, devuelve «prueba en el aparato antes de marcar» (devuelto, no lanzado). Con
   ella, marca y la ficha guarda qué evidencia lo respalda.
2. **El estado de la tarea lo calcula el código**: `pendiente` (nada marcado), `en curso` (algo marcado), `implementada`
   (todo marcado, pero alguna evidencia caducada o el verificador no está en verde), `hecha` (todo marcado con evidencia
   vigente y verificador en verde). Se escribe en `TASKS.md` al cerrar el turno, también en la consola, no solo en las
   tareas de fondo.
3. **Una evidencia caducada se ve**: la casilla sigue marcada en `TASKS.md`, pero la ficha la da por caducada, el juez y
   el cierre lo dicen («comprobado antes del último cambio») y la tarea baja a `implementada`.
4. **El progreso del plan** se sigue calculando al empezar cada turno (`planesAbiertos.ts`), con el estado de las
   evidencias al lado.

Así «hecha» significa siempre lo mismo: probada en el aparato sobre la versión que se entrega.

## 5. Dónde vive

`.xonecode/sesiones/<id>/ficha.json`, versionada y con lectura estricta (como la foto de TrueForge: la que no se entiende
se aparta y se empieza otra). Sin sesión (`run`), junto a los artefactos del turno. Un trabajo nuevo empieza cuando la
persona pide otra cosa; un «continúa» sigue con la misma.

## 6. Por fases, cada una medida antes de la siguiente

| Fase | Entrega | Cómo se comprueba |
|---|---|---|
| F1 | Núcleo: tipos, vigencia, persistencia; objetivo y evidencias (escrituras, verificador, casos, capturas, medida); marcar exige evidencia vigente; el estado de la tarea lo calcula el código al cerrar | Tests puros; editar un fichero caduca la evidencia; marcar sin evidencia se rechaza; reabrir conserva; la traza y el cierre de `run` la enseñan |
| F2 | El juez con la auditoría de cierre y la captura vigente | Una captura anterior a una edición no cuenta; la pantalla equivocada no satisface el criterio |
| F3 | La porción de la ficha en cada encargo; criterios del plan | Lecturas de `PLAN.md`/`TASKS.md`/`DISENO.md` por pasada, frente a 50–80 mil caracteres |
| F4 | El corte grande del developer sobre la ficha | Contexto medio y gasto del developer, relecturas, resultado; con un interruptor |
| F5 | Pasos cortos con estado para el orquestador (como `update_plan`) y la vista tras compactar | Compactar y reabrir sin perder el objetivo |

## 7. Límites declarados

- La vigencia por huellas de TODOS los ficheros del trabajo caduca de más (editar el CSS caduca un caso de lógica). Se
  afina por dependencias solo cuando el índice de navegación lo permita con garantías.
- Una evidencia del aparato prueba la versión que se cargó: si se edita sin recargar, la huella del disco cambia y la
  evidencia caduca, que es lo correcto.
- Los motores externos (Claude Code, Codex) no pasan por estas tools: sus evidencias son las que el harness ve al
  terminar (escrituras y verificador).
- `npm test` sigue sin red, sin clave y sin aparato: los casos y capturas se prueban con salidas reales guardadas.

## 8. F2 — La auditoría de cierre (diseño, 03-11-2026)

### El caso que la motiva

F1 comprueba que HAY una prueba de la versión actual; no que la prueba DIGA lo que el criterio pide. Medido:

- **Pasada 2 (0.73.2): una sola captura respaldó 21 casillas de tres tareas** (T06, T07 y T08, evidencia `e29`), y la
  captura ni siquiera guardaba su ruta. El código no puede saber si esa imagen enseña las 21.
- **Pasada 3 (0.73.5): F1 hizo lo correcto, y por poco.** La casilla 1 de la T2 («el visor no arranca con valores de
  ejemplo») se marcó a las 13:02 con una captura buena; el valor fijo `«4,850.50 ÷ 2.5»` entró en la ronda visual 2
  (13:23), así que al cerrar esa marca estaba CADUCADA y la T2 quedó «en curso». Si el developer hubiera vuelto a marcar
  tras la ronda 2 —con una captura nueva, vigente, que enseña el valor fijo—, F1 la habría aceptado.

Decir si una prueba enseña lo que pide un criterio es un juicio, justo lo que F1 dejó fuera a propósito («lo determinista
lo decide el código; el juez, lo ambiguo»).

### Lo que ya hay, y lo que falta

- **F1 decide lo determinista**: sin prueba vigente no se marca, y al cerrar el estado de cada tarea sale de la ficha.
- **El juez del TURNO** (`core/juezDelTurno.ts`, consola y `run`) recibe dos hechos: verificador y escrituras sin resolver.
- **El juez de una TAREA** (`agent/tareas/juezDeTarea.ts`) recibe más (comprobaciones visuales en texto, el plan con sus
  casillas) y DICTA el estado de cada tarea del plan, que `corredorDeTareas.ts#actualizarElPlan` escribe en `TASKS.md`.
  Choca con F1, que también lo escribe: dos autores del mismo dato.
- **Ninguno ve una imagen**, y la captura no guarda de qué pantalla es.

### La pieza nueva: un auditor de criterios, aparte de los jueces

`auditarCriterios` (regla pura del caso en `core/`, llamada con modelo en `agent/`), papel `afilado`, UNA llamada por
cierre y solo si hay algo que auditar. Lo que recibe:

- **Solo los criterios MARCADOS con prueba VIGENTE** (los demás ya los decidió el código: sin prueba no hay nada que
  juzgar). Cada uno con su texto, la ficha de su tarea (recortada) y la evidencia que lo respalda: los casos en texto
  (`casosDeLaSalida`, pasos y lo que cambió) o la CAPTURA como imagen.
- **Como mucho `TOPE_DE_IMAGENES_DE_AUDITORIA` capturas** (dos): las vigentes citadas por las marcas, la más reciente
  primero. Lo que no cabe se dice («sin imagen: no se audita»), no se calla.

Lo que contesta, por criterio: `si` (la prueba lo enseña), `no` (la prueba enseña lo contrario, con lo que se ve) o
`no-se-ve` (la prueba no basta para decirlo). Lo que no se entiende es `no-se-ve`, nunca `si`.

### Lo que hace el código con eso (el juez solo puede BAJAR)

- `si`: nada cambia.
- `no`: la casilla **no se desmarca** (`TASKS.md` nunca pierde una marca), pero el criterio pasa a **refutado** en la
  ficha, la tarea baja a `implementada` y el cierre lo dice bajo `## CRITICAL`: «T2 · 1 marcado y la captura enseña lo
  contrario: el visor arranca con «4,850.50 ÷ 2.5»».
- `no-se-ve`: la tarea no puede pasar de `implementada`, y va en `## Observaciones`.
- **Un estado JUZGADO nunca sube por encima del CALCULADO.** También para el juez de una tarea: su `plan` se acota con
  el de la ficha (`min(calculado, juzgado)`), y la ficha es el único que escribe `TASKS.md`. Se acaba el doble autor.

### Los dos jueces, con la auditoría delante

- `HechosDelTurno` gana `auditoria` (líneas cortas: «T2: 5/6 con prueba vigente; 1 refutado: …») y la captura vigente
  (ruta y pantalla). El prompt: un criterio marcado sin prueba vigente o refutado no cuenta como hecho.
- `CasoDeJuez` (tareas) recibe lo mismo; `parrafoDelPlanDeLaTarea` deja de pedirle que invente el estado y le pide solo
  bajarlo si ve un motivo que la auditoría no recoge.

### La pantalla de la captura

`xone-captura-android` (y `shot`) apuntan la colección en primer plano (`screen` del canal, que ya existe) junto a la
captura (`<captura>.pantalla` en `/hotswap/`, el mismo reparto que la geometría), y la ficha la guarda en
`Evidencia.pantalla`. El auditor la recibe con la imagen. **No se convierte en regla de código** («la pantalla equivocada
no cuenta») porque una tarea no dice en un campo qué colección prueba: se le da al auditor, que sí lo puede leer en la ficha.

### Cómo se mide ANTES de construirlo todo

Con una captura REAL que enseñe el visor con el valor fijo y el criterio 1 de esa T2 (las de la pasada 3 se borraron al
empezar la 4: se toma una de la 4 o se reproduce el estado), más una casilla que sí se cumple (el «=» da 1940.2, por
casos): una llamada real del auditor tiene que contestar `no` y `si`. Si no caza el `no` con la imagen delante, F2 no
merece su llamada y se para aquí. Después, tests puros con esa respuesta guardada.

### Medido (03-11-2026, prototipo con Sonnet 5.5)

Cinco criterios con respuesta conocida: el visor con «4,850.50 ÷ 2.5» y «1,240 × 15% + 450 = 636» fijos (captura real de
la versión de la pasada 3), el mismo criterio sobre la pantalla limpia de la pasada 4, las píldoras COPY y Tape con el
icono montado en el texto (defecto real de la pasada 4 que nadie había marcado), dos casos reales del aparato
(`4850.5 ÷ 2.5 = 1940.2`, `5 ÷ 0 = Error`) y un criterio de persistencia que una captura no puede enseñar. Con el primer
prompt refutó EN FALSO el de los casos dos de cada cuatro veces, escribiendo «no hay contradicción» y poniendo «no». Tres
cambios lo dejaron en 30 de 30 aciertos salvo un «no-se-ve» donde tocaba refutar (la dirección segura):

- **El porqué antes que el veredicto** en el JSON: decidía la etiqueta antes de razonar.
- **Etiquetas que no chocan con el castellano**: `cumple`, `contradice`, `no-se-ve` (un «no» se confundía con la negación
  del propio razonamiento).
- **Un `contradice` exige `cita` literal**, y sin ella el código lo baja a `no-se-ve`. Y el prompt explica el formato de los
  casos (`nuevos`/`quitados` respecto a la pantalla de ANTES del primer caso, que arrastra el historial) y pide juzgar SOLO
  lo que dice el criterio.

Coste: unos 15 mil de entrada con tres capturas, unos 450 de salida, unos 6 s por llamada.

### Límites declarados

- Audita lo que la prueba ENSEÑA: un criterio de lógica probado solo con una captura se queda en `no-se-ve`.
- No relee el código: un valor fijo que la captura no enseña (porque se teclea encima) no se caza.
- Cuesta una llamada de `afilado` con hasta dos imágenes por cierre con marcas; ninguna si no hay nada marcado.
