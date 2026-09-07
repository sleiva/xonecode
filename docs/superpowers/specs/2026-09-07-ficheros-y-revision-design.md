# Ficheros y Revisión

Diseño de dos pestañas del panel central de la consola web: **Ficheros**, el árbol del
proyecto en el que se trabaja con un visor de solo lectura, y **Revisión**, lo que la sesión
ha tocado con los diffs apilados. Revisión es la pestaña «Ficheros» de hoy, renombrada y
redistribuida; Ficheros es nueva.

Fecha: 2026-09-07. Estado: diseño pendiente de aprobación.

El modelo visual es el panel de revisión de la aplicación de escritorio de Claude Code, que
el usuario enseñó en dos capturas: ficheros apilados con cabecera pegajosa y su `+N −M`,
diff con dos columnas de números de línea, árbol de cambiados a la derecha; y, para el
proyecto, visor en el centro y árbol con filtro a la derecha.

---

## Decisiones que tomé yo — revísalas primero

El usuario narró las dos pestañas y aprobó el diseño en chat. Estas son las decisiones que
no dictó y que tomé para que el spec no tenga huecos. Cada una es reversible antes del plan.

| # | Decisión | Por qué, y qué costaría cambiarla |
|---|---|---|
| D1 | **El mensaje del cable `clase: "ficheros"` pasa a llamarse `clase: "revision"`** en las dos direcciones. `parche` no cambia. | Hoy `Pestana = "ficheros"` y `clase: "ficheros"` significan lo mismo: lo que la sesión tocó. Tras este cambio la pestaña Ficheros la alimentaría un mensaje con otro nombre y el mensaje `ficheros` alimentaría Revisión. Es la clase de colisión que da un bug mudo seis meses después. Toca `tipos.ts`, `tipos.test.ts`, `store.ts`, `arranque.ts`, `arranque.test.ts` y `App.tsx`; no hay sesiones guardadas que lleven ese literal, así que no hay migración. |
| D2 | **Orden de las pestañas: Chat · Ficheros · Revisión · Trazas.** | Las tres primeras son para quien desarrolla una app XOne; Trazas es para depurar el harness (así se renombró). Lo que se usa junto va junto, y lo de otro destinatario al final. |
| D3 | **El árbol se lista sin tope de profundidad práctico** (32 niveles) y con **tope de entradas: 5.000**, declarando `recortado: true` si se alcanza. | `ficherosDelProyecto` (`turnoReal.ts`) para en profundidad 4 porque su uso es el completado del Tab. Reusarlo tal cual haría un árbol que miente por omisión en un proyecto profundo. Se le añade el tope como parámetro; el completado sigue pidiendo 4. |
| D4 | **En Revisión se despliegan solos los 8 primeros ficheros**; el resto se abren al pulsar. | Conserva la petición del parche bajo demanda (un turno largo son megas) y aun así la pestaña se abre enseñando diffs y no una lista de cabeceras. El número es una constante con nombre. |
| D5 | **La columna derecha se va por debajo de 960 px** de ancho de ventana, en las dos pestañas. | Es el ancho a partir del cual un diff de 80 columnas y un árbol de 260 px caben sin scroll horizontal. Solo un `@media`. |
| D6 | **El resaltado del visor reutiliza `CodeBlock`** de `@deepseek-ai/dsh-client-ui-primitives`, el mismo que las vallas del chat. Los números de línea se pintan con contadores CSS si su marcado tiene un nodo por línea; si no, se pasa a la API de tokens de shiki con el MISMO tema. | Un segundo resaltador con su propio tema colorearía el visor distinto que el chat. `shiki.css` usa `--shiki-token-*`, así que deepseek mapea un tema propio sobre esas variables dentro de `CodeBlock`; la comprobación es del plan, la regla es del spec: un solo tema. |
| D7 | **Binario = hay un byte NUL en los primeros 8 KB.** Lo que no es binario se decodifica como UTF-8 estricto y, si no lo es, como latin1 con `codificacion: "latin1"` en el mensaje, que el visor dice. | Los proyectos XOne antiguos vienen de Windows y pueden ir en cp1252. Un fichero que se enseña con rombos sin explicación se lee como corrupto; con la etiqueta se lee como lo que es. |
| D8 | **El visor no pinta los `.xml` aplanados**, y el árbol tampoco los lista. | Es la misma regla que rige para el agente (`esVistaAplanada`, `agent/proyecto.ts`): los genera XOne Studio y no se tocan. Enseñarlos en el árbol invitaría a pedirle al agente que los edite. |

---

## Qué hay hoy

La pestaña «Ficheros» (`apps/web/src/componentes/Ficheros.tsx`) enseña los ficheros que la
sesión ha tocado: lista a la izquierda con clase y `+N −M`, y a la derecha el parche del
elegido, pedido al pulsar. La verdad sale de `agent/sesionGit.ts`: una ref propia
`refs/xonecode/sesion/<id>` con la foto del árbol al abrir el proyecto, comparada árbol
contra árbol. Por el cable viajan `{ clase: "ficheros", via, ficheros }` y
`{ clase: "parche", ruta, texto, recortado }`; el cliente pide con `{ clase: "ficheros" }` y
`{ clase: "ficheros", ruta }`. `App.tsx` vuelve a pedir la lista al terminar un turno si la
pestaña está a la vista.

No hay ninguna vista del proyecto en sí. Para saber qué ficheros tiene la app hay que
preguntárselo al agente o abrir un explorador.

---

## Revisión

### Lo que se ve

- **Cabecera de la pestaña**: la palabra «Sesión» a la izquierda, que es el hueco donde
  irá el selector de turno cuando exista (fuera de alcance, ver abajo), y el total de la
  sesión a la derecha: `+Σmas −Σmenos`, sumado de lo que ya viaja por fichero. Los binarios
  no cuentan y se dice cuántos hay si hay alguno («y 2 binarios»). El botón «Volver a
  mirar» de hoy se queda en esta fila.
- **La pila**: un bloque por fichero, en el orden en que llega la lista. La cabecera del
  bloque es pegajosa (`position: sticky`) y lleva el icono de clase (nuevo, modificado,
  borrado, los mismos `data-clase` de hoy), la carpeta en gris, el nombre en negrita y su
  `+N −M` (o «binario»). Pulsarla despliega o pliega el diff.
- **El diff**, desplegado: cada línea con dos columnas de número, la del fichero viejo y la
  del nuevo, y el texto. Añadidas en verde con la columna vieja vacía; quitadas en rojo con
  la nueva vacía; contexto plano con las dos. La cabecera de tramo `@@` se pinta como
  separador tenue. El aviso de `recortado` sigue igual.
- **La columna derecha**: los ficheros cambiados como árbol de carpetas, con el icono de
  clase en cada hoja. Pulsar una hoja despliega su bloque y desplaza la pila hasta él.
  Por debajo de 960 px la columna se va (D5).
- Los tres avisos de hoy no cambian: «consultando», «sin empezar», «sin marca» (con su
  variante para sesión histórica).

### La numeración del diff

`numerarParche(texto)` es una función pura en `apps/web/src/numerarParche.ts`:

- Entra el texto del parche tal y como llega (ya sin la cabecera de git: `parcheDeSesion`
  corta en el primer `@@`).
- Cada `@@ -a,b +c,d @@` fija los contadores viejo = `a`, nuevo = `c`. Sin la coma
  (`-a +c`) vale igual.
- Una línea que empieza por espacio avanza los dos; `+` avanza solo el nuevo; `-` solo
  el viejo.
- `\ No newline at end of file` no avanza ninguno y se pinta como nota tenue.
- Un parche sin ningún `@@` (binario, cambio de modo) devuelve las líneas sin número, y
  el visor no pinta las columnas.

Devuelve `{ tipo: "tramo" | "contexto" | "mas" | "menos" | "nota"; viejo?: number; nuevo?: number; texto: string }[]`.
Tiene su propio test con un parche de dos tramos, uno de solo altas y uno sin `@@`.

### Qué no cambia

Los datos. `FicheroTocado` es el mismo, `parcheDeSesion` es el mismo, la ref y la foto son
las mismas. Es una redistribución de lo que ya viaja, más una función pura.

---

## Ficheros

### Lo que se ve

- **Visor en el centro**. Sin fichero elegido: «Elige un fichero del árbol». Con uno: su
  ruta arriba, el contenido resaltado con números de línea, y si procede una de tres
  notas: «recortado a N KB», «binario, N bytes» (sin contenido), o «leído como latin1».
- **Árbol del proyecto a la derecha**, con un campo «Filtrar ficheros…» encima. Carpetas
  plegables; al arrancar, abiertas las del primer nivel. El filtro es por subcadena de la
  ruta completa, sin distinguir mayúsculas, y enseña las hojas que casan con sus carpetas
  abiertas. La hoja elegida se marca con fondo y barra de acento cian, como la fila
  elegida hoy en la lista de tocados. Por debajo de 960 px el árbol pasa a ocupar el
  centro hasta elegir un fichero, y una flecha vuelve a él (D5).
- El lenguaje del resaltado se deduce de la extensión (`lenguajeDe`, tabla cerrada):
  `.xne` y `.xml` → xml, `.js` → javascript, `.css` → css, `.ini` → ini, `.json` → json,
  `.md` → markdown, `.txt` y desconocidas → texto plano.

### El cable

Dos mensajes nuevos, en las dos direcciones, redeclarados en `apps/web/src/tipos.ts` como
todo el cable:

Cliente → servidor:

- `{ clase: "arbol" }` — pide el árbol del proyecto abierto.
- `{ clase: "fichero"; ruta: string }` — pide el contenido de una ruta relativa a la raíz
  (misma forma que la `ruta` de `parche`: `src/app.xne`, sin barra inicial).

Servidor → cliente:

- `{ clase: "arbol"; rutas: string[]; recortado: boolean; error?: string }` — rutas
  relativas, ordenadas, ya filtradas (ver abajo). `error` solo si el puerto falló, y
  entonces `rutas` va vacía. Sin proyecto abierto no se contesta nada, igual que hoy
  `ficheros` sin consola abierta.
- `{ clase: "fichero"; ruta: string; texto?: string; recortado: boolean; binario: boolean; bytes: number; codificacion?: "utf-8" | "latin1"; error?: string }`
  — `texto` falta si es binario o si la ruta se rechaza; en el rechazo va `error` con el
  motivo del paso que falló, y `ruta` es la recibida tal cual, nunca la resuelta en disco.

Los literales `arbol` y `fichero` entran en `tipos.test.ts`, que compara las uniones del
cliente contra las del host.

### El servidor

`montarRutas` (`web/servidor/arranque.ts`) recibe dos puertos nuevos, opcionales y por
parámetro como `cambiosDeSesion` y `parcheDeSesion`, para que `arranque.test.ts` use dobles:

- `arbolDelProyecto?: (raiz: string) => Promise<{ rutas: string[]; recortado: boolean }>`
- `leerFichero?: (raiz: string, ruta: string) => Promise<Fichero>`

Las implementaciones reales viven en un módulo nuevo, `src/agent/arbolDeProyecto.ts`, con
dos funciones, `arbolDeProyecto` y `leerFicheroDeProyecto`. `ficherosDelProyecto` se queda
en `turnoReal.ts` donde está —solo gana el tope de profundidad como parámetro— y el módulo
nuevo la importa: mover una función que `cli/main.ts` ya importa no aporta nada aquí.

**El árbol** reutiliza `ficherosDelProyecto(raiz, prof, tope)` con el tope de profundidad
como parámetro (D3), y filtra: fuera lo que `puedeLeerRuta` rechaza (`.env*`, `.git`,
`.xonecode`), fuera `node_modules` (ya lo salta), y fuera los `.xml` aplanados
(`esVistaAplanada` contra el conjunto entero, D8). Devuelve las rutas sin la barra inicial,
ordenadas: carpetas antes que ficheros en cada nivel, y alfabético sin distinguir
mayúsculas.

**El lector** aplica, en este orden y parando en la primera que falla:

1. La ruta no es absoluta, no está vacía y ningún segmento es `.` ni `..`.
2. Con barra inicial añadida, `puedeLeerRuta` la acepta.
3. No es una vista aplanada (D8).
4. `path.resolve(raiz, ruta)` seguido de `realpath` de la raíz y del fichero: el real del
   fichero empieza por el real de la raíz más el separador. Un enlace simbólico dentro del
   proyecto que apunte fuera se rechaza aquí. Es la lección que el repo ya pagó con
   `virtualMode: true`.
5. Es un fichero regular (no carpeta, no dispositivo).

Luego lee hasta `TOPE_DE_FICHERO` (400.000 bytes, el mismo tope que el parche) y un byte
más para saber si recorta; mira NUL en los primeros 8 KB (D7); decodifica UTF-8 con
`TextDecoder(…, { fatal: true })` y cae a latin1 si lanza.

`.xonecode` ya se deniega por el texto de la ruta HTTP en `servidor.ts`; esto es un mensaje
dentro de `POST /accion`, así que la comprobación va en el manejador y no en la ruta.

### El cliente

- `store.ts`: `arbol?: { rutas: string[]; recortado: boolean }` y
  `ficheros?: Record<string, Fichero>` (el nombre de campo queda libre al renombrar el de
  hoy a `revision`). Los dos se tiran cuando `alta` trae otra `sesionActiva` y al caerse
  el cable, exactamente como los parches.
- `App.tsx`: `pedirArbol` al montar la pestaña, y al terminar un turno si la pestaña está
  a la vista, gemelo del `pedirFicheros` de hoy (que pasa a `pedirRevision`). El fichero
  abierto se conserva al re-pedir el árbol; si ya no está en el árbol nuevo, se cierra.
- `arbolDeRutas(rutas)` es una función pura compartida por las dos pestañas
  (`apps/web/src/arbolDeRutas.ts`): de una lista de rutas a un árbol de carpetas y hojas,
  ordenado como llega. Con test.
- `Ficheros.tsx` (nuevo) y `Revision.tsx` (el `Ficheros.tsx` de hoy, renombrado) comparten
  la maqueta de dos columnas y el componente de árbol (`Arbol.tsx`); lo que cambia es qué
  hay en el centro y qué lleva cada hoja.

---

## Errores

- Sin proyecto abierto no existen las pestañas, así que no hay caso.
- El árbol tarda o falla: «Consultando el árbol…» mientras no llega; si el puerto lanza,
  el servidor contesta `arbol` con `rutas: []`, `recortado: false` y `error`, y el cliente
  lo dice en vez de enseñar un proyecto vacío.
- Ruta rechazada por el lector: `fichero` con `error` y el visor lo pinta en su sitio.
  No se distingue entre «no existe» y «no se puede leer» de cara al cliente: el texto es
  «No se puede enseñar este fichero» más el motivo del paso que falló, sin ruta real de la
  máquina.
- Cable caído: las dos pestañas enseñan el aviso de conexión que ya existe y no afirman
  nada de lo que tenían.

---

## Pruebas

- `apps/web/src/numerarParche.test.ts`: dos tramos, solo altas, sin `@@`, nota de fin de
  fichero.
- `apps/web/src/arbolDeRutas.test.ts`: orden carpetas-antes, anidado, ruta única.
- `apps/web/src/tipos.test.ts`: los literales `arbol`, `fichero` y `revision` casan con
  el host; `ficheros` ya no existe como clase.
- `src/web/frontera.test.ts` sigue en verde: nada del cliente importa de `src/`.
- `src/web/servidor/arranque.test.ts`: el lector rechaza `..`, ruta absoluta, `.env`,
  `.xonecode/config.json`, un `.xml` aplanado y un enlace fuera de la raíz; acepta
  `src/app.xne`; marca binario con NUL; marca latin1; recorta a `TOPE_DE_FICHERO`. El
  árbol declara `recortado` al pasar el tope y no lista lo que `puedeLeerRuta` rechaza.
- `apps/web/src/componentes/Pestanas.test.tsx`: cuatro pestañas en el orden de D2, y
  ninguna regla de pestaña vuelve a `Cabecera.module.css`.
- `Revision.test.tsx` (el `Ficheros.test.tsx` de hoy, renombrado): los 8 primeros
  desplegados, el noveno plegado, el total de cabecera, el icono de clase en el árbol.
- `Ficheros.test.tsx` (nuevo): filtro por subcadena, el visor dice binario y latin1, el
  fichero abierto se cierra si desaparece del árbol.
- `Barra.test.tsx` no cambia: las dos hojas nuevas no escriben ningún color literal.

---

## Fuera de alcance, a propósito

Lo que el usuario dejó para otra tanda, para que el plan no lo absorba:

- **El selector «Último turno»** en Revisión. La foto es de la sesión; conservar una ref
  por turno exige decidir cuántas se guardan y qué pasa con ellas al borrar la sesión. La
  cabecera deja el hueco.
- **«Deshacer»**: restaurar el árbol de antes de un turno es una operación destructiva
  sobre el proyecto y merece su propia política, como la subida.
- **La tarjeta en el chat** («Se han editado 3 archivos») con sus botones.
- **Editar** desde el visor. Es de solo lectura.
- **«Commit o push»**: aquí es `/sync subir`, que ya tiene su camino.
- Buscar dentro del contenido de los ficheros (el filtro es por ruta).
