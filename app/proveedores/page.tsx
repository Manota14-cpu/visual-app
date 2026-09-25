"use client";

import { useState } from "react";
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
import { useAvisos } from "@/components/avisos";
import { useDatos, useEspera } from "@/lib/datos";
import { api, consulta, ErrorApi } from "@/lib/api";
import { comoDiaLocal, dia, hace, numero, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Pagina, Proveedor } from "@/lib/tipos";
import { DialogoProveedor } from "./dialogo-proveedor";
import { DialogoCuentaProveedor } from "./dialogo-cuenta";
import { DialogoCompra } from "./dialogo-compra";
import { DialogoPrecios } from "../productos/dialogo-precios";

/**
 * A quién le compra el negocio y cuánto le debe.
 *
 * Es el espejo de Clientes. Esa pantalla contesta "cuánto me deben"; esta
 * contesta "cuánto debo", que es la mitad del cuadro que faltaba: hasta ahora
 * el proveedor era un campo de texto suelto adentro de un gasto.
 *
 * La lista viene ordenada por deuda, de mayor a menor. Es el orden en que a
 * alguien le importa mirarla: el que reclama es el que más espera.
 */
export default function PaginaProveedores() {
  const avisos = useAvisos();

  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("activos");
  const [pagina, setPagina] = useState(1);
  const termino = useEspera(busqueda, 250);

  const { datos, cargando, recargar } = useDatos<Pagina<Proveedor> & { deudaTotal: number }>(
    `/proveedores${consulta({ q: termino, estado, pagina })}`
  );

  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [creando, setCreando] = useState(false);
  const [mirando, setMirando] = useState<Proveedor | null>(null);
  // "nueva" es cargar una compra sin haber elegido proveedor todavía; un
  // proveedor concreto es cargarle una a ese. Null es que no hay nada abierto.
  const [comprando, setComprando] = useState<Proveedor | "nueva" | null>(null);
  // El aumento de la lista de un proveedor: sus productos, todos juntos.
  const [aumentando, setAumentando] = useState<{ proveedor: Proveedor; ids: string[] } | null>(null);

  async function aumento(p: Proveedor) {
    try {
      const suyos = await api.get<{ id: string }[]>(`/proveedores/${p.id}/productos`);
      if (suyos.length === 0) {
        avisos.error(
          `${p.nombre} no tiene productos asignados. En Productos, filtrá «Sin proveedor», elegí los suyos y usá «Asignar proveedor».`
        );
        return;
      }
      setAumentando({ proveedor: p, ids: suyos.map((x) => x.id) });
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudieron traer sus productos.");
    }
  }

  async function restaurar(p: Proveedor) {
    try {
      await api.post(`/proveedores/${p.id}/restaurar`);
      avisos.exito(`${p.nombre} volvió a la lista.`);
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo.");
    }
  }

  async function archivar(p: Proveedor) {
    try {
      await api.borrar(`/proveedores/${p.id}`);
      avisos.exito(`${p.nombre} quedó archivado.`);
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo archivar.");
    }
  }

  return (
    <Marco
      titulo="Proveedores"
      descripcion="A quién le comprás, qué te trajo y cuánto le debés."
      acciones={
        <>
          <Boton icono="mas" onClick={() => setCreando(true)}>
            Proveedor nuevo
          </Boton>
          <Boton tono="principal" icono="gastos" onClick={() => setComprando("nueva")}>
            Cargar compra
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Lo primero que hay que ver: el total. Un proveedor de a uno no dice
            si el negocio está al día o debiendo dos meses de harina. */}
        {datos && datos.deudaTotal > 0 && (
          <div className="hoja flex flex-wrap items-baseline justify-between gap-3 px-4 py-3">
            <span className="etiqueta-campo">Le debés a tus proveedores</span>
            <span className="cifra font-titulo text-cifra text-alerta-texto">
              {plata(datos.deudaTotal)}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <span className="min-w-[220px] flex-1">
            <Buscador
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPagina(1);
              }}
              placeholder="Buscar por nombre, CUIT o teléfono"
            />
          </span>
          <Selector
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setPagina(1);
            }}
          >
            <option value="activos">Activos</option>
            <option value="eliminados">Archivados</option>
            <option value="todos">Todos</option>
          </Selector>
        </div>

        {cargando && !datos && <Cargando filas={6} />}

        {datos && datos.items.length === 0 && (
          <Vacio
            titulo="Sin proveedores"
            detalle="Cargá a quién le comprás para llevar la cuenta de lo que le debés."
          />
        )}

        {datos && datos.items.length > 0 && (
          <div className="hoja p-0">
            <Tabla className="min-w-[800px]">
              <EncabezadoTabla>
                <tr>
                  <th>Proveedor</th>
                  <th>Última compra</th>
                  <th className="text-right">Productos</th>
                  <th className="text-right">Compras</th>
                  <th className="text-right">Debés</th>
                  <th className="w-72" />
                </tr>
              </EncabezadoTabla>
              <CuerpoTabla>
                {datos.items.map((p) => (
                  <tr key={p.id} className="border-b border-linea last:border-0">
                    <td>
                      <button
                        type="button"
                        onClick={() => setMirando(p)}
                        className="block max-w-full truncate text-left font-medium hover:text-acento"
                      >
                        {p.nombre}
                      </button>
                      <span className="block truncate text-chico text-tinta-suave">
                        {[p.telefono, p.cuit].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-tinta-suave">
                      {/* `dia` y no `fecha`: es un día del calendario, y leerlo como
                          instante lo corre uno para atrás en Argentina. */}
                      {p.ultimaCompra
                        ? `${dia(p.ultimaCompra)} · ${hace(comoDiaLocal(p.ultimaCompra))}`
                        : "—"}
                    </td>
                    <td className="cifra text-right text-tinta-suave">{p.productos ? numero(p.productos) : "—"}</td>
                    <td className="cifra text-right text-tinta-suave">{numero(p.compras)}</td>
                    <td
                      className={cn(
                        "cifra text-right font-medium",
                        p.deuda > 0 && "text-alerta-texto"
                      )}
                    >
                      {p.deuda > 0 ? plata(p.deuda) : "—"}
                    </td>
                    <td className="text-right">
                      <span className="flex flex-wrap justify-end gap-1.5">
                        {p.activo ? (
                          <>
                            <Boton chico onClick={() => setComprando(p)}>
                              Compra
                            </Boton>
                            <Boton
                              chico
                              onClick={() => void aumento(p)}
                              title="Aplicar el aumento de su lista a todos sus productos"
                            >
                              Aumento
                            </Boton>
                            <Boton chico icono="editar" onClick={() => setEditando(p)}>
                              Editar
                            </Boton>
                            <Boton chico onClick={() => void archivar(p)}>
                              Archivar
                            </Boton>
                          </>
                        ) : (
                          <>
                            <Etiqueta tono="neutral">archivado</Etiqueta>
                            <Boton chico icono="recargar" onClick={() => void restaurar(p)}>
                              Restaurar
                            </Boton>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </CuerpoTabla>
            </Tabla>

            <Paginacion
              pagina={datos.pagina}
              porPagina={datos.porPagina}
              total={datos.total}
              onCambiar={setPagina}
            />
          </div>
        )}
      </div>

      {(creando || editando) && (
        <DialogoProveedor
          proveedor={editando}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
          onGuardado={async () => {
            setCreando(false);
            setEditando(null);
            await recargar();
          }}
        />
      )}

      {mirando && (
        <DialogoCuentaProveedor
          proveedor={mirando}
          onCerrar={() => setMirando(null)}
          onCambio={() => void recargar()}
        />
      )}

      {aumentando && (
        <DialogoPrecios
          abierto
          ids={aumentando.ids}
          titulo={`Aumento de ${aumentando.proveedor.nombre}`}
          motivoInicial={`Aumento de lista de ${aumentando.proveedor.nombre}`}
          onCerrar={() => setAumentando(null)}
          onAplicado={() => void recargar()}
        />
      )}

      {comprando !== null && (
        <DialogoCompra
          proveedor={comprando === "nueva" ? null : comprando}
          onCerrar={() => setComprando(null)}
          onGuardada={async () => {
            setComprando(null);
            await recargar();
          }}
        />
      )}
    </Marco>
  );
}
