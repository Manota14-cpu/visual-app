"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Marco } from "@/components/marco";
import {
  Boton,
  Buscador,
  Cargando,
  Confirmar,
  CuerpoTabla,
  EncabezadoTabla,

  Paginacion,
  Selector,
  Tabla,
  Vacio,
} from "@/components/ui";
import { Icono } from "@/components/iconos";
import { useAvisos } from "@/components/avisos";
import { useDatos, useEspera } from "@/lib/datos";
import { api, consulta, ErrorApi } from "@/lib/api";
import { cantidadEscrita, numero, plata, porcentaje } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Categoria, PaginaProductos, Producto } from "@/lib/tipos";
import { DialogoProducto } from "./dialogo-producto";
import { DialogoStock } from "./dialogo-stock";
import { DialogoCategorias } from "./dialogo-categorias";
import { DialogoPrecios } from "./dialogo-precios";
import { DialogoHistorial } from "./dialogo-historial";
import { DialogoTraspaso } from "./dialogo-traspaso";

const ESTADOS = [
  { valor: "activos", etiqueta: "Activos" },
  { valor: "bajo", etiqueta: "Para reponer" },
  { valor: "sin", etiqueta: "Sin stock" },
  { valor: "sincosto", etiqueta: "Sin costo" },
  { valor: "eliminados", etiqueta: "Eliminados" },
  { valor: "todos", etiqueta: "Todos" },
];

export default function PaginaProductos() {
  return (
    <Suspense fallback={<Marco titulo="Productos"><Cargando filas={8} /></Marco>}>
      <Catalogo />
    </Suspense>
  );
}

function Catalogo() {
  const parametros = useSearchParams();
  const avisos = useAvisos();

  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState(parametros.get("estado") ?? "activos");
  const [categoria, setCategoria] = useState("");
  const [orden, setOrden] = useState("nombre");
  const [pagina, setPagina] = useState(1);
  const [elegidos, setElegidos] = useState<string[]>([]);

  const [editando, setEditando] = useState<Producto | null>(null);
  // `?nuevo=1&codigo=…` abre el alta con el código puesto: es a donde manda la
  // caja cuando el lector lee un código que no es de ningún producto.
  const [creando, setCreando] = useState(parametros.get("nuevo") === "1");
  const codigoNuevo = parametros.get("codigo") ?? undefined;
  const [ajustando, setAjustando] = useState<Producto | null>(null);
  const [viendoHistorial, setViendoHistorial] = useState<Producto | null>(null);
  const [abriendoCategorias, setAbriendoCategorias] = useState(false);
  const [traspasando, setTraspasando] = useState(false);
  const [abriendoPrecios, setAbriendoPrecios] = useState(false);
  const [eliminando, setEliminando] = useState<Producto | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const termino = useEspera(busqueda);

  const ruta = useMemo(
    () =>
      `/productos${consulta({
        q: termino,
        estado,
        categoria,
        orden,
        pagina,
        porPagina: 25,
      })}`,
    [termino, estado, categoria, orden, pagina]
  );

  const { datos, cargando, recargar } = useDatos<PaginaProductos>(ruta);
  const { datos: categorias, recargar: recargarCategorias } = useDatos<Categoria[]>("/categorias");

  const productos = datos?.items ?? [];
  const todosElegidos = productos.length > 0 && elegidos.length === productos.length;

  /**
   * Cambiar un filtro empieza de nuevo.
   *
   * Quedarse en la página 7 de una lista que ahora tiene dos resultados muestra
   * una pantalla vacía sin explicación, y la selección que quedaba era de
   * productos que ya no se ven.
   */
  function filtrar(aplicar: () => void) {
    aplicar();
    setPagina(1);
    setElegidos([]);
  }

  function alternar(id: string) {
    setElegidos((previos) =>
      previos.includes(id) ? previos.filter((x) => x !== id) : [...previos, id]
    );
  }

  async function accionMasiva(cuerpo: Record<string, unknown>, mensaje: string) {
    setTrabajando(true);
    try {
      await api.post("/productos/masivo", { ids: elegidos, ...cuerpo });
      avisos.exito(mensaje);
      setElegidos([]);
      await recargar();
      await recargarCategorias();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo aplicar el cambio.");
    } finally {
      setTrabajando(false);
    }
  }

  async function eliminar() {
    if (!eliminando) return;
    setTrabajando(true);
    try {
      await api.borrar(`/productos/${eliminando.id}`);
      avisos.exito(`${eliminando.nombre} se eliminó. Está en el filtro «Eliminados».`);
      setEliminando(null);
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo eliminar.");
    } finally {
      setTrabajando(false);
    }
  }

  async function restaurar(producto: Producto) {
    try {
      await api.post(`/productos/${producto.id}/restaurar`);
      avisos.exito(`${producto.nombre} volvió al catálogo.`);
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo restaurar.");
    }
  }

  return (
    <Marco
      titulo="Productos"
      descripcion="El catálogo y su stock. Todo cambio de stock deja su movimiento."
      acciones={
        <>
          <Boton icono="copiar" onClick={() => setTraspasando(true)}>
            Exportar e importar
          </Boton>
          <Boton icono="etiqueta" onClick={() => setAbriendoCategorias(true)}>
            Categorías
          </Boton>
          <Boton tono="principal" icono="mas" onClick={() => setCreando(true)}>
            Producto nuevo
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]">
          <Buscador
            placeholder="Buscar por nombre, código o descripción"
            value={busqueda}
            onChange={(e) => filtrar(() => setBusqueda(e.target.value))}
          />
          <Selector value={estado} onChange={(e) => filtrar(() => setEstado(e.target.value))} aria-label="Estado">
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </Selector>
          <Selector
            value={categoria}
            onChange={(e) => filtrar(() => setCategoria(e.target.value))}
            aria-label="Categoría"
          >
            <option value="">Todas las categorías</option>
            {(categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
          <Selector value={orden} onChange={(e) => filtrar(() => setOrden(e.target.value))} aria-label="Orden">
            <option value="nombre">Por nombre</option>
            <option value="stock">Menos stock primero</option>
            <option value="precio">Más caro primero</option>
            <option value="reciente">Editado recién</option>
          </Selector>
        </div>

        {elegidos.length > 0 && (
          <div className="flex animate-entrar flex-wrap items-center gap-2 rounded-md border border-linea bg-papel px-3 py-2 shadow-apoyo">
            <span className="text-base font-medium">
              {numero(elegidos.length)} {elegidos.length === 1 ? "elegido" : "elegidos"}
            </span>
            <span className="mx-1 h-4 w-px bg-linea" />
            <Boton chico onClick={() => setAbriendoPrecios(true)}>
              Ajustar precios
            </Boton>
            <select
              className="h-8 rounded border border-linea-fuerte bg-papel px-2 text-chico"
              value=""
              disabled={trabajando}
              onChange={(e) => {
                if (!e.target.value) return;
                const nombre = (categorias ?? []).find((c) => c.id === e.target.value)?.nombre;
                void accionMasiva({ categoriaId: e.target.value }, `Movidos a ${nombre}.`);
              }}
            >
              <option value="">Mover a categoría…</option>
              {(categorias ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <Boton chico disabled={trabajando} onClick={() => void accionMasiva({ activo: false }, "Productos eliminados.")}>
              Eliminar
            </Boton>
            <Boton chico disabled={trabajando} onClick={() => void accionMasiva({ activo: true }, "Productos restaurados.")}>
              Restaurar
            </Boton>
            <Boton chico tono="fantasma" onClick={() => setElegidos([])}>
              Limpiar
            </Boton>
          </div>
        )}

        <div className="hoja overflow-hidden">
          {cargando && !datos ? (
            <Cargando filas={8} />
          ) : productos.length === 0 ? (
            <Vacio
              titulo="No hay productos que mostrar"
              detalle={
                termino
                  ? `Nada coincide con «${termino}».`
                  : "Cargá el primero y su stock queda registrado desde el día uno."
              }
              accion={
                !termino ? (
                  <Boton tono="principal" icono="mas" onClick={() => setCreando(true)}>
                    Producto nuevo
                  </Boton>
                ) : undefined
              }
            />
          ) : (
            <>
              <Tabla className="min-w-[820px]">
                <EncabezadoTabla>
                  <tr>
                    <th className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Elegir todos"
                        checked={todosElegidos}
                        onChange={() => setElegidos(todosElegidos ? [] : productos.map((p) => p.id))}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </th>
                    <th>Producto</th>
                    <th className="text-right">Stock</th>
                    <th className="text-right">Costo</th>
                    <th className="text-right">Venta</th>
                    <th className="text-right">Margen s/venta</th>
                    <th className="w-28" />
                  </tr>
                </EncabezadoTabla>

                <CuerpoTabla>
                  {productos.map((producto) => {
                    const sinStock = producto.stock === 0;
                    const bajo = producto.stock <= producto.stockMinimo;

                    return (
                      <tr
                        key={producto.id}
                        className={cn(
                          "transition-colors hover:bg-black/[0.02]",
                          !producto.activo && "opacity-55"
                        )}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Elegir ${producto.nombre}`}
                            checked={elegidos.includes(producto.id)}
                            onChange={() => alternar(producto.id)}
                            className="h-4 w-4 cursor-pointer"
                          />
                        </td>

                        <td className="max-w-[320px]">
                          <button
                            type="button"
                            className="block max-w-full truncate text-left font-medium hover:underline"
                            onClick={() => setEditando(producto)}
                          >
                            {producto.nombre}
                          </button>
                          <span className="flex items-center gap-1.5 text-chico text-tinta-suave">
                            {producto.categoria && (
                              <span className="inline-flex items-center gap-1">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: producto.categoriaColor ?? "#D2D2D7" }}
                                />
                                {producto.categoria}
                              </span>
                            )}
                            {producto.sku && <span>· {producto.sku}</span>}
                            <span>· {producto.unidadMedida}</span>
                          </span>
                        </td>

                        <td className="text-right">
                          <span
                            className={cn(
                              "cifra font-medium",
                              sinStock && "text-alerta-texto",
                              !sinStock && bajo && "text-aviso-texto"
                            )}
                          >
                            {cantidadEscrita(producto.stock, producto.porPeso)}
                          </span>
                          {producto.stockMinimo > 0 && (
                            <span className="block text-chico text-tinta-suave">
                              mín. {cantidadEscrita(producto.stockMinimo, producto.porPeso)}
                            </span>
                          )}
                        </td>

                        <td className="cifra text-right text-tinta-suave">
                          {producto.precioCosto ? plata(producto.precioCosto) : "—"}
                        </td>

                        <td className="text-right">
                          <span className="cifra block font-medium">{plata(producto.precioVenta)}</span>
                          {producto.porPeso && (
                            <span className="block text-chico text-tinta-tenue">el kilo</span>
                          )}
                        </td>

                        <td className="text-right">
                          <span className="cifra block text-tinta-suave">
                            {porcentaje(producto.margen)}
                          </span>
                          {producto.margenCosto !== null && (
                            <span className="block text-chico text-tinta-tenue">
                              s/costo {porcentaje(producto.margenCosto)}
                            </span>
                          )}
                        </td>

                        <td>
                          <div className="flex items-center justify-end gap-0.5">
                            <Accion
                              icono="movimientos"
                              titulo="Ajustar stock"
                              onClick={() => setAjustando(producto)}
                            />
                            <Accion
                              icono="etiqueta"
                              titulo="Historial de precios"
                              onClick={() => setViendoHistorial(producto)}
                            />
                            <Accion
                              icono="editar"
                              titulo="Editar"
                              onClick={() => setEditando(producto)}
                            />
                            {producto.activo ? (
                              <Accion
                                icono="borrar"
                                titulo="Eliminar"
                                peligroso
                                onClick={() => setEliminando(producto)}
                              />
                            ) : (
                              <Accion
                                icono="recargar"
                                titulo="Restaurar"
                                onClick={() => void restaurar(producto)}
                              />
                            )}
                          </div>
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

      {/* Los diálogos se montan al abrirse y se desmontan al cerrarse: así el
          formulario nace con los datos del producto elegido y se descarta
          entero al salir, sin estado viejo que reaparezca en el siguiente. */}
      {(creando || editando !== null) && categorias && (
        <DialogoProducto
          key={editando?.id ?? "nuevo"}
          abierto
          producto={editando}
          codigoInicial={editando ? undefined : codigoNuevo}
          categorias={categorias ?? []}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
          onGuardado={() => {
            void recargar();
            void recargarCategorias();
          }}
        />
      )}

      {ajustando && (
        <DialogoStock
          key={ajustando.id}
          producto={ajustando}
          onCerrar={() => setAjustando(null)}
          onGuardado={() => void recargar()}
        />
      )}

      <DialogoHistorial producto={viendoHistorial} onCerrar={() => setViendoHistorial(null)} />

      {/* Se monta al abrirse: el archivo elegido y su vista previa no tienen
          que sobrevivir a cerrar el diálogo. */}
      {traspasando && (
        <DialogoTraspaso
          onCerrar={() => setTraspasando(false)}
          onImportado={() => {
            void recargar();
            void recargarCategorias();
          }}
        />
      )}

      <DialogoCategorias
        abierto={abriendoCategorias}
        categorias={categorias ?? []}
        onCerrar={() => setAbriendoCategorias(false)}
        onCambio={() => {
          void recargarCategorias();
          void recargar();
        }}
      />

      <DialogoPrecios
        abierto={abriendoPrecios}
        ids={elegidos}
        onCerrar={() => setAbriendoPrecios(false)}
        onAplicado={() => {
          setElegidos([]);
          void recargar();
        }}
      />

      <Confirmar
        abierto={eliminando !== null}
        titulo="Eliminar producto"
        detalle={
          eliminando
            ? `${eliminando.nombre} deja de aparecer en el catálogo, pero su historial y sus ventas se conservan. Se recupera desde el filtro «Eliminados».`
            : ""
        }
        confirmar="Eliminar"
        peligroso
        trabajando={trabajando}
        onCerrar={() => setEliminando(null)}
        onConfirmar={() => void eliminar()}
      />
    </Marco>
  );
}

function Accion({
  icono,
  titulo,
  peligroso,
  onClick,
}: {
  icono: Parameters<typeof Icono>[0]["nombre"];
  titulo: string;
  peligroso?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      className={cn(
        "rounded p-1.5 text-tinta-suave transition-colors hover:bg-black/[0.05]",
        peligroso ? "hover:text-alerta-texto" : "hover:text-tinta"
      )}
    >
      <Icono nombre={icono} tamano={16} />
    </button>
  );
}
