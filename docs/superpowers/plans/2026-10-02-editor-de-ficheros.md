# Editor de ficheros en la pestaña Ficheros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editar un fichero del proyecto en la pestaña Ficheros con CodeMirror 6, guardarlo directo por el cable con las guardas de ruta de siempre y concurrencia por huella, y ver en el margen qué cambió contra el inicio de la sesión o el último commit.

**Architecture:** El servidor gana una escritura (`escribirFicheroDeProyecto`, junto a la lectura y con el MISMO resolvedor de rutas) y una lectura de git (`baseDeFichero`); el cable, dos mensajes de ida y vuelta (`guardarFichero`/`ficheroGuardado`, `baseDeFichero`), negados por RAÍZ con un turno o una tarea en marcha. En el cliente, el estado de la edición vive en `App` (`usarEdicion.ts`) y no en el editor; el editor (`apps/web/src/editor/`) se carga con `React.lazy`, se pinta con variables CSS y calcula sus marcas con `@codemirror/merge` y una traducción PURA a marcas.

**Tech Stack:** Node 22 (`node:fs/promises`, `node:crypto`, `git` por `execFile`), TypeScript estricto, React 18 + Vite (cliente `apps/web`), CodeMirror 6, vitest 4 (proyectos `host` en `node` y `cliente` en `jsdom`), @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-10-02-editor-de-ficheros-design.md`

## Global Constraints

- **Las MISMAS guardas que leer, reutilizadas, no copiadas:** `resolverEnProyecto` (Task 1) es la única cadena de `motivoDeRutaInaceptable` + vista aplanada + `realpath` dentro de la raíz + recomprobación sobre la ruta real. Leer, escribir y la base pasan por ella.
- **Un rechazo se DEVUELVE** (`{ ruta, error }` / `{ ruta, base, sinBase }`), nunca se lanza. Un fallo de E/S se devuelve con su `code` y nada más.
- **Ninguna ruta de la máquina por el cable ni por `informar`** (`sinRutas`): los errores son frases fijas más, como mucho, el `code` de Node.
- **Huella** = sha256 en hexadecimal de los BYTES del fichero (`huellaDeContenido`). Solo viaja con texto entero (`recortado: false`) en UTF-8.
- **Tope** = `TOPE_DE_FICHERO` (400 000) medido en BYTES (`Buffer.byteLength`), no en caracteres. El cuerpo de `POST /accion` está acotado a `TOPE_DE_CUERPO` (1 000 000, `arranque.ts`); el cliente lo comprueba antes de mandar (`TOPE_DEL_CUERPO_DEL_CABLE`, atado por test).
- **Guardar se niega por RAÍZ** con `vestibulo.motivoParaNoEditar(raiz)`: una consola de persona de esa raíz con turno en vuelo, o una consola de tarea de esa raíz sin cerrar (o con turno en vuelo). Mensajes exactos: `"espera a que termine el turno: el agente está trabajando en este proyecto"` y `"hay una tarea de fondo trabajando en este proyecto: espera a que termine"`.
- **Mensajes del cable, exactos y en los DOS ficheros** (`transporte.ts` y `apps/web/src/tipos.ts`, misma forma de declaración para que `tipos.test.ts` cuadre las listas con duplicados): `{ clase: "guardarFichero"; ruta; texto; huella }`, `{ clase: "baseDeFichero"; ruta; base }` (del cliente); `{ clase: "ficheroGuardado"; ruta; huella?; error? }`, `({ clase: "baseDeFichero" } & BaseDelFichero)` (al cliente). Ningún comentario de esos ficheros escribe la forma `{ clase: "…" }`.
- **Store = lista BLANCA**: `huella` se nombra en `case "fichero"`; `ficheroGuardado` y `baseDeFichero` son `case` propios con cada campo comprobado por tipo. `ultimoGuardado` NO se tira nunca (su `secuencia` es lo que se compara); `bases` se tira con la sesión y sin cable.
- **CodeMirror solo se importa desde `apps/web/src/editor/`**, y a `editor/` solo se llega con `import()` (los `*.test.*` están exentos). Versiones EXACTAS (`--save-exact`) y una sola copia de `@codemirror/state` en el árbol.
- **El tema del editor son variables CSS en `editor/EditorDeFichero.module.css`** con `:global(.cm-…)` y `classHighlighter` (`.tok-*` → `--shiki-token-*`). Nada de `EditorView.theme` con colores: escaparía a `Barra.test.tsx` y a `estilosDelCliente.test.ts`. Solo alias que ya están en el puente: `--dsw-alias-state-business-primary` (cambiada, azul), `--dsw-alias-state-success-primary` (nueva, verde), `--dsw-alias-state-error-primary` (borrado, rojo), `--xonecode-fila-elegida` (selección). Ningún literal de color, `transparent` incluido.
- **Un control sin dato detrás no se pinta:** sin `edicion` en las props de `Ficheros` no hay «Editar»; sin `cambiados`, ninguna `M`.
- **Lo que se pliega se desmonta**: el editor y el visor se sustituyen, nunca se esconden con CSS.
- **El patrón de fallo de este repo**: la composición de producción (`ficherosCableados()`) se prueba contra un temporal REAL, no solo con dobles.
- Comentarios en castellano, con el estilo del fichero que se toca (explican el PORQUÉ). Mensajes de commit en castellano, terminados en estas dos líneas:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Tw4TZtdPn7iWwCCoSoS4X9
  ```
- Cada commit deja `npm run typecheck` en verde y los tests del proyecto tocado en verde. Con la máquina cargada, `--maxWorkers=2`; si fallan tests de `src/cli/tui/*` por color, `FORCE_COLOR=0`. `npm test` no puede necesitar clave, red ni simulador.

**User decisions (already made):**
- Editor: **CodeMirror 6**, no Monaco (Monaco pesa varios MB, necesita workers para no tirar de un CDN y trae IntelliSense de TypeScript que a XOne no le sirve).
- **Guardar es directo, sin tarjeta de aprobación**: lo teclea la persona. Con las guardas de ruta de siempre y **negado mientras un turno o una tarea trabaja en ese proyecto**.
- **Marcas en el margen**: barra **azul** = cambiada, **verde** = nueva, **triángulo rojo** = borrado; al pulsar una se despliega lo de antes con **«Deshacer este cambio»**.
- **Base de comparación**: selector con **«Inicio de la sesión»** por omisión y **«Último commit»** como alternativa.
- **En el árbol**: `M` para lo cambiado en la sesión y `●` para lo no guardado.

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `src/agent/grafo/arbolDeProyecto.ts` (+ test) | `huellaDeContenido`, `resolverEnProyecto` (la cadena de guardas, una sola), `huella` en la lectura, `escribirFicheroDeProyecto` atómica |
| `src/agent/sesiones/baseDeFichero.ts` (nuevo, + test) | la versión de un fichero en la ref de la sesión o en `HEAD`, con las mismas guardas |
| `src/core/settings.ts` (+ test) | `motivoParaNoEditarFichero`: la regla PURA de quién ocupa una raíz |
| `src/web/servidor/vestibulo.ts` (+ test) | `motivoParaNoEditar(raiz)` sobre las consolas vivas |
| `src/web/servidor/transporte.ts` | `huella`, `BaseDelFichero`, los cuatro mensajes |
| `src/web/servidor/arranque.ts` (+ test) | opciones `escribirFichero`/`baseDeFichero`, sus manejadores, el despacho y `ficherosCableados()` |
| `apps/web/src/tipos.ts` | la redeclaración del cliente |
| `apps/web/package.json`, `package-lock.json`, `THIRD_PARTY_NOTICES.md` | CodeMirror 6 con versiones exactas y su aviso MIT |
| `apps/web/src/edicion.ts` (nuevo, + test) | puro: `esEditable`, finales de línea, `cabeEnElCable` |
| `apps/web/src/editor/marcasDeCambio.ts` (nuevo, + test) | trozos de `@codemirror/merge` → marcas cambiada/nueva/borrado, y el cambio de «Deshacer este cambio» |
| `apps/web/src/store.ts` (+ test) | `huella`, `ultimoGuardado`, `bases` |
| `apps/web/src/usarEdicion.ts` (nuevo, + test) | el estado de la edición en `App`: abrir, cambiar, guardar, versión nueva, base |
| `apps/web/src/editor/EditorDeFichero.tsx` + `.module.css` + test (nuevos) | el editor diferido: lenguajes, tema por variables, margen, desplegable, barra de abajo |
| `apps/web/src/editor/jsdomParaElEditor.ts` (nuevo) | lo que jsdom no trae y CodeMirror mide; solo lo importan tests |
| `apps/web/src/componentes/Barra.test.tsx` | la disciplina de colores alcanza también las hojas de `editor/` |
| `apps/web/src/componentes/CambiosSinGuardar.tsx` + test (nuevos) | el diálogo de verdad antes de perder cambios |
| `apps/web/src/componentes/Ficheros.tsx` + `.module.css` (+ test) | «Editar»/«Guardar»/«Cerrar», `●`, banda de versión nueva, `M` y `●` en el árbol |
| `apps/web/src/App.tsx` (+ test) | `usarEdicion`, las guardas de fichero/pestaña/proyecto y el diálogo |
| `apps/web/src/editor/frontera.test.ts` (nuevo) | CodeMirror solo en `editor/`, y a `editor/` solo con `import()` |
| `CLAUDE.md` | la viñeta de «La consola web» y la corrección de «Ficheros y Revisión» |

---

### Task 1: Guardar en el servidor, con las mismas guardas que leer

**Goal:** `escribirFicheroDeProyecto(raiz, ruta, texto, huella)` escribe de forma atómica conservando permisos y BOM, tras las MISMAS guardas que leer (extraídas a `resolverEnProyecto`) y la comprobación de huella; la lectura trae `huella`.

**Files:**
- Modify: `src/agent/grafo/arbolDeProyecto.ts` (imports :1-7; cabecera :9-17; `FicheroLeido` :77-103; :135-210 sustituidas por `resolverEnProyecto` + `leerFicheroDeProyecto`; rama de texto de `leerContenidoDeFichero` :317-337; funciones nuevas al final)
- Test: `src/agent/grafo/arbolDeProyecto.test.ts` (imports :1-15; describe nuevo al final)

**Acceptance Criteria:**
- [ ] `leerFicheroDeProyecto` devuelve `huella` (sha256 hex de los bytes) solo con texto entero en UTF-8; sin ella para recortado, latin1 y binario.
- [ ] Todos los tests existentes de `arbolDeProyecto.test.ts` siguen en verde (la lectura pasa por `resolverEnProyecto`).
- [ ] Guardar con la huella buena escribe, devuelve la huella nueva y no deja `*.xonecode.tmp`.
- [ ] Se niegan `../x`, `/etc/passwd`, `.env`, `.git/HEAD`, `.xonecode/config.json`, `app/Clientes.xml` (aplanada), `enlace.txt` (sale del proyecto), `enlace-env.txt`, `alias.xml`, `carpeta-enlazada/config.json`, `app` (carpeta), `no-existe.xne`, `a//b`: con motivo, sin la ruta de la máquina y sin tocar el disco.
- [ ] Huella vieja → «el fichero cambió desde que lo abriste…», disco intacto, sin temporal.
- [ ] Texto de más de `TOPE_DE_FICHERO` bytes (aunque tenga menos caracteres) → negado.
- [ ] CRLF llega tal cual, permisos `0o755` se conservan, el BOM que el lector quitó vuelve, un enlace DENTRO del proyecto escribe en su destino y sigue siendo enlace, una imagen se niega, y un `EACCES` vuelve como error con su código y sin ruta.

**Verify:** `npx vitest run --project host --maxWorkers=2` → todo PASS (el proyecto `host` entero: `huella` aparece también en lo que leen los artefactos y el cable, y un `toEqual` exacto en otro fichero se pondría rojo aquí y no en una tarea posterior)

**Steps:**

- [ ] **Step 1: Escribir los tests que fallan**

En `src/agent/grafo/arbolDeProyecto.test.ts`, sustituir las dos primeras importaciones por:

```ts
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { conImagenesDelProyecto,
  arbolDeProyecto,
  escribirFicheroDeProyecto,
  huellaDeContenido,
  leerFicheroDeProyecto,
  motivoDeRutaInaceptable,
  mimeDeImagen,
  ordenarRutas,
  TOPE_DE_ENTRADAS,
  TOPE_DE_FICHERO,
  TOPE_DE_IMAGEN,
} from "./arbolDeProyecto.js";
```

(si alguno de `chmodSync`, `lstatSync`, `readdirSync`, `statSync` no se usaba, ahora sí). Y al final del fichero:

```ts
/** ¿Corre como root? Entonces un `chmod 0555` no impide escribir y el caso de EACCES no se puede montar. */
const ES_ROOT = typeof process.getuid === "function" && process.getuid() === 0;

describe("escribirFicheroDeProyecto", () => {
  const huellaDe = (ruta: string): string => huellaDeContenido(readFileSync(join(raiz, ruta)));
  const temporales = (dir: string): string[] => readdirSync(dir).filter((n) => n.endsWith(".xonecode.tmp"));
  /** Lo que una escritura negada NO puede haber tocado. */
  const foto = (): Record<string, string> =>
    Object.fromEntries(
      [".env", ".git/HEAD", ".xonecode/config.json", "app/Clientes.xml", "app/Clientes.xne"].map((r) => [r, readFileSync(join(raiz, r), "utf8")])
    );

  it("la lectura trae la huella de los BYTES, y solo con el texto entero en UTF-8", async () => {
    expect((await leerFicheroDeProyecto(raiz, "app/Clientes.xne")).huella).toBe(huellaDe("app/Clientes.xne"));
    // Sin huella no hay «Editar»: recortado, latin1 y binario son de solo lectura.
    expect((await leerFicheroDeProyecto(raiz, "grande.js")).huella).toBeUndefined();
    expect((await leerFicheroDeProyecto(raiz, "viejo.txt")).huella).toBeUndefined();
    expect((await leerFicheroDeProyecto(raiz, "datos.bin")).huella).toBeUndefined();
  });

  it("guarda, devuelve la huella nueva y no deja temporales", async () => {
    const r = await escribirFicheroDeProyecto(raiz, "app/Clientes.xne", "<coll name=\"Otra\"/>", huellaDe("app/Clientes.xne"));
    expect(r.error).toBeUndefined();
    expect(readFileSync(join(raiz, "app", "Clientes.xne"), "utf8")).toBe("<coll name=\"Otra\"/>");
    expect(r).toEqual({ ruta: "app/Clientes.xne", huella: huellaDe("app/Clientes.xne") });
    expect(temporales(join(raiz, "app"))).toEqual([]);
  });

  it.each([
    "../x",
    "/etc/passwd",
    ".env",
    ".git/HEAD",
    ".xonecode/config.json",
    "app/Clientes.xml",
    "enlace.txt",
    "enlace-env.txt",
    "alias.xml",
    "carpeta-enlazada/config.json",
    "app",
    "no-existe.xne",
    "a//b",
  ])("niega «%s» con motivo, sin la ruta de la máquina y sin tocar nada", async (ruta) => {
    const antes = foto();
    const fueraAntes = readFileSync(join(fuera, "secreto.txt"), "utf8");
    const r = await escribirFicheroDeProyecto(raiz, ruta, "PISADO", "cualquiera");
    expect(r.error).toBeTypeOf("string");
    expect(r.huella).toBeUndefined();
    expect(r.error).not.toContain(raiz);
    expect(r.error).not.toContain(fuera);
    expect(foto()).toEqual(antes);
    expect(readFileSync(join(fuera, "secreto.txt"), "utf8")).toBe(fueraAntes);
    expect(existsSync(join(raiz, "no-existe.xne"))).toBe(false);
  });

  it("con la huella vieja no escribe: el disco se queda con lo que dejó otro", async () => {
    const vieja = huellaDe("app/Clientes.xne");
    writeFileSync(join(raiz, "app", "Clientes.xne"), "<coll name=\"DeOtro\"/>");
    const r = await escribirFicheroDeProyecto(raiz, "app/Clientes.xne", "<coll name=\"Mio\"/>", vieja);
    expect(r.error).toMatch(/cambió desde que lo abriste/);
    expect(readFileSync(join(raiz, "app", "Clientes.xne"), "utf8")).toBe("<coll name=\"DeOtro\"/>");
    expect(temporales(join(raiz, "app"))).toEqual([]);
  });

  it("niega un texto por encima del tope, medido en BYTES y no en caracteres", async () => {
    // «ñ» son dos bytes: la cadena tiene MENOS caracteres que el tope y más bytes.
    const texto = "ñ".repeat(TOPE_DE_FICHERO / 2 + 1);
    expect(texto.length).toBeLessThan(TOPE_DE_FICHERO);
    const r = await escribirFicheroDeProyecto(raiz, "app/Clientes.xne", texto, huellaDe("app/Clientes.xne"));
    expect(r.error).toMatch(/tope/);
    expect(readFileSync(join(raiz, "app", "Clientes.xne"), "utf8")).toBe("<coll name=\"Clientes\"/>");
  });

  it("escribe los finales de línea tal como llegan: el CRLF lo conserva quien edita", async () => {
    writeFileSync(join(raiz, "crlf.js"), "a\r\nb\r\n");
    await escribirFicheroDeProyecto(raiz, "crlf.js", "a\r\nB\r\n", huellaDe("crlf.js"));
    expect(readFileSync(join(raiz, "crlf.js"), "utf8")).toBe("a\r\nB\r\n");
  });

  it.skipIf(process.platform === "win32")("conserva los permisos del original", async () => {
    writeFileSync(join(raiz, "script.js"), "uno");
    chmodSync(join(raiz, "script.js"), 0o755);
    await escribirFicheroDeProyecto(raiz, "script.js", "dos", huellaDe("script.js"));
    expect(statSync(join(raiz, "script.js")).mode & 0o777).toBe(0o755);
  });

  it("el BOM que el lector quitó vuelve al guardar", async () => {
    writeFileSync(join(raiz, "bom.xne"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("hola")]));
    const leido = await leerFicheroDeProyecto(raiz, "bom.xne");
    expect(leido.texto).toBe("hola");
    const r = await escribirFicheroDeProyecto(raiz, "bom.xne", "adiós", leido.huella!);
    expect(r.error).toBeUndefined();
    const enDisco = readFileSync(join(raiz, "bom.xne"));
    expect([...enDisco.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(enDisco.subarray(3).toString("utf8")).toBe("adiós");
  });

  it("por un enlace DENTRO del proyecto escribe en su destino, y el enlace sigue siendo enlace", async () => {
    symlinkSync(join(raiz, "app", "Clientes.xne"), join(raiz, "atajo.xne"));
    const r = await escribirFicheroDeProyecto(raiz, "atajo.xne", "<nuevo/>", huellaDe("app/Clientes.xne"));
    expect(r.error).toBeUndefined();
    expect(readFileSync(join(raiz, "app", "Clientes.xne"), "utf8")).toBe("<nuevo/>");
    expect(lstatSync(join(raiz, "atajo.xne")).isSymbolicLink()).toBe(true);
  });

  it("una imagen no se edita desde aquí", async () => {
    const r = await escribirFicheroDeProyecto(raiz, "icono.svg", "<svg/>", huellaDe("icono.svg"));
    expect(r.error).toMatch(/imagen/);
    expect(readFileSync(join(raiz, "icono.svg"), "utf8")).toBe("<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
  });

  it.skipIf(process.platform === "win32" || ES_ROOT)("si el disco no deja escribir, lo dice con su código y sin la ruta", async () => {
    const huella = huellaDe("app/Clientes.xne");
    chmodSync(join(raiz, "app"), 0o555);
    try {
      const r = await escribirFicheroDeProyecto(raiz, "app/Clientes.xne", "<x/>", huella);
      expect(r.error).toMatch(/EACCES|EPERM/);
      expect(r.error).not.toContain(raiz);
    } finally {
      chmodSync(join(raiz, "app"), 0o755);
    }
  });
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `npx vitest run --project host src/agent/grafo/arbolDeProyecto.test.ts`
Expected: FAIL — `escribirFicheroDeProyecto` y `huellaDeContenido` no se exportan (los tests viejos siguen pasando).

- [ ] **Step 3: Implementar**

En `src/agent/grafo/arbolDeProyecto.ts`, sustituir las importaciones de las líneas 1-3 por:

```ts
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { open, readFile, realpath, rename, stat, unlink, type FileHandle } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
```

En la cabecera (líneas 9-17), sustituir «el árbol y el contenido de un fichero, de SOLO lectura.» por «el árbol, el contenido de un fichero y, desde el editor de la pestaña, GUARDARLO (`escribirFicheroDeProyecto`): la única escritura del cliente en un fichero del proyecto, con las MISMAS guardas que la lectura.»

En `FicheroLeido`, después de `vista?: string;`:

```ts
  /**
   * El sha256 de los BYTES en disco (`huellaDeContenido`), solo con el texto ENTERO en UTF-8: es
   * lo que el editor devuelve al guardar para que se sepa si el disco cambió mientras tanto. Un
   * recortado, un latin1 o un binario no la llevan, y sin ella no se edita.
   */
  huella?: string;
```

`motivoDeRutaInaceptable` se queda tal cual. Sustituir la función `leerFicheroDeProyecto` entera (líneas 154-210) por:

```ts
/** Una ruta del cable ya resuelta contra el disco y que ha pasado las DOS cribas. */
export interface RutaResuelta {
  /** El camino REAL (`realpath`): el único sobre el que se abre o se escribe. */
  real: string;
  /** Ese camino real relativo a la raíz real, con «/». Es el que se le da a git. */
  relativa: string;
  /** La ruta pedida con «/» en vez de «\». */
  normal: string;
}

/**
 * La cadena ENTERA de guardas de una ruta del cable, en UN sitio: la usan leer, guardar y la base
 * de las marcas del editor (`agent/sesiones/baseDeFichero.ts`). Se extrajo de la lectura cuando
 * apareció la escritura: copiarla habría sido la segunda copia que diverge el primer día, y en el
 * lado que escribe un agujero ya no enseña un secreto, lo pisa.
 */
export async function resolverEnProyecto(raiz: string, ruta: string): Promise<RutaResuelta | { error: string }> {
  const motivo = motivoDeRutaInaceptable(ruta);
  if (motivo !== undefined) return { error: motivo };

  // La misma regla que `esVistaAplanada` (un `.xml` con su `.xne` al lado), preguntada al
  // disco en O(1) en vez de recorrer el árbol entero por cada fichero que se abre.
  const normal = ruta.split(/[\\/]/).join("/");
  if (normal.endsWith(".xml") && existsSync(resolve(raiz, `${normal.slice(0, -4)}.xne`))) {
    return { error: MOTIVO_APLANADA };
  }

  let real: string;
  let raizReal: string;
  try {
    raizReal = await realpath(raiz);
    // Se resuelve con `normal`, no con `ruta`: en POSIX `path.resolve` trata «\» como
    // carácter literal de nombre, así que una ruta con separadores de Windows pasaba la
    // criba de vista aplanada (ya normalizada) y luego se buscaba en disco con la barra
    // invertida sin traducir, fallando con «no existe» aunque el fichero SÍ estuviera.
    real = await realpath(resolve(raiz, normal));
  } catch {
    return { error: "no existe" };
  }
  // Un enlace simbólico dentro del proyecto que apunte fuera se queda aquí: la lección que
  // el repo ya pagó con `virtualMode: true` en el backend del agente.
  if (!real.startsWith(raizReal + sep)) return { error: "está fuera del proyecto" };

  // **La barrera se aplica DOS veces, y una sola no basta.** La primera pasada es sobre el
  // TEXTO que teclea el cliente (`motivoDeRutaInaceptable` y la criba de aplanadas de
  // arriba): es de balde y evita tocar el disco. Esta segunda es sobre el camino que el
  // disco ha resuelto DE VERDAD, y cierra tres agujeros medidos:
  //  - En un sistema de ficheros que no distingue mayúsculas (APFS, NTFS) «.ENV» no es
  //    «/.env» para `puedeLeerRuta`, pero abre `.env`. Lo mismo «.Xonecode/config.json».
  //  - Un enlace simbólico DENTRO de la raíz que apunte a un fichero denegado
  //    («enlace-env.txt» → «.env») o a una carpeta denegada («carpeta-enlazada» →
  //    «.xonecode») pasa la comprobación de arriba, porque su camino real sí está dentro
  //    del proyecto: lo que falla no es el sitio, es el destino.
  //  - Un enlace a una vista aplanada («alias.xml» → «app/Clientes.xml») no tiene ningún
  //    «alias.xne» al lado, así que la criba de balde no puede verlo.
  // `realpath` canonicaliza las mayúsculas y sigue los enlaces, así que recomprobar sobre
  // su resultado cierra los tres a la vez. Y sigue siendo una recomprobación y no una
  // prohibición de enlaces: un enlace a un fichero que SÍ se enseña se lee con normalidad.
  const relativa = relative(raizReal, real).split(sep).join("/");
  if (!puedeLeerRuta(`/${relativa}`)) return { error: "esa ruta no se enseña" };
  if (relativa.endsWith(".xml") && existsSync(`${real.slice(0, -4)}.xne`)) return { error: MOTIVO_APLANADA };
  return { real, relativa, normal };
}

export async function leerFicheroDeProyecto(raiz: string, ruta: string): Promise<FicheroLeido> {
  const rechazo = (error: string): FicheroLeido => ({ ruta, recortado: false, binario: false, bytes: 0, error });
  const resuelta = await resolverEnProyecto(raiz, ruta);
  if ("error" in resuelta) return rechazo(resuelta.error);

  const leido = await leerContenidoDeFichero(resuelta.real, ruta, mimeDeImagen(resuelta.normal));
  // Un markdown con imágenes del proyecto lleva además su VISTA: enlazadas en relativo, en la página
  // de la consola salían rotas (`core/imagenesDeDocumento.ts`).
  if (/\.(md|markdown)$/i.test(resuelta.normal) && leido.texto !== undefined && !leido.recortado) {
    const vista = vistaDeMarkdown(resuelta.normal, leido.texto);
    if (vista !== undefined) return { ...leido, vista };
  }
  return leido;
}
```

En `leerContenidoDeFichero`, sustituir el bloque desde `const { texto, codificacion } = decodificar(cuerpo, recortado);` hasta el `return { ruta, texto, recortado, binario: false, bytes, codificacion };` por:

```ts
    const { texto, codificacion } = decodificar(cuerpo, recortado);
    // La huella, solo con el fichero ENTERO y en UTF-8: es la condición para editarlo, y sobre
    // los BYTES (no sobre el texto decodificado, que ha perdido el BOM) para que se compare
    // contra lo mismo que se volverá a leer al guardar.
    const conHuella = !recortado && codificacion === "utf-8" ? { huella: huellaDeContenido(cuerpo) } : {};
    // El SVG viaja con las dos caras: la fuente que se acaba de decodificar y el dibujo
    // para pintarlo. El dibujo solo si el fichero entró ENTERO —un SVG cortado por la mitad
    // no abre— y solo desde el mismo cuerpo que ya está en memoria.
    if (mime === "image/svg+xml" && !recortado) {
      return { ruta, texto, recortado, binario: false, bytes, codificacion, mime, base64: Buffer.from(cuerpo).toString("base64"), ...conHuella };
    }
    return { ruta, texto, recortado, binario: false, bytes, codificacion, ...conHuella };
```

Y al final del fichero:

```ts
/**
 * La HUELLA de un contenido: sha256 de sus bytes. Es la concurrencia optimista del editor: viaja
 * al leer y vuelve al guardar, y si el disco ya no coincide no se escribe nada. Un hash y no una
 * fecha de modificación porque una fecha no distingue «lo reescribió con lo mismo» de «lo cambió»,
 * y en una copia mudada o bajada de nuevo las fechas no dicen nada.
 */
export function huellaDeContenido(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** El resultado de guardar: con `huella` se escribió; con `error`, no se tocó nada. */
export interface FicheroGuardado {
  ruta: string;
  huella?: string;
  error?: string;
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Guarda lo que la persona editó en la pestaña Ficheros. En orden, y cualquier paso que falle
 * DEVUELVE su motivo sin haber tocado el disco:
 *
 * 1. Las MISMAS guardas que leer (`resolverEnProyecto`), y además que sea un fichero normal —una
 *    carpeta no— y que no sea una imagen, que no se edita desde aquí.
 * 2. La huella: si lo que hay en disco no es lo que el cliente cargó, alguien (el agente, otra
 *    pestaña, un editor de fuera) lo cambió, y escribir encima lo perdería sin avisar.
 * 3. El tope, en BYTES: el mismo que la lectura, porque lo que no se puede leer entero no se edita.
 * 4. Escritura ATÓMICA sobre el camino REAL (temporal en la misma carpeta + `rename`): un corte a
 *    mitad deja el fichero viejo, no uno truncado; y sobre el real porque renombrar encima de un
 *    enlace lo sustituiría por un fichero normal.
 *
 * Lo que NO hace es comprobar que nadie trabaja en el proyecto: eso es del manejador del cable
 * (`arranque.ts#atenderGuardarFichero`), que es quien ve las consolas vivas.
 *
 * El BOM: el lector decodifica con `TextDecoder`, que lo QUITA, así que el editor nunca lo ve; si
 * el fichero lo llevaba y el texto no, se le devuelve —si no, guardar un fichero sin tocar una
 * coma cambiaría sus bytes—.
 */
export async function escribirFicheroDeProyecto(raiz: string, ruta: string, texto: string, huella: string): Promise<FicheroGuardado> {
  const rechazo = (error: string): FicheroGuardado => ({ ruta, error });
  const resuelta = await resolverEnProyecto(raiz, ruta);
  if ("error" in resuelta) return rechazo(resuelta.error);
  try {
    const info = await stat(resuelta.real);
    if (!info.isFile()) return rechazo("no es un fichero");
    if (mimeDeImagen(resuelta.normal) !== undefined) return rechazo("una imagen no se edita desde aquí");
    const actual = await readFile(resuelta.real);
    if (huellaDeContenido(actual) !== huella) {
      return rechazo("el fichero cambió desde que lo abriste: recárgalo antes de guardar");
    }
    const conBom = actual.subarray(0, BOM.length).equals(BOM) && !texto.startsWith("﻿");
    const bytes = Buffer.concat([conBom ? BOM : Buffer.alloc(0), Buffer.from(texto, "utf8")]);
    if (bytes.length > TOPE_DE_FICHERO) {
      return rechazo(`pasa del tope de ${Math.round(TOPE_DE_FICHERO / 1000)} KB que se edita desde aquí`);
    }
    await escribirAtomico(resuelta.real, bytes, info.mode & 0o7777);
    return { ruta, huella: huellaDeContenido(bytes) };
  } catch (error) {
    // Solo el `code`: el mensaje de Node lleva la ruta absoluta, y esto sale por el cable.
    const code = (error as NodeJS.ErrnoException).code;
    return rechazo(`no se pudo escribir el fichero${code === undefined ? "" : ` (${code})`}`);
  }
}

/**
 * Temporal en la MISMA carpeta + `rename`, el patrón de `settingsEnDisco.ts#escribirAtomico`. No se
 * reutiliza aquella: fija 0600, crea la carpeta y nombra el temporal como el de `settings.json`, y
 * aquí los permisos son los del fichero del usuario (un `.sh` ejecutable tiene que seguir
 * siéndolo). El `chmod` explícito es porque el umask recorta el modo que se pide al abrir.
 */
async function escribirAtomico(destino: string, bytes: Buffer, modo: number): Promise<void> {
  const temporal = join(dirname(destino), `.${basename(destino)}.${randomUUID()}.xonecode.tmp`);
  let fh: FileHandle | undefined;
  try {
    fh = await open(temporal, "wx", modo);
    await fh.writeFile(bytes);
    await fh.chmod(modo);
    await fh.sync();
    await fh.close();
    fh = undefined;
    await rename(temporal, destino);
  } catch (error) {
    await fh?.close().catch(() => {});
    await unlink(temporal).catch(() => {});
    throw error;
  }
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run --project host --maxWorkers=2 && npm run typecheck`
Expected: PASS y typecheck sin errores. Si algún test de otro fichero compara con `toEqual` EXACTO un resultado de lectura (`leerFicheroDeProyecto`, `leerArtefactoDeSesion`), añadirle `huella` al objeto esperado —o pasarlo a `toMatchObject` si el test es sobre otra cosa— en este mismo commit. (Al escribir el plan no había ninguno: `arbolDeProyecto.test.ts` usa `toMatchObject` y `artefactosEnDisco.test.ts` compara solo la lectura cruda.)

- [ ] **Step 5: Commit**

```bash
git add src/agent/grafo/arbolDeProyecto.ts src/agent/grafo/arbolDeProyecto.test.ts
git commit -m "feat(ficheros): guardar un fichero del proyecto con las mismas guardas que leer y concurrencia por huella

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tw4TZtdPn7iWwCCoSoS4X9"
```

```json:metadata
{"files": ["src/agent/grafo/arbolDeProyecto.ts", "src/agent/grafo/arbolDeProyecto.test.ts"], "verifyCommand": "npx vitest run --project host --maxWorkers=2", "acceptanceCriteria": ["la lectura trae huella solo con texto entero UTF-8", "los tests existentes siguen verdes con resolverEnProyecto", "guardar con huella buena escribe y no deja temporales", "las trece rutas negadas sin tocar disco ni filtrar rutas", "huella vieja niega sin tocar disco", "tope en bytes", "CRLF, permisos, BOM, enlace interno, imagen y EACCES"], "modelTier": "standard"}
```

---

### Task 2: La base de comparación, de git

**Goal:** `baseDeFichero(raiz, sesion, ruta, base)` devuelve el texto del fichero en la ref de la sesión (`"sesion"`) o en `HEAD` (`"commit"`), `vacio` si no existía allí, o `sinBase` con el motivo; con las mismas guardas de ruta.

**Files:**
- Create: `src/agent/sesiones/baseDeFichero.ts`
- Test: `src/agent/sesiones/baseDeFichero.test.ts`

**Acceptance Criteria:**
- [ ] Contra un repo temporal de verdad: `"sesion"` da el texto de cuando se marcó la sesión y `"commit"` el de `HEAD`, aunque el disco diga otra cosa.
- [ ] Un fichero que no estaba en esa base → `{ vacio: true }`.
- [ ] Sin repositorio, sin la ref de la sesión, sin sesión, o con un repo sin commits → `sinBase` con motivo legible.
- [ ] `.env` commiteado → `sinBase: "esa ruta no se enseña"` y ningún `texto`.
- [ ] Un proyecto que cuelga de una subcarpeta de un repo mayor funciona.

**Verify:** `npx vitest run --project host src/agent/sesiones/baseDeFichero.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir el test que falla**

`src/agent/sesiones/baseDeFichero.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { baseDeFichero } from "./baseDeFichero.js";
import { marcarSesion } from "./sesionGit.js";

const creados: string[] = [];
afterEach(() => {
  for (const d of creados.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Un repo de verdad: esto prueba git, no un doble de git. */
function repo(): string {
  const raiz = mkdtempSync(join(tmpdir(), "xonecode-base-"));
  creados.push(raiz);
  execFileSync("git", ["init", "-q", "."], { cwd: raiz });
  execFileSync("git", ["config", "user.email", "x@y.z"], { cwd: raiz });
  execFileSync("git", ["config", "user.name", "x"], { cwd: raiz });
  return raiz;
}

function commit(raiz: string, mensaje: string): void {
  execFileSync("git", ["add", "-A"], { cwd: raiz });
  execFileSync("git", ["commit", "-qm", mensaje], { cwd: raiz });
}

describe("baseDeFichero", () => {
  it("«sesion» es el fichero como estaba al abrir la sesión, y «commit» como está en HEAD", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "uno\n");
    commit(raiz, "base");
    expect(await marcarSesion(raiz, "s1")).toBe(true);
    writeFileSync(join(raiz, "app.xne"), "dos\n");
    commit(raiz, "turno");
    writeFileSync(join(raiz, "app.xne"), "tres\n"); // lo que hay en disco no es ninguna de las dos

    expect(await baseDeFichero(raiz, "s1", "app.xne", "sesion")).toEqual({ ruta: "app.xne", base: "sesion", texto: "uno\n" });
    expect(await baseDeFichero(raiz, "s1", "app.xne", "commit")).toEqual({ ruta: "app.xne", base: "commit", texto: "dos\n" });
  });

  it("un fichero que no existía en la base es «vacio»: todo él es nuevo", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "uno\n");
    commit(raiz, "base");
    expect(await marcarSesion(raiz, "s1")).toBe(true);
    writeFileSync(join(raiz, "nuevo.xne"), "hola\n");
    expect(await baseDeFichero(raiz, "s1", "nuevo.xne", "sesion")).toEqual({ ruta: "nuevo.xne", base: "sesion", vacio: true });
    expect(await baseDeFichero(raiz, "s1", "nuevo.xne", "commit")).toEqual({ ruta: "nuevo.xne", base: "commit", vacio: true });
  });

  it("sin repositorio no hay base, y se dice por qué", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-sin-git-"));
    creados.push(raiz);
    writeFileSync(join(raiz, "app.xne"), "uno\n");
    const r = await baseDeFichero(raiz, "s1", "app.xne", "commit");
    expect(r.texto).toBeUndefined();
    expect(r.sinBase).toMatch(/repositorio/);
  });

  it("sin la ref de la sesión, o sin sesión todavía, «sesion» no tiene base", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "uno\n");
    commit(raiz, "base");
    expect((await baseDeFichero(raiz, "s9", "app.xne", "sesion")).sinBase).toMatch(/foto de su inicio/);
    expect((await baseDeFichero(raiz, undefined, "app.xne", "sesion")).sinBase).toBe("la sesión todavía no ha empezado");
  });

  it("un repo sin commits no tiene «último commit»", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "uno\n");
    expect((await baseDeFichero(raiz, undefined, "app.xne", "commit")).sinBase).toMatch(/ningún commit/);
  });

  it("las guardas de ruta son las de leer: un .env commiteado no sale por aquí", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, ".env"), "SECRETO=1\n");
    commit(raiz, "base");
    const r = await baseDeFichero(raiz, undefined, ".env", "commit");
    expect(r).toEqual({ ruta: ".env", base: "commit", sinBase: "esa ruta no se enseña" });
  });

  it("un proyecto que cuelga de un repo mayor pide la ruta relativa a SU carpeta", async () => {
    const raizDelRepo = repo();
    mkdirSync(join(raizDelRepo, "sub"));
    writeFileSync(join(raizDelRepo, "sub", "a.xne"), "dentro\n");
    commit(raizDelRepo, "base");
    expect(await baseDeFichero(join(raizDelRepo, "sub"), undefined, "a.xne", "commit")).toEqual({ ruta: "a.xne", base: "commit", texto: "dentro\n" });
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run --project host src/agent/sesiones/baseDeFichero.test.ts`
Expected: FAIL — no existe `./baseDeFichero.js`.

- [ ] **Step 3: Implementar**

`src/agent/sesiones/baseDeFichero.ts`:

```ts
/**
 * La BASE contra la que el editor de la pestaña Ficheros pinta sus marcas: el fichero como estaba
 * al abrir la sesión (`refs/xonecode/sesion/<id>`, la foto de `sesionGit.ts#fotoDeApertura`) o en
 * el último commit (`HEAD`). El cálculo de trozos lo hace el cliente; aquí solo se trae el texto.
 *
 * Tres respuestas, y son tres cosas distintas: `texto` (había una versión), `vacio` (en esa base el
 * fichero no existía: todo él es nuevo) y `sinBase` con el motivo (no hay con qué comparar). Fundir
 * la tercera en un texto vacío pintaría el fichero entero de verde, que es afirmar algo falso.
 *
 * Las guardas de ruta son las de leer (`resolverEnProyecto`) y se pasan ANTES de tocar git: una
 * ruta que la pestaña no enseña tampoco sale de un commit viejo. Y a git se le da la ruta REAL
 * relativa (`relativa`), no la tecleada, con `./` delante para que se resuelva desde la carpeta
 * del proyecto aunque este cuelgue de un repo mayor (`instantanea.ts` sostiene ese caso).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolverEnProyecto, TOPE_DE_FICHERO } from "../grafo/arbolDeProyecto.js";
import { refDeSesion } from "./sesionGit.js";

const ejecutar = promisify(execFile);

export type BaseDeComparacion = "sesion" | "commit";

export interface BaseLeida {
  ruta: string;
  base: BaseDeComparacion;
  texto?: string;
  vacio?: true;
  sinBase?: string;
}

export async function baseDeFichero(
  raiz: string,
  sesion: string | undefined,
  ruta: string,
  base: BaseDeComparacion
): Promise<BaseLeida> {
  const sin = (motivo: string): BaseLeida => ({ ruta, base, sinBase: motivo });
  const resuelta = await resolverEnProyecto(raiz, ruta);
  if ("error" in resuelta) return sin(resuelta.error);
  if (!(await enUnRepositorio(raiz))) return sin("el proyecto no está en un repositorio git");

  let revision: string;
  if (base === "sesion") {
    // El mismo texto que `modeloDelCambio` usa para lo mismo: sin sesión no hay «antes».
    if (sesion === undefined) return sin("la sesión todavía no ha empezado");
    const ref = refDeSesion(sesion);
    if (ref === undefined || !(await existeArbol(raiz, ref))) {
      return sin("esta sesión no tiene foto de su inicio: se abrió sin git usable");
    }
    revision = ref;
  } else {
    if (!(await existeArbol(raiz, "HEAD"))) return sin("el repositorio todavía no tiene ningún commit");
    revision = "HEAD";
  }

  const objeto = `${revision}:./${resuelta.relativa}`;
  try {
    await ejecutar("git", ["cat-file", "-e", objeto], { cwd: raiz });
  } catch {
    return { ruta, base, vacio: true };
  }
  let salida: Buffer;
  try {
    // `cat-file blob` y no `show`: el contenido crudo del blob, sin textconv ni filtros. El
    // `maxBuffer` un poco por encima del tope: lo que lo pasa no se compara (ver abajo).
    const r = await ejecutar("git", ["cat-file", "blob", objeto], { cwd: raiz, encoding: "buffer", maxBuffer: TOPE_DE_FICHERO + 1024 });
    salida = r.stdout;
  } catch {
    return sin("git no pudo leer esa versión del fichero, o pasa del tope que se compara");
  }
  if (salida.length > TOPE_DE_FICHERO) return sin("esa versión del fichero pasa del tope que se compara");
  try {
    // Estricto, y quitando el BOM igual que la lectura (`TextDecoder` por omisión): la base y el
    // texto del editor tienen que haberse decodificado igual o la primera línea saldría cambiada.
    return { ruta, base, texto: new TextDecoder("utf-8", { fatal: true }).decode(salida) };
  } catch {
    return sin("esa versión del fichero no está en UTF-8");
  }
}

async function enUnRepositorio(raiz: string): Promise<boolean> {
  try {
    await ejecutar("git", ["rev-parse", "--is-inside-work-tree"], { cwd: raiz });
    return true;
  } catch {
    return false;
  }
}

/** `^{tree}` porque la ref de una sesión apunta a un ÁRBOL y la de `HEAD` a un commit: vale para los dos. */
async function existeArbol(raiz: string, revision: string): Promise<boolean> {
  try {
    await ejecutar("git", ["rev-parse", "--verify", "--quiet", `${revision}^{tree}`], { cwd: raiz });
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run --project host src/agent/sesiones/baseDeFichero.test.ts src/ciclos.test.ts && npm run typecheck`
Expected: PASS (sin ciclo nuevo de importación).

- [ ] **Step 5: Commit**

```bash
git add src/agent/sesiones/baseDeFichero.ts src/agent/sesiones/baseDeFichero.test.ts
git commit -m "feat(ficheros): la base de las marcas del editor, de la foto de la sesión o de HEAD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tw4TZtdPn7iWwCCoSoS4X9"
```

```json:metadata
{"files": ["src/agent/sesiones/baseDeFichero.ts", "src/agent/sesiones/baseDeFichero.test.ts"], "verifyCommand": "npx vitest run --project host src/agent/sesiones/baseDeFichero.test.ts", "acceptanceCriteria": ["sesion y commit contra un repo real", "vacio para un fichero nuevo", "sinBase sin repo, sin ref, sin sesión y sin commits", ".env commiteado no sale", "proyecto en subcarpeta de un repo mayor"], "modelTier": "standard"}
```

---

### Task 3: El cable: guardar y pedir la base, negado por raíz

**Goal:** Los mensajes `guardarFichero`/`ficheroGuardado` y `baseDeFichero` en el host y en el cliente, sus manejadores en `arranque.ts` (negando por RAÍZ con un turno o una tarea en marcha), la regla pura en `core/` y `ficherosCableados()` probada contra un temporal real.

**Files:**
- Modify: `src/core/settings.ts` (después de `motivoParaNoBorrarCopia`, ~:594)
- Test: `src/core/settings.test.ts` (import :5; describe nuevo tras el de `motivoParaNoBorrarCopia`, ~:340)
- Modify: `src/web/servidor/vestibulo.ts` (import :42; interfaz `Vestibulo` ~:647-810; objeto devuelto ~:2515)
- Test: `src/web/servidor/vestibulo.test.ts` (dentro de `describe("abrirParaTarea — la segunda puerta"`, ~:1625)
- Modify: `src/web/servidor/transporte.ts` (`MensajeAlCliente` ~:658; `FicheroDelProyecto` ~:1027; `MensajeDelCliente` ~:1642)
- Modify: `apps/web/src/tipos.ts` (`MensajeAlCliente` ~:822; `FicheroDelProyecto` ~:1007; `MensajeDelCliente` ~:1457)
- Modify: `src/web/servidor/arranque.ts` (imports :169-178 y :247; `OpcionesDeMontaje` ~:501; manejadores tras `atenderFichero` ~:4345; despacho tras el de `fichero` ~:5817; `ficherosCableados` junto a `emuladoresCableados` ~:6880; cableado ~:7550)
- Test: `src/web/servidor/arranque.test.ts` (import ~:15-45; describe nuevo tras «el árbol del proyecto y el contenido de un fichero», ~:2211)

**Acceptance Criteria:**
- [ ] `motivoParaNoEditarFichero` dice turno por una consola de persona con turno en vuelo en ESA raíz, tarea por una de tarea sin cerrar (o con turno), nada por otra raíz o en reposo, y compara con `mismaRuta`.
- [ ] `vestibulo.motivoParaNoEditar(raiz)`: una consola de tarea abierta ocupa su raíz y la deja al cerrarse; la de persona en reposo no.
- [ ] Por el cable: `guardarFichero` llega al puerto con la raíz abierta y contesta `ficheroGuardado` con la huella; con un turno en vuelo contesta el error exacto y el puerto NO se llama; sin puerto, o si el puerto lanza con una ruta, contesta un error sin la ruta y `informar` lleva solo el código.
- [ ] `baseDeFichero` llega al puerto con raíz, sesión, ruta y base, y contesta con lo que devuelve; sin puerto contesta `sinBase`.
- [ ] `ficherosCableados()` lee, guarda y pide la base contra un temporal real con las funciones de verdad, y `arrancarConsolaWeb` lo usa.
- [ ] `apps/web/src/tipos.test.ts` sigue en verde (los literales `clase:` cuadran).

**Verify:** `npx vitest run --project host src/core/settings.test.ts src/web/servidor/vestibulo.test.ts src/web/servidor/arranque.test.ts && npx vitest run --project cliente --maxWorkers=2 && npm run typecheck` → todo PASS (el proyecto `cliente` entero, porque cambia `tipos.ts`)

**Steps:**

- [ ] **Step 1: Escribir los tests que fallan**

En `src/core/settings.test.ts`, añadir `motivoParaNoEditarFichero` a la importación de `./settings.js` de la línea 5, y tras el `describe("motivoParaNoBorrarCopia"…)`:

```ts
describe("motivoParaNoEditarFichero", () => {
  const raiz = "/w/webstudio/Tienda";
  const otra = "/w/webstudio/Otra";

  it("nadie escribiendo en esa raíz: se puede guardar", () => {
    expect(motivoParaNoEditarFichero({ raiz, personas: [{ raiz, turnoEnVuelo: false }], tareas: [] })).toBeUndefined();
    expect(motivoParaNoEditarFichero({ raiz, personas: [{ raiz: otra, turnoEnVuelo: true }], tareas: [{ raiz: otra, cerrada: false, turnoEnVuelo: true }] })).toBeUndefined();
  });

  it("un turno en vuelo de una persona en ESA raíz lo impide", () => {
    expect(motivoParaNoEditarFichero({ raiz, personas: [{ raiz, turnoEnVuelo: true }], tareas: [] })).toBe(
      "espera a que termine el turno: el agente está trabajando en este proyecto"
    );
  });

  it("una consola de tarea sin cerrar lo impide aunque no esté en un turno; cerrada no, salvo con el turno vivo", () => {
    const motivo = "hay una tarea de fondo trabajando en este proyecto: espera a que termine";
    expect(motivoParaNoEditarFichero({ raiz, personas: [], tareas: [{ raiz, cerrada: false, turnoEnVuelo: false }] })).toBe(motivo);
    expect(motivoParaNoEditarFichero({ raiz, personas: [], tareas: [{ raiz, cerrada: true, turnoEnVuelo: false }] })).toBeUndefined();
    expect(motivoParaNoEditarFichero({ raiz, personas: [], tareas: [{ raiz, cerrada: true, turnoEnVuelo: true }] })).toBe(motivo);
  });

  it("compara rutas con mismaRuta: una barra final no la hace otra raíz", () => {
    expect(motivoParaNoEditarFichero({ raiz: `${raiz}/`, personas: [{ raiz, turnoEnVuelo: true }], tareas: [] })).toBeTypeOf("string");
  });
});
```

En `src/web/servidor/vestibulo.test.ts`, dentro de `describe("abrirParaTarea — la segunda puerta", …)` y después de su último `it`:

```ts
  it("motivoParaNoEditar: una consola de TAREA viva ocupa su raíz, y la deja al cerrarse", async () => {
    // Guardar a mano desde la pestaña Ficheros compite con lo que escribe una tarea de fondo en
    // la MISMA copia. La consola de tarea no está en `proyectosAbiertos()` (es de `deTareas`),
    // así que esta pregunta es la única que la ve.
    const base = baseTemporal();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto, baseDeWorkspace: () => base });
    const raizA = proyectoEnDisco(base, "A");
    const raizB = proyectoEnDisco(base, "B");
    await v.abrirProyecto({ raiz: raizA });
    expect(v.motivoParaNoEditar(raizA)).toBeUndefined();

    const deTarea = await v.abrirParaTarea(raizB);
    expect(v.motivoParaNoEditar(raizB)).toMatch(/tarea de fondo/);
    expect(v.motivoParaNoEditar(raizA)).toBeUndefined();

    await deTarea.cerrar();
    expect(v.motivoParaNoEditar(raizB)).toBeUndefined();
    await v.cerrar();
    rmSync(base, { recursive: true, force: true });
  });
```

En `src/web/servidor/arranque.test.ts`, añadir `ficherosCableados,` a la lista importada de `"./arranque.js"`, y tras el cierre de `describe("el árbol del proyecto y el contenido de un fichero", …)`:

```ts
  describe("guardar un fichero y pedir su base, por el cable", () => {
    const abrir = async (
      opciones: Parameters<typeof montarRutas>[2],
      vestibuloExtra: Partial<Parameters<typeof crearVestibulo>[0]> = {}
    ) => {
      const base = mkdtempSync(join(tmpdir(), "xonecode-editar-"));
      const servidor = servidorDeMentira();
      const vestibulo = vestibuloDePrueba({ baseDeWorkspace: () => base, ...vestibuloExtra });
      const raizDeVerdad = vestibulo.raizDeProyecto("webstudio", "Tienda");
      mkdirSync(join(raizDeVerdad, ".xonecode", "cloudstudio"), { recursive: true });
      writeFileSync(join(raizDeVerdad, ".xonecode", "config.json"), JSON.stringify({ modo: "offline" }));
      writeFileSync(join(raizDeVerdad, ".xonecode", "cloudstudio", "sync.json"), "{}");
      montarRutas(servidor, vestibulo, { informar: () => {}, ...opciones });
      const cliente = clienteDeMentira();
      await servidor.rutas.get(`GET ${RUTA_EVENTOS}`)!(cliente.peticion, cliente.respuesta);
      const accion = servidor.rutas.get(`POST ${RUTA_ACCION}`)!;
      await asentar();
      await enviarMensaje(accion, { clase: "sesion", proyecto: "p1" });
      await asentar();
      const ultimo = <C extends MensajeAlCliente["clase"]>(clase: C) =>
        cliente.recibidos.filter((x) => x.clase === clase).at(-1) as Extract<MensajeAlCliente, { clase: C }> | undefined;
      const limpiar = async (): Promise<void> => {
        await vestibulo.cerrar();
        rmSync(base, { recursive: true, force: true });
      };
      return { servidor, vestibulo, raizDeVerdad, cliente, accion, ultimo, limpiar };
    };

    it("«guardarFichero» llega al puerto con la raíz abierta, y la respuesta trae la huella nueva", async () => {
      const pedidos: unknown[] = [];
      const t = await abrir({
        escribirFichero: async (raiz, ruta, texto, huella) => {
          pedidos.push({ raiz, ruta, texto, huella });
          return { ruta, huella: "h2" };
        },
      });
      expect(await enviarMensaje(t.accion, { clase: "guardarFichero", ruta: "a.xne", texto: "<a/>", huella: "h1" })).toBe(204);
      await asentar();
      expect(pedidos).toEqual([{ raiz: t.vestibulo.proyectoAbierto()!.raiz, ruta: "a.xne", texto: "<a/>", huella: "h1" }]);
      expect(t.ultimo("ficheroGuardado")).toEqual({ clase: "ficheroGuardado", ruta: "a.xne", huella: "h2" });
      await t.limpiar();
    });

    it("con un turno en vuelo en esa raíz se niega, y el puerto NO se llama", async () => {
      let soltar: (() => void) | undefined;
      const escritos: string[] = [];
      const t = await abrir(
        {
          escribirFichero: async (_raiz, ruta) => {
            escritos.push(ruta);
            return { ruta, huella: "h2" };
          },
        },
        // La costura de `vestibulo.test.ts`: un ejecutor que no termina deja el turno EN VUELO.
        { crearEjecutor: () => async () => { await new Promise<void>((resuelto) => { soltar = resuelto; }); } }
      );
      const abierta = t.vestibulo.proyectoAbierto()!;
      const turno = abierta.ejecutarTurno("algo", abierta.estadoDeSesion, abierta.consola.consola);
      expect(abierta.turnoEnVuelo).toBe(true);
      await enviarMensaje(t.accion, { clase: "guardarFichero", ruta: "a.xne", texto: "<a/>", huella: "h1" });
      await asentar();
      expect(t.ultimo("ficheroGuardado")).toEqual({
        clase: "ficheroGuardado",
        ruta: "a.xne",
        error: "espera a que termine el turno: el agente está trabajando en este proyecto",
      });
      expect(escritos).toEqual([]);
      soltar!();
      await turno;
      await t.limpiar();
    });

    it("sin puerto lo dice; y si el puerto lanza con una ruta, el error no la lleva", async () => {
      const sinPuerto = await abrir({});
      await enviarMensaje(sinPuerto.accion, { clase: "guardarFichero", ruta: "a.xne", texto: "x", huella: "h" });
      await asentar();
      expect(sinPuerto.ultimo("ficheroGuardado")).toEqual({ clase: "ficheroGuardado", ruta: "a.xne", error: "esta ejecución no puede escribir en el proyecto" });
      await sinPuerto.limpiar();

      const dichos: string[] = [];
      let raiz = "";
      const t = await abrir({
        informar: (texto) => dichos.push(texto),
        escribirFichero: async () => {
          throw Object.assign(new Error(`EACCES: permission denied, open '${raiz}/a.xne'`), { code: "EACCES" });
        },
      });
      raiz = t.raizDeVerdad;
      await enviarMensaje(t.accion, { clase: "guardarFichero", ruta: "a.xne", texto: "x", huella: "h" });
      await asentar();
      expect(t.ultimo("ficheroGuardado")).toEqual({ clase: "ficheroGuardado", ruta: "a.xne", error: "no se pudo guardar el fichero" });
      expect(JSON.stringify(t.cliente.recibidos)).not.toContain(t.raizDeVerdad);
      expect(dichos.join("\n")).not.toContain(t.raizDeVerdad);
      expect(dichos.join("\n")).toContain("EACCES");
      await t.limpiar();
    });

    it("«baseDeFichero» llega al puerto con raíz, sesión, ruta y base; sin puerto contesta sinBase", async () => {
      const pedidos: unknown[] = [];
      const t = await abrir({
        baseDeFichero: async (raiz, sesion, ruta, base) => {
          pedidos.push({ raiz, sesion, ruta, base });
          return { ruta, base, texto: "antes" };
        },
      });
      expect(await enviarMensaje(t.accion, { clase: "baseDeFichero", ruta: "a.xne", base: "commit" })).toBe(204);
      await asentar();
      const abierta = t.vestibulo.proyectoAbierto()!;
      expect(pedidos).toEqual([{ raiz: abierta.raiz, sesion: abierta.sesion, ruta: "a.xne", base: "commit" }]);
      expect(t.ultimo("baseDeFichero")).toEqual({ clase: "baseDeFichero", ruta: "a.xne", base: "commit", texto: "antes" });
      await t.limpiar();

      const sinPuerto = await abrir({});
      await enviarMensaje(sinPuerto.accion, { clase: "baseDeFichero", ruta: "a.xne", base: "sesion" });
      await asentar();
      expect(sinPuerto.ultimo("baseDeFichero")).toEqual({ clase: "baseDeFichero", ruta: "a.xne", base: "sesion", sinBase: "esta ejecución no puede leer git" });
      await sinPuerto.limpiar();
    });
  });
```

Y al final del fichero, junto al `describe("emuladoresCableados — …")`:

```ts
/**
 * El cableado de la pestaña Ficheros: leer, guardar y la base con las funciones de VERDAD, sobre un
 * temporal real. Es el patrón de fallo de este repo —un campo opcional que se cae del literal de
 * `arrancarConsolaWeb` compila y pasa, y el botón diría «esta ejecución no puede escribir»—.
 */
describe("ficherosCableados — la composición de producción, no un doble", () => {
  it("lee con huella, guarda con ella, y la base dice que aquí no hay repositorio", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-cableados-"));
    try {
      writeFileSync(join(raiz, "a.xne"), "uno\n");
      const c = ficherosCableados();
      const leido = await c.leerFichero(raiz, "a.xne");
      expect(leido.huella).toBeTypeOf("string");
      const guardado = await c.escribirFichero(raiz, "a.xne", "dos\n", leido.huella!);
      expect(guardado.error).toBeUndefined();
      expect(readFileSync(join(raiz, "a.xne"), "utf8")).toBe("dos\n");
      expect((await c.baseDeFichero(raiz, undefined, "a.xne", "commit")).sinBase).toMatch(/repositorio/);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `npx vitest run --project host src/core/settings.test.ts src/web/servidor/vestibulo.test.ts src/web/servidor/arranque.test.ts`
Expected: FAIL — `motivoParaNoEditarFichero`, `motivoParaNoEditar` y `ficherosCableados` no existen; los mensajes nuevos no se atienden.

- [ ] **Step 3: La regla pura y el vestíbulo**

En `src/core/settings.ts`, tras `motivoParaNoBorrarCopia`:

```ts
/**
 * Por qué NO se puede guardar a mano un fichero en esa raíz ahora mismo (el editor de la pestaña
 * Ficheros), o `undefined` si se puede.
 *
 * La hermana de `motivoParaNoBorrarCopia` con la misma idea —lo que importa es quién ESCRIBE ahí—
 * y una diferencia: aquí no cuenta el índice de tareas sino las consolas VIVAS de este proceso,
 * porque una tarea `requiere-atencion` espera feedback y no escribe. Dos fuentes:
 *
 * - una consola de persona de esa raíz con un turno en vuelo (no solo la del foco: puede haber
 *   varias consolas vivas a la vez);
 * - una consola de TAREA de esa raíz sin cerrar, o cerrada con el turno aún en vuelo.
 *
 * Con esto el guardado no necesita la cola de `escriturasEnSerie`: los únicos que escriben en la
 * copia son los turnos y las tareas, y mientras corren se niega. **Límite declarado**: una tarea
 * en OTRO proceso no se ve, el mismo que ya declara `borrarSesion`.
 */
export function motivoParaNoEditarFichero(datos: {
  raiz: string;
  personas: readonly { raiz: string; turnoEnVuelo: boolean }[];
  tareas: readonly { raiz: string; cerrada: boolean; turnoEnVuelo: boolean }[];
}): string | undefined {
  if (datos.personas.some((c) => c.turnoEnVuelo && mismaRuta(c.raiz, datos.raiz))) {
    return "espera a que termine el turno: el agente está trabajando en este proyecto";
  }
  if (datos.tareas.some((c) => (!c.cerrada || c.turnoEnVuelo) && mismaRuta(c.raiz, datos.raiz))) {
    return "hay una tarea de fondo trabajando en este proyecto: espera a que termine";
  }
  return undefined;
}
```

En `src/web/servidor/vestibulo.ts`, añadir `motivoParaNoEditarFichero` a la importación de `"../../core/settings.js"` de la línea 42. En la interfaz `Vestibulo`, después de `proyectosAbiertos(): readonly ConsolaDeProyecto[];`:

```ts
  /**
   * Por qué no se puede guardar a mano en esa raíz ahora mismo (`core/settings.ts
   * #motivoParaNoEditarFichero`), o `undefined`. Mira TODAS las consolas de persona —también una
   * cerrada con el turno vivo— y las de tarea, que no salen en `proyectosAbiertos()`.
   */
  motivoParaNoEditar(raiz: string): string | undefined;
```

Y en el objeto que devuelve `crearVestibulo`, después de la entrada `proyectosAbiertos: () => …,`:

```ts
    // Sin filtrar `cerrada` en las de persona: lo que importa es el turno, y un turno que sigue
    // vivo escribe aunque su lazo haya terminado. Las de tarea, vivas o con turno.
    motivoParaNoEditar: (raiz) =>
      motivoParaNoEditarFichero({ raiz, personas: [...abiertas.values()], tareas: [...deTareas] }),
```

- [ ] **Step 4: Los tipos del cable, en los dos lados**

En `src/web/servidor/transporte.ts`:

(a) en `FicheroDelProyecto`, después de `vista?: string;`:

```ts
  /**
   * El sha256 de los bytes en disco, solo con el texto ENTERO en UTF-8
   * (`arbolDeProyecto.ts#huellaDeContenido`). Vuelve al guardar: si el disco ya no coincide, no se
   * escribe nada.
   */
  huella?: string;
```

(b) justo después de `FicheroDelProyecto`:

```ts
/**
 * La versión de un fichero contra la que el editor pinta sus marcas (`agent/sesiones/baseDeFichero.ts`).
 * `texto` = había una versión; `vacio` = en esa base no existía; `sinBase` = no hay con qué comparar,
 * y por qué. Redeclarado en `apps/web/src/tipos.ts`.
 */
export interface BaseDelFichero {
  ruta: string;
  base: "sesion" | "commit";
  texto?: string;
  vacio?: true;
  sinBase?: string;
}
```

(c) en `MensajeAlCliente`, justo después de la línea `| ({ clase: "fichero" } & FicheroDelProyecto)`:

```ts
  /**
   * La respuesta a guardar un fichero desde el editor de la pestaña Ficheros: con `huella` se
   * escribió y esa es la nueva; con `error`, no se tocó nada. Va a TODOS los clientes: otra pestaña
   * con el mismo fichero abierto se entera de que el disco cambió.
   */
  | { clase: "ficheroGuardado"; ruta: string; huella?: string; error?: string }
  /** La base de comparación de un fichero, para las marcas del margen del editor. */
  | ({ clase: "baseDeFichero" } & BaseDelFichero)
```

(d) en `MensajeDelCliente`, justo después de la línea `| { clase: "fichero"; ruta: string }`:

```ts
  /**
   * Guardar lo que la persona editó. La única escritura del cliente en un fichero del proyecto:
   * sin tarjeta de aprobación porque lo teclea ella, con las guardas de ruta de leer y negada con
   * un turno o una tarea en marcha en esa raíz. `huella` es la del fichero que se cargó.
   */
  | { clase: "guardarFichero"; ruta: string; texto: string; huella: string }
  /** Pedir la base de comparación de un fichero: la foto del inicio de la sesión o el último commit. */
  | { clase: "baseDeFichero"; ruta: string; base: "sesion" | "commit" }
```

En `apps/web/src/tipos.ts`, lo MISMO y con la misma forma de declaración:

(a) en `FicheroDelProyecto`, después de `vista?: string;`:

```ts
  /** El sha256 de los bytes en disco, solo con el texto entero en UTF-8. Vuelve al guardar. */
  huella?: string;
```

(b) justo después de `FicheroDelProyecto`:

```ts
/** Contra qué se comparan las marcas del editor. Redeclarado de `web/servidor/transporte.ts`. */
export type BaseElegida = "sesion" | "commit";

/** La versión de un fichero para las marcas del editor. Redeclarado de `web/servidor/transporte.ts`. */
export interface BaseDelFichero {
  ruta: string;
  base: BaseElegida;
  texto?: string;
  vacio?: true;
  sinBase?: string;
}
```

(c) en `MensajeAlCliente`, justo después de `| ({ clase: "fichero" } & FicheroDelProyecto)`:

```ts
  /** La respuesta a guardar: con `huella` se escribió; con `error`, no se tocó nada. */
  | { clase: "ficheroGuardado"; ruta: string; huella?: string; error?: string }
  /** La base de comparación de un fichero. */
  | ({ clase: "baseDeFichero" } & BaseDelFichero)
```

(d) en `MensajeDelCliente`, justo después de `| { clase: "fichero"; ruta: string }`:

```ts
  /** Guardar lo editado en la pestaña Ficheros, con la huella del fichero que se cargó. */
  | { clase: "guardarFichero"; ruta: string; texto: string; huella: string }
  /** Pedir la base de comparación de un fichero. */
  | { clase: "baseDeFichero"; ruta: string; base: BaseElegida }
```

- [ ] **Step 5: Los manejadores, el despacho y el cableado**

En `src/web/servidor/arranque.ts`:

(a) importaciones: en el bloque de `"../../agent/grafo/arbolDeProyecto.js"` (:173-178) añadir `escribirFicheroDeProyecto,`; debajo, `import { baseDeFichero } from "../../agent/sesiones/baseDeFichero.js";`; y añadir `BaseDelFichero` a la importación de tipos de `"./transporte.js"` (la que cierra en :247).

(b) en `OpcionesDeMontaje`, justo después de `leerFichero?: (raiz: string, ruta: string) => Promise<FicheroDelProyecto>;`:

```ts
  /**
   * Guardar un fichero que la persona editó en la pestaña Ficheros
   * (`agent/grafo/arbolDeProyecto.ts#escribirFicheroDeProyecto`). Por opción porque escribe en el
   * disco del proyecto: un test del cable usa dobles.
   */
  escribirFichero?: (raiz: string, ruta: string, texto: string, huella: string) => Promise<{ ruta: string; huella?: string; error?: string }>;
  /** La base de las marcas del editor (`agent/sesiones/baseDeFichero.ts`). Por opción porque toca git. */
  baseDeFichero?: (raiz: string, sesion: string | undefined, ruta: string, base: "sesion" | "commit") => Promise<BaseDelFichero>;
```

(c) justo después del cierre de `atenderFichero`:

```ts
  /**
   * Guardar lo que la persona editó. Tres cosas antes de tocar el disco, y cada una contesta en
   * vez de callar —el editor tiene un «Guardando…» encendido esperando—:
   *  - que haya proyecto abierto y puerto que escriba;
   *  - que nadie trabaje en esa RAÍZ (`vestibulo.motivoParaNoEditar`): un turno o una tarea que
   *    escribe en la misma copia pisaría, o sería pisado, sin avisar;
   *  - lo demás —guardas de ruta, huella, tope— lo decide el puerto y lo DEVUELVE.
   * El `try` es el de `atenderFichero`: un fallo inesperado contesta sin la ruta de la máquina.
   */
  const atenderGuardarFichero = async (ruta: string, texto: string, huella: string): Promise<void> => {
    const abierto = vestibulo.proyectoAbierto();
    if (abierto === undefined) {
      emitir({ clase: "ficheroGuardado", ruta, error: "no hay ningún proyecto abierto" });
      return;
    }
    if (opciones.escribirFichero === undefined) {
      emitir({ clase: "ficheroGuardado", ruta, error: "esta ejecución no puede escribir en el proyecto" });
      return;
    }
    const ocupado = vestibulo.motivoParaNoEditar(abierto.raiz);
    if (ocupado !== undefined) {
      emitir({ clase: "ficheroGuardado", ruta, error: ocupado });
      return;
    }
    try {
      emitir({ clase: "ficheroGuardado", ...(await opciones.escribirFichero(abierto.raiz, ruta, texto, huella)) });
    } catch (error) {
      informar(`no se pudo guardar «${ruta}» (${codigoDe(error)})`);
      emitir({ clase: "ficheroGuardado", ruta, error: "no se pudo guardar el fichero" });
    }
  };

  /**
   * La base de las marcas del editor. Con la sesión ABIERTA (`abierto.sesion`, la misma que mira
   * Revisión): su ref es la foto del inicio. Sin puerto se contesta `sinBase` —el editor funciona
   * igual, sin marcas, y lo dice— en vez de dejar la barra en «Trayendo la base…».
   */
  const atenderBaseDeFichero = async (ruta: string, base: "sesion" | "commit"): Promise<void> => {
    const abierto = vestibulo.proyectoAbierto();
    if (abierto === undefined) return;
    if (opciones.baseDeFichero === undefined) {
      emitir({ clase: "baseDeFichero", ruta, base, sinBase: "esta ejecución no puede leer git" });
      return;
    }
    try {
      emitir({ clase: "baseDeFichero", ...(await opciones.baseDeFichero(abierto.raiz, abierto.sesion, ruta, base)) });
    } catch (error) {
      informar(`no se pudo leer la base de «${ruta}» (${codigoDe(error)})`);
      emitir({ clase: "baseDeFichero", ruta, base, sinBase: "no se pudo leer la base" });
    }
  };
```

(d) en el despacho de `POST /accion`, justo después del `if` de `mensaje.clase === "fichero"`:

```ts
    if (
      typeof mensaje === "object" &&
      mensaje !== null &&
      mensaje.clase === "guardarFichero" &&
      typeof mensaje.ruta === "string" &&
      typeof mensaje.texto === "string" &&
      typeof mensaje.huella === "string"
    ) {
      void atenderGuardarFichero(mensaje.ruta, mensaje.texto, mensaje.huella).catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (
      typeof mensaje === "object" &&
      mensaje !== null &&
      mensaje.clase === "baseDeFichero" &&
      typeof mensaje.ruta === "string" &&
      (mensaje.base === "sesion" || mensaje.base === "commit")
    ) {
      void atenderBaseDeFichero(mensaje.ruta, mensaje.base).catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
```

(e) justo antes del comentario de `emuladoresCableados`:

```ts
/**
 * Los tres puertos de la pestaña Ficheros —leer, guardar y la base de las marcas—, cableados con las
 * funciones de verdad y extraídos por el MISMO motivo que `emuladoresCableados`: dentro de
 * `arrancarConsolaWeb` serían un literal que ningún test mira, y cada uno es un campo OPCIONAL de
 * `montarRutas`, así que olvidarlo compila y pasa.
 */
export function ficherosCableados(): Required<Pick<OpcionesDeMontaje, "leerFichero" | "escribirFichero" | "baseDeFichero">> {
  return { leerFichero: leerFicheroDeProyecto, escribirFichero: escribirFicheroDeProyecto, baseDeFichero };
}
```

(f) en el cableado de `arrancarConsolaWeb` (~:7550), sustituir la línea `leerFichero: leerFicheroDeProyecto,` por:

```ts
    // Leer, guardar y la base del editor, compuestos fuera para que la composición tenga test.
    ...ficherosCableados(),
```

- [ ] **Step 6: Correr y ver que pasa**

Run: `npx vitest run --project host src/core/settings.test.ts src/web/servidor/vestibulo.test.ts src/web/servidor/arranque.test.ts && npx vitest run --project cliente --maxWorkers=2 && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/settings.ts src/core/settings.test.ts src/web/servidor/vestibulo.ts src/web/servidor/vestibulo.test.ts src/web/servidor/transporte.ts src/web/servidor/arranque.ts src/web/servidor/arranque.test.ts apps/web/src/tipos.ts
git commit -m "feat(web): guardar un fichero y pedir su base por el cable, negado por raíz con un turno o una tarea en marcha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tw4TZtdPn7iWwCCoSoS4X9"
```

```json:metadata
{"files": ["src/core/settings.ts", "src/core/settings.test.ts", "src/web/servidor/vestibulo.ts", "src/web/servidor/vestibulo.test.ts", "src/web/servidor/transporte.ts", "src/web/servidor/arranque.ts", "src/web/servidor/arranque.test.ts", "apps/web/src/tipos.ts"], "verifyCommand": "npx vitest run --project host src/core/settings.test.ts src/web/servidor/vestibulo.test.ts src/web/servidor/arranque.test.ts && npx vitest run --project cliente --maxWorkers=2 && npm run typecheck", "acceptanceCriteria": ["motivoParaNoEditarFichero: turno, tarea, otra raíz, mismaRuta", "vestibulo.motivoParaNoEditar con una consola de tarea", "guardarFichero por el cable: ok, turno en vuelo, sin puerto, puerto que lanza sin ruta", "baseDeFichero por el cable, y sinBase sin puerto", "ficherosCableados contra un temporal real y usado en arrancarConsolaWeb", "tipos.test.ts verde"], "modelTier": "standard"}
```

---

### Task 4: CodeMirror en el cliente y las funciones puras

**Goal:** Las dependencias de CodeMirror 6 con versiones exactas y su aviso de licencia; `edicion.ts` (qué se edita, finales de línea, cabe en el cable) y `editor/marcasDeCambio.ts` (trozos de `@codemirror/merge` → marcas, y el cambio de «Deshacer este cambio»), con tests.

**Files:**
- Modify: `apps/web/package.json` (dependencies), `package-lock.json` (raíz)
- Modify: `THIRD_PARTY_NOTICES.md` (sección nueva tras «OpenUI», ~:190)
- Create: `apps/web/src/edicion.ts`
- Test: `apps/web/src/edicion.test.ts`
- Create: `apps/web/src/editor/marcasDeCambio.ts`
- Test: `apps/web/src/editor/marcasDeCambio.test.ts`

**Acceptance Criteria:**
- [ ] `apps/web/package.json` lleva, exactas: `@codemirror/state` 6.7.6, `@codemirror/view` 6.43.13, `@codemirror/commands` 6.11.1, `@codemirror/language` 6.12.4, `@codemirror/search` 6.7.2, `@codemirror/merge` 6.12.2, `@codemirror/lang-xml` 6.1.0, `@codemirror/lang-javascript` 6.2.5, `@codemirror/lang-css` 6.3.1, `@codemirror/lang-markdown` 6.5.2, `@codemirror/lang-json` 6.0.2, `@lezer/highlight` 1.2.5; sin el meta-paquete `codemirror`.
- [ ] `npm ls @codemirror/state` enseña UNA sola versión (6.7.6), deduplicada.
- [ ] `esEditable` solo es cierto con texto entero, UTF-8 o sin codificación, con huella, sin error y sin `mime`.
- [ ] Finales de línea: se detecta el dominante, se normaliza a `\n` y se restaura CRLF; `TOPE_DEL_CUERPO_DEL_CABLE` es igual a `TOPE_DE_CUERPO` de `arranque.ts`.
- [ ] Marcas: sin cambios → ninguna; cambiada, nueva, borrado en medio, al principio (`trasLinea: 0`) y al final; todo nuevo; CRLF contra LF sin marcas; un trozo mixto da cambiadas + borrado; «Deshacer este cambio» de cada caso devuelve exactamente la base.

**Verify:** `npx vitest run --project cliente apps/web/src/edicion.test.ts apps/web/src/editor/marcasDeCambio.test.ts && npm ls @codemirror/state` → PASS y una sola versión

**Steps:**

- [ ] **Step 1: Instalar las dependencias**

```bash
npm install --save-exact --workspace apps/web \
  @codemirror/state@6.7.6 @codemirror/view@6.43.13 @codemirror/commands@6.11.1 \
  @codemirror/language@6.12.4 @codemirror/search@6.7.2 @codemirror/merge@6.12.2 \
  @codemirror/lang-xml@6.1.0 @codemirror/lang-javascript@6.2.5 @codemirror/lang-css@6.3.1 \
  @codemirror/lang-markdown@6.5.2 @codemirror/lang-json@6.0.2 @lezer/highlight@1.2.5
npm ls @codemirror/state
```

Expected: el `npm ls` enseña `@codemirror/state@6.7.6` y las demás apariciones como `deduped`. Si sale una segunda versión, fijar con `overrides` en el `package.json` raíz a `6.7.6` y repetir: dos copias de `@codemirror/state` rompen las extensiones en silencio.

En `THIRD_PARTY_NOTICES.md`, tras la sección de OpenUI:

````markdown
## CodeMirror (el editor de la pestaña Ficheros)

`apps/web/dist/` empaqueta, en un trozo que solo se carga al pulsar «Editar», `@codemirror/state`,
`@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/search`,
`@codemirror/merge`, `@codemirror/lang-xml`, `@codemirror/lang-javascript`, `@codemirror/lang-css`,
`@codemirror/lang-markdown`, `@codemirror/lang-json`, `@lezer/highlight` y sus dependencias
`@lezer/*`, todos con licencia MIT.

```
MIT License

Copyright (C) 2018-2022 by Marijn Haverbeke <marijn@haverbeke.berlin> and others

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
````

- [ ] **Step 2: Escribir los tests que fallan**

`apps/web/src/edicion.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TOPE_DEL_CUERPO_DEL_CABLE,
  cabeEnElCable,
  conFinDeLinea,
  esEditable,
  finDeLineaDe,
  normalizarFinesDeLinea,
} from "./edicion.js";
import type { FicheroDelProyecto } from "./tipos.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const RUTA_ARRANQUE = join(aqui, "..", "..", "..", "src", "web", "servidor", "arranque.ts");

const TEXTO: FicheroDelProyecto = { ruta: "a.xne", texto: "uno", recortado: false, binario: false, bytes: 3, codificacion: "utf-8", huella: "h" };

describe("esEditable", () => {
  it("solo el texto ENTERO en UTF-8, con huella, sin error y que no es imagen", () => {
    expect(esEditable(TEXTO)).toBe(true);
    const { codificacion: _c, ...sinCodificacion } = TEXTO;
    expect(esEditable(sinCodificacion)).toBe(true);
    expect(esEditable(undefined)).toBe(false);
    expect(esEditable({ ...TEXTO, recortado: true })).toBe(false);
    expect(esEditable({ ...TEXTO, codificacion: "latin1" })).toBe(false);
    expect(esEditable({ ...TEXTO, binario: true })).toBe(false);
    expect(esEditable({ ...TEXTO, error: "no existe" })).toBe(false);
    expect(esEditable({ ...TEXTO, mime: "image/svg+xml" })).toBe(false);
    const { huella: _h, ...sinHuella } = TEXTO;
    expect(esEditable(sinHuella)).toBe(false);
  });
});

describe("finales de línea", () => {
  it("detecta el dominante: CRLF solo si son mayoría", () => {
    expect(finDeLineaDe("a\nb\n")).toBe("\n");
    expect(finDeLineaDe("a\r\nb\r\n")).toBe("\r\n");
    expect(finDeLineaDe("a\r\nb\nc\n")).toBe("\n");
    expect(finDeLineaDe("sin saltos")).toBe("\n");
  });

  it("normaliza a \\n y restaura el CRLF al guardar", () => {
    expect(normalizarFinesDeLinea("a\r\nb\rc\n")).toBe("a\nb\nc\n");
    expect(conFinDeLinea("a\nb\n", "\r\n")).toBe("a\r\nb\r\n");
    expect(conFinDeLinea("a\nb\n", "\n")).toBe("a\nb\n");
    expect(conFinDeLinea(normalizarFinesDeLinea("x\r\ny\r\n"), finDeLineaDe("x\r\ny\r\n"))).toBe("x\r\ny\r\n");
  });
});

describe("cabe en el cable", () => {
  it("el tope del cliente es el del cuerpo de POST /accion en el servidor", () => {
    const m = readFileSync(RUTA_ARRANQUE, "utf8").match(/const TOPE_DE_CUERPO = ([\d_]+);/);
    expect(m).not.toBeNull();
    expect(Number(m![1]!.replace(/_/g, ""))).toBe(TOPE_DEL_CUERPO_DEL_CABLE);
  });

  it("mide el mensaje SERIALIZADO en bytes: lo que escapa el JSON también cuenta", () => {
    expect(cabeEnElCable({ clase: "guardarFichero", ruta: "a", texto: "x", huella: "h" })).toBe(true);
    // Un tabulador son dos bytes en JSON: la mitad del tope en tabuladores ya no cabe.
    expect(cabeEnElCable({ clase: "guardarFichero", ruta: "a", texto: "\t".repeat(TOPE_DEL_CUERPO_DEL_CABLE / 2), huella: "h" })).toBe(false);
  });
});
```

`apps/web/src/editor/marcasDeCambio.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cambioDeDeshacer, marcasDeCambio, todoNuevo, trozoDeLaLinea, trozosDeLineas, type TrozoDeLineas } from "./marcasDeCambio.js";

const marcas = (base: string, actual: string) => marcasDeCambio(trozosDeLineas(base, actual));
/** Aplica el cambio de «Deshacer este cambio» sobre el texto unido con «\n». */
const aplicar = (actual: string, trozo: TrozoDeLineas): string => {
  const c = cambioDeDeshacer(actual.split("\n"), trozo);
  return actual.slice(0, c.desde) + c.insertar + actual.slice(c.hasta);
};

describe("marcasDeCambio", () => {
  it("sin cambios no hay ninguna marca", () => {
    const m = marcas("a\nb\nc", "a\nb\nc");
    expect(m.trozos).toEqual([]);
    expect(m.cuentas).toEqual({ cambiadas: 0, nuevas: 0, borradas: 0 });
  });

  it("una línea cambiada", () => {
    const m = marcas("a\nb\nc", "a\nB\nc");
    expect([...m.lineas]).toEqual([[2, { clase: "cambiada", trozo: 0 }]]);
    expect(m.borrados).toEqual([]);
    expect(m.cuentas).toEqual({ cambiadas: 1, nuevas: 0, borradas: 0 });
  });

  it("una línea nueva en medio", () => {
    const m = marcas("a\nb\nc", "a\nb\nx\nc");
    expect([...m.lineas]).toEqual([[3, { clase: "nueva", trozo: 0 }]]);
    expect(m.cuentas).toEqual({ cambiadas: 0, nuevas: 1, borradas: 0 });
  });

  it("un borrado en medio va ENTRE líneas: detrás de la que queda arriba", () => {
    const m = marcas("a\nb\nc", "a\nc");
    expect([...m.lineas]).toEqual([]);
    expect(m.borrados).toEqual([{ trasLinea: 1, trozo: 0 }]);
    expect(m.cuentas).toEqual({ cambiadas: 0, nuevas: 0, borradas: 1 });
  });

  it("borrar la última línea no marca como cambiada la de arriba, aunque perdiera su salto", () => {
    // El diff de CodeMirror trae aquí «b\nc» contra «b»: se recortan las líneas iguales de los bordes.
    const m = marcas("a\nb\nc", "a\nb");
    expect([...m.lineas]).toEqual([]);
    expect(m.borrados).toEqual([{ trasLinea: 2, trozo: 0 }]);
  });

  it("borrar la primera línea pone el borrado ANTES de la primera (trasLinea 0)", () => {
    const m = marcas("a\nb\nc", "b\nc");
    expect(m.borrados).toEqual([{ trasLinea: 0, trozo: 0 }]);
    expect(trozoDeLaLinea(m, 1)).toBe(0);
  });

  it("todo nuevo: cada línea es nueva", () => {
    const m = marcasDeCambio(todoNuevo("x\ny"));
    expect([...m.lineas]).toEqual([
      [1, { clase: "nueva", trozo: 0 }],
      [2, { clase: "nueva", trozo: 0 }],
    ]);
    expect(m.cuentas).toEqual({ cambiadas: 0, nuevas: 2, borradas: 0 });
  });

  it("el mismo texto en CRLF contra la base en LF no tiene marcas", () => {
    expect(marcas("a\nb\n", "a\r\nb\r\n").trozos).toEqual([]);
  });

  it("tres líneas que se vuelven una: una cambiada y dos borradas debajo", () => {
    const m = marcas("a\nb\nc\nd\ne", "a\nX\ne");
    expect([...m.lineas]).toEqual([[2, { clase: "cambiada", trozo: 0 }]]);
    expect(m.borrados).toEqual([{ trasLinea: 2, trozo: 0 }]);
    expect(m.cuentas).toEqual({ cambiadas: 1, nuevas: 0, borradas: 2 });
  });

  it("trozoDeLaLinea encuentra el trozo de una línea marcada, y nada en una sin marca", () => {
    const m = marcas("a\nb\nc", "a\nB\nc");
    expect(trozoDeLaLinea(m, 2)).toBe(0);
    expect(trozoDeLaLinea(m, 1)).toBeUndefined();
  });
});

describe("cambioDeDeshacer devuelve SOLO ese trozo a la base", () => {
  it.each([
    ["cambiada", "a\nb\nc", "a\nB\nc"],
    ["nueva en medio", "a\nb\nc", "a\nb\nx\nc"],
    ["nueva al final", "a\nb\nc", "a\nb\nc\nd"],
    ["borrado en medio", "a\nb\nc", "a\nc"],
    ["borrado al principio", "a\nb\nc", "b\nc"],
    ["borrado al final", "a\nb\nc", "a\nb"],
    ["mixto", "a\nb\nc\nd\ne", "a\nX\ne"],
  ])("%s", (_caso, base, actual) => {
    const m = marcas(base, actual);
    expect(m.trozos).toHaveLength(1);
    expect(aplicar(actual, m.trozos[0]!)).toBe(base);
  });

  it("todo nuevo: deshacerlo deja el documento vacío", () => {
    const m = marcasDeCambio(todoNuevo("x\ny"));
    expect(aplicar("x\ny", m.trozos[0]!)).toBe("");
  });

  it("con dos trozos, deshacer uno deja el otro como estaba", () => {
    const m = marcas("a\nb\nc\nd", "A\nb\nc\nD");
    expect(m.trozos).toHaveLength(2);
    expect(aplicar("A\nb\nc\nD", m.trozos[1]!)).toBe("A\nb\nc\nd");
  });
});
```

- [ ] **Step 3: Correrlos y ver que fallan**

Run: `npx vitest run --project cliente apps/web/src/edicion.test.ts apps/web/src/editor/marcasDeCambio.test.ts`
Expected: FAIL — no existen `./edicion.js` ni `./marcasDeCambio.js`.

- [ ] **Step 4: Implementar**

`apps/web/src/edicion.ts`:

```ts
import type { FicheroDelProyecto, MensajeDelCliente } from "./tipos.js";

/**
 * Las reglas PURAS del editor de la pestaña Ficheros que no necesitan CodeMirror: qué se puede
 * editar, los finales de línea y si un guardado cabe por el cable. Viven fuera de `editor/` a
 * propósito: las usa `App` (`usarEdicion.ts`), y a `editor/` solo se llega con `import()`.
 */

/**
 * Un fichero se edita si y solo si llegó como texto ENTERO en UTF-8 y con huella: un latin1
 * guardado como UTF-8 cambiaría cada «ñ», uno recortado se guardaría cortado, y sin huella no hay
 * forma de saber si el disco cambió. Una imagen tampoco —ni el SVG, que tiene texto—: así lo pide
 * el diseño, y su visor enseña el dibujo, que no se repintaría al teclear.
 */
export function esEditable(f: FicheroDelProyecto | undefined): f is FicheroDelProyecto & { texto: string; huella: string } {
  return (
    f !== undefined &&
    f.error === undefined &&
    typeof f.texto === "string" &&
    typeof f.huella === "string" &&
    !f.recortado &&
    !f.binario &&
    (f.codificacion === undefined || f.codificacion === "utf-8") &&
    f.mime === undefined
  );
}

export type FinDeLinea = "\n" | "\r\n";

/**
 * El final de línea DOMINANTE. El editor trabaja siempre con «\n» y se le devuelve al fichero el
 * suyo al guardar: un `.xne` hecho en Windows sigue en CRLF. Un fichero con los dos mezclados sale
 * con el dominante —límite declarado—, que es lo que haría cualquier editor que normaliza.
 */
export function finDeLineaDe(texto: string): FinDeLinea {
  const crlf = (texto.match(/\r\n/g) ?? []).length;
  const lf = (texto.match(/\n/g) ?? []).length - crlf;
  return crlf > lf ? "\r\n" : "\n";
}

/** Todo a «\n»: también el «\r» suelto, que CodeMirror ya trata como salto. */
export function normalizarFinesDeLinea(texto: string): string {
  return texto.replace(/\r\n?/g, "\n");
}

export function conFinDeLinea(texto: string, fin: FinDeLinea): string {
  return fin === "\n" ? texto : texto.replace(/\n/g, "\r\n");
}

/**
 * El tope del cuerpo de `POST /accion` en el servidor (`arranque.ts#TOPE_DE_CUERPO`), copiado
 * porque la frontera no deja importarlo y atado por test. Pasarlo da un 400 sin mensaje que
 * pintar, así que se comprueba ANTES de mandar y se dice.
 */
export const TOPE_DEL_CUERPO_DEL_CABLE = 1_000_000;

/** En BYTES del mensaje ya serializado: el JSON escapa saltos y tabuladores, y eso también viaja. */
export function cabeEnElCable(mensaje: MensajeDelCliente): boolean {
  return new TextEncoder().encode(JSON.stringify(mensaje)).length <= TOPE_DEL_CUERPO_DEL_CABLE;
}
```

`apps/web/src/editor/marcasDeCambio.ts`:

```ts
import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import { normalizarFinesDeLinea } from "../edicion.js";

/**
 * De «lo que había» (la base) y «lo que hay» (el editor) a las marcas del margen: cambiada,
 * nueva y borrado.
 *
 * Los trozos los calcula el motor de diff OFICIAL de CodeMirror (`Chunk.build` de
 * `@codemirror/merge`); lo que es nuestro —y tiene test— es la traducción a marcas y el cambio
 * que deshace un trozo. Vive en `editor/` porque importa CodeMirror, y a `editor/` solo se llega
 * con `import()` (`editor/frontera.test.ts`).
 */

/** Un trozo en LÍNEAS (1-based). Con `lineasB` vacío es un borrado delante de la línea `desdeB`. */
export interface TrozoDeLineas {
  desdeA: number;
  lineasA: readonly string[];
  desdeB: number;
  lineasB: readonly string[];
}

export type ClaseDeMarca = "cambiada" | "nueva";
export interface MarcaDeLinea {
  clase: ClaseDeMarca;
  trozo: number;
}
/** Un borrado va ENTRE líneas: detrás de `trasLinea`, y `0` es antes de la primera. */
export interface MarcaDeBorrado {
  trasLinea: number;
  trozo: number;
}
export interface MarcasDeCambio {
  trozos: readonly TrozoDeLineas[];
  lineas: ReadonlyMap<number, MarcaDeLinea>;
  borrados: readonly MarcaDeBorrado[];
  cuentas: { cambiadas: number; nuevas: number; borradas: number };
}

export const SIN_MARCAS: MarcasDeCambio = { trozos: [], lineas: new Map(), borrados: [], cuentas: { cambiadas: 0, nuevas: 0, borradas: 0 } };

/** Las líneas que cubre `[desde, hasta)`. `hasta` puede pasar en uno del final (ver `Chunk.toA`). */
function lineasEntre(texto: Text, desde: number, hasta: number): string[] {
  if (hasta <= desde) return [];
  const primera = texto.lineAt(desde).number;
  const ultima = texto.lineAt(Math.min(hasta - 1, texto.length)).number;
  const salida: string[] = [];
  for (let n = primera; n <= ultima; n++) salida.push(texto.line(n).text);
  return salida;
}

/**
 * Los trozos de CodeMirror pasados a líneas. Los dos textos se normalizan a «\n» antes: con un
 * fichero en CRLF —o una copia con `autocrlf`— cada línea saldría cambiada.
 */
export function trozosDeLineas(base: string, actual: string): TrozoDeLineas[] {
  const a = Text.of(normalizarFinesDeLinea(base).split("\n"));
  const b = Text.of(normalizarFinesDeLinea(actual).split("\n"));
  return Chunk.build(a, b).map((c) => ({
    desdeA: a.lineAt(Math.min(c.fromA, a.length)).number,
    lineasA: lineasEntre(a, c.fromA, c.toA),
    desdeB: b.lineAt(Math.min(c.fromB, b.length)).number,
    lineasB: lineasEntre(b, c.fromB, c.toB),
  }));
}

/**
 * Un fichero que en la base no existía (`vacio`): todo él es nuevo. Explícito y no un diff contra
 * «»: CodeMirror ve en un texto vacío una línea vacía, y saldría una «cambiada» que no lo es.
 */
export function todoNuevo(actual: string): TrozoDeLineas[] {
  return [{ desdeA: 1, lineasA: [], desdeB: 1, lineasB: normalizarFinesDeLinea(actual).split("\n") }];
}

/**
 * Quita las líneas IGUALES de los dos bordes de un trozo. El diff es de caracteres extendido a
 * líneas, así que borrar la última línea llega como «b\nc» contra «b»: sin recortar, «b» saldría
 * cambiada sin que nada visible haya cambiado. `undefined` si no queda nada.
 */
export function recortarTrozo(t: TrozoDeLineas): TrozoDeLineas | undefined {
  let desdeA = t.desdeA;
  let desdeB = t.desdeB;
  const a = [...t.lineasA];
  const b = [...t.lineasB];
  while (a.length > 0 && b.length > 0 && a[0] === b[0]) {
    a.shift();
    b.shift();
    desdeA += 1;
    desdeB += 1;
  }
  while (a.length > 0 && b.length > 0 && a[a.length - 1] === b[b.length - 1]) {
    a.pop();
    b.pop();
  }
  if (a.length === 0 && b.length === 0) return undefined;
  return { desdeA, lineasA: a, desdeB, lineasB: b };
}

/**
 * Las marcas de unos trozos. En un trozo con líneas a los dos lados, las primeras se emparejan
 * (cambiadas), las que sobran del actual son nuevas y las que faltan, un borrado debajo: así las
 * cuentas cuadran con la diferencia de líneas entre los dos textos.
 */
export function marcasDeCambio(brutos: readonly TrozoDeLineas[]): MarcasDeCambio {
  const trozos = brutos.map(recortarTrozo).filter((t): t is TrozoDeLineas => t !== undefined);
  const lineas = new Map<number, MarcaDeLinea>();
  const borrados: MarcaDeBorrado[] = [];
  const cuentas = { cambiadas: 0, nuevas: 0, borradas: 0 };
  trozos.forEach((t, trozo) => {
    const comunes = Math.min(t.lineasA.length, t.lineasB.length);
    for (let k = 0; k < t.lineasB.length; k++) {
      lineas.set(t.desdeB + k, { clase: k < comunes ? "cambiada" : "nueva", trozo });
    }
    cuentas.cambiadas += comunes;
    cuentas.nuevas += t.lineasB.length - comunes;
    if (t.lineasA.length > t.lineasB.length) {
      borrados.push({ trasLinea: t.desdeB + t.lineasB.length - 1, trozo });
      cuentas.borradas += t.lineasA.length - comunes;
    }
  });
  return { trozos, lineas, borrados, cuentas };
}

/** El trozo al que pertenece una línea pulsada en el margen: el suyo, o el borrado que lleva encima. */
export function trozoDeLaLinea(m: MarcasDeCambio, linea: number): number | undefined {
  const propia = m.lineas.get(linea);
  if (propia !== undefined) return propia.trozo;
  return m.borrados.find((b) => Math.max(b.trasLinea, 1) === linea)?.trozo;
}

/**
 * El cambio que devuelve SOLO ese trozo al texto de la base, en posiciones del documento unido con
 * «\n» (`actual` son sus líneas, `Text.toJSON()`). Es una edición más: se deshace con Cmd/Ctrl+Z y
 * hay que guardar.
 */
export function cambioDeDeshacer(actual: readonly string[], t: TrozoDeLineas): { desde: number; hasta: number; insertar: string } {
  let inicio = 0;
  for (let i = 0; i < t.desdeB - 1 && i < actual.length; i++) inicio += actual[i]!.length + 1;
  const total = actual.reduce((n, l) => n + l.length, 0) + Math.max(actual.length - 1, 0);
  const antes = t.lineasA.join("\n");
  if (t.lineasB.length > 0) {
    const fin = inicio + t.lineasB.join("\n").length;
    if (t.lineasA.length > 0) return { desde: inicio, hasta: fin, insertar: antes };
    // Líneas nuevas: se van con UN salto, el de detrás si lo hay y si no el de delante.
    if (fin < total) return { desde: inicio, hasta: fin + 1, insertar: "" };
    return { desde: Math.max(inicio - 1, 0), hasta: fin, insertar: "" };
  }
  if (t.desdeB <= actual.length) return { desde: inicio, hasta: inicio, insertar: `${antes}\n` };
  return { desde: total, hasta: total, insertar: `\n${antes}` };
}
```

- [ ] **Step 5: Correr y ver que pasan**

Run: `npx vitest run --project cliente apps/web/src/edicion.test.ts apps/web/src/editor/marcasDeCambio.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json package-lock.json THIRD_PARTY_NOTICES.md apps/web/src/edicion.ts apps/web/src/edicion.test.ts apps/web/src/editor/marcasDeCambio.ts apps/web/src/editor/marcasDeCambio.test.ts
git commit -m "feat(web): CodeMirror 6 con versiones exactas, y las reglas puras del editor y de sus marcas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tw4TZtdPn7iWwCCoSoS4X9"
```

```json:metadata
{"files": ["apps/web/package.json", "package-lock.json", "THIRD_PARTY_NOTICES.md", "apps/web/src/edicion.ts", "apps/web/src/edicion.test.ts", "apps/web/src/editor/marcasDeCambio.ts", "apps/web/src/editor/marcasDeCambio.test.ts"], "verifyCommand": "npx vitest run --project cliente apps/web/src/edicion.test.ts apps/web/src/editor/marcasDeCambio.test.ts && npm ls @codemirror/state", "acceptanceCriteria": ["doce paquetes con versión exacta y sin el meta-paquete", "una sola @codemirror/state", "esEditable", "finales de línea y tope del cable atado al del servidor", "marcas y deshacer de cada caso de borde"], "modelTier": "standard"}
```

---

### Task 5: El estado de la edición: store y `usarEdicion`

**Goal:** El store copia `huella`, `ficheroGuardado` y `baseDeFichero` por lista blanca; `usarEdicion` lleva en `App` el estado de la edición —abrir, cambiar, guardar con la huella y CRLF restaurado, la respuesta, la versión nueva del disco, la base— sin depender de que el editor esté montado.

**Files:**
- Modify: `apps/web/src/store.ts` (`EstadoDelCliente` ~:306; `case "fichero"` ~:1792; casos nuevos tras él; tirar `bases` en el cambio de sesión ~:2146 y sin cable ~:2269)
- Test: `apps/web/src/store.test.ts` (describe nuevo al final)
- Create: `apps/web/src/usarEdicion.ts`
- Test: `apps/web/src/usarEdicion.test.tsx`

**Acceptance Criteria:**
- [ ] El store guarda `huella` en el contenido; cada `ficheroGuardado` sube `ultimoGuardado.secuencia` aunque repita lo mismo; `baseDeFichero` se guarda por ruta y una `base` desconocida se tira; `bases` se tira con la sesión y sin cable; `ultimoGuardado` no.
- [ ] `abrir` de un fichero editable pide `baseDeFichero` con `"sesion"`; uno no editable no hace nada.
- [ ] `cambiar` marca y desmarca `sucio`; `guardar` manda `guardarFichero` con la huella y el texto con su CRLF; sin cambios no manda nada; demasiado grande → error sin mandar.
- [ ] Respuesta con huella → limpio, y pide `fichero`, `revision` y la base; con error → lo enseña; de otra pestaña (sin guardado en vuelo) → pide `fichero`.
- [ ] Versión nueva del disco: sin cambios se recarga sola (`generacion` sube); con cambios sale `versionNueva` sin tocar el texto vivo; «Recargar» la aplica; «Seguir con los míos» la quita y la misma huella no la vuelve a sacar.
- [ ] Cambiar de proyecto suelta la edición; el cable caído con un guardado en vuelo lo dice.
- [ ] `haySinGuardar()` contesta con el estado escrito al momento: tras `cerrar()` es falso sin esperar a repintar.

**Verify:** `npx vitest run --project cliente apps/web/src/store.test.ts apps/web/src/usarEdicion.test.tsx` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests que fallan**

Al final de `apps/web/src/store.test.ts`:

```ts
describe("store: guardar desde el editor y la base de sus marcas", () => {
  const ALTA = { clase: "alta", pasos: [], proveedores: [], entornos: [], proyectos: [], ramas: [], proyectoAbierto: true };

  it("el fichero trae su huella: un campo nuevo no llega hasta que se nombra en la lista blanca", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "fichero", ruta: "a.xne", texto: "uno", recortado: false, binario: false, bytes: 3, codificacion: "utf-8", huella: "h1" });
    expect(s.leer().contenidos?.["a.xne"]?.huella).toBe("h1");
  });

  it("cada «ficheroGuardado» sube la secuencia, aunque repita lo mismo", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "ficheroGuardado", ruta: "a.xne", error: "el fichero cambió desde que lo abriste: recárgalo antes de guardar" });
    expect(s.leer().ultimoGuardado).toEqual({ ruta: "a.xne", error: "el fichero cambió desde que lo abriste: recárgalo antes de guardar", secuencia: 1 });
    s.aplicar({ clase: "ficheroGuardado", ruta: "a.xne", error: "el fichero cambió desde que lo abriste: recárgalo antes de guardar" });
    expect(s.leer().ultimoGuardado?.secuencia).toBe(2);
    s.aplicar({ clase: "ficheroGuardado", ruta: "a.xne", huella: "h2", basura: "no viaja" });
    expect(s.leer().ultimoGuardado).toEqual({ ruta: "a.xne", huella: "h2", secuencia: 3 });
  });

  it("«baseDeFichero» se guarda por ruta con lo que trae, y una base desconocida se tira", () => {
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "baseDeFichero", ruta: "a.xne", base: "sesion", texto: "antes" });
    s.aplicar({ clase: "baseDeFichero", ruta: "b.xne", base: "commit", vacio: true });
    s.aplicar({ clase: "baseDeFichero", ruta: "c.xne", base: "sesion", sinBase: "el proyecto no está en un repositorio git" });
    s.aplicar({ clase: "baseDeFichero", ruta: "d.xne", base: "ayer", texto: "x" });
    expect(s.leer().bases).toEqual({
      "a.xne": { ruta: "a.xne", base: "sesion", texto: "antes" },
      "b.xne": { ruta: "b.xne", base: "commit", vacio: true },
      "c.xne": { ruta: "c.xne", base: "sesion", sinBase: "el proyecto no está en un repositorio git" },
    });
  });

  it("la base se tira con la sesión y sin cable; el último guardado NO, porque su secuencia es la que se compara", () => {
    const s = crearStoreDelCliente();
    s.marcarConectado();
    s.aplicar({ ...ALTA, sesionActiva: "s1" });
    s.aplicar({ clase: "baseDeFichero", ruta: "a.xne", base: "sesion", texto: "antes" });
    s.aplicar({ clase: "ficheroGuardado", ruta: "a.xne", huella: "h2" });
    s.aplicar({ ...ALTA, sesionActiva: "s2" });
    expect(s.leer().bases).toBeUndefined();
    s.aplicar({ clase: "baseDeFichero", ruta: "a.xne", base: "sesion", texto: "antes" });
    s.marcarDesconectado();
    expect(s.leer().bases).toBeUndefined();
    expect(s.leer().ultimoGuardado?.secuencia).toBe(1);
  });
});
```

`apps/web/src/usarEdicion.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, type Mock } from "vitest";
import { DEMASIADO_GRANDE, SE_CORTO_EL_CABLE, usarEdicion, type UltimoGuardado } from "./usarEdicion.js";
import { TOPE_DEL_CUERPO_DEL_CABLE } from "./edicion.js";
import type { BaseDelFichero, FicheroDelProyecto } from "./tipos.js";

const FICHERO: FicheroDelProyecto = { ruta: "a.xne", texto: "uno\r\ndos\r\n", recortado: false, binario: false, bytes: 10, codificacion: "utf-8", huella: "h1" };

interface Entrada {
  proyecto: string | undefined;
  contenidos: Record<string, FicheroDelProyecto> | undefined;
  bases: Record<string, BaseDelFichero> | undefined;
  ultimoGuardado: UltimoGuardado | undefined;
  conectado: boolean | undefined;
}

function montar(enviar: Mock<(m: unknown) => Promise<unknown>> = vi.fn(() => Promise.resolve(undefined))) {
  const inicial: Entrada = { proyecto: "p1", contenidos: { "a.xne": FICHERO }, bases: undefined, ultimoGuardado: undefined, conectado: true };
  const vista = renderHook((e: Entrada) => usarEdicion({ enviar, ...e }), { initialProps: inicial });
  return { enviar, vista, inicial };
}
const mandados = (enviar: Mock<(m: unknown) => Promise<unknown>>, clase: string) =>
  enviar.mock.calls.map(([m]) => m as { clase: string }).filter((m) => m.clase === clase);

describe("usarEdicion", () => {
  it("abrir un fichero editable pide su base del inicio de la sesión; uno que no lo es no abre nada", () => {
    const { enviar, vista } = montar();
    act(() => vista.result.current.abrir({ ...FICHERO, codificacion: "latin1" }));
    expect(vista.result.current.actual).toBeUndefined();
    act(() => vista.result.current.abrir(FICHERO));
    expect(vista.result.current.actual).toMatchObject({ ruta: "a.xne", original: "uno\ndos\n", huella: "h1", finDeLinea: "\r\n", sucio: false, guardando: false });
    expect(vista.result.current.textoVivo()).toBe("uno\ndos\n");
    expect(enviar).toHaveBeenCalledWith({ clase: "baseDeFichero", ruta: "a.xne", base: "sesion" });
  });

  it("cambiar marca «sucio», y volver al texto de antes lo desmarca", () => {
    const { vista } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("uno\nDOS\n"));
    expect(vista.result.current.actual?.sucio).toBe(true);
    act(() => vista.result.current.cambiar("uno\ndos\n"));
    expect(vista.result.current.actual?.sucio).toBe(false);
  });

  it("guardar manda la huella y el texto con su CRLF; sin cambios no manda nada", () => {
    const { enviar, vista } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.guardar());
    expect(mandados(enviar, "guardarFichero")).toEqual([]);
    act(() => vista.result.current.cambiar("uno\nDOS\n"));
    act(() => vista.result.current.guardar());
    expect(mandados(enviar, "guardarFichero")).toEqual([{ clase: "guardarFichero", ruta: "a.xne", texto: "uno\r\nDOS\r\n", huella: "h1" }]);
    expect(vista.result.current.actual?.guardando).toBe(true);
  });

  it("lo que no cabe por el cable no se manda: se dice", () => {
    const { enviar, vista } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("\t".repeat(TOPE_DEL_CUERPO_DEL_CABLE)));
    act(() => vista.result.current.guardar());
    expect(mandados(enviar, "guardarFichero")).toEqual([]);
    expect(vista.result.current.actual?.error).toBe(DEMASIADO_GRANDE);
  });

  it("la respuesta con huella deja limpio lo que se mandó, y pide fichero, revisión y base", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("uno\nDOS\n"));
    act(() => vista.result.current.guardar());
    enviar.mockClear();
    vista.rerender({ ...inicial, ultimoGuardado: { ruta: "a.xne", huella: "h2", secuencia: 1 } });
    expect(vista.result.current.actual).toMatchObject({ original: "uno\nDOS\n", huella: "h2", sucio: false, guardando: false });
    expect(enviar).toHaveBeenCalledWith({ clase: "fichero", ruta: "a.xne" });
    expect(enviar).toHaveBeenCalledWith({ clase: "revision" });
    expect(enviar).toHaveBeenCalledWith({ clase: "baseDeFichero", ruta: "a.xne", base: "sesion" });
  });

  it("la respuesta con error lo enseña y deja guardar otra vez", () => {
    const { vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("uno\nDOS\n"));
    act(() => vista.result.current.guardar());
    vista.rerender({ ...inicial, ultimoGuardado: { ruta: "a.xne", error: "espera a que termine el turno: el agente está trabajando en este proyecto", secuencia: 1 } });
    expect(vista.result.current.actual).toMatchObject({ guardando: false, sucio: true, error: "espera a que termine el turno: el agente está trabajando en este proyecto" });
  });

  it("un guardado de OTRA pestaña (sin uno en vuelo aquí) es un cambio en disco: se pide el fichero", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    enviar.mockClear();
    vista.rerender({ ...inicial, ultimoGuardado: { ruta: "a.xne", huella: "h9", secuencia: 1 } });
    expect(enviar).toHaveBeenCalledWith({ clase: "fichero", ruta: "a.xne" });
    expect(vista.result.current.actual?.huella).toBe("h1");
  });

  it("una versión nueva sin cambios propios se recarga sola", () => {
    const { vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    const generacion = vista.result.current.actual!.generacion;
    vista.rerender({ ...inicial, contenidos: { "a.xne": { ...FICHERO, texto: "otro\n", huella: "h3" } } });
    expect(vista.result.current.actual).toMatchObject({ original: "otro\n", huella: "h3", sucio: false, finDeLinea: "\n" });
    expect(vista.result.current.actual!.generacion).toBe(generacion + 1);
    expect(vista.result.current.textoVivo()).toBe("otro\n");
  });

  it("una versión nueva con cambios sin guardar NO los pisa: sale la banda, y se elige", () => {
    const { vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("mío\n"));
    const nueva = { ...inicial, contenidos: { "a.xne": { ...FICHERO, texto: "otro\n", huella: "h3" } } };
    vista.rerender(nueva);
    expect(vista.result.current.actual?.versionNueva).toEqual({ original: "otro\n", huella: "h3", finDeLinea: "\n" });
    expect(vista.result.current.textoVivo()).toBe("mío\n");

    act(() => vista.result.current.seguirConLosMios());
    expect(vista.result.current.actual?.versionNueva).toBeUndefined();
    vista.rerender({ ...nueva, contenidos: { "a.xne": { ...FICHERO, texto: "otro\n", huella: "h3" } } });
    expect(vista.result.current.actual?.versionNueva).toBeUndefined(); // la misma huella no vuelve a salir

    vista.rerender({ ...inicial, contenidos: { "a.xne": { ...FICHERO, texto: "tercero\n", huella: "h4" } } });
    act(() => vista.result.current.recargar());
    expect(vista.result.current.actual).toMatchObject({ original: "tercero\n", huella: "h4", sucio: false });
    expect(vista.result.current.textoVivo()).toBe("tercero\n");
  });

  it("«haySinGuardar» contesta al momento, sin esperar a repintar: tras cerrar ya es falso", () => {
    const { vista } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("mío\n"));
    const control = vista.result.current;
    expect(control.haySinGuardar()).toBe(true);
    act(() => control.cerrar());
    // El mismo objeto, sin repintar entre medias: es lo que ve la acción que sigue a «Descartar».
    expect(control.haySinGuardar()).toBe(false);
  });

  it("cambiar de proyecto suelta la edición: guardar escribe en el ABIERTO", () => {
    const { vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    vista.rerender({ ...inicial, proyecto: "p2" });
    expect(vista.result.current.actual).toBeUndefined();
  });

  it("si se cae el cable con un guardado en vuelo, se dice que no se sabe", () => {
    const { vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    act(() => vista.result.current.cambiar("mío\n"));
    act(() => vista.result.current.guardar());
    vista.rerender({ ...inicial, conectado: false });
    expect(vista.result.current.actual).toMatchObject({ guardando: false, error: SE_CORTO_EL_CABLE });
  });

  it("la base es la de la ruta y la base ELEGIDA; elegir otra la pide", () => {
    const { enviar, vista, inicial } = montar();
    act(() => vista.result.current.abrir(FICHERO));
    vista.rerender({ ...inicial, bases: { "a.xne": { ruta: "a.xne", base: "sesion", texto: "uno\n" } } });
    expect(vista.result.current.base).toEqual({ ruta: "a.xne", base: "sesion", texto: "uno\n" });
    act(() => vista.result.current.elegirBase("commit"));
    expect(vista.result.current.base).toBeUndefined();
    expect(enviar).toHaveBeenCalledWith({ clase: "baseDeFichero", ruta: "a.xne", base: "commit" });
  });
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `npx vitest run --project cliente apps/web/src/store.test.ts apps/web/src/usarEdicion.test.tsx`
Expected: FAIL — `huella`, `ultimoGuardado` y `bases` no se copian; `./usarEdicion.js` no existe.

- [ ] **Step 3: El store**

En `apps/web/src/store.ts`, añadir `BaseDelFichero` a la importación de tipos de `"./tipos.js"`. En `EstadoDelCliente`, después de `contenidos?: Record<string, FicheroDelProyecto>;`:

```ts
  /**
   * La última respuesta a un guardado del editor, de CUALQUIER pestaña (el servidor la manda a
   * todas). `secuencia` sube con cada una y es lo que `usarEdicion` compara —dos rechazos iguales
   * seguidos son dos respuestas—, por eso esto NO se tira nunca: tirarlo reiniciaría la cuenta y
   * la siguiente respuesta se confundiría con una ya vista.
   */
  ultimoGuardado?: { ruta: string; huella?: string; error?: string; secuencia: number };
  /** La base de comparación del editor, por ruta (la última que llegó). Una foto de git: se tira
   *  con la sesión y sin cable, como los parches. */
  bases?: Record<string, BaseDelFichero>;
```

En `case "fichero"`, junto a la línea de `vista`:

```ts
                // La huella del editor, por la misma trampa: sin nombrarla aquí no hay «Editar».
                ...(typeof m.huella === "string" ? { huella: m.huella } : {}),
```

Justo después del `case "fichero"` completo:

```ts
        case "ficheroGuardado": {
          const m = mensaje as { ruta?: unknown; huella?: unknown; error?: unknown };
          if (typeof m.ruta !== "string") return;
          mutar({
            ultimoGuardado: {
              ruta: m.ruta,
              ...(typeof m.huella === "string" ? { huella: m.huella } : {}),
              ...(typeof m.error === "string" ? { error: m.error } : {}),
              secuencia: (estado.ultimoGuardado?.secuencia ?? 0) + 1,
            },
          });
          return;
        }
        case "baseDeFichero": {
          const m = mensaje as { ruta?: unknown; base?: unknown; texto?: unknown; vacio?: unknown; sinBase?: unknown };
          if (typeof m.ruta !== "string" || (m.base !== "sesion" && m.base !== "commit")) return;
          mutar({
            bases: {
              ...estado.bases,
              [m.ruta]: {
                ruta: m.ruta,
                base: m.base,
                ...(typeof m.texto === "string" ? { texto: m.texto } : {}),
                ...(m.vacio === true ? { vacio: true as const } : {}),
                ...(typeof m.sinBase === "string" ? { sinBase: m.sinBase } : {}),
              },
            },
          });
          return;
        }
```

En el `mutar` del cambio de sesión (~:2146), añadir `bases: undefined` a la lista que se tira con `cambioDeSesion` (junto a `contenidos: undefined`). En `marcarDesconectado` (~:2269), justo después de `contenidos: undefined,`:

```ts
        // La base de las marcas del editor, por lo mismo que los contenidos. `ultimoGuardado` NO
        // se tira: su secuencia es la que se compara (ver su declaración).
        bases: undefined,
```

- [ ] **Step 4: El hook**

`apps/web/src/usarEdicion.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cabeEnElCable, conFinDeLinea, esEditable, finDeLineaDe, normalizarFinesDeLinea, type FinDeLinea } from "./edicion.js";
import type { BaseDelFichero, BaseElegida, FicheroDelProyecto, MensajeDelCliente } from "./tipos.js";

/**
 * La edición de un fichero en la pestaña Ficheros, viviendo en `App` y NO en el editor.
 *
 * Por qué aquí: el editor es un componente diferido que se DESMONTA cada vez que el panel cambia
 * de pestaña, se pliega por falta de sitio o cede al chat ante una aprobación. Si el texto viviera
 * en CodeMirror, cualquiera de esos tres se lo llevaría. Aquí está el texto vivo (en un `ref`: no
 * repinta `App` en cada tecla) y el estado que sí se pinta —sucio, guardando, el error, la versión
 * nueva del disco—; el editor se remonta con `key` y el texto de aquí cuando hace falta.
 */

export interface VersionDelDisco {
  original: string;
  huella: string;
  finDeLinea: FinDeLinea;
}

export interface EstadoDeEdicion {
  ruta: string;
  /** El proyecto en el que se abrió: guardar escribe en el ABIERTO, así que si cambia se suelta. */
  proyecto: string | undefined;
  /** El texto cargado (o el último guardado), con los finales de línea ya en «\n». */
  original: string;
  huella: string;
  finDeLinea: FinDeLinea;
  sucio: boolean;
  guardando: boolean;
  error?: string;
  /** Llegó otra versión del disco con cambios sin guardar: no se pisan, se pregunta. */
  versionNueva?: VersionDelDisco;
  /** La huella de una versión nueva a la que se dijo «Seguir con los míos»: no vuelve a salir. */
  descartada?: string;
  /** Sube cada vez que el texto se reemplaza desde fuera: el editor se rehace con esta `key`. */
  generacion: number;
}

export interface UltimoGuardado {
  ruta: string;
  huella?: string;
  error?: string;
  secuencia: number;
}

export interface ControlDeEdicion {
  actual: EstadoDeEdicion | undefined;
  /** La base de la ruta en edición y la base ELEGIDA; `undefined` = pidiéndola. */
  base: BaseDelFichero | undefined;
  baseElegida: BaseElegida;
  textoVivo: () => string;
  /**
   * ¿Hay cambios sin guardar AHORA? Lee el estado escrito al momento, no el del último render: tras
   * «Descartar», la acción pendiente corre en el mismo tic, y si volviera a preguntar con `actual`
   * (aún sucio hasta repintar) sacaría el diálogo otra vez.
   */
  haySinGuardar: () => boolean;
  abrir: (f: FicheroDelProyecto) => void;
  /** Suelta la edición SIN preguntar: la pregunta la hace `App` (`CambiosSinGuardar`). */
  cerrar: () => void;
  cambiar: (texto: string) => void;
  guardar: () => void;
  elegirBase: (base: BaseElegida) => void;
  pedirBase: () => void;
  recargar: () => void;
  seguirConLosMios: () => void;
}

export const DEMASIADO_GRANDE = "el fichero es demasiado grande para guardarlo desde aquí";
export const SE_CORTO_EL_CABLE = "se cortó la conexión antes de saber si se guardó: al volver, recarga el fichero para comprobarlo";

function sinAvisos(a: EstadoDeEdicion): EstadoDeEdicion {
  const { error: _error, versionNueva: _version, descartada: _descartada, ...resto } = a;
  return resto;
}

export function usarEdicion({
  enviar,
  proyecto,
  contenidos,
  bases,
  ultimoGuardado,
  conectado,
}: {
  enviar: (mensaje: MensajeDelCliente) => Promise<unknown>;
  proyecto: string | undefined;
  contenidos: Record<string, FicheroDelProyecto> | undefined;
  bases: Record<string, BaseDelFichero> | undefined;
  ultimoGuardado: UltimoGuardado | undefined;
  conectado: boolean | undefined;
}): ControlDeEdicion {
  const [actual, setActual] = useState<EstadoDeEdicion | undefined>(undefined);
  const [baseElegida, setBaseElegida] = useState<BaseElegida>("sesion");
  // El estado también en un `ref`, escrito a la vez: dos llamadas en el mismo tic (cambiar y
  // guardar con Cmd+S) tienen que ver lo que dejó la primera, no lo del último render.
  const actualRef = useRef<EstadoDeEdicion | undefined>(actual);
  const textoRef = useRef("");
  const enviadoRef = useRef<string | undefined>(undefined);
  // La secuencia ya vista AL MONTAR: una respuesta vieja que siga en el store no es para nosotros.
  const guardadoVisto = useRef(ultimoGuardado?.secuencia ?? 0);

  const fijar = useCallback((siguiente: EstadoDeEdicion | undefined) => {
    actualRef.current = siguiente;
    setActual(siguiente);
  }, []);

  const pedirBaseDe = useCallback(
    (ruta: string, base: BaseElegida) => {
      void enviar({ clase: "baseDeFichero", ruta, base });
    },
    [enviar]
  );

  const abrir = useCallback(
    (f: FicheroDelProyecto) => {
      if (!esEditable(f)) return;
      const original = normalizarFinesDeLinea(f.texto);
      textoRef.current = original;
      fijar({
        ruta: f.ruta,
        proyecto,
        original,
        huella: f.huella,
        finDeLinea: finDeLineaDe(f.texto),
        sucio: false,
        guardando: false,
        generacion: (actualRef.current?.generacion ?? 0) + 1,
      });
      pedirBaseDe(f.ruta, baseElegida);
    },
    [proyecto, baseElegida, pedirBaseDe, fijar]
  );

  const cerrar = useCallback(() => {
    textoRef.current = "";
    enviadoRef.current = undefined;
    fijar(undefined);
  }, [fijar]);

  const cambiar = useCallback(
    (texto: string) => {
      textoRef.current = texto;
      const a = actualRef.current;
      if (a === undefined) return;
      const sucio = texto !== a.original;
      if (sucio !== a.sucio) fijar({ ...a, sucio });
    },
    [fijar]
  );

  const fallar = useCallback(
    (ruta: string, error: string) => {
      const a = actualRef.current;
      if (a === undefined || a.ruta !== ruta || !a.guardando) return;
      fijar({ ...a, guardando: false, error });
    },
    [fijar]
  );

  const guardar = useCallback(() => {
    const a = actualRef.current;
    if (a === undefined || a.guardando || !a.sucio) return;
    const mensaje: MensajeDelCliente = {
      clase: "guardarFichero",
      ruta: a.ruta,
      texto: conFinDeLinea(textoRef.current, a.finDeLinea),
      huella: a.huella,
    };
    if (!cabeEnElCable(mensaje)) {
      fijar({ ...a, error: DEMASIADO_GRANDE });
      return;
    }
    // Lo que se manda, no lo que haya al llegar la respuesta: se puede seguir tecleando mientras.
    enviadoRef.current = textoRef.current;
    const { error: _error, ...sinError } = a;
    fijar({ ...sinError, guardando: true });
    enviar(mensaje).then(
      // Un 4xx (el cuerpo no se aceptó) no trae `ficheroGuardado`: sin esto «Guardando…» no se apagaría.
      (respuesta) => {
        if ((respuesta as { ok?: boolean } | undefined)?.ok === false) fallar(a.ruta, "el servidor no aceptó el guardado");
      },
      () => fallar(a.ruta, "no se pudo hablar con el servidor: no se ha guardado")
    );
  }, [enviar, fijar, fallar]);

  // La respuesta a un guardado. Llega a TODAS las pestañas: si aquí no había uno en vuelo para esta
  // ruta, es que otra escribió el fichero, y se trata como un cambio en disco (se pide de nuevo).
  useEffect(() => {
    if (ultimoGuardado === undefined || ultimoGuardado.secuencia === guardadoVisto.current) return;
    guardadoVisto.current = ultimoGuardado.secuencia;
    const a = actualRef.current;
    if (a === undefined || a.ruta !== ultimoGuardado.ruta) return;
    if (!a.guardando) {
      void enviar({ clase: "fichero", ruta: a.ruta });
      return;
    }
    if (ultimoGuardado.huella === undefined) {
      fijar({ ...a, guardando: false, error: ultimoGuardado.error ?? "no se ha guardado" });
      return;
    }
    const guardado = enviadoRef.current ?? textoRef.current;
    enviadoRef.current = undefined;
    fijar({ ...sinAvisos(a), original: guardado, huella: ultimoGuardado.huella, guardando: false, sucio: textoRef.current !== guardado });
    // El visor, la `M` del árbol y las marcas se quedaron con el disco de antes.
    void enviar({ clase: "fichero", ruta: a.ruta });
    void enviar({ clase: "revision" });
    pedirBaseDe(a.ruta, baseElegida);
  }, [ultimoGuardado, enviar, fijar, pedirBaseDe, baseElegida]);

  // Llega otra versión del fichero (al acabar un turno, o porque otra pestaña guardó). Con la
  // misma huella no ha cambiado nada; sin cambios propios se recarga sola; con cambios, NO se pisan.
  const llegado = actual === undefined ? undefined : contenidos?.[actual.ruta];
  useEffect(() => {
    const a = actualRef.current;
    if (a === undefined || a.guardando || !esEditable(llegado) || llegado.ruta !== a.ruta || llegado.huella === a.huella) return;
    if (a.descartada === llegado.huella || a.versionNueva?.huella === llegado.huella) return;
    const version: VersionDelDisco = { original: normalizarFinesDeLinea(llegado.texto), huella: llegado.huella, finDeLinea: finDeLineaDe(llegado.texto) };
    if (a.sucio) {
      fijar({ ...a, versionNueva: version });
      return;
    }
    textoRef.current = version.original;
    fijar({ ...sinAvisos(a), ...version, generacion: a.generacion + 1 });
    pedirBaseDe(a.ruta, baseElegida);
  }, [llegado, fijar, pedirBaseDe, baseElegida]);

  useEffect(() => {
    const a = actualRef.current;
    if (a !== undefined && a.proyecto !== proyecto) cerrar();
  }, [proyecto, cerrar]);

  useEffect(() => {
    const a = actualRef.current;
    if (conectado === false && a?.guardando === true) fijar({ ...a, guardando: false, error: SE_CORTO_EL_CABLE });
  }, [conectado, fijar]);

  // Recargar o cerrar la PÁGINA con cambios sin guardar: el aviso del navegador. Es lo único que
  // un diálogo nuestro no puede parar.
  const sucio = actual?.sucio === true;
  useEffect(() => {
    if (!sucio) return;
    const avisar = (evento: BeforeUnloadEvent): void => {
      evento.preventDefault();
      evento.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio]);

  const recargar = useCallback(() => {
    const a = actualRef.current;
    const v = a?.versionNueva;
    if (a === undefined || v === undefined) return;
    textoRef.current = v.original;
    fijar({ ...sinAvisos(a), ...v, sucio: false, generacion: a.generacion + 1 });
    pedirBaseDe(a.ruta, baseElegida);
  }, [fijar, pedirBaseDe, baseElegida]);

  const seguirConLosMios = useCallback(() => {
    const a = actualRef.current;
    const v = a?.versionNueva;
    if (a === undefined || v === undefined) return;
    const { versionNueva: _version, ...resto } = a;
    fijar({ ...resto, descartada: v.huella });
  }, [fijar]);

  const elegirBase = useCallback(
    (base: BaseElegida) => {
      setBaseElegida(base);
      const a = actualRef.current;
      if (a !== undefined) pedirBaseDe(a.ruta, base);
    },
    [pedirBaseDe]
  );

  const pedirBase = useCallback(() => {
    const a = actualRef.current;
    if (a !== undefined) pedirBaseDe(a.ruta, baseElegida);
  }, [pedirBaseDe, baseElegida]);

  const textoVivo = useCallback(() => textoRef.current, []);
  const haySinGuardar = useCallback(() => actualRef.current?.sucio === true, []);

  const deLaRuta = actual === undefined ? undefined : bases?.[actual.ruta];
  const base = deLaRuta !== undefined && deLaRuta.base === baseElegida ? deLaRuta : undefined;

  return useMemo(
    () => ({ actual, base, baseElegida, textoVivo, haySinGuardar, abrir, cerrar, cambiar, guardar, elegirBase, pedirBase, recargar, seguirConLosMios }),
    [actual, base, baseElegida, textoVivo, haySinGuardar, abrir, cerrar, cambiar, guardar, elegirBase, pedirBase, recargar, seguirConLosMios]
  );
}
```

- [ ] **Step 5: Correr y ver que pasan**

Run: `npx vitest run --project cliente apps/web/src/store.test.ts apps/web/src/usarEdicion.test.tsx apps/web/src/tipos.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/store.ts apps/web/src/store.test.ts apps/web/src/usarEdicion.ts apps/web/src/usarEdicion.test.tsx
git commit -m "feat(web): el estado de la edición vive en App, con la huella, la respuesta y la versión nueva del disco

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tw4TZtdPn7iWwCCoSoS4X9"
```

```json:metadata
{"files": ["apps/web/src/store.ts", "apps/web/src/store.test.ts", "apps/web/src/usarEdicion.ts", "apps/web/src/usarEdicion.test.tsx"], "verifyCommand": "npx vitest run --project cliente apps/web/src/store.test.ts apps/web/src/usarEdicion.test.tsx", "acceptanceCriteria": ["store: huella, secuencia, bases por ruta, qué se tira y qué no", "abrir pide la base de sesión", "cambiar/guardar con huella y CRLF, y el tope del cable", "respuesta ok, con error y de otra pestaña", "versión nueva: recarga sola, banda, recargar y seguir con los míos", "cambio de proyecto y cable caído"], "modelTier": "standard"}
```

---

### Task 6: El editor diferido

**Goal:** `editor/EditorDeFichero.tsx` (exportación por omisión para `React.lazy`): CodeMirror con los cinco lenguajes, el tema por variables CSS, `Cmd/Ctrl+S`, el margen de marcas con el desplegable de «Deshacer este cambio» y la barra de abajo con las cuentas y el selector de base.

**Files:**
- Create: `apps/web/src/editor/EditorDeFichero.tsx`
- Create: `apps/web/src/editor/EditorDeFichero.module.css`
- Create: `apps/web/src/editor/jsdomParaElEditor.ts`
- Test: `apps/web/src/editor/EditorDeFichero.test.tsx`
- Modify: `apps/web/src/componentes/Barra.test.tsx` (:7, la lista `modulos`)

**Acceptance Criteria:**
- [ ] El editor monta en jsdom con el texto, y teclear llama a `alCambiar` con el documento entero.
- [ ] Con una base distinta pinta `[data-marca~="cambiada"]` en el margen y la barra dice «1 cambiada · 0 nuevas · 0 borradas».
- [ ] Pulsar la marca despliega lo de antes con «Deshacer este cambio», y pulsarlo devuelve ese trozo a la base (y llama a `alCambiar`).
- [ ] Con `vacio` cada línea es nueva; con `sinBase` no hay ninguna marca y la barra dice «Sin marcas: <motivo>»; sin base, «Trayendo la base…».
- [ ] `Ctrl+S` (Mod-s) llama a `alGuardar`; el selector llama a `alElegirBase("commit")`.
- [ ] `Barra.test.tsx` recorre también `editor/*.module.css` y sigue en verde; `estilosDelCliente.test.ts` sigue en verde.

**Verify:** `npx vitest run --project cliente apps/web/src/editor/EditorDeFichero.test.tsx apps/web/src/componentes/Barra.test.tsx apps/web/src/estilosDelCliente.test.ts` → PASS

**Steps:**

- [ ] **Step 1: El entorno de jsdom y la prueba de humo**

`apps/web/src/editor/jsdomParaElEditor.ts`:

```ts
/**
 * Lo que jsdom no trae y CodeMirror mide al pintar. Solo lo importan los TESTS (`*.test.tsx`): el
 * navegador lo tiene todo. Se llama en un `beforeAll` y es idempotente: no pisa lo que exista.
 */
export function prepararJsdomParaElEditor(): void {
  const rangos = Range.prototype as unknown as {
    getClientRects?: () => unknown;
    getBoundingClientRect?: () => unknown;
  };
  rangos.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  rangos.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });
  // CodeMirror pregunta `instanceof Window` al medir el scroll; jsdom no siempre lo publica global.
  const global = globalThis as { Window?: unknown };
  if (global.Window === undefined) global.Window = window.constructor;
}
```

`apps/web/src/editor/EditorDeFichero.test.tsx` — empezar SOLO con la prueba de humo, para comprobar el entorno antes de escribir el componente:

```tsx
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { prepararJsdomParaElEditor } from "./jsdomParaElEditor.js";

beforeAll(prepararJsdomParaElEditor);
afterEach(cleanup);

describe("CodeMirror en jsdom", () => {
  it("monta, pinta las líneas y aplica un cambio", async () => {
    const padre = document.createElement("div");
    document.body.append(padre);
    const vista = new EditorView({ parent: padre, state: EditorState.create({ doc: "a\nb\nc" }) });
    await new Promise((r) => setTimeout(r, 30));
    expect(padre.querySelectorAll(".cm-line")).toHaveLength(3);
    vista.dispatch({ changes: { from: 0, insert: "X" } });
    expect(vista.state.doc.toString()).toBe("Xa\nb\nc");
    vista.destroy();
    padre.remove();
  });
});
```

Run: `npx vitest run --project cliente apps/web/src/editor/EditorDeFichero.test.tsx`
Expected: PASS. Si falla por algo que jsdom no trae (un `ReferenceError` o un `getClientRects is not a function`), añadirlo a `prepararJsdomParaElEditor` con el mismo patrón `??=` y repetir antes de seguir.

- [ ] **Step 2: Escribir los tests del componente, que fallan**

Añadir a `apps/web/src/editor/EditorDeFichero.test.tsx` (las importaciones arriba con las demás):

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import EditorDeFichero from "./EditorDeFichero.js";
import type { BaseDelFichero } from "../tipos.js";

const vistaDe = (contenedor: HTMLElement): EditorView => EditorView.findFromDOM(contenedor.querySelector(".cm-editor") as HTMLElement)!;
const BASE = (texto: string): BaseDelFichero => ({ ruta: "a.xne", base: "sesion", texto });

function montar(props: Partial<Parameters<typeof EditorDeFichero>[0]> = {}) {
  const alCambiar = vi.fn();
  const alGuardar = vi.fn();
  const alElegirBase = vi.fn();
  const vista = render(
    <EditorDeFichero
      texto="a\nb\nc"
      lenguaje="xml"
      baseElegida="sesion"
      alCambiar={alCambiar}
      alGuardar={alGuardar}
      alElegirBase={alElegirBase}
      {...props}
    />
  );
  return { ...vista, alCambiar, alGuardar, alElegirBase };
}

describe("EditorDeFichero", () => {
  it("teclear avisa con el documento entero", () => {
    const { container, alCambiar } = montar();
    vistaDe(container).dispatch({ changes: { from: 0, insert: "X" } });
    expect(alCambiar).toHaveBeenLastCalledWith("Xa\nb\nc");
  });

  it("contra una base distinta marca la línea cambiada y lo cuenta abajo", async () => {
    const { container } = montar({ texto: "a\nB\nc", base: BASE("a\nb\nc") });
    await waitFor(() => expect(container.querySelectorAll('[data-marca~="cambiada"]')).toHaveLength(1));
    expect(screen.getByText("1 cambiada · 0 nuevas · 0 borradas")).toBeTruthy();
  });

  it("pulsar la marca enseña lo de antes, y «Deshacer este cambio» devuelve SOLO ese trozo", async () => {
    // En jsdom todas las alturas son cero y el margen resuelve cualquier clic a la PRIMERA línea:
    // por eso el cambio está en la primera.
    const { container, alCambiar } = montar({ texto: "A\nb", base: BASE("a\nb") });
    await waitFor(() => expect(container.querySelector('[data-marca~="cambiada"]')).not.toBeNull());
    fireEvent.mouseDown(container.querySelector('[data-marca~="cambiada"]')!);
    expect(screen.getByText("Antes:")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer este cambio" }));
    expect(vistaDe(container).state.doc.toString()).toBe("a\nb");
    expect(alCambiar).toHaveBeenLastCalledWith("a\nb");
  });

  it("con «vacio» todo es nuevo", async () => {
    const { container } = montar({ texto: "x\ny", base: { ruta: "a.xne", base: "sesion", vacio: true } });
    await waitFor(() => expect(container.querySelectorAll('[data-marca~="nueva"]')).toHaveLength(2));
    expect(screen.getByText("0 cambiadas · 2 nuevas · 0 borradas")).toBeTruthy();
  });

  it("sin base no hay marcas, y la barra dice por qué; mientras llega, que se está trayendo", async () => {
    const { container, rerender, alCambiar, alGuardar, alElegirBase } = montar();
    expect(screen.getByText("Trayendo la base…")).toBeTruthy();
    rerender(
      <EditorDeFichero
        texto="a\nb\nc"
        baseElegida="sesion"
        base={{ ruta: "a.xne", base: "sesion", sinBase: "el proyecto no está en un repositorio git" }}
        alCambiar={alCambiar}
        alGuardar={alGuardar}
        alElegirBase={alElegirBase}
      />
    );
    expect(screen.getByText("Sin marcas: el proyecto no está en un repositorio git")).toBeTruthy();
    expect(container.querySelector("[data-marca]")).toBeNull();
  });

  it("Mod-s guarda, y el selector elige la base", () => {
    const { container, alGuardar, alElegirBase } = montar();
    // En jsdom `navigator.platform` no es Mac, así que «Mod» es Ctrl; con Meta además no casaría.
    fireEvent.keyDown(container.querySelector(".cm-content")!, { key: "s", ctrlKey: true });
    expect(alGuardar).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Comparar con"), { target: { value: "commit" } });
    expect(alElegirBase).toHaveBeenCalledWith("commit");
  });
});
```

Run: `npx vitest run --project cliente apps/web/src/editor/EditorDeFichero.test.tsx`
Expected: FAIL — no existe `./EditorDeFichero.js`.

- [ ] **Step 3: Implementar el componente**

`apps/web/src/editor/EditorDeFichero.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorState, Prec, RangeSet, StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  WidgetType,
  drawSelection,
  gutter,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type DecorationSet,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { classHighlighter } from "@lezer/highlight";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import type { BaseDelFichero, BaseElegida } from "../tipos.js";
import {
  SIN_MARCAS,
  cambioDeDeshacer,
  marcasDeCambio,
  todoNuevo,
  trozoDeLaLinea,
  trozosDeLineas,
  type MarcasDeCambio,
  type TrozoDeLineas,
} from "./marcasDeCambio.js";
import estilos from "./EditorDeFichero.module.css";

/**
 * El editor de la pestaña Ficheros. Se carga en DIFERIDO (`React.lazy` en `Ficheros.tsx`): quien no
 * edita no paga CodeMirror. Por eso la exportación es la de omisión, y por eso nada fuera de
 * `editor/` lo importa de forma estática (`editor/frontera.test.ts`).
 *
 * - **El texto no es suyo**: lo recibe al montar y avisa de cada cambio (`alCambiar`); quien lo
 *   guarda es `App` (`usarEdicion.ts`). Para cambiar el texto desde fuera se REMONTA con otra
 *   `key`, no se le empuja: dos dueños del mismo documento acaban pisándose.
 * - **El tema son variables CSS** de `EditorDeFichero.module.css` (`classHighlighter` pone las
 *   clases `.tok-*`, y la hoja las pinta con `--shiki-token-*` y los alias del puente). Nada de
 *   `EditorView.theme` con colores: escaparía a `Barra.test.tsx` y no seguiría los temas.
 * - **Las marcas** se recalculan con el motor de diff de CodeMirror a `MS_ENTRE_DIFFS` de la última
 *   tecla, contra la base que llega por props. Sin base, ninguna marca —y la barra dice por qué—.
 */

/** Cuánto se espera tras la última tecla para recalcular las marcas: un diff por tecla en un
 *  fichero grande se notaría al escribir. */
export const MS_ENTRE_DIFFS = 150;

export interface PropsDelEditor {
  texto: string;
  lenguaje?: string;
  base?: BaseDelFichero;
  baseElegida: BaseElegida;
  alCambiar: (texto: string) => void;
  alGuardar: () => void;
  alElegirBase: (base: BaseElegida) => void;
}

/** Los cinco lenguajes del diseño; lo demás (ini, html…) como texto plano. */
function lenguajeDelEditor(lenguaje: string | undefined): Extension {
  switch (lenguaje) {
    case "xml":
      return xml();
    case "javascript":
      return javascript();
    case "css":
      return css();
    case "markdown":
      return markdown();
    case "json":
      return json();
    default:
      return [];
  }
}

const fijarMarcas = StateEffect.define<MarcasDeCambio>();
const abrirTrozo = StateEffect.define<number | undefined>();

const campoDeMarcas = StateField.define<MarcasDeCambio>({
  create: () => SIN_MARCAS,
  update(valor, tr) {
    for (const e of tr.effects) if (e.is(fijarMarcas)) return e.value;
    return valor;
  },
});

/** El trozo desplegado. Un cambio de texto o de marcas lo cierra: los índices ya no apuntan a lo mismo. */
const campoAbierto = StateField.define<number | undefined>({
  create: () => undefined,
  update(valor, tr) {
    for (const e of tr.effects) if (e.is(abrirTrozo)) return e.value;
    if (tr.docChanged || tr.effects.some((e) => e.is(fijarMarcas))) return undefined;
    return valor;
  },
});

/** Una marca del margen. Los tipos van en `data-marca` (los pinta la hoja, y los tests los buscan). */
class MarcaDelMargen extends GutterMarker {
  constructor(readonly tipos: string) {
    super();
  }
  override eq(otra: GutterMarker): boolean {
    return otra instanceof MarcaDelMargen && otra.tipos === this.tipos;
  }
  override toDOM(): Node {
    const marca = document.createElement("span");
    marca.className = estilos.marca ?? "";
    marca.dataset.marca = this.tipos;
    return marca;
  }
}

function margenDe(estado: EditorState): RangeSet<GutterMarker> {
  const m = estado.field(campoDeMarcas);
  const porLinea = new Map<number, string[]>();
  const anadir = (linea: number, tipo: string): void => {
    porLinea.set(linea, [...(porLinea.get(linea) ?? []), tipo]);
  };
  for (const [linea, marca] of m.lineas) anadir(linea, marca.clase);
  for (const b of m.borrados) anadir(Math.max(b.trasLinea, 1), b.trasLinea === 0 ? "borrado-encima" : "borrado-debajo");
  const rangos: Range<GutterMarker>[] = [];
  for (const linea of [...porLinea.keys()].sort((x, y) => x - y)) {
    // Las marcas se calculan con retraso: una línea que ya no existe se salta.
    if (linea > estado.doc.lines) continue;
    rangos.push(new MarcaDelMargen(porLinea.get(linea)!.join(" ")).range(estado.doc.line(linea).from));
  }
  return RangeSet.of(rangos);
}

/** El margen en un campo: se rehace al llegar marcas nuevas y, mientras, se desplaza con el texto. */
const campoDelMargen = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(valor, tr) {
    if (tr.effects.some((e) => e.is(fijarMarcas))) return margenDe(tr.state);
    return tr.docChanged ? valor.map(tr.changes) : valor;
  },
});

/** Lo de antes de un trozo, con el botón que lo devuelve. `textContent`, nunca marcado inyectado. */
class LoQueHabia extends WidgetType {
  constructor(
    readonly trozo: TrozoDeLineas,
    readonly indice: number
  ) {
    super();
  }
  override eq(otro: WidgetType): boolean {
    return (
      otro instanceof LoQueHabia &&
      otro.indice === this.indice &&
      otro.trozo.desdeB === this.trozo.desdeB &&
      otro.trozo.lineasA.join("\n") === this.trozo.lineasA.join("\n")
    );
  }
  override toDOM(vista: EditorView): HTMLElement {
    const caja = document.createElement("div");
    caja.className = estilos.loQueHabia ?? "";
    const rotulo = document.createElement("p");
    rotulo.className = estilos.rotuloDelTrozo ?? "";
    rotulo.textContent = this.trozo.lineasA.length === 0 ? "Antes no había nada aquí: son líneas nuevas." : "Antes:";
    caja.append(rotulo);
    if (this.trozo.lineasA.length > 0) {
      const antes = document.createElement("pre");
      antes.className = estilos.antes ?? "";
      antes.textContent = this.trozo.lineasA.join("\n");
      caja.append(antes);
    }
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = estilos.deshacer ?? "";
    boton.textContent = "Deshacer este cambio";
    boton.addEventListener("click", () => {
      const c = cambioDeDeshacer(vista.state.doc.toJSON(), this.trozo);
      // Una edición más, con su propio evento: Cmd/Ctrl+Z la deshace y hay que guardar.
      vista.dispatch({ changes: { from: c.desde, to: c.hasta, insert: c.insertar }, effects: abrirTrozo.of(undefined), userEvent: "input.deshacerTrozo" });
      vista.focus();
    });
    caja.append(boton);
    return caja;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** El desplegable, como decoración de BLOQUE debajo del trozo (las de bloque solo pueden salir de un campo). */
const campoDelDesplegable = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(_valor, tr) {
    const abierto = tr.state.field(campoAbierto);
    if (abierto === undefined) return Decoration.none;
    const trozo = tr.state.field(campoDeMarcas).trozos[abierto];
    if (trozo === undefined) return Decoration.none;
    const doc = tr.state.doc;
    const ultima = Math.min(trozo.lineasB.length > 0 ? trozo.desdeB + trozo.lineasB.length - 1 : trozo.desdeB - 1, doc.lines);
    const widget = new LoQueHabia(trozo, abierto);
    if (ultima < 1) return Decoration.set([Decoration.widget({ widget, block: true, side: -1 }).range(0)]);
    return Decoration.set([Decoration.widget({ widget, block: true, side: 1 }).range(doc.line(ultima).to)]);
  },
  provide: (campo) => EditorView.decorations.from(campo),
});

const margenDeCambios = gutter({
  class: estilos.margen ?? "",
  markers: (vista) => vista.state.field(campoDelMargen),
  domEventHandlers: {
    mousedown(vista, linea) {
      const numero = vista.state.doc.lineAt(linea.from).number;
      const trozo = trozoDeLaLinea(vista.state.field(campoDeMarcas), numero);
      if (trozo === undefined) return false;
      const abierto = vista.state.field(campoAbierto);
      vista.dispatch({ effects: abrirTrozo.of(abierto === trozo ? undefined : trozo) });
      return true;
    },
  },
});

const plural = (n: number, una: string, varias: string): string => `${n} ${n === 1 ? una : varias}`;

export default function EditorDeFichero({ texto, lenguaje, base, baseElegida, alCambiar, alGuardar, alElegirBase }: PropsDelEditor) {
  const caja = useRef<HTMLDivElement>(null);
  const vista = useRef<EditorView | undefined>(undefined);
  const [cuentas, setCuentas] = useState(SIN_MARCAS.cuentas);
  // Los manejadores cambian en cada render de `App`; el editor se crea UNA vez y lee los de ahora.
  const manejadores = useRef({ alCambiar, alGuardar });
  manejadores.current = { alCambiar, alGuardar };
  const baseActual = useRef(base);
  baseActual.current = base;

  const recalcular = useCallback(() => {
    const v = vista.current;
    if (v === undefined) return;
    const b = baseActual.current;
    const actual = v.state.doc.toString();
    const marcas =
      b?.texto !== undefined ? marcasDeCambio(trozosDeLineas(b.texto, actual)) : b?.vacio === true ? marcasDeCambio(todoNuevo(actual)) : SIN_MARCAS;
    v.dispatch({ effects: fijarMarcas.of(marcas) });
    setCuentas(marcas.cuentas);
  }, []);

  useEffect(() => {
    const padre = caja.current;
    if (padre === null) return;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const v = new EditorView({
      parent: padre,
      state: EditorState.create({
        doc: texto,
        extensions: [
          campoDeMarcas,
          campoAbierto,
          campoDelMargen,
          campoDelDesplegable,
          margenDeCambios,
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search({ top: true }),
          syntaxHighlighting(classHighlighter),
          lenguajeDelEditor(lenguaje),
          // Por encima de todo: el Cmd/Ctrl+S del navegador guardaría la PÁGINA.
          Prec.highest(
            keymap.of([
              {
                key: "Mod-s",
                preventDefault: true,
                run: () => {
                  manejadores.current.alGuardar();
                  return true;
                },
              },
            ])
          ),
          // Sin `indentWithTab`, a propósito: atrapar el Tab deja a quien navega con teclado sin salida.
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            manejadores.current.alCambiar(u.state.doc.toString());
            clearTimeout(reloj);
            reloj = setTimeout(recalcular, MS_ENTRE_DIFFS);
          }),
        ],
      }),
    });
    vista.current = v;
    recalcular();
    return () => {
      clearTimeout(reloj);
      v.destroy();
      vista.current = undefined;
    };
    // Una vez por montaje: otro texto llega remontando con otra `key` (ver la cabecera).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Una base nueva (otra elegida, o la de después de guardar) se aplica en el acto.
  useEffect(() => {
    recalcular();
  }, [base, recalcular]);

  const rotulo =
    base === undefined
      ? "Trayendo la base…"
      : base.sinBase !== undefined
        ? `Sin marcas: ${base.sinBase}`
        : `${plural(cuentas.cambiadas, "cambiada", "cambiadas")} · ${plural(cuentas.nuevas, "nueva", "nuevas")} · ${plural(cuentas.borradas, "borrada", "borradas")}`;

  return (
    <div className={estilos.editor}>
      <div className={estilos.codigo} ref={caja} />
      <div className={estilos.barra}>
        <span>{rotulo}</span>
        <label className={estilos.selector}>
          Comparar con
          <select value={baseElegida} onChange={(e) => alElegirBase(e.target.value === "commit" ? "commit" : "sesion")}>
            <option value="sesion">Inicio de la sesión</option>
            <option value="commit">Último commit</option>
          </select>
        </label>
      </div>
    </div>
  );
}
```

`apps/web/src/editor/EditorDeFichero.module.css`:

```css
/* El editor de la pestaña Ficheros. Alias comprobados contra el puente de temas
   (`estilos/temas.css`): bg-layer-1/2, border-l2, label-primary/secondary/tertiary,
   interactive-bg-hover, state-business/success/error-primary, state-warn-tertiary; y
   `--xonecode-fila-elegida`, `--shiki-*`.
   **La clase propia va TRIPLE en todo lo que el tema base de CodeMirror también pinta**: lo
   inyecta en tiempo de ejecución (`style-mod`), así que llega DESPUÉS de esta hoja y gana todo
   EMPATE de especificidad, y sus reglas ya son de tres clases (`.ͼ1.ͼ2 .cm-gutters`) o más
   (`.ͼ1.ͼ2.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground`). Con dos, el
   margen saldría gris claro en un tema oscuro. jsdom no lo ve: lo comprueba el paso del navegador. */

.editor {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.codigo {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.codigo.codigo.codigo :global(.cm-editor) {
  height: 100%;
  background: var(--shiki-background);
  color: var(--shiki-foreground);
  font-size: 12px;
}

.codigo.codigo.codigo :global(.cm-editor.cm-focused) {
  outline: none;
}

/* También la letra: el tema base pone `monospace` con dos clases (`.ͼ1 .cm-scroller`). */
.codigo.codigo.codigo :global(.cm-scroller) {
  font-family: var(--ds-font-family-code);
  line-height: 1.6;
}

.codigo.codigo.codigo :global(.cm-content) {
  caret-color: var(--dsw-alias-label-primary);
}

.codigo.codigo.codigo :global(.cm-cursor) {
  border-left-color: var(--dsw-alias-label-primary);
}

.codigo.codigo.codigo :global(.cm-editor .cm-selectionLayer .cm-selectionBackground),
.codigo.codigo.codigo :global(.cm-editor.cm-focused .cm-selectionLayer .cm-selectionBackground) {
  background: var(--xonecode-fila-elegida);
}

.codigo.codigo.codigo :global(.cm-activeLine),
.codigo.codigo.codigo :global(.cm-activeLineGutter) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.codigo.codigo.codigo :global(.cm-gutters) {
  border-right: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--shiki-background);
  color: var(--dsw-alias-label-tertiary);
}

.codigo.codigo.codigo :global(.cm-panels) {
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}

.codigo.codigo.codigo :global(.cm-panels input),
.codigo.codigo.codigo :global(.cm-panels button) {
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}

.codigo.codigo.codigo :global(.cm-searchMatch) {
  background: var(--dsw-alias-state-warn-tertiary);
}

.codigo.codigo.codigo :global(.cm-matchingBracket),
.codigo.codigo.codigo :global(.cm-editor.cm-focused .cm-matchingBracket) {
  background: var(--dsw-alias-interactive-bg-hover);
}

/* El resaltado, con las MISMAS variables que shiki: el editor y el visor se ven igual, y los
   dos siguen el tema sin redefinir nada. */
.codigo :global(.tok-keyword) {
  color: var(--shiki-token-keyword);
}

.codigo :global(.tok-string),
.codigo :global(.tok-string2) {
  color: var(--shiki-token-string);
}

.codigo :global(.tok-comment),
.codigo :global(.tok-meta) {
  color: var(--shiki-token-comment);
}

.codigo :global(.tok-comment) {
  font-style: italic;
}

.codigo :global(.tok-number),
.codigo :global(.tok-bool),
.codigo :global(.tok-atom),
.codigo :global(.tok-literal) {
  color: var(--shiki-token-constant);
}

/* Los nombres de etiqueta de XML son `typeName` para Lezer. */
.codigo :global(.tok-typeName),
.codigo :global(.tok-className),
.codigo :global(.tok-namespace),
.codigo :global(.tok-macroName),
.codigo :global(.tok-variableName.tok-definition) {
  color: var(--shiki-token-function);
}

/* Y los atributos, `propertyName`. */
.codigo :global(.tok-propertyName) {
  color: var(--shiki-token-parameter);
}

.codigo :global(.tok-punctuation),
.codigo :global(.tok-operator) {
  color: var(--shiki-token-punctuation);
}

.codigo :global(.tok-link),
.codigo :global(.tok-url) {
  color: var(--shiki-token-link);
  text-decoration: underline;
}

.codigo :global(.tok-heading),
.codigo :global(.tok-strong) {
  font-weight: 600;
}

.codigo :global(.tok-emphasis) {
  font-style: italic;
}

.codigo :global(.tok-invalid) {
  color: var(--dsw-alias-state-error-primary);
}

/* El margen de las marcas: barra azul (cambiada), verde (nueva) y triángulo rojo (borrado)
   ENTRE líneas, dibujado con `clip-path` sobre un bloque lleno —sin bordes transparentes—. */
.margen {
  width: 6px;
}

.margen :global(.cm-gutterElement) {
  overflow: visible;
}

.marca {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.marca[data-marca~="cambiada"] {
  background: var(--dsw-alias-state-business-primary);
}

.marca[data-marca~="nueva"] {
  background: var(--dsw-alias-state-success-primary);
}

.marca[data-marca~="borrado-debajo"]::after,
.marca[data-marca~="borrado-encima"]::after {
  content: "";
  position: absolute;
  left: 0;
  width: 6px;
  height: 8px;
  background: var(--dsw-alias-state-error-primary);
  clip-path: polygon(0 0, 100% 50%, 0 100%);
}

.marca[data-marca~="borrado-debajo"]::after {
  bottom: -4px;
}

.marca[data-marca~="borrado-encima"]::after {
  top: -4px;
}

/* Lo de antes de un trozo, desplegado debajo. */
.loQueHabia {
  margin: 2px 0 6px;
  padding: 8px 12px;
  border-left: 3px solid var(--dsw-alias-state-error-primary);
  background: var(--dsw-alias-bg-layer-2);
  font-family: var(--ds-font-family-code);
}

.rotuloDelTrozo {
  margin: 0 0 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.antes {
  margin: 0 0 8px;
  overflow-x: auto;
  color: var(--dsw-alias-label-secondary);
  white-space: pre;
  text-decoration: line-through;
}

.deshacer {
  composes: secundario from "../componentes/Boton.module.css";
}

/* La barra de abajo: las cuentas y el selector de base. */
.barra {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 16px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.selector select {
  padding: 2px 6px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
```

En `apps/web/src/componentes/Barra.test.tsx`, sustituir la línea 7 (`const modulos = …`) por:

```ts
const EDITOR = join(AQUI, "..", "editor");
const modulos = [
  ...readdirSync(AQUI).filter((f) => f.endsWith(".module.css")),
  // El editor vive en `editor/` por su frontera (solo se llega con `import()`), pero sus hojas son
  // nuestras y la disciplina de colores es la misma: sin esto, sus `.module.css` escaparían a ella.
  ...readdirSync(EDITOR).filter((f) => f.endsWith(".module.css")).map((f) => join("..", "editor", f)),
];
```

(`join` y `readdirSync` ya están importados en ese fichero; `readFileSync(join(AQUI, m))` resuelve `../editor/…`.)

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run --project cliente apps/web/src/editor/EditorDeFichero.test.tsx apps/web/src/componentes/Barra.test.tsx apps/web/src/componentes/Boton.test.ts apps/web/src/estilosDelCliente.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/editor/EditorDeFichero.tsx apps/web/src/editor/EditorDeFichero.module.css apps/web/src/editor/jsdomParaElEditor.ts apps/web/src/editor/EditorDeFichero.test.tsx apps/web/src/componentes/Barra.test.tsx
git commit -m "feat(web): el editor de ficheros con CodeMirror, tema por variables y marcas de cambio en el margen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tw4TZtdPn7iWwCCoSoS4X9"
```

```json:metadata
{"files": ["apps/web/src/editor/EditorDeFichero.tsx", "apps/web/src/editor/EditorDeFichero.module.css", "apps/web/src/editor/jsdomParaElEditor.ts", "apps/web/src/editor/EditorDeFichero.test.tsx", "apps/web/src/componentes/Barra.test.tsx"], "verifyCommand": "npx vitest run --project cliente apps/web/src/editor/EditorDeFichero.test.tsx apps/web/src/componentes/Barra.test.tsx apps/web/src/estilosDelCliente.test.ts", "acceptanceCriteria": ["monta en jsdom y avisa de cada cambio", "marca cambiada y cuentas", "desplegable con Deshacer este cambio que devuelve el trozo", "vacio, sinBase y trayendo", "Mod-s y selector de base", "Barra.test cubre editor/ y estilos en verde"], "modelTier": "frontier"}
```

---

### Task 7: La pestaña Ficheros y App: editar, guardar y no perder nada

**Goal:** «Editar»/«Guardar»/«Cerrar» en la cabecera del visor solo para texto editable, `●` en la cabecera y en el árbol, `M` de Revisión en el árbol, la banda de versión nueva, y en `App` el diálogo de verdad antes de perder cambios al cambiar de fichero, cerrar el editor, salir de la pestaña o abrir otro proyecto.

**Files:**
- Create: `apps/web/src/componentes/CambiosSinGuardar.tsx`
- Test: `apps/web/src/componentes/CambiosSinGuardar.test.tsx`
- Modify: `apps/web/src/componentes/Ficheros.tsx` (imports :1-12; cabecera :14-46; props :47-70; efecto nuevo tras el del árbol :85-88; cabecera del visor :149-170; cuerpo :171-224; `Arbol` :240-246)
- Modify: `apps/web/src/componentes/Ficheros.module.css` (clases nuevas al final)
- Test: `apps/web/src/componentes/Ficheros.test.tsx` (describe nuevo al final)
- Modify: `apps/web/src/App.tsx` (imports; tras `const estado = …` ~:139; antes de `abrirPanel` ~:180; `abrirPanel` :181-184; `abrirSesion` :343-363; `elegirFichero` :627-635; `abrirFicheroDeHallazgo` :644-652; efecto de fin de turno :995-999; `alternarBarra` :1581-1584; `alternarPanel` :1594-1596; `alEmpezar` :1642-1654; `<Panel alCerrar>` :2113; `<Ficheros>` :2169-2177; render final :2786-2791)
- Test: `apps/web/src/App.test.tsx` (imports; describe nuevo tras «App: la pestaña Ficheros», ~:1808)

**Acceptance Criteria:**
- [ ] `CambiosSinGuardar` es un `alertdialog` «Cambios sin guardar» que nombra la ruta; «Descartar cambios» y «Seguir editando» llaman a lo suyo, y el clic en el velo es «Seguir editando».
- [ ] `Ficheros` pinta «Editar» solo con `edicion` y un fichero `esEditable`; editando, «Guardar» (deshabilitado sin cambios o guardando, «Guardando…»), «Cerrar», `●` con `aria-label` «Hay cambios sin guardar», la banda «ha cambiado en el disco» con «Recargar (pierdes los tuyos)» y «Seguir con los míos», y el error de guardado.
- [ ] El árbol lleva `M` para lo de `cambiados` y `●` («Sin guardar en el editor») para el fichero sucio; sin `cambiados` y sin edición, ninguna insignia. `Ficheros` pide los cambios (`alPedirCambios`) al montar si no los tiene.
- [ ] `abrirFicheroDeHallazgo` (hallazgos y Colecciones) pasa por la misma guarda y no pierde la línea al descartar.
- [ ] En `App`: «Editar» pide la base de la sesión; guardar manda `guardarFichero` con la huella; la respuesta quita el `●`; cambiar de fichero, cerrar el panel o abrir otra pestaña con cambios saca el diálogo y no hace nada hasta contestar; «Seguir editando» no cambia nada; «Descartar cambios» hace lo pedido; una versión nueva del disco con cambios saca la banda y no toca el texto; las `M` salen de Revisión.
- [ ] Los tests existentes de `Ficheros.test.tsx` y `App.test.tsx` siguen en verde.

**Verify:** `npx vitest run --project cliente apps/web/src/componentes/CambiosSinGuardar.test.tsx apps/web/src/componentes/Ficheros.test.tsx apps/web/src/App.test.tsx apps/web/src/componentes/Barra.test.tsx apps/web/src/componentes/Boton.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Escribir los tests que fallan**

`apps/web/src/componentes/CambiosSinGuardar.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CambiosSinGuardar } from "./CambiosSinGuardar.js";

afterEach(cleanup);

describe("CambiosSinGuardar", () => {
  it("es un diálogo de verdad que nombra el fichero y deja elegir", () => {
    const alDescartar = vi.fn();
    const alSeguir = vi.fn();
    render(<CambiosSinGuardar ruta="app/Clientes.xne" alDescartar={alDescartar} alSeguir={alSeguir} />);
    const dialogo = screen.getByRole("alertdialog", { name: "Cambios sin guardar" });
    expect(dialogo.textContent).toContain("app/Clientes.xne");
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(alSeguir).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(alDescartar).toHaveBeenCalledTimes(1);
  });
});
```

En `apps/web/src/componentes/Ficheros.test.tsx`: añadir `beforeAll` a la importación de `vitest` y `within` a la de `@testing-library/react`; arriba, con las demás importaciones:

```tsx
import type { ControlDeEdicion, EstadoDeEdicion } from "../usarEdicion.js";
import { prepararJsdomParaElEditor } from "../editor/jsdomParaElEditor.js";
```

Y al final del fichero:

```tsx
describe("Ficheros: editar", () => {
  beforeAll(prepararJsdomParaElEditor);
  const UTF8 = { ruta: "src/Clientes.xne", texto: "<coll/>", recortado: false, binario: false, bytes: 7, codificacion: "utf-8" as const, huella: "h1" };
  const EDITANDO: EstadoDeEdicion = { ruta: "src/Clientes.xne", proyecto: "p1", original: "<coll/>", huella: "h1", finDeLinea: "\n", sucio: false, guardando: false, generacion: 1 };
  function control(parcial: Partial<ControlDeEdicion> = {}): ControlDeEdicion {
    return {
      actual: undefined,
      base: undefined,
      baseElegida: "sesion",
      textoVivo: () => "<coll/>",
      haySinGuardar: () => false,
      abrir: vi.fn(),
      cerrar: vi.fn(),
      cambiar: vi.fn(),
      guardar: vi.fn(),
      elegirBase: vi.fn(),
      pedirBase: vi.fn(),
      recargar: vi.fn(),
      seguirConLosMios: vi.fn(),
      ...parcial,
    };
  }
  const pintar = (contenido: Record<string, unknown>, edicion?: ControlDeEdicion, cambiados?: ReadonlySet<string>) =>
    render(
      <Ficheros
        arbol={ARBOL}
        contenidos={{ "src/Clientes.xne": { ...UTF8, ...contenido } }}
        elegido="src/Clientes.xne"
        alElegir={NADA}
        alRecargar={NADA}
        {...(edicion === undefined ? {} : { edicion })}
        {...(cambiados === undefined ? {} : { cambiados })}
      />
    );

  it("«Editar» solo para texto entero en UTF-8 con huella, y nunca sin `edicion`", () => {
    const c = control();
    pintar({}, c);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(c.abrir).toHaveBeenCalledWith({ ...UTF8 });
    cleanup();
    for (const distinto of [{ codificacion: "latin1" }, { recortado: true }, { huella: undefined }, { mime: "image/svg+xml" }]) {
      pintar(distinto, control());
      expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
      cleanup();
    }
    pintar({});
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
  });

  it("editando: «Guardar» sin cambios está deshabilitado; con cambios, «●» y guarda", () => {
    const limpio = control({ actual: EDITANDO });
    pintar({}, limpio);
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("Hay cambios sin guardar")).toBeNull();
    cleanup();
    const sucio = control({ actual: { ...EDITANDO, sucio: true } });
    pintar({}, sucio);
    expect(screen.getByLabelText("Hay cambios sin guardar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(sucio.guardar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(sucio.cerrar).toHaveBeenCalledTimes(1);
  });

  it("una versión nueva del disco con cambios saca la banda con sus dos salidas", () => {
    const c = control({ actual: { ...EDITANDO, sucio: true, versionNueva: { original: "otro", huella: "h3", finDeLinea: "\n" } } });
    pintar({}, c);
    expect(screen.getByText(/ha cambiado en el disco/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recargar (pierdes los tuyos)" }));
    expect(c.recargar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Seguir con los míos" }));
    expect(c.seguirConLosMios).toHaveBeenCalledTimes(1);
  });

  it("el error de guardar se enseña", () => {
    pintar({}, control({ actual: { ...EDITANDO, sucio: true, error: "el fichero cambió desde que lo abriste: recárgalo antes de guardar" } }));
    expect(screen.getByRole("alert").textContent).toContain("el fichero cambió desde que lo abriste");
  });

  it("el árbol lleva «M» para lo cambiado en la sesión y «●» para lo que no se ha guardado", () => {
    pintar({}, control({ actual: { ...EDITANDO, sucio: true } }), new Set(["app.xml"]));
    expect(within(screen.getByRole("treeitem", { name: /app\.xml/ })).getByLabelText("Cambiado en la sesión")).toBeTruthy();
    fireEvent.click(screen.getByRole("treeitem", { name: "src" }));
    expect(within(screen.getByRole("treeitem", { name: /Clientes\.xne/ })).getByLabelText("Sin guardar en el editor")).toBeTruthy();
  });

  it("pide los cambios de la sesión al montar si no los tiene", () => {
    const pedir = vi.fn();
    render(<Ficheros arbol={ARBOL} contenidos={{}} alElegir={NADA} alRecargar={NADA} alPedirCambios={pedir} conectado={true} />);
    expect(pedir).toHaveBeenCalledTimes(1);
  });
});
```

En `apps/web/src/App.test.tsx`, importaciones nuevas arriba:

```tsx
import { beforeAll } from "vitest";
import { EditorView } from "@codemirror/view";
import { prepararJsdomParaElEditor } from "./editor/jsdomParaElEditor.js";
```

(`beforeAll` se añade a la importación existente de `vitest`.) Y tras `describe("App: la pestaña Ficheros", …)`:

```tsx
describe("App: editar en la pestaña Ficheros", () => {
  beforeAll(prepararJsdomParaElEditor);

  const conFichero = async () => {
    const montado = montar();
    abrirPestana("Ficheros");
    act(() => montado.store.aplicar({ clase: "arbol", rutas: ["a.xne", "b.xne"], recortado: false }));
    fireEvent.click(screen.getByRole("treeitem", { name: "a.xne" }));
    act(() =>
      montado.store.aplicar({ clase: "fichero", ruta: "a.xne", texto: "uno\n", recortado: false, binario: false, bytes: 4, codificacion: "utf-8", huella: "h1" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    // Por el DOM y no por el rol: el compositor del chat también es un «textbox».
    await waitFor(() => expect(document.querySelector(".cm-editor")).not.toBeNull());
    const vista = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
    return { ...montado, vista };
  };
  const teclear = (vista: EditorView, texto: string): void => {
    act(() => {
      vista.dispatch({ changes: { from: 0, insert: texto } });
    });
  };
  const mandados = (enviar: Mock<(m: unknown) => Promise<unknown>>, clase: string) =>
    enviar.mock.calls.map(([m]) => m as { clase: string; ruta?: string }).filter((m) => m.clase === clase);

  it("«Editar» pide la base de la sesión; guardar manda la huella y la respuesta quita el «●»", async () => {
    const { enviar, store, vista } = await conFichero();
    expect(enviar).toHaveBeenCalledWith({ clase: "baseDeFichero", ruta: "a.xne", base: "sesion" });
    teclear(vista, "X");
    expect(screen.getByLabelText("Hay cambios sin guardar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "guardarFichero", ruta: "a.xne", texto: "Xuno\n", huella: "h1" });
    act(() => store.aplicar({ clase: "ficheroGuardado", ruta: "a.xne", huella: "h2" }));
    expect(screen.queryByLabelText("Hay cambios sin guardar")).toBeNull();
    expect(mandados(enviar, "revision").length).toBeGreaterThan(0);
  });

  it("cambiar de fichero con cambios pregunta antes; «Seguir editando» no cambia nada y «Descartar» sí", async () => {
    const { enviar, vista } = await conFichero();
    teclear(vista, "X");
    fireEvent.click(screen.getByRole("treeitem", { name: "b.xne" }));
    expect(screen.getByRole("alertdialog", { name: "Cambios sin guardar" })).toBeTruthy();
    expect(mandados(enviar, "fichero").filter((m) => m.ruta === "b.xne")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("Hay cambios sin guardar")).toBeTruthy();
    fireEvent.click(screen.getByRole("treeitem", { name: "b.xne" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "fichero", ruta: "b.xne" });
    expect(screen.queryByLabelText("Hay cambios sin guardar")).toBeNull();
  });

  it("cerrar el panel con cambios también pregunta", async () => {
    const { vista } = await conFichero();
    teclear(vista, "X");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el panel" }));
    expect(screen.getByRole("alertdialog", { name: "Cambios sin guardar" })).toBeTruthy();
  });

  it("una versión nueva del disco con cambios sin guardar no los pisa: sale la banda", async () => {
    const { store, vista } = await conFichero();
    teclear(vista, "X");
    act(() =>
      store.aplicar({ clase: "fichero", ruta: "a.xne", texto: "otro\n", recortado: false, binario: false, bytes: 5, codificacion: "utf-8", huella: "h3" })
    );
    expect(screen.getByText(/ha cambiado en el disco/)).toBeTruthy();
    expect(vista.state.doc.toString()).toBe("Xuno\n");
  });

  it("las «M» del árbol salen de Revisión", async () => {
    const { store } = await conFichero();
    act(() => store.aplicar({ clase: "revision", via: "git", ficheros: [{ ruta: "b.xne", clase: "modificado", mas: 1, menos: 0 }] }));
    expect(within(screen.getByRole("treeitem", { name: /b\.xne/ })).getByLabelText("Cambiado en la sesión")).toBeTruthy();
  });
});
```

(«Cerrar el panel» es la «×» que pinta `Pestanas.tsx` dentro del panel, y llama al `alCerrar` de `<Panel>`; «Ocultar el panel» es el botón de la cabecera, que va por `alternarPanel`.)

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `npx vitest run --project cliente apps/web/src/componentes/CambiosSinGuardar.test.tsx apps/web/src/componentes/Ficheros.test.tsx apps/web/src/App.test.tsx`
Expected: FAIL — no existe `CambiosSinGuardar`; `Ficheros` no acepta `edicion`/`cambiados`/`alPedirCambios`; `App` no edita.

- [ ] **Step 3: El diálogo**

`apps/web/src/componentes/CambiosSinGuardar.tsx`:

```tsx
import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import clsx from "clsx";
import estilos from "./NuevaSesion.module.css";
import propios from "./AccionDeSesion.module.css";

/**
 * La pregunta antes de perder lo que se editó en la pestaña Ficheros: un diálogo de VERDAD y no un
 * `confirm`, que el navegador pinta con su cromo, bloquea la página entera y no se puede probar.
 * La misma coraza que `BorrarCopiaLocal` (`NuevaSesion.module.css`) y el mismo botón rojo, porque es
 * la misma clase de acto: lo descartado no vuelve.
 *
 * La salida SEGURA es la de por omisión: `Escape` y el clic en el velo son «Seguir editando».
 */
export function CambiosSinGuardar({ ruta, alDescartar, alSeguir }: { ruta: string; alDescartar: () => void; alSeguir: () => void }) {
  return (
    <Modal open onClose={alSeguir} title="Cambios sin guardar" headless className={estilos.capa}>
      <div
        className={estilos.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget) alSeguir();
        }}
      >
        <div className={estilos.ventana} role="alertdialog" aria-label="Cambios sin guardar">
          <h2 className={estilos.titulo}>Cambios sin guardar</h2>
          <p className={estilos.nota}>
            «{ruta}» tiene cambios que no has guardado. Si sigues, se pierden.
          </p>
          <div className={estilos.acciones}>
            <Button variant="outline" className={estilos.accion} onClick={alSeguir}>
              Seguir editando
            </Button>
            <Button variant="primary" className={clsx(estilos.accion, estilos.principal, propios.destructiva)} onClick={alDescartar}>
              Descartar cambios
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: La pestaña Ficheros**

En `apps/web/src/componentes/Ficheros.tsx`:

(a) importaciones: `import { lazy, Suspense, useEffect, useState } from "react";` en lugar de la de `react`; y añadir:

```ts
import { esEditable } from "../edicion.js";
import type { ControlDeEdicion } from "../usarEdicion.js";

/**
 * El editor, en DIFERIDO: CodeMirror solo se descarga al pulsar «Editar». Es la única puerta a
 * `editor/` desde fuera de él (`editor/frontera.test.ts`).
 */
const EditorDeFichero = lazy(() => import("../editor/EditorDeFichero.js"));
```

(b) en la cabecera del componente, sustituir «y el fichero elegido en el centro, de SOLO lectura.» por «y el fichero elegido en el centro, que se lee y, si es texto entero en UTF-8, se EDITA (`edicion`, cuyo estado vive en `App`: ver `usarEdicion.ts`).»

(c) props nuevas, después de `linea?: number;`:

```ts
  /** La edición (`usarEdicion.ts`), de `App`. Ausente = esta pestaña no edita y no hay «Editar». */
  edicion?: ControlDeEdicion;
  /** Lo que la sesión cambió según Revisión (las `M` del árbol). Ausente = no se sabe, y no se pinta ninguna. */
  cambiados?: ReadonlySet<string>;
  /** Pedir esa lista: se llama al montar si no se tiene, como el árbol. */
  alPedirCambios?: () => void;
```

y añadirlas a la desestructuración (`edicion, cambiados, alPedirCambios,`).

(d) justo después del `useEffect` que pide el árbol:

```ts
  // Las `M` del árbol salen de la MISMA lista que Revisión, y se piden igual que el árbol: cuando no
  // se tienen (al montar, o porque el store las tiró al cambiar de sesión) y hay cable.
  useEffect(() => {
    if (conectado === false || cambiados !== undefined) return;
    alPedirCambios?.();
  }, [cambiados, conectado, alPedirCambios]);
```

(e) después de `const soloDibujo = …;`:

```ts
  // Editando ESTE fichero: el editor sustituye al visor, y su estado manda sobre `contenido`
  // (que el store tira sin cable, y no por eso se pierde lo tecleado).
  const actual = edicion?.actual !== undefined && edicion.actual.ruta === elegido ? edicion.actual : undefined;
```

(f) la cabecera del visor: sustituir `<span className={estilos.ruta}>{elegido}</span>` y el bloque `{dosCaras ? (…) : null}` por:

```tsx
              <span className={estilos.ruta}>
                {elegido}
                {actual?.sucio === true ? (
                  <span className={estilos.sinGuardar} aria-label="Hay cambios sin guardar" title="Hay cambios sin guardar">
                    ●
                  </span>
                ) : null}
              </span>
              {actual !== undefined && edicion !== undefined ? (
                <div className={estilos.acciones}>
                  <button
                    type="button"
                    className={estilos.accionPrincipal}
                    disabled={!actual.sucio || actual.guardando}
                    onClick={edicion.guardar}
                  >
                    {actual.guardando ? "Guardando…" : "Guardar"}
                  </button>
                  <button type="button" className={estilos.accion} onClick={edicion.cerrar}>
                    Cerrar
                  </button>
                </div>
              ) : (
                <div className={estilos.acciones}>
                  {dosCaras ? (
                    <div className={estilos.caras} role="group" aria-label="Cómo se enseña el fichero">
                      {(["vista", "fuente"] as const).map((cual) => (
                        <button
                          key={cual}
                          type="button"
                          className={estilos.cara}
                          // `aria-pressed` y no `aria-current`: son dos interruptores de un
                          // mismo grupo, no la posición dentro de una lista.
                          aria-pressed={cara === cual}
                          data-activa={cara === cual ? "" : undefined}
                          onClick={() => setCara(cual)}
                        >
                          {cual === "vista" ? "Vista" : "Fuente"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {/* Un control sin dato detrás no se pinta: sin `edicion`, o con un fichero que no
                      es texto entero en UTF-8, no hay botón. */}
                  {edicion !== undefined && esEditable(contenido) ? (
                    <button type="button" className={estilos.accion} onClick={() => edicion.abrir(contenido)}>
                      Editar
                    </button>
                  ) : null}
                </div>
              )}
```

(g) el cuerpo: sustituir el arranque de la cadena `{contenido === undefined ? (` por:

```tsx
            {actual !== undefined && edicion !== undefined ? (
              <>
                {actual.versionNueva !== undefined ? (
                  <div className={estilos.banda} role="alert">
                    <span>El fichero ha cambiado en el disco mientras lo editabas.</span>
                    <button type="button" className={estilos.accion} onClick={edicion.recargar}>
                      Recargar (pierdes los tuyos)
                    </button>
                    <button type="button" className={estilos.accion} onClick={edicion.seguirConLosMios}>
                      Seguir con los míos
                    </button>
                  </div>
                ) : null}
                {actual.error !== undefined ? (
                  <p className={estilos.fallo} role="alert">
                    No se ha guardado: {actual.error}
                  </p>
                ) : null}
                <Suspense fallback={<p className={estilos.aviso}>Cargando el editor…</p>}>
                  <EditorDeFichero
                    // Otra `generacion` es otro texto venido de fuera (abrir, recargar): se remonta.
                    key={`${actual.ruta}:${actual.generacion}`}
                    texto={edicion.textoVivo()}
                    {...(lenguaje === undefined ? {} : { lenguaje })}
                    {...(edicion.base === undefined ? {} : { base: edicion.base })}
                    baseElegida={edicion.baseElegida}
                    alCambiar={edicion.cambiar}
                    alGuardar={edicion.guardar}
                    alElegirBase={edicion.elegirBase}
                  />
                </Suspense>
              </>
            ) : contenido === undefined ? (
```

(el resto de la cadena —«Trayendo…», error, imagen, binario, texto— se queda igual). Y en el `<div className={estilos.visor}>` añadir `data-editando={actual !== undefined ? "" : undefined}`.

(h) en el `<Arbol …>`, añadir:

```tsx
          {...(cambiados === undefined && actual?.sucio !== true
            ? {}
            : {
                insignia: (ruta: string) =>
                  ruta === actual?.ruta && actual.sucio ? (
                    <span className={estilos.marcaDelArbol} aria-label="Sin guardar en el editor">●</span>
                  ) : cambiados?.has(ruta) === true ? (
                    <span className={estilos.marcaDelArbol} aria-label="Cambiado en la sesión">M</span>
                  ) : null,
              })}
```

Al final de `apps/web/src/componentes/Ficheros.module.css`:

```css
/* Lo que se hace con el fichero: Vista/Fuente, Editar, y editando Guardar/Cerrar. */
.acciones {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.accion {
  composes: secundario from "./Boton.module.css";
}

.accionPrincipal {
  composes: primario from "./Boton.module.css";
}

/* El «●» de cambios sin guardar, junto a la ruta. */
.sinGuardar {
  margin-left: 6px;
  color: var(--dsw-alias-state-business-primary);
}

/* Editando, el visor deja de desplazarse: lo hace el editor, que ocupa lo que queda. */
.visor[data-editando] {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* El disco cambió mientras se editaba. */
.banda {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 16px 0;
  padding: 8px 12px;
  border: 0.5px solid var(--dsw-alias-state-warn-primary);
  border-radius: 8px;
  background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}

.fallo {
  margin: 8px 16px 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
}

/* `M` y `●` en el árbol, delante del nombre como la letra de Revisión. */
.marcaDelArbol {
  margin-right: 4px;
  color: var(--dsw-alias-state-business-primary);
  font-family: var(--ds-font-family-code);
  font-size: 11px;
}
```

- [ ] **Step 5: App**

En `apps/web/src/App.tsx`:

(a) importaciones nuevas:

```ts
import { usarEdicion } from "./usarEdicion.js";
import { CambiosSinGuardar } from "./componentes/CambiosSinGuardar.js";
```

(y `useMemo` en la importación de `react` si no está).

(b) justo después de `const estado = useSyncExternalStore(store.suscribir, store.leer);`:

```ts
  /**
   * La edición de la pestaña Ficheros (`usarEdicion.ts`). Vive AQUÍ y no en el editor: el panel
   * desmonta sus pestañas al cambiar, al plegarse o al ceder al chat, y lo tecleado no puede irse
   * con ellas. Lo que sí pregunta antes de perderlo son los gestos de la persona —cambiar de
   * fichero, cerrar el editor, salir de la pestaña, abrir otro proyecto—, por `conGuarda`.
   */
  const edicion = usarEdicion({
    enviar,
    proyecto: estado.alta?.proyectoActivo,
    contenidos: estado.contenidos,
    bases: estado.bases,
    ultimoGuardado: estado.ultimoGuardado,
    conectado: estado.conectado,
  });
  const edicionRef = useRef(edicion);
  edicionRef.current = edicion;
  /** Lo que se iba a hacer cuando salió el diálogo de «Cambios sin guardar». */
  const [descartePendiente, setDescartePendiente] = useState<{ accion: () => void } | undefined>(undefined);
  /** Hace `accion` ya, o —con cambios sin guardar— después de que la persona elija descartarlos. */
  const conGuarda = useCallback((accion: () => void) => {
    if (edicionRef.current.haySinGuardar()) {
      setDescartePendiente({ accion });
      return;
    }
    accion();
  }, []);
```

(c) justo antes de `const abrirPanel = useCallback(…)`, y con un `ref` de la vista:

```ts
  const vistaRef = useRef(vistaDelPanel);
  vistaRef.current = vistaDelPanel;
  /**
   * Salir de la pestaña Ficheros cierra el editor —y con cambios, pregunta antes—. Cerrarlo y no
   * dejarlo vivo detrás: un editor que nadie mira se quedaría con un texto que el disco ya no tiene.
   */
  const dejarFicheros = useCallback(
    (hacer: () => void) => {
      if (vistaRef.current === "ficheros" && edicionRef.current.actual !== undefined) {
        conGuarda(() => {
          edicionRef.current.cerrar();
          hacer();
        });
        return;
      }
      hacer();
    },
    [conGuarda]
  );
```

(d) sustituir `abrirPanel` por:

```ts
  /** Abrir el panel por una vista concreta, recordándola para la próxima vez. */
  const abrirPanel = useCallback(
    (vista: Pestana) => {
      const hacer = (): void => {
        ultimaVistaDelPanel.current = vista;
        setVistaDelPanel(vista);
      };
      if (vista === "ficheros") hacer();
      else dejarFicheros(hacer);
    },
    [dejarFicheros]
  );
```

(e) `abrirSesion`: envolver el cuerpo actual en `const hacer = (): void => { …cuerpo de siempre… };` y terminar con:

```ts
      // Otro PROYECTO suelta la edición (guardar escribe en el abierto): con cambios, se pregunta.
      if (proyecto !== estado.alta?.proyectoActivo) conGuarda(hacer);
      else hacer();
```

y añadir `conGuarda` a sus dependencias.

(f) sustituir `elegirFichero` por:

```ts
  const elegirFichero = useCallback(
    (ruta: string | undefined) => {
      const hacer = (): void => {
        const enEdicion = edicionRef.current.actual;
        // El editor es de UN fichero: elegir otro lo cierra.
        if (enEdicion !== undefined && enEdicion.ruta !== ruta) edicionRef.current.cerrar();
        setFicheroElegido(ruta);
        // Elegirlo en el árbol es mirarlo entero: la línea de un hallazgo de antes ya no aplica.
        setLineaElegida(undefined);
        if (ruta !== undefined) void enviar({ clase: "fichero", ruta });
      };
      if (ruta !== undefined && ruta === edicionRef.current.actual?.ruta) hacer();
      else conGuarda(hacer);
    },
    [enviar, conGuarda]
  );
```

(f bis) `abrirFicheroDeHallazgo` (el «Abrir» de un hallazgo y de Colecciones) llama a `elegirFichero` pero pone la línea y abre la pestaña AUNQUE el diálogo esté pendiente, y al descartar `elegirFichero` borraría la línea. Sustituirlo por:

```ts
  const abrirFicheroDeHallazgo = useCallback(
    (ruta: string, linea?: number) => {
      const hacer = (): void => {
        // Tras «Descartar» ya no hay nada sin guardar (`haySinGuardar`), así que esto no vuelve a preguntar.
        elegirFichero(ruta);
        // DESPUÉS de elegir, que la borra: la línea es lo que distingue llegar desde un hallazgo.
        setLineaElegida(linea);
        abrirPanel("ficheros");
      };
      // El mismo fichero que se edita no se pierde: se va a él sin preguntar.
      if (ruta === edicionRef.current.actual?.ruta) hacer();
      else conGuarda(hacer);
    },
    [elegirFichero, abrirPanel, conGuarda]
  );
```

(g) en el efecto de fin de turno, sustituir el bloque `if (vistaDelPanel === "ficheros") { … }` por:

```ts
    if (vistaDelPanel === "ficheros") {
      // El agente puede haber creado o cambiado ficheros: el árbol, el abierto, las `M` y la base
      // del editor se releen. El editor decide solo qué hacer con la versión nueva (`usarEdicion`).
      pedirArbol();
      pedirRevision();
      if (ficheroElegido !== undefined) void enviar({ clase: "fichero", ruta: ficheroElegido });
      edicionRef.current.pedirBase();
    }
```

(h) `alternarBarra`: sustituir `setVistaDelPanel(undefined);` (dentro del `if`) por `dejarFicheros(() => setVistaDelPanel(undefined));`. `alternarPanel`:

```ts
  const alternarPanel = (): void => {
    if (vistaDelPanel === undefined) setVistaDelPanel(ultimaVistaDelPanel.current);
    else dejarFicheros(() => setVistaDelPanel(undefined));
  };
```

(i) en `alEmpezar` de la ventana de sesión nueva, sustituir las dos últimas líneas (`setDescargaPedida(…)` y el `enviar` del alta con `rama`) por:

```ts
          // Bajar otro proyecto lo ABRE: suelta la edición, así que con cambios se pregunta.
          conGuarda(() => {
            setDescargaPedida({ proyecto, alta: estado.alta });
            void enviar({ clase: "alta", paso: "proyecto", proyecto, rama });
          });
```

(j) `<Panel …>`: `alCerrar={() => dejarFicheros(() => setVistaDelPanel(undefined))}`.

(k) junto a la ranura `ficheros={…}`, antes del `return` (cerca de `const elPanel =`):

```ts
  /** Las `M` del árbol: lo que la sesión cambió según Revisión, sin los borrados (no están en el árbol). */
  const cambiadosEnLaSesion = useMemo(
    () => (estado.revision === undefined ? undefined : new Set(estado.revision.lista.filter((f) => f.clase !== "borrado").map((f) => f.ruta))),
    [estado.revision]
  );
  /** La edición para Ficheros, con «Cerrar» pasando por la guarda. */
  const edicionDeFicheros = useMemo(() => ({ ...edicion, cerrar: () => conGuarda(edicion.cerrar) }), [edicion, conGuarda]);
```

y en `<Ficheros …>` añadir:

```tsx
          edicion={edicionDeFicheros}
          {...(cambiadosEnLaSesion === undefined ? {} : { cambiados: cambiadosEnLaSesion })}
          alPedirCambios={pedirRevision}
```

(l) el diálogo, junto a `const ventanaDeAccionDeSesion = …`:

```tsx
  /** La pregunta antes de perder lo editado. «Descartar» suelta la edición y hace lo que se iba a hacer. */
  const ventanaDeCambiosSinGuardar =
    descartePendiente === undefined ? null : (
      <CambiosSinGuardar
        ruta={edicion.actual?.ruta ?? ""}
        alSeguir={() => setDescartePendiente(undefined)}
        alDescartar={() => {
          const pendiente = descartePendiente;
          setDescartePendiente(undefined);
          edicion.cerrar();
          pendiente.accion();
        }}
      />
    );
```

y en el render final, después de `{ventanaDeAccionDeSesion}`: `{ventanaDeCambiosSinGuardar}`.

- [ ] **Step 6: Correr y ver que pasa**

Run: `npx vitest run --project cliente apps/web/src/componentes/CambiosSinGuardar.test.tsx apps/web/src/componentes/Ficheros.test.tsx apps/web/src/App.test.tsx apps/web/src/componentes/Barra.test.tsx apps/web/src/componentes/Boton.test.ts apps/web/src/estilosDelCliente.test.ts && npm run typecheck`
Expected: PASS (los tests viejos de `App: la pestaña Ficheros` también: cuentan peticiones de `arbol` y `fichero`, no de `revision`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/componentes/CambiosSinGuardar.tsx apps/web/src/componentes/CambiosSinGuardar.test.tsx apps/web/src/componentes/Ficheros.tsx apps/web/src/componentes/Ficheros.module.css apps/web/src/componentes/Ficheros.test.tsx apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat(web): editar en la pestaña Ficheros, con M y ● en el árbol y un diálogo antes de perder cambios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tw4TZtdPn7iWwCCoSoS4X9"
```

```json:metadata
{"files": ["apps/web/src/componentes/CambiosSinGuardar.tsx", "apps/web/src/componentes/CambiosSinGuardar.test.tsx", "apps/web/src/componentes/Ficheros.tsx", "apps/web/src/componentes/Ficheros.module.css", "apps/web/src/componentes/Ficheros.test.tsx", "apps/web/src/App.tsx", "apps/web/src/App.test.tsx"], "verifyCommand": "npx vitest run --project cliente apps/web/src/componentes/CambiosSinGuardar.test.tsx apps/web/src/componentes/Ficheros.test.tsx apps/web/src/App.test.tsx apps/web/src/componentes/Barra.test.tsx apps/web/src/componentes/Boton.test.ts", "acceptanceCriteria": ["CambiosSinGuardar es un alertdialog con las dos salidas", "abrirFicheroDeHallazgo pasa por la guarda", "Editar solo con edicion y fichero editable; Guardar/Cerrar/●/banda/error", "M y ● en el árbol y alPedirCambios al montar", "App: base, guardar, respuesta, diálogo al cambiar de fichero y al cerrar el panel, banda de versión nueva, M de Revisión", "tests existentes verdes"], "modelTier": "frontier"}
```

---

### Task 8: La frontera del editor, el mapa y la comprobación en el navegador

**Goal:** Un test de frontera que exige que CodeMirror solo se importe desde `editor/` y que a `editor/` solo se llegue con `import()`; el mapa (`CLAUDE.md`) al día; el build con el editor en un trozo aparte; y la pasada en el navegador del spec §6.

**Files:**
- Create: `apps/web/src/editor/frontera.test.ts`
- Modify: `CLAUDE.md` (sección «La consola web», viñeta «**Ficheros y Revisión**…», ~:1003)

**Acceptance Criteria:**
- [ ] Fuera de `apps/web/src/editor/` ningún fichero que no sea test importa `@codemirror/` ni `@lezer/`, ni importa nada de `editor/` de forma estática; `Ficheros.tsx` lo carga con `lazy(() => import("../editor/EditorDeFichero.js"))`.
- [ ] `CLAUDE.md` deja de decir que Ficheros es de solo lectura, tiene la viñeta nueva y `src/documentacion.test.ts` sigue en verde.
- [ ] `npm run build:web` deja el editor en un trozo propio (`apps/web/dist/assets/EditorDeFichero-*.js`).
- [ ] `npm test` entero en verde y `npm run typecheck` sin errores.
- [ ] En el navegador, con un tema claro y uno oscuro: editar un `.xne`, ver las marcas contra el inicio de la sesión, deshacer un trozo, guardar, y que el turno siguiente lo commitee.

**Verify:** `npx vitest run --project cliente apps/web/src/editor/frontera.test.ts && npx vitest run --project host src/documentacion.test.ts && npm run build:web && ls apps/web/dist/assets | grep EditorDeFichero` → PASS y un `EditorDeFichero-<hash>.js`

**Steps:**

- [ ] **Step 1: Escribir el test de frontera**

`apps/web/src/editor/frontera.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **La aplicación no importa CodeMirror; solo el editor, y al editor solo se llega con `import()`.**
 * CodeMirror con sus lenguajes y su diff pesa lo bastante para notarse al abrir la consola, y un
 * import estático desde cualquier fichero de la aplicación lo metería en el bundle principal sin
 * que nada lo notara: el síntoma sería una consola que tarda más en abrir. Se comprueba por TEXTO,
 * como `openui/frontera.test.ts`. Los tests están exentos: montan el editor a propósito.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
const src = join(aqui, "..");

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) return ficheros(r);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [r] : [];
  });
}

const deFuera = (): string[] => ficheros(src).filter((f) => !relative(src, f).startsWith("editor"));

describe("la frontera del editor en el cliente", () => {
  it("fuera de src/editor/ nadie importa CodeMirror ni Lezer", () => {
    const culpables = deFuera()
      .filter((f) => /from\s+["']@(codemirror|lezer)\//.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f));
    expect(culpables).toEqual([]);
  });

  it("y fuera de src/editor/ nadie importa el editor de forma estática", () => {
    const culpables = deFuera()
      .filter((f) => /from\s+["'](\.\.?\/)+editor\//.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f));
    expect(culpables).toEqual([]);
  });

  it("Ficheros lo carga en diferido, que es la única puerta", () => {
    const ficherosTsx = readFileSync(join(src, "componentes", "Ficheros.tsx"), "utf8");
    expect(ficherosTsx).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\.\/editor\/EditorDeFichero\.js["']\s*\)\s*\)/);
  });
});
```

- [ ] **Step 2: Correrlo**

Run: `npx vitest run --project cliente apps/web/src/editor/frontera.test.ts`
Expected: PASS (las tareas anteriores ya respetan la frontera). Para comprobar que puede fallar: añadir temporalmente `import { EditorView } from "@codemirror/view";` a `apps/web/src/App.tsx`, correrlo (FAIL nombrando `App.tsx`) y quitarlo.

- [ ] **Step 3: El mapa**

En `CLAUDE.md`, sección «La consola web», en la viñeta que empieza por `- **Ficheros y Revisión**: el lector filtra con las MISMAS reglas que el agente`, sustituir esa primera frase por:

```markdown
- **Ficheros y Revisión**: el lector filtra con las MISMAS reglas que el agente
  (`puedeLeerRuta`, `esVistaAplanada`), aplicadas DOS veces (texto y `realpath`) por UN solo
  resolvedor (`arbolDeProyecto.ts#resolverEnProyecto`), que es también el de guardar y el de la base.
```

(el resto de esa viñeta se queda igual), y justo después de esa viñeta:

```markdown
- **Ficheros EDITA, y guardar es la ÚNICA escritura del cliente en un fichero del proyecto**
  (`arbolDeProyecto.ts#escribirFicheroDeProyecto`, `componentes/Ficheros.tsx`, `editor/`): sin
  tarjeta de aprobación —lo teclea la persona—, con las MISMAS guardas que leer, negado por RAÍZ
  con un turno en vuelo o una consola de tarea viva (`core/settings.ts#motivoParaNoEditarFichero`,
  `vestibulo.motivoParaNoEditar`), y con concurrencia por HUELLA: el sha256 de los bytes viaja al
  leer y vuelve al guardar, y si el disco ya no coincide no se escribe nada. Escritura atómica que
  conserva permisos y BOM; los finales de línea los conserva el cliente (`edicion.ts`). Solo se edita
  el texto ENTERO en UTF-8 que no es imagen (`edicion.ts#esEditable`). **CodeMirror solo se importa
  desde `apps/web/src/editor/`, y a eso solo se llega con `import()`** (`editor/frontera.test.ts`):
  quien no edita no paga el peso. Su tema son variables CSS (`.tok-*` → `--shiki-token-*` y alias
  del puente), nunca `EditorView.theme`, que escaparía a `Barra.test.tsx`. Las marcas del margen
  salen de `@codemirror/merge` contra una BASE pedida aparte (`agent/sesiones/baseDeFichero.ts`: la
  ref de la sesión o `HEAD`); sin base no hay marcas y se dice. **El texto vive en `App`
  (`usarEdicion.ts`), no en el editor**: el panel desmonta sus pestañas, y lo tecleado no se va con
  ellas; cambiar de fichero, cerrar el editor, salir de la pestaña o abrir otro proyecto con cambios
  pregunta antes (`CambiosSinGuardar.tsx`), y una versión nueva del disco con cambios no los pisa.
  **Límites declarados**: ni crear, ni borrar, ni renombrar; una tarea en OTRO proceso no se ve; la
  edición se atribuye en git a la sesión cuyo turno siguiente la commitea.
```

Run: `npx vitest run --project host src/documentacion.test.ts`
Expected: PASS (sin fechas, recuentos, porcentajes ni duraciones sueltas; paréntesis cerrados).

- [ ] **Step 4: El suite entero y el build**

Run: `npm run typecheck && npm test -- --maxWorkers=2`
Expected: todo PASS (con `FORCE_COLOR=0` si fallan tests de `src/cli/tui/*` solo por color).

Run: `npm run build:web && ls apps/web/dist/assets | grep EditorDeFichero`
Expected: el build termina y aparece un `EditorDeFichero-<hash>.js` aparte del trozo principal.

- [ ] **Step 5: La pasada en el navegador**

1. `npm run web -- --puerto 4200` y abrir la URL que imprime. Elegir un proyecto con copia local (dentro del workspace, para que el turno commitee) y abrir una sesión.
2. Mandar un turno corto que cambie un `.xne` (p. ej. «añade un comentario al principio de `<colección>.xne`») y esperar a que acabe.
3. Panel → Ficheros: el `.xne` tocado lleva `M` en el árbol. Abrirlo: el botón «Editar» está; en un PNG y en un fichero recortado, no.
4. «Editar»: el editor carga (en la pestaña Red del navegador aparece el trozo `EditorDeFichero-*.js` solo ahora). La barra de abajo dice «Comparar con: Inicio de la sesión» y el margen marca en azul/verde lo que cambió el agente.
5. Teclear en otra línea: sale `●` en la cabecera y en el árbol, y una marca nueva. Pulsar una marca: se despliega «Antes:» con «Deshacer este cambio»; pulsarlo devuelve solo ese trozo. `Cmd+Z` lo rehace.
6. Cambiar el selector a «Último commit»: las marcas pasan a ser solo lo tecleado desde el último turno.
7. Pulsar otro fichero del árbol con cambios: sale el diálogo «Cambios sin guardar»; «Seguir editando». `Cmd+S`: el `●` se va. Con un turno en marcha, `Cmd+S` dice «espera a que termine el turno…».
8. Mandar otro turno: al acabar, en Revisión el `.xne` aparece con el cambio a mano sellado con la sesión (`git log -1 --format=%B` en la copia lleva el trailer `Xonecode-Sesion`).
9. Ajustes → Temas: repetir los pasos 4–5 con un tema claro (p. ej. GitHub Light) y uno oscuro (p. ej. Dracula): fondo, texto, selección, resaltado y las tres marcas siguen el tema. En Dracula, mirar en concreto lo que el tema base de CodeMirror pinta de claro si la hoja pierde: el fondo del margen de números (`.cm-gutters`), la línea activa y su número, el panel de buscar (`Cmd+F`) y la selección. Ninguno puede salir gris claro o blanco; si sale, subir la especificidad de esa regla en `EditorDeFichero.module.css`.

No hay commit en este paso: si algo falla, se vuelve a la tarea responsable.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/editor/frontera.test.ts CLAUDE.md
git commit -m "docs(web): el editor de Ficheros en el mapa, y su frontera comprobada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tw4TZtdPn7iWwCCoSoS4X9"
```

```json:metadata
{"files": ["apps/web/src/editor/frontera.test.ts", "CLAUDE.md"], "verifyCommand": "npx vitest run --project cliente apps/web/src/editor/frontera.test.ts && npx vitest run --project host src/documentacion.test.ts && npm run build:web && ls apps/web/dist/assets | grep EditorDeFichero", "acceptanceCriteria": ["CodeMirror solo en editor/ y editor/ solo con import()", "CLAUDE.md al día y documentacion.test verde", "el editor en un trozo propio del build", "npm test y typecheck verdes", "pasada en el navegador con tema claro y oscuro"], "modelTier": "mechanical"}
```
