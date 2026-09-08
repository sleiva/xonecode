import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NuevaTarea } from "./NuevaTarea.js";

afterEach(cleanup);

const PROYECTO = { id: "p1", nombre: "AppDemo" };

/** Lo mínimo, con la subida concedida y el aumentador disponible. */
const base = {
  proyecto: PROYECTO,
  local: true,
  alAugmentar: () => {},
  alSubirAdjunto: async () => ({ ok: true }),
  alAbrirProyecto: () => {},
  alEncolar: () => {},
  alCerrar: () => {},
};

describe("NuevaTarea", () => {
  it("DICE que la tarea va a escribir en el proyecto sin pedir permiso", () => {
    // Es el único sitio del producto donde eso se puede decir ANTES de que ocurra: crear la
    // tarea ES la autorización (§0 del diseño), así que si esta ventana no lo dice, nadie
    // lo dice. Con palabras y no con un icono.
    render(<NuevaTarea {...base} />);
    const texto = document.body.textContent ?? "";
    expect(texto).toMatch(/sin pedir(te)? permiso|sin pedir aprobaci[óo]n/i);
    expect(texto).toMatch(/escrib/i);
  });

  it("y dice que el agente LEE los ficheros adjuntos, pero no VE una imagen", () => {
    render(<NuevaTarea {...base} />);
    const texto = document.body.textContent ?? "";
    expect(texto).toMatch(/leer/i);
    expect(texto).toMatch(/no la ve|no las ve/i);
  });

  it("no se puede encolar con la petición vacía", () => {
    const alEncolar = vi.fn();
    render(<NuevaTarea {...base} alEncolar={alEncolar} />);
    const boton = screen.getByRole("button", { name: /encolar/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.click(boton);
    expect(alEncolar).not.toHaveBeenCalled();
  });

  it("con petición sí, y encola su TEXTO cuando no hay encargo propuesto", () => {
    // Sin augmentar también se puede encolar: que no haya modelo no puede impedir apuntar
    // un encargo. El `encargo` que viaja es entonces el texto tal cual.
    const alEncolar = vi.fn();
    render(<NuevaTarea {...base} alEncolar={alEncolar} />);
    fireEvent.change(screen.getByLabelText(/qué hay que hacer/i), { target: { value: "Arregla el login" } });
    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));
    expect(alEncolar).toHaveBeenCalledWith({ peticion: "Arregla el login", encargo: "Arregla el login" });
  });

  it("«Preparar el encargo» manda la petición y luego se puede EDITAR lo que conteste", () => {
    const alAugmentar = vi.fn();
    const alEncolar = vi.fn();
    const { rerender } = render(<NuevaTarea {...base} alAugmentar={alAugmentar} alEncolar={alEncolar} />);
    fireEvent.change(screen.getByLabelText(/qué hay que hacer/i), { target: { value: "Arregla el login" } });
    fireEvent.click(screen.getByRole("button", { name: /preparar el encargo/i }));
    expect(alAugmentar).toHaveBeenCalledWith("Arregla el login");

    // El encargo llega por el cable (el store), no del propio componente.
    rerender(
      <NuevaTarea
        {...base}
        alAugmentar={alAugmentar}
        alEncolar={alEncolar}
        encargoPropuesto={{ encargo: "## Objetivo\nBuscar por NIF" }}
      />
    );
    const area = screen.getByLabelText(/encargo/i) as HTMLTextAreaElement;
    expect(area.value).toContain("Buscar por NIF");
    fireEvent.change(area, { target: { value: "## Objetivo\nBuscar por NIF y por nombre" } });
    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));
    expect(alEncolar).toHaveBeenCalledWith({
      peticion: "Arregla el login",
      encargo: "## Objetivo\nBuscar por NIF y por nombre",
    });
  });

  it("un encargo que llega DESPUÉS de editar a mano no pisa lo escrito", () => {
    // El mensaje `augmentado` va a TODAS las pestañas, así que uno de otra ventana podría
    // llegar mientras esta persona está escribiendo. Lo que ha escrito una persona no se
    // sustituye por lo que dijo un modelo.
    const { rerender } = render(<NuevaTarea {...base} encargoPropuesto={{ encargo: "PRIMERO" }} />);
    fireEvent.change(screen.getByLabelText(/encargo/i), { target: { value: "LO MÍO" } });
    rerender(<NuevaTarea {...base} encargoPropuesto={{ encargo: "SEGUNDO" }} />);
    expect((screen.getByLabelText(/encargo/i) as HTMLTextAreaElement).value).toBe("LO MÍO");
  });

  it("si el aumentador falla se DICE con su motivo, y se puede encolar igual", () => {
    // Perder lo que una persona acaba de escribir porque un modelo no contestó sería lo peor
    // que puede hacer esta ventana.
    const alEncolar = vi.fn();
    render(
      <NuevaTarea
        {...base}
        alEncolar={alEncolar}
        encargoPropuesto={{ error: "falta la credencial para openai" }}
      />
    );
    fireEvent.change(screen.getByLabelText(/qué hay que hacer/i), { target: { value: "Arregla el login" } });
    const alerta = screen.getByRole("alert");
    expect(alerta.textContent).toMatch(/no se pudo preparar el encargo/i);
    expect(alerta.textContent).toMatch(/falta la credencial para openai/);
    expect(alerta.textContent).toMatch(/tal cual/i);
    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));
    expect(alEncolar).toHaveBeenCalledWith({ peticion: "Arregla el login", encargo: "Arregla el login" });
  });

  it("sin aumentador en esta consola, el botón no está: no se ofrece lo que no se puede cumplir", () => {
    render(<NuevaTarea {...base} puedeAugmentar={false} />);
    expect(screen.queryByRole("button", { name: /preparar el encargo/i })).toBeNull();
    // Y se dice por qué, en vez de que el hueco quede sin explicar.
    expect(document.body.textContent).toMatch(/no hay|no se puede/i);
  });

  it("un adjunto se sube y aparece con su peso; el nombre se convierte en segmento llano", async () => {
    const subidos: { nombre: string }[] = [];
    render(
      <NuevaTarea
        {...base}
        alSubirAdjunto={async (fichero, nombre) => {
          subidos.push({ nombre });
          return { ok: true };
        }}
      />
    );
    const fichero = new File(["0123456789"], "Screenshot 2026-09-08 at 17.03.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/adjuntar/i), { target: { files: [fichero] } });
    await waitFor(() => expect(subidos).toHaveLength(1));
    expect(subidos[0]!.nombre).toBe("Screenshot_2026-09-08_at_17.03.png");
    expect(screen.getByText(/Screenshot_2026-09-08_at_17\.03\.png/)).toBeTruthy();
  });

  it("una subida que falla lo DICE en su fila, y no deja encolar", async () => {
    // Encolar con un adjunto a medias mandaría al agente a leer un fichero que no está.
    render(<NuevaTarea {...base} alSubirAdjunto={async () => ({ ok: false, motivo: "es demasiado grande" })} />);
    fireEvent.change(screen.getByLabelText(/qué hay que hacer/i), { target: { value: "Arregla" } });
    fireEvent.change(screen.getByLabelText(/adjuntar/i), {
      target: { files: [new File(["x"], "grande.bin")] },
    });
    await waitFor(() => expect(screen.getByText(/es demasiado grande/)).toBeTruthy());
    expect((screen.getByRole("button", { name: /encolar/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("y mientras una subida está en vuelo tampoco: los bytes tienen que estar en disco antes", async () => {
    // Crear dispara la revisión de la cola y el corredor puede arrancar la tarea en el acto.
    let resolver: (r: { ok: boolean }) => void = () => {};
    render(
      <NuevaTarea
        {...base}
        alSubirAdjunto={() => new Promise<{ ok: boolean }>((r) => void (resolver = r))}
      />
    );
    fireEvent.change(screen.getByLabelText(/qué hay que hacer/i), { target: { value: "Arregla" } });
    fireEvent.change(screen.getByLabelText(/adjuntar/i), { target: { files: [new File(["x"], "a.png")] } });
    await waitFor(() =>
      expect((screen.getByRole("button", { name: /encolar/i }) as HTMLButtonElement).disabled).toBe(true)
    );
    resolver({ ok: true });
    await waitFor(() =>
      expect((screen.getByRole("button", { name: /encolar/i }) as HTMLButtonElement).disabled).toBe(false)
    );
  });

  it("un fichero cuyo nombre no se puede convertir se rechaza aquí, sin subirlo", async () => {
    const subidos: string[] = [];
    render(
      <NuevaTarea
        {...base}
        alSubirAdjunto={async (_f, nombre) => {
          subidos.push(nombre);
          return { ok: true };
        }}
      />
    );
    fireEvent.change(screen.getByLabelText(/adjuntar/i), { target: { files: [new File(["x"], "..")] } });
    await waitFor(() => expect(screen.getByText(/no se puede usar ese nombre/i)).toBeTruthy());
    expect(subidos).toEqual([]);
  });

  it("dos ficheros con el mismo nombre no se pisan: el segundo se rechaza y se dice", async () => {
    render(<NuevaTarea {...base} />);
    const entrada = screen.getByLabelText(/adjuntar/i);
    fireEvent.change(entrada, { target: { files: [new File(["x"], "a.png")] } });
    await waitFor(() => expect(screen.getByText(/a\.png/)).toBeTruthy());
    fireEvent.change(entrada, { target: { files: [new File(["y"], "a.png")] } });
    await waitFor(() => expect(screen.getByText(/ya hay un adjunto con ese nombre/i)).toBeTruthy());
  });

  it("y dos con el mismo nombre en la MISMA elección tampoco: solo se sube uno", async () => {
    /**
     * La misma regla, en el caso que de verdad ocurre con `<input multiple>`: se eligen dos
     * ficheros de golpe y los dos se llaman igual (dos «captura.png» de dos carpetas, o dos
     * nombres distintos que el saneado convierte en el mismo segmento). Aquí el bucle no tiene
     * un render de por medio entre las dos vueltas, así que si el «¿ya está?» se lee de dentro
     * de un actualizador de estado —que React solo ejecuta en el acto por su vía de estado
     * eager— la segunda vuelta lo ve en `false`, sube igual, y el servidor sobrescribe el
     * fichero en silencio: exactamente lo que el rechazo existe para evitar.
     */
    const subidos: string[] = [];
    render(
      <NuevaTarea
        {...base}
        alSubirAdjunto={async (_f, nombre) => {
          subidos.push(nombre);
          return { ok: true };
        }}
      />
    );
    fireEvent.change(screen.getByLabelText(/adjuntar/i), {
      target: { files: [new File(["x"], "captura.png"), new File(["y"], "captura.png")] },
    });
    await waitFor(() => expect(screen.getByText(/ya hay un adjunto con ese nombre/i)).toBeTruthy());
    expect(subidos, "el segundo con el mismo nombre no se sube").toEqual(["captura.png"]);
  });

  it("un proyecto SIN copia local NO deja crear la tarea: se rechaza con el motivo", () => {
    /**
     * Aquí no vale decirlo bien: hay que no dejarlo.
     *
     * Trazado en el corredor —`siguientesAEjecutar` la coge igual, `abrirParaTarea`
     * (`vestibulo.ts`) lanza porque falta el `.xonecode/config.json`, `correr` la aparca en
     * `requiere-atencion` y `renunciarSiSigueNueva` impide que este proceso la vuelva a
     * coger—, una tarea creada sobre un proyecto sin copia local **no puede acabar bien**: se
     * queda quieta hasta que alguien haga otra cosa. Un control cuyo único final posible es un
     * fallo es el botón muerto de siempre, y este además promete una autorización de
     * escritura.
     *
     * Y ni siquiera se pinta el formulario, que es la parte con consecuencia: subir un adjunto
     * escribe bytes en `~/.xonecode/tareas/<borrador>/` ANTES de que la tarea exista, así que
     * un formulario usable aquí dejaría documentos de una persona en una carpeta que ninguna
     * tarea va a nombrar nunca.
     */
    const alEncolar = vi.fn();
    render(<NuevaTarea {...base} local={false} alEncolar={alEncolar} />);
    const texto = document.body.textContent ?? "";
    expect(texto, "el motivo, con palabras").toMatch(/no est[áa].*en tu equipo/i);
    expect(texto, "y que por eso no se puede crear").toMatch(/no se puede crear|no puede crearse/i);
    expect(screen.queryByLabelText(/qué hay que hacer/i), "sin campo de petición").toBeNull();
    expect(screen.queryByLabelText(/adjuntar/i), "y sin subir adjuntos").toBeNull();
    expect(screen.queryByRole("button", { name: /encolar/i }), "no hay botón de encolar").toBeNull();
    expect(alEncolar).not.toHaveBeenCalled();
    // Y no es un callejón: lleva al camino que YA existe para descargar el proyecto.
    expect(screen.getByRole("button", { name: /abrir el proyecto/i })).toBeTruthy();
    /**
     * Y **tampoco se pinta la frase de la autorización**, que es lo que esta ventana dice
     * cuando sí se puede crear. No es que sea falsa: es que explica una acción que aquí no
     * está disponible, y compite con lo único que esta pantalla tiene que conseguir —«no
     * puedes crearla aquí, abre el proyecto primero»—. Una pantalla que dice dos cosas a la
     * vez consigue que se lea la menos importante. Atado por AUSENCIA, igual que el
     * formulario: un test que solo comprobara que el rechazo aparece pasaría con la frase
     * encima y con el formulario debajo.
     */
    expect(texto, "la autorización no se explica donde no se concede").not.toMatch(/sin pedirte permiso/i);
    expect(texto).not.toMatch(/crearla es autorizarlo/i);
  });

  it("y el rechazo manda al camino que ya existe: abrir el proyecto", () => {
    // `NuevaSesion` es quien descarga —y quien DICE que va a descargar el proyecto entero—,
    // así que este botón no descarga nada: cede a esa ventana. Encolar la tarea y disparar la
    // descarga de rebote metería una descarga entera como efecto secundario de crear una
    // tarea, que es justo lo que esa otra ventana existe para evitar.
    const alAbrirProyecto = vi.fn();
    const alEncolar = vi.fn();
    render(<NuevaTarea {...base} local={false} alAbrirProyecto={alAbrirProyecto} alEncolar={alEncolar} />);
    fireEvent.click(screen.getByRole("button", { name: /abrir el proyecto/i }));
    expect(alAbrirProyecto).toHaveBeenCalledTimes(1);
    expect(alEncolar).not.toHaveBeenCalled();
  });

  it("cerrar no encola nada", () => {
    const alEncolar = vi.fn();
    const alCerrar = vi.fn();
    render(<NuevaTarea {...base} alEncolar={alEncolar} alCerrar={alCerrar} />);
    fireEvent.change(screen.getByLabelText(/qué hay que hacer/i), { target: { value: "Arregla" } });
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(alCerrar).toHaveBeenCalled();
    expect(alEncolar).not.toHaveBeenCalled();
  });
});
