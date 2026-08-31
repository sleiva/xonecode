import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import * as readline from "node:readline";
import { crearPielStdio, crearPreguntar, crearLeerSecreto } from "./stdio.js";

function acumulador() {
  const trozos: string[] = [];
  return { trozos, escribir: (t: string) => trozos.push(t) };
}

describe("piel de stdio", () => {
  it("cada token es UNA llamada a escribir, y sin salto", () => {
    // Si `token` añadiera `\n`, la respuesta saldría partida en una línea por trozo.
    // Y si acumulase para volcar al final, dejaría de ser streaming.
    const { trozos, escribir } = acumulador();
    const piel = crearPielStdio(escribir);
    piel.token("Hola");
    piel.token(" qué tal");
    expect(trozos).toEqual(["Hola", " qué tal"]);
  });

  it("la respuesta se lee como UNA frase, no como una lista", () => {
    const { trozos, escribir } = acumulador();
    const piel = crearPielStdio(escribir);
    for (const t of ["Se ha", " creado", " la colección"]) piel.token(t);
    piel.cerrarLinea();
    expect(trozos.join("")).toBe("Se ha creado la colección\n");
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
});