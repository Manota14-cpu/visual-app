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
import { numero, plata, porcentaje } from "@/lib/formato";
import type { Informe } from "@/lib/tipos";

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
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metrica
              rotulo="Vendido"
              valor={plata(datos.ventas.ingreso)}
              pie={`${numero(datos.ventas.pedidos)} ventas · ${numero(datos.ventas.unidades)} unidades`}
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

          {datos.sinCosto.unidades > 0 && (
            <Aviso tono="alerta">
              Se vendieron {numero(datos.sinCosto.unidades)}{" "}
              {datos.sinCosto.unidades === 1 ? "unidad" : "unidades"} por{" "}
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
                        <td className="cifra text-right">{numero(fila.unidades)}</td>
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
              <Hoja titulo="Por dónde vendiste">
                {datos.porCanal.length === 0 ? (
                  <p className="py-4 text-center text-base text-tinta-suave">Sin ventas.</p>
                ) : (
                  <BarrasEtiquetadas
                    datos={datos.porCanal.map((canal) => ({
                      etiqueta: `${canal.canal} · ${numero(canal.pedidos)}`,
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
                          {numero(fila.stock)} {fila.unidadMedida}
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
