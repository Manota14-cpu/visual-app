"use client";

import { useState } from "react";
import { Area, Aviso, Boton, Campo, Dialogo, Etiqueta } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { leerNumero, plata } from "@/lib/formato";
import type { Arqueo, Caja } from "@/lib/tipos";

/**
 * El cierre del turno.
 *
 * El número que importa es la diferencia entre lo que hay en el cajón y lo que
 * debería haber. Se muestra el desglose de cómo se llega a "lo que debería
 * haber" porque, cuando no coincide, es lo primero que alguien va a querer
 * revisar.
 */
export function DialogoCierre({
  caja,
  renglonesSinCobrar = 0,
  onCerrar,
  onCerrado,
}: {
  caja: Caja | null;
  /** Cuántos renglones hay cargados y sin cobrar en el mostrador. */
  renglonesSinCobrar?: number;
  onCerrar: () => void;
  onCerrado: () => void;
}) {
  const avisos = useAvisos();
  const [contado, setContado] = useState("");
  const [nota, setNota] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);

  if (!caja) return null;

  const enCajon = Math.round(leerNumero(contado) ?? 0);
  const diferencia = enCajon - caja.esperado;

  async function cerrar() {
    if (!caja) return;
    setTrabajando(true);
    try {
      const resultado = await api.post<Arqueo>("/caja/cerrar", {
        cajaId: caja.id,
        contado: enCajon,
        nota,
      });
      setArqueo(resultado);
      avisos.exito(`Turno ${caja.numero} cerrado.`);
      onCerrado();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo cerrar el turno.");
    } finally {
      setTrabajando(false);
    }
  }

  if (arqueo) {
    return (
      <Dialogo
        abierto
        onCerrar={onCerrar}
        titulo={`Turno ${caja.numero} cerrado`}
        ancho="max-w-md"
        pie={<Boton tono="principal" onClick={onCerrar}>Listo</Boton>}
      >
        <div className="flex flex-col gap-3">
          <Renglon rotulo="Fondo inicial" valor={arqueo.fondo} />
          <Renglon rotulo="Cobrado en efectivo" valor={arqueo.efectivo} />
          {arqueo.cobradoDeFiado > 0 && (
            <Renglon rotulo="Cobrado de fiado" valor={arqueo.cobradoDeFiado} />
          )}
          <Renglon rotulo="Ingresos al cajón" valor={arqueo.ingresos} />
          <Renglon rotulo="Retiros" valor={-arqueo.retiros} />
          <div className="border-t border-linea pt-3">
            <Renglon rotulo="Debería haber" valor={arqueo.esperado} fuerte />
            <Renglon rotulo="Contaste" valor={arqueo.contado} fuerte />
          </div>
          <div className="flex items-center justify-between rounded-md border border-linea bg-lienzo px-3 py-2.5">
            <span className="etiqueta-campo">Diferencia</span>
            <Etiqueta tono={arqueo.diferencia === 0 ? "exito" : arqueo.diferencia > 0 ? "aviso" : "alerta"}>
              {arqueo.diferencia === 0 ? "cuadra" : plata(arqueo.diferencia)}
            </Etiqueta>
          </div>
        </div>
      </Dialogo>
    );
  }

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo={`Cerrar turno ${caja.numero}`}
      descripcion="Contá la plata del cajón y anotá cuánto hay."
      ancho="max-w-md"
      pie={
        <>
          <Boton onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </Boton>
          <Boton tono="principal" onClick={() => void cerrar()} disabled={trabajando}>
            {trabajando ? "Cerrando…" : "Cerrar turno"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* La venta a medio cargar vive solo en esta pantalla: si el turno se
            cierra, se pierde y no queda rastro de que existió. Vale más un
            cartel acá que un cliente esperando mientras se vuelve a cargar
            todo. */}
        {renglonesSinCobrar > 0 && (
          <Aviso tono="alerta">
            Hay {renglonesSinCobrar} {renglonesSinCobrar === 1 ? "renglón" : "renglones"} cargados
            sin cobrar. Si cerrás el turno ahora, esa venta se pierde.
          </Aviso>
        )}

        <div className="flex flex-col gap-2 rounded-md border border-linea bg-lienzo px-3 py-2.5">
          <Renglon rotulo="Fondo inicial" valor={caja.fondo} />
          <Renglon rotulo="Cobrado en efectivo" valor={caja.totales.efectivo} />
          {caja.cobradoDeFiado > 0 && (
            <Renglon rotulo="Cobrado de fiado" valor={caja.cobradoDeFiado} />
          )}
          <Renglon rotulo="Ingresos" valor={caja.ingresado} />
          <Renglon rotulo="Retiros" valor={-caja.retirado} />
          <div className="border-t border-linea pt-2">
            <Renglon rotulo="Debería haber" valor={caja.esperado} fuerte />
          </div>
        </div>

        <Campo
          etiqueta="Cuánto hay en el cajón"
          inputMode="decimal"
          autoFocus
          placeholder="0"
          value={contado}
          onChange={(e) => setContado(e.target.value)}
          ayuda={
            contado
              ? diferencia === 0
                ? "Cuadra exacto."
                : diferencia > 0
                  ? `Sobran ${plata(diferencia)}.`
                  : `Faltan ${plata(-diferencia)}.`
              : "Contá solo el efectivo."
          }
        />

        <Area
          etiqueta="Nota del cierre"
          placeholder="Opcional: a qué se debe la diferencia, quién cerró…"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
      </div>
    </Dialogo>
  );
}

function Renglon({ rotulo, valor, fuerte }: { rotulo: string; valor: number; fuerte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-base">
      <span className={fuerte ? "font-medium" : "text-tinta-suave"}>{rotulo}</span>
      <span className={fuerte ? "cifra font-medium" : "cifra text-tinta-media"}>{plata(valor)}</span>
    </div>
  );
}
