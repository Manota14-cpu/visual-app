"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  Tecla,
  Vacio,
} from "@/components/ui";
import { Icono } from "@/components/iconos";
import { useAvisos } from "@/components/avisos";
import { useDatos } from "@/lib/datos";
import { useSesion } from "@/lib/sesion";
import { pitido, useLectorDeCodigos } from "@/lib/lector";
import { api, ErrorApi } from "@/lib/api";
import { cantidadEscrita, enteroEscrito, fechaHora, hora, importeRenglon, leerNumero, llevado, numero, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ETIQUETA_PAGO, type Caja, type CajaResumen, type ItemCobro, type ProductoBuscado } from "@/lib/tipos";
import { BuscadorProductos, buscarPorCodigo } from "./buscador-productos";
import { DialogoCobro } from "./dialogo-cobro";
import { DialogoDevolucion } from "./dialogo-devolucion";
import { DialogoCierre } from "./dialogo-cierre";
import { DialogoAlta } from "./dialogo-alta";

export default function PaginaCaja() {
  const avisos = useAvisos();
  const { datos: caja, cargando, error, recargar } = useDatos<Caja | null>("/caja");
  const { datos: historial, recargar: recargarHistorial } = useDatos<CajaResumen[]>("/caja/historial");
  const { datos: frecuentes, recargar: recargarFrecuentes } = useDatos<ProductoBuscado[]>(
    "/productos/frecuentes",
    { silencioso: true }
  );

  const { esDueno } = useSesion();
  const [items, setItems] = useState<ItemCobro[]>([]);
  // Lo último que leyó el lector, para el recuadro de abajo del buscador.
  const [lectura, setLectura] = useState<
    { codigo: string; producto: string | null } | null
  >(null);
  const [cobrando, setCobrando] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);
  // La caja que se está cerrando se guarda aparte, no se toma "en vivo": al
  // confirmar el cierre el turno deja de existir, y con la referencia viva el
  // resumen del arqueo —la diferencia entre lo contado y lo esperado— se
  // desmontaba antes de que alguien alcanzara a leerlo.
  const [cerrando, setCerrando] = useState<Caja | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  // Un código leído que no estaba cargado, para darlo de alta ahí mismo.
  const [nuevoCodigo, setNuevoCodigo] = useState<string | null>(null);
  const [ultima, setUltima] = useState<{
    id: string;
    numero: number;
    total: number;
    vuelto: number;
    fiado: number;
    deudaCliente: number;
  } | null>(null);

  const total = items.reduce(
    (suma, item) => suma + importeRenglon(item.precio, item.cantidad, item.porPeso),
    0
  );

  // No se puede entregar lo que no hay: el backend lo rechaza igual, pero el
  // renglón en rojo y el botón apagado lo dicen antes de confirmar la venta.
  const sinStock = items.some((i) => i.productoId !== null && i.cantidad > i.stock);
  // Una cantidad vacía mientras se escribe: no se cobra hasta completarla.
  const sinCantidad = items.some((i) => i.cantidad <= 0);
  const puedeCobrar = items.length > 0 && !sinStock && !sinCantidad;

  // F2 abre el cobro desde cualquier lado de la pantalla, con el cursor en el
  // buscador o sin él: es la tecla de "cobrar" de casi todas las cajas.
  useEffect(() => {
    if (!caja || !puedeCobrar) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== "F2" || document.querySelector("dialog[open]")) return;
      evento.preventDefault();
      setCobrando(true);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [caja, puedeCobrar]);

  function actualizar() {
    void recargar();
    void recargarHistorial();
    void recargarFrecuentes();
  }

  function agregar(producto: {
    id: string;
    nombre: string;
    precio: number;
    stock: number;
    unidadMedida: string;
    porPeso: boolean;
    balanza?: { cantidad: number };
  }) {
    // Un producto por peso arranca en un kilo y otro en una unidad. Es lo que
    // hace que agregarlo de nuevo sume "otro kilo" y no "otro gramo", que sería
    // inútil; y un kilo es el número que más veces hay que corregir menos.
    // La etiqueta de la balanza ya dice cuánto trae el paquete.
    const paso = producto.balanza?.cantidad ?? (producto.porPeso ? 1000 : 1);

    setItems((previos) => {
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
    });
  }

  /**
   * Lo que pasa cuando el lector lee un código.
   *
   * Pita siempre —agudo si entró, dos graves si no existe— porque quien pasa
   * productos no mira la pantalla en cada uno. Y si no existe lo dice en un
   * aviso: antes la lectura se perdía sin ninguna señal y parecía que el lector
   * no andaba.
   */
  function leido(
    codigo: string,
    producto: Parameters<typeof agregar>[0] | null,
    mensaje: string | null = null
  ) {
    if (producto) {
      agregar(producto);
      pitido("ok");
    } else {
      pitido("error");
      // Se carga ahí mismo, con el nombre buscado en la base mundial. Un
      // código escrito a mano de pocas letras es más un error de tipeo, y uno
      // de 13 que empieza con 2 es de uso interno —la etiqueta de la balanza—:
      // no está en ninguna base, y darlo de alta con ese código no serviría
      // porque el próximo paquete trae otro importe y otro código.
      if (/^\d{8,14}$/.test(codigo) && !/^2\d{12}$/.test(codigo)) setNuevoCodigo(codigo);
      else avisos.error(mensaje ?? `No hay ningún producto con el código ${codigo}.`);
    }
    setLectura({ codigo, producto: producto?.nombre ?? null });
  }

  // El lector se escucha en toda la pantalla, no solo en el buscador: si el
  // cursor quedó en otro lado, la lectura igual entra al carrito.
  useLectorDeCodigos(
    (codigo) =>
      void buscarPorCodigo(codigo).then(({ producto, mensaje }) => leido(codigo, producto, mensaje)),
    Boolean(caja)
  );

  return (
    <Marco
      titulo="Caja"
      descripcion={
        caja
          ? `Turno ${caja.numero}, abierto ${fechaHora(caja.abiertaEn)}${caja.abrio ? ` por ${caja.abrio}` : ""}.`
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
                    {ultima.fiado > 0
                      ? `Venta #${ultima.numero} por ${plata(ultima.total)} · quedan ${plata(ultima.fiado)} fiados` +
                        (ultima.deudaCliente > ultima.fiado
                          ? ` · debe ${plata(ultima.deudaCliente)} en total`
                          : "")
                      : `Venta #${ultima.numero} cobrada por ${plata(ultima.total)}` +
                        (ultima.vuelto > 0 ? ` · vuelto ${plata(ultima.vuelto)}` : "")}
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
                <BuscadorProductos
                  autoFocus
                  onElegir={(producto, porCodigo) =>
                    porCodigo ? leido(producto.codigoBarras ?? producto.sku ?? "", producto) : agregar(producto)
                  }
                  onNoEncontrado={(codigo, mensaje) => leido(codigo, null, mensaje)}
                />

                <Lector lectura={lectura} esDueno={esDueno} />

                {frecuentes && frecuentes.length > 0 && (
                  <AUnToque productos={frecuentes} items={items} onElegir={agregar} />
                )}

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
                        // En un teléfono el renglón se parte en dos: el nombre
                        // ocupa su propia línea y abajo van cantidad e importe.
                        // De una sola línea no baja de 371px y el mostrador
                        // tiene 358: quedaba el precio cortado en "$2..." y el
                        // botón de cobrar fuera de la pantalla.
                        <li
                          key={`${item.productoId}-${indice}`}
                          className="flex flex-wrap items-center gap-2 border-b border-linea px-3 py-2.5 last:border-0 sm:py-2"
                        >
                          {/* `w-full` es lo que fuerza el corte: empuja al
                              resto a la línea de abajo sin envolverlo en otro
                              div. De `sm` para arriba vuelve a ser una línea. */}
                          <span className="w-full min-w-0 sm:w-auto sm:flex-1">
                            <span className="block truncate">{item.nombre}</span>
                            <span className="block text-chico text-tinta-suave">
                              {plata(item.precio)}
                              {item.porPeso ? " el kilo" : ""} · quedan{" "}
                              {cantidadEscrita(item.stock, item.porPeso)}
                            </span>
                          </span>

                          <div className="flex items-center rounded border border-linea-fuerte">
                            <button
                              type="button"
                              aria-label="Uno menos"
                              className="px-3 py-1.5 text-tinta-suave hover:text-tinta sm:px-2"
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
                            {/* En gramos si es por peso: es lo que muestra la
                                balanza, así se teclea lo que se lee sin
                                convertir nada. El campo es más ancho porque
                                "1250" no entra donde entraba "2".

                                `min-w-0` no es decorativo: un <input> adentro de
                                un flex trae `min-width: auto`, que se resuelve
                                al ancho de unos veinte caracteres —158px acá—
                                y pisa al `w-16`. Era la mitad de lo que no
                                dejaba achicar el renglón. */}
                            <input
                              className={cn(
                                "min-w-0 border-x border-linea-fuerte py-2.5 text-center text-base tabular-nums focus:outline-none sm:py-1.5",
                                item.porPeso ? "w-16" : "w-12"
                              )}
                              inputMode="numeric"
                              aria-label={
                                item.porPeso ? `Gramos de ${item.nombre}` : `Cantidad de ${item.nombre}`
                              }
                              value={item.cantidad === 0 ? "" : item.cantidad}
                              onChange={(e) =>
                                setItems((previos) =>
                                  previos.map((i, x) =>
                                    x === indice
                                      ? { ...i, cantidad: enteroEscrito(e.target.value, i.cantidad) }
                                      : i
                                  )
                                )
                              }
                            />
                            <button
                              type="button"
                              aria-label={item.porPeso ? "Cien gramos más" : "Uno más"}
                              className="px-3 py-1.5 text-tinta-suave hover:text-tinta sm:px-2"
                              onClick={() =>
                                setItems((previos) =>
                                  previos.map((i, x) =>
                                    x === indice
                                      ? { ...i, cantidad: i.cantidad + (i.porPeso ? 100 : 1) }
                                      : i
                                  )
                                )
                              }
                            >
                              <Icono nombre="mas" tamano={14} />
                            </button>
                          </div>

                          <span
                            className={cn(
                              // `ml-auto` lo manda contra el borde derecho en la
                              // línea de abajo; en una sola línea no hace nada,
                              // porque el nombre ya se queda con el espacio.
                              "cifra ml-auto text-right font-medium sm:w-24 sm:shrink-0",
                              excede && "text-alerta-texto"
                            )}
                          >
                            {plata(importeRenglon(item.precio, item.cantidad, item.porPeso))}
                          </span>

                          <button
                            type="button"
                            aria-label={`Quitar ${item.nombre}`}
                            className="p-2.5 text-tinta-suave hover:text-alerta-texto sm:p-1"
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
                      disabled={!puedeCobrar}
                      onClick={() => setCobrando(true)}
                    >
                      Cobrar
                      <Tecla clara>F2</Tecla>
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
                          {llevado(venta.unidades, venta.gramos, true)}
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

          {nuevoCodigo && (
            <DialogoAlta
              codigo={nuevoCodigo}
              verCosto={esDueno}
              onCerrar={() => setNuevoCodigo(null)}
              onCreado={(producto) => {
                setNuevoCodigo(null);
                agregar(producto);
                setLectura({ codigo: producto.codigoBarras ?? "", producto: producto.nombre });
              }}
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
          renglonesSinCobrar={items.length}
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

/**
 * Lo que más se vende, a un toque.
 *
 * El pan, la bolsa, el cigarrillo suelto: lo que se pide diez veces por hora
 * no debería necesitar el buscador, y muchas veces no tiene código de barras
 * que pasar. Salen de las ventas del último mes, así que se acomodan solos a
 * lo que se vende en cada negocio.
 *
 * El número azul dice cuánto ya hay en el carrito: tocar dos veces por error
 * se ve enseguida, sin tener que bajar hasta la lista.
 */
function AUnToque({
  productos,
  items,
  onElegir,
}: {
  productos: ProductoBuscado[];
  items: ItemCobro[];
  onElegir: (producto: ProductoBuscado) => void;
}) {
  return (
    <div>
      <p className="etiqueta-campo mb-2">A un toque</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {productos.map((producto) => {
          const enCarrito = items.find((i) => i.productoId === producto.id);
          const agotado = producto.stock <= 0;
          return (
            <button
              key={producto.id}
              type="button"
              disabled={agotado}
              onClick={() => onElegir(producto)}
              title={producto.nombre}
              className={cn(
                // En el teléfono van cuatro: ocho botones empujaban el carrito
                // fuera de la pantalla.
                "group relative flex min-h-[58px] flex-col justify-between gap-1 rounded-md border px-3 py-2 text-left transition-all duration-200 ease-suave max-sm:[&:nth-child(n+5)]:hidden",
                "active:scale-[0.97] disabled:opacity-45",
                enCarrito
                  ? "border-acento/30 bg-acento-suave"
                  : "border-linea bg-lienzo/70 hover:border-acento/30 hover:bg-acento-suave/60"
              )}
            >
              <span className="line-clamp-2 pr-5 text-chico font-medium leading-[17px] text-tinta">
                {producto.nombre}
              </span>
              <span className="cifra text-micro text-tinta-suave">
                {agotado ? "sin stock" : `${plata(producto.precio)}${producto.porPeso ? " el kilo" : ""}`}
              </span>
              {enCarrito && (
                <span className="cifra absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] animate-entrar items-center justify-center rounded-full bg-acento px-1 text-[10.5px] font-semibold text-white shadow-acento">
                  {producto.porPeso ? cantidadEscrita(enCarrito.cantidad, true) : numero(enCarrito.cantidad)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
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
                {/* Abrió uno y cerró otro es lo normal en un negocio con dos
                    turnos, y es justo lo que hay que poder mirar cuando el
                    arqueo no cuadra. */}
                {caja.abrio || caja.cerro ? (
                  <span className="block">
                    {caja.abrio ? `abrió ${caja.abrio}` : ""}
                    {caja.abrio && caja.cerro && caja.cerro !== caja.abrio ? " · " : ""}
                    {caja.cerro && caja.cerro !== caja.abrio ? `cerró ${caja.cerro}` : ""}
                  </span>
                ) : null}
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
                  : "border-linea-fuerte/70 bg-papel text-tinta-media shadow-boton hover:bg-contraste/[0.025]"
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

/**
 * El recuadro del lector de códigos, debajo del buscador.
 *
 * Dice que el lector está escuchando —y que no hace falta tocar el buscador
 * para usarlo— y qué fue lo último que leyó. Si el código no existe, el dueño
 * tiene a mano cargarlo en Productos con el código ya puesto.
 */
function Lector({
  lectura,
  esDueno,
}: {
  lectura: { codigo: string; producto: string | null } | null;
  esDueno: boolean;
}) {
  const noExiste = lectura !== null && lectura.producto === null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2 text-chico",
        noExiste ? "border-alerta-linea bg-alerta-fondo" : "border-dashed border-linea-fuerte"
      )}
      aria-live="polite"
    >
      <Icono
        nombre="codigo"
        tamano={18}
        className={noExiste ? "text-alerta-texto" : "text-acento"}
      />
      <span className="min-w-0 flex-1">
        {lectura === null ? (
          <>
            <span className="font-medium text-tinta">Lector de códigos listo.</span>{" "}
            <span className="text-tinta-suave">
              Pasá el producto por el lector en cualquier momento: no hace falta tocar el buscador.
            </span>
          </>
        ) : lectura.producto ? (
          <span className="text-tinta-media">
            Leído: <span className="font-medium text-tinta">{lectura.producto}</span>
            {lectura.codigo && <span className="cifra text-tinta-suave"> · {lectura.codigo}</span>}
          </span>
        ) : (
          <span className="text-alerta-texto">
            No hay ningún producto con el código <span className="cifra font-medium">{lectura.codigo}</span>.
          </span>
        )}
      </span>
      {/* Una etiqueta de la balanza no se carga como código del producto:
          cada paquete trae otro. El aviso ya dice qué número falta cargar. */}
      {noExiste && esDueno && !/^2\d{12}$/.test(lectura.codigo) && (
        <Link
          href={`/productos?nuevo=1&codigo=${encodeURIComponent(lectura.codigo)}`}
          className="font-medium text-acento-texto hover:underline"
        >
          Cargarlo en Productos
        </Link>
      )}
    </div>
  );
}
