"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Marco } from "@/components/marco";
import {
  Boton,
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
import { fechaHora, numero, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ETIQUETA_PAGO, type PaginaPedidos, type Pedido } from "@/lib/tipos";
import { DialogoVenta } from "./dialogo-venta";

const TONO_ESTADO: Record<string, "neutral" | "exito" | "aviso" | "alerta" | "dato"> = {
  pendiente: "aviso",
  preparando: "dato",
  entregado: "exito",
  cancelado: "alerta",
};

export default function PaginaVentas() {
  return (
    <Suspense fallback={<Marco titulo="Ventas"><Cargando filas={8} /></Marco>}>
      <Ventas />
    </Suspense>
  );
}

function Ventas() {
  const parametros = useSearchParams();

  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState(parametros.get("estado") ?? "todos");
  const [canal, setCanal] = useState("todos");
  const [dias, setDias] = useState("0");
  const [pagina, setPagina] = useState(1);
  const [abierta, setAbierta] = useState<Pedido | null>(null);

  const termino = useEspera(busqueda);

  const ruta = useMemo(
    () =>
      `/pedidos${consulta({
        q: termino,
        estado,
        canal,
        dias: dias === "0" ? undefined : dias,
        pagina,
        porPagina: 25,
      })}`,
    [termino, estado, canal, dias, pagina]
  );

  const { datos, cargando, recargar } = useDatos<PaginaPedidos>(ruta);


  const ventas = datos?.items ?? [];

  /** Cambiar un filtro vuelve a la primera página: la 7 ya no existe. */
  function filtrar(aplicar: () => void) {
    aplicar();
    setPagina(1);
  }

  return (
    <Marco
      titulo="Ventas"
      descripcion="Todo lo que salió: el mostrador, los pedidos y las devoluciones."
      acciones={
        <Boton icono="recargar" onClick={() => void recargar()}>
          Actualizar
        </Boton>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]">
          <Buscador
            placeholder="Buscar por número, cliente o producto"
            value={busqueda}
            onChange={(e) => filtrar(() => setBusqueda(e.target.value))}
          />
          <Selector value={estado} onChange={(e) => filtrar(() => setEstado(e.target.value))} aria-label="Estado">
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="preparando">Preparando</option>
            <option value="entregado">Entregadas</option>
            <option value="cancelado">Canceladas</option>
          </Selector>
          <Selector value={canal} onChange={(e) => filtrar(() => setCanal(e.target.value))} aria-label="Canal">
            <option value="todos">Todos los canales</option>
            <option value="mostrador">Mostrador</option>
            <option value="devolucion">Devoluciones</option>
            <option value="manual">Cargadas a mano</option>
          </Selector>
          <Selector value={dias} onChange={(e) => filtrar(() => setDias(e.target.value))} aria-label="Período">
            <option value="0">Desde el principio</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </Selector>
        </div>

        <div className="hoja overflow-hidden">
          {cargando && !datos ? (
            <Cargando filas={8} />
          ) : ventas.length === 0 ? (
            <Vacio
              titulo="No hay ventas para mostrar"
              detalle={
                termino ? `Nada coincide con «${termino}».` : "Cobrá una venta desde la caja y va a aparecer acá."
              }
            />
          ) : (
            <>
              <Tabla className="min-w-[760px]">
                <EncabezadoTabla>
                  <tr>
                    <th className="w-16">N°</th>
                    <th>Cliente</th>
                    <th>Cuándo</th>
                    <th>Pago</th>
                    <th className="text-right">Unidades</th>
                    <th className="text-right">Total</th>
                    <th className="w-28">Estado</th>
                  </tr>
                </EncabezadoTabla>

                <CuerpoTabla>
                  {ventas.map((venta) => (
                    <tr
                      key={venta.id}
                      onClick={() => setAbierta(venta)}
                      className="cursor-pointer transition-colors hover:bg-black/[0.02]"
                    >
                      <td className="cifra text-tinta-suave">#{venta.numero}</td>
                      <td className="max-w-[260px]">
                        <span className="block truncate font-medium">{venta.nombre}</span>
                        <span className="block truncate text-chico text-tinta-suave">
                          {venta.canal}
                          {venta.cajaNumero ? ` · turno ${venta.cajaNumero}` : ""}
                          {venta.items.length > 0 ? ` · ${venta.items[0]!.nombre}` : ""}
                          {venta.items.length > 1 ? ` +${venta.items.length - 1}` : ""}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-tinta-suave">{fechaHora(venta.creadoEn)}</td>
                      <td className="whitespace-nowrap text-tinta-suave">
                        {venta.metodoPago ? ETIQUETA_PAGO[venta.metodoPago] ?? venta.metodoPago : "—"}
                      </td>
                      <td className="cifra text-right text-tinta-suave">{numero(venta.unidades)}</td>
                      <td
                        className={cn(
                          "cifra text-right font-medium",
                          venta.total < 0 && "text-alerta-texto"
                        )}
                      >
                        {plata(venta.total)}
                      </td>
                      <td>
                        <Etiqueta tono={TONO_ESTADO[venta.estado] ?? "neutral"}>{venta.estado}</Etiqueta>
                      </td>
                    </tr>
                  ))}
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

      {/* Se monta al abrir una venta y se desmonta al cerrarla: el borrador de
          edición nace con los renglones de esa venta y no sobrevive al cierre. */}
      {abierta && (
        <DialogoVenta
          key={abierta.id}
          pedido={abierta}
          onCerrar={() => setAbierta(null)}
          onCambio={() => void recargar()}
        />
      )}
    </Marco>
  );
}
