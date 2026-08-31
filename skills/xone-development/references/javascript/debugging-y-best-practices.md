# XOne JavaScript — Debugging y top 20 de buenas prácticas

> Fuente: `xone/v2/xone-help-docs/topics/03e-js-patrones-buenas-practicas.md` §14–§15. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §14 debugging y troubleshooting de JavaScript · §15 top 20 de buenas prácticas

---

## 14. Debugging y Troubleshooting

### 14.1 console.* (API WHATWG completa)

```javascript
// Métodos disponibles: log, info, debug, warn, error, trace, assert,
//                     group, groupCollapsed, groupEnd, time, timeLog, timeEnd,
//                     count, countReset, dir, dirxml, clear, table
console.log("Valor de campo: " + self.MAP_NOMBRE);
console.warn("Aviso: parámetro fuera de rango");
console.error("Error al guardar:", err);            // varargs soportados
console.info("Carga completada");
console.debug("Estado interno:", { id: 42, ok: true });

// Formato con placeholders %s/%d/%i/%f/%o/%O/%j/%%
console.log("Usuario %s tiene %d puntos", nombre, puntos);

// Agrupar logs
console.group("Procesando pedido");
console.log("ID:", pedido.ID);
console.log("Líneas:", pedido.LINEAS.length);
console.groupEnd();

// Medir tiempos
console.time("consulta");
let res = $http.get(url, req, ok, err);
console.timeEnd("consulta");                        // "consulta: 142ms"

// Log condicional
function logDebug(mensaje) {
    if (appData.getCurrentEnterprise().getVariable("Debug") === true) {
        console.debug("DEBUG: " + mensaje);
    }
}

// Alternativa: consola del framework (XOne-specific)
appData.writeConsoleString("Debug: proceso iniciado");
```

### 14.2 ui.showToast() para Debug Rápido

```javascript
function debugToast(variable, nombre) {
    ui.showToast(nombre + " = " + cstr(variable));
}

// Ejemplos
debugToast(self.MAP_ESTADO, "Estado");
debugToast(typeof self.MAP_PRECIO, "Tipo precio");
debugToast(self.getOwnerCollection().getName(), "Coleccion");

function debugMsgBox(variable, nombre) {
    ui.msgBox(nombre + " = " + cstr(variable) + "\nTipo: " + typeof variable, "Debug", 0);
}
```

### 14.3 try/catch

```javascript
function operacionSegura() {
    try {
        let resultado = operacionRiesgosa();
        if (!resultado) throw "No se pudo completar la operación";
        return resultado;
    } catch(ex) {
        console.log("Error en operacionSegura: " + ex);
        appData.writeConsoleString("Error: " + ex);
        ui.showToast("Error: " + ex);
        return null;
    } finally {
        ui.hideWaitDialog();
    }
}

// Verificar errores del framework
function verificarErrores() {
    let error = appData.error();
    if (error.getNumber() != 0) {
        console.log("Código: " + error.getNumber());
        console.log("Descripción: " + error.getDescription());
        console.log("SQL fallido: " + error.getFailedSql());
        error.clear();
        return true;
    }
    return false;
}
```

### 14.4 Errores Comunes y Soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| `self es null` | Se accede a `self` fuera de contexto | Guardar referencia antes de callbacks asíncronos |
| `coleccion bloqueada` | Se intenta addItem sin unlock | Usar patron `coll.unlock(); try {...} finally { coll.lock(); }` |
| `NaN en calculos` | Valor null/undefined en operación matematica | Usar `cnum()` para conversiones numéricas seguras |
| `campo no encontrado` | Nombre de propiedad incorrecto | Verificar nombre exacto en el XML (sensible a mayusculas) |
| `cursor no cerrado` | Fuga de recursos SQL | SIEMPRE cerrar cursor en bloque `finally` |
| `WaitDialog no desaparece` | Error antes de `hideWaitDialog()` | Usar `try/finally` para garantizar que se oculte |
| `GPS STATUS != 1` | GPS no activado o sin cobertura | Verificar `ui.checkGpsStatus()` y pedir permiso |
| `Error en JSON.parse` | Respuesta del servidor no es JSON valido | Envolver en try/catch y verificar la respuesta |
| `window es null` | Pantalla cerrada mientras se ejecuta callback | Verificar `window != null` antes de acceder a controles |
| `refresh no actualiza` | Nombre de campo incorrecto en refresh | Usar el nombre exacto de la propiedad (MAP_CAMPO) |

---

## 15. Best Practices - Top 20

### 1. Guardar referencia de `self` antes de callbacks asíncronos

```javascript
let miObjeto = self;
$http.get(url, request, function(sData) {
    miObjeto.MAP_DATO = sData;  // CORRECTO
    // self.MAP_DATO = sData;   // INCORRECTO
}, errorCb);
```

### 2. Siempre usar lock/unlock al modificar colecciones

```javascript
coll.unlock();
try {
    let obj = coll.createObject();
    coll.addItem(obj);
} finally {
    coll.lock();
}
```

### 3. Usar `isEmpty()`, `cstr()`, `cnum()` para conversiones seguras

Nunca acceder a valores sin verificar que no sean null/undefined.

### 4. Refrescar solo los campos necesarios

```javascript
ui.refresh("MAP_NOMBRE,MAP_ESTADO");  // CORRECTO
ui.refresh();                          // INCORRECTO - refresca todo
```

### 5. Usar consultas parametrizadas para prevenir SQL injection

```javascript
sqlManager.doRawQuery("SELECT * FROM tabla WHERE campo=?", valor);
```

### 6. Cerrar cursores y conexiones SQL en bloques `finally`

```javascript
try { cursor = sqlManager.doRawQuery(...);
    try { /* usar cursor */ } finally { cursor.close(); }
} finally { sqlManager.close(); }
```

### 7. Ocultar WaitDialog en bloque `finally`

```javascript
ui.showWaitDialog("Cargando...");
try { /* operacion */ }
catch(ex) { ui.showToast("Error: " + ex); }
finally { ui.hideWaitDialog(); }
```

### 8. Verificar existencia de objetos antes de usarlos

```javascript
let usuario = coll.findObject("ID = 1");
if (!usuario) { ui.showToast("No encontrado"); return; }
```

### 9. No usar APIs web que no existen en XOne

No `document`, `window`, `localStorage`, `XMLHttpRequest`, `navigator`. **Sí** existen, con implementación custom y semántica compatible: `Promise` (full ES2024 incluyendo `all`/`allSettled`/`race`/`any`/`withResolvers`), `fetch`, `setTimeout`/`setInterval`, `URL`, `Headers`, `AbortController`, `TextEncoder`/`TextDecoder`, `console.{log,warn,error,...}`, `performance.now()`, `atob`/`btoa`.

### 10. `getControl(name, [dataObject])` es NATIVO — no redeclararlo

Es una función global del motor (Rhino y V8). Firma:
- `getControl(name)` → control en la última ventana visible.
- `getControl(name, dataObject)` → control en la ventana asociada a ese DataObject.

Semántica estricta: lanza error si el nombre está vacío, el control no existe en la ventana destino, no hay ventana, o el dataObject no es válido. No hace falta verificar null.

Proyectos antiguos con su propio `function getControl(...){...}` siguen funcionando: la declaración del script sombrea a la nativa en el scope local del script.

### 11. Usar `ui.executeActionAfterDelay()` en lugar de `ui.sleep()`

`sleep()` bloquea toda la interfaz. `executeActionAfterDelay()` no.

### 12. Nunca hardcodear credenciales en el código

Usar macros globales o almacenamiento encriptado.

### 13. Validar datos antes de guardar (patron validarFormulario)

Verificar campos obligatorios, rangos y formatos antes de `save()`.

### 14. Organizar functions.js en secciones claras

Constantes, utilidades, navegación, mensajes, datos, validaciones, inicialización.

### 15. Usar `try/catch` en operaciones que pueden fallar

Especialmente: operaciones de red, acceso a BD, GPS, camara, archivos.

### 16. Liberar colecciones con `clear()` después de usarlas

Previene acumulacion de objetos en memoria.

### 17. Usar `saveAll()` al final en lugar de `save()` individual en bucles

Una sola escritura a BD en lugar de N.

### 18. Documentar funciones con proposito, parámetros y retorno

```javascript
/**
 * Calcula el precio con descuento
 * @param {number} precio - Precio original
 * @param {number} descuento - Porcentaje de descuento (0-100)
 * @returns {number} - Precio con descuento aplicado
 */
function calcularDescuento(precio, descuento) { ... }
```

### 19. Usar constantes para valores magicos

```javascript
var ESTADOS = { ACTIVO: "ACTIVO", INACTIVO: "INACTIVO" };
if (estado == ESTADOS.ACTIVO) ...
```

### 20. Separar lógica de negocio de la lógica de UI

Funciones que calculan o procesan datos NO deben contener `ui.showToast()`. Las funciones de UI llaman a las de negocio y muestran los resultados.

> **Referencia cruzada:** Para la estructura de carpetas del proyecto y como se integran los archivos JS, consultar el tópico 01 - Fundamentos (cubre también la guía de creación de proyectos nuevos).

