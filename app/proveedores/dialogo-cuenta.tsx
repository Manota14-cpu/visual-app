"use client";

import { useState } from "react";
import { Boton, Campo, Dialogo, Etiqueta, Selector, Vacio } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { useDatos } from "@/lib/datos";
import { dia, leerNumero, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { CuentaProveedor, Proveedor } from "@/lib/tipos";

/**
 * El resumen de cuenta de un proveedor, y el botón de pagarle.
 *
 * Las compras y los pagos van en una sola lista ordenada por fecha, no en dos
 * columnas. Una cuenta corriente se lee de arriba abajo viendo cómo sube y
 * cómo baja; separadas hay que ir cruzándolas a ojo.
 */
export function DialogoCuentaProveedor({
  proveedor,
  onCerrar,
  onCambio,
}: {
  proveedor: Proveedor;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const avisos = useAvisos();
  const { datos, recargar } = useDatos<CuentaProveedor>(`/proveedores/${proveedor.id}/cuenta`);

  const [pagando, setPagando] = useState(false);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [guardando, setGuardando] = useState(false);

  const deuda = datos?.deuda ?? proveedor.deuda;

  async function pagar() {
    setGuardando(true);
    try {
      await api.post(`/proveedores/${proveedor.id}/pagar`, {
        monto: leerNumero(monto) ?? 0,
        metodo,
      });

      avisos.exito(`Pago cargado a ${proveedor.nombre}.`);
      setPagando(false);
      setMonto("");
      await recargar();
      onCambio();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo cargar el pago.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto
      titulo={proveedor.nombre}
      descripcion={[proveedor.telefono, proveedor.cuit].filter(Boolean).join(" · ") || undefined}
      ancho="max-w-2xl"
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Cerrar</Boton>
          {deuda > 0 && !pagando && (
            <Boton tono="principal" icono="caja" onClick={() => setPagando(true)}>
              Pagarle
            </Boton>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <Resumen rotulo="Comprado" valor={datos?.comprado ?? 0} />
          <Resumen rotulo="Pagado" valor={datos?.pagado ?? 0} />
          <Resumen rotulo="Le debés" valor={deuda} alerta={deuda > 0} />
        </div>

        {pagando && (
          <div className="flex flex-col gap-3 rounded-md border border-linea bg-lienzo p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                etiqueta="Cuánto le pagás"
                inputMode="numeric"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                autoFocus
                ayuda={`Le debés ${plata(deuda)}.`}
              />
              <Selector etiqueta="Con qué" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="otro">Otro</option>
              </Selector>
            </div>

            {/* Que quede dicho: esto no es un registro aparte, es plata que
                sale y va a aparecer en Gastos como cualquier otra. */}
            <p className="text-chico text-tinta-suave">
              El pago se anota como gasto de mercadería, así no se cuenta dos veces en los informes.
            </p>

            <div className="flex flex-wrap gap-2">
              <Boton
                tono="principal"
                onClick={() => void pagar()}
                disabled={guardando || (leerNumero(monto) ?? 0) <= 0}
              >
                {guardando ? "Guardando…" : "Confirmar pago"}
              </Boton>
              <Boton onClick={() => setPagando(false)}>Cancelar</Boton>
              {deuda > 0 && (
                <Boton onClick={() => setMonto(String(deuda))}>Saldar todo</Boton>
              )}
            </div>
          </div>
        )}

        <div>
          <p className="etiqueta-campo mb-1.5">Movimientos</p>
          {!datos || datos.movimientos.length === 0 ? (
            <Vacio titulo="Sin movimientos" detalle="Todavía no le cargaste ninguna compra." />
          ) : (
            <ul className="max-h-72 overflow-y-auto rounded-md border border-linea">
              {datos.movimientos.map((m) => (
                <li
                  key={`${m.tipo}-${m.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-3 py-2.5 last:border-0"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <Etiqueta tono={m.tipo === "compra" ? "aviso" : "exito"}>
                        {m.tipo === "compra" ? "compra" : "pago"}
                      </Etiqueta>
                      <span className="truncate">{m.detalle}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-chico text-tinta-suave">
                      {dia(m.fecha)}
                      {m.comprobante ? ` · ${m.comprobante}` : ""}
                      {m.usuario ? ` · ${m.usuario}` : ""}
                    </span>
                  </span>

                  {/* Con signo: la compra sube la deuda y el pago la baja. Sin
                      el signo las dos columnas de números se leen igual. */}
                  <span
                    className={cn(
                      "cifra shrink-0 font-medium",
                      m.tipo === "pago" ? "text-exito-texto" : "text-tinta"
                    )}
                  >
                    {m.tipo === "pago" ? "−" : "+"}
                    {plata(m.monto).replace("$", "$")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialogo>
  );
}

function Resumen({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-md border border-linea bg-lienzo px-3 py-2.5">
      <p className="etiqueta-campo">{rotulo}</p>
      <p className={cn("cifra mt-0.5 font-medium", alerta && "text-alerta-texto")}>
        {plata(valor)}
      </p>
    </div>
  );
}
