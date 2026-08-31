import { describir, depsOffline, type Deps } from "../core/deps.js";
import { Modelos } from "../agent/modelos.js";
import { cargar } from "../agent/configEnDisco.js";
import { ModeloMalEscrito, type FuentesDeEleccion } from "../core/modelos.js";
import { escribirEnStdout, type Escribir } from "./stdio.js";

/**
 * Qué hay montado. **Sin red, sin claves y sin el simulador**, a propósito: existe para
 * ver la deriva, y un diagnóstico que necesita credenciales no se usa cuando hace falta.
 */
export function cmdDescribe(
  fuentes: FuentesDeEleccion,
  escribir: Escribir = escribirEnStdout,
  raiz: string = process.cwd()
): number {
  // Se leen los config.json de disco para que los papeles puedan enseñar las
  // procedencias (proyecto)/(global) —`fuentes` solo trae banderas y entorno— y para
  // sacar también aquí los avisos GRAVES: un aviso que solo aparece en
  // `xonecode config`, que nadie corre, no protege de nada.
  const cargado = cargar(raiz);
  const fuentesCompletas: FuentesDeEleccion = {
    ...fuentes,
    proyecto: cargado.config.proyecto,
    global: cargado.config.global,
  };

  let modelos: Modelos;
  const avisosDeResolucion: string[] = [];
  try {
    // Los modelos SÍ son reales aquí: lo que se enseña es qué se usaría, y construirlos
    // es perezoso, así que no hace falta ninguna clave para imprimirlo.
    modelos = new Modelos(fuentesCompletas);
  } catch (e) {
    if (!(e instanceof ModeloMalEscrito)) throw e;
    // Un `modelo` mal escrito en un config.json lanza en el constructor (vía resolver);
    // un fichero de configuración mal escrito no puede impedir que describe funcione,
    // así que se cae a bandera/entorno/omisión y se avisa como grave.
    modelos = new Modelos(fuentes);
    avisosDeResolucion.push(
      `no se pudo resolver el modelo desde la configuración de fichero (${e.message}); ` +
        "se ignoran proyecto y global solo para el modelo."
    );
  }

  const deps: Deps = { ...depsOffline(), modelos };
  for (const linea of describir(deps)) escribir(`${linea}\n`);

  // Solo los GRAVES: los avisos normales ya salen en `xonecode config`; aquí se repiten
  // los que de verdad importan (auth.json legible por otros, clave colada en config...).
  // `cargado.auth` no se imprime jamás: describe no toca credenciales en absoluto.
  const graves = cargado.avisos.filter((a) => a.severidad === "grave").map((a) => a.texto);
  const todosLosGraves = [...graves, ...avisosDeResolucion];
  if (todosLosGraves.length > 0) {
    escribir("--- avisos de configuración ---\n");
    for (const texto of todosLosGraves) escribir(`  ⚠  ${texto}\n`);
  }

  return 0;
}
