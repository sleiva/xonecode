# Recomendaciones para el paralelismo de xonecode

Alcance: TrueForge Core y un único dispositivo.

## 1. Mantener TrueForge Core y aprovechar su paralelismo actual

Mantener el motor. Agrupar lecturas y búsquedas independientes en una misma respuesta del modelo y lanzar juntos los especialistas cuyo trabajo no dependa del otro.

Conservar un único developer con continuidad de conversación. Usar analista y diseñador en paralelo cuando ambos puedan partir de la misma referencia; entregar al developer el plan y el manifiesto de recursos antes de integrarlos.

## 2. Mantener una sola cola para el dispositivo

Usar una cola común para todas las operaciones que puedan interferir en el aparato. No hace falta repartir por identificadores ni diseñar soporte para varios dispositivos.

Mantener el ciclo de `xone-probar` completo dentro del mismo turno de la cola: recarga, apertura, interacción, log y captura. Las herramientas propias que actúen sobre el aparato deben respetar esa misma exclusión.

Si varios chats pueden usar el único dispositivo, compartir la cola entre ellos. Si solo se permite uno, garantizarlo desde el código.

## 3. Aplicar el modo de aprobación vigente en cada escritura

Conservar la mejora que permite escribir en autónomo sin esperar a los hermanos, pero consultar el modo antes de cada escritura.

Si el usuario cambia a supervisado durante un encargo, las siguientes escrituras deben pedir aprobación. Evitar que el modo autónomo quede fijado durante toda la vida del hijo.

## 4. Cancelar también las órdenes pendientes

Al parar un turno, cancelar tanto la operación activa como las órdenes que todavía esperan en la cola. Ninguna orden pendiente debe arrancar después ni pasar al turno siguiente.

Probar este caso con una primera orden bloqueada, una segunda en espera y una cancelación antes de liberarlas.

## 5. Reducir las vueltas del developer

Agrupar el trabajo en ciclos completos:

1. Leer juntas las fuentes independientes necesarias.
2. Identificar las discrepancias concretas.
3. Aplicar varias correcciones compatibles antes de probar.
4. Ejecutar una prueba y revisar su captura.
5. Cerrar cuando se cumplan los criterios; repetir únicamente por una discrepancia pendiente.

Mantener las modificaciones de un mismo fichero en una edición múltiple o en serie. No añadir subagentes para tareas que una lectura o búsqueda breve ya resuelve.

## 6. Paralelizar las comprobaciones sobre una revisión fija

Ejecutar en paralelo la crítica de una captura guardada y la validación estática de los ficheros correspondientes. Ambas deben referirse a la misma revisión.

Si se modifica esa revisión, renovar la evidencia afectada antes de cerrar la tarea. Mantener al diseñador para iconos, SVG y otros recursos necesarios para la fidelidad.

## 7. Dejar el orquestador no bloqueante para la siguiente fase

Primero estabilizar las colas, las aprobaciones y la cancelación. Después abordar que el padre pueda seguir trabajando mientras ejecutan sus hijos y que un hijo aprobado pueda reanudarse sin esperar a sus hermanos.

Hacer ese cambio en el coordinador o mediante una extensión mantenible de TrueForge; no parchear `node_modules` ni introducir esperas bloqueantes dentro de los agentes.

## 8. Medir antes de ampliar la concurrencia

Comparar la calculadora con el mismo modelo, proyecto inicial, maqueta y exigencia de fidelidad. Registrar tiempo hasta completar, llamadas al modelo, entrada fresca, entrada en caché, salida y calidad final.

Repetir las pruebas para distinguir la mejora de la variación entre ejecuciones. Aumentar la concurrencia solo cuando reduzca tiempo o coste sin perder calidad.

**Orden recomendado:** aprobación dinámica → cola única completa → cancelación de pendientes → trabajo agrupado → medición → orquestador no bloqueante.
