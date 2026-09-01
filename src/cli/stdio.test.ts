import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import * as readline from "node:readline";
import { crearPielStdio, crearPreguntar, crearLeerSecreto } from "./stdio.js";
import { crearTema } from "./tema.js";

function acumulador() {
  const trozos: string[] = [];
  return { trozos, escribir: (t: string) => trozos.push(t) };
}

describe("piel de stdio", () => {
  it("los trozos fluyen por LÍNEA CONFIRMADA: una escritura por línea, no una por trozo", () => {
    // El anti-ainvoke de siempre: la línea confirmada se suelta en el acto, sin
    // esperar al final del turno. Lo que ya NO se escribe es un trozo a medio marcar.
    const { trozos, escribir } = acumulador();
    const piel = crearPielStdio(escribir);
    piel.token("Listo. He recorrido ");
    expect(trozos).toEqual([]); // la línea aún no está confirmada: nada a medias
    piel.token("el turno entero.\nHecho.");
    expect(trozos.join("")).toBe("Listo. He recorrido el turno entero.\n");
    piel.cerrarLinea();
    expect(trozos.join("")).toBe("Listo. He recorrido el turno entero.\nHecho.\n");
  });

  it("un párrafo largo fluye por CORTES SEGUROS sin esperar al salto de línea", () => {
    const { trozos, escribir } = acumulador();
    const piel = crearPielStdio(escribir);
    const texto = `la **colección Hola** con el campo \`Nombre\` y una explicación larga que se pasa ` +
      `del mínimo de flujo para forzar un corte en un espacio seguro del párrafo en marcha`;
    piel.token(texto);
    // Fluyó ANTES de cerrar: un colchón que solo se suelta al final es un `ainvoke`
    // disfrazado de streaming. (Un solo token produce un corte; lo que queda cae bajo
    // el mínimo y espera al cierre.)
    expect(trozos.length).toBe(1);
    piel.cerrarLinea();
    // Y el corte no rompió nada: ni un carácter perdido ni uno repetido.
    expect(trozos.length).toBe(2);
    expect(trozos.join("")).toBe(texto + "\n");
  });

  it("con TTY, la línea confirmada sale con el markdown pintado", () => {
    const { trozos, escribir } = acumulador();
    const CON = crearTema(true);
    const piel = crearPielStdio(escribir, CON);
    piel.token("la **Hola** está lista\n");
    expect(trozos.join("")).toBe(`la ${CON.negrita}Hola${CON.reset} está lista\n`);
  });

  it("la respuesta se lee como UNA frase, no como una lista", () => {
    const { trozos, escribir } = acumulador();
    const piel = crearPielStdio(escribir);
    for (const t of ["Se ha", " creado", " la colección"]) piel.token(t);
    piel.cerrarLinea();
    expect(trozos.join("")).toBe("Se ha creado la colección\n");
  });

  it("la fase sin TTY es la línea estática de siempre, sin animación alguna", () => {
    const { trozos, escribir } = acumulador();
    const piel = crearPielStdio(escribir);
    piel.fase!("planificando");
    expect(trozos.join("")).toBe("  ·  planificando\n");
  });

  it("la cascada: cualquier escritura termina el spinner y deja la fase en el historial", () => {
    const { trozos, escribir } = acumulador();
    const CON = crearTema(true);
    const piel = crearPielStdio(escribir, CON);
    piel.fase!("planificando");
    piel.linea("→ lee app.xne");
    expect(trozos[0]).toBe(`\r  ${CON.mudo}⠋ planificando${CON.reset}`); // el fotograma
    expect(trozos[1]).toBe(`\r${CON.borrar}  ·  planificando\n`); // la fase, ya estática
    expect(trozos[2]).toBe("  → lee app.xne\n"); // y la escritura que desplazó al spinner
  });

  it("una línea suelta va sangrada y con su propio salto", () => {
    const { trozos, escribir } = acumulador();
    crearPielStdio(escribir).linea("🔧 grep ×3");
    expect(trozos.join("")).toBe("  🔧 grep ×3\n");
  });

  it("la pausa dice cuántas aprobaciones hay pendientes, sin detallarlas ni invitar a escribir la respuesta", () => {
    // El detalle de cada pendiente (origen, descripción) lo pinta `pedirDecisiones` al
    // preguntar; aquí sería redundante. Y «responde: approve / reject» mentía:
    // `interpretAnswer` no acepta esas palabras. La pausa solo cuenta cuántas hay.
    const { trozos, escribir } = acumulador();
    crearPielStdio(escribir).pausa([
      { id: "i1", origen: "dev", descripcion: "escribir Clientes.xne", decisionesPermitidas: ["approve", "reject"] },
    ]);
    const salida = trozos.join("");
    expect(salida).not.toContain("[dev] escribir Clientes.xne");
    expect(salida).not.toContain("approve / reject");
    expect(salida).toContain("turno pausado: 1 aprobación(es) pendiente(s)");
    expect(salida).not.toContain("lo siguiente que escribas");
  });

  it("el fin dice cuánto tardó", () => {
    const { trozos, escribir } = acumulador();
    crearPielStdio(escribir).fin(2500);
    expect(trozos.join("")).toBe("\n(2.5s)\n");
  });

  it("con TTY, los avisos van al panel reciclado y el contenido real los solidifica", () => {
    const { trozos, escribir } = acumulador();
    const CON = crearTema(true);
    const piel = crearPielStdio(escribir, CON);
    const aviso = "△ el verificador no ha corrido en este turno";
    piel.notificacion!(aviso);
    expect(trozos[0]).toBe(`${CON.limpiarLinea}${CON.mudo}${aviso}${CON.reset}\n`);
    // La primera escritura de contenido colapsa el panel: queda el aviso, solo.
    // (Con UNA línea de panel no hay nada más que borrar tras ella.)
    piel.linea("→ lee app.xne");
    expect(trozos[1]).toBe(
      `${CON.arriba(1)}\r${CON.limpiarLinea}${CON.mudo}${aviso}${CON.reset}\n`
    );
    expect(trozos[2]).toBe("  → lee app.xne\n");
    // Y el panel quedó vacío: el siguiente aviso arranca de cero, sin subir el cursor.
    piel.notificacion!("otro aviso");
    expect(trozos[3]).toBe(`${CON.limpiarLinea}${CON.mudo}otro aviso${CON.reset}\n`);
  });

  it("con TTY, la pausa entra al panel y se solidifica en el acto: el bloque de aprobación escribe después por su lado", () => {
    const { trozos, escribir } = acumulador();
    const CON = crearTema(true);
    const piel = crearPielStdio(escribir, CON);
    piel.pausa([
      { id: "i1", origen: "dev", descripcion: "escribir Clientes.xne", decisionesPermitidas: ["approve", "reject"] },
    ]);
    const texto = "(turno pausado: 1 aprobación(es) pendiente(s))";
    expect(trozos[0]).toBe(`${CON.limpiarLinea}${CON.mudo}${texto}${CON.reset}\n`);
    expect(trozos[1]).toBe(
      `${CON.arriba(1)}\r${CON.limpiarLinea}${CON.mudo}${texto}${CON.reset}\n`
    );
  });

  it("con TTY, el fin fusiona los avisos pendientes y el tiempo en UNA sola línea", () => {
    const { trozos, escribir } = acumulador();
    const CON = crearTema(true);
    const piel = crearPielStdio(escribir, CON);
    piel.notificacion!("△ el verificador no ha corrido en este turno");
    piel.fin(998200);
    const fusion = "△ el verificador no ha corrido en este turno · (998.2s)";
    // trozos[0]: el aviso pintado. trozos[1]: el repintado al entrar la fusión.
    expect(trozos[1]).toBe(
      `${CON.arriba(1)}\r${CON.limpiarLinea}${CON.mudo}△ el verificador no ha corrido en este turno${CON.reset}\n` +
        `${CON.limpiarLinea}${CON.mudo}${fusion}${CON.reset}\n`
    );
    // trozos[2]: el colapso final, que deja SOLO la fusión en el historial (y limpia
    // la línea del aviso que el repintado dejó debajo).
    expect(trozos[2]).toBe(
      `${CON.arriba(2)}\r${CON.limpiarLinea}${CON.mudo}${fusion}${CON.reset}\n${CON.limpiarLinea}\n`
    );
  });

  it("con TTY, un fin sin avisos solidifica solo el tiempo", () => {
    const { trozos, escribir } = acumulador();
    const CON = crearTema(true);
    const piel = crearPielStdio(escribir, CON);
    piel.fin(2500);
    // Pintar y solidificar son dos escrituras; con UNA línea no hay nada más que borrar.
    expect(trozos.join("")).toBe(
      `${CON.limpiarLinea}${CON.mudo}(2.5s)${CON.reset}\n` +
        `${CON.arriba(1)}\r${CON.limpiarLinea}${CON.mudo}(2.5s)${CON.reset}\n`
    );
  });
});

function crearRlDePrueba() {
  const input = new PassThrough();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (input as any).isTTY = true;
  const output = new PassThrough();
  let escrito = "";
  output.on("data", (d) => {
    escrito += d.toString();
  });
  const rl = readline.createInterface({ input, output, terminal: true });
  return { rl, input, salida: () => escrito };
}

describe("preguntar y leerSecreto sobre el rl compartido", () => {
  it("crearPreguntar escribe el prompt y devuelve la línea tecleada", async () => {
    const { rl, input, salida } = crearRlDePrueba();
    try {
      const preguntar = crearPreguntar(rl);
      const promesa = preguntar("¿Nombre? ");
      input.write("hola\n");
      const respuesta = await promesa;
      expect(respuesta).toBe("hola");
      expect(salida()).toContain("¿Nombre? ");
      // El eco está encendido: readline repite la línea tecleada en la terminal.
      expect(salida()).toContain("hola");
    } finally {
      rl.close();
    }
  });

  it("crearLeerSecreto devuelve la clave tecleada pero no deja constancia en la salida", async () => {
    const { rl, input, salida } = crearRlDePrueba();
    try {
      const clave = "sk-secreta-12345";
      const leerSecreto = crearLeerSecreto(rl);
      const promesa = leerSecreto("API key: ");
      input.write(clave + "\n");
      const respuesta = await promesa;
      expect(respuesta).toBe(clave);
      // Ni la clave entera ni ningún trozo de más de 4 caracteres (mismo estilo que
      // `sinFuga` en consola.test.ts).
      expect(salida()).not.toContain(clave);
      for (let i = 0; i + 5 <= clave.length; i++) {
        expect(salida()).not.toContain(clave.slice(i, i + 5));
      }
      // El prompt sí se ve.
      expect(salida()).toContain("API key: ");
    } finally {
      rl.close();
    }
  });

  it("crearLeerSecreto borra la clave de rl.history tras leerla", async () => {
    const { rl, input } = crearRlDePrueba();
    try {
      const clave = "sk-secreta-12345";
      const leerSecreto = crearLeerSecreto(rl);
      const promesa = leerSecreto("API key: ");
      input.write(clave + "\n");
      await promesa;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const history = (rl as any).history as string[];
      expect(history).not.toContain(clave);
    } finally {
      rl.close();
    }
  });

  it("crearLeerSecreto restaura el eco normal después (con el mismo rl)", async () => {
    const { rl, input, salida } = crearRlDePrueba();
    try {
      const clave = "sk-secreta-12345";
      const leerSecreto = crearLeerSecreto(rl);
      const promesaSecreto = leerSecreto("API key: ");
      input.write(clave + "\n");
      await promesaSecreto;

      // Con el MISMO rl, una pregunta normal DEBE tener eco: si quedara silenciado,
      // `_writeToOutput` no se habría restaurado bien.
      const preguntar = crearPreguntar(rl);
      const promesa = preguntar("¿Segundo? ");
      input.write("visible\n");
      const respuesta = await promesa;
      expect(respuesta).toBe("visible");
      expect(salida()).toContain("visible");
    } finally {
      rl.close();
    }
  });

  it("crearLeerSecreto resuelve con cadena vacía si rl se cierra sin dar línea", async () => {
    const { rl } = crearRlDePrueba();
    const leerSecreto = crearLeerSecreto(rl);
    const promesa = leerSecreto("API key: ");
    // Sin escribir nada: rl.close() (o input.end()) dispara `close` y la promesa NO se
    // puede quedar colgada — eso colgaría el manejador de /provider para siempre.
    rl.close();
    const respuesta = await promesa;
    expect(respuesta).toBe("");
  });

  it("crearPreguntar resuelve con cadena vacía si rl YA ESTÁ CERRADO (EOF de un pipe durante un turno)", async () => {
    // Caso real, visto en e2e: con la entrada en pipe, el EOF llega mientras el turno
    // corre; cuando la aprobación pregunta, el rl ya está cerrado y `rl.question` LANZA
    // «readline was closed». El turno aborta con el interrupt colgado y las líneas en
    // cola se leen después como PROSA. La cadena vacía es además lo SEGURO: sin un «s»
    // explícito, `interpretAnswer` rechaza.
    const { rl, input } = crearRlDePrueba();
    rl.on("close", () => undefined); // asegura que el close se ha disparado antes de preguntar
    input.end();
    await new Promise((r) => rl.once("close", r));
    // `closed` existe en runtime pero no en los tipos de esta versión — ver stdio.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((rl as any).closed).toBe(true);

    const respuesta = await crearPreguntar(rl)("¿Aprobar? [s/N] ");
    expect(respuesta).toBe("");
  });

  it("crearPreguntar resuelve con cadena vacía si rl se cierra EN MEDIO de la pregunta", async () => {
    const { rl } = crearRlDePrueba();
    const promesa = crearPreguntar(rl)("¿Aprobar? [s/N] ");
    // El usuario no contesta: llega el EOF (Ctrl-D, pipe que se cierra).
    rl.close();
    const respuesta = await promesa;
    expect(respuesta).toBe("");
  });
});