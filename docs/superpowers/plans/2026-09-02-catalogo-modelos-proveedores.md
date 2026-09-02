# Catálogo vivo de modelos por proveedor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consultar los catálogos reales de proveedores, mostrar solo modelos de conversación y asignarlos globalmente a los papeles del agente desde `/modelos`.

**Architecture:** `core` define un puerto y tipos de catálogo sin red; `agent` adapta las cuatro APIs y el escritor global; `cli` orquesta el diálogo mediante las costuras existentes de `Consola`. La TUI no gana dependencias de proveedores: recibe el mismo puerto inyectado que la consola clásica.

**Tech Stack:** TypeScript, Node `fetch`, Vitest, Ink existente para la TUI.

**Spec:** `docs/superpowers/specs/2026-09-02-catalogo-modelos-proveedores-design.md`

## Global Constraints

- `src/core/` no puede importar HTTP, LangChain, Ink ni clientes de proveedor.
- `npm test` no puede usar red, claves, Ollama ni simulador; todo HTTP se inyecta y se finge en test.
- Las claves siguen exclusivamente en `~/.xonecode/auth.json`; no se interpolan en mensajes, URLs visibles ni excepciones.
- `/provider` conserva la gestión de credenciales. `/modelos` es el único comando de catálogo y selección.
- El identificador persistido usa exactamente `proveedor/modelo` y respeta la precedencia existente: bandera > entorno > proyecto > global > omisión.
- Todo cambio de configuración global conserva los campos crudos preexistentes y no sobrescribe JSON inválido.

**User decisions (already made):**

- “desde la API real de cada proveedor”.
- “solo modelos de conversación utilizables por el agente”.
- La lista permite asignar el modelo a `rápido`, `trabajo` o `afilado`.
- La asignación se guarda globalmente, no en el proyecto.
- El flujo aprobado es `/modelos <proveedor>`; `/provider` no se sobrecarga.

---

## File structure

| Archivo | Responsabilidad |
| --- | --- |
| `src/core/ports.ts` | Contrato normalizado de catálogo y doble offline. |
| `src/core/ports.test.ts` | Forma y marca del doble de catálogo. |
| `src/agent/catalogoModelos.ts` | Adaptador HTTP real, paginación, filtros y errores seguros por proveedor. |
| `src/agent/catalogoModelos.test.ts` | Respuestas HTTP fingidas, filtros, paginación y errores sin red. |
| `src/agent/configEnDisco.ts` | Ruta global de configuración y escritor atómico de `modelos.<papel>`. |
| `src/agent/configEnDisco.test.ts` | Fusión, preservación y rechazo seguro del escritor global. |
| `src/cli/consola.ts` | Registro `/modelos`, conversación de filtro/selección/papel y cambio de estado. |
| `src/cli/consola.test.ts` | Flujo completo con catálogo falso, cancelación y precedencia. |
| `src/cli/main.ts` | Construcción e inyección del adaptador real en stdio y TUI. |
| `src/cli/tui/correrTui.ts` | Propagación del puerto sin importar módulos de `agent`. |
| `src/cli/tui/correrTui.test.ts` | La misma ranura de preguntas de la TUI soporta `/modelos` y actualiza la sidebar. |

### Task 1: Contrato de catálogo offline

**Goal:** Definir en `core` el catálogo normalizado y un doble determinista que permita a toda la CLI probarse sin red.

**Files:**
- Modify: `src/core/ports.ts`
- Modify: `src/core/ports.test.ts`

**Acceptance Criteria:**
- [ ] `ModeloDisponible` contiene `proveedor`, `id`, `nombre?` y `contexto?`, sin tipos HTTP ni LangChain.
- [ ] `CatalogoModelosPort.listar(proveedor)` devuelve `Promise<ModeloDisponible[]>`.
- [ ] El doble lleva `ES_DOBLE`, permite una lista inyectada por proveedor y devuelve `[]` cuando no se configuró ese proveedor.
- [ ] La prueba de frontera de `core` continúa pasando.

**Verify:** `npx vitest run src/core/ports.test.ts src/core/imports.test.ts` → PASS sin red.

**Steps:**

- [ ] **Step 1: Escribir los tests rojos del puerto y del doble.**

```ts
it("el catálogo en memoria conserva proveedor, id y contexto", async () => {
  const catalogo = new CatalogoModelosEnMemoria({
    openai: [{ proveedor: "openai", id: "gpt-test", nombre: "GPT Test", contexto: 128000 }],
  });
  expect(esDoble(catalogo)).toBe(true);
  await expect(catalogo.listar("openai")).resolves.toEqual([
    { proveedor: "openai", id: "gpt-test", nombre: "GPT Test", contexto: 128000 },
  ]);
  await expect(catalogo.listar("ollama")).resolves.toEqual([]);
});
```

- [ ] **Step 2: Ejecutar la prueba para confirmar que falla por tipos inexistentes.**

Run: `npx vitest run src/core/ports.test.ts`

Expected: FAIL porque `CatalogoModelosEnMemoria` no existe todavía.

- [ ] **Step 3: Añadir las interfaces y el doble junto a los demás puertos.**

```ts
export interface ModeloDisponible {
  proveedor: Proveedor;
  id: string;
  nombre?: string;
  contexto?: number;
}

export interface CatalogoModelosPort {
  listar(proveedor: Proveedor): Promise<ModeloDisponible[]>;
}

export class CatalogoModelosEnMemoria implements CatalogoModelosPort {
  readonly [ES_DOBLE] = true;
  constructor(private readonly porProveedor: Partial<Record<Proveedor, ModeloDisponible[]>> = {}) {}
  async listar(proveedor: Proveedor): Promise<ModeloDisponible[]> {
    return this.porProveedor[proveedor] ?? [];
  }
}
```

Importar `Proveedor` solo como tipo desde `core/modelos.ts`; no añadir I/O a `core`.

- [ ] **Step 4: Ejecutar los tests del puerto y de su frontera.**

Run: `npx vitest run src/core/ports.test.ts src/core/imports.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/core/ports.ts src/core/ports.test.ts
git commit -m "add offline provider model catalog port"
```

### Task 2: Adaptadores de API y filtrado compatible

**Goal:** Implementar en `agent` un adaptador HTTP inyectable que normalice los catálogos reales y excluya recursos no conversacionales.

**Files:**
- Create: `src/agent/catalogoModelos.ts`
- Create: `src/agent/catalogoModelos.test.ts`
- Modify: `src/agent/modelos.ts`

**Acceptance Criteria:**
- [ ] OpenAI usa `GET /v1/models` con bearer; Anthropic usa `GET /v1/models` con `x-api-key` y `anthropic-version`; Gemini pagina `v1beta/models`; Ollama consulta `/api/tags` y comprueba capacidad por modelo.
- [ ] El catálogo solo devuelve IDs que el constructor `Modelos` puede usar para conversación; se excluyen explícitamente embeddings, moderación, transcripción, voz, imagen, vídeo y realtime.
- [ ] Los errores de credencial, timeout, HTTP no exitoso y JSON inesperado son errores seguros: no incluyen una clave ni el body remoto.
- [ ] El base URL de Ollama sale de una función compartida con `Modelos`, usando `OLLAMA_BASE_URL ?? "http://localhost:11434"`.
- [ ] Ninguna prueba usa `globalThis.fetch` real.

**Verify:** `npx vitest run src/agent/catalogoModelos.test.ts src/core/imports.test.ts` → PASS sin conexiones.

**Steps:**

- [ ] **Step 1: Escribir fixtures HTTP y tests rojos por proveedor.**

```ts
it("Gemini conserva solo modelos con generateContent", async () => {
  const fetchFalso = responderJson({ models: [
    { name: "models/gemini-chat", displayName: "Chat", supportedGenerationMethods: ["generateContent"], inputTokenLimit: 1000000 },
    { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
  ] });
  const catalogo = new CatalogoModelos(fetchFalso);
  await expect(catalogo.listar("gemini")).resolves.toEqual([
    { proveedor: "gemini", id: "gemini-chat", nombre: "Chat", contexto: 1000000 },
  ]);
});

it("un 401 no filtra ni la clave ni el body remoto", async () => {
  const catalogo = new CatalogoModelos(responderError(401, "key sk-secreta no válida"));
  await expect(catalogo.listar("openai")).rejects.toThrow("credencial no autorizada para openai");
});
```

Incluir casos para cabeceras de OpenAI/Anthropic, cursor de Gemini/Anthropic, exclusiones de OpenAI, capacidad de Ollama y timeout por `AbortSignal`.

- [ ] **Step 2: Ejecutar la suite nueva y confirmar rojo.**

Run: `npx vitest run src/agent/catalogoModelos.test.ts`

Expected: FAIL porque no existe `CatalogoModelos`.

- [ ] **Step 3: Crear el adaptador y su error seguro.**

```ts
export class ErrorCatalogoModelos extends Error {}

export class CatalogoModelos implements CatalogoModelosPort {
  constructor(
    private readonly fetchFn: typeof fetch = globalThis.fetch,
    private readonly timeoutMs = 8_000,
  ) {}

  async listar(proveedor: Proveedor): Promise<ModeloDisponible[]> {
    switch (proveedor) {
      case "openai": return this.listarOpenAi();
      case "anthropic": return this.listarAnthropic();
      case "gemini": return this.listarGemini();
      case "ollama": return this.listarOllama();
    }
  }
}
```

Implementar un helper privado que haga `fetchFn` con `AbortController`, compruebe `response.ok`, parse JSON sin copiar `response.text()` a los errores y devuelva solo datos validados. Mantener funciones privadas separadas `listarOpenAi`, `listarAnthropic`, `listarGemini` y `listarOllama` para que cada formato remoto quede aislado.

- [ ] **Step 4: Extraer la resolución de URL de Ollama y usarla en ambos consumidores.**

```ts
export function baseUrlDeOllama(): string {
  return process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
}
```

Sustituir la expresión duplicada de `src/agent/modelos.ts` por la función compartida y comprobar que `ChatOllama` recibe el mismo valor que el catálogo.

- [ ] **Step 5: Ejecutar tests de adaptador y tipos.**

Run: `npx vitest run src/agent/catalogoModelos.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/agent/catalogoModelos.ts src/agent/catalogoModelos.test.ts src/agent/modelos.ts
git commit -m "list compatible models from live providers"
```

### Task 3: Escritura global atómica de modelos

**Goal:** Guardar una única elección de papel en `~/.xonecode/config.json` sin perder configuración existente ni dejar un fichero parcialmente escrito.

**Files:**
- Modify: `src/agent/configEnDisco.ts`
- Modify: `src/agent/configEnDisco.test.ts`

**Acceptance Criteria:**
- [ ] `guardarModeloGlobal(papel, id)` valida `id` con `parsear` y escribe solo `modelos.<papel>`.
- [ ] Se conservan `modelo`, los otros papeles, `contextos`, `ollama` y campos crudos desconocidos.
- [ ] Si el config existente no es JSON o su raíz no es objeto, se lanza un error específico y el fichero permanece byte a byte igual.
- [ ] La creación usa directorio `~/.xonecode` y una sustitución atómica en el mismo directorio.
- [ ] El resultado devuelve la ruta y el ID guardado, sin datos sensibles.

**Verify:** `npx vitest run src/agent/configEnDisco.test.ts src/core/config.test.ts` → PASS.

**Steps:**

- [ ] **Step 1: Añadir tests rojos con HOME temporal.**

```ts
it("fusiona solo modelos.trabajo y preserva campos crudos", () => {
  escribirConfigGlobal({ desconocido: { conservar: true }, modelos: { rapido: "ollama/a" }, contextos: { "openai/gpt": 128000 } });
  guardarModeloGlobal("trabajo", "openai/gpt-test");
  expect(leerConfigGlobal()).toMatchObject({
    desconocido: { conservar: true },
    modelos: { rapido: "ollama/a", trabajo: "openai/gpt-test" },
    contextos: { "openai/gpt": 128000 },
  });
});

it("no pisa JSON global inválido", () => {
  escribirConfigGlobalBruto("{ roto");
  const antes = leerConfigGlobalBruto();
  expect(() => guardarModeloGlobal("afilado", "anthropic/claude-test")).toThrow(ConfigRotaEnDisco);
  expect(leerConfigGlobalBruto()).toBe(antes);
});
```

- [ ] **Step 2: Ejecutar los tests para comprobar que fallan.**

Run: `npx vitest run src/agent/configEnDisco.test.ts`

Expected: FAIL porque el escritor y `ConfigRotaEnDisco` no existen.

- [ ] **Step 3: Implementar lectura cruda, fusión y reemplazo atómico.**

```ts
export class ConfigRotaEnDisco extends Error {}

export function guardarModeloGlobal(papel: Papel, id: string): { ruta: string; id: string } {
  parsear(id);
  const ruta = rutaConfigGlobal();
  const base = leerObjetoCrudoOAbortar(ruta);
  const modelos = esObjeto(base.modelos) ? { ...base.modelos } : {};
  const fusionado = { ...base, modelos: { ...modelos, [papel]: id } };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta, id };
}
```

El temporal debe crearse dentro de `dirname(ruta)`, con permisos privados, cerrarse y renombrarse solo después de escribir todo. En cualquier fallo previo al `rename`, eliminar únicamente ese temporal conocido y relanzar el error.

- [ ] **Step 4: Ejecutar las suites del lector, escritor y validación.**

Run: `npx vitest run src/agent/configEnDisco.test.ts src/core/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/agent/configEnDisco.ts src/agent/configEnDisco.test.ts
git commit -m "persist global model role selections safely"
```

### Task 4: Comando `/modelos` compartido

**Goal:** Añadir al registro único de comandos el flujo de catálogo, filtro, selección, papel y actualización de estado sin mezclarlo con `/provider`.

**Files:**
- Modify: `src/cli/consola.ts`
- Modify: `src/cli/consola.test.ts`
- Modify: `src/cli/acuseDeModelo.ts` solo si necesita una variante explícita para un papel individual

**Acceptance Criteria:**
- [ ] `/ayuda`, Tab y el menú de comandos muestran `/modelos` y su descripción desde `COMANDOS`.
- [ ] `/modelos <proveedor>` consulta `consola.catalogoModelos`, lista resultados numerados y permite filtrar, cancelar, elegir número y elegir `rapido`, `trabajo` o `afilado`.
- [ ] La selección llama a `guardarModeloGlobal`, emite el acuse compartido y actualiza `EstadoDeSesion.fuentes` solo si ninguna fuente de mayor prioridad eclipsa la global.
- [ ] Credencial ausente, catálogo vacío, selección inválida, cancelación y fallo de guardado dejan el estado anterior intacto.
- [ ] `/provider` conserva exactamente su flujo de clave sin eco.

**Verify:** `npx vitest run src/cli/consola.test.ts src/cli/main.test.ts src/cli/tui/entrada.test.tsx` → PASS.

**Steps:**

- [ ] **Step 1: Extender el helper de consola de test con un catálogo falso y respuestas secuenciales.**

```ts
const catalogo = new CatalogoModelosEnMemoria({
  openai: [
    { proveedor: "openai", id: "gpt-a", nombre: "GPT A" },
    { proveedor: "openai", id: "gpt-b", nombre: "GPT B", contexto: 128000 },
  ],
});
const { consola, salida } = consolaDeConRespuestas({
  lineas: ["/modelos openai"],
  respuestas: ["b", "1", "trabajo"],
  catalogo,
});
```

Escribir además tests de credencial ausente, proveedor inválido, catálogo vacío, número fuera de rango, Enter de cancelación, fallo del escritor y precedencia de bandera/proyecto.

- [ ] **Step 2: Ejecutar los tests para confirmar que `/modelos` es desconocido.**

Run: `npx vitest run src/cli/consola.test.ts`

Expected: FAIL con `comando desconocido: /modelos`.

- [ ] **Step 3: Añadir las costuras mínimas a `Consola` y el manejador.**

```ts
export interface Consola {
  // campos existentes
  catalogoModelos: CatalogoModelosPort;
  guardarModeloGlobal: (papel: Papel, id: string) => { ruta: string; id: string };
}

async function elegirModelo(args: string[], estado: EstadoDeSesion, consola: Consola) {
  const proveedor = validarProveedor(args[0]);
  exigirCredencialSiHaceFalta(proveedor, estado.raiz);
  const modelos = await consola.catalogoModelos.listar(proveedor);
  const filtrados = filtrarModelos(modelos, await consola.preguntar("filtro (Enter para todos): "));
  const modelo = elegirPorNumero(filtrados, await consola.preguntar("número (Enter cancela): "));
  const papel = elegirPapel(await consola.preguntar("papel (rapido/trabajo/afilado): "));
  // guardar, emitir acuse y devolver estado según la precedencia
}
```

Hacer puros y unitariamente testeables `filtrarModelos`, `elegirPorNumero`, `elegirPapel` y la comprobación de precedencia. El manejador captura únicamente errores previstos y no construye URLs ni toca credenciales.

- [ ] **Step 4: Alinear el acuse y el cambio inmediato.**

Cuando el papel no está eclipsado, añadir `porPapel[papel] = proveedor + "/" + id` al estado para que el ejecutor real y la sidebar cambien en caliente. Si está eclipsado, imprimir que se guardó en global y nombrar la fuente ganadora; no mutar `estado.fuentes` ni emitir un acuse que simule cambio activo.

- [ ] **Step 5: Ejecutar tests de CLI y completado.**

Run: `npx vitest run src/cli/consola.test.ts src/cli/main.test.ts src/cli/tui/entrada.test.tsx`

Expected: PASS, con `/modelos` visible en ayuda y menú.

- [ ] **Step 6: Commit.**

```bash
git add src/cli/consola.ts src/cli/consola.test.ts src/cli/acuseDeModelo.ts
git commit -m "add interactive provider model selection command"
```

### Task 5: Cableado de producción y paridad TUI

**Goal:** Inyectar el adaptador real en producción y comprobar que stdio y TUI ejecutan el mismo flujo sin romper la frontera `agent` → `cli/tui`.

**Files:**
- Modify: `src/cli/main.ts`
- Modify: `src/cli/tui/correrTui.ts`
- Modify: `src/cli/tui/correrTui.test.ts`
- Modify: `src/cli/main.test.ts`

**Acceptance Criteria:**
- [ ] La consola clásica y la TUI reciben la misma instancia real de `CatalogoModelos` desde `main`; los helpers de test reciben el doble.
- [ ] Antes de montar cualquiera de las dos pieles, `main` mezcla la configuración proyecto/global cargada en `FuentesDeEleccion` y aplica `auth.json` sin pisar variables de entorno.
- [ ] `cli/tui/` no importa `src/agent/catalogoModelos.ts`, preservando la frontera Ink/TUI.
- [ ] La TUI usa su ranura de pregunta para filtro, número y papel, y actualiza la sidebar si se asigna `trabajo` sin una fuente eclipsante.
- [ ] El arranque de la consola no consulta proveedores: la red solo ocurre al ejecutar `/modelos <proveedor>`.

**Verify:** `npx vitest run src/cli/main.test.ts src/cli/tui/correrTui.test.ts src/cli/tui/frontera.test.ts && npm run typecheck` → PASS.

**Steps:**

- [ ] **Step 1: Añadir tests rojos de inyección perezosa.**

```ts
it("montar la TUI no lista modelos hasta ejecutar /modelos", async () => {
  const listar = vi.fn(async () => []);
  const montaje = crearConsolaTui({ raiz: "/tmp/proyecto", catalogoModelos: { listar } });
  expect(listar).not.toHaveBeenCalled();
  await montaje.consola.catalogoModelos.listar("ollama");
  expect(listar).toHaveBeenCalledWith("ollama");
});
```

Añadir un test de arranque con `HOME` temporal que contiene `~/.xonecode/config.json` y afirmar que `resolver(fuentesHidratadas).trabajo` toma `global.modelos.trabajo`; añadir otro que deje `XONECODE_MODELO` definido y compruebe que sigue ganando. Añadir además la salida de `acuseDeModelo("trabajo", "openai/gpt-b")` a través de la consola TUI y afirmar que `datosSidebar().modelo` cambia.

- [ ] **Step 2: Ejecutar los tests y comprobar el fallo por la nueva opción ausente.**

Run: `npx vitest run src/cli/tui/correrTui.test.ts src/cli/main.test.ts`

Expected: FAIL porque `catalogoModelos` aún no se propaga.

- [ ] **Step 3: Construir e inyectar el adaptador en los dos montajes.**

```ts
const catalogoModelos = new CatalogoModelos();
const consola: Consola = {
  // campos existentes
  catalogoModelos,
  guardarModeloGlobal,
};
```

En `main.ts`, cargar una vez `cargar(raiz)`, ejecutar `aplicarAuth(cargado.auth)` y crear `fuentesHidratadas = { ...fuentes, proyecto: cargado.config.proyecto, global: cargado.config.global }`. Usar `fuentesHidratadas` para la cabecera, la barra, `EstadoDeSesion`, stdio y TUI, sin reemplazar `bandera`, `porPapel` ni `entorno`. Construir el adaptador sin llamar a `listar`; pasarlo a `entrarEnConsola` y a `correrConsolaTui`. En `correrTui.ts`, aceptar el puerto como opción y limitarse a reenviarlo al objeto `Consola`; no importar nada de `agent` salvo tipos ya permitidos por la frontera vigente.

- [ ] **Step 4: Ejecutar tests de paridad y frontera.**

Run: `npx vitest run src/cli/main.test.ts src/cli/tui/correrTui.test.ts src/cli/tui/frontera.test.ts && npm run typecheck`

Expected: PASS sin acceso de red.

- [ ] **Step 5: Commit.**

```bash
git add src/cli/main.ts src/cli/main.test.ts src/cli/tui/correrTui.ts src/cli/tui/correrTui.test.ts
git commit -m "wire live model catalog into both consoles"
```

### Task 6: Verificación de cierre y documentación de uso

**Goal:** Confirmar el comportamiento integrado y hacer visible el nuevo comando sin cambiar las garantías offline.

**Files:**
- Modify: `README.md` si enumera los comandos interactivos; si no los enumera, no modificarlo.
- Modify: `docs/COMO-PROBARLO.md` si contiene un recorrido de consola; si no existe una sección aplicable, no modificarlo.
- Test: suites existentes de `src/core/`, `src/agent/` y `src/cli/`.

**Acceptance Criteria:**
- [ ] La ayuda interactiva describe `/modelos <proveedor>` y explica que la selección se guarda globalmente.
- [ ] La documentación, si tiene un listado de comandos, no sugiere que las claves van en `config.json` ni que `/provider` lista modelos.
- [ ] El proyecto supera todos los tests, typecheck y build con la red desconectada.
- [ ] `git diff --check` no devuelve errores de whitespace.

**Verify:** `npm test && npm run typecheck && npm run build && git diff --check` → todos los comandos terminan con código 0.

**Steps:**

- [ ] **Step 1: Localizar las secciones de documentación que enumeran comandos o credenciales.**

Run: `rg -n "(/provider|/modelo|credencial|auth.json|config.json|comandos)" README.md docs`

Expected: rutas y líneas concretas o ninguna coincidencia aplicable.

- [ ] **Step 2: Añadir únicamente la documentación que corresponda.**

```md
`/modelos <proveedor>` consulta el catálogo disponible de ese proveedor, filtra modelos
de conversación y permite guardar uno globalmente para `rapido`, `trabajo` o `afilado`.
Las claves siguen en `~/.xonecode/auth.json`; `/provider` solo las configura.
```

No añadir una tabla duplicada si `/ayuda` ya es la fuente de comandos del documento.

- [ ] **Step 3: Ejecutar la batería completa sin red.**

Run: `npm test`

Expected: PASS; ningún test requiere credenciales ni proveedor real.

- [ ] **Step 4: Ejecutar comprobación estática, build y whitespace.**

Run: `npm run typecheck && npm run build && git diff --check`

Expected: los tres comandos terminan con código 0.

- [ ] **Step 5: Commit.**

```bash
git add README.md docs/COMO-PROBARLO.md
git add -u
git commit -m "document provider model selection"
```
