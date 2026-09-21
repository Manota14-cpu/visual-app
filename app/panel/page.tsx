"use client";

import Link from "next/link";
import { Marco } from "@/components/marco";
import { Boton, Cargando, Etiqueta, Hoja, Metrica, Vacio } from "@/components/ui";
import { ColumnasPorDia, BarrasEtiquetadas } from "@/components/grafico";
import { Icono } from "@/components/iconos";
import { useDatos } from "@/lib/datos";
import { hace, llevado, numero, plata } from "@/lib/formato";
import type { Panel } from "@/lib/tipos";

const NOMBRE_MOVIMIENTO: Record<string, string> = {
  creacion: "Carga inicial",
  entrada: "Entrada",
  salida: "Salida",
  venta: "Venta",
  devolucion: "Devolución",
  ajuste: "Ajuste",
};

export default function PaginaPanel() {
  const { datos, cargando, error, recargar } = useDatos<Panel>("/panel");

  return (
    <Marco
      titulo="Panel"
      descripcion="Cómo está el negocio hoy: lo que se vendió, lo que falta reponer y lo que hay que revisar."
      acciones={
        <Boton icono="recargar" onClick={() => void recargar()}>
          Actualizar
        </Boton>
      }
    >
      {error && (
        <div className="hoja p-4 text-alerta-texto">{error}</div>
      )}

      {cargando && !datos && <Cargando filas={6} />}

      {datos && (
        <div className="flex flex-col gap-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metrica
              rotulo="Vendido hoy"
              valor={plata(datos.hoyVentas.total)}
              pie={`${numero(datos.hoyVentas.cantidad)} ${datos.hoyVentas.cantidad === 1 ? "venta" : "ventas"} · ${llevado(datos.hoyVentas.unidades, datos.hoyVentas.gramos)}`}
            />
            <Metrica
              rotulo="Stock a precio de venta"
              valor={plata(datos.stock.valorVenta)}
              pie={`Costó ${plata(datos.stock.valorCosto)}`}
            />
            <Metrica
              rotulo="Productos"
              valor={numero(datos.stock.productos)}
              pie={`${llevado(datos.stock.unidades, datos.stock.gramos)} en depósito`}
            />
            <Metrica
              rotulo="Caja"
              valor={datos.caja ? `Turno ${datos.caja.numero}` : "Cerrada"}
              pie={
                datos.caja
                  ? `${numero(datos.caja.ventas)} ventas · deberían haber ${plata(datos.caja.esperado)}`
                  : "Abrí un turno para cobrar por mostrador"
              }
              tono={datos.caja ? "exito" : undefined}
            />
          </section>

          <section className="flex flex-wrap gap-2">
            {datos.fiado > 0 && (
              <Link
                href="/clientes"
                className="inline-flex items-center gap-1.5 rounded-full border border-aviso-linea bg-aviso-fondo px-3 py-1.5 text-chico font-medium text-aviso-texto transition-colors hover:brightness-95"
              >
                {plata(datos.fiado)} fiados
                <Icono nombre="flecha-derecha" tamano={13} />
              </Link>
            )}
            <Pendiente
              cantidad={datos.stock.bajo}
              href="/productos?estado=bajo"
              texto="por reponer"
              tono="aviso"
            />
            <Pendiente
              cantidad={datos.stock.sinStock}
              href="/productos?estado=sin"
              texto="sin stock"
              tono="alerta"
            />
            <Pendiente
              cantidad={datos.pendientes.pedidos}
              href="/ventas?estado=pendiente"
              texto="pedidos sin entregar"
              tono="dato"
            />
            <Pendiente
              cantidad={datos.pendientes.sinCosto}
              href="/productos?estado=sincosto"
              texto="sin costo cargado"
              tono="neutral"
            />
            <Pendiente
              cantidad={datos.pendientes.costoDudoso}
              href="/productos"
              texto="con un costo que no parece real"
              tono="neutral"
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Hoja titulo="Ventas de los últimos catorce días">
              <ColumnasPorDia datos={datos.ventasPorDia} />
            </Hoja>

            <Hoja titulo="Unidades por categoría">
              {datos.stockPorCategoria.length === 0 ? (
                <p className="py-6 text-center text-base text-tinta-suave">Todavía no hay stock cargado.</p>
              ) : (
                <BarrasEtiquetadas
                  datos={datos.stockPorCategoria.map((c) => ({
                    etiqueta: c.categoria,
                    valor: c.unidades,
                    color: c.color,
                  }))}
                  formato={(v) => numero(v)}
                />
              )}
            </Hoja>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Hoja
              titulo="Para reponer"
              cuerpo="p-0"
              accion={
                <Link href="/productos?estado=bajo" className="text-chico text-tinta-suave hover:text-tinta">
                  Ver todo
                </Link>
              }
            >
              {datos.criticos.length === 0 ? (
                <Vacio titulo="Nada por reponer" detalle="Ningún producto llegó a su mínimo." />
              ) : (
                <ul>
                  {datos.criticos.map((producto) => (
                    <li
                      key={producto.id}
                      className="flex items-center justify-between gap-3 border-b border-linea px-4 py-2.5 last:border-0"
                    >
                      <span className="min-w-0 truncate">{producto.nombre}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="cifra text-tinta-suave">
                          mín. {numero(producto.stockMinimo)}
                        </span>
                        <Etiqueta tono={producto.stock === 0 ? "alerta" : "aviso"}>
                          {producto.stock === 0 ? "sin stock" : `quedan ${numero(producto.stock)}`}
                        </Etiqueta>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Hoja>

            <Hoja
              titulo="Últimos movimientos"
              cuerpo="p-0"
              accion={
                <Link href="/movimientos" className="text-chico text-tinta-suave hover:text-tinta">
                  Ver todo
                </Link>
              }
            >
              {datos.movimientos.length === 0 ? (
                <Vacio titulo="Sin movimientos" detalle="Cuando cargues o vendas algo, va a aparecer acá." />
              ) : (
                <ul>
                  {datos.movimientos.map((movimiento) => {
                    const suma = ["entrada", "creacion", "devolucion"].includes(movimiento.tipo);
                    return (
                      <li
                        key={movimiento.id}
                        className="flex items-center justify-between gap-3 border-b border-linea px-4 py-2.5 last:border-0"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{movimiento.producto}</span>
                          <span className="block truncate text-chico text-tinta-suave">
                            {NOMBRE_MOVIMIENTO[movimiento.tipo] ?? movimiento.tipo}
                            {movimiento.motivo ? ` · ${movimiento.motivo}` : ""} · {hace(movimiento.creadoEn)}
                          </span>
                        </span>
                        <span
                          className={
                            suma
                              ? "cifra shrink-0 font-medium text-exito-texto"
                              : "cifra shrink-0 font-medium text-alerta-texto"
                          }
                        >
                          {suma ? "+" : "−"}
                          {numero(movimiento.cantidad)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Hoja>
          </div>
        </div>
      )}
    </Marco>
  );
}

/**
 * Un pendiente solo aparece si existe.
 *
 * Una fila de ceros ocupa el mismo lugar que una de problemas y enseña a no
 * mirarla; que el renglón esté vacío cuando no hay nada que hacer es la única
 * forma de que llame la atención cuando sí lo hay.
 */
function Pendiente({
  cantidad,
  texto,
  href,
  tono,
}: {
  cantidad: number;
  texto: string;
  href: string;
  tono: "alerta" | "aviso" | "dato" | "neutral";
}) {
  if (cantidad === 0) return null;

  return (
    <Link href={href} className="transition-opacity hover:opacity-80">
      <Etiqueta tono={tono} className="gap-1.5 px-2.5 py-1 text-chico normal-case tracking-normal">
        <span className="cifra font-semibold">{numero(cantidad)}</span>
        {texto}
        <Icono nombre="flecha-derecha" tamano={13} />
      </Etiqueta>
    </Link>
  );
}
