# El relé dentro de xonecode — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers-extended-cc:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** que `npm i -g xonecode` traiga el relé y la web móvil (`@xone/xonecode-remoto`) y que, tras instalar ngrok,
encender la sesión remota funcione sin más, con la vía «ngrok» por omisión.

**Architecture:** copia construida del paquete en `vendor/xonecode-remoto/`, declarada como dependencia `file:` y en
`bundleDependencies`; el cargador por `import()` dinámico no cambia. Un script la trae de `xonecode-server`. La vía por
omisión pasa a «ngrok» salvo con `remoto.servidor` puesto a mano.

**Tech Stack:** Node 22, npm 10 (`bundleDependencies`), TypeScript, React (Ajustes), vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-rele-dentro-de-xonecode-design.md`

## Global Constraints

- `npm test` sin red, sin el repo `xonecode-server` y sin cargar el paquete (los tests del puente siguen con dobles).
- El nombre `@xone/xonecode-remoto` sigue en UN fichero de `src/` (`agent/remoto/puenteWebSocket.ts`; su test lo
  vigila). Fuera de `src/` (package.json, script, test de la copia) puede aparecer.
- Apagada la sesión remota, el paquete no se carga (el `import()` sigue siendo perezoso).
- Un `via` explícito en `settings.json` manda siempre; con `remoto.servidor` puesto y sin `via`, sigue «servidor».
- CLAUDE.md sin fechas, recuentos ni duraciones sueltas (`documentacion.test.ts`).
- Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01SF55UskepprwaEuqEF2PMm`; stage por rutas explícitas; sin push; el
  `package-lock.json` SÍ entra cuando cambia por la dependencia nueva (y solo entonces).

**User decisions (already made):**
- «la 1, dentro de xonecode» — el paquete viaja dentro de xonecode (y por tanto se publica con él).
- Vía por omisión «ngrok» (aprobado en el chat: «sí, escribe la spec y el plan»).

## Rulings del controlador

- Carpeta `vendor/xonecode-remoto/` en la raíz del repo (no `src/vendor/`, que es código TS propio con tests).
- `origen.json` junto a la copia: `{ commit, sucio }` de `xonecode-server`.
- Rama `rele-dentro` en un worktree `.claude/worktrees/rele-dentro`.

---

### Task 1: la copia vendorizada, su script y su declaración

**Goal:** `vendor/xonecode-remoto/` con el paquete construido, `npm run remoto:traer`, y `package.json` que la declara y
la empaqueta.

**Files:** `scripts/traerRemoto.mjs` (nuevo), `vendor/xonecode-remoto/**` (generado por el script desde
`/Users/projects/xonecode-server` en `main`), `package.json` (`dependencies`, `bundleDependencies`, script
`remoto:traer`), `package-lock.json`, `src/vendorRemoto.test.ts` (nuevo; vive en `src/` para que lo recoja el proyecto
`host` de vitest y no nombra el paquete en código de producción — si `puenteWebSocket.test.ts` también vigila los
tests, ajustar su lista blanca con el porqué).

**Acceptance Criteria:**
- [ ] `npm run remoto:traer` construye `xonecode-server` (su `npm test`), sustituye `vendor/xonecode-remoto/` entera y
  escribe `origen.json`; con la carpeta ausente o los tests rojos, sale con código ≠ 0 y no toca `vendor/`.
- [ ] `src/vendorRemoto.test.ts`: nombre, `exports` `.` y `./servidor` con sus ficheros existentes, `web/index.html`,
  `origen.json` con `commit`; `package.json` declara la dependencia `file:vendor/xonecode-remoto` y la lista en
  `bundleDependencies`.
- [ ] `npm install` deja `node_modules/@xone/xonecode-remoto` resolviendo a la copia; `npm run typecheck` y `npm test`
  verdes (si algún test del puente asumía que el paquete NO estaba instalado con el importador por omisión, se pasa a
  inyectar el importador: el test no debe depender de si está).
- [ ] `npm pack --dry-run --ignore-scripts --json` lista `node_modules/@xone/xonecode-remoto/dist/servidor/servidor.js`
  y `node_modules/@xone/xonecode-remoto/web/index.html` (salida pegada en el informe).

**Verify:** `npm run typecheck && FORCE_COLOR=0 npm test -- --maxWorkers=2 && npm pack --dry-run --ignore-scripts --json | grep -c xonecode-remoto`

```json:metadata
{"repo":"xonecode","modelTier":"standard","files":["scripts/traerRemoto.mjs","vendor/xonecode-remoto/","package.json","package-lock.json","src/vendorRemoto.test.ts"]}
```

### Task 2: la vía por omisión es ngrok

**Goal:** sin `via`, la sesión remota sale por ngrok (salvo `remoto.servidor` a mano), y Ajustes lo refleja.

**Files:** `src/core/settings.ts` (`remotoEnVigor`), `src/core/settings.remoto.test.ts`,
`apps/web/src/componentes/SesionRemota.tsx` (orden de `VIAS`: ngrok primero; el texto de «Servidor de XOne» ya no dice
«no necesitas instalar nada»: necesita un servidor del relé publicado) y su test.

**Acceptance Criteria:**
- [ ] `remotoEnVigor`: sin ajustes → `via: "ngrok"`; con `servidor` y sin `via` → `"servidor"`; `via` explícito manda.
- [ ] Ajustes: «Túnel local (ngrok)» primero; el texto nuevo de «Servidor de XOne»; tests del cliente verdes.
- [ ] Ningún otro test asumía «servidor» por omisión sin decirlo (los que lo hagan pasan a poner `via` explícito).

**Verify:** `npm run typecheck && FORCE_COLOR=0 npx vitest run src/core src/web apps/web --maxWorkers=2`

```json:metadata
{"repo":"xonecode","modelTier":"standard","files":["src/core/settings.ts","src/core/settings.remoto.test.ts","apps/web/src/componentes/SesionRemota.tsx"]}
```

### Task 3: documentación y prueba real desde el tarball

**Goal:** CLAUDE.md y DECISIONES.md lo cuentan; el xonecode instalado desde su tarball enciende la sesión remota por
ngrok y sirve la web móvil.

**Acceptance Criteria:**
- [ ] CLAUDE.md («La sesión remota»): el paquete viaja dentro (`vendor/`, `bundleDependencies`, `remoto:traer`), la
  carga sigue perezosa, la vía por omisión, el límite de la copia al día (`origen.json`); `documentacion.test.ts` verde.
  DECISIONES.md: el porqué y la medida de `npm pack` (enlace simbólico `file:` empaquetado entero con npm 10).
- [ ] Prueba real: `npm pack` (con su `prepack`), instalado el tarball en un prefijo temporal del scratchpad; desde el
  xonecode instalado se resuelven `@xone/xonecode-remoto` y `/servidor`; con `~/.xonecode/settings.json` respaldado (y
  restaurado idéntico al acabar) y SIN `via`, la consola web del xonecode INSTALADO enciende la sesión remota por ngrok
  (el authtoken de esta máquina ya está configurado; si no, se dice y se para) y la URL/QR sirve la web móvil (Playwright
  a viewport de móvil ve la pantalla de conexión o el chat). Todo parado y limpiado.
- [ ] `npm test` entero verde.

```json:metadata
{"repo":"xonecode","modelTier":"frontier","files":["CLAUDE.md","docs/DECISIONES.md"]}
```
