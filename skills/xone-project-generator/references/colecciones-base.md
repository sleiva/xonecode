# Colecciones base: campos mínimos y `progid`

> Referencia de `xone-project-generator`. Sale del `SKILL.md` para que lo esencial quepa
> en una lectura por omisión (100 líneas).

### Campos Mínimos Obligatorios en Colecciones Base

| Coleccion | progid | Campos a declarar como `<prop>` |
|-----------|--------|----------------------------------|
| **Empresas** | `ASGestion.CASEmpresa` | `CODIGO` (N), `NOMBRE` (T) |
| **Usuarios** | `ASGestion.CASUser` | `CODIGO` (N), `NOMBRE` (T), `IDEMPRESA` (N), `LOGIN` (T), `PWD` (X) |
| **Resto** | `ASData.CASBasicDataObj` | Los que defina el desarrollador |

> `ID` y `ROWID`: no declararlos como `<prop>` en estas colecciones tampoco. Ver la regla en `xone-development`.

---
