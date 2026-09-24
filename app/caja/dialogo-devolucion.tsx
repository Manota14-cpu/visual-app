"use client";

import { useState } from "react";
import { Area, Boton, Dialogo, Vacio } from "@/components/ui";
import { SelectorCliente, type ClienteElegido } from "@/components/selector-cliente";
import { Icono } from "@/components/iconos";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { enteroEscrito, importeRenglon, numero, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ETIQUETA_PAGO, MEDIOS_PAGO, type ItemCobro, type MedioPago } from "@/lib/tipos";
import { BuscadorProductos } from "./buscador-productos";

/**
 * Una devolución.
 *
 * Es una venta al revés: la mercadería vuelve al stock y la plata sale del
 * cajón. Se guarda con importes negativos en la misma lista de ventas, así el
 * arqueo y los informes la restan solos.
 */
export function DialogoDevolucion({
  abierto,
  cajaId,
  onCerrar,
  onHecha,
}: {
  abierto: boolean;
  cajaId: string;
  onCerrar: () => void;
  onHecha: () => void;
}) {
  const avisos = useAvisos();
  const [items, setItems] = useState<ItemCobro[]>([]);
  const [metodo, setMetodo] = useState<MedioPago>("efectivo");
  const [nombre, setNombre] = useState("");
  // El cliente de la agenda, si se eligió. Antes solo había un campo de texto
  // y la devolución viajaba siempre sin cliente: no aparecía en su ficha, y su
  // historial de compras mostraba lo que se llevó pero no lo que devolvió.
  const [cliente, setCliente] = useState<ClienteElegido | null>(null);
  // Descontarlo de lo que el cliente debe, en vez de devolverle la plata. Solo
  // se ofrece si debe algo: devolverle efectivo por algo que se llevó fiado
  // era pagarle mercadería que nunca pagó.
  const [aCuenta, setACuenta] = useState(false);
  const puedeACuenta = cliente !== null && cliente.debe > 0;
  const [notas, setNotas] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const total = items.reduce(
    (suma, item) => suma + importeRenglon(item.precio, item.cantidad, item.porPeso),
    0
  );
  const excedeDeuda = aCuenta && cliente !== null && total > cliente.debe;

  async function devolver() {
    setTrabajando(true);
    try {
      const r = await api.post<{
        numero: number;
        total: number;
        aCuenta: boolean;
        deudaCliente: number;
      }>("/caja/devolver", {
        cajaId,
        pedidoId: null,
        clienteId: cliente?.id ?? null,
        aCuenta: aCuenta && puedeACuenta,
        nombre,
        notas,
        metodoPago: metodo,
        items: items.map((i) => ({
          productoId: i.productoId,
          nombre: i.nombre,
          unidadMedida: i.unidadMedida,
          precio: i.precio,
          cantidad: i.cantidad,
        })),
      });

      avisos.exito(
        r.aCuenta
          ? `Devolución #${r.numero}: ${plata(r.total)} descontados de lo que debe. Ahora debe ${plata(r.deudaCliente)}.`
          : `Devolución #${r.numero} por ${plata(r.total)}. La mercadería volvió al stock.`
      );
      onHecha();
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo registrar la devolución.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Devolución"
      descripcion="Lo que se devuelve vuelve al stock y su importe sale de la caja."
      pie={
        <>
          <Boton onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </Boton>
          <Boton
            tono="principal"
            onClick={() => void devolver()}
            disabled={trabajando || items.length === 0 || excedeDeuda || items.some((i) => i.cantidad <= 0)}
          >
            {trabajando ? "Registrando…" : `Devolver ${plata(total)}`}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <BuscadorProductos
          autoFocus
          placeholder="Qué producto vuelve"
          onNoEncontrado={(codigo) => avisos.error(`No hay ningún producto con el código ${codigo}.`)}
          onElegir={(producto) =>
            setItems((previos) => {
              // Lo que vuelve de un producto por peso se cuenta en gramos, así
              // que sumar "uno" sería sumar un gramo. Arranca en un kilo, igual
              // que en el cobro.
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
                  productoId: producto.id,
                  nombre: producto.nombre,
                  unidadMedida: producto.unidadMedida,
                  precio: producto.precio,
                  porPeso: producto.porPeso,
                  cantidad: paso,
                  stock: producto.stock,
                },
              ];
            })
          }
        />

        {items.length === 0 ? (
          <Vacio titulo="Sin renglones" detalle="Buscá lo que el cliente trae de vuelta." />
        ) : (
          <ul className="flex flex-col rounded-md border border-linea">
            {items.map((item, indice) => (
              <li
                key={`${item.productoId}-${indice}`}
                className="flex items-center gap-2 border-b border-linea px-3 py-2 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate">{item.nombre}</span>

                <input
                  className="h-8 w-16 rounded border border-linea-fuerte bg-papel px-2 text-right text-base tabular-nums"
                  inputMode="numeric"
                  aria-label={`Cantidad de ${item.nombre}`}
                  value={item.cantidad === 0 ? "" : item.cantidad}
                  onChange={(e) =>
                    setItems((previos) =>
                      previos.map((i, x) =>
                        x === indice ? { ...i, cantidad: enteroEscrito(e.target.value, i.cantidad) } : i
                      )
                    )
                  }
                />

                <input
                  className="h-8 w-24 rounded border border-linea-fuerte bg-papel px-2 text-right text-base tabular-nums"
                  inputMode="decimal"
                  aria-label={`Precio de ${item.nombre}`}
                  value={item.precio}
                  onChange={(e) =>
                    setItems((previos) =>
                      previos.map((i, x) =>
                        x === indice ? { ...i, precio: enteroEscrito(e.target.value, i.precio) } : i
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
        )}

        <div className="flex flex-col gap-2">
          <span className="etiqueta-campo">Por dónde sale la plata</span>
          <div className="flex flex-wrap gap-1.5">
            {MEDIOS_PAGO.map((medio) => (
              <button
                key={medio}
                type="button"
                onClick={() => {
                  setMetodo(medio);
                  setACuenta(false);
                }}
                className={cn(
                  "rounded border px-2.5 py-1.5 text-chico transition-colors",
                  !aCuenta && metodo === medio
                    ? "border-transparent bg-acento text-white shadow-acento"
                    : "border-linea-fuerte/70 bg-papel text-tinta-media shadow-boton hover:bg-[#FAFAFC]"
                )}
              >
                {ETIQUETA_PAGO[medio]}
              </button>
            ))}
            {puedeACuenta && (
              <button
                type="button"
                onClick={() => setACuenta(true)}
                className={cn(
                  "rounded border px-2.5 py-1.5 text-chico transition-colors",
                  aCuenta
                    ? "border-transparent bg-acento text-white shadow-acento"
                    : "border-linea-fuerte/70 bg-papel text-tinta-media shadow-boton hover:bg-[#FAFAFC]"
                )}
              >
                A cuenta (baja lo que debe)
              </button>
            )}
          </div>
          {aCuenta && cliente && (
            <p className={cn("text-chico", excedeDeuda ? "text-alerta-texto" : "text-tinta-suave")}>
              {excedeDeuda
                ? `Debe ${plata(cliente.debe)}: a cuenta se puede devolver hasta eso. Por el resto, hacé otra devolución en efectivo.`
                : `No sale plata del cajón: debe ${plata(cliente.debe)} y va a quedar debiendo ${plata(cliente.debe - total)}.`}
            </p>
          )}
        </div>

        <SelectorCliente
          nombre={nombre}
          onNombre={setNombre}
          cliente={cliente}
          onCliente={(elegido) => {
            setCliente(elegido);
            // Si ahora no hay cliente, o no debe nada, "a cuenta" deja de tener sentido.
            if (!elegido || elegido.debe <= 0) setACuenta(false);
          }}
          ayuda="Quién devuelve. Si está en la agenda, la devolución queda en su ficha."
        />

        <Area
          etiqueta="Motivo"
          placeholder="Vino fallado, se equivocó de medida…"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />

        {items.length > 0 && (
          <p className="text-chico text-tinta-suave">
            Vuelven {numero(items.reduce((s, i) => s + i.cantidad, 0))} unidades al stock.
          </p>
        )}
      </div>
    </Dialogo>
  );
}
