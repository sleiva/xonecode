import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cabeEnElCable, conFinDeLinea, esEditable, finDeLineaDe, normalizarFinesDeLinea, type FinDeLinea } from "./edicion.js";
import type { BaseDelFichero, BaseElegida, FicheroDelProyecto, MensajeDelCliente } from "./tipos.js";

/**
 * La edición de un fichero en la pestaña Ficheros, viviendo en `App` y NO en el editor.
 *
 * Por qué aquí: el editor es un componente diferido que se DESMONTA cada vez que el panel cambia
 * de pestaña, se pliega por falta de sitio o cede al chat ante una aprobación. Si el texto viviera
 * en CodeMirror, cualquiera de esos tres se lo llevaría. Aquí está el texto vivo (en un `ref`: no
 * repinta `App` en cada tecla) y el estado que sí se pinta —sucio, guardando, el error, la versión
 * nueva del disco—; el editor se remonta con `key` y el texto de aquí cuando hace falta.
 */

export interface VersionDelDisco {
  original: string;
  huella: string;
  finDeLinea: FinDeLinea;
}

export interface EstadoDeEdicion {
  ruta: string;
  /**
   * El proyecto en el que se abrió. Guardar escribe en el ABIERTO, así que si cambia: sin cambios
   * se suelta; con cambios se conservan y se marca `proyectoCambiado`.
   */
  proyecto: string | undefined;
  /** El texto cargado (o el último guardado), con los finales de línea ya en «\n». */
  original: string;
  huella: string;
  finDeLinea: FinDeLinea;
  sucio: boolean;
  guardando: boolean;
  error?: string;
  /** Llegó otra versión del disco con cambios sin guardar: no se pisan, se pregunta. */
  versionNueva?: VersionDelDisco;
  /**
   * Se dijo «Seguir con los míos» a una versión nueva: se ADOPTÓ su huella, así que el siguiente
   * guardado la sustituye a sabiendas —sin adoptarla, todo guardado posterior fallaba por huella
   * vieja para siempre—. La banda lo avisa antes de guardar; se va al guardar o al recargar.
   */
  sobrescribe?: true;
  /** Sube cada vez que el texto se reemplaza desde fuera: el editor se rehace con esta `key`. */
  generacion: number;
  /**
   * El proyecto abierto dejó de ser el de la edición con cambios sin guardar. El foco es del
   * servidor —cambiar de entorno, otra pestaña que abre otro proyecto— y no se le puede preguntar
   * antes, así que no se tira lo tecleado: se conserva, guardar se apaga y la banda lo dice. Se
   * quita sola si el proyecto vuelve a ser este (un corte del cable vacía el alta y la repone).
   */
  proyectoCambiado?: true;
}

export interface UltimoGuardado {
  ruta: string;
  /** El id del guardado al que contesta (lo puso la pestaña que lo mandó): así se sabe si es el de esta. */
  id?: string;
  huella?: string;
  error?: string;
  secuencia: number;
}

export interface ControlDeEdicion {
  actual: EstadoDeEdicion | undefined;
  /** La base de la ruta en edición y la base ELEGIDA; `undefined` = pidiéndola. */
  base: BaseDelFichero | undefined;
  baseElegida: BaseElegida;
  textoVivo: () => string;
  /**
   * ¿Hay cambios sin guardar AHORA? Lee el estado escrito al momento, no el del último render: tras
   * «Descartar», la acción pendiente corre en el mismo tic, y si volviera a preguntar con `actual`
   * (aún sucio hasta repintar) sacaría el diálogo otra vez.
   */
  haySinGuardar: () => boolean;
  abrir: (f: FicheroDelProyecto) => void;
  /** Suelta la edición SIN preguntar: la pregunta la hace `App` (`CambiosSinGuardar`). */
  cerrar: () => void;
  /**
   * Lo mismo que `cerrar`, con otro nombre a propósito: `App` envuelve `cerrar` con su pregunta
   * para la pestaña, y el «Descartar» de la banda de proyecto cambiado ya ES la respuesta.
   */
  descartar: () => void;
  cambiar: (texto: string) => void;
  guardar: () => void;
  elegirBase: (base: BaseElegida) => void;
  pedirBase: () => void;
  recargar: () => void;
  seguirConLosMios: () => void;
}

let contador = 0;
/** Un id por guardado. `randomUUID` solo existe en contextos seguros: sin él, contador + azar. */
function nuevoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  contador += 1;
  return `${Date.now().toString(36)}-${contador}-${Math.random().toString(36).slice(2)}`;
}

export const DEMASIADO_GRANDE = "el fichero es demasiado grande para guardarlo desde aquí";
export const SIN_PROYECTO = "no hay ningún proyecto abierto";
export const SE_CORTO_EL_CABLE = "se cortó la conexión antes de saber si se guardó: al volver, recarga el fichero para comprobarlo";

function sinAvisos(a: EstadoDeEdicion): EstadoDeEdicion {
  const { error: _error, versionNueva: _version, sobrescribe: _sobrescribe, ...resto } = a;
  return resto;
}

export function usarEdicion({
  enviar,
  proyecto,
  contenidos,
  bases,
  ultimoGuardado,
  conectado,
}: {
  enviar: (mensaje: MensajeDelCliente) => Promise<unknown>;
  proyecto: string | undefined;
  contenidos: Record<string, FicheroDelProyecto> | undefined;
  bases: Record<string, BaseDelFichero> | undefined;
  ultimoGuardado: UltimoGuardado | undefined;
  conectado: boolean | undefined;
}): ControlDeEdicion {
  const [actual, setActual] = useState<EstadoDeEdicion | undefined>(undefined);
  // La base guardada que ya se miró al elegir otra: si llega una DISTINTA de la elegida (la respuesta
  // tardía de la que se dejó), se vuelve a pedir; la misma no, para no pedir en bucle.
  const baseVista = useRef<BaseDelFichero | undefined>(undefined);
  const [baseElegida, setBaseElegida] = useState<BaseElegida>("sesion");
  // El estado también en un `ref`, escrito a la vez: dos llamadas en el mismo tic (cambiar y
  // guardar con Cmd+S) tienen que ver lo que dejó la primera, no lo del último render.
  const actualRef = useRef<EstadoDeEdicion | undefined>(actual);
  const textoRef = useRef("");
  const enviadoRef = useRef<string | undefined>(undefined);
  // El id del guardado en vuelo: con él se reconoce SU respuesta entre las de todas las pestañas.
  const idMandadoRef = useRef<string | undefined>(undefined);
  // La secuencia ya vista AL MONTAR: una respuesta vieja que siga en el store no es para nosotros.
  const guardadoVisto = useRef(ultimoGuardado?.secuencia ?? 0);

  const fijar = useCallback((siguiente: EstadoDeEdicion | undefined) => {
    actualRef.current = siguiente;
    setActual(siguiente);
  }, []);

  const pedirBaseDe = useCallback(
    (ruta: string, base: BaseElegida) => {
      void enviar({ clase: "baseDeFichero", ruta, base });
    },
    [enviar]
  );

  const abrir = useCallback(
    (f: FicheroDelProyecto) => {
      if (!esEditable(f)) return;
      const original = normalizarFinesDeLinea(f.texto);
      textoRef.current = original;
      fijar({
        ruta: f.ruta,
        proyecto,
        original,
        huella: f.huella,
        finDeLinea: finDeLineaDe(f.texto),
        sucio: false,
        guardando: false,
        generacion: (actualRef.current?.generacion ?? 0) + 1,
      });
      pedirBaseDe(f.ruta, baseElegida);
    },
    [proyecto, baseElegida, pedirBaseDe, fijar]
  );

  const cerrar = useCallback(() => {
    textoRef.current = "";
    enviadoRef.current = undefined;
    fijar(undefined);
  }, [fijar]);

  const cambiar = useCallback(
    (texto: string) => {
      textoRef.current = texto;
      const a = actualRef.current;
      if (a === undefined) return;
      const sucio = texto !== a.original;
      if (sucio !== a.sucio) fijar({ ...a, sucio });
    },
    [fijar]
  );

  const fallar = useCallback(
    (ruta: string, error: string) => {
      const a = actualRef.current;
      if (a === undefined || a.ruta !== ruta || !a.guardando) return;
      fijar({ ...a, guardando: false, error });
      // Como un rechazo con respuesta: se vuelve a pedir el fichero por si el disco cambió. Sin red
      // también fallará, y se traga: el error de arriba ya lo dice.
      if (a.proyectoCambiado !== true) enviar({ clase: "fichero", ruta }).catch(() => {});
    },
    [fijar, enviar]
  );

  const guardar = useCallback(() => {
    const a = actualRef.current;
    if (a === undefined || a.guardando || !a.sucio || a.proyectoCambiado === true) return;
    // Aquí y no solo en el botón: Cmd+S llama a `guardar` directamente.
    if (a.proyecto === undefined) {
      fijar({ ...a, error: SIN_PROYECTO });
      return;
    }
    const id = nuevoId();
    const mensaje: MensajeDelCliente = {
      clase: "guardarFichero",
      ruta: a.ruta,
      texto: conFinDeLinea(textoRef.current, a.finDeLinea),
      huella: a.huella,
      id,
      // El proyecto con que se ABRIÓ: el servidor escribe en el del foco, y si ya es otro se niega
      // en vez de dejar el texto en un fichero de la misma ruta de otro proyecto.
      proyecto: a.proyecto,
    };
    if (!cabeEnElCable(mensaje)) {
      fijar({ ...a, error: DEMASIADO_GRANDE });
      return;
    }
    // Lo que se manda, no lo que haya al llegar la respuesta: se puede seguir tecleando mientras.
    enviadoRef.current = textoRef.current;
    idMandadoRef.current = id;
    const { error: _error, ...sinError } = a;
    fijar({ ...sinError, guardando: true });
    enviar(mensaje).then(
      // Un 4xx (el cuerpo no se aceptó) no trae `ficheroGuardado`: sin esto «Guardando…» no se apagaría.
      (respuesta) => {
        if ((respuesta as { ok?: boolean } | undefined)?.ok === false) fallar(a.ruta, "el servidor no aceptó el guardado");
      },
      () => fallar(a.ruta, "no se pudo hablar con el servidor: no se ha guardado")
    );
  }, [enviar, fijar, fallar]);

  // La respuesta a un guardado. Llega a TODAS las pestañas: si aquí no había uno en vuelo para esta
  // ruta, es que otra escribió el fichero, y se trata como un cambio en disco (se pide de nuevo).
  useEffect(() => {
    if (ultimoGuardado === undefined || ultimoGuardado.secuencia === guardadoVisto.current) return;
    guardadoVisto.current = ultimoGuardado.secuencia;
    const a = actualRef.current;
    if (a === undefined || a.ruta !== ultimoGuardado.ruta) return;
    const mio = a.guardando && ultimoGuardado.id === idMandadoRef.current;
    // Con el proyecto cambiado, lo de otra pestaña es de OTRO proyecto, y pedir nada traería un
    // fichero de la misma ruta del abierto ahora.
    if (a.proyectoCambiado === true && !mio) return;
    // La respuesta llega a TODAS las pestañas: es la mía solo si lleva el id que mandé (la huella no
    // sirve: dos pestañas que parten de la misma versión mandan la misma).
    // Otra (de otra pestaña, aunque acepte o rechace) es un cambio en disco: se pide el fichero y
    // el flujo de «versión nueva» decide —recarga sola o banda—.
    if (!mio) {
      void enviar({ clase: "fichero", ruta: a.ruta });
      return;
    }
    if (ultimoGuardado.huella === undefined) {
      fijar({ ...a, guardando: false, error: ultimoGuardado.error ?? "no se ha guardado" });
      // Sea cual sea el motivo, se vuelve a pedir el fichero: si el disco cambió (huella vieja), el
      // flujo de versión nueva saca la banda con los cambios intactos; sin esto el rechazo se
      // quedaba sin salida. Con el proyecto cambiado no: traería el fichero de OTRO proyecto.
      if (a.proyectoCambiado !== true) void enviar({ clase: "fichero", ruta: a.ruta });
      return;
    }
    const guardado = enviadoRef.current ?? textoRef.current;
    enviadoRef.current = undefined;
    fijar({ ...sinAvisos(a), original: guardado, huella: ultimoGuardado.huella, guardando: false, sucio: textoRef.current !== guardado });
    if (a.proyectoCambiado === true) return;
    // El visor, la `M` del árbol y las marcas se quedaron con el disco de antes.
    void enviar({ clase: "fichero", ruta: a.ruta });
    void enviar({ clase: "revision" });
    pedirBaseDe(a.ruta, baseElegida);
  }, [ultimoGuardado, enviar, fijar, pedirBaseDe, baseElegida]);

  // Llega otra versión del fichero (al acabar un turno, o porque otra pestaña guardó). Con la
  // misma huella no ha cambiado nada; sin cambios propios se recarga sola; con cambios, NO se pisan.
  const llegado = actual === undefined ? undefined : contenidos?.[actual.ruta];
  useEffect(() => {
    const a = actualRef.current;
    if (a === undefined || a.guardando || a.proyectoCambiado === true || !esEditable(llegado) || llegado.ruta !== a.ruta || llegado.huella === a.huella) return;
    if (a.versionNueva?.huella === llegado.huella) return;
    const version: VersionDelDisco = { original: normalizarFinesDeLinea(llegado.texto), huella: llegado.huella, finDeLinea: finDeLineaDe(llegado.texto) };
    if (a.sucio) {
      fijar({ ...a, versionNueva: version });
      return;
    }
    textoRef.current = version.original;
    fijar({ ...sinAvisos(a), ...version, generacion: a.generacion + 1 });
    pedirBaseDe(a.ruta, baseElegida);
  }, [llegado, fijar, pedirBaseDe, baseElegida]);

  useEffect(() => {
    const a = actualRef.current;
    if (a === undefined) return;
    if (a.proyecto === proyecto) {
      if (a.proyectoCambiado === true) {
        const { proyectoCambiado: _cambiado, ...resto } = a;
        fijar(resto);
      }
      return;
    }
    if (!a.sucio) cerrar();
    else if (a.proyectoCambiado !== true) fijar({ ...a, proyectoCambiado: true });
  }, [proyecto, cerrar, fijar]);

  useEffect(() => {
    const a = actualRef.current;
    if (conectado === false && a?.guardando === true) fijar({ ...a, guardando: false, error: SE_CORTO_EL_CABLE });
  }, [conectado, fijar]);

  // Recargar o cerrar la PÁGINA con cambios sin guardar: el aviso del navegador. Es lo único que
  // un diálogo nuestro no puede parar.
  const sucio = actual?.sucio === true;
  useEffect(() => {
    if (!sucio) return;
    const avisar = (evento: BeforeUnloadEvent): void => {
      evento.preventDefault();
      evento.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio]);

  const recargar = useCallback(() => {
    const a = actualRef.current;
    const v = a?.versionNueva;
    if (a === undefined || v === undefined) return;
    textoRef.current = v.original;
    fijar({ ...sinAvisos(a), ...v, sucio: false, generacion: a.generacion + 1 });
    pedirBaseDe(a.ruta, baseElegida);
  }, [fijar, pedirBaseDe, baseElegida]);

  const seguirConLosMios = useCallback(() => {
    const a = actualRef.current;
    const v = a?.versionNueva;
    if (a === undefined || v === undefined) return;
    const { versionNueva: _version, ...resto } = a;
    // Se adopta la huella del disco, NO su texto ni sus finales de línea: lo que se guarde será lo
    // tecleado, sustituyendo deliberadamente a esa versión.
    fijar({ ...resto, huella: v.huella, sobrescribe: true });
  }, [fijar]);

  const elegirBase = useCallback(
    (base: BaseElegida) => {
      setBaseElegida(base);
      const a = actualRef.current;
      baseVista.current = a === undefined ? undefined : basesRef.current?.[a.ruta];
      if (a !== undefined) pedirBaseDe(a.ruta, base);
    },
    [pedirBaseDe]
  );

  const pedirBase = useCallback(() => {
    const a = actualRef.current;
    if (a !== undefined) pedirBaseDe(a.ruta, baseElegida);
  }, [pedirBaseDe, baseElegida]);

  const basesRef = useRef(bases);
  basesRef.current = bases;

  const textoVivo = useCallback(() => textoRef.current, []);
  const haySinGuardar = useCallback(() => actualRef.current?.sucio === true, []);

  const deLaRuta = actual === undefined ? undefined : bases?.[actual.ruta];
  const rutaEnEdicion = actual?.ruta;
  useEffect(() => {
    if (rutaEnEdicion === undefined || deLaRuta === undefined || deLaRuta.base === baseElegida || deLaRuta === baseVista.current) return;
    baseVista.current = deLaRuta;
    pedirBaseDe(rutaEnEdicion, baseElegida);
  }, [rutaEnEdicion, deLaRuta, baseElegida, pedirBaseDe]);
  const base = deLaRuta !== undefined && deLaRuta.base === baseElegida ? deLaRuta : undefined;

  return useMemo(
    () => ({ actual, base, baseElegida, textoVivo, haySinGuardar, abrir, cerrar, descartar: cerrar, cambiar, guardar, elegirBase, pedirBase, recargar, seguirConLosMios }),
    [actual, base, baseElegida, textoVivo, haySinGuardar, abrir, cerrar, cambiar, guardar, elegirBase, pedirBase, recargar, seguirConLosMios]
  );
}
