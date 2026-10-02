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
  /** El proyecto en el que se abrió: guardar escribe en el ABIERTO, así que si cambia se suelta. */
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
  /** La huella de una versión nueva a la que se dijo «Seguir con los míos»: no vuelve a salir. */
  descartada?: string;
  /** Sube cada vez que el texto se reemplaza desde fuera: el editor se rehace con esta `key`. */
  generacion: number;
}

export interface UltimoGuardado {
  ruta: string;
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
  cambiar: (texto: string) => void;
  guardar: () => void;
  elegirBase: (base: BaseElegida) => void;
  pedirBase: () => void;
  recargar: () => void;
  seguirConLosMios: () => void;
}

export const DEMASIADO_GRANDE = "el fichero es demasiado grande para guardarlo desde aquí";
export const SE_CORTO_EL_CABLE = "se cortó la conexión antes de saber si se guardó: al volver, recarga el fichero para comprobarlo";

function sinAvisos(a: EstadoDeEdicion): EstadoDeEdicion {
  const { error: _error, versionNueva: _version, descartada: _descartada, ...resto } = a;
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
  const [baseElegida, setBaseElegida] = useState<BaseElegida>("sesion");
  // El estado también en un `ref`, escrito a la vez: dos llamadas en el mismo tic (cambiar y
  // guardar con Cmd+S) tienen que ver lo que dejó la primera, no lo del último render.
  const actualRef = useRef<EstadoDeEdicion | undefined>(actual);
  const textoRef = useRef("");
  const enviadoRef = useRef<string | undefined>(undefined);
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
    },
    [fijar]
  );

  const guardar = useCallback(() => {
    const a = actualRef.current;
    if (a === undefined || a.guardando || !a.sucio) return;
    const mensaje: MensajeDelCliente = {
      clase: "guardarFichero",
      ruta: a.ruta,
      texto: conFinDeLinea(textoRef.current, a.finDeLinea),
      huella: a.huella,
    };
    if (!cabeEnElCable(mensaje)) {
      fijar({ ...a, error: DEMASIADO_GRANDE });
      return;
    }
    // Lo que se manda, no lo que haya al llegar la respuesta: se puede seguir tecleando mientras.
    enviadoRef.current = textoRef.current;
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
    if (!a.guardando) {
      void enviar({ clase: "fichero", ruta: a.ruta });
      return;
    }
    if (ultimoGuardado.huella === undefined) {
      fijar({ ...a, guardando: false, error: ultimoGuardado.error ?? "no se ha guardado" });
      return;
    }
    const guardado = enviadoRef.current ?? textoRef.current;
    enviadoRef.current = undefined;
    fijar({ ...sinAvisos(a), original: guardado, huella: ultimoGuardado.huella, guardando: false, sucio: textoRef.current !== guardado });
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
    if (a === undefined || a.guardando || !esEditable(llegado) || llegado.ruta !== a.ruta || llegado.huella === a.huella) return;
    if (a.descartada === llegado.huella || a.versionNueva?.huella === llegado.huella) return;
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
    if (a !== undefined && a.proyecto !== proyecto) cerrar();
  }, [proyecto, cerrar]);

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
    fijar({ ...resto, descartada: v.huella });
  }, [fijar]);

  const elegirBase = useCallback(
    (base: BaseElegida) => {
      setBaseElegida(base);
      const a = actualRef.current;
      if (a !== undefined) pedirBaseDe(a.ruta, base);
    },
    [pedirBaseDe]
  );

  const pedirBase = useCallback(() => {
    const a = actualRef.current;
    if (a !== undefined) pedirBaseDe(a.ruta, baseElegida);
  }, [pedirBaseDe, baseElegida]);

  const textoVivo = useCallback(() => textoRef.current, []);
  const haySinGuardar = useCallback(() => actualRef.current?.sucio === true, []);

  const deLaRuta = actual === undefined ? undefined : bases?.[actual.ruta];
  const base = deLaRuta !== undefined && deLaRuta.base === baseElegida ? deLaRuta : undefined;

  return useMemo(
    () => ({ actual, base, baseElegida, textoVivo, haySinGuardar, abrir, cerrar, cambiar, guardar, elegirBase, pedirBase, recargar, seguirConLosMios }),
    [actual, base, baseElegida, textoVivo, haySinGuardar, abrir, cerrar, cambiar, guardar, elegirBase, pedirBase, recargar, seguirConLosMios]
  );
}
