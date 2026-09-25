"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Area, Boton, Campo, Dialogo, Etiqueta, Tecla } from "@/components/ui";
import { Icono } from "@/components/iconos";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { useSesion } from "@/lib/sesion";
import { SelectorCliente, type ClienteElegido } from "@/components/selector-cliente";
import { billetesSugeridos, importeRenglon, leerNumero, numero, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ETIQUETA_PAGO, MEDIOS_PAGO, type ItemCobro, type MedioPago } from "@/lib/tipos";

interface Tramo {
  metodo: MedioPago;
  monto: string;
}

/**
 * El cobro.
 *
 * Una venta puede pagarse con más de un medio —"mitad efectivo, mitad
 * transferencia" es lo habitual— y lo cobrado tiene que dar exactamente el
 * total: si no, el arqueo del cierre arrastra una diferencia que mañana nadie
 * puede explicar. Por eso el botón no se habilita hasta que la cuenta cierra.
 */
export function DialogoCobro({
  abierto,
  cajaId,
  items,
  onCerrar,
  onCobrado,
}: {
  abierto: boolean;
  cajaId: string;
  items: ItemCobro[];
  onCerrar: () => void;
  onCobrado: (venta: {
    id: string;
    numero: number;
    total: number;
    vuelto: number;
    /** Lo que quedó debiendo esta venta. Cero si se pagó entera. */
    fiado: number;
    /** Lo que el cliente debe en total después de esta venta. */
    deudaCliente: number;
  }) => void;
}) {
  const avisos = useAvisos();
  // Sin el permiso del dueño el campo no aparece: el servidor lo rechazaría.
  const puedeDescontar = useSesion().puede("descuentos");
  const subtotal = items.reduce(
    (suma, item) => suma + importeRenglon(item.precio, item.cantidad, item.porPeso),
    0
  );

  // El descuento se escribe en pesos o en porcentaje, lo que a cada uno le
  // salga más rápido. Adentro siempre viaja en pesos: un porcentaje guardado
  // obligaría a recalcularlo cada vez que se lee, y a decidir cómo redondear
  // en cada lugar que lo mire.
  const [descuentoTexto, setDescuentoTexto] = useState("");
  const [enPorcentaje, setEnPorcentaje] = useState(false);

  const descuentoDe = (texto: string, porcentaje: boolean) => {
    const escrito = leerNumero(texto) ?? 0;
    if (escrito <= 0) return 0;
    const pesos = porcentaje ? Math.round((subtotal * escrito) / 100) : Math.round(escrito);
    return Math.min(Math.max(pesos, 0), subtotal);
  };

  const descuento = descuentoDe(descuentoTexto, enPorcentaje);
  const total = subtotal - descuento;

  const [tramos, setTramos] = useState<Tramo[]>([{ metodo: "efectivo", monto: String(subtotal) }]);
  const [recibido, setRecibido] = useState("");
  const [nombre, setNombre] = useState("");
  const [cliente, setCliente] = useState<ClienteElegido | null>(null);
  const clienteId = cliente?.id ?? null;
  const [notas, setNotas] = useState("");
  const [fiar, setFiar] = useState(false);
  const [cobrando, setCobrando] = useState(false);

  const pagos = tramos.map((t) => ({ metodo: t.metodo, monto: Math.round(leerNumero(t.monto) ?? 0) }));
  const cobrado = pagos.reduce((suma, p) => suma + p.monto, 0);
  const falta = total - cobrado;
  const enEfectivo = pagos.filter((p) => p.metodo === "efectivo").reduce((s, p) => s + p.monto, 0);
  const vuelto = Math.max(0, Math.round(leerNumero(recibido) ?? 0) - enEfectivo);

  // Un tramo en cero no es una forma de pago. El backend lo rechaza, así que
  // conviene no dejar llegar hasta ahí: se avisa acá, al lado del renglón.
  //
  // Fiando es distinto: un cero es "no deja nada ahora", que es justamente lo
  // más común al fiar. Esos tramos no se mandan. Antes el cero bloqueaba el
  // botón igual que en una venta común, y como el monto arranca con el total
  // —y con el total "no queda nada fiado"— no había forma de fiar una venta
  // sin que el cliente entregara algo.
  const hayTramoVacio = fiar ? pagos.some((p) => p.monto < 0) : pagos.some((p) => p.monto <= 0);
  const pagosQueViajan = fiar ? pagos.filter((p) => p.monto > 0) : pagos;

  /**
   * El último tramo absorbe lo que cambie el total.
   *
   * Poner un descuento baja el total, y el monto a cobrar tenía que corregirse
   * a mano: quedaba "sobran $500" y el botón bloqueado, justo con el cliente
   * esperando. Fiando no se toca: ahí los montos son lo que entrega, no el
   * total.
   */
  function ajustarAlTotal(nuevoTotal: number) {
    if (fiar) return;
    setTramos((previos) => {
      const otros = previos
        .slice(0, -1)
        .reduce((suma, t) => suma + Math.round(leerNumero(t.monto) ?? 0), 0);
      const ultimo = previos[previos.length - 1]!;
      return [...previos.slice(0, -1), { ...ultimo, monto: String(Math.max(nuevoTotal - otros, 0)) }];
    });
  }

  /**
   * Tildar "Queda fiado" deja lo entregado en cero: lo normal al fiar es que
   * no pague nada ahora, y si deja algo se escribe arriba. Destildarlo vuelve
   * a cobrar el total.
   */
  function cambiarFiar(fiando: boolean) {
    setFiar(fiando);
    setTramos((previos) =>
      fiando
        ? [{ ...previos[0]!, monto: "0" }]
        : [{ ...previos[0]!, monto: String(total) }]
    );
  }

  // Fiar exige un cliente: una deuda sin nombre no se cobra nunca. Y tiene que
  // quedar algo debiendo, si no es una venta común.
  const puedeFiar = fiar && clienteId !== null && falta > 0;
  const listoParaCobrar = fiar
    ? puedeFiar && !hayTramoVacio && items.length > 0
    : falta === 0 && !hayTramoVacio && items.length > 0;

  /**
   * Divide el cobro en dos.
   *
   * El tramo nuevo se lleva lo que falte; si no falta nada —el caso normal,
   * porque el primero arranca con el total— se parte ese primer importe por la
   * mitad. Antes el renglón nuevo nacía en cero y el botón quedaba habilitado:
   * se confirmaba la venta y el error saltaba recién en el servidor.
   */
  function dividir() {
    setTramos((previos) => {
      if (falta > 0) {
        return [...previos, { metodo: "transferencia", monto: String(falta) }];
      }

      const ultimo = previos[previos.length - 1]!;
      const monto = Math.round(leerNumero(ultimo.monto) ?? 0);
      const mitad = Math.round(monto / 2);

      return [
        ...previos.slice(0, -1),
        { ...ultimo, monto: String(monto - mitad) },
        { metodo: ultimo.metodo === "efectivo" ? "transferencia" : "efectivo", monto: String(mitad) },
      ];
    });
  }

  /**
   * Cambia el importe de un tramo y deja que el último absorba la diferencia.
   *
   * Es lo que se espera en un mostrador: se escribe cuánto se paga en efectivo
   * y el resto queda solo. Sin esto hay que hacer la resta a mano y el botón se
   * bloquea hasta que la cuenta cierre al peso.
   */
  function cambiarMonto(indice: number, valor: string) {
    setTramos((previos) => {
      const actualizados = previos.map((t, i) => (i === indice ? { ...t, monto: valor } : t));
      if (actualizados.length < 2 || indice === actualizados.length - 1) return actualizados;

      const otros = actualizados
        .slice(0, -1)
        .reduce((suma, t) => suma + Math.round(leerNumero(t.monto) ?? 0), 0);

      const ultimo = actualizados[actualizados.length - 1]!;
      return [...actualizados.slice(0, -1), { ...ultimo, monto: String(Math.max(total - otros, 0)) }];
    });
  }

  /**
   * Enter en «Con cuánto paga» cobra, y Ctrl+Enter cobra desde cualquier
   * campo. En el mostrador la venta entera se hace sin soltar el teclado:
   * pasar los productos, F2, escribir con cuánto paga y Enter.
   */
  function alTeclear(evento: KeyboardEvent, soloConControl: boolean) {
    // El Enter del campo sube hasta el contenedor: si ya lo atendió el campo,
    // no se cobra dos veces.
    if (evento.key !== "Enter" || evento.defaultPrevented) return;
    if (soloConControl && !evento.ctrlKey && !evento.metaKey) return;
    evento.preventDefault();
    if (listoParaCobrar && !cobrando) void cobrar();
  }

  // Al abrir, el cursor va a «Con cuánto paga»: es lo único que hay que
  // escribir en un cobro en efectivo. Sin esto quedaba en la cruz de cerrar, y
  // el Enter que seguía cerraba el diálogo en vez de cobrar.
  useEffect(() => {
    const campo = document.querySelector<HTMLInputElement>("[data-recibido]");
    const cuadro = requestAnimationFrame(() => campo?.focus());
    return () => cancelAnimationFrame(cuadro);
  }, []);

  // Dos Enter seguidos llegan antes de que React redibuje con `cobrando`: sin
  // esta traba la misma venta viajaba dos veces.
  const enCurso = useRef(false);

  async function cobrar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setCobrando(true);
    try {
      const venta = await api.post<{
        id: string;
        numero: number;
        total: number;
        vuelto: number;
        fiado: number;
        deudaCliente: number;
      }>(
        "/caja/cobrar",
        {
          cajaId,
          clienteId,
          nombre,
          notas,
          fiar,
          descuento,
          recibido: Math.round(leerNumero(recibido) ?? 0),
          pagos: pagosQueViajan,
          items: items.map((i) => ({
            productoId: i.productoId,
            nombre: i.nombre,
            unidadMedida: i.unidadMedida,
            precio: i.precio,
            cantidad: i.cantidad,
          })),
        }
      );

      onCobrado(venta);
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo cobrar.");
    } finally {
      enCurso.current = false;
      setCobrando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cobrar"
      descripcion={descripcionDe(items)}
      pie={
        <>
          <Boton onClick={onCerrar} disabled={cobrando}>
            Cancelar
          </Boton>
          <Boton
            tono="principal"
            onClick={() => void cobrar()}
            disabled={cobrando || !listoParaCobrar}
          >
            {cobrando
              ? fiar
                ? "Fiando…"
                : "Cobrando…"
              : fiar
                ? `Fiar ${plata(falta)}`
                : `Cobrar ${plata(total)}`}
            {!cobrando && <Tecla clara>Enter</Tecla>}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4" onKeyDown={(e) => alTeclear(e, true)}>
        <div className="flex flex-col gap-2 rounded-md border border-linea bg-lienzo px-4 py-3">
          {descuento > 0 && (
            <>
              <div className="flex items-baseline justify-between text-base text-tinta-suave">
                <span>Subtotal</span>
                <span className="cifra">{plata(subtotal)}</span>
              </div>
              <div className="flex items-baseline justify-between text-base text-exito-texto">
                <span>Descuento</span>
                <span className="cifra">−{plata(descuento)}</span>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between">
            <span className="etiqueta-campo">Total</span>
            <span className="cifra font-titulo text-cifra">{plata(total)}</span>
          </div>
        </div>

        {/* El descuento en pesos o en porcentaje, lo que salga más rápido.
            Va acá arriba y no escondido: es una decisión que se toma con el
            cliente enfrente, antes de elegir cómo paga. */}
        {puedeDescontar && (
          <div className="flex flex-wrap items-end gap-2">
            <span className="min-w-[160px] flex-1">
              <Campo
                etiqueta="Descuento"
                inputMode="numeric"
                value={descuentoTexto}
                onChange={(e) => {
                  setDescuentoTexto(e.target.value);
                  ajustarAlTotal(subtotal - descuentoDe(e.target.value, enPorcentaje));
                }}
                placeholder={enPorcentaje ? "10" : "500"}
              />
            </span>
            <div className="flex overflow-hidden rounded border border-linea-fuerte">
              {[
                { valor: false, texto: "$" },
                { valor: true, texto: "%" },
              ].map((opcion) => (
                <button
                  key={opcion.texto}
                  type="button"
                  onClick={() => {
                    setEnPorcentaje(opcion.valor);
                    ajustarAlTotal(subtotal - descuentoDe(descuentoTexto, opcion.valor));
                  }}
                  className={cn(
                    "px-3 py-2 text-base transition-colors",
                    enPorcentaje === opcion.valor
                      ? "bg-acento text-white"
                      : "text-tinta-suave hover:bg-contraste/[0.04]"
                )}
              >
                {opcion.texto}
              </button>
            ))}
          </div>
        </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="etiqueta-campo">Cómo paga</span>

          {tramos.map((tramo, indice) => (
            <div key={indice} className="flex items-center gap-2">
              <div className="flex flex-1 flex-wrap gap-1">
                {MEDIOS_PAGO.map((medio) => (
                  <button
                    key={medio}
                    type="button"
                    onClick={() =>
                      setTramos((previos) =>
                        previos.map((t, i) => (i === indice ? { ...t, metodo: medio } : t))
                      )
                    }
                    className={cn(
                      "rounded border px-2.5 py-1.5 text-chico transition-colors",
                      tramo.metodo === medio
                        ? "border-transparent bg-acento text-white shadow-acento"
                        : "border-linea-fuerte/70 bg-papel text-tinta-media shadow-boton hover:bg-contraste/[0.025]"
                    )}
                  >
                    {ETIQUETA_PAGO[medio]}
                  </button>
                ))}
              </div>

              <input
                className="h-9 w-28 rounded border border-linea-fuerte bg-papel px-2 text-right text-base tabular-nums focus:border-acento focus:outline-none focus:ring-[3px] focus:ring-acento/25"
                inputMode="decimal"
                value={tramo.monto}
                aria-label={`Monto en ${ETIQUETA_PAGO[tramo.metodo]}`}
                onChange={(e) => cambiarMonto(indice, e.target.value)}
              />

              {tramos.length > 1 && (
                <button
                  type="button"
                  aria-label="Quitar este pago"
                  className="p-1 text-tinta-suave hover:text-alerta-texto"
                  onClick={() =>
                    // Al sacar un tramo, lo que pagaba vuelve al que queda: si
                    // no, la cuenta deja de cerrar y el botón se bloquea sin
                    // que se entienda por qué.
                    setTramos((previos) => {
                      const quedan = previos.filter((_, i) => i !== indice);
                      const otros = quedan
                        .slice(0, -1)
                        .reduce((suma, t) => suma + Math.round(leerNumero(t.monto) ?? 0), 0);
                      const ultimo = quedan[quedan.length - 1]!;
                      return [
                        ...quedan.slice(0, -1),
                        { ...ultimo, monto: String(Math.max(total - otros, 0)) },
                      ];
                    })
                  }
                >
                  <Icono nombre="cerrar" tamano={15} />
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between gap-2">
            {tramos.length < 4 ? (
              <Boton chico tono="fantasma" icono="mas" onClick={dividir}>
                Dividir el pago
              </Boton>
            ) : (
              <span />
            )}

            {falta !== 0 ? (
              <Etiqueta tono={falta < 0 ? "alerta" : fiar ? "dato" : "aviso"}>
                {falta > 0
                  ? fiar
                    ? `quedan ${plata(falta)} fiados`
                    : `faltan ${plata(falta)}`
                  : `sobran ${plata(-falta)}`}
              </Etiqueta>
            ) : hayTramoVacio ? (
              <Etiqueta tono="aviso">poné cuánto va en cada medio</Etiqueta>
            ) : null}
          </div>
        </div>

        {enEfectivo > 0 && (
          <div className="flex flex-col gap-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                etiqueta="Con cuánto paga"
                inputMode="decimal"
                placeholder="0"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
                onKeyDown={(e) => alTeclear(e, false)}
                data-recibido
              />
              <div className="flex flex-col justify-end pb-1">
                <span className="etiqueta-campo">Vuelto</span>
                <span
                  className={cn(
                    "cifra font-titulo text-titulo transition-colors duration-300",
                    vuelto > 0 && "text-exito-texto"
                  )}
                >
                  {plata(vuelto)}
                </span>
              </div>
            </div>
            {/* Los billetes con que se suele pagar, a un toque: escribir
                "20000" con el cliente esperando es más lento que tocarlo. */}
            <div className="flex flex-wrap gap-1.5" aria-label="Con cuánto paga">
              {[enEfectivo, ...billetesSugeridos(enEfectivo)].map((monto, i) => {
                const elegido = Math.round(leerNumero(recibido) ?? -1) === monto;
                return (
                  <button
                    key={monto}
                    type="button"
                    onClick={() => setRecibido(String(monto))}
                    className={cn(
                      "cifra rounded-full border px-3 py-1 text-chico font-medium transition-all duration-200 ease-suave active:scale-[0.96]",
                      elegido
                        ? "border-transparent bg-acento text-white shadow-acento"
                        : "border-linea-fuerte/70 bg-papel text-tinta-media shadow-boton hover:border-acento/40 hover:text-acento"
                    )}
                  >
                    {i === 0 ? "Justo" : plata(monto)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <SelectorCliente nombre={nombre} onNombre={setNombre} cliente={cliente} onCliente={setCliente} />

        {/* Fiar. Va debajo del cliente a propósito: el orden en pantalla es el
            orden de la decisión, porque sin cliente no hay a quién cobrarle. */}
        <div className="flex flex-col gap-2 rounded-md border border-linea bg-lienzo px-3 py-2.5">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={fiar}
              onChange={(e) => cambiarFiar(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer"
            />
            <span className="min-w-0">
              <span className="block text-base">Queda fiado</span>
              <span className="block text-chico text-tinta-suave">
                Se lleva la mercadería y paga después. Lo que entregue ahora va arriba; el resto
                queda en su cuenta.
              </span>
            </span>
          </label>

          {fiar && clienteId === null && (
            <Etiqueta tono="alerta">
              Elegí o agregá el cliente arriba: una deuda sin nombre no se cobra nunca
            </Etiqueta>
          )}
          {fiar && cliente && falta > 0 && (
            <span className="text-chico text-tinta-suave">
              {cliente.debe > 0
                ? `Ya debía ${plata(cliente.debe)}: con esta venta queda debiendo ${plata(cliente.debe + falta)}.`
                : `Queda debiendo ${plata(falta)}.`}
            </span>
          )}
          {fiar && clienteId !== null && falta <= 0 && (
            <Etiqueta tono="aviso">
              {falta === 0 ? "Esta venta se paga entera: no queda nada fiado" : "Está entregando de más"}
            </Etiqueta>
          )}
        </div>

        <Area
          etiqueta="Notas"
          placeholder="Opcional: qué se llevó, cuándo lo pasa a buscar…"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
      </div>
    </Dialogo>
  );
}

/**
 * "3 renglones · 5 unidades". Lo que va por peso no suma unidades: 350 gramos
 * de jamón no son 350 unidades, son un paquete.
 */
function descripcionDe(items: ItemCobro[]): string {
  const renglones = `${numero(items.length)} ${items.length === 1 ? "renglón" : "renglones"}`;
  const unidades = items.filter((i) => !i.porPeso).reduce((s, i) => s + i.cantidad, 0);
  const pesados = items.filter((i) => i.porPeso).length;
  const partes = [renglones];
  if (unidades > 0) partes.push(`${numero(unidades)} ${unidades === 1 ? "unidad" : "unidades"}`);
  if (pesados > 0) partes.push(`${numero(pesados)} por peso`);
  return partes.join(" · ");
}
