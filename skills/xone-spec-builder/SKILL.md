---
name: xone-spec-builder
description: Entrevista relentless que refina cualquier desarrollo XOne — app nueva, feature sobre proyecto existente, refactor, integración de dispositivo, cambio de modelo de datos, rediseño de pantalla — y deja un PLAN.md (el spec) que xone-plan-builder descompone en tareas, y que xone-project-generator o xone-development ejecutan. Mantiene un glosario de dominio (CONTEXT.md) y ADRs sobre la marcha.
---

# XOne Spec Builder

Una entrevista que **afina** un desarrollo XOne antes de escribir una sola línea de XML, JS o CSS. No importa si es una app nueva, una feature sobre un proyecto que ya existe, un refactor, una integración de dispositivo, un cambio de modelo de datos o un rediseño de pantalla: el spec builder entrevista hasta que todas las decisiones de diseño están resueltas y deja un `PLAN.md` que el siguiente paso consume sin preguntas pendientes.

El objetivo no es producir código ni descomponer el trabajo —para eso están `xone-plan-builder` (descompone en tareas), `xone-project-generator` (genera app nueva) y `xone-development` (trabaja sobre existente)— sino resolver todas las decisiones de diseño que esos pasos necesitan. Cuando la entrevista termina, hay un `PLAN.md` listo para consumir.

> **Carga `xone-development` antes de responder nada sobre XOne.** Toda afirmación sobre atributos XML, APIs JavaScript, CSS, datos o dispositivo debe venir de sus referencias. Si no aparece, dilo y pregunta; no deduzcas por analogía con la web ni con otros frameworks.

## Idea o cambio → PLAN.md

El spec builder es el primer paso de cualquier trabajo XOne. Lo que sigue:

- **`xone-plan-builder`** lee el `PLAN.md` y lo descompone en tareas tracer-bullet con dependencias (`TASKS.md`).
- **App nueva** → `xone-project-generator` lee el `PLAN.md` y genera el proyecto completo.
- **Feature, refactor, integración, cambio de modelo, rediseño** sobre un proyecto existente → `xone-development` aplica el `PLAN.md` sobre los `.xne`, `.js` y `.css` que ya viven en el repo.
- **Validación final** → `xone-review` con `xone-simulator` en ambos casos.

`xone-spec-builder` es **especificación**: produce decisiones de diseño y un spec, no código ni tareas. La tentación de empezar a generar archivos o a descomponer el trabajo es la señal de que has llegado al borde del spec; para ahí y entrega el `PLAN.md`.

## Estructura de archivos

La entrevista escribe en el **directorio de trabajo** del usuario — la raíz del proyecto XOne (existente o por crear). Crea los archivos **lazy**, solo cuando hay algo que escribir:

```
<raíz del proyecto>/
├── PLAN.md                 ← el plan del desarrollo (entregable)
├── CONTEXT.md              ← glosario del dominio (términos canónicos, evitar)
├── docs/
│   └── adr/
│       ├── 0001-sqlite-local-vs-replica.md
│       └── 0002-login-con-oauth2-o-contra-db.md
```

Si no existe `PLAN.md`, créalo cuando la entrevista empiece a cristalizar decisiones. Si no existe `CONTEXT.md`, créalo cuando se resuelva el primer término de dominio. Si no existe `docs/adr/`, créalo cuando se tome la primera decisión digna de ADR.

> **`PLAN.md` es el entregable.** `CONTEXT.md` y los ADRs lo acompañan y alimentan, pero lo que el usuario se lleva es el plan.

## Antes de entrevistar: triage de complejidad

No toda petición necesita una entrevista de 8 rounds. Antes de empezar, clasifica la **complejidad** del desarrollo y ajusta el nivel de especificación:

| Nivel | Cuándo | Qué hace el spec-builder |
|---|---|---|
| **Trivial** | Una sola acción mecánica, sin decisiones de diseño. Ej: «añadir un prop EMAIL (T) a Clientes», «cambiar el color del header», «añadir un botón de salir». | **No produces PLAN.md.** Confirmas la petición en 1-2 preguntas, ejecutas con `xone-development` o `xone-project-generator` directamente, y validas con `xone-review`. Sin `CONTEXT.md` ni ADRs. |
| **Simple** | Un cambio acotado con alguna decisión menor. Ej: «añadir campo IVA a LineasPedido con formula», «pasar Clientes a mapa», «añadir escáner QR en una pantalla». | **Spec ligero.** Entrevista reducida: solo los rounds que apliquen (típicamente 1, 3 y/o 4 y/o 5). `PLAN.md` en formato condensado —una sección por round, sin secciones vacías—. `CONTEXT.md` solo si hay término de dominio nuevo; ADR solo si hay decisión dura. |
| **Normal** | Feature con varias colls/pantallas, refactor, integración multi-pantalla. Ej: «firma de entrega en Pedidos», «login con OAuth2», «módulo de incidencias con fotos». | **Spec completo.** Entrevista con los rounds que apliquen al tipo. `PLAN.md` con las secciones condicionales del formato. `CONTEXT.md` y ADRs según se resuelvan. |
| **Grande** | App nueva completa, re-arquitectura, o un desarrollo que no cabe en una sesión de plan-builder. | **Spec completo + considerar wayfinder.** Entrevista los 8 rounds. Si el scope es tan grande que ni el spec cabe en una sesión, considera dividir el esfuerzo con un enfoque tipo wayfinder (chart el mapa de decisiones primero, luego spec por contexto). |

**Cómo decidir el nivel.** Lee la petición y, si es trabajo sobre existente, los archivos implicados. Si dudas entre dos niveles, **empieza por el inferior** — siempre puedes subir si la entrevista saca más complejidad de la esperada. Nunca al revés: no fuerces una entrevista de 8 rounds en un cambio de color.

**El usuario puede subir o bajar el nivel.** Si propusiste «Simple» y el usuario dice «trátalo como trivial», hazlo. Si propusiste «Simple» y al entrevistar sale que hay migración de datos + dos pantallas nuevas, sube a «Normal» y dilo.

**Para Trivial y Simple, `xone-plan-builder` es opcional.** Una tarea trivial no necesita descomposición. Un spec simple puede generar 1-3 tareas —si el plan-builder no añade valor, el usuario puede ir directo a ejecución. Para Normal y Grande, `xone-plan-builder` casi siempre aporta.

## Antes de entrevistar: clasifica el desarrollo

La entrevista se adapta al tipo de desarrollo. Antes de la primera ronda, identifica con el usuario **qué clase de trabajo es**:

| Tipo | Qué resuelve el plan | Ejemplo |
|---|---|---|
| **App nueva** | Modelo de datos completo, flujo de pantallas, integraciones, estilo, sincronización | «Una app de gestión de pedidos para comerciales» |
| **Feature sobre existente** | Qué colls/props/pantallas se añaden o modifican, qué eventos, qué integraciones nuevas | «Añadir firma de entrega en Pedidos» |
| **Refactor** | Qué se reestructura, por qué, y qué no cambia | «Migrar login de DB local a OAuth2» |
| **Integración de dispositivo** | Qué objeto canónico, qué permisos, qué coll lo usa, dónde se persiste | «Añadir escaneo QR en línea de pedido» |
| **Cambio de modelo de datos** | Qué colls/props cambian, relaciones afectadas, migración de datos | «Añadir campo IVA a LineasPedido y recalcular totales» |
| **Rediseño de pantalla** | Qué pantallas, qué cambia (layout, viewmode, estilo), qué se conserva | «Pasar Clientes de lista a mapa» |

El tipo fija qué rounds aplican y cuáles se saltan. Un rediseño de pantalla no necesita el round de sincronización; una integración de biometría apenas toca el modelo de datos. **No fuerces los 8 rounds en todos los desarrollos** — salta los que no apliquen y dilo explícitamente en el plan («no aplica a este desarrollo»).

## La entrevista (grilling)

Entrevista relentless, una ronda cada vez, una pregunta cada vez. **Tú preguntas; el usuario responde.** Nunca respondas a tus propias preguntas ni rellenes huecos por intuición: si el usuario no lo sabe, es una pregunta pendiente y se marca en `PLAN.md` §Pendientes.

### Round 1 — Qué y por qué

Antes de cualquier decisión técnica, afila **qué** es el desarrollo:

- ¿Qué problema resuelve y por qué ahora?
- ¿Es app nueva o trabajo sobre un proyecto existente? Si existe, **lee los `.xne` y el CSS** del proyecto antes de seguir — el plan debe respetar convenciones que ya viven ahí.
- ¿Qué está dentro del alcance y qué fuera? Escríbelo explícito; el scope fija el plan.
- ¿Hay restricciones (compliance, dispositivo objetivo, versión de XOne, offline obligatorio)?

Si es app nueva, ve al Round 2. Si es sobre existente, anota qué colls/pantallas/ficheros están implicados y léelos con las referencias de `xone-development` a mano.

### Round 2 — Lenguaje de dominio

Afina el **vocabulario de negocio** del desarrollo:

- ¿Qué términos usa el usuario y qué significan **aquí**? Cada término ambiguo o sobrecargado va a `CONTEXT.md`: propón el término canónico y lista los sinónimos bajo `_Evitar_`.
- Escenarios límite: inventa casos que fuercen al usuario a precisar los bordes de cada concepto. («¿Una factura puede pertenecer a dos clientes?», «¿Una tarea sin asignar es válida?»)

Cristaliza términos en `CONTEXT.md` según se resuelven —sin batchear. `CONTEXT.md` es un **glosario de negocio**: sin SQL, sin nombres de `<prop>`, sin vocabulario técnico de XOne. Ver [CONTEXT-FORMAT.md](references/CONTEXT-FORMAT.md).

> Si el proyecto ya tiene `CONTEXT.md` de desarrollos anteriores, léelo antes de este round y desafía solo lo nuevo o contradictorio.

### Round 3 — Modelo de datos

Mapea entidades a **colecciones XOne**. Para desarrollo sobre existente, esto es **qué cambia**, no el modelo entero:

- Una entidad de negocio nueva = una `<coll>` con `sql`, `objname`, `updateobj`.
- Una entidad modificada = qué `<prop>` se añaden, cambian de tipo, o se eliminan; qué relaciones nuevas.
- Identifica relaciones (1:N, N:M) y cómo se expresan en XOne: combos con `mapcol`/`mapfld` en el prop oculto del ID y `linkedto`/`linkedfield` en el visible de la descripción, `<contents>` para listas embebidas, `filter="IDPADRE=##FLD_IDPADRE##"` para maestro-detalle. La sintaxis exacta de cada uno, en `xone-development`.
- Campos persistidos: MAYÚSCULAS, sin guion bajo en `Usuarios.IDEMPRESA`. Antes de poner o quitar un `MAP_`, lee su regla en `xone-development`: el fallo es simétrico y silencioso en una de las dos direcciones.
- ¿`loadall="true"` o carga bajo demanda? Cuidado con tablas grandes.
- ¿Herencia (`inherits`) o factorización (`<include-layout>`)? Aplica la regla de decisión rápida de `xone-project-generator`.
- Si el cambio toca el esquema, anota si hace falta migración o `xone-db-tools create-db --overwrite`.

Escribe en `PLAN.md` §Modelo de datos. Cruza siempre con `xone-development`: tipos de prop válidos, regla de unicidad de `name` por coll, `progid` opcional salvo Empresas/Usuarios, `ID`/`ROWID` gestionados por la plataforma.

### Round 4 — Pantallas y navegación

Diseña el flujo de usuario afectado:

- **App nueva:** Splash (fichero raíz) → Login → EntradaApp → MenuPrincipal → entidades. Una coll por pantalla de entidad (lista, detalle, edición). `special="true"` para menús y pantallas sin datos (sin `sql`).
- **Sobre existente:** qué pantallas se añaden, cuáles se modifican y cómo. Lee las que ya existen antes de proponer cambios.
- El `viewmode` de un `type="Z"` se **copia del catálogo de `xone-development`**, nunca se escribe de memoria: uno que no exista ahí no da error — se ignora, y sale una lista donde se esperaba otra cosa.
- Navegación: `ui.openEditView("Coll")` para ir, `ui.getView(self).exit()` para volver.
- Filtros dinámicos con `asfilter` y contents con `##FLD_…##`.
- **¿Qué tiene que pasar al ABRIR la pantalla, y qué solo la PRIMERA vez?** Son eventos distintos, y hay uno que parece el bueno y no lo es: los tres, en `xone-development`.
- ¿`inherits` o `<include-layout>` para factorizar estructura compartida?

Escribe en `PLAN.md` §Pantallas: nombre, propósito, coll base (si hereda), contenido en prosa, eventos clave. **No generes el `.xne`** — eso es del siguiente paso.

### Round 5 — Integraciones de dispositivo y datos

Solo si el desarrollo las toca:

- **¿GPS?** Dónde se lee la posición, con qué precisión, y qué pasa sin señal.
- **¿Cámara o fotos?** Quién las toma, dónde se guardan, si se suben.
- **¿Firma digital?** En qué pantalla y sobre qué documento.
- **¿Escáner QR o de código de barras?** Qué se hace con lo leído.
- **¿Biometría?** Para entrar, para confirmar una acción, o las dos.
- **¿Bluetooth, NFC o impresión?** Contra qué dispositivo.
- **¿Habla con un backend?** Por HTTP, con OAuth2, o replicando.
- **¿Guarda ajustes o tokens** entre sesiones?

**Los mecanismos de cada una —el tipo de `prop`, el objeto, la API y sus obsoletos— viven en
`xone-development`.** Aquí se decide QUÉ lleva la app y qué permisos arrastra; el CÓMO se
consulta allí y se cita, no se copia.

Para cada integración que aplique, anótala en `PLAN.md` §Integraciones con el objeto canónico y los permisos Android a declarar en `<permissions>`. Si no aplica ninguna, dilo explícitamente: «sin integraciones de dispositivo» es una decisión válida.

### Round 6 — Estilo visual

Solo si el desarrollo toca la UI visual:

- Paleta de colores (primario, secundario, fondo, texto, estados). **El formato de color de XOne y su orden de canales, en `xone-development`**: cópialo de ahí antes de escribir un valor.
- Tamaños canónicos: consulta [`canonical-sizes.md` de `xone-project-generator`](../xone-project-generator/references/canonical-sizes.md) antes de proponer `width`/`height`/`fontsize`. Recuerda: `p ≠ dp`, Material 56dp = ~168p en 1080×1920.
- `fontsize` **no está en puntos**: es una escala pequeña y el factor de plataforma se suma. La escala, los factores de `app.xml` y el cálculo, en `xone-development`.
- **¿El proyecto está en `compatibility-mode`?** Míralo ANTES de proponer estilos: cambia si el CSS se aplica o no (el porqué, en `xone-development`).
- Si es sobre existente, **lee el `default.css` actual** y respeta sus convenciones de nombres de clase.

Escribe en `PLAN.md` §Estilo: paleta, clases base, variantes de tema y tamaños canónicos de los elementos principales.

### Round 7 — Sincronización y seguridad

Solo si el desarrollo las toca:

- ¿La app trabaja offline contra la base local, replica contra un backend, o las dos cosas? **El nombre de la base, el prefijo de tabla y la macro que hay que usar en toda SQL, en `xone-development`.**
- ¿Login contra DB local, OAuth2, o ambos? Empresas y Usuarios viven en `mappings.xne`.
- Seguridad: parametriza SQL con `?` (nunca concatenes), HTTPS siempre, pinning/mTLS si aplica, no hardcodees credenciales, cifra tokens antes de guardarlos.
- ¿Eventos de sincronización? `maintenance` en `Empresas` para réplica programada.

Escribe en `PLAN.md` §Sincronización y seguridad.

### Round 8 — Cierre y verificación del plan

Revisa el `PLAN.md` completo contra el checklist de [PLAN-FORMAT.md](references/PLAN-FORMAT.md):

- ¿El tipo de desarrollo está declarado y el scope claro?
- ¿Las colls/props/pantallas afectadas (nuevas o modificadas) están listadas con tipos válidos y relaciones correctas?
- ¿El flujo de pantallas afectado está completo?
- ¿Las integraciones declaradas tienen su objeto canónico y sus permisos?
- ¿Los términos de dominio nuevos están en `CONTEXT.md` y las decisiones duras en ADRs?
- ¿Quedan preguntas abiertas? Márcalas en `PLAN.md` §Pendientes; no las resuelvas tú.

Si falta algo, vuelve al round correspondiente. Si todo está, entrega el spec y señala el siguiente paso: `xone-plan-builder` para descomponer en tareas, después `xone-project-generator` (app nueva) o `xone-development` (sobre existente), y `xone-review` para validar al final.

## Disciplina durante la entrevista

### Desafía contra el glosario

Cuando el usuario use un término que contradice `CONTEXT.md`, páralo: «Tu glosario define "cliente" como X, pero ahora lo usas como Y — ¿cuál es?»

### Afila lenguaje difuso

Términos vagos o sobrecargados → propón un término canónico: «Dices "cuenta" — ¿te refieres al Cliente o al Usuario? Son cosas distintas en XOne.»

### Discute escenarios concretos

Cuando se discutan relaciones de dominio, estrésalas con casos límite que fuercen a precisar los bordes entre conceptos.

### Cruza con las referencias y con el código existente

Cuando el usuario afirme cómo funciona algo de XOne, comprueba las referencias de `xone-development`. Si es trabajo sobre existente, **lee el código actual** antes de proponer cambios: si hay contradicción, sácala. («Este campo se llama `IDEMPRESA` sin guion bajo —el framework lo lee literalmente. Tu `.xne` ya lo tiene así, bien.», o «Aquí usáis `load` para inicializar, pero es anti-patrón —¿lo cambiamos a `before-edit` en este desarrollo?»)

### Actualiza CONTEXT.md inline

Cuando un término se resuelve, actualiza `CONTEXT.md` ahí mismo. Sin batchear. Ver [CONTEXT-FORMAT.md](references/CONTEXT-FORMAT.md).

`CONTEXT.md` debe estar **totalmente** libre de detalles de implementación: sin SQL, sin nombres de `<prop>`, sin tipos de XOne. Es un glosario de dominio y nada más.

### Ofrece ADRs con tiento

Solo ofrece crear un ADR cuando los tres se cumplan:

1. **Difícil de revertir** — el coste de cambiar de opinión después es significativo.
2. **Sorprendente sin contexto** — un futuro lector se preguntará «¿por qué hicieron esto así?»
3. **Resultado de un trade-off real** — había alternativas genuinas y se eligió una por razones concretas.

Si falta alguno, sáltate el ADR. Ver [ADR-FORMAT.md](references/ADR-FORMAT.md).

Ejemplos típicos dignos de ADR en XOne:
- **Forma de sincronización.** «SQLite local puro» contra «réplica programada con backend».
- **Modelo de login.** Login contra DB local vs OAuth2 contra IdP externo.
- **Estrategia offline.** «Opera siempre offline y replica en segundo plano» vs «requiere conexión».
- **Persistencia de tokens.** Tokens cifrados en macros globales y limpiados al cerrar sesión.
- **Elección de viewmode para un volumen grande.** `gridview` vs `mapview` cuando la elección no es obvia.
- **`compatibility-mode="true"` activado a propósito.** Registrar por qué evita que alguien pierda el rato diagnosticando estilos que, por lo que ese modo implica, no iban a aplicarse.
- **Migración de `load` a `before-edit`.** Si el proyecto usaba `load` y se decide migrar, registrar por qué —un futuro ingeniero asumirá que siempre se hizo así.
- **`inherits` frente a `<include-layout>`.** Cuando se elige uno sobre el otro por razones no obvias y revertir implicaría reestructurar varias colls.
- **Uso de `fetch` frente a `$http`.** Si se desvía del idiomático `$http` hacia `fetch` por una razón concreta —código compartido con web que ya está escrito así, por ejemplo—, vale la pena registrarlo. **Lo que NO vale como razón es la cancelación**: el `fetch` de XOne no tiene cancelación real en vuelo, `AbortController` existe como objeto pero abortar no corta la petición (limitaciones en `xone-development`).

## Referencias

- [references/PLAN-FORMAT.md](references/PLAN-FORMAT.md) — Plantilla y checklist del `PLAN.md` final.
- [references/CONTEXT-FORMAT.md](references/CONTEXT-FORMAT.md) — Formato del glosario `CONTEXT.md`.
- [references/ADR-FORMAT.md](references/ADR-FORMAT.md) — Formato de los ADRs y cuándo crearlos.

Las reglas de XML, JavaScript, CSS, datos y dispositivo viven en `xone-development`. No las repitas aquí; consúltalas y cítales. El generador de proyectos, en `xone-project-generator`. La descomposición en tareas, en `xone-plan-builder`.