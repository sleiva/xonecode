/**
 * El selector de carpeta NATIVO: qué comando lo abre en cada sistema y cómo se lee su
 * respuesta.
 *
 * **Por qué no lo pone el navegador, que es lo primero que uno intenta.** Una página no
 * puede devolver una ruta absoluta y no es un descuido de nadie: `showDirectoryPicker()`
 * entrega un handle del que solo se puede leer el NOMBRE de la carpeta, y un
 * `<input webkitdirectory>` entrega rutas RELATIVAS a lo elegido. Las dos cosas son
 * deliberadas —una web no tiene por qué saber cómo está montado tu disco— y las dos son
 * justo lo que aquí no sirve: `settings.workspace` necesita la ruta entera.
 *
 * **Por qué tampoco un explorador propio servido por nosotros.** Se puede: el servidor lista
 * carpetas y el cliente navega. El precio es que el ÁRBOL DE CARPETAS de la máquina empieza
 * a viajar por el cable, y eso es exactamente lo que `sinRutas` evita — una ruta del
 * workspace es la excepción declarada; el mapa del disco entero no lo es, y sería una
 * excepción mucho más ancha para el mismo resultado.
 *
 * **Así que lo abre el sistema donde corre la consola.** Solo cruza el cable la carpeta que
 * la persona elige, que es la misma que iba a teclear. El precio declarado es que el diálogo
 * sale en ESA máquina: con la consola por un túnel, el botón no sirve — por eso el campo de
 * texto sigue siendo el camino principal y esto es un atajo, nunca el único.
 *
 * Esta parte es pura: compone el comando y lee su salida. Lanzarlo es de
 * `agent/config/selectorEnMaquina.ts`.
 */
import { posix, win32 } from "node:path";

/** Lo que tarda un diálogo en contestar lo pone una persona, así que el tope es largo: solo
 *  existe para que un diálogo que nadie cierra no deje un proceso vivo para siempre. */
export const TOPE_DEL_SELECTOR_MS = 5 * 60 * 1000;

const TITULO_DEL_SELECTOR = "Dónde se bajan los proyectos de XOneCode";

/**
 * El C# que PowerShell compila al vuelo (`Add-Type`, en unas décimas de segundo) para abrir
 * el diálogo moderno de carpetas de Windows: no hay otra forma de llegar a `IFileOpenDialog`
 * desde PowerShell sin un binario propio que distribuir.
 */
const SELECTOR_DE_WINDOWS = String.raw`using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public static class SelectorXone {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialog {}
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr hwnd);
    void SetFileTypes(); void SetFileTypeIndex(); void GetFileTypeIndex(); void Advise(); void Unadvise();
    void SetOptions(uint fos); void GetOptions(out uint fos);
    void SetDefaultFolder(IShellItem si); void SetFolder(IShellItem si);
    void GetFolder(); void GetCurrentSelection(); void SetFileName(); void GetFileName();
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t);
    void SetOkButtonLabel(); void SetFileNameLabel();
    void GetResult(out IShellItem si);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(); void GetParent();
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
  }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IShellItem item);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public static string Elegir(string titulo, string desde) {
    var area = Screen.FromPoint(Cursor.Position).WorkingArea;
    var duenyo = new Form { TopMost = true, ShowInTaskbar = false, FormBorderStyle = FormBorderStyle.None,
      StartPosition = FormStartPosition.Manual, Opacity = 0 };
    duenyo.Show();
    duenyo.Bounds = new System.Drawing.Rectangle(area.Left + area.Width / 2, area.Top + area.Height / 2, 1, 1);
    SetForegroundWindow(duenyo.Handle); duenyo.Activate();
    var reloj = new Timer { Interval = 30 };
    int intentos = 0;
    reloj.Tick += (o, e) => {
      if (++intentos > 100) { reloj.Stop(); return; }
      IntPtr dlg = GetWindow(duenyo.Handle, 6);
      if (dlg == IntPtr.Zero || dlg == duenyo.Handle) return;
      RECT r; if (!GetWindowRect(dlg, out r)) return;
      int w = r.Right - r.Left, h = r.Bottom - r.Top;
      SetWindowPos(dlg, IntPtr.Zero, area.Left + (area.Width - w) / 2, area.Top + (area.Height - h) / 2, 0, 0, 0x0015);
      reloj.Stop();
    };
    reloj.Start();
    try {
      var d = (IFileOpenDialog)new FileOpenDialog();
      d.SetOptions(0x20 | 0x40);
      d.SetTitle(titulo);
      if (!string.IsNullOrEmpty(desde)) {
        try { IShellItem si; SHCreateItemFromParsingName(desde, IntPtr.Zero, typeof(IShellItem).GUID, out si); d.SetFolder(si); } catch {}
      }
      if (d.Show(duenyo.Handle) != 0) return null;
      IShellItem res; d.GetResult(out res);
      string ruta; res.GetDisplayName(0x80058000, out ruta);
      return ruta;
    } finally { reloj.Stop(); duenyo.Close(); }
  }
}`;

export interface ComandoDeSelector {
  programa: string;
  argumentos: readonly string[];
}

/**
 * El comando que abre el selector, o AUSENTE si este sistema no tiene ninguno conocido.
 *
 * Ausente no es un fallo: es «aquí no hay selector», y entonces no se ofrece el botón. Un
 * botón que no hace nada es peor que no tenerlo, y el campo de texto ya resuelve el caso.
 *
 * `desde` es dónde se abre el diálogo — la carpeta que hay puesta ahora, para no empezar en
 * un sitio cualquiera. Se pasa como argumento SEPARADO, nunca interpolado en el guion de
 * AppleScript: ahí dentro una comilla en un nombre de carpeta cerraría la cadena.
 */
export function comandoDelSelector(plataforma: string, desde?: string): ComandoDeSelector | undefined {
  if (plataforma === "darwin") {
    // `choose folder` con la ubicación por argumento (`argv of me`), y no pegada al guion.
    // Un `POSIX file` que no existe hace fallar el diálogo entero, así que el guion cae a la
    // casa cuando no se le da ninguna o la que se le da no vale.
    const guion = [
      "on run argumentos",
      "  set destino to item 1 of argumentos",
      "  try",
      '    set inicio to POSIX file destino as alias',
      "  on error",
      "    set inicio to path to home folder",
      "  end try",
      `  set elegida to choose folder with prompt "${TITULO_DEL_SELECTOR}" default location inicio`,
      "  return POSIX path of elegida",
      "end run",
    ].join("\n");
    return { programa: "osascript", argumentos: ["-e", guion, desde ?? ""] };
  }
  if (plataforma === "linux") {
    return {
      programa: "zenity",
      argumentos: [
        "--file-selection",
        "--directory",
        `--title=${TITULO_DEL_SELECTOR}`,
        ...(desde === undefined ? [] : [`--filename=${desde.replace(/\/*$/, "/")}`]),
      ],
    };
  }
  if (plataforma === "win32") {
    // IXCODE-22, segunda vuelta. El `FolderBrowserDialog` de Forms es el árbol CLÁSICO: sin
    // barra de direcciones ni campo donde teclear la ruta, y sin dueño se abría DETRÁS del
    // navegador. Se usa el diálogo del Explorador actual (`IFileOpenDialog` en modo carpetas)
    // con un dueño invisible `TopMost`, y se CENTRA a mano: el diálogo recuerda dónde se cerró
    // la última vez y se abre ahí, no sobre su dueño. Probado en un Windows de verdad, lanzado
    // como lo lanza `execFile` (hijo de node): sale delante y centrado, se teclea la ruta, y
    // una carpeta con acentos vuelve entera —por el `OutputEncoding`: sin él stdout sale en la
    // página de códigos de la consola—. La ruta de inicio va entre comillas simples con las
    // suyas dobladas; `-STA` es obligatorio para un diálogo.
    const inicio = desde === undefined ? "''" : `'${desde.replace(/'/g, "''")}'`;
    const guion = [
      "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
      "Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'",
      SELECTOR_DE_WINDOWS,
      // El here-string de PowerShell exige que `'@` cierre al PRINCIPIO de una línea.
      "'@",
      `$r = [SelectorXone]::Elegir('${TITULO_DEL_SELECTOR}', ${inicio})`,
      "if ($r) { $r }",
    ].join("\n");
    return { programa: "powershell.exe", argumentos: ["-NoProfile", "-STA", "-Command", guion] };
  }
  return undefined;
}

/**
 * La carpeta elegida, leída de lo que escupió el comando — o AUSENTE si no se eligió ninguna.
 *
 * **Cancelar no es un fallo y se cuenta igual que no elegir.** `osascript` sale con código 1
 * y `zenity` con 1 cuando la persona cierra el diálogo, así que quien llama no puede
 * distinguir un «no, gracias» de una avería por el código; lo que sí distingue es que no hay
 * ruta, y con eso basta: el campo se queda como estaba.
 *
 * Se recorta el salto de línea final, que es del terminal y no del dato, y se exige que
 * empiece por `/`: cualquier otra cosa que salga por ahí no es una carpeta y no se cuela
 * hasta el validador disfrazada de ruta.
 */
export function carpetaDeLaSalida(salida: string): string | undefined {
  const bruta = salida.trim();
  // Windows: `C:\…` o `\\servidor\…`, que es lo que devuelve su diálogo.
  if (/^[a-zA-Z]:[\\/]/.test(bruta) || bruta.startsWith("\\\\")) return bruta.replace(/(?<=.)[\\/]+$/, "");
  const limpia = bruta.replace(/\/+$/, "");
  return limpia.startsWith("/") ? limpia : undefined;
}

/**
 * El comando que abre, en el explorador de ficheros del sistema, la carpeta que CONTIENE
 * `ruta` — pensado para «enséñame dónde está este binario», no para elegir una carpeta.
 *
 * Los tres sistemas, sin lista cerrada que devuelva ausente: a diferencia del selector de
 * arriba, `explorer.exe`/`open`/`xdg-open` existen en cualquier Windows, macOS o Linux de
 * escritorio, así que no hace falta un tercer estado «este sistema no tiene».
 *
 * `dirname` y no `ruta` tal cual: `ruta` apunta al BINARIO (`…\platform-tools\adb.exe`), y
 * lo que el botón promete es enseñar dónde vive, no intentar «ejecutar» la carpeta.
 *
 * **El `dirname` es el de `plataforma`, no el de este proceso.** `node:path` por omisión
 * resuelve al del sistema donde CORRE el test, y una ruta de Windows partida con el
 * `dirname` POSIX de un runner Linux/Mac no encuentra ninguna barra que cortar —
 * `npm test` tiene que poder probar los tres sistemas desde uno solo.
 *
 * Pura: compone el comando. Lanzarlo es de `agent/config/selectorEnMaquina.ts`.
 */
export function comandoParaAbrirCarpeta(plataforma: string, ruta: string): ComandoDeSelector {
  return comandoParaAbrirDirectorio(plataforma, (plataforma === "win32" ? win32 : posix).dirname(ruta));
}

/**
 * El comando que abre ESA carpeta —no la que la contiene— en el explorador de ficheros del
 * sistema. Es el de «ver los ficheros del proyecto» del resumen.
 *
 * En Windows la ruta se NORMALIZA a barras invertidas: la raíz de un proyecto sale de
 * `rutaDeWorkspace`, que junta con `/` sobre una base de `\`, y `explorer.exe` no entiende una
 * ruta mezclada — abre «Documentos» en su lugar, sin error que leer.
 */
export function comandoParaAbrirDirectorio(plataforma: string, carpeta: string): ComandoDeSelector {
  if (plataforma === "win32") return { programa: "explorer.exe", argumentos: [win32.normalize(carpeta)] };
  if (plataforma === "darwin") return { programa: "open", argumentos: [carpeta] };
  return { programa: "xdg-open", argumentos: [carpeta] };
}
