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
