"use client";

import Link from "next/link";
import { Marco } from "@/components/marco";
import { Boton, Cargando, Etiqueta, Hoja, Metrica, Vacio } from "@/components/ui";
import { ColumnasPorDia, BarrasEtiquetadas } from "@/components/grafico";
import { Icono } from "@/components/iconos";
import { useDatos } from "@/lib/datos";
import { cantidadEscrita, hace, llevado, numero, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Panel, Sistema } from "@/lib/tipos";

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
          <AvisoDeCopia />

          {/* De a dos también en el celular: una abajo de la otra, las cuatro
              ocupaban toda la pantalla y lo que hay que hacer —las fichas de
              abajo— quedaba fuera de vista. */}
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metrica
              rotulo="Vendido hoy"
              valor={plata(datos.hoyVentas.total)}
              pie={`${numero(datos.hoyVentas.cantidad)} ${datos.hoyVentas.cantidad === 1 ? "venta" : "ventas"} · ${llevado(datos.hoyVentas.unidades, datos.hoyVentas.gramos)}`}
            />
            {/* A un empleado el servidor no le manda la valuación, y la
                tarjeta desaparece en vez de mostrar "$0": decir que el depósito
                no vale nada es peor que no decir nada. */}
            {datos.stock.valorVenta !== null && (
              <Metrica
                rotulo="Stock a precio de venta"
                valor={plata(datos.stock.valorVenta)}
                pie={datos.stock.valorCosto !== null ? `Costó ${plata(datos.stock.valorCosto)}` : undefined}
              />
            )}
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
            {/* Las dos puntas de la plata que no está: lo que le deben al
                negocio y lo que el negocio debe. Un empleado no ve ninguna. */}
            {datos.fiado !== null && datos.fiado > 0 && (
              <Link
                href="/clientes"
                className="inline-flex items-center gap-1.5 rounded-full border border-aviso-linea bg-aviso-fondo px-3 py-1.5 text-chico font-medium text-aviso-texto transition-colors hover:brightness-95"
              >
                {plata(datos.fiado)} fiados
                <Icono nombre="flecha-derecha" tamano={13} />
              </Link>
            )}
            {datos.aProveedores !== null && datos.aProveedores > 0 && (
              <Link
                href="/proveedores"
                className="inline-flex items-center gap-1.5 rounded-full border border-alerta-linea bg-alerta-fondo px-3 py-1.5 text-chico font-medium text-alerta-texto transition-colors hover:brightness-95"
              >
                {plata(datos.aProveedores)} a proveedores
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
              cantidad={datos.pendientes.vencidos}
              href="/vencimientos"
              texto="vencidos"
              singular="vencido"
              tono="alerta"
            />
            <Pendiente
              cantidad={datos.pendientes.porVencer}
              href="/vencimientos?estado=urgentes"
              texto="por vencer"
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
              singular="pedido sin entregar"
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
              singular="con un costo que no parece real"
              tono="neutral"
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Hoja titulo="Ventas de los últimos catorce días">
              <ColumnasPorDia datos={datos.ventasPorDia} />
            </Hoja>

            <Hoja titulo="Stock por categoría">
              {datos.stockPorCategoria.length === 0 ? (
                <p className="py-6 text-center text-base text-tinta-suave">Todavía no hay stock cargado.</p>
              ) : (
                <BarrasEtiquetadas
                  datos={datos.stockPorCategoria.map((c) => ({
                    etiqueta: c.categoria,
                    // La barra compara cuántos productos hay en cada una: es
                    // lo único que se puede comparar entre una categoría de
                    // panes por kilo y una de gaseosas por unidad.
                    valor: c.productos,
                    color: c.color,
                    texto: llevado(c.unidades, c.gramos),
                  }))}
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
                          mín. {cantidadEscrita(producto.stockMinimo, producto.porPeso)}
                        </span>
                        <Etiqueta tono={producto.stock === 0 ? "alerta" : "aviso"}>
                          {producto.stock === 0
                            ? "sin stock"
                            : `quedan ${cantidadEscrita(producto.stock, producto.porPeso)}`}
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
                          {cantidadEscrita(movimiento.cantidad, movimiento.porPeso)}
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
  singular,
  href,
  tono,
}: {
  cantidad: number;
  texto: string;
  /** Para cuando es uno solo: "1 vencidos" no se dice. */
  singular?: string;
  href: string;
  tono: "alerta" | "aviso" | "dato" | "neutral";
}) {
  if (cantidad === 0) return null;

  return (
    <Link href={href} className="transition-opacity hover:opacity-80">
      <Etiqueta tono={tono} className="gap-1.5 px-2.5 py-1 text-chico normal-case tracking-normal">
        <span className="cifra font-semibold">{numero(cantidad)}</span>
        {cantidad === 1 && singular ? singular : texto}
        <Icono nombre="flecha-derecha" tamano={13} />
      </Etiqueta>
    </Link>
  );
}

/**
 * Avisa cuando la copia fuera de la computadora no está, o dejó de hacerse.
 *
 * Va en el Panel y no solo en Configuración porque a Configuración no entra
 * nadie. Y todo el negocio —catálogo, ventas, deudas, años de historia— vive en
 * un archivo en una computadora: acá no hay servidor de nadie donde quede una
 * copia por las dudas. El día que el disco no arranca, lo que haya en el
 * pendrive es todo lo que queda.
 *
 * Tres estados distintos, porque piden cosas distintas:
 *
 * - **Sin configurar.** No hay ninguna copia afuera. Hay que elegir carpeta.
 * - **Sin acceso.** Hay carpeta pero hoy no se llega: el pendrive no está
 *   enchufado, la carpeta de red no responde. Mientras dure, no hay copia
 *   aunque la pantalla de Configuración muestre una ruta.
 * - **Atrasada.** Se llega, pero la última copia es de hace varios días. Pasa
 *   cuando el programa se abre con el pendrive afuera y se enchufa después.
 */
function AvisoDeCopia() {
  const { datos } = useDatos<Sistema>("/sistema", { silencioso: true });

  // A un empleado el servidor no le manda el estado de la copia, y está bien:
  // la copia de seguridad es del negocio, y quien atiende el mostrador no
  // puede hacer nada con este aviso más que preocuparse.
  const resguardo = datos?.resguardo;
  if (!resguardo) return null;

  // Tres días de gracia: un fin de semana largo con la computadora apagada no
  // es un problema, y un aviso que aparece por nada se aprende a ignorar.
  const atrasada = resguardo.dias !== null && resguardo.dias > 3;
  if (resguardo.carpeta && !resguardo.error && !atrasada) return null;

  const grave = Boolean(resguardo.carpeta && resguardo.error);

  return (
    <Link
      href="/configuracion"
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-3 transition-colors hover:brightness-[0.98]",
        grave
          ? "border-alerta-linea bg-alerta-fondo text-alerta-texto"
          : "border-aviso-linea bg-aviso-fondo text-aviso-texto"
      )}
    >
      <span className="mt-0.5 shrink-0">
        <Icono nombre="alerta" tamano={17} />
      </span>
      <span className="min-w-0 flex-1 text-base">
        {!resguardo.carpeta ? (
          <>
            <strong>No hay copia de seguridad fuera de esta computadora.</strong> Si el disco deja
            de arrancar, se pierde todo. Elegí una carpeta —un pendrive, OneDrive, Drive— y el
            programa copia solo, una vez por día.
          </>
        ) : resguardo.error ? (
          <>
            <strong>La copia de seguridad no se está guardando.</strong> {resguardo.error}
          </>
        ) : (
          <>
            <strong>
              La copia de seguridad es de hace {numero(resguardo.dias ?? 0)}{" "}
              {resguardo.dias === 1 ? "día" : "días"}.
            </strong>{" "}
            Fijate que la carpeta esté disponible.
          </>
        )}
      </span>
      <span className="mt-0.5 shrink-0">
        <Icono nombre="flecha-derecha" tamano={15} />
      </span>
    </Link>
  );
}
