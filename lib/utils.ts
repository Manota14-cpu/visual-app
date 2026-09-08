import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Junta clases y deja ganar a la última cuando dos compiten por lo mismo. */
export function cn(...clases: ClassValue[]): string {
  return twMerge(clsx(clases));
}
