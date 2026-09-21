"use client";

import { useMemo, useState } from "react";
import { Area, Boton, Campo, Dialogo, Etiqueta } from "@/components/ui";
import { Icono } from "@/components/iconos";
import { useAvisos } from "@/components/avisos";
import { api, consulta, ErrorApi } from "@/lib/api";
import { useDatos, useEspera } from "@/lib/datos";
import { importeRenglon, leerNumero, numero, plata } from "@/lib/formato";
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
  const total = items.reduce(
    (suma, item) => suma + importeRenglon(item.precio, item.cantidad, item.porPeso),
    0
  );

  const [tramos, setTramos] = useState<Tramo[]>([{ metodo: "efectivo", monto: String(total) }]);
  const [recibido, setRecibido] = useState("");
  const [nombre, setNombre] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
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
  const hayTramoVacio = pagos.some((p) => p.monto <= 0);

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

  async function cobrar() {
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
          recibido: Math.round(leerNumero(recibido) ?? 0),
          pagos,
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
      setCobrando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cobrar"
      descripcion={`${numero(items.length)} ${items.length === 1 ? "renglón" : "renglones"} · ${numero(items.reduce((s, i) => s + i.cantidad, 0))} unidades`}
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
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between rounded-md border border-linea bg-lienzo px-4 py-3">
          <span className="etiqueta-campo">Total</span>
          <span className="cifra font-titulo text-cifra">{plata(total)}</span>
        </div>

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
                        : "border-linea-fuerte/70 bg-papel text-tinta-media shadow-boton hover:bg-[#FAFAFC]"
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etiqueta="Con cuánto paga"
              inputMode="decimal"
              placeholder="0"
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
            />
            <div className="flex flex-col justify-end pb-1">
              <span className="etiqueta-campo">Vuelto</span>
              <span className="cifra font-titulo text-titulo">{plata(vuelto)}</span>
            </div>
          </div>
        )}

        <SelectorCliente
          nombre={nombre}
          onNombre={setNombre}
          onCliente={(cliente) => {
            setClienteId(cliente?.id ?? null);
            setNombre(cliente?.nombre ?? "");
          }}
          clienteElegido={clienteId !== null}
        />

        {/* Fiar. Va debajo del cliente a propósito: el orden en pantalla es el
            orden de la decisión, porque sin cliente no hay a quién cobrarle. */}
        <div className="flex flex-col gap-2 rounded-md border border-linea bg-lienzo px-3 py-2.5">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={fiar}
              onChange={(e) => setFiar(e.target.checked)}
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
              Elegí el cliente de la agenda: una deuda sin nombre no se cobra nunca
            </Etiqueta>
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
 * A quién se le vende.
 *
 * Se puede escribir un nombre suelto —la mayoría de las ventas de mostrador no
 * tienen ficha— o engancharla a un cliente de la agenda, que es lo que hace
 * que después aparezca en su historial de compras.
 */
function SelectorCliente({
  nombre,
  onNombre,
  onCliente,
  clienteElegido,
}: {
  nombre: string;
  onNombre: (valor: string) => void;
  onCliente: (cliente: { id: string; nombre: string } | null) => void;
  clienteElegido: boolean;
}) {
  const [texto, setTexto] = useState("");
  const termino = useEspera(texto, 220);

  const { datos } = useDatos<{ id: string; nombre: string; telefono: string | null; ciudad: string | null }[]>(
    !clienteElegido && termino.trim().length >= 2 ? `/clientes/buscar${consulta({ q: termino })}` : null,
    { silencioso: true }
  );

  const sugerencias = useMemo(() => datos ?? [], [datos]);

  if (clienteElegido) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-linea bg-lienzo px-3 py-2">
        <span className="min-w-0">
          <span className="etiqueta-campo">Cliente</span>
          <span className="block truncate">{nombre}</span>
        </span>
        <Boton
          chico
          tono="fantasma"
          onClick={() => {
            onCliente(null);
            setTexto("");
          }}
        >
          Quitar
        </Boton>
      </div>
    );
  }

  return (
    <div className="relative">
      <Campo
        etiqueta="Cliente"
        placeholder="Mostrador"
        ayuda="Escribí un nombre, o buscá uno de la agenda para que le quede en su historial."
        value={nombre}
        onChange={(e) => {
          onNombre(e.target.value);
          setTexto(e.target.value);
        }}
      />

      {sugerencias.length > 0 && (
        <ul className="vidrio-menu absolute left-0 right-0 top-[62px] z-30 max-h-52 animate-entrar overflow-y-auto rounded-md py-1 shadow-elevada ring-1 ring-black/[0.07]">
          {sugerencias.map((cliente) => (
            <li key={cliente.id}>
              <button
                type="button"
                onClick={() => {
                  onCliente(cliente);
                  setTexto("");
                }}
                className="flex w-full flex-col px-3 py-1.5 text-left transition-colors hover:bg-acento/[0.08]"
              >
                <span>{cliente.nombre}</span>
                <span className="text-chico text-tinta-suave">
                  {[cliente.telefono, cliente.ciudad].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
