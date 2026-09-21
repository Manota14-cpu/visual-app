"use client";

import { useState } from "react";
import Link from "next/link";
import { Area, Boton, Campo, Dialogo, Etiqueta } from "@/components/ui";
import { Icono } from "@/components/iconos";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { cantidadEscrita, fechaHora, importeRenglon, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ETIQUETA_PAGO, type EstadoPedido, type ItemPedido, type Pedido } from "@/lib/tipos";
import { BuscadorProductos } from "@/app/caja/buscador-productos";

const ESTADOS: { valor: EstadoPedido; etiqueta: string }[] = [
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "preparando", etiqueta: "Preparando" },
  { valor: "entregado", etiqueta: "Entregado" },
  { valor: "cancelado", etiqueta: "Cancelado" },
];

/**
 * La ficha de una venta.
 *
 * Editar los renglones reconcilia el stock por diferencia: lo que se agrega
 * sale del depósito y lo que se quita vuelve, en la misma operación. Una venta
 * cobrada en un turno ya cerrado no se edita — su arqueo la contó, y cambiarla
 * reescribiría un cierre que alguien dio por bueno.
 */
export function DialogoVenta({
  pedido,
  onCerrar,
  onCambio,
}: {
  pedido: Pedido | null;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const avisos = useAvisos();
  const [editando, setEditando] = useState(false);
  // La ficha se monta cuando se abre una venta y se desmonta al cerrarla, así
  // que el borrador arranca con lo que la venta tiene guardado y no hace falta
  // ningún efecto que lo copie.
  const [items, setItems] = useState<ItemPedido[]>(pedido?.items ?? []);
  const [nombre, setNombre] = useState(pedido?.nombre ?? "");
  const [notas, setNotas] = useState(pedido?.notas ?? "");
  const [trabajando, setTrabajando] = useState(false);

  if (!pedido) return null;

  const cerradaEnCaja = pedido.cajaId !== null && !pedido.cajaAbierta;
  // Una devolución se guarda al revés —cantidades e importes negativos— y este
  // editor solo sabe escribir ventas. Guardarla acá la daba vuelta: el importe
  // pasaba a sumar al cajón en vez de restar. El backend ahora la rechaza; el
  // botón apagado lo dice antes de que alguien escriba nada.
  const esDevolucion = pedido.canal === "devolucion";
  const total = items.reduce(
    (suma, item) => suma + importeRenglon(item.precio, item.cantidad, item.porPeso),
    0
  );

  async function cambiarEstado(estado: EstadoPedido) {
    if (!pedido) return;
    setTrabajando(true);
    try {
      await api.post(`/pedidos/${pedido.id}/estado`, { estado });
      avisos.exito(
        estado === "cancelado"
          ? `Venta #${pedido.numero} cancelada. El stock volvió al depósito.`
          : `Venta #${pedido.numero}: ${estado}.`
      );
      onCambio();
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo cambiar el estado.");
    } finally {
      setTrabajando(false);
    }
  }

  async function guardar() {
    if (!pedido) return;
    setTrabajando(true);
    try {
      await api.put(`/pedidos/${pedido.id}`, {
        nombre,
        notas,
        items: items.map((i) => ({
          productoId: i.productoId,
          nombre: i.nombre,
          unidadMedida: i.unidadMedida,
          precio: i.precio,
          cantidad: i.cantidad,
        })),
      });
      avisos.exito("Venta actualizada. El stock quedó al día.");
      onCambio();
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar.");
    } finally {
      setTrabajando(false);
    }
  }

  async function eliminar() {
    if (!pedido) return;
    setTrabajando(true);
    try {
      await api.borrar(`/pedidos/${pedido.id}`);
      avisos.exito(`Venta #${pedido.numero} eliminada.`);
      onCambio();
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo eliminar.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo={`Venta #${pedido.numero}`}
      descripcion={`${fechaHora(pedido.creadoEn)} · ${pedido.canal}${pedido.cajaNumero ? ` · turno ${pedido.cajaNumero}` : ""}`}
      pie={
        editando ? (
          <>
            <Boton onClick={() => setEditando(false)} disabled={trabajando}>
              Cancelar
            </Boton>
            <Boton tono="principal" onClick={() => void guardar()} disabled={trabajando}>
              {trabajando ? "Guardando…" : `Guardar ${plata(total)}`}
            </Boton>
          </>
        ) : (
          <>
            <Boton
              tono="peligro"
              icono="borrar"
              onClick={() => void eliminar()}
              disabled={trabajando || cerradaEnCaja}
              title={cerradaEnCaja ? "Salió de una caja cerrada" : undefined}
            >
              Eliminar
            </Boton>
            <Boton
              icono="editar"
              onClick={() => setEditando(true)}
              disabled={pedido.estado === "cancelado" || cerradaEnCaja || esDevolucion}
              title={esDevolucion ? "Una devolución se borra y se registra de nuevo" : undefined}
            >
              Editar renglones
            </Boton>
            <Link
              href={`/comprobante?venta=${pedido.id}`}
              className="inline-flex h-9 items-center gap-2 rounded border border-transparent bg-acento px-3.5 text-base text-white shadow-acento transition-colors hover:bg-acento-fuerte"
            >
              <Icono nombre="imprimir" tamano={16} />
              Comprobante
            </Link>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {esDevolucion && !cerradaEnCaja && (
          <p className="rounded border border-linea bg-lienzo px-3 py-2 text-chico text-tinta-suave">
            Esto es una devolución: sus importes están anotados al revés, para que el arqueo y los
            informes los resten solos. No se edita — si quedó mal, borrala y registrala de nuevo
            desde la caja.
          </p>
        )}

        {cerradaEnCaja && (
          <p className="rounded border border-linea bg-lienzo px-3 py-2 text-chico text-tinta-suave">
            Esta venta se cobró en el turno {pedido.cajaNumero}, que ya se cerró. Para corregirla,
            registrá una devolución: así el arqueo de ese día sigue siendo el que se firmó.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {ESTADOS.map((estado) => (
            <button
              key={estado.valor}
              type="button"
              disabled={trabajando || editando}
              onClick={() => void cambiarEstado(estado.valor)}
              className={cn(
                "rounded border px-2.5 py-1.5 text-chico transition-colors disabled:opacity-50",
                pedido.estado === estado.valor
                  ? "border-transparent bg-acento text-white shadow-acento"
                  : "border-linea-fuerte/70 bg-papel text-tinta-media shadow-boton hover:bg-[#FAFAFC]"
              )}
            >
              {estado.etiqueta}
            </button>
          ))}
        </div>

        {editando ? (
          <>
            <BuscadorProductos
              placeholder="Agregar producto"
              onElegir={(producto) =>
                setItems((previos) => {
                  // Un kilo si se vende por peso: la cantidad va en gramos.
                  const paso = producto.porPeso ? 1000 : 1;
                  const existente = previos.find((i) => i.productoId === producto.id);
                  if (existente) {
                    return previos.map((i) =>
                      i.productoId === producto.id ? { ...i, cantidad: i.cantidad + paso } : i
                    );
                  }
                  return [
                    ...previos,
                    {
                      id: `nuevo-${producto.id}`,
                      productoId: producto.id,
                      nombre: producto.nombre,
                      unidadMedida: producto.unidadMedida,
                      precio: producto.precio,
                      porPeso: producto.porPeso,
                      cantidad: paso,
                    },
                  ];
                })
              }
            />

            <ul className="flex flex-col rounded-md border border-linea">
              {items.map((item, indice) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 border-b border-linea px-3 py-2 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate">{item.nombre}</span>
                  <input
                    className="h-8 w-16 rounded border border-linea-fuerte px-2 text-right text-base tabular-nums"
                    inputMode="numeric"
                    aria-label={`Cantidad de ${item.nombre}`}
                    value={item.cantidad}
                    onChange={(e) =>
                      setItems((previos) =>
                        previos.map((i, x) =>
                          x === indice ? { ...i, cantidad: Math.max(1, Number(e.target.value) || 1) } : i
                        )
                      )
                    }
                  />
                  <input
                    className="h-8 w-24 rounded border border-linea-fuerte px-2 text-right text-base tabular-nums"
                    inputMode="decimal"
                    aria-label={`Precio de ${item.nombre}`}
                    value={item.precio}
                    onChange={(e) =>
                      setItems((previos) =>
                        previos.map((i, x) =>
                          x === indice ? { ...i, precio: Math.max(0, Number(e.target.value) || 0) } : i
                        )
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Quitar ${item.nombre}`}
                    className="p-1 text-tinta-suave hover:text-alerta-texto"
                    onClick={() => setItems((previos) => previos.filter((_, x) => x !== indice))}
                  >
                    <Icono nombre="cerrar" tamano={15} />
                  </button>
                </li>
              ))}
            </ul>

            <Campo etiqueta="Cliente" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Area etiqueta="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </>
        ) : (
          <>
            <ul className="flex flex-col rounded-md border border-linea">
              {pedido.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 border-b border-linea px-3 py-2 last:border-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{item.nombre}</span>
                    <span className="block text-chico text-tinta-suave">
                      {cantidadEscrita(item.cantidad, item.porPeso)} × {plata(item.precio)}
                      {item.porPeso ? " el kilo" : ` · ${item.unidadMedida}`}
                    </span>
                  </span>
                  <span className="cifra shrink-0 font-medium">
                    {plata(importeRenglon(item.precio, item.cantidad, item.porPeso))}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between rounded-md border border-linea bg-lienzo px-3 py-2.5">
              <span className="etiqueta-campo">Total</span>
              <span className="cifra font-titulo text-titulo">{plata(pedido.total)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-base">
              <span className="text-tinta-suave">Cliente:</span>
              <span>{pedido.nombre}</span>
              {pedido.cliente && <Etiqueta tono="dato">en la agenda</Etiqueta>}
            </div>

            {pedido.pagos.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {pedido.pagos.map((pago, indice) => (
                  <Etiqueta key={indice}>
                    {ETIQUETA_PAGO[pago.metodo] ?? pago.metodo} {plata(pago.monto)}
                  </Etiqueta>
                ))}
                {pedido.recibido ? <Etiqueta>recibió {plata(pedido.recibido)}</Etiqueta> : null}
              </div>
            )}

            {pedido.notas && (
              <p className="rounded border border-linea bg-lienzo px-3 py-2 text-base text-tinta-media">
                {pedido.notas}
              </p>
            )}
          </>
        )}
      </div>
    </Dialogo>
  );
}
