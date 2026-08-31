# El flujo de generación de un proyecto

> Referencia de `xone-project-generator`. Sale del `SKILL.md` para que lo
> esencial quepa en una lectura por omisión (100 líneas).

## Flujo de Generación de Proyectos


### Fase 1: Análisis de Requisitos

1. **Comprender la descripción** — Que tipo de aplicación, cual es su proposito
2. **Identificar colecciones** — Modelo de datos: entidades, campos, relaciones
3. **Identificar pantallas y navegación** — Flujo de usuario: entrada, menu, listados, detalle, formularios
4. **Identificar integraciones** — GPS, camara, firma digital (DR), escaner QR/barras
5. **Definir paleta de colores y estilo visual** — Colores primarios, secundarios, fondos, textos

### Fase 2: Estructura del Proyecto

Consulta [references/fases-0-2-analisis-y-modelo-de-datos.md](references/fases-0-2-analisis-y-modelo-de-datos.md) para el flujo completo.

```
NombreProyecto/
├── bd/              # [OBLIGATORIO] Base de datos SQLite
├── icons/           # [OBLIGATORIO] Recursos graficos (solo PNG)
├── files/           # [OBLIGATORIO] Archivos dinamicos (fotos, firmas, docs)
├── fonts/           # [RECOMENDADO] Fuentes tipograficas (.ttf, .otf)
├── scripts/         # [OPCIONAL] Scripts JS organizados por modulo
├── lang/            # [OPCIONAL] Multiidioma (subcarpetas por ISO: en/, es/)
├── certificates/    # [OPCIONAL] Certificados SSL/TLS
└── splash.png       # [OPCIONAL] Imagen de splash de carga inicial (raíz del proyecto)
                     # Acepta tambien splash.jpg/.gif/.webp/.apng/.mp4/.3gp
                     # El framework lo carga automaticamente — NO es una <coll>
```

### Fase 3: Archivos de Configuración

| Archivo | Descripción |
|---------|-------------|
| `app.xml` | Configuración de la app. Atributo `prefix="gen"` por defecto |
| `app.ini` | Metadatos: Name, Title, Caption, Icon, IconFolder=icons, FilesFolder=files |
| `mappings.xne` | SOLO colecciones Empresas y Usuarios, con los campos de la tabla de arriba. Encoding coherente con el resto del proyecto (regla en `xone-development`) |
| `default.css` | Estilos globales con clases base |
| `functions.js` | Funciones JavaScript globales |

### Fase 4: Colecciones y Pantallas

**Colecciones:**
- Un archivo `.xne` por cada coleccion adicional. Encoding coherente con cómo se guarda (regla en `xone-development`)
- `progid`: opcional salvo Empresas y Usuarios (regla en `xone-development`)
- Usar macro `##PREF##` en queries SQL
- Tipos de prop: solo los de la tabla de tipos de `xone-development`; no inventar otros

**Pantallas:**
- `EntradaApp.xne` — Pantalla de entrada **post-login** (bienvenida con botón "Entrar"). Obligatoria salvo que la app arranque directamente en `MenuPrincipal`. No es el splash (ver la regla de `xone-development` sobre la diferencia)
- `MenuPrincipal.xne` — Menu principal
- Pantallas de listado, detalle, formularios según requisitos
- Inicializar con `<before-edit>` (regla en `xone-development`)
- Splash de carga: fichero en la raíz del proyecto, no una pantalla `.xne` (misma regla)

### Fase 5: Post-Generación

Indicar al usuario que ejecute:
1. Generar base de datos con `xone_db_generator`
2. Insertar datos iniciales (Empresa + Usuario admin)
3. Descargar iconos de Google Material Icons (PNG, JPG o SVG — todos validos)

---
