"use client";

import { useMemo, useState } from "react";
import { Marco } from "@/components/marco";
import {
  Buscador,
  Cargando,
  CuerpoTabla,
  EncabezadoTabla,
  Etiqueta,
  Paginacion,
  Selector,
  Tabla,
  Vacio,
} from "@/components/ui";
import { useDatos, useEspera } from "@/lib/datos";
import { consulta } from "@/lib/api";
import { cantidadEscrita, fechaHora } from "@/lib/formato";
import type { PaginaMovimientos } from "@/lib/tipos";

const ETIQUETA_TIPO: Record<string, string> = {
  creacion: "Carga inicial",
  entrada: "Entrada",
  salida: "Salida",
  venta: "Venta",
  devolucion: "Devolución",
  ajuste: "Ajuste",
};

const SUMAN = new Set(["creacion", "entrada", "devolucion"]);

/**
 * El historial de stock.
 *
 * Es la pantalla que contesta "¿por qué hay 14 y no 20?". Cada renglón dice
 * cuánto se movió, con qué motivo y con cuánto quedó el producto — esa última
 * columna es la que permite auditar sin recalcular nada.
 */
export default function PaginaMovimientos() {
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [dias, setDias] = useState("30");
  const [pagina, setPagina] = useState(1);

  const termino = useEspera(busqueda);

  const ruta = useMemo(
    () =>
      `/movimientos${consulta({
        q: termino,
        tipo,
        dias: dias === "0" ? undefined : dias,
        pagina,
        porPagina: 40,
      })}`,
    [termino, tipo, dias, pagina]
  );

  const { datos, cargando } = useDatos<PaginaMovimientos>(ruta);


  const movimientos = datos?.items ?? [];

  /** Cambiar un filtro vuelve a la primera página: la 7 ya no existe. */
  function filtrar(aplicar: () => void) {
    aplicar();
    setPagina(1);
  }

  return (
    <Marco
      titulo="Movimientos"
      descripcion="Todo lo que entró y salió del depósito, con su motivo."
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr]">
          <Buscador
            placeholder="Buscar por producto o motivo"
            value={busqueda}
            onChange={(e) => filtrar(() => setBusqueda(e.target.value))}
          />
          <Selector value={tipo} onChange={(e) => filtrar(() => setTipo(e.target.value))} aria-label="Tipo">
            <option value="todos">Todos los tipos</option>
            {Object.entries(ETIQUETA_TIPO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Selector>
          <Selector value={dias} onChange={(e) => filtrar(() => setDias(e.target.value))} aria-label="Período">
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="0">Desde el principio</option>
          </Selector>
        </div>

        <div className="hoja overflow-hidden">
          {cargando && !datos ? (
            <Cargando filas={10} />
          ) : movimientos.length === 0 ? (
            <Vacio
              titulo="Sin movimientos"
              detalle={
                termino
                  ? `Nada coincide con «${termino}».`
                  : "Cuando cargues stock o cobres una venta, cada cambio va a quedar acá."
              }
            />
          ) : (
            <>
              <Tabla className="min-w-[700px]">
                <EncabezadoTabla>
                  <tr>
                    <th className="w-40">Cuándo</th>
                    <th>Producto</th>
                    <th className="w-32">Tipo</th>
                    <th className="text-right">Cantidad</th>
                    <th className="text-right">Quedó en</th>
                    <th>Motivo</th>
                  </tr>
                </EncabezadoTabla>

                <CuerpoTabla>
                  {movimientos.map((movimiento) => {
                    const suma = SUMAN.has(movimiento.tipo);
                    return (
                      <tr key={movimiento.id} className="transition-colors hover:bg-contraste/[0.02]">
                        <td className="whitespace-nowrap text-tinta-suave">
                          {fechaHora(movimiento.creadoEn)}
                        </td>
                        <td className="max-w-[240px]">
                          <span className="block truncate font-medium">{movimiento.producto}</span>
                          {movimiento.sku && (
                            <span className="block text-chico text-tinta-suave">{movimiento.sku}</span>
                          )}
                        </td>
                        <td>
                          <Etiqueta tono={suma ? "exito" : "neutral"}>
                            {ETIQUETA_TIPO[movimiento.tipo] ?? movimiento.tipo}
                          </Etiqueta>
                        </td>
                        <td
                          className={
                            suma
                              ? "cifra text-right font-medium text-exito-texto"
                              : "cifra text-right font-medium text-alerta-texto"
                          }
                        >
                          {suma ? "+" : "−"}
                          {cantidadEscrita(movimiento.cantidad, movimiento.porPeso)}
                        </td>
                        <td className="cifra text-right text-tinta-suave">
                          {cantidadEscrita(movimiento.stockResultante, movimiento.porPeso)}
                        </td>
                        <td className="max-w-[260px] text-tinta-suave">
                          <span className="block truncate">{movimiento.motivo ?? "—"}</span>
                          {/* Quién lo hizo, debajo y en chico: importa cuando
                              algo no cierra, no cuando se lee de corrido. */}
                          {movimiento.usuario && (
                            <span className="block truncate text-chico text-tinta-tenue">
                              {movimiento.usuario}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </CuerpoTabla>
              </Tabla>

              <Paginacion
                pagina={datos!.pagina}
                porPagina={datos!.porPagina}
                total={datos!.total}
                onCambiar={setPagina}
              />
            </>
          )}
        </div>
      </div>
    </Marco>
  );
}
