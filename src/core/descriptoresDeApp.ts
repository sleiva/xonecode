/**
 * Los descriptores de una app XOne: `app.xml` (qué conexiones declara) y `app.ini` (cómo se
 * llama). Datos puros, sin tocar el disco y sin una sola dependencia.
 *
 * **Por qué un escáner y no un regex.** Un regex sobre el texto entero no puede distinguir una
 * etiqueta dentro de un comentario de una de verdad —`<!-- <connection .../> -->` le da
 * exactamente lo mismo—, y aquí el error peligroso es el **falso negativo**: decir «este
 * proyecto no declara conexión» cuando sí la declara deja pasar justo el caso que esta
 * comprobación existe para parar, que es el fichero que falta, el `{"result":true}` del
 * lanzamiento y el diálogo «Database not found» detrás. Un falso positivo, en cambio, solo
 * bloquea y dice por qué: es recuperable. El escáner puede ser correcto en las dos
 * direcciones; un regex, no. Y **no se añade una dependencia de XML**: esto lee dos atributos
 * de un fichero que ya conocemos y que sabemos emitir, no un documento arbitrario.
 *
 * Medido el 2026-09-16 sobre proyectos reales: de cuatro proyectos, dos declaran sus conexiones
 * con `Provider=…` (Replanteos_2026, MyAllXOne), uno declara además la local
 * `connstring="bd/gestion.db"` (MinitsMT) y el esqueleto de `core/esqueleto.ts` declara solo
 * esa ruta. O sea que las dos formas conviven, y por eso hay un predicado que las separa.
 *
 * **Y de ahí sale una consecuencia que NO es la obvia: la declaración es la forma RARA.** De
 * esos cuatro, tres no declaran su base y **los cuatro tienen su `bd/gestion.db`** — porque
 * XOne usa esa ruta **por defecto**, se declare o no—. Así que `esRutaDeFichero` sirve para
 * separar una ruta de una cadena de proveedor dentro de lo declarado, y **no** para decidir qué
 * bases hay que comprobar: eso lo decide la convención, en `puedeLanzarse.ts`. Una regla que
 * dependiera de este escáner para saber si hay base dejaría sin mirar el caso más común —el
 * medido, el diálogo «Database not found»— en tres de cada cuatro proyectos.
 *
 * Y sobre `app.ini`: **el `app.ini` real escribe `name=` en MINÚSCULA** y el esqueleto de
 * `core/esqueleto.ts` escribe `Name=` en mayúscula. Un lector sensible a mayúsculas devolvería
 * `undefined` en todos los proyectos reales y funcionaría solo en el esqueleto — el patrón de
 * fallo de esta casa, escrito en `CLAUDE.md`.
 */

/**
 * Hasta dónde se mira. `app.xml` de verdad son 2-4 KB (el mayor medido, MinitsMT, 3.9 KB), así
 * que este tope solo existe para que un fichero que no es un `app.xml` —un binario, un minified
 * gigante— no se recorra entero. Por encima se devuelve **lo encontrado**: no es un error, es
 * el final del texto que sabemos leer.
 */
export const TOPE_DE_XML = 400_000;

export interface ConexionDeclarada {
  /** El `name` del atributo. Vacío si la etiqueta no lo traía. */
  nombre: string;
  /** El `connstring` tal cual, sin normalizar. */
  connstring: string;
}

/** `[A-Za-z_:]`: con lo que empieza un nombre en XML. */
function esInicioDeNombre(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 58;
}

/** `[-A-Za-z0-9_:.]`: con lo que sigue. */
function esCaracterDeNombre(c: number): boolean {
  return esInicioDeNombre(c) || (c >= 48 && c <= 57) || c === 45 || c === 46;
}

function esEspacio(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

/**
 * Avanza hasta después del `>` que cierra la etiqueta, **sin contar los que van dentro de un
 * valor entrecomillado**. Un `connstring="…Proxy=>algo"` no corta aquí: si cortara, el resto de
 * la etiqueta se leería como si fuera texto del documento.
 */
function saltarEtiqueta(xml: string, desde: number, fin: number): number {
  let j = desde;
  while (j < fin) {
    const c = xml[j]!;
    if (c === '"' || c === "'") {
      const cierre = xml.indexOf(c, j + 1);
      if (cierre < 0) return fin; // comilla sin cerrar: se acabó lo legible
      j = cierre + 1;
      continue;
    }
    if (c === ">") return j + 1;
    j++;
  }
  return fin;
}

/** Un valor entrecomillado o desnudo, desde después del `=`. Devuelve el valor y dónde sigue. */
function leerValor(
  xml: string,
  desde: number,
  fin: number,
): { valor: string; siguiente: number } {
  let j = desde;
  while (j < fin && esEspacio(xml.charCodeAt(j))) j++;
  const comilla = xml[j];
  if (comilla === '"' || comilla === "'") {
    const cierre = xml.indexOf(comilla, j + 1);
    if (cierre < 0) return { valor: "", siguiente: fin }; // sin cerrar: no se inventa el valor
    return { valor: xml.slice(j + 1, cierre), siguiente: cierre + 1 };
  }
  // Sin comillas, que es tolerancia y no XML: termina en espacio, en `>` o en el `/` de `/>`.
  const inicio = j;
  while (j < fin) {
    const c = xml[j]!;
    if (esEspacio(xml.charCodeAt(j)) || c === ">") break;
    if (c === "/" && xml[j + 1] === ">") break;
    j++;
  }
  return { valor: xml.slice(inicio, j), siguiente: j };
}

/**
 * Lee los atributos de la etiqueta abierta en `desde` y devuelve los DOS que importan más el
 * índice por el que seguir. Se queda con `name` y `connstring` y con nada más: `datemask`,
 * `prefix`, `objname`, `updateobj` y `progid` están medidos en los proyectos reales y ninguno
 * cambia la decisión.
 *
 * No desescapa entidades a propósito. El valor de un `connstring` que es una ruta **es** una
 * ruta, y `&amp;` → `&` la cambiaría por un camino que XOne no va a abrir: desescapar aquí
 * sería inventar.
 */
function leerAtributos(
  xml: string,
  desde: number,
  fin: number,
): { nombre: string; connstring: string; siguiente: number } {
  let nombre = "";
  let connstring = "";
  let j = desde;
  while (j < fin) {
    while (j < fin && esEspacio(xml.charCodeAt(j))) j++;
    if (j >= fin) break;
    const c = xml[j]!;
    if (c === ">") {
      j++;
      break;
    }
    if (c === "/") {
      j++; // el `>` de `/>` lo consume la vuelta siguiente
      continue;
    }
    const inicio = j;
    while (j < fin && esCaracterDeNombre(xml.charCodeAt(j))) j++;
    if (j === inicio) {
      j++; // algo que no entendemos: se avanza, que quedarse clavado sí sería un cuelgue
      continue;
    }
    const atributo = xml.slice(inicio, j);
    let k = j;
    while (k < fin && esEspacio(xml.charCodeAt(k))) k++;
    if (xml[k] !== "=") {
      j = k; // atributo sin valor (un `disabled` suelto): legal, y no es de los nuestros
      continue;
    }
    const leido = leerValor(xml, k + 1, fin);
    if (atributo === "name") nombre = leido.valor;
    else if (atributo === "connstring") connstring = leido.valor;
    j = leido.siguiente;
  }
  return { nombre, connstring, siguiente: j };
}

/**
 * Las conexiones que declara `app.xml`, **en orden de aparición**.
 *
 * Bucle sobre índices y sin recursión: cada `<` se decide una vez y se avanza, así que un
 * documento mal formado no puede hacer otra cosa que terminar antes.
 *
 * No se mira `<connection>` **dentro de un comentario, de un CDATA, del prólogo `<?xml ?>` ni
 * de un `<!DOCTYPE>`**, que es exactamente lo que un regex no sabe hacer. Medido: el `app.xml`
 * de MinitsMT tiene cuatro bloques de comentario —uno de ellos de cinco líneas y otro que
 * contiene atributos comentados— y el de Replanteos tiene un `<include>` comentado.
 *
 * Un `<connection` sin `>` que lo cierre **sí** se devuelve, con lo que se haya podido leer. Es
 * el lado conservador y la misma doctrina del falso negativo: una etiqueta truncada es una
 * conexión declarada cuyo valor no se pudo leer, y decir «no declara ninguna» sería afirmar de
 * más.
 */
export function conexionesDeApp(xml: string): ConexionDeclarada[] {
  const conexiones: ConexionDeclarada[] = [];
  const fin = Math.min(xml.length, TOPE_DE_XML);
  let i = 0;
  while (i < fin) {
    const lt = xml.indexOf("<", i);
    if (lt < 0 || lt >= fin) break;

    if (xml.startsWith("<!--", lt)) {
      const cierre = xml.indexOf("-->", lt + 4);
      if (cierre < 0) break; // comentario sin cerrar: no hay nada más que leer
      i = cierre + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const cierre = xml.indexOf("]]>", lt + 9);
      if (cierre < 0) break;
      i = cierre + 3;
      continue;
    }
    if (xml.startsWith("<?", lt)) {
      const cierre = xml.indexOf("?>", lt + 2);
      if (cierre < 0) break;
      i = cierre + 2;
      continue;
    }
    if (xml.startsWith("<!", lt)) {
      // `<!DOCTYPE …>` y cualquier otra declaración. Con subconjunto interno —el `[ … ]>`— se
      // salta hasta `]>` y no hasta el primer `>`: dentro puede haber cualquier cosa, y parar
      // en un `>` de dentro dejaría el resto del subconjunto leyéndose como texto del
      // documento. Ahí es donde un `<connection>` de mentira se colaría.
      const corchete = xml.indexOf("[", lt + 2);
      const primerCierre = xml.indexOf(">", lt + 2);
      const conSubconjunto = corchete >= 0 && (primerCierre < 0 || corchete < primerCierre);
      const cierre = conSubconjunto ? xml.indexOf("]>", corchete) : primerCierre;
      if (cierre < 0) break;
      i = conSubconjunto ? cierre + 2 : cierre + 1;
      continue;
    }

    const esDeCierre = xml[lt + 1] === "/";
    let j = esDeCierre ? lt + 2 : lt + 1;
    const inicioDelNombre = j;
    while (j < fin && esCaracterDeNombre(xml.charCodeAt(j))) j++;
    if (j === inicioDelNombre) {
      // Un `<` suelto —una comparación en un `script`—: no es una etiqueta. Se sigue desde el
      // carácter siguiente y no desde `j`, o el `<` se volvería a encontrar para siempre.
      i = lt + 1;
      continue;
    }

    if (esDeCierre || xml.slice(inicioDelNombre, j) !== "connection") {
      i = saltarEtiqueta(xml, j, fin);
      continue;
    }

    const { nombre, connstring, siguiente } = leerAtributos(xml, j, fin);
    conexiones.push({ nombre, connstring });
    i = siguiente;
  }
  return conexiones;
}

/**
 * El `name=`/`Name=` de `app.ini`, recortado. `undefined` si no está o si está vacío.
 *
 * **Sin distinguir mayúsculas, y no es prudencia: es el censo.** Los tres `app.ini` reales que
 * existen —Replanteos_2026, MyAllXOne y AppDemo; MinitsMT no tiene— escriben `name=` en
 * minúscula, y el esqueleto de xonecode escribe `Name=`. Comparar con `=== "name"` funcionaría
 * en todos los proyectos de verdad y fallaría en el único que escribimos nosotros, que es el
 * peor reparto posible.
 *
 * Se salta las líneas sin `=`: el `app.ini` de AppDemo tiene una. Y la PRIMERA clave que case
 * decide: no se sigue buscando otra por si acaso, porque dos `name=` en el mismo fichero no son
 * una ambigüedad que resolver, son un fichero que alguien tocó.
 */
export function nombreDeApp(ini: string): string | undefined {
  for (const linea of ini.split("\n")) {
    const corte = linea.indexOf("=");
    if (corte < 0) continue;
    if (linea.slice(0, corte).trim().toLowerCase() !== "name") continue;
    const valor = linea.slice(corte + 1).trim();
    return valor === "" ? undefined : valor;
  }
  return undefined;
}

/**
 * ¿Este `connstring` es una RUTA del proyecto, o una cadena de proveedor?
 *
 * Medido el 2026-09-16: `bd/gestion.db` es una ruta; `Provider=Xone Remote Provider;ProgID=…`
 * no lo es, y esos proyectos (Replanteos_2026, MyAllXOne) arrancan perfectamente. Confundirlos
 * bloquearía un lanzamiento que funciona. Los tres descartes son la forma de una cadena de
 * proveedor y no una lista de proveedores conocidos, para que uno nuevo no se cuele como ruta:
 * `;` separa campos, `=` asigna, y `://` es un origen remoto.
 *
 * **La comprobación de existencia que esto habilita es conservadora a propósito, y su falso
 * positivo está acotado.** Mira el PROYECTO, no el dispositivo: un proyecto que nunca se
 * arrancó en local puede no tener `bd/gestion.db` aquí y tenerlo en el aparato, y entonces esto
 * bloquea un lanzamiento que habría funcionado. Se acepta porque el error contrario —el
 * medido— es un `{"result":true}` seguido de un diálogo de error, sin síntoma en ningún sitio;
 * y porque la frase que lo acompaña dice exactamente qué falta. Preguntarle al DISPOSITIVO si
 * tiene el fichero es la mejora obvia y queda fuera de esta pasada.
 */
export function esRutaDeFichero(connstring: string): boolean {
  const valor = connstring.trim();
  if (valor === "") return false;
  if (valor.includes(";") || valor.includes("=") || valor.includes("://")) return false;
  return /\.[A-Za-z0-9]{1,8}$/.test(valor);
}
