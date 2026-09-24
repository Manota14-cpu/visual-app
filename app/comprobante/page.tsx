"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Boton, Cargando, Vacio } from "@/components/ui";
import { useDatos } from "@/lib/datos";
import { guardarPdf, imprimir } from "@/lib/escritorio";
import { cantidadEscrita, fechaHora, importeRenglon, numero, plata } from "@/lib/formato";
import { ETIQUETA_PAGO, type Pedido, type Sistema } from "@/lib/tipos";

export default function PaginaComprobante() {
  return (
    <Suspense fallback={<div className="p-8"><Cargando filas={5} /></div>}>
      <Comprobante />
    </Suspense>
  );
}

/**
 * El comprobante para imprimir o entregar.
 *
 * Se arma con lo que quedó guardado en la venta —nombres y precios copiados al
 * momento de cobrar— y no con el catálogo de hoy: un ticket no cambia porque
 * después se haya renombrado un producto o subido un precio.
 */
function Comprobante() {
  const parametros = useSearchParams();
  const id = parametros.get("venta");

  const { datos: venta, cargando } = useDatos<Pedido>(id ? `/pedidos/${id}` : null);
  const { datos: sistema } = useDatos<Sistema>("/sistema");
  const [errorImpresion, setErrorImpresion] = useState<string | null>(null);

  if (!id) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Vacio titulo="Falta la venta" detalle="Este comprobante se abre desde una venta." />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[420px] px-4 py-8">
      <div className="sin-imprimir mb-4 flex items-center justify-between gap-2">
        <Link href="/ventas" className="text-base text-tinta-suave hover:text-tinta">
          ← Volver a ventas
        </Link>
        <span className="flex gap-2">
          <Boton
            icono="archivo"
            disabled={!venta}
            onClick={() =>
              void guardarPdf(`Comprobante ${venta?.numero ?? ""} ${venta?.nombre ?? ""}`).catch(
                (e: Error) => setErrorImpresion(e.message)
              )
            }
          >
            Guardar PDF
          </Boton>
          <Boton
            tono="principal"
            icono="imprimir"
            onClick={() => void imprimir().catch((e: Error) => setErrorImpresion(e.message))}
          >
            Imprimir
          </Boton>
        </span>
      </div>

      {errorImpresion && (
        <p className="sin-imprimir mb-4 rounded-md border border-alerta-linea bg-alerta-fondo px-3 py-2 text-base text-alerta-texto">
          {errorImpresion}
        </p>
      )}

      {cargando && <Cargando filas={6} />}

      {venta && (
        <article className="hoja px-6 py-6">
          <header className="border-b border-linea pb-4 text-center">
            <h1 className="font-titulo text-titulo">{sistema?.config.negocio ?? "Comprobante"}</h1>
            {sistema?.config.detalle && (
              <p className="text-chico text-tinta-suave">{sistema.config.detalle}</p>
            )}
            <p className="mt-3 text-base">
              Comprobante <span className="cifra font-medium">#{venta.numero}</span>
            </p>
            <p className="text-chico text-tinta-suave">{fechaHora(venta.creadoEn)}</p>
          </header>

          <section className="border-b border-linea py-3 text-base">
            <p>
              <span className="text-tinta-suave">Cliente: </span>
              {venta.nombre}
            </p>
            {venta.cajaNumero && (
              <p className="text-chico text-tinta-suave">Turno de caja {venta.cajaNumero}</p>
            )}
          </section>

          <table className="w-full py-3 text-base">
            <tbody>
              {venta.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="py-1.5">
                    <span className="block">{item.nombre}</span>
                    <span className="block text-chico text-tinta-suave">
                      {item.porPeso
                        ? `${cantidadEscrita(item.cantidad, true)} × ${plata(item.precio)} el kilo`
                        : `${numero(item.cantidad)} ${item.unidadMedida} × ${plata(item.precio)}`}
                    </span>
                  </td>
                  <td className="cifra py-1.5 text-right align-top">
                    {plata(importeRenglon(item.precio, item.cantidad, item.porPeso))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-baseline justify-between border-t border-linea pt-3">
            <span className="font-titulo text-medio">Total</span>
            <span className="cifra font-titulo text-titulo">{plata(venta.total)}</span>
          </div>

          {venta.pagos.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 border-t border-linea pt-3 text-base">
              {venta.pagos.map((pago, indice) => (
                <li key={indice} className="flex justify-between">
                  <span className="text-tinta-suave">
                    {ETIQUETA_PAGO[pago.metodo] ?? pago.metodo}
                  </span>
                  <span className="cifra">{plata(pago.monto)}</span>
                </li>
              ))}
              {venta.recibido ? (
                <>
                  <li className="flex justify-between">
                    <span className="text-tinta-suave">Recibido</span>
                    <span className="cifra">{plata(venta.recibido)}</span>
                  </li>
                  <li className="flex justify-between font-medium">
                    <span>Vuelto</span>
                    <span className="cifra">
                      {plata(
                        Math.max(
                          0,
                          venta.recibido -
                            venta.pagos
                              .filter((p) => p.metodo === "efectivo")
                              .reduce((s, p) => s + p.monto, 0)
                        )
                      )}
                    </span>
                  </li>
                </>
              ) : null}
            </ul>
          )}

          {venta.notas && (
            <p className="mt-3 border-t border-linea pt-3 text-chico text-tinta-suave">
              {venta.notas}
            </p>
          )}

          <p className="mt-5 text-center text-chico text-tinta-suave">
            Gracias por la compra. Este comprobante no es una factura.
          </p>
        </article>
      )}
    </main>
  );
}
