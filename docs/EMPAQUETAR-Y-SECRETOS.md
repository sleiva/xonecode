# Empaquetar XoneCode, y los secretos que lleva dentro

Esto es para quien **construye y reparte** XoneCode: `npm run build`, `npm pack` o `npm link`.
Quien solo lo usa no tiene que hacer nada de lo que viene aquí.

## Qué secretos hay

**Uno solo: la credencial de byXOneDownloads**, el almacén de XOne de donde XoneCode baja el APK
del framework de Android para instalarlo en un aparato.

Lo demás **no** va en el paquete:

| | Cómo se autentica | Dónde vive |
|---|---|---|
| CloudStudio | OAuth con registro dinámico y PKCE: cada instalación se registra sola y cada persona entra con su cuenta | `~/.xonecode/cloudstudio-oauth.json`, de esa persona |
| Modelos (Anthropic, OpenAI, DeepSeek…) | La clave de API de cada persona | `~/.xonecode/auth.json`, de esa persona |
| Conectores MCP (Jira, Notion, Stitch…) | OAuth de cada persona, o su propia clave | `~/.xonecode/conectores*.json`, de esa persona |
| **byXOneDownloads** | **Un cliente del COMPONENTE, igual para todos** | **Dentro del paquete**: `dist/byxone.json` |

## La credencial de byXOne

### Qué cliente es

Se usa **`xcode-read`**, que solo tiene permisos `list` y `download`.

**Nunca empaquetes otro cliente.** Lo que va dentro del paquete hay que darlo por público:
cualquiera que instale XoneCode puede abrir `dist/byxone.json` y leerlo. Con `xcode-read`, lo peor
que se puede hacer con él es listar y descargar frameworks, que es lo que XoneCode ya hace.

`xcode` no vale aquí: tiene además `upload`, `edit` y `admin`. Con `admin` se borran entradas del
catálogo, y eso afecta a **todos** los XOneHub a la vez.

### Cómo entra en el paquete

No está en git. `npm run build` la escribe en `dist/byxone.json` leyendo dos variables de entorno
de quien construye (`scripts/credencialByxone.mjs`):

| Variable | Valor |
|---|---|
| `BYXONE_CLIENT_ID_DE_BUILD` | `xcode-read` |
| `BYXONE_SECRETO_DE_BUILD` | el secreto de `xcode-read` (pídeselo a quien administra byXOne) |

- **`npm run build`**: si faltan las variables, **avisa y sigue**. Ese build no lleva credencial;
  sirve para desarrollar, pero no para repartirlo.
- **`npm pack`** (por su `prepack`): si faltan, **falla con código 70**. Así no se puede repartir
  un paquete sin credencial sin darse cuenta.

Si va bien, el build lo dice sin enseñar el secreto:

```
byXOne: credencial empaquetada para el cliente «xcode-read».
```

### Comandos

Pon las variables **solo para la ventana** desde la que construyes. Así el secreto no queda en el
registro, ni en el historial, ni lo hereda ningún otro programa.

**PowerShell** (el secreto se teclea sin verse):

```powershell
$env:BYXONE_CLIENT_ID_DE_BUILD = "xcode-read"
$env:BYXONE_SECRETO_DE_BUILD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host "Secreto de xcode-read" -AsSecureString)))
npm pack
```

**Git Bash / macOS / Linux:**

```sh
export BYXONE_CLIENT_ID_DE_BUILD=xcode-read
read -rs -p "Secreto de xcode-read: " BYXONE_SECRETO_DE_BUILD; echo; export BYXONE_SECRETO_DE_BUILD
npm pack
```

Para comprobar que están puestas sin enseñar el secreto (PowerShell):

```powershell
$env:BYXONE_CLIENT_ID_DE_BUILD; [bool]$env:BYXONE_SECRETO_DE_BUILD   # xcode-read / True
```

Para comprobar que el paquete la lleva, sin abrirla:

```sh
tar -tzf xonecode-*.tgz | grep byxone.json    # package/dist/byxone.json
```

**En CI**, guarda las dos variables como secretos del pipeline (enmascarados en el log), nunca
escritas en el fichero del pipeline.

### En desarrollo

`npm run web` y `./bin/xonecode` corren sobre `src/` y no ven `dist/`, así que no usan la
credencial empaquetada. Para desarrollar, cada persona pone la suya en un fichero personal:

```
~/.xonecode/byxone.json
{ "clientId": "xcode-read", "secreto": "…" }
```

O, sin dejarla en disco, en estas dos variables para esa ventana:

```powershell
$env:XONECODE_BYXONE_CLIENT_ID = "xcode-read"
$env:XONECODE_BYXONE_SECRETO = "…"
```

### Qué credencial se usa, si hay varias

En este orden (`src/core/byxone.ts#resolverCredencialByxone`):

1. Las variables `XONECODE_BYXONE_CLIENT_ID` y `XONECODE_BYXONE_SECRETO`. Tienen que estar las dos;
   si solo hay una, se dice y no se mezcla con lo de abajo.
2. El fichero personal `~/.xonecode/byxone.json`. Si existe pero está mal, se dice: **no** se pasa
   en silencio a la empaquetada.
3. La empaquetada, `dist/byxone.json`.

Sin ninguna, XoneCode sigue instalando las versiones del framework **ya descargadas**; solo deja
de ver el catálogo.

Ni la credencial ni ninguna de estas variables llega a la consola web ni a la shell del agente
(`src/core/shellDeAgente.ts`).

## Si el secreto se filtra

1. Pide a quien administra byXOne que **desactive** `xcode-read` y dé de alta otro cliente con
   solo `list,download`.
2. Construye y reparte una versión nueva con la credencial nueva.
3. Las instalaciones viejas dejan de ver el catálogo, pero siguen pudiendo instalar lo que ya
   tenían descargado.

## Lo que se acepta al empaquetar así

- **byXOne no sabe qué persona descarga**: su auditoría ve `xcode-read` en todas las
  instalaciones.
- **El secreto no es secreto** para quien tenga el paquete. Por eso el cliente es de solo lectura.

La salida a largo plazo es que byXOne acepte el login de CloudStudio (el token del IDS) para listar
y descargar. Así cada persona entraría como ella misma y no haría falta ningún secreto en el
paquete.
