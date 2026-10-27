# Dispositivos

Trozo del mapa de la raíz (`CLAUDE.md`); el porqué medido, en `docs/DECISIONES.md`. Ante una
discrepancia, **el código manda**.

`core/dispositivos.ts`, `agent/dispositivos/dispositivosEnMaquina.ts`, `instalacionEnMaquina.ts`.

- **`xcode-select -p` ANTES de cualquier `xcrun`** (si no, diálogo de instalación).
- **Cinco estados por herramienta**: ok, no encontrada, falló (UNA línea), no aplica, desactivada. La RUTA se queda en el host.
- **Es una FOTO con hora, sin sondeo**: al conectar el primer cliente, en «Refrescar», al volver a la ventana y **cuando adb AVISA** (`vigiaDeAdb.ts`, `adb track-devices`, `OpcionesDeMontaje.vigilarDispositivos`): una conexión callada hasta que cambia la lista, agrupada (`PAUSA_DEL_VIGIA_MS`), relanzada si adb muere (`REINTENTOS_DEL_VIGIA_MS`); el primer bloque es la lista de ahora. Un aviso a mitad de una medida mide OTRA vez al acabar (`remedirAlAcabar`). Ejecutar repide el veredicto cuando cambia la HUELLA de lo que está a mano. Tope propio (`TOPES_MS`); un cuelgue es «no respondió». **Límites**: iOS no avisa; un vigía en marcha no se para al apagar Android en Ajustes (la medida sí lo respeta).
- **Apagar un destino deja de LANZAR procesos**, no esconde filas.
- **«Nuevo emulador» parte de uno existente** (`core/copiaDeAvd.ts`, `#crearAvd`/`#clonarAvd`): sin casilla, AVD vacío con la config de la base; con ella, CLON con la base apagada, decidido por el SERVIDOR contra la última medida. Lo que lleva rutas no se copia salvo `snapshots/` (identidad reescrita); el `.ini` del clon, AL FINAL.
- **Eliminar un AVD** (`#borrarAvd`, `arranque.ts#atenderEliminarEmulador`, `EliminarEmulador.tsx`): mismo cerrojo (`receta: "borrar-avd"`). **Nunca el ÚLTIMO ni uno EN MARCHA** (`baseEnMarcha`); el cliente repite la regla (`motivoParaNoEliminarAvd`). Confirmar escribiendo el nombre; al acabar, `quitarAjustesDeAvd`. La procedencia (`copiaDe`, `clon`) se pinta; ausente, nada.
- **Guardar en el editor puede RECARGAR en el aparato, TRANSPARENTE para el guardado** (`core/recargaEnCaliente.ts`, `recargaEnAparato.ts`, `arranque.ts#atenderRecarga`, `recargaCableada`; solo con un Android ELEGIDO): `ficheroGuardado` va PRIMERO. Colección en caliente, JS por su include, CSS con `loadCssFile` del canal (si `Unknown command`, `appData.unloadCssFile` + `loadCssFile` + `refresh`; si no, relanza); `app.ini`/`app.xml`/mappings RELANZAN. Túnel con el puerto de SU AVD. **`loadCollection` recibe UTF-8 con prólogo UTF-8** (`xmlParaCargarEnMemoria`); a disco, bytes tal cual. **Límites**: solo Android; `.js` Latin-1 sin medir; otra sesión sobre el MISMO aparato no se ve.
- **El framework de Android se INSTALA desde XoneCode, y sale de byXOneDownloads**
  (`core/byxone.ts`, `core/frameworkLocal.ts`, `core/manifiestoApk.ts`, `agent/dispositivos/byxoneEnRed.ts`,
  `frameworkEnDisco.ts`, `servicioDeFramework.ts`, `instalacionDeFramework.ts`, `componentes/InstalarFramework.tsx`).
  Tres puertas —«Framework…» en Ajustes → Dispositivos, «Instalar framework» junto a la falta en Ejecutar
  (`lanzable.sinFramework`, un DATO y no la frase) y la tool `instalar_framework`— y UNA instalación, por el
  MISMO cerrojo de la máquina que recetas y AVD (`receta: "instalar-framework"`).
  - **Cada petición va FIRMADA** (HMAC-SHA256 sobre método, ruta CON query, segundos, nonce y sha del cuerpo
    —vacío también—), un nonce nuevo por intento. La credencial es de un COMPONENTE y va EMPAQUETADA
    (`dist/byxone.json`, la escribe el build desde `BYXONE_*_DE_BUILD`, `scripts/credencialByxone.mjs`); el
    entorno y `~/.xonecode/byxone.json` mandan sobre ella, y uno personal roto se dice, no cae. **Es el ÚNICO
    secreto compartido** y por eso es de solo `list,download` (`xcode-read`): lo empaquetado es público.
    Nunca cruza el cable ni llega a la shell del agente. Para quien empaqueta: `docs/EMPAQUETAR-Y-SECRETOS.md`.
  - **Lo descargado se queda en `~/.xonecode/frameworks/`, con el sha256 como nombre** y su ficha en
    `indice.json`: una revisión del catálogo conserva el título y cambia el fichero. Se baja a un temporal y
    solo se queda con el sha y el tamaño de la ficha y el paquete legible. **Lo local manda**: la preferida es la
    local más nueva (orden por segmentos, `v5.0.5.10` > `v5.0.5.8`), se instala sin red ni credencial, y el
    catálogo se ofrece detrás.
  - **Lo que se instala sale de la ÚLTIMA lista servida a ese aparato** (`eleccionServida`, en el servidor):
    del cable vuelve un sha o un id de fichero, nunca una URL.
  - **El paquete se lee del manifiesto BINARIO del APK antes de `adb`**: otro flavor quedaría al lado del
    estándar. `adb install -r -g`, **nunca desinstalar** (borraría los datos de las apps); `-d` solo a propósito.
  - **La tool pide aprobación con SU tarjeta** (`PendienteDeAprobacion.dispositivo`, `PROPIAS_DEL_APARATO`): no es
    una escritura del proyecto. En autónomo se aplica y se dice; en una tarea, solo si NO hay que descargar
    (crearla no autoriza bajar nada), y si no, aparca. Llega por un puerto (`InstaladorDeFrameworkPort`) que el
    servidor monta sobre su cerrojo y enlaza TARDE (`instaladorDeFrameworkTardio`, como los conectores). Parar
    corta la descarga y el `adb` con la señal del TURNO: el adaptador de las propias no pasa ninguna. Se le dice
    CUÁNDO usarla junto a su lista de tools (`USO_DE_INSTALAR_FRAMEWORK`), solo si la tiene.
  - **Ninguna ruta de la máquina viaja en el progreso**: `adb` repite la del APK al fallar, y se cambia por el
    nombre de la versión antes de salir. Un error del disco al descargar se escucha (sin oyente tumbaría el
    servidor) y vuelve como motivo.
  - Los scripts de despliegue y reinicio dicen `FRAMEWORK_AUSENTE` ANTES de esperar al servidor del framework.
  - **«Actualizar framework» en Ejecutar es un DATO del veredicto** (`lanzable.frameworkMasNuevo`, `core/frameworkLocal.ts#actualizacionDisponible`): posterior solo por NÚMEROS y con los dos títulos entendidos (`esVersionPosterior`; `rel` sobre `dev` de la misma cifra no es actualizar). Sale de las locales y de la última foto del catálogo; pasada `VIGENCIA_DEL_CATALOGO_MS` se pide otra EN SEGUNDO PLANO y, si cambia la respuesta, se vuelve a medir. El selector se abre con ESA versión elegida (`inicial`), no con la recomendada, que puede ser más vieja.
  - **Límites declarados**: la forma de un item del catálogo no está en la guía del servicio (se aceptan las dos
    grafías y lo que no encaja se descarta); la tool solo existe en la web; entre la tarjeta y la ejecución la
    copia local puede cambiar; byXOne no sabe qué persona descarga.
- **Ejecutar tiene dos «Copiar…» al lado, y son el MISMO lanzamiento con otro `modo`**
  (`PeticionDeLanzamiento.modo`, `{clase:"lanzarApp", modo}`; un `modo` desconocido es 400): copian y
  RELANZAN. «Copiar todos» es el recorrido de Ejecutar. **«Modificados» se mide contra el APARATO, no
  contra git** (`core/comparacionConAparato.ts`, `agent/dispositivos/comparacionEnAparato.ts`, fase
  `comparando`): CRC32 por `getFileChecksum`, como `xone-recargar-android`, sobre lo que `viaja` en el
  paquete, y el ZIP lleva solo lo distinto (`empaquetarProyecto` con `solo`, que recorta y nunca amplía).
  Lo que el aparato no tiene se persigue uno a uno por su `ENOENT` hasta `TOPE_DE_NUEVOS`, y entonces
  manda a copiar todos. Nada distinto acaba bien SIN subir ni relanzar; no poder comparar es `fallo` sin
  subir nada.
- **Listar y VERIFICAR son dos preguntas**; **la MEDIDA manda sobre el código de salida**.
- **Se ejecuta lo que falla RÁPIDO** (`sudo` sin TTY). **Se mata el GRUPO** (`detached: true` + `kill(-pid)`).
- **Ningún comando lleva una ruta de la máquina** (`$(brew --prefix)`); licencias con un clic que lo DICE.
- **El silencio es el síntoma** (`TOPE_SIN_SALIDA_MS`, 5 min). Un trabajo a la vez por máquina.
- **El dispositivo de la sesión guarda la FOTO**, no solo el id; lo leen Ejecutar y el `device-controller` por FICHERO (`core/dispositivoDeSesion.ts`, `XONECODE_DISPOSITIVO`) en CADA ejecución. Sin elección, emulador antes que físico. **Sesión NUEVA (también de TAREA) nace con `settings.json#dispositivoPorDefecto`**, sin autorizar nada; una reabierta conserva el suyo.
- **El puerto del túnel es del AVD** (`core/puertosDeAvd.ts`, copia atada por test en `skills/xone-hotswap/lib/dispositivo.mjs` y `apps/web/src/reglasDeAvd.ts`): el servidor FIJA uno por AVD al medir (`atenderDispositivos`, `asignarPuertosPendientes`, `guardarPuertosAsignados`), solo AÑADE, siembra también con UNO, para que el primero conserve el de siempre. **Un FÍSICO tiene el suyo por serie** (`asignarPuertosDeFisicos`, `settings.json#dispositivos.fisicos`, `puertoDeFisico`).
- **Antes de usar el túnel se comprueba DE QUIÉN es** (`lib/dispositivo.mjs#asegurarTunel`, `adb forward --list`): de otro, sale con 2 y lo dice; de nadie, lo repone. Ejecutar y la recarga lo reponen sin mirar (límite). `emulator-*` sin AVD cae al de siempre y lo DICE. Mismo `--serie` en todos los scripts. **`adb forward` del agente se RECHAZA** (`motivoDeComandoRechazado`); `adb reverse` no (no toca puertos locales).
- **Crear un AVD va por el MISMO corredor y cerrojo** (`crearAvd`); «sin ventana» = `-no-window -no-audio -no-metrics`, por eso existe «Parar» (`Ajustes.tsx`, `CrearEmulador.tsx`).
- **Límites**: framework fuera de sitio (dos APK) no se persigue; `enUso` (`PastillaDeDispositivo.tsx`, `Ejecutar.tsx`) mira las consolas de persona y, con su TÍTULO, las de TAREA en marcha (`tarea`, IXCODE-58; se reemite al cambiar las tareas); al abrir o cerrar una de persona no se refresca, y va por `basename(raiz)` (mismo nombre en dos entornos se confunde).
- **La GRANJA de dispositivos XOne** (`core/granja.ts`, `granjaEnDisco.ts`, `granjaEnRed.ts`, `arranque.ts#ajusteDeGranjaCableado`,
  `AjustesDeGranja.tsx`): dirección y huella en `settings.json#granja`, el token en `~/.xonecode/granja.json` (0600, nunca al
  cable ni a la shell). **Origen = el del PROYECTO si lo dice, si no el GLOBAL** (`origenEnVigor`: la granja como aparato
  por omisión de Ajustes → General), como el modo de escritura: el del proyecto se fija en el panel → Resumen o en la
  pastilla del chat (`config.json#origenDeDispositivos`, `local` también se escribe; quitarlo vuelve al global). **El certificado
  autofirmado se fija por HUELLA antes de mandar el token** (TLS abierto a mano; con `agent: false` Node IGNORA
  `createConnection`, medido). Con la granja, el aparato de la sesión es `DISPOSITIVO_DE_GRANJA` (`dispositivoSegunOrigen`; un
  iPhone se queda). **La COPIA se pide al primer uso y se libera al acabar el turno** (`releDeGranja.ts`, `core/canalDeGranja.ts`):
  un relé en loopback por sesión (`ws://127.0.0.1:<p>/granja/<clave>/hotswap`, en el fichero del aparato como `canal`) coge una
  copia libre en la primera conexión (medido: conectarse a la puerta COGE la copia) y mantiene UNA conexión hacia la granja
  (una segunda ECHA a la primera; sin conexión, a los diez minutos la granja la libera y la BORRA), repartiendo las
  respuestas en orden FIFO. `reset` en el `finally` del turno (`vestibulo.alAcabarTurno`) y al cerrar la consola.
  `file_upload`/`file_download`/`screenshot`/`restart` van por el mismo relé. **Todo sin adb** (`skills/xone-hotswap/lib/granja.mjs`):
  desplegar = subir el ZIP **con `bd/`** (la copia empieza VACÍA en cada turno; `empaquetarProyecto({conBase})`) + `launchApplication`,
  sin reiniciar; captura por la API (JPEG, con diálogos); log por `getLog` (solo de esa copia; su `exception` trae un aviso falso
  cuando no hay, `excepcionDeGetLog`); reiniciar = `restart` y reintentar el lanzamiento (sin el ancla, `Permission Denial`).
  Ejecutar usa `lanzamientoEnGranja.ts` (veredicto con `granja`, sin aparato ni framework) y la recarga al guardar va por el
  canal solo si la sesión YA tiene copia. Una copia abierta sin saludo ya es nuestra: se apunta y se reintenta.
  **Skill `xone-granja`** (`skills/xone-granja/`): en un proyecto con granja SUSTITUYE a `xone-hotswap`
  (`core/granja.ts#skillsSegunOrigen`, aplicada en `sesionTrueforge.ts#especialistas` con `origenEnDisco.ts`; deepagents
  no). Sus scripts llevan los MISMOS nombres y REENVÍAN a los de `xone-hotswap` (`lib/reenvio.mjs`): una sola lógica.
- **Con una tarea trabajando, Ejecutar sube LO TERMINADO** (`sesionGit.ts#exportarLoTerminado`, IXCODE-58): el árbol del commit anterior al primero que selló la tarea desde que empezó (o `HEAD`), exportado a una carpeta temporal con un índice privado; nunca el disco a medias. El veredicto lo dice antes (`lanzable.origen`); si no se puede separar, falla diciéndolo.
