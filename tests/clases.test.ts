import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

/**
 * Juntar clases sin perder el tamaño de letra.
 *
 * `tailwind-merge` no conocía los tamaños propios del proyecto y los trataba
 * como colores: juntar `text-cifra` con `text-alerta-texto` borraba el tamaño.
 * Así salía el "Resultado" del informe, rojo y chiquito.
 */
describe("cn", () => {
  it("un color no borra un tamaño propio", () => {
    const clases = cn("font-titulo text-cifra font-semibold", "text-alerta-texto");
    expect(clases).toContain("text-cifra");
    expect(clases).toContain("text-alerta-texto");
  });

  it("con todos los tamaños del proyecto", () => {
    for (const tamano of ["micro", "chico", "base", "medio", "titulo", "cifra"]) {
      expect(cn(`text-${tamano}`, "text-tinta-suave"), tamano).toContain(`text-${tamano}`);
    }
  });

  it("pero dos tamaños sí compiten, y gana el último", () => {
    const clases = cn("text-chico", "text-cifra");
    expect(clases).toBe("text-cifra");
  });

  it("y dos colores también", () => {
    expect(cn("text-tinta-suave", "text-alerta-texto")).toBe("text-alerta-texto");
  });
});
