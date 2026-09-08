"use client";

import { useRef, useState } from "react";
import { Buscador } from "@/components/ui";
import { useDatos, useEspera } from "@/lib/datos";
import { api, consulta } from "@/lib/api";
import { numero, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { ProductoBuscado } from "@/lib/tipos";

/**
 * El buscador del mostrador.
 *
 * Muestra el stock además del precio, porque en el mostrador encontrar el
 * producto no sirve si no se sabe si queda. Un código de barras entero seguido
 * de Enter —que es lo que manda un lector— agrega el producto directo, sin
 * pasar por la lista.
 */
export function BuscadorProductos({
  onElegir,
  autoFocus,
  placeholder = "Buscar producto o escanear código",
}: {
  onElegir: (producto: ProductoBuscado) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const termino = useEspera(texto, 220);
  const entrada = useRef<HTMLInputElement>(null);

  const { datos } = useDatos<ProductoBuscado[]>(
    termino.trim().length >= 2 ? `/productos/buscar${consulta({ q: termino })}` : null,
    { silencioso: true }
  );

  const resultados = datos ?? [];

  // El resaltado se acota al dibujar en vez de reiniciarse con un efecto: si la
  // lista se achicó mientras se movía la flecha, el índice viejo apuntaría a un
  // renglón que ya no está.
  const activo = Math.min(resaltado, Math.max(resultados.length - 1, 0));

  function elegir(producto: ProductoBuscado) {
    onElegir(producto);
    setTexto("");
    entrada.current?.focus();
  }

  async function porCodigo(codigo: string) {
    try {
      const producto = await api.get<{
        id: string;
        nombre: string;
        sku: string | null;
        precioVenta: number;
        stock: number;
        unidadMedida: string;
      }>(`/productos/codigo/${encodeURIComponent(codigo)}`);

      elegir({
        id: producto.id,
        nombre: producto.nombre,
        sku: producto.sku,
        precio: producto.precioVenta,
        stock: producto.stock,
        unidadMedida: producto.unidadMedida,
      });
      return true;
    } catch {
      return false;
    }
  }

  return (
    <div className="relative">
      <Buscador
        ref={entrada}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setResaltado(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setResaltado((i) => Math.min(i + 1, resultados.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setResaltado((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const elegido = resultados[activo];
            if (elegido) elegir(elegido);
            // Un lector de códigos escribe rapidísimo y termina con Enter: puede
            // llegar antes de que la búsqueda por nombre haya contestado.
            else if (texto.trim().length >= 6) void porCodigo(texto.trim());
          } else if (e.key === "Escape") {
            setTexto("");
          }
        }}
      />

      {texto.trim().length >= 2 && resultados.length > 0 && (
        <ul className="vidrio-menu absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 animate-entrar overflow-y-auto rounded-md py-1 shadow-elevada ring-1 ring-black/[0.07]">
          {resultados.map((producto, indice) => (
            <li key={producto.id}>
              <button
                type="button"
                onMouseEnter={() => setResaltado(indice)}
                onClick={() => elegir(producto)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
                  indice === activo && "bg-acento/[0.08]"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{producto.nombre}</span>
                  <span className="block text-chico text-tinta-suave">
                    {producto.sku ? `${producto.sku} · ` : ""}
                    {producto.stock > 0 ? `${numero(producto.stock)} ${producto.unidadMedida}` : "sin stock"}
                  </span>
                </span>
                <span className="cifra shrink-0 font-medium">{plata(producto.precio)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
