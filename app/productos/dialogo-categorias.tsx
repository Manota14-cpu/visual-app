"use client";

import { useState } from "react";
import { Boton, Campo, Dialogo, Etiqueta } from "@/components/ui";
import { Icono } from "@/components/iconos";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { numero } from "@/lib/formato";
import type { Categoria } from "@/lib/tipos";

// La paleta del sistema: los mismos tonos que usan las etiquetas de iOS.
const COLORES = ["#0050CE", "#5E5CE6", "#BF5AF2", "#30D158", "#FF9F0A", "#FF375F", "#98989D"];

/**
 * Las categorías, editables sin salir del catálogo.
 *
 * Borrar una que tiene productos no se permite: dejaría a esos productos
 * apuntando a algo que no existe y desaparecerían de todos los filtros sin que
 * nadie lo haya decidido.
 */
export function DialogoCategorias({
  abierto,
  categorias,
  onCerrar,
  onCambio,
}: {
  abierto: boolean;
  categorias: Categoria[];
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const avisos = useAvisos();
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(COLORES[0]);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  async function crear() {
    if (!nombre.trim()) return;
    setTrabajando(true);
    try {
      await api.post("/categorias", { nombre, color });
      setNombre("");
      avisos.exito("Categoría creada.");
      onCambio();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo crear.");
    } finally {
      setTrabajando(false);
    }
  }

  async function renombrar(categoria: Categoria) {
    setTrabajando(true);
    try {
      await api.put(`/categorias/${categoria.id}`, { nombre: borrador, color: categoria.color });
      setEditando(null);
      avisos.exito("Categoría renombrada.");
      onCambio();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar.");
    } finally {
      setTrabajando(false);
    }
  }

  async function pintar(categoria: Categoria, nuevo: string) {
    try {
      await api.put(`/categorias/${categoria.id}`, { nombre: categoria.nombre, color: nuevo });
      onCambio();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar.");
    }
  }

  async function borrar(categoria: Categoria) {
    setTrabajando(true);
    try {
      await api.borrar(`/categorias/${categoria.id}`);
      avisos.exito("Categoría eliminada.");
      onCambio();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo eliminar.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Categorías"
      descripcion="Cómo se agrupa el catálogo."
      pie={<Boton onClick={onCerrar}>Listo</Boton>}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-md border border-linea bg-lienzo p-3">
          <div className="flex items-end gap-2">
            <Campo
              etiqueta="Nueva categoría"
              placeholder="Bandejas"
              contenedor="flex-1"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void crear();
              }}
            />
            <Boton tono="principal" icono="mas" onClick={() => void crear()} disabled={trabajando}>
              Agregar
            </Boton>
          </div>

          <div className="flex items-center gap-1.5">
            {COLORES.map((opcion) => (
              <button
                key={opcion}
                type="button"
                onClick={() => setColor(opcion)}
                aria-label={`Color ${opcion}`}
                className="h-5 w-5 rounded-full border transition-transform hover:scale-110"
                style={{
                  background: opcion,
                  borderColor: color === opcion ? "rgb(var(--tinta))" : "transparent",
                }}
              />
            ))}
          </div>
        </div>

        <ul className="flex flex-col">
          {categorias.map((categoria) => (
            <li
              key={categoria.id}
              className="flex items-center gap-2 border-b border-linea py-2 last:border-0"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-linea-fuerte"
                style={{ background: categoria.color ?? "rgb(var(--linea-fuerte))" }}
              />

              {editando === categoria.id ? (
                <input
                  className="h-8 flex-1 rounded border border-linea-fuerte bg-papel px-2 text-base focus:border-acento focus:outline-none focus:ring-[3px] focus:ring-acento/25"
                  value={borrador}
                  autoFocus
                  onChange={(e) => setBorrador(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void renombrar(categoria);
                    if (e.key === "Escape") setEditando(null);
                  }}
                />
              ) : (
                <span className="flex-1 truncate">{categoria.nombre}</span>
              )}

              <Etiqueta>{numero(categoria.productos)}</Etiqueta>

              <div className="flex items-center gap-1">
                {COLORES.slice(0, 5).map((opcion) => (
                  <button
                    key={opcion}
                    type="button"
                    onClick={() => void pintar(categoria, opcion)}
                    aria-label={`Pintar ${categoria.nombre}`}
                    className="h-3.5 w-3.5 rounded-full opacity-45 transition-opacity hover:opacity-100"
                    style={{ background: opcion }}
                  />
                ))}
              </div>

              {editando === categoria.id ? (
                <Boton chico tono="principal" onClick={() => void renombrar(categoria)}>
                  Guardar
                </Boton>
              ) : (
                <button
                  type="button"
                  className="p-1 text-tinta-suave hover:text-tinta"
                  aria-label={`Renombrar ${categoria.nombre}`}
                  onClick={() => {
                    setEditando(categoria.id);
                    setBorrador(categoria.nombre);
                  }}
                >
                  <Icono nombre="editar" tamano={15} />
                </button>
              )}

              <button
                type="button"
                className="p-1 text-tinta-suave hover:text-alerta-texto disabled:opacity-30"
                aria-label={`Eliminar ${categoria.nombre}`}
                disabled={categoria.productos > 0 || trabajando}
                title={categoria.productos > 0 ? "Tiene productos adentro" : "Eliminar"}
                onClick={() => void borrar(categoria)}
              >
                <Icono nombre="borrar" tamano={15} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialogo>
  );
}
