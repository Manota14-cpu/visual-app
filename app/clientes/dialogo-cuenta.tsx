"use client";

import { useState } from "react";
import { Area, Boton, Campo, Cargando, Dialogo, Etiqueta, Vacio } from "@/components/ui";
import { Icono } from "@/components/iconos";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { fechaHora, leerNumero, plata } from "@/lib/formato";
import { ETIQUETA_PAGO, MEDIOS_PAGO, type Cliente, type CuentaCliente, type MedioPago, type Sistema } from "@/lib/tipos";
import { enlaceWhatsApp, mensajeDeuda, numeroWhatsApp } from "@/lib/whatsapp";
import { useDatos } from "@/lib/datos";
import { cn } from "@/lib/utils";

/**
 * La cuenta de un cliente: lo que debe y de dónde sale.
 *
 * Es la pantalla que reemplaza al cuaderno del mostrador. Para que alguien
 * confíe en un saldo tiene que poder ver renglón por renglón cómo se llegó a
 * él: qué ventas quedaron sin pagar y qué fue trayendo. Un número solo, sin su
 * historia, se discute con el cliente enfrente y no se puede defender.
 */
export function DialogoCuenta({
  cliente,
  onCerrar,
  onCobrado,
}: {
  cliente: Cliente | null;
  onCerrar: () => void;
  onCobrado: () => void;
}) {
  const avisos = useAvisos();
  const { datos, cargando, recargar } = useDatos<CuentaCliente>(
    cliente ? `/clientes/${cliente.id}/cuenta` : null
  );
  const { datos: sistema } = useDatos<Sistema>("/sistema", { silencioso: true });

  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MedioPago>("efectivo");
  const [nota, setNota] = useState("");
  const [cobrando, setCobrando] = useState(false);

  if (!cliente) return null;

  const debe = datos?.debe ?? 0;
  const aCobrar = Math.round(leerNumero(monto) ?? 0);
  const valido = aCobrar > 0 && aCobrar <= debe;

  async function cobrar() {
    if (!cliente) return;
    setCobrando(true);
    try {
      const r = await api.post<{ cobrado: number; saldo: number; enTurno: number | null }>(
        "/caja/cobrar-fiado",
        { clienteId: cliente.id, monto: aCobrar, metodo, nota }
      );

      avisos.exito(
        r.saldo === 0
          ? `${cliente.nombre} quedó al día.`
          : `Cobrados ${plata(r.cobrado)}. Queda debiendo ${plata(r.saldo)}.`
      );

      setMonto("");
      setNota("");
      await recargar();
      onCobrado();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo cobrar.");
    } finally {
      setCobrando(false);
    }
  }

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo={`Cuenta de ${cliente.nombre}`}
      descripcion="Lo que quedó sin pagar de sus ventas y lo que fue trayendo."
      ancho="max-w-lg"
      pie={
        <>
          <Boton onClick={onCerrar} disabled={cobrando}>
            Cerrar
          </Boton>
          <Boton
            tono="principal"
            onClick={() => void cobrar()}
            disabled={cobrando || !valido}
          >
            {cobrando ? "Cobrando…" : aCobrar > 0 ? `Cobrar ${plata(aCobrar)}` : "Cobrar"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between rounded-md border border-linea bg-lienzo px-4 py-3">
          <span className="etiqueta-campo">Debe</span>
          <span className="cifra font-titulo text-cifra">{plata(debe)}</span>
        </div>

        {/* El recordatorio que antes se escribía a mano, con el número y el
            saldo del día. Se abre WhatsApp con el mensaje escrito y se manda
            desde ahí: nada sale sin que alguien lo lea antes. */}
        {debe > 0 && (
          <a
            href={enlaceWhatsApp(cliente.telefono, mensajeDeuda(cliente.nombre, debe, sistema?.config.negocio))}
            target="_blank"
            rel="noreferrer"
            className="-mt-1 inline-flex items-center gap-2 self-start rounded-full border border-exito-linea bg-exito-fondo px-3 py-1.5 text-chico font-medium text-exito-texto transition-all duration-200 ease-suave hover:brightness-95 active:scale-[0.97]"
          >
            <Icono nombre="mensaje" tamano={15} />
            Recordarle por WhatsApp
            {!numeroWhatsApp(cliente.telefono) && (
              <span className="font-normal opacity-75">· sin número, lo elegís en WhatsApp</span>
            )}
          </a>
        )}

        {debe > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                etiqueta="Cuánto trae"
                inputMode="decimal"
                placeholder="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                ayuda={
                  aCobrar > debe
                    ? `No puede pagar más de ${plata(debe)}`
                    : aCobrar > 0 && aCobrar < debe
                      ? `Le quedarían ${plata(debe - aCobrar)}`
                      : undefined
                }
              />
              <div className="flex flex-col gap-1.5">
                <span className="etiqueta-campo">Cómo paga</span>
                <div className="flex flex-wrap gap-1.5">
                  {MEDIOS_PAGO.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodo(m)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-chico transition-colors",
                        metodo === m
                          ? "border-acento bg-acento text-white"
                          : "border-linea-fuerte text-tinta-suave hover:bg-contraste/[0.04]"
                      )}
                    >
                      {ETIQUETA_PAGO[m]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Boton
              chico
              tono="fantasma"
              onClick={() => setMonto(String(debe))}
              disabled={cobrando}
            >
              Paga todo ({plata(debe)})
            </Boton>

            <Area
              etiqueta="Nota"
              placeholder="Opcional: a cuenta, pagó el hijo…"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Movimientos</span>
          {cargando && !datos ? (
            <Cargando filas={3} />
          ) : !datos || datos.renglones.length === 0 ? (
            <Vacio titulo="Sin movimientos" detalle="Nunca se le fio nada a este cliente." />
          ) : (
            <ul className="max-h-56 overflow-y-auto rounded-md border border-linea">
              {datos.renglones.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 border-b border-linea px-3 py-2 last:border-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base">{r.detalle}</span>
                    <span className="block text-chico text-tinta-suave">{fechaHora(r.creadoEn)}</span>
                  </span>
                  <Etiqueta tono={r.monto > 0 ? "aviso" : "exito"}>
                    {r.monto > 0 ? `+${plata(r.monto)}` : plata(r.monto)}
                  </Etiqueta>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialogo>
  );
}
