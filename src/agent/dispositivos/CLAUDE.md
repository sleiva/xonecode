# Dispositivos

Trozo del mapa de la raíz (`CLAUDE.md`); el porqué medido, en `docs/DECISIONES.md`. Ante una
discrepancia, **el código manda**.

`core/dispositivos.ts`, `agent/dispositivos/dispositivosEnMaquina.ts`, `instalacionEnMaquina.ts`.

- **`xcode-select -p` ANTES de cualquier `xcrun`** (si no, diálogo de instalación).
- **Cinco estados por herramienta**: ok, no encontrada, falló (UNA línea), no aplica, desactivada. La RUTA se queda en el host.
- **Es una FOTO con hora, sin sondeo**: al conectar el primer cliente y en «Refrescar». Tope propio (`TOPES_MS`); un cuelgue es «no respondió».
- **Apagar un destino deja de LANZAR procesos**, no esconde filas.
- **«Nuevo emulador» parte de uno existente** (`core/copiaDeAvd.ts`, `#crearAvd`/`#clonarAvd`): sin casilla, AVD vacío con la config de la base; con ella, CLON con la base apagada, decidido por el SERVIDOR contra la última medida. Lo que lleva rutas no se copia salvo `snapshots/` (identidad reescrita); el `.ini` del clon, AL FINAL.
- **Eliminar un AVD** (`#borrarAvd`, `arranque.ts#atenderEliminarEmulador`, `EliminarEmulador.tsx`): mismo cerrojo (`receta: "borrar-avd"`). **Nunca el ÚLTIMO ni uno EN MARCHA** (`baseEnMarcha`); el cliente repite la regla (`motivoParaNoEliminarAvd`). Confirmar escribiendo el nombre; al acabar, `quitarAjustesDeAvd`. La procedencia (`copiaDe`, `clon`) se pinta; ausente, nada.
- **Guardar en el editor puede RECARGAR en el aparato, TRANSPARENTE para el guardado** (`core/recargaEnCaliente.ts`, `recargaEnAparato.ts`, `arranque.ts#atenderRecarga`, `recargaCableada`; solo con un Android ELEGIDO): `ficheroGuardado` va PRIMERO. Colección en caliente, JS por su include, CSS con `loadCssFile` del canal (si `Unknown command`, `appData.unloadCssFile` + `loadCssFile` + `refresh`; si no, relanza); `app.ini`/`app.xml`/mappings RELANZAN. Túnel con el puerto de SU AVD. **`loadCollection` recibe UTF-8 con prólogo UTF-8** (`xmlParaCargarEnMemoria`); a disco, bytes tal cual. **Límites**: solo Android; `.js` Latin-1 sin medir; otra sesión sobre el MISMO aparato no se ve.
- **Listar y VERIFICAR son dos preguntas**; **la MEDIDA manda sobre el código de salida**.
- **Se ejecuta lo que falla RÁPIDO** (`sudo` sin TTY). **Se mata el GRUPO** (`detached: true` + `kill(-pid)`).
- **Ningún comando lleva una ruta de la máquina** (`$(brew --prefix)`); licencias con un clic que lo DICE.
- **El silencio es el síntoma** (`TOPE_SIN_SALIDA_MS`, 5 min). Un trabajo a la vez por máquina.
- **El dispositivo de la sesión guarda la FOTO**, no solo el id; lo leen Ejecutar y el `device-controller` por FICHERO (`core/dispositivoDeSesion.ts`, `XONECODE_DISPOSITIVO`) en CADA ejecución. Sin elección, emulador antes que físico. **Sesión NUEVA (también de TAREA) nace con `settings.json#dispositivoPorDefecto`**, sin autorizar nada; una reabierta conserva el suyo.
- **El puerto del túnel es del AVD** (`core/puertosDeAvd.ts`, copia atada por test en `skills/xone-hotswap/lib/dispositivo.mjs` y `apps/web/src/reglasDeAvd.ts`): el servidor FIJA uno por AVD al medir (`atenderDispositivos`, `asignarPuertosPendientes`, `guardarPuertosAsignados`), solo AÑADE, siembra también con UNO, para que el primero conserve el de siempre. **Un FÍSICO tiene el suyo por serie** (`asignarPuertosDeFisicos`, `settings.json#dispositivos.fisicos`, `puertoDeFisico`).
- **Antes de usar el túnel se comprueba DE QUIÉN es** (`lib/dispositivo.mjs#asegurarTunel`, `adb forward --list`): de otro, sale con 2 y lo dice; de nadie, lo repone. Ejecutar y la recarga lo reponen sin mirar (límite). `emulator-*` sin AVD cae al de siempre y lo DICE. Mismo `--serie` en todos los scripts. **`adb forward` del agente se RECHAZA** (`motivoDeComandoRechazado`); `adb reverse` no (no toca puertos locales).
- **Crear un AVD va por el MISMO corredor y cerrojo** (`crearAvd`); «sin ventana» = `-no-window -no-audio -no-metrics`, por eso existe «Parar» (`Ajustes.tsx`, `CrearEmulador.tsx`).
- **Límites**: framework fuera de sitio (dos APK) no se persigue; `enUso` (`PastillaDeDispositivo.tsx`, `Ejecutar.tsx`) mira las consolas de persona y, con su TÍTULO, las de TAREA en marcha (`tarea`, IXCODE-58; se reemite al cambiar las tareas); al abrir o cerrar una de persona no se refresca, y va por `basename(raiz)` (mismo nombre en dos entornos se confunde).
- **Con una tarea trabajando, Ejecutar sube LO TERMINADO** (`sesionGit.ts#exportarLoTerminado`, IXCODE-58): el árbol del commit anterior al primero que selló la tarea desde que empezó (o `HEAD`), exportado a una carpeta temporal con un índice privado; nunca el disco a medias. El veredicto lo dice antes (`lanzable.origen`); si no se puede separar, falla diciéndolo.
