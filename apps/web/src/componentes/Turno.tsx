import { useState } from "react";
import { abreviar } from "../cifras.js";
import { desglosarConsumo, filasPorModelo } from "../consumoPintable.js";
import { horaDelMensaje } from "../selloDeFecha.js";
import type { Acto, VeredictoDelTurno } from "../tipos.js";
import { turnosDeLaSesion, type TurnoDeLaSesion } from "../turnosDeLaSesion.js";
import estilos from "./Turno.module.css";

/**
 * El inspector de UN turno: lo que costó y lo que pasó, al lado del hilo.
 *
 * Los permisos NO van aquí (petición suya): repetían, una línea por escritura, lo que la tarjeta
 * de aprobación enseña con su diff.
 *
 * El hilo cuenta QUÉ hizo el agente; esto se queda con las CIFRAS, para no decir lo mismo en dos
 * sitios. Todo sale de los actos que ya viajan (`turnosDeLaSesion`), igual que las Trazas: no pide
 * nada al servidor y por eso no tiene nada que medir al montarse.
 *
 * Por omisión enseña el ÚLTIMO turno, y las flechas llevan a los anteriores. Lo que no consta no se
 * pinta como cero: un turno abierto no tiene duración, y uno de una sesión anterior al consumo no
 * tiene tokens.
 *
 * `topeDeContexto` es el de la ventana del modelo EN VIGOR (mensaje `consumo`): vale para el
 * último turno y solo para él, porque un turno viejo pudo correr con otro modelo.
 */
export function Turno({ actos, topeDeContexto }: { actos: readonly Acto[]; topeDeContexto?: number }): React.ReactElement {
  const turnos = turnosDeLaSesion(actos);
  // `undefined` es «el último»: así un turno nuevo se enseña solo, sin que nadie mueva nada.
  const [elegido, setElegido] = useState<number | undefined>(undefined);
  if (turnos.length === 0) {
    return (
      <div className={estilos.raiz}>
        <p className={estilos.vacio}>Todavía no hay ningún turno en esta conversación.</p>
      </div>
    );
  }
  const indice = elegido === undefined || elegido >= turnos.length ? turnos.length - 1 : elegido;
  const turno = turnos[indice]!;
  const esElUltimo = indice === turnos.length - 1;
  return (
    <div className={estilos.raiz}>
      <div className={estilos.navegacion}>
        <button
          type="button"
          className={estilos.flecha}
          aria-label="Turno anterior"
          disabled={indice === 0}
          onClick={() => setElegido(indice - 1)}
        >
          ‹
        </button>
        <p className={estilos.cual}>
          {`Turno ${turno.numero} de ${turnos.length}`}
          {rotuloDeHoras(turno) === undefined ? null : <span className={estilos.horas}>{` · ${rotuloDeHoras(turno)}`}</span>}
        </p>
        <button
          type="button"
          className={estilos.flecha}
          aria-label="Turno siguiente"
          disabled={esElUltimo}
          onClick={() => setElegido(indice + 1 >= turnos.length - 1 ? undefined : indice + 1)}
        >
          ›
        </button>
      </div>

      <Cifras turno={turno} />
      <PorModelo turno={turno} />
      <Contexto turno={turno} {...(esElUltimo && topeDeContexto !== undefined ? { tope: topeDeContexto } : {})} />

      <p className={estilos.verificador} data-estado={estadoDelVeredicto(turno.veredicto)}>
        <span aria-hidden="true" className={estilos.punto} />
        {textoDelVeredicto(turno)}
      </p>
    </div>
  );
}

function Cifras({ turno }: { turno: TurnoDeLaSesion }) {
  const tokens =
    turno.consumo === undefined
      ? undefined
      : (() => {
          const d = desglosarConsumo(turno.consumo.modelo, turno.consumo.externo);
          return d.entradaTotal + d.salida;
        })();
  return (
    <dl className={estilos.cifras}>
      <div className={estilos.cifra}>
        <dt>Duración</dt>
        <dd>{turno.ms === undefined ? (turno.abierto ? "en marcha" : "—") : `${(Math.round(turno.ms / 100) / 10).toLocaleString("es")} s`}</dd>
      </div>
      <div className={estilos.cifra}>
        <dt>Tokens</dt>
        <dd title={tokens === undefined ? "no consta" : String(tokens)}>{tokens === undefined ? "—" : abreviar(tokens)}</dd>
      </div>
      <div className={estilos.cifra}>
        <dt>Pasos</dt>
        <dd>
          {turno.pasos}
          {turno.fallidas === 0 ? null : <span className={estilos.fallos}>{` · ${turno.fallidas} ${turno.fallidas === 1 ? "falló" : "fallaron"}`}</span>}
        </dd>
      </div>
    </dl>
  );
}

function PorModelo({ turno }: { turno: TurnoDeLaSesion }) {
  const consumo = turno.consumo;
  if (consumo === undefined) return null;
  const filas = consumo.porModelo === undefined ? [] : filasPorModelo(consumo.porModelo);
  const cache = desglosarConsumo(consumo.modelo, consumo.externo).cache;
  if (filas.length === 0 && cache === 0) return null;
  const peso = (f: (typeof filas)[number]) => f.nueva + f.cache + f.salida;
  const total = filas.reduce((t, f) => t + peso(f), 0);
  return (
    <section className={estilos.seccion} aria-label="Tokens por modelo">
      <h3 className={estilos.titulo}>Tokens por modelo</h3>
      {filas.length === 0 ? null : (
        <ul className={estilos.modelos}>
          {filas.map((f) => (
            <li key={f.id} className={estilos.modelo}>
              <span className={estilos.nombreDeModelo}>
                {f.id}
                {f.cuenta === "externo" && !f.sinDesglose ? <span className={estilos.externo}>externo</span> : null}
              </span>
              <span className={estilos.cantidad} title={String(peso(f))}>
                {abreviar(peso(f))}
              </span>
              {/* La barra es la PROPORCIÓN del turno, decorativa: la cifra de al lado ya lo dice. */}
              <span aria-hidden="true" className={estilos.carril}>
                <span
                  className={estilos.relleno}
                  data-cuenta={f.cuenta}
                  style={{ width: `${total === 0 ? 0 : Math.max(2, Math.round((peso(f) / total) * 100))}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      {cache === 0 ? null : <p className={estilos.nota}>{`De ellos, ${abreviar(cache)} salieron de caché.`}</p>}
    </section>
  );
}

function Contexto({ turno, tope }: { turno: TurnoDeLaSesion; tope?: number }) {
  const usado = turno.consumo?.ventana;
  // Un cero no se pinta: es la regla de `consumoPersistible` — una ventana de cero no es una medida.
  if (usado === undefined || usado === 0) return null;
  const porcentaje = tope === undefined || tope <= 0 ? undefined : Math.min(100, Math.round((usado / tope) * 100));
  return (
    <section className={estilos.seccion} aria-label="Contexto">
      <h3 className={estilos.titulo}>Contexto</h3>
      {porcentaje === undefined ? null : (
        <span aria-hidden="true" className={estilos.carril}>
          <span className={estilos.rellenoContexto} style={{ width: `${Math.max(2, porcentaje)}%` }} />
        </span>
      )}
      <p className={estilos.nota}>
        {porcentaje === undefined ? `${abreviar(usado)} al cerrar el turno` : `${abreviar(usado)} de ${abreviar(tope!)} · ${porcentaje} %`}
      </p>
    </section>
  );
}

function rotuloDeHoras(turno: TurnoDeLaSesion): string | undefined {
  if (turno.empezo === undefined) return undefined;
  const desde = horaDelMensaje(turno.empezo);
  if (desde === undefined) return undefined;
  const hasta = turno.acabo === undefined ? undefined : horaDelMensaje(turno.acabo);
  // «hoy a las 17:53 – 17:54»: la segunda hora sin repetir el día cuando es el mismo.
  if (hasta === undefined) return desde;
  const dia = (t: string) => t.split(" a las ")[0];
  const hora = (t: string) => t.split(" a las ")[1];
  return dia(desde) === dia(hasta) && hora(hasta) !== undefined ? `${desde} – ${hora(hasta)}` : `${desde} – ${hasta}`;
}

function estadoDelVeredicto(v: VeredictoDelTurno | undefined): "verde" | "rojo" | "nada" {
  if (v === undefined) return "nada";
  return v.verde ? "verde" : "rojo";
}

function textoDelVeredicto(turno: TurnoDeLaSesion): string {
  const v = turno.veredicto;
  if (v === undefined) return turno.abierto ? "Verificador: todavía no ha corrido" : "Verificador: no corrió en este turno";
  if (v.verde) return v.avisos === 0 ? "Verificador: en verde" : `Verificador: en verde · ${v.avisos} ${v.avisos === 1 ? "aviso" : "avisos"}`;
  return `Verificador: en rojo · ${v.errores} ${v.errores === 1 ? "error" : "errores"}`;
}
