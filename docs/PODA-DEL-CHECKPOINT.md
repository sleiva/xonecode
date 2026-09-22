# La poda del checkpoint: qué dice la doc, y qué se midió

`checkpoint.sqlite` de un proyecto llegó a **918 MB**. CLAUDE.md ya lo declara —«esto CRECE y
no hay poda»— pero no dice cuánto ni por qué. Esto lo mide y comprueba que hay salida.

## 1. Lo que dice la documentación oficial: casi nada, y hay que saberlo

Buscado en la doc de LangChain/LangGraph y **verificado contra el paquete instalado**, que es
lo que manda:

- **No existe `prune()` ni `delete_checkpoints()` en JavaScript.** `BaseCheckpointSaver`
  (`@langchain/langgraph-checkpoint`) declara **cinco** métodos abstractos y nada más:
  `getTuple`, `list`, `put`, `putWrites` y `deleteThread`. Lo de `.prune(older_than=…)` que
  circula por blogs no está en el paquete; conviene no fiarse de un resumen de búsqueda.
- **No existe TTL de checkpoints en el OSS.** El único `ttl` del paquete es el de
  `InMemoryCache`, que es la caché de resultados de un NODO y no tiene nada que ver. El TTL
  del que habla el soporte de LangChain es de **LangGraph Platform**, el producto alojado.
- **La doc oficial de persistencia reconoce el problema y lo deja abierto**: bajo
  «Checkpoints growing unboundedly» dice literalmente que hay que «prune old checkpoints
  periodically or set a retention policy», sin una sola API, sin decir qué filas hacen falta
  para reanudar y sugiriendo un cron con `DELETE`.
- **El issue de langgraph.js que pregunta EXACTAMENTE esto está abierto y sin contestar**
  (`langchain-ai/langgraphjs#1138`: «How do I keep data in Postgres checkpointer database
  from growing unbounded?»).

**Conclusión**: no hay mecanismo oficial que adoptar. Como además el `SqliteSaver` es
**nuestro** (`src/vendor/sqliteSaver.ts`, traído al vendor), el SQL lo escribimos nosotros y
no dependemos de que la librería añada nada.

## 2. Dónde está el peso, medido

Sobre el fichero de 918 MB, **una sola sesión**:

| | filas | blobs |
|---|---|---|
| `checkpoints` | 2.794 | 661 MB |
| `writes` | 6.248 | 252 MB |

Y el reparto que cambia el diagnóstico:

| | espacios | filas | MB |
|---|---|---|---|
| **PRINCIPAL** (`checkpoint_ns = ''`, el hilo que se reanuda) | 1 | 246 | 186 + 74 |
| **`tools:*`** (los subagentes) | 21 | 2.548 | 443 + 166 |

**Los subagentes son el 70 % del fichero.** Cada delegación abre su propio espacio con su
propia cadena de checkpoints, y una vez que devolvió su respuesta no hay nada que reanudar
ahí dentro.

**El crecimiento es CUADRÁTICO, y ésa es la causa de fondo**: un checkpoint guarda la lista de
mensajes ENTERA, y se escribe uno por paso del grafo. El primero de esta sesión ocupa 3 KB y
el mayor **3.885 KB**; la media son 231 KB × 2.794 pasos. No es que se guarde basura: es que
se guarda lo mismo 2.794 veces, cada vez un poco más largo. La `freelist` estaba a **cero**,
así que un `VACUUM` a secas no habría recuperado nada.

## 3. Qué se puede borrar, y por qué es seguro

**xonecode solo le pide dos cosas al checkpointer** (`agent/sesiones/checkpointer.ts`, único
llamador): `getTuple({ thread_id })` y `deleteThread(hilo)`. Nada más — ni `list()`, ni viaje
en el tiempo, ni historial. Y `getTuple` sin `checkpoint_id` resuelve a
`ORDER BY checkpoint_id DESC LIMIT 1`: **el último y nada más**.

Así que el conjunto que hay que conservar es:

- el **último** checkpoint de cada `(thread_id, checkpoint_ns)`, y
- su **PADRE** — no por el checkpoint en sí, sino porque la subconsulta `pending_sends` de
  `prepareSql` lee los `writes` del `parent_checkpoint_id` (canal `TASKS`). Quitar los writes
  del padre es la forma sutil de romper esto, y por eso el padre entra en el conjunto.

**La guarda que lo hace fail-closed**: podar SOLO con el turno cerrado, es decir con
`__pregel_tasks` vacío y sin `pendingWrites`. Un subagente parado en una aprobación vive en su
`tools:*`, y podarlo a media aprobación se lleva la reanudación por delante. Es un predicado
sobre datos que la propia base tiene, no una heurística.

## 4. La medida, sobre una COPIA

Poda = «último + padre por espacio», y después `VACUUM`:

```
2.794 checkpoints  ->  44        6.248 writes  ->  66
879 MB  ->  20,9 MB   (-97,6 %)  ·  VACUUM: 0,12 s
```

Y **la sesión reanuda idéntica**: mismo `checkpoint_id`, los mismos **132 mensajes**, mismos
`pendingWrites`, mismos canales. Comprobado con el `SqliteSaver` de verdad contra el fichero
podado, antes y después del `VACUUM`.

Proyectado sobre los siete proyectos del workspace, sin tocar ninguno:

| proyecto | ahora | después |
|---|---|---|
| MyAllXOne | 876 MB | ~20 MB |
| AppDemo | 422 MB | ~8 MB |
| ACAProd | 149 MB | ~2 MB |
| PlaemerWebTestAsync | 79 MB | ~1 MB |
| AppDeve | 6 MB | ~0 MB |
| **TOTAL** | **1.532 MB** | **~31 MB** |

## 5. Lo que hay HOY sin tocar nada

`deleteThread` ya existe y borra **todos** los espacios de un hilo (`WHERE thread_id = ?`,
incluidos los `tools:*`), y la consola ya lo llama al borrar una sesión. O sea: borrar la
sesión en la web libera hoy mismo esos 918 MB. Lo que no hay es forma de adelgazar una sesión
que se quiere CONSERVAR, y ése es el hueco.

## 6. El coste, cronometrado

Poda + `VACUUM` sobre el fichero de 879 MB, de punta a punta:

```
879 MB  ->  20,9 MB      2,5 s
```

Y sobre la base ya podada el hilo **sigue vivo en los dos sentidos**: se relee igual (mismo
checkpoint, 132 mensajes) y un `put` nuevo entra y se vuelve a leer. No es un archivo muerto.

## 7. Propuesta: se dispara por TAMAÑO, no cada turno

Hacerlo en todos los turnos es pagar 2,5 s por un trabajo que casi nunca hace falta. El disparo
es una **cota sobre el fichero**:

- **Se mira el tamaño con un `statSync`** al cerrar el turno — microsegundos, así que el caso
  normal no paga nada. Solo si pasa de la cota se poda.
- **La cota se dimensiona con lo medido**: una sesión grande YA PODADA ocupa ~21 MB, así que
  una cota de **256 MB** deja un orden de magnitud de margen y nunca corta por lo sano.
- **La histéresis sale gratis**: podar deja el fichero en decenas de MB, o sea muy por debajo
  de la cota, así que no puede reengancharse turno tras turno. No hace falta una segunda cota
  ni recordar cuándo se podó por última vez — el propio tamaño es el estado, y eso evita el
  fichero de marca de siempre.
- **Y la cota es un TECHO, no un objetivo**: no se poda «para dejarlo bonito», se poda cuando
  el fichero ya estorba. Un proyecto que nunca lo alcance no ejecuta esto jamás.

Dónde y cómo:

- **La REGLA es pura y va en `core/`** con test: dado el tamaño, si hay tareas pendientes y
  cuál es el último checkpoint, decide SI se poda y QUÉ `(thread_id, checkpoint_ns,
  checkpoint_id)` se conservan. El **SQL** va en `agent/sesiones/`, al lado de
  `checkpointer.ts`, que es quien ya tiene la conexión.
- **Se dispara donde el turno ya cierra**, el `finally` de `correrTurno` donde corre
  `commitDeTurno`: es el único momento en que «no hay nada pendiente» está garantizado. Y va
  **envuelto entero**, como el commit: una poda que falle no puede llevarse un turno correcto.
- **Fail-soft con el cerrojo.** `VACUUM` reescribe el fichero y toma un lock exclusivo, y en
  este repo puede haber dos procesos sobre el mismo proyecto (la web y el terminal). Un
  `SQLITE_BUSY` **no es un error que contar**: se deja para la vuelta siguiente, que llegará
  al cerrar el turno que viene. Es mantenimiento, no una operación del usuario.
- **Un comando a mano para el caso de hoy** (`xonecode podar`), porque las bases que ya están
  gordas no se arreglan solas hasta el próximo turno de cada proyecto — y hay 1,5 GB ahí
  fuera.

**Lo que NO se toca**: el `.jsonl` de la sesión, que es el transcript que lee la interfaz.
Esto solo adelgaza la memoria del grafo, y por eso la conversación en pantalla no cambia.

## 8. Hecho, y el resultado real

Implementado (`core/podaDeCheckpoint.ts` la regla, `agent/sesiones/checkpointer.ts` el SQL,
`vestibulo.ts` el enganche al cierre de turno, `cli/podar.ts` el comando) y **ejecutado sobre
el workspace de verdad**:

```
1,6 GB  ->  541 MB     (y 421 MB de eso es AppDemo, intacto a propósito)
```

| proyecto | antes | después |
|---|---|---|
| MyAllXOne | 882,3 MB | **20,9 MB** |
| ACAProd | 149,2 MB | 2,3 MB |
| PlaemerWebTestAsync | 79,0 MB | 1,1 MB |
| AppDeve | 5,8 MB | 0,4 MB |
| **AppDemo** | 421,5 MB | **no se tocó** — tenía una aprobación sin contestar |

**Y todas las sesiones de todos los proyectos podados siguen reanudando**, con su cuenta de
mensajes íntegra: los 132 de MyAllXOne, y las 5 y 6 sesiones de los proyectos con varias.

### Tres cosas que salieron de correrlo, no de escribirlo

- **El `-wal` CUENTA para el tamaño.** Este checkpointer va en modo WAL, así que lo recién
  escrito vive en `checkpoint.sqlite-wal` hasta que se consolida. Mirando solo el fichero
  principal, una base con cientos de MB en el WAL contesta que ocupa 4 KB y **la cota no
  dispara nunca**: la regla habría quedado escrita y muerta, con todo en verde. Lo cazó el test
  que exige que el fichero encoja, que daba `4096` antes y después.
- **Y hay que CONSOLIDAR el WAL después del `VACUUM`**, o el espacio no vuelve al disco: la
  poda funciona y el disco sigue igual de lleno, que es el único resultado que importa.
- **El comando a mano NO puede saltarse la guarda de «a medias».** Teclearlo autoriza a
  limpiar un proyecto por pequeño que sea —la COTA sí se salta—, pero no a romper una sesión
  que puede continuar. Encontrado en seco sobre el workspace real: AppDemo tenía 422 MB y
  trabajo a medias mientras MyAllXOne tenía 882 MB y ninguno. Sin esa guarda, el comando se
  habría llevado por delante una aprobación en vuelo.
