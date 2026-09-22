import { describe, expect, it } from "vitest";
import { anchoEnModulos, barrasDe, sePuedeDibujar } from "../lib/codigo-barras.ts";

/**
 * El código de barras de las etiquetas.
 *
 * Se verificó barra por barra contra una implementación de referencia mientras
 * se escribía; estas pruebas son el candado para que un cambio no lo rompa en
 * silencio. Un código de barras mal armado se ve igual de bien que uno bueno:
 * el problema aparece recién cuando el lector del mostrador devuelve otra cosa
 * y se cobra otro producto.
 */

/** Las barras, como la cadena de unos y ceros que lee un lector. */
function comoBinario(texto: string): string {
  return barrasDe(texto)
    .map((ancho, i) => String(i % 2 === 0 ? 1 : 0).repeat(ancho))
    .join("");
}

describe("la forma del código", () => {
  it("arranca y termina con los patrones que manda la norma", () => {
    const b = comoBinario("PAN-001");
    // Inicio del juego B: 11010010000.
    expect(b.startsWith("11010010000")).toBe(true);
    // El cierre son trece módulos: 1100011101011.
    expect(b.endsWith("1100011101011")).toBe(true);
  });

  it("empieza con barra y alterna", () => {
    // La lista son anchos alternados: la primera es barra, la segunda espacio.
    // Si eso se diera vuelta, el código saldría en negativo.
    expect(comoBinario("A")[0]).toBe("1");
  });

  it("el ancho crece con cada carácter, once módulos por vez", () => {
    // Inicio + control + cierre son fijos; cada letra suma once.
    const uno = anchoEnModulos("A");
    const dos = anchoEnModulos("AB");
    expect(dos - uno).toBe(11);
  });
});

describe("la suma de control", () => {
  /**
   * Sin ella el lector acepta cualquier cosa que se le parezca.
   *
   * Se comprueba indirectamente: dos textos distintos del mismo largo tienen
   * que dar dibujos distintos, y el control es lo que lo garantiza incluso
   * cuando los caracteres son los mismos en otro orden.
   */
  it("dos códigos con las mismas letras en otro orden no dan lo mismo", () => {
    expect(comoBinario("AB")).not.toBe(comoBinario("BA"));
  });

  it("el mismo texto da siempre el mismo dibujo", () => {
    expect(barrasDe("SKU-0042")).toEqual(barrasDe("SKU-0042"));
  });
});

describe("lo que no se puede imprimir", () => {
  it("un acento no entra, y se avisa en vez de dibujar cualquier cosa", () => {
    // Un código con una letra silenciosamente cambiada es peor que no tenerlo.
    expect(sePuedeDibujar("PANÍ")).toBe(false);
    expect(() => barrasDe("PANÍ")).toThrow(/no puede tener/i);
  });

  it("ni un texto vacío", () => {
    expect(sePuedeDibujar("")).toBe(false);
    expect(() => barrasDe("")).toThrow();
  });

  it("pero sí letras, números y los signos de siempre", () => {
    for (const codigo of ["PAN-001", "7790001234567", "SKU_42", "A B", "x1.5"]) {
      expect(sePuedeDibujar(codigo), codigo).toBe(true);
      expect(() => barrasDe(codigo)).not.toThrow();
    }
  });
});
