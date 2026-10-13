# Panel en la web móvil de la sesión remota

**Fecha:** 13-10-2026 · **Alcance:** `xonecode` (anfitrión) y `xonecode-server` (paquete `@xone/xonecode-remoto` y web
móvil) · **Estado:** diseño aprobado en el chat, pendiente de plan · **Spec padre:**
`docs/superpowers/specs/2026-10-09-sesion-remota-xonecode-design.md`

## Qué se pide

Que la web móvil no sea solo el chat de la sesión en foco: un pequeño **panel** con el estado de las consolas abiertas y
de las tareas en background, y que desde él se pueda actuar **solo sobre lo que te espera** (opción «c» elegida por el
usuario: «la (c) pero sería bueno ver el estado de las sesiones, no estaría mal tener un dashboard»).

Cambia tres límites de la v1 de la sesión remota: el móvil **ve** otras consolas y las tareas, **aprueba** escrituras de
una consola que no está en foco y **da feedback** a una tarea. Sigue sin poder abrir sesiones, mover el foco, crear,
encolar ni descartar tareas.

## Lo que hay hoy (medido en el código)

- Las consolas vivas son la del **foco** más las que tienen un **turno en vuelo** en segundo plano: una ociosa fuera de
  foco se cierra (`vestibulo.ts#cerrarLasOciosasSalvo`, `#cerrarSiSobra`). Las de tarea no salen en `proyectosAbiertos()`.
- Una aprobación de una consola que no está en foco **no la ve nadie**: sus sumideros se sueltan al mover el foco y la
  tarjeta se emite al vacío hasta el plazo (`MS_DE_ESPERA_POR_OMISION`). Solo `mensajesDeAprobacion()` la devuelve.
- Una `decision` va SIEMPRE a la consola en foco, y en `consolaWeb#recibir` una decisión con ids que no casan
  **rechaza** lo que esa consola tenga pendiente.
- Los ids de aprobación no son únicos entre consolas (son del hilo).
- `ConsolaDeProyecto` no dice si hay una pregunta de texto pendiente; el título y la última actividad salen del índice
  de sesiones (`sesionesDe(raiz)`, `ultimoTurno`).
- No hay un aviso de «nace/termina una aprobación o una pregunta» por consola.
- «Continuar» vive dentro del manejador de `POST /accion`; el feedback llama a `atenderFeedbackDeTarea`.

## Diseño

### Lo que ve el móvil: el mensaje `panorama` (anfitrión → móvil)

```ts
{
  clase: "panorama";
  consolas: Array<{
    id: string;                 // OPACO, por encendido de la sesión remota; nunca la raíz
    proyecto: string;           // nombre (basename de la raíz)
    sesion?: string;            // título; ausente si aún no tiene
    foco: boolean;
    estado: "trabajando" | "esperando-aprobacion" | "esperando-respuesta" | "parada";
    ultimaActividad?: string;   // ISO, del índice; ausente si no consta
    aprobacion?: {              // solo si hay una en vuelo
      pendientes: PendienteDeAprobacion[];
      ficheros: Record<string, string>;
      diffs: Record<string, LineaDeDiff[]>;   // recortados (ver topes)
      recortada?: true;         // se quitaron líneas o diffs para caber
    };
  }>;
  tareas: Array<{
    id: string;                 // el de la tarea (no es una ruta)
    titulo: string;
    proyecto: string;           // nombre
    estado: "nuevo" | "en-proceso" | "requiere-atencion" | "terminada";
    tras?: string;              // id de la anterior de su cadena
    motivo?: string;            // solo con requiere-atencion, recortado
    creada: string;
    acabada?: string;
  }>;
  esperando: number;            // aprobaciones de todas las consolas + tareas en requiere-atencion
}
```

- **Orden de estado**, de más a menos urgente: esperando-aprobacion > esperando-respuesta > trabajando > parada.
- **Topes**: `TAREAS_TERMINADAS_EN_PANORAMA` (las más recientes), `CARACTERES_DE_TITULO`, `CARACTERES_DE_MOTIVO`,
  `LINEAS_DE_DIFF_EN_PANORAMA` por fichero. El panorama entero pasa por `ajustarATope`: si no cabe, primero se quitan
  los diffs (`recortada`), después las tareas terminadas.
- **Cuándo se manda**: al entrar un móvil (solo a él, como el `alta`), y a todos los móviles cuando cambia algo, como
  mucho una vez cada `INTERVALO_DE_PANORAMA_MS` (1 s). Gatillos: flanco de turno de cualquier consola
  (`alCambiarTurno`), cambio de la cola de tareas (`emitirTareas`), nace o termina una aprobación o una pregunta de
  texto en una consola (aviso NUEVO de la consola), cambio de foco (`adjuntar`), y el volcado (título/última actividad).
- **Solo va a los móviles**: no se emite a las pestañas; la sesión remota lo manda por sus sumideros (`difundir`).
- Los ids opacos de consola se reparten por encendido de la sesión remota (mapa raíz → id en el anfitrión); al apagar
  se olvidan.

### Lo que hace el móvil (móvil → anfitrión)

- `decision` gana `consola?: string`. **Con `consola`** se resuelve en el mapa y se entrega a ESA consola, sin tocar el
  foco; si el id no existe o esa consola no tiene aprobación en vuelo, se **descarta** y se informa — nunca se cae a la
  del foco (una decisión equivocada rechazaría lo que la del foco tenga). **Sin `consola`** es la de siempre: la del
  chat, a la consola en foco.
- `feedback { tarea, texto }` (texto no vacío, recortado a `CARACTERES_DE_FEEDBACK`) y `continuar { tarea }`: la MISMA
  función que los botones del escritorio, extraída del manejador de `POST /accion`; solo con la tarea en
  `requiere-atencion` (si no, se descarta y se informa).
- Lo demás no existe: ni abrir, ni mover el foco, ni crear/encolar/descartar/terminar tareas, ni «Arrancar ahora».
- Una pregunta de texto en una consola **fuera** de foco se enseña («esperando tu respuesta — contéstala en el
  escritorio») pero no se contesta desde el panel: su contexto es el chat de esa consola.

### La web móvil

- Dos pestañas abajo: **Chat** (lo de hoy) y **Panel**. La de Panel lleva una **insignia** con `esperando` cuando es
  mayor que cero. Sin `panorama` recibido (un anfitrión viejo) la pestaña Panel no se pinta.
- Panel, de arriba abajo: **Te esperan** (tarjetas de aprobación de cada consola con su diff y Aceptar/Rechazar; tareas
  en `requiere-atencion` con su motivo, un campo de feedback y «Enviar» / «Continuar»; preguntas fuera de foco, solo
  aviso), **Consolas** (una fila por consola: proyecto · sesión, estado con su color, hace cuánto), **Tareas** (en
  proceso, en cola —con «tras …»— y las últimas terminadas).
- La tarjeta de aprobación del panel reutiliza la de hoy; contestar la cierra en local por el mismo camino que la del
  chat (`contestado`, una sola copia del estado) hasta que el siguiente `panorama` lo confirme.

### El paquete

- `MensajeDelAnfitrion` gana `panorama`, validado y RECONSTRUIDO a fondo (como `aprobacion`); `MensajeDelMovil` gana
  `consola?` en `decision`, `feedback` y `continuar`, validados igual que los de hoy.
- **El protocolo sigue en `v` 1**: todo lo nuevo es una clase o un campo opcional. Una web vieja ignora `panorama`; un
  anfitrión viejo rechaza las clases nuevas del móvil (y la web nueva no ofrece el panel sin `panorama`).
- xonecode no valida con el paquete sino con `core/remoto.ts`; los dos validadores se mantienen alineados por tests.

## Seguridad y límites

- La URL ya era la llave de la sesión en foco; ahora también aprueba escrituras de **cualquier consola abierta** y da
  feedback a las tareas. Se declara.
- Salen de la máquina (cifrados de punta a punta), además de lo de hoy: nombres de proyecto, títulos de sesión, títulos
  y motivos de tareas, y los diffs de las aprobaciones de las consolas fuera de foco. Los ids de consola son opacos; la
  raíz nunca cruza. Un `motivo` es texto del anfitrión y puede nombrar una ruta (igual que un acto): se recorta y se
  declara.
- El nombre de proyecto es el `basename` de la raíz: el mismo nombre en dos entornos se confunde (límite ya declarado
  en `enUso`).
- Las consolas de tarea no aparecen como consolas: se ven como tareas.

## Pruebas

- Paquete: validación de `panorama` (reconstruye, rechaza formas malas, no deja pasar campos), de `decision` con
  `consola`, de `feedback` y `continuar`.
- xonecode, puro: `componerPanorama` (orden, topes, recorte por tamaño, sin raíces), `validarEntradaDelMovil`.
- xonecode, por `montarRutas` real: el móvil recibe el panorama al entrar y al cambiar algo (con el intervalo), no lo
  recibe ninguna pestaña; una `decision` con `consola` llega a una consola que NO está en foco y no toca la del foco; un
  id desconocido no rechaza nada; `feedback`/`continuar` con tarea en `requiere-atencion` y sin ella.
- Web: reductor, pestañas, insignia, tarjetas, feedback; e2e con el anfitrión falso mandando un `panorama` y
  comprobando la `decision` con `consola` y el `feedback`.
- Cruzada real: dos consolas (una en foco, otra trabajando en segundo plano en modo supervisado hasta pedir una
  escritura), aprobarla desde el panel del móvil y ver el fichero escrito; dar feedback a una tarea aparcada.
