# Dispositivos

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# Dispositivos

`core/dispositivos.ts`, `agent/dispositivos/dispositivosEnMaquina.ts`,
`agent/dispositivos/instalacionEnMaquina.ts`.

- **`xcode-select -p` ANTES de cualquier `xcrun`**: sin herramientas de desarrollo, `xcrun`
  levanta el diálogo de instalación.
- **Cinco estados por herramienta, no un booleano**: ok, no encontrada, falló (UNA línea de
  motivo), no aplica (iOS fuera de macOS), desactivada. La RUTA se queda en el host.
- **Es una FOTO con hora, no un estado en vivo, y no hay sondeo**: al conectar el primer cliente y
  al pulsar «Refrescar». Tope propio (`TOPES_MS`); un cuelgue se dice «no respondió».
- **Apagar un destino deja de LANZAR procesos**, no esconde filas.
- **«Nuevo emulador» parte de uno existente** (`core/copiaDeAvd.ts`, `instalacionEnMaquina.ts#crearAvd`/`#clonarAvd`): sin la casilla, un AVD vacío con la configuración de la base (vale con ella encendida); con ella, se CLONA la carpeta y la base tiene que estar apagada, y lo decide el SERVIDOR contra la última medida. Lo que lleva rutas del original no se copia, salvo `snapshots/` (con la identidad reescrita: sin ella el clon pierde lo no volcado al disco), y el `.ini` del clon se escribe AL FINAL.
- **Un AVD se ELIMINA desde Ajustes, y de él se recuerda de dónde salió** (`instalacionEnMaquina.ts#borrarAvd`,
  `arranque.ts#atenderEliminarEmulador`, `EliminarEmulador.tsx`): por el MISMO cerrojo que crear
  (`receta: "borrar-avd"`), con el nombre ya comprobado contra la última medida. **Nunca el ÚLTIMO** —es la base
  de las copias— **ni uno EN MARCHA** (el criterio de `baseEnMarcha`); la negativa del servidor no llega al
  navegador, así que el cliente aplica las mismas (`motivoParaNoEliminarAvd`) y no deja pulsar. La confirmación es
  la de `BorrarCopiaLocal`: escribir el nombre. Al acabar BIEN se quitan sus ajustes (`quitarAjustesDeAvd`) y su
  puerto queda libre. La procedencia (`copiaDe`, y `clon` si se copió lo instalado) se guarda al crear desde «Copia
  de» y se pinta en la fila; ausente es un AVD de antes o creado fuera, y no se pinta nada.
- **Guardar en el editor puede RECARGAR en el aparato, y es TRANSPARENTE para el guardado**
  (`core/recargaEnCaliente.ts`, `agent/dispositivos/recargaEnAparato.ts`, `arranque.ts#atenderRecarga`,
  casilla y «Probar» en la cabecera del editor, solo con un Android ELEGIDO en la sesión): el servidor
  contesta `ficheroGuardado` PRIMERO y la recarga va aparte, sin aparato o sin app se guarda igual y la
  cabecera lo dice en gris. Colección en caliente, JS por su include, **CSS en caliente con el comando
  `loadCssFile` del canal** (5.0.5.7dev en adelante; en uno anterior, que contesta `Unknown command`,
  `appData.unloadCssFile` + `loadCssFile` por `runScript` y un `refresh`; si nada aplica, se relanza); `app.ini`/`app.xml`/mappings RELANZAN la app solos. El túnel se reaplica con el puerto de SU AVD; la composición va
  extraída (`recargaCableada`). **`loadCollection` recibe UTF-8 con el prólogo diciendo UTF-8**
  (`xmlParaCargarEnMemoria`), medido: con los bytes Latin-1 cada tilde salía doble; a disco van los
  bytes tal cual. «Probar» sin la app corriendo lanza el despliegue de Ejecutar. **Límites declarados**:
  solo Android; un `.js` Latin-1 sin medir; otra sesión o el agente sobre el MISMO aparato no se ven.
- **Listar y VERIFICAR son dos preguntas**: `adb devices` puede contestar «device» de un teléfono
  colgado; verificar ejecuta algo al otro lado.
- **«Terminó bien» y «ya está» son dos cosas**: la MEDIDA manda sobre el código de salida.
- **Se ejecuta lo que puede fallar RÁPIDO, no lo que no pide contraseña**: `sudo` sin TTY falla con
  código 1 rápido.
- **Se mata el GRUPO, no el hijo** (`detached: true` + `kill(-pid)`): un nieto sobrevive a
  `child.kill()`.
- **Ningún comando lleva una ruta de la máquina** (`$(brew --prefix)`). Las licencias se aceptan
  con un clic que lo DICE, nunca escribiendo ficheros a mano.
- **El silencio es el síntoma, no la lentitud** (`TOPE_SIN_SALIDA_MS`, 5 min). Un trabajo a la vez
  para toda la máquina.
- **El dispositivo de la sesión guarda la FOTO, no solo el id**, y solo si NO está a mano ahora. La
  consume Ejecutar y, por un FICHERO (`core/dispositivoDeSesion.ts`, `XONECODE_DISPOSITIVO`), el
  `device-controller`: los scripts de `xone-hotswap` lo leen en CADA ejecución. Sin elección, un
  emulador antes que un físico. **Una sesión NUEVA nace con el aparato por defecto** (IXCODE-51,
  `settings.json#dispositivoPorDefecto`, Ajustes → General → Conversaciones nuevas), también la de
  una TAREA —a diferencia del modo, no autoriza nada—; una reabierta conserva el suyo. Es la FOTO: un
  móvil desenchufado al abrir sigue elegido y Ejecutar lo dice, en vez de pasarse a otro.
- **El puerto del túnel es del AVD, no fijo** (`core/puertosDeAvd.ts`, copia en
  `skills/xone-hotswap/lib/dispositivo.mjs` atada por test, igual que las banderas de «sin ventana»
  y las reglas de nombre y puerto del cliente, `apps/web/src/reglasDeAvd.ts`): con un solo AVD, el de
  siempre; con dos o más, el servidor FIJA uno a cada AVD al medir (`atenderDispositivos`, con
  `asignarPuertosPendientes` y `guardarPuertosAsignados`; `emuladoresCableados` solo la cablea),
  solo AÑADE y nunca reasigna. La siembra ocurre también con UN AVD, en silencio (la UI no enseña el
  campo con uno), para que el primero conserve el de siempre cuando llegue otro. Dentro del aparato
  el framework escucha siempre en el mismo. **Un móvil FÍSICO también tiene el suyo, por su serie**
  (IXCODE-32, `asignarPuertosDeFisicos`, `settings.json#dispositivos.fisicos`, sembrado tras los AVD y
  releyendo): iba al de siempre, que es el del primer AVD, y la sesión del móvil acababa hablando con
  el emulador sin error. Sin sembrar, el primero libre (`puertoDeFisico`), el mismo que la siembra le
  daría. **Y antes de usar el túnel se comprueba DE QUIÉN es** (`lib/dispositivo.mjs#asegurarTunel`,
  `adb forward --list`): comprobar la serie no basta, porque la tabla de forwards es de toda la
  máquina. Si es de otro aparato, el script sale con 2 y dice cuál, sin quitárselo; si no es de nadie,
  `xone-hotswap` lo vuelve a poner. Ejecutar y la recarga al guardar reponen el forward sin mirarlo
  (límite declarado, con los demás en `docs/DECISIONES.md`). Si una
  serie `emulator-*` no resuelve su AVD, los scripts caen al de siempre y lo DICEN por stderr. A
  `xone-hotswap` se le pasa el MISMO `--serie` que a desplegar/reiniciar. Un `adb forward` del agente
  se RECHAZA (`motivoDeComandoRechazado`): un túnel a mano le quita el puerto al aparato de otra
  sesión sin error; `adb reverse` no, porque no toca puertos locales. **Crear un AVD va por el MISMO
  corredor y cerrojo que la receta** (`crearAvd`, un trabajo a la vez), y arrancar «sin ventana» es
  `-no-window -no-audio -no-metrics`, que es por lo que existe «Parar» (`Ajustes.tsx`,
  `CrearEmulador.tsx`): un emulador sin ventana no se cierra con la mano. **Límites declarados**: si
  DENTRO del aparato el framework no está donde se espera (dos APK de framework), los scripts no lo
  persiguen y el agente se lo dice a la persona; `enUso` lo pinta la pastilla del chat
  (`PastillaDeDispositivo.tsx`), mira solo las consolas de persona y no se refresca al abrir o cerrar
  una; va por `basename(raiz)`, así que el mismo nombre de proyecto en dos entornos se confunde; las
  negativas del servidor no llegan al navegador, así que el cliente valida con las mismas reglas.
