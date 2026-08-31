# Convenciones de nomenclatura

> Referencia de `xone-project-generator`. Sale del `SKILL.md` para que lo
> esencial quepa en una lectura por omisión (100 líneas).

## Convenciones de Nomenclatura


- **Colecciones:** PascalCase (`MenuPrincipal`, `DetalleProducto`)
- **Propiedades de BD:** MAYUSCULAS (`CODIGO`, `NOMBRE`, `IDEMPRESA`, `ROWID`). En la coll `Usuarios` el campo de empresa **DEBE** llamarse `IDEMPRESA` (sin guion bajo) — el framework lo lee literalmente.
- **Propiedades de UI (no persisten):** Prefijo MAP_ (`MAP_BTN_GUARDAR`, `MAP_TOTAL`, `MAP_BUSQUEDA`)
- **Clases CSS:** Prefijo descriptivo (`.frameHeader`, `.btnPrimario`, `.textoTitulo`)
- **Iconos:** snake_case (`ic_home.png`, `ic_add_white.png`)
- **Scripts JS:** camelCase (`inicializarPantalla`, `cargarDatos`, `guardarRegistro`)

---
