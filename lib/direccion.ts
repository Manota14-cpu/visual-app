"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Lo que pide la dirección cuando cambia con la pantalla ya abierta.
 *
 * El buscador de todo el programa (Ctrl+K) lleva a `/productos?q=…` o a
 * `/clientes?nuevo=1`. Si ya se estaba en esa pantalla, no se vuelve a montar:
 * los valores que se leyeron de la dirección al abrir no se releen, y la
 * elección no hacía nada. Esto avisa cada vez que la dirección cambia.
 *
 * El buscador le agrega a cada salto un `vez=` distinto, así elegir dos veces
 * lo mismo también es un cambio.
 */
export function useCambioDeDireccion(
  parametros: { toString(): string },
  alCambiar: (pedido: URLSearchParams) => void
): void {
  const actual = parametros.toString();
  const [anterior, setAnterior] = useState(actual);
  if (actual !== anterior) {
    setAnterior(actual);
    alCambiar(new URLSearchParams(actual));
  }
}

/**
 * Saca de la dirección el pedido de abrir un alta, una vez atendido.
 *
 * Si `?nuevo=1` quedaba escrito, recargar la página —o volver con el botón de
 * atrás del celular— abría otra vez el formulario de alta que ya se había
 * cerrado. Se llama al cerrar ese formulario.
 */
export function useOlvidarAlta(): () => void {
  const router = useRouter();
  const ruta = usePathname();
  return () => {
    const actual = new URLSearchParams(window.location.search);
    if (!actual.has("nuevo")) return;
    for (const clave of ["nuevo", "codigo", "vez"]) actual.delete(clave);
    const resto = actual.toString();
    router.replace(resto ? `${ruta}?${resto}` : ruta, { scroll: false });
  };
}
