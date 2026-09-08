"use client";

import Link from "next/link";
import { useState } from "react";
import { Marco } from "@/components/marco";
import {
  Area,
  Aviso,
  Boton,
  Campo,
  Cargando,
  Dialogo,
  Etiqueta,
  Hoja,
  Vacio,
} from "@/components/ui";
import { Icono } from "@/components/iconos";
import { useAvisos } from "@/components/avisos";
import { useDatos } from "@/lib/datos";
import { api, ErrorApi } from "@/lib/api";
import { fechaHora, hora, leerNumero, numero, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ETIQUETA_PAGO, type Caja, type CajaResumen, type ItemCobro } from "@/lib/tipos";
import { BuscadorProductos } from "./buscador-productos";
import { DialogoCobro } from "./dialogo-cobro";
import { DialogoDevolucion } from "./dialogo-devolucion";
import { DialogoCierre } from "./dialogo-cierre";

export default function PaginaCaja() {
  const avisos = useAvisos();
  const { datos: caja, cargando, error, recargar } = useDatos<Caja | null>("/caja");
  const { datos: historial, recargar: recargarHistorial } = useDatos<CajaResumen[]>("/caja/historial");

  const [items, setItems] = useState<ItemCobro[]>([]);
  const [cobrando, setCobrando] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);
  // La caja que se está cerrando se guarda aparte, no se toma "en vivo": al
  // confirmar el cierre el turno deja de existir, y con la referencia viva el
  // resumen del arqueo —la diferencia entre lo contado y lo esperado— se
  // desmontaba antes de que alguien alcanzara a leerlo.
  const [cerrando, setCerrando] = useState<Caja | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const [ultima, setUltima] = useState<{ id: string; numero: number; total: number; vuelto: number } | null>(null);

  const total = items.reduce((suma, item) => suma + item.precio * item.cantidad, 0);

  // No se puede entregar lo que no hay: el backend lo rechaza igual, pero el
  // renglón en rojo y el botón apagado lo dicen antes de confirmar la venta.
  const sinStock = items.some((i) => i.productoId !== null && i.cantidad > i.stock);

  function actualizar() {
    void recargar();
    void recargarHistorial();
  }

  function agregar(producto: {
    id: string;
    nombre: string;
    precio: number;
    stock: number;
    unidadMedida: string;
  }) {
    setItems((previos) => {
      const existente = previos.find((i) => i.productoId === producto.id);
      if (existente) {
        return previos.map((i) =>
          i.productoId === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      return [
        ...previos,
        {
          productoId: producto.id,
          nombre: producto.nombre,
          unidadMedida: producto.unidadMedida,
          precio: producto.precio,
          cantidad: 1,
          stock: producto.stock,
        },
      ];
    });
  }

  return (
    <Marco
      titulo="Caja"
      descripcion={
        caja
          ? `Turno ${caja.numero}, abierto ${fechaHora(caja.abiertaEn)}.`
          : "Abrí un turno para cobrar por mostrador."
      }
      acciones={
        caja ? (
          <>
            <Boton icono="movimientos" onClick={() => setMoviendo(true)}>
              Retiro o ingreso
            </Boton>
            <Boton icono="recargar" onClick={() => setDevolviendo(true)}>
              Devolución
            </Boton>
            <Boton tono="principal" icono="listo" onClick={() => setCerrando(caja)}>
              Cerrar turno
            </Boton>
          </>
        ) : undefined
      }
    >
      {cargando && !caja && <Cargando filas={5} />}

      {/* Sin esto, un backend caído se veía igual que un turno sin abrir: la
          pantalla ofrecía abrir uno y el botón tampoco funcionaba. */}
      {error && (
        <div className="mb-4">
          <Aviso tono="alerta">{error}</Aviso>
        </div>
      )}

      {!cargando && !error && !caja && (
        <div className="flex flex-col gap-5">
          <AbrirTurno onAbierta={actualizar} />
          <Historial cajas={historial ?? []} />
        </div>
      )}

      {caja && (
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col gap-4">
            {ultima && (
              <div className="flex animate-entrar flex-wrap items-center justify-between gap-3 rounded-md border border-exito-linea bg-exito-fondo px-4 py-3 text-exito-texto">
                <span className="flex items-center gap-2">
                  <Icono nombre="listo" tamano={17} />
                  <span>
                    Venta #{ultima.numero} cobrada por {plata(ultima.total)}
                    {ultima.vuelto > 0 ? ` · vuelto ${plata(ultima.vuelto)}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Link
                    href={`/comprobante?venta=${ultima.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded border border-exito-linea bg-papel px-2.5 text-chico text-tinta hover:bg-lienzo"
                  >
                    <Icono nombre="imprimir" tamano={14} />
                    Comprobante
                  </Link>
                  <button type="button" onClick={() => setUltima(null)} aria-label="Cerrar aviso">
                    <Icono nombre="cerrar" tamano={15} />
                  </button>
                </span>
              </div>
            )}

            <Hoja titulo="Cobrar">
              <div className="flex flex-col gap-3">
                <BuscadorProductos autoFocus onElegir={agregar} />

                {items.length === 0 ? (
                  <Vacio
                    titulo="Sin renglones"
                    detalle="Buscá el producto por nombre o pasá el lector de códigos."
                  />
                ) : (
                  <ul className="flex flex-col rounded-md border border-linea">
                    {items.map((item, indice) => {
                      const excede = item.productoId !== null && item.cantidad > item.stock;
                      return (
                        <li
                          key={`${item.productoId}-${indice}`}
                          className="flex items-center gap-2 border-b border-linea px-3 py-2 last:border-0"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{item.nombre}</span>
                            <span className="block text-chico text-tinta-suave">
                              {plata(item.precio)} · quedan {numero(item.stock)}
                            </span>
                          </span>

                          <div className="flex items-center rounded border border-linea-fuerte">
                            <button
                              type="button"
                              aria-label="Uno menos"
                              className="px-2 py-1.5 text-tinta-suave hover:text-tinta"
                              onClick={() =>
                                setItems((previos) =>
                                  previos
                                    .map((i, x) =>
                                      x === indice ? { ...i, cantidad: i.cantidad - 1 } : i
                                    )
                                    .filter((i) => i.cantidad > 0)
                                )
                              }
                            >
                              <Icono nombre="menos" tamano={14} />
                            </button>
                            <input
                              className="w-12 border-x border-linea-fuerte py-1.5 text-center text-base tabular-nums focus:outline-none"
                              inputMode="numeric"
                              aria-label={`Cantidad de ${item.nombre}`}
                              value={item.cantidad}
                              onChange={(e) =>
                                setItems((previos) =>
                                  previos.map((i, x) =>
                                    x === indice
                                      ? { ...i, cantidad: Math.max(1, Number(e.target.value) || 1) }
                                      : i
                                  )
                                )
                              }
                            />
                            <button
                              type="button"
                              aria-label="Uno más"
                              className="px-2 py-1.5 text-tinta-suave hover:text-tinta"
                              onClick={() =>
                                setItems((previos) =>
                                  previos.map((i, x) =>
                                    x === indice ? { ...i, cantidad: i.cantidad + 1 } : i
                                  )
                                )
                              }
                            >
                              <Icono nombre="mas" tamano={14} />
                            </button>
                          </div>

                          <span
                            className={cn(
                              "cifra w-24 shrink-0 text-right font-medium",
                              excede && "text-alerta-texto"
                            )}
                          >
                            {plata(item.precio * item.cantidad)}
                          </span>

                          <button
                            type="button"
                            aria-label={`Quitar ${item.nombre}`}
                            className="p-1 text-tinta-suave hover:text-alerta-texto"
                            onClick={() => setItems((previos) => previos.filter((_, x) => x !== indice))}
                          >
                            <Icono nombre="cerrar" tamano={15} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {sinStock && (
                  <Aviso tono="alerta">
                    Hay renglones con más unidades de las que quedan en el depósito. Corregí la
                    cantidad, o cargá la entrada de mercadería antes de cobrar.
                  </Aviso>
                )}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div>
                    <span className="etiqueta-campo">Total</span>
                    <p className="cifra font-titulo text-cifra">{plata(total)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {items.length > 0 && (
                      <Boton tono="fantasma" onClick={() => setItems([])}>
                        Vaciar
                      </Boton>
                    )}
                    <Boton
                      tono="principal"
                      icono="caja"
                      disabled={items.length === 0 || sinStock}
                      onClick={() => setCobrando(true)}
                    >
                      Cobrar
                    </Boton>
                  </div>
                </div>
              </div>
            </Hoja>
          </div>

          <div className="flex flex-col gap-4">
            <Hoja titulo={`Turno ${caja.numero}`}>
              <div className="flex flex-col gap-2.5">
                <Linea rotulo="Fondo" valor={plata(caja.fondo)} />
                <Linea rotulo="Efectivo" valor={plata(caja.totales.efectivo)} />
                <Linea rotulo="Transferencia" valor={plata(caja.totales.transferencia)} />
                <Linea rotulo="Tarjeta" valor={plata(caja.totales.tarjeta)} />
                {caja.totales.otro !== 0 && <Linea rotulo="Otro" valor={plata(caja.totales.otro)} />}
                {caja.ingresado > 0 && <Linea rotulo="Ingresos" valor={plata(caja.ingresado)} />}
                {caja.retirado > 0 && <Linea rotulo="Retiros" valor={`−${plata(caja.retirado)}`} />}

                <div className="mt-1 border-t border-linea pt-2.5">
                  <Linea rotulo="Vendido" valor={plata(caja.totales.total)} fuerte />
                  <Linea rotulo="Debería haber en el cajón" valor={plata(caja.esperado)} fuerte />
                </div>
              </div>
            </Hoja>

            <Hoja titulo={`Ventas del turno (${numero(caja.totales.cantidad)})`} cuerpo="p-0">
              {caja.ventas.length === 0 ? (
                <Vacio titulo="Todavía no vendiste nada" />
              ) : (
                <ul className="max-h-80 overflow-y-auto">
                  {caja.ventas.map((venta) => (
                    <li
                      key={venta.id}
                      className="flex items-center justify-between gap-2 border-b border-linea px-4 py-2.5 last:border-0"
                    >
                      <span className="min-w-0">
                        <Link
                          href={`/comprobante?venta=${venta.id}`}
                          className="block truncate font-medium hover:underline"
                        >
                          #{venta.numero} · {venta.nombre}
                        </Link>
                        <span className="block text-chico text-tinta-suave">
                          {hora(venta.creadoEn)} · {ETIQUETA_PAGO[venta.metodoPago] ?? venta.metodoPago} ·{" "}
                          {numero(venta.unidades)} u.
                        </span>
                      </span>
                      <span
                        className={cn(
                          "cifra shrink-0 font-medium",
                          venta.total < 0 && "text-alerta-texto"
                        )}
                      >
                        {plata(venta.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Hoja>

            {caja.movimientos.length > 0 && (
              <Hoja titulo="Movimientos de caja" cuerpo="p-0">
                <ul>
                  {caja.movimientos.map((movimiento) => (
                    <li
                      key={movimiento.id}
                      className="flex items-center justify-between gap-2 border-b border-linea px-4 py-2.5 last:border-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{movimiento.motivo}</span>
                        <span className="block text-chico text-tinta-suave">
                          {hora(movimiento.creadoEn)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "cifra shrink-0 font-medium",
                          movimiento.tipo === "retiro" ? "text-alerta-texto" : "text-exito-texto"
                        )}
                      >
                        {movimiento.tipo === "retiro" ? "−" : "+"}
                        {plata(movimiento.monto)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Hoja>
            )}
          </div>
        </div>
      )}

      {caja && (
        <>
          {/* Cada diálogo se monta al abrirse: su formulario arranca limpio y
              no queda nada del cobro anterior cuando se abre el siguiente. */}
          {cobrando && (
            <DialogoCobro
              abierto
              cajaId={caja.id}
              items={items}
              onCerrar={() => setCobrando(false)}
              onCobrado={(venta) => {
                setUltima(venta);
                setItems([]);
                actualizar();
                avisos.exito(`Venta #${venta.numero} cobrada.`);
              }}
            />
          )}

          {devolviendo && (
            <DialogoDevolucion
              abierto
              cajaId={caja.id}
              onCerrar={() => setDevolviendo(false)}
              onHecha={actualizar}
            />
          )}

          {moviendo && (
            <DialogoMovimiento
              abierto
              cajaId={caja.id}
              onCerrar={() => setMoviendo(false)}
              onHecho={actualizar}
            />
          )}
        </>
      )}

      {/* El cierre vive fuera del bloque anterior a propósito: al confirmarlo
          el turno deja de existir, y adentro se desmontaba junto con él —
          llevándose el resumen del arqueo, que es lo único que alguien quiere
          leer en ese momento. */}
      {cerrando && (
        <DialogoCierre
          caja={cerrando}
          onCerrar={() => setCerrando(null)}
          onCerrado={() => {
            // Lo que quedó sin cobrar no pertenece al turno siguiente.
            setItems([]);
            setUltima(null);
            actualizar();
          }}
        />
      )}
    </Marco>
  );
}

function Linea({ rotulo, valor, fuerte }: { rotulo: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-base">
      <span className={fuerte ? "font-medium" : "text-tinta-suave"}>{rotulo}</span>
      <span className={fuerte ? "cifra font-medium" : "cifra text-tinta-media"}>{valor}</span>
    </div>
  );
}

/** El arranque del turno: con cuánto empieza el cajón. */
function AbrirTurno({ onAbierta }: { onAbierta: () => void }) {
  const avisos = useAvisos();
  const [fondo, setFondo] = useState("");
  const [nota, setNota] = useState("");
  const [abriendo, setAbriendo] = useState(false);

  async function abrir() {
    setAbriendo(true);
    try {
      await api.post("/caja/abrir", { fondo: Math.round(leerNumero(fondo) ?? 0), nota });
      avisos.exito("Turno abierto.");
      onAbierta();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo abrir el turno.");
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <Hoja titulo="Abrir turno">
      <div className="flex flex-col gap-4 sm:max-w-md">
        <p className="text-base text-tinta-suave">
          Anotá con cuánto efectivo arranca el cajón. Al cerrar, ese número es contra el que se
          compara lo que contás.
        </p>
        <Campo
          etiqueta="Fondo inicial"
          inputMode="decimal"
          placeholder="0"
          autoFocus
          value={fondo}
          onChange={(e) => setFondo(e.target.value)}
        />
        <Campo
          etiqueta="Nota"
          placeholder="Opcional: quién abre el turno."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        <div>
          <Boton tono="principal" icono="caja" onClick={() => void abrir()} disabled={abriendo}>
            {abriendo ? "Abriendo…" : "Abrir turno"}
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}

function Historial({ cajas }: { cajas: CajaResumen[] }) {
  if (cajas.length === 0) return null;

  return (
    <Hoja titulo="Turnos anteriores" cuerpo="p-0">
      <ul>
        {cajas.map((caja) => (
          <li
            key={caja.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-4 py-3 last:border-0"
          >
            <span className="min-w-0">
              <span className="block font-medium">Turno {caja.numero}</span>
              <span className="block text-chico text-tinta-suave">
                {fechaHora(caja.abiertaEn)} → {caja.cerradaEn ? fechaHora(caja.cerradaEn) : "abierto"} ·{" "}
                {numero(caja.ventas)} ventas
              </span>
            </span>

            <span className="flex items-center gap-3">
              <span className="cifra font-medium">{plata(caja.total)}</span>
              {caja.diferencia !== null && (
                <Etiqueta
                  tono={caja.diferencia === 0 ? "exito" : caja.diferencia > 0 ? "aviso" : "alerta"}
                >
                  {caja.diferencia === 0 ? "cuadró" : plata(caja.diferencia)}
                </Etiqueta>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Hoja>
  );
}

/**
 * Plata que entra o sale sin ser una venta.
 *
 * Sin esto, pagar un flete con la plata del cajón haría que el cierre marcara
 * un faltante que no lo es — y al tercer día nadie mira más la diferencia, que
 * es justo el número por el que existe el turno.
 */
function DialogoMovimiento({
  abierto,
  cajaId,
  onCerrar,
  onHecho,
}: {
  abierto: boolean;
  cajaId: string;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const avisos = useAvisos();
  const [tipo, setTipo] = useState<"retiro" | "ingreso">("retiro");
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  async function guardar() {
    setTrabajando(true);
    try {
      await api.post("/caja/movimiento", {
        cajaId,
        tipo,
        monto: Math.round(leerNumero(monto) ?? 0),
        motivo,
      });
      avisos.exito(tipo === "retiro" ? "Retiro anotado." : "Ingreso anotado.");
      setMonto("");
      setMotivo("");
      onHecho();
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo anotar el movimiento.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Retiro o ingreso"
      descripcion="Plata que entra o sale del cajón sin ser una venta."
      ancho="max-w-md"
      pie={
        <>
          <Boton onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </Boton>
          <Boton tono="principal" onClick={() => void guardar()} disabled={trabajando}>
            {trabajando ? "Guardando…" : "Anotar"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {(["retiro", "ingreso"] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setTipo(opcion)}
              className={cn(
                "rounded border px-3 py-2.5 text-base transition-colors",
                tipo === opcion
                  ? "border-transparent bg-acento text-white shadow-acento"
                  : "border-linea-fuerte/70 bg-papel text-tinta-media shadow-boton hover:bg-[#FAFAFC]"
              )}
            >
              {opcion === "retiro" ? "Sale del cajón" : "Entra al cajón"}
            </button>
          ))}
        </div>

        <Campo
          etiqueta="Monto"
          inputMode="decimal"
          autoFocus
          placeholder="0"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />

        <Area
          etiqueta="Para qué fue"
          placeholder="Pago de flete, cambio para el cajón…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>
    </Dialogo>
  );
}
