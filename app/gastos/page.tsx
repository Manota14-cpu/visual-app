"use client";

import { useMemo, useState } from "react";
import { Marco } from "@/components/marco";
import {
  Area,
  Boton,
  Buscador,
  Campo,
  Cargando,
  Casilla,
  Confirmar,
  CuerpoTabla,
  Dialogo,
  EncabezadoTabla,
  Etiqueta,
  Metrica,
  Selector,
  Tabla,
  Vacio,
} from "@/components/ui";
import { Icono } from "@/components/iconos";
import { BarrasEtiquetadas } from "@/components/grafico";
import { useAvisos } from "@/components/avisos";
import { useDatos, useEspera } from "@/lib/datos";
import { api, consulta, ErrorApi } from "@/lib/api";
import { dia, hoy, leerNumero, numero, plata } from "@/lib/formato";
import { ETIQUETA_PAGO, MEDIOS_PAGO, type Gasto, type RespuestaGastos } from "@/lib/tipos";

export default function PaginaGastos() {
  const avisos = useAvisos();

  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [dias, setDias] = useState("30");

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Gasto | null>(null);
  const [borrando, setBorrando] = useState<Gasto | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const termino = useEspera(busqueda);

  const ruta = useMemo(
    () => `/gastos${consulta({ q: termino, categoria, dias: dias === "0" ? undefined : dias })}`,
    [termino, categoria, dias]
  );

  const { datos, cargando, recargar } = useDatos<RespuestaGastos>(ruta);
  const gastos = datos?.items ?? [];

  async function borrar() {
    if (!borrando) return;
    setTrabajando(true);
    try {
      await api.borrar(`/gastos/${borrando.id}`);
      avisos.exito("Gasto eliminado.");
      setBorrando(null);
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo eliminar.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Marco
      titulo="Gastos"
      descripcion="Lo que sale: proveedores, alquiler, fletes, servicios."
      acciones={
        <Boton tono="principal" icono="mas" onClick={() => setCreando(true)}>
          Anotar gasto
        </Boton>
      }
    >
      <div className="flex flex-col gap-4">
        {datos && (
          <section className="grid gap-3 sm:grid-cols-3">
            <Metrica
              rotulo="Total del período"
              valor={plata(datos.resumen.total)}
              pie={`${numero(datos.resumen.cantidad)} gastos anotados`}
            />
            <Metrica
              rotulo="Costó tener abierto"
              valor={plata(datos.resumen.operativos)}
              pie="Todo menos las compras de mercadería"
            />
            <Metrica
              rotulo="Compra de mercadería"
              valor={plata(datos.resumen.mercaderia)}
              pie="No es pérdida: se convirtió en stock"
            />
          </section>
        )}

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr]">
          <Buscador
            placeholder="Buscar por concepto, proveedor o comprobante"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <Selector value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
            <option value="todas">Todas las categorías</option>
            {(datos?.categorias ?? []).map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </Selector>
          <Selector value={dias} onChange={(e) => setDias(e.target.value)} aria-label="Período">
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="365">Último año</option>
            <option value="0">Todos</option>
          </Selector>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <div className="hoja overflow-hidden">
            {cargando && !datos ? (
              <Cargando filas={8} />
            ) : gastos.length === 0 ? (
              <Vacio
                titulo="No hay gastos anotados"
                detalle="Anotá lo que pagás y el informe va a poder decirte si el mes cerró bien."
                accion={
                  <Boton tono="principal" icono="mas" onClick={() => setCreando(true)}>
                    Anotar gasto
                  </Boton>
                }
              />
            ) : (
              <Tabla className="min-w-[680px]">
                <EncabezadoTabla>
                  <tr>
                    <th className="w-28">Fecha</th>
                    <th>Concepto</th>
                    <th>Categoría</th>
                    <th className="text-right">Monto</th>
                    <th className="w-20" />
                  </tr>
                </EncabezadoTabla>

                <CuerpoTabla>
                  {gastos.map((gasto) => (
                    <tr key={gasto.id} className="transition-colors hover:bg-contraste/[0.02]">
                      <td className="whitespace-nowrap text-tinta-suave">{dia(gasto.fecha)}</td>
                      <td className="max-w-[280px]">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left font-medium hover:underline"
                          onClick={() => setEditando(gasto)}
                        >
                          {gasto.concepto}
                        </button>
                        <span className="block truncate text-chico text-tinta-suave">
                          {[
                            gasto.proveedor,
                            ETIQUETA_PAGO[gasto.metodoPago] ?? gasto.metodoPago,
                            gasto.cajaNumero ? `salió del turno ${gasto.cajaNumero}` : null,
                            gasto.comprobante,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </td>
                      <td>
                        <Etiqueta tono={gasto.enResultado ? "neutral" : "dato"}>{gasto.etiqueta}</Etiqueta>
                      </td>
                      <td className="cifra text-right font-medium">{plata(gasto.monto)}</td>
                      <td>
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            title="Editar"
                            aria-label={`Editar ${gasto.concepto}`}
                            className="rounded p-1.5 text-tinta-suave transition-colors hover:bg-contraste/[0.05] hover:text-tinta"
                            onClick={() => setEditando(gasto)}
                          >
                            <Icono nombre="editar" tamano={16} />
                          </button>
                          <button
                            type="button"
                            title="Eliminar"
                            aria-label={`Eliminar ${gasto.concepto}`}
                            className="rounded p-1.5 text-tinta-suave transition-colors hover:bg-contraste/[0.05] hover:text-alerta-texto"
                            onClick={() => setBorrando(gasto)}
                          >
                            <Icono nombre="borrar" tamano={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </CuerpoTabla>
              </Tabla>
            )}

            {/* La lista trae los 400 más recientes, pero los totales de arriba
                cuentan todo el período: sin este renglón, las dos cosas se
                contradicen y no hay forma de saber cuál miente. */}
            {datos && gastos.length < datos.resumen.cantidad && (
              <p className="border-t border-linea px-4 py-3 text-chico text-tinta-suave">
                Se muestran los {numero(gastos.length)} más recientes de{" "}
                {numero(datos.resumen.cantidad)}. Los totales de arriba cuentan todos. Acotá el
                período o la categoría para ver el resto.
              </p>
            )}
          </div>

          {datos && datos.resumen.porCategoria.length > 0 && (
            <div className="hoja p-4">
              <h2 className="mb-3 font-titulo text-medio">En qué se fue</h2>
              <BarrasEtiquetadas
                datos={datos.resumen.porCategoria.map((c) => ({
                  etiqueta: datos.categorias.find((x) => x.valor === c.categoria)?.etiqueta ?? c.categoria,
                  valor: c.total,
                }))}
                formato={(v) => plata(v)}
              />
            </div>
          )}
        </div>
      </div>

      {(creando || editando !== null) && (
        <DialogoGasto
          key={editando?.id ?? "nuevo"}
          abierto
          gasto={editando}
          categorias={datos?.categorias ?? []}
          cajaAbierta={datos?.cajaAbierta ?? null}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
          onGuardado={() => void recargar()}
        />
      )}

      <Confirmar
        abierto={borrando !== null}
        titulo="Eliminar gasto"
        detalle={
          borrando
            ? borrando.cajaId
              ? `Se elimina el gasto y también el retiro que dejó en el turno ${borrando.cajaNumero}.`
              : `${borrando.concepto} deja de contar en los informes.`
            : ""
        }
        confirmar="Eliminar"
        peligroso
        trabajando={trabajando}
        onCerrar={() => setBorrando(null)}
        onConfirmar={() => void borrar()}
      />
    </Marco>
  );
}

interface Formulario {
  fecha: string;
  categoria: string;
  concepto: string;
  monto: string;
  metodoPago: string;
  proveedor: string;
  comprobante: string;
  notas: string;
  deLaCaja: boolean;
}

/**
 * Anotar o corregir un gasto.
 *
 * Si se paga con la plata del cajón, el gasto deja además su retiro en el
 * turno abierto: sin eso, el cierre marcaría un faltante por una plata que sí
 * se sabe dónde fue.
 */
function DialogoGasto({
  abierto,
  gasto,
  categorias,
  cajaAbierta,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  gasto: Gasto | null;
  categorias: { valor: string; etiqueta: string }[];
  cajaAbierta: { id: string; numero: number } | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const avisos = useAvisos();

  // El diálogo se monta al abrirse, así que el formulario se llena una sola vez
  // con el gasto que se está editando —o con los valores de un gasto nuevo— y
  // nada lo pisa mientras se escribe.
  const [datos, setDatos] = useState<Formulario>(() =>
    gasto
      ? {
          fecha: gasto.fecha,
          categoria: gasto.categoria,
          concepto: gasto.concepto,
          monto: String(gasto.monto),
          metodoPago: gasto.metodoPago,
          proveedor: gasto.proveedor ?? "",
          comprobante: gasto.comprobante ?? "",
          notas: gasto.notas ?? "",
          deLaCaja: gasto.cajaId !== null,
        }
      : {
          fecha: hoy(),
          categoria: "mercaderia",
          concepto: "",
          monto: "",
          metodoPago: "efectivo",
          proveedor: "",
          comprobante: "",
          notas: "",
          deLaCaja: false,
        }
  );
  const [guardando, setGuardando] = useState(false);

  const campo = (clave: keyof Formulario) => ({
    value: String(datos[clave]),
    onChange: (e: { target: { value: string } }) =>
      setDatos((previo) => ({ ...previo, [clave]: e.target.value })),
  });

  // Solo el efectivo vacía el cajón: una transferencia no lo toca, y
  // descontarla del arqueo haría que el cierre diera de menos.
  const puedeSalirDeCaja = cajaAbierta !== null && datos.metodoPago === "efectivo";

  async function guardar() {
    setGuardando(true);
    try {
      const cuerpo = {
        fecha: datos.fecha,
        categoria: datos.categoria,
        concepto: datos.concepto,
        monto: Math.round(leerNumero(datos.monto) ?? 0),
        metodoPago: datos.metodoPago,
        proveedor: datos.proveedor,
        comprobante: datos.comprobante,
        notas: datos.notas,
        cajaId: puedeSalirDeCaja && datos.deLaCaja ? cajaAbierta!.id : null,
      };

      if (gasto) await api.put(`/gastos/${gasto.id}`, cuerpo);
      else await api.post("/gastos", cuerpo);

      avisos.exito(gasto ? "Gasto actualizado." : "Gasto anotado.");
      onGuardado();
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar el gasto.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={gasto ? "Editar gasto" : "Anotar gasto"}
      pie={
        <>
          <Boton onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton tono="principal" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo etiqueta="Qué se pagó" placeholder="Compra a Plásticos del Litoral" autoFocus {...campo("concepto")} />

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Monto" inputMode="decimal" placeholder="0" {...campo("monto")} />
          <Campo etiqueta="Fecha" type="date" max={hoy()} {...campo("fecha")} />
          <Selector etiqueta="Categoría" {...campo("categoria")}>
            {categorias.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </Selector>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Selector etiqueta="Cómo se pagó" {...campo("metodoPago")}>
            {MEDIOS_PAGO.map((medio) => (
              <option key={medio} value={medio}>
                {ETIQUETA_PAGO[medio]}
              </option>
            ))}
          </Selector>
          <Campo etiqueta="Proveedor" placeholder="Opcional" {...campo("proveedor")} />
          <Campo etiqueta="Comprobante" placeholder="N° de factura" {...campo("comprobante")} />
        </div>

        {puedeSalirDeCaja && (
          <Casilla
            checked={datos.deLaCaja}
            onChange={(e) => setDatos((previo) => ({ ...previo, deLaCaja: e.target.checked }))}
            etiqueta={
              <span>
                Salió de la plata del turno {cajaAbierta!.numero}
                <span className="block text-chico text-tinta-suave">
                  Deja el retiro anotado, así el cierre cuadra.
                </span>
              </span>
            }
          />
        )}

        {gasto?.cajaId && !gasto.cajaAbierta && (
          <p className="rounded border border-linea bg-lienzo px-3 py-2 text-chico text-tinta-suave">
            Este gasto salió de un turno ya cerrado. Su arqueo lo contó, así que no se puede
            modificar: anotá el ajuste como un gasto nuevo.
          </p>
        )}

        <Area etiqueta="Notas" placeholder="Opcional" {...campo("notas")} />
      </div>
    </Dialogo>
  );
}
