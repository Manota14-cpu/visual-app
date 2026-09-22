import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `twMerge` que sabe cuáles son los tamaños de letra propios del proyecto.
 *
 * Los tamaños se llaman `text-cifra`, `text-chico`, `text-titulo`… y los
 * colores `text-alerta-texto`, `text-tinta-suave`… Todos empiezan igual, y
 * `tailwind-merge` solo reconoce como tamaño los de fábrica (`text-sm`,
 * `text-xl`). Todo lo demás lo trataba como un color, así que al juntar un
 * tamaño propio con un color se quedaba con el último y **borraba el tamaño**:
 * el "Resultado" del informe salía en rojo y en letra chica, justo el número
 * más importante de la pantalla.
 */
const unir = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["micro", "chico", "base", "medio", "titulo", "cifra"] }],
    },
  },
});

/** Junta clases y deja ganar a la última cuando dos compiten por lo mismo. */
export function cn(...clases: ClassValue[]): string {
  return unir(clsx(clases));
}
