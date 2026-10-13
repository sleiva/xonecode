# El relé y la web móvil, dentro de xonecode

**Fecha:** 13-10-2026 · **Alcance:** `xonecode` (y leer de `xonecode-server`) · **Estado:** diseño aprobado en el chat ·
**Specs padre:** `2026-10-09-sesion-remota-xonecode-design.md`, el túnel ngrok (`plans/2026-10-12-tunel-ngrok.md`)

## Qué se pide

«Que en la instalación sea capaz de desplegar ngrok y el xoneserver local». Elegido: el paquete del relé **viaja dentro
de xonecode** (opción 1 frente a publicarlo aparte con un botón de instalar, o dependencia opcional), y la vía por
omisión pasa a ser «ngrok».

## Lo que hay hoy (medido)

- ngrok se instala desde xonecode (receta de Dispositivos: `brew` en macOS; guía en Windows/Linux) y, con la vía
  «ngrok», encender la sesión remota ya arranca el relé en loopback y ngrok, y el QR lleva la dirección de ngrok.
- El relé y la web móvil viven en `@xone/xonecode-remoto` (repo `xonecode-server`, `packages/remoto`, subrutas `.` y
  `./servidor`, carpeta `web/`). **No está publicado** (404 en npm, `publishConfig.access: restricted`) y xonecode no lo
  declara: se carga por `import()` dinámico de un nombre en variable en UN fichero (`agent/remoto/puenteWebSocket.ts`).
  Hoy solo funciona con un enlace simbólico a mano.
- `xonecode` está publicado en npm (público). Quien lo instala no puede encender la sesión remota.
- El servidor por omisión, `wss://remoto.xone.dev/ws` (`SERVIDOR_REMOTO_POR_OMISION`), **no contesta**: la vía por
  omisión, «servidor», no lleva a ninguna parte.
- Medido con npm 10: una dependencia `file:` listada en `bundleDependencies` entra ENTERA en el tarball de `npm pack`
  aunque en desarrollo sea un enlace simbólico, y `npm i -g` del tarball la deja en el `node_modules` del paquete.

## Diseño

### 1. Cómo viaja

- Una copia CONSTRUIDA del paquete vive en el repo: `vendor/xonecode-remoto/` (`package.json`, `dist/`, `web/`; unos
  340 KB), más `vendor/xonecode-remoto/origen.json` con el commit de `xonecode-server` del que sale y si el árbol estaba
  sucio.
- `package.json` de xonecode: `"@xone/xonecode-remoto": "file:vendor/xonecode-remoto"` en `dependencies` y el nombre en
  `bundleDependencies`. `npm pack`/`npm publish` lo meten dentro; `npm i -g xonecode` lo trae. Su dependencia (`ws`) ya
  la tiene xonecode.
- **El cargador no cambia**: sigue siendo el `import()` dinámico por nombre en un fichero, y apagada la sesión remota el
  paquete sigue sin cargarse. Lo que cambia es la frase «no es dependencia de xonecode».
- Descartado: copiar a `dist/` en el build e importar por ruta relativa (toca el cargador y la regla del nombre en un
  fichero); publicarlo aparte (depende de npm y de permisos de la organización); dependencia opcional (mismo problema, y
  su fallo es mudo).

### 2. Cómo se actualiza

- `npm run remoto:traer` (`scripts/traerRemoto.mjs`): construye `xonecode-server` con su `npm test` (que compila el
  paquete y copia la web), y copia `packages/remoto/{package.json,dist,web}` a `vendor/xonecode-remoto/` sustituyendo la
  copia entera, con su `origen.json`. La carpeta de `xonecode-server` sale de `XONECODE_SERVER_DIR` o, por omisión, la
  hermana `../xonecode-server`. Si no está o sus tests fallan, no toca `vendor/`.
- Un test en `npm test` comprueba que la copia está ENTERA y bien declarada: nombre, `exports` con `.` y `./servidor`,
  los ficheros a los que apuntan, `web/index.html`, `origen.json`, y que `package.json` la declara en `dependencies` y
  en `bundleDependencies`. Sin red ni el otro repo.
- **Límite declarado**: que la copia esté AL DÍA con `xonecode-server` no se puede comprobar sin el otro repo; lo dice
  `origen.json`.

### 3. Arrancar: la vía por omisión es ngrok

- `remotoEnVigor`: sin `via` en `settings.json`, la vía es «ngrok»; **salvo** que `remoto.servidor` esté puesto a mano,
  que mantiene «servidor» (quien lo escribió quiere su servidor). Un `via` explícito manda siempre.
- Ajustes → Sesión remota: «Túnel local (ngrok)» va primero. El texto de «Servidor de XOne» deja de decir «no necesitas
  instalar nada» como si funcionara: dice que necesita un servidor del relé publicado.
- Instalar ngrok sigue siendo la receta; encender sigue arrancando relé + ngrok solos.

### 4. Documentación

CLAUDE.md («La sesión remota»): el paquete viaja dentro (`vendor/`, `bundleDependencies`, `remoto:traer`), la vía por
omisión, y el límite de la copia al día. DECISIONES.md: el porqué y la medida de `npm pack`.

## Pruebas

- `npm test`: la copia vendorizada entera y declarada; `remotoEnVigor` con y sin `via`/`servidor`; Ajustes con el orden
  y los textos.
- Verificación del empaquetado (fuera de `npm test`, apuntada en el plan): `npm pack` lista
  `node_modules/@xone/xonecode-remoto/dist/servidor/servidor.js` y `.../web/index.html`; instalado el tarball en un prefijo
  temporal, el xonecode instalado resuelve `@xone/xonecode-remoto` y `@xone/xonecode-remoto/servidor`.
- Prueba real: el xonecode instalado desde el tarball enciende la sesión remota por ngrok (vía por omisión) y el QR/URL
  sirve la web móvil; con `settings.json` respaldado y restaurado.

## Seguridad y límites

- El código del relé y de la web móvil pasa a publicarse con xonecode (público en npm). Aceptado al elegir la opción 1.
- La copia puede quedarse vieja respecto a `xonecode-server`; `origen.json` dice de dónde sale.
