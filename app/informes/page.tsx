"use client";

import { useState } from "react";
import { Marco } from "@/components/marco";
import {
  Aviso,
  Cargando,
  CuerpoTabla,
  EncabezadoTabla,
  Etiqueta,
  Hoja,
  Metrica,
  Segmentado,
  Tabla,
  Vacio,
} from "@/components/ui";
import { BarrasEtiquetadas } from "@/components/grafico";
import { useDatos } from "@/lib/datos";
import { cantidadEscrita, llevado, numero, plata, porcentaje } from "@/lib/formato";
import type { Informe } from "@/lib/tipos";

/** Cómo se dice cada canal. En la base se guardan en minúscula y sin acento. */
const NOMBRE_CANAL: Record<string, string> = {
  mostrador: "Mostrador",
  devolucion: "Devoluciones",
  manual: "Carga manual",
};

const PERIODOS = [
  { dias: 7, etiqueta: "7 días" },
  { dias: 30, etiqueta: "30 días" },
  { dias: 90, etiqueta: "90 días" },
  { dias: 0, etiqueta: "Todo" },
];

/**
 * Los números del negocio.
 *
 * El panel dice cómo está el stock hoy; esto dice qué pasó: qué se vendió, qué
 * dejó margen, qué lleva meses quieto y cuánto costó tener abierto.
 */
export default function PaginaInformes() {
  const [dias, setDias] = useState(30);
  const { datos, cargando } = useDatos<Informe>(`/informes?dias=${dias}`);

  return (
    <Marco
      titulo="Informes"
      descripcion="Qué se vendió, con cuánto margen y qué quedó quieto en la estantería."
      acciones={
        <Segmentado
          opciones={PERIODOS.map((p) => ({ valor: p.dias, etiqueta: p.etiqueta }))}
          valor={dias}
          onCambiar={setDias}
        />
      }
    >
      {cargando && !datos && <Cargando filas={8} />}

      {datos && (
        <div className="flex flex-col gap-5">
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metrica
              rotulo="Vendido"
              valor={plata(datos.ventas.ingreso)}
              pie={
                // Lo que se regaló en descuentos va dicho acá, al lado de lo
                // vendido: es de donde sale. Sin esto el dueño no tenía forma
                // de saber cuánta plata se fue en rebajas.
                datos.ventas.descuentos > 0
                  ? `${numero(datos.ventas.pedidos)} ventas · ${plata(datos.ventas.descuentos)} en descuentos`
                  : `${numero(datos.ventas.pedidos)} ventas · ${llevado(datos.ventas.unidades, datos.ventas.gramos)}`
              }
            />
            <Metrica
              rotulo="Costó"
              valor={plata(datos.ventas.costo)}
              pie="Con el costo que tenía cada producto el día que se vendió"
            />
            <Metrica
              rotulo="Margen s/venta"
              valor={porcentaje(datos.ventas.margen)}
              pie={
                datos.ventas.margenCosto === null
                  ? `Ticket promedio ${plata(datos.ventas.ticketPromedio)}`
                  : `${porcentaje(datos.ventas.margenCosto)} sobre el costo · ` +
                    `ticket promedio ${plata(datos.ventas.ticketPromedio)}`
              }
            />
            <Metrica
              rotulo="Resultado"
              valor={datos.resultado === null ? "—" : plata(datos.resultado)}
              pie="Vendido − costo − gastos de tener abierto"
              tono={
                datos.resultado === null ? undefined : datos.resultado >= 0 ? "exito" : "alerta"
              }
            />
          </section>

          {datos.fiado.enElPeriodo > 0 && (
            <Aviso tono="dato">
              {plata(datos.fiado.enElPeriodo)} de lo vendido en el período salió fiado y todavía no
              entró. Vendido no es cobrado: en total hay {plata(datos.fiado.total)} en la calle.
            </Aviso>
          )}

          {(datos.sinCosto.unidades > 0 || datos.sinCosto.gramos > 0) && (
            <Aviso tono="alerta">
              Se vendieron {llevado(datos.sinCosto.unidades, datos.sinCosto.gramos)} por{" "}
              {plata(datos.sinCosto.ingreso)} de productos que no tienen costo cargado. Esa plata
              entra al informe como ganancia pura: el margen y el resultado de arriba están
              exagerados hasta que les cargues el costo.
            </Aviso>
          )}

          {datos.ventasConCostoDudoso > 0 && (
            <Aviso>
              {numero(datos.ventasConCostoDudoso)}{" "}
              {datos.ventasConCostoDudoso === 1 ? "producto vendido tiene" : "productos vendidos tienen"} un
              costo que deja más del 85% de margen. Un número así no suele ser un buen negocio: suele
              ser un costo puesto de relleno, y arrastra el margen de todo el informe.
            </Aviso>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Hoja titulo="Lo que más se vendió" cuerpo="p-0">
              {datos.porProducto.length === 0 ? (
                <Vacio titulo="Sin ventas en el período" />
              ) : (
                <Tabla className="min-w-[540px]">
                  <EncabezadoTabla>
                    <tr>
                      <th>Producto</th>
                      <th className="text-right">Unidades</th>
                      <th className="text-right">Vendido</th>
                      <th className="text-right">Margen s/venta</th>
                    </tr>
                  </EncabezadoTabla>
                  <CuerpoTabla>
                    {datos.porProducto.slice(0, 20).map((fila) => (
                      <tr key={fila.productoId ?? fila.nombre}>
                        <td className="max-w-[280px] truncate">{fila.nombre}</td>
                        <td className="cifra whitespace-nowrap text-right">
                          {cantidadEscrita(fila.unidades, fila.porPeso)}
                        </td>
                        <td className="cifra text-right font-medium">{plata(fila.ingreso)}</td>
                        <td className="text-right">
                          <span className="cifra block text-tinta-suave">
                            {porcentaje(fila.margen)}
                          </span>
                          {fila.margenCosto !== null && (
                            <span className="block text-chico text-tinta-tenue">
                              s/costo {porcentaje(fila.margenCosto)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </CuerpoTabla>
                </Tabla>
              )}
            </Hoja>

            <div className="flex flex-col gap-4">
              {/* Solo tiene sentido con más de una persona: con una sola es
                  repetir el total de arriba con otro nombre. */}
              {datos.porUsuario.length > 1 && (
                <Hoja titulo="Quién vendió" cuerpo="p-0">
                  <ul>
                    {datos.porUsuario.map((u) => (
                      <li
                        key={u.usuario}
                        className="flex items-center justify-between gap-3 border-b border-linea px-4 py-2.5 last:border-0"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{u.usuario}</span>
                          <span className="block truncate text-chico text-tinta-suave">
                            {numero(u.ventas)} {u.ventas === 1 ? "venta" : "ventas"}
                            {u.descuentos > 0 ? ` · ${plata(u.descuentos)} en descuentos` : ""}
                            {u.devoluciones > 0
                              ? ` · ${numero(u.devoluciones)} ${u.devoluciones === 1 ? "devolución" : "devoluciones"} por ${plata(u.devuelto)}`
                              : ""}
                          </span>
                        </span>
                        <span className="cifra shrink-0 font-medium">{plata(u.vendido)}</span>
                      </li>
                    ))}
                  </ul>
                </Hoja>
              )}

              <Hoja titulo="Por dónde vendiste">
                {datos.porCanal.length === 0 ? (
                  <p className="py-4 text-center text-base text-tinta-suave">Sin ventas.</p>
                ) : (
                  <BarrasEtiquetadas
                    datos={datos.porCanal.map((canal) => ({
                      etiqueta: `${NOMBRE_CANAL[canal.canal] ?? canal.canal} · ${numero(canal.pedidos)}`,
                      valor: canal.ingreso,
                    }))}
                    formato={(v) => plata(v)}
                  />
                )}
              </Hoja>

              <Hoja titulo="En qué se gastó">
                {datos.gastos.porCategoria.length === 0 ? (
                  <p className="py-4 text-center text-base text-tinta-suave">
                    No hay gastos anotados en el período.
                  </p>
                ) : (
                  <>
                    <BarrasEtiquetadas
                      datos={datos.gastos.porCategoria.map((g) => ({
                        etiqueta: g.etiqueta,
                        valor: g.total,
                      }))}
                      formato={(v) => plata(v)}
                    />
                    <p className="mt-3 border-t border-linea pt-3 text-chico text-tinta-suave">
                      De {plata(datos.gastos.total)} en total, {plata(datos.gastos.mercaderia)} fueron
                      compras de mercadería. Esa parte no se resta del resultado: son pesos que se
                      cambiaron por stock, y se vuelven costo cuando ese stock se vende.
                    </p>
                  </>
                )}
              </Hoja>
            </div>
          </div>

          <Hoja
            titulo="Capital quieto"
            accion={<Etiqueta tono="neutral">{plata(datos.capitalQuieto)}</Etiqueta>}
            cuerpo="p-0"
          >
            {datos.inmovilizado.length === 0 ? (
              <Vacio
                titulo="Todo se movió"
                detalle="Todos los productos con stock tuvieron alguna venta en el período."
              />
            ) : (
              <>
                <p className="border-b border-linea px-4 py-2.5 text-chico text-tinta-suave">
                  Productos con stock que no se vendieron en el período. Es plata comprada que está
                  ocupando lugar.
                </p>
                <Tabla className="min-w-[560px]">
                  <EncabezadoTabla>
                    <tr>
                      <th>Producto</th>
                      <th>Categoría</th>
                      <th className="text-right">Stock</th>
                      <th className="text-right">Capital</th>
                      <th className="text-right">Sin moverse</th>
                    </tr>
                  </EncabezadoTabla>
                  <CuerpoTabla>
                    {datos.inmovilizado.map((fila) => (
                      <tr key={fila.id}>
                        <td className="max-w-[260px] truncate">{fila.nombre}</td>
                        <td className="text-tinta-suave">{fila.categoria ?? "—"}</td>
                        <td className="cifra text-right">
                          {fila.porPeso ? cantidadEscrita(fila.stock, true) : `${numero(fila.stock)} ${fila.unidadMedida}`}
                        </td>
                        <td className="cifra text-right font-medium">{plata(fila.capital)}</td>
                        <td className="cifra text-right text-tinta-suave">
                          {fila.diasQuieto === null ? "—" : `${numero(fila.diasQuieto)} días`}
                        </td>
                      </tr>
                    ))}
                  </CuerpoTabla>
                </Tabla>
              </>
            )}
          </Hoja>
        </div>
      )}
    </Marco>
  );
}
