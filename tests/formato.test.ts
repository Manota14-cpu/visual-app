import { describe, expect, it } from "vitest";
import { leerNumero, margen, nuevoPrecio, plata, hoy, dia } from "@/lib/formato";

/**
 * Lo que se prueba acá es lo que, si se rompe, se rompe en plata: cómo se lee
 * lo que alguien tipea en un campo de importe y cómo se calcula un precio
 * nuevo. El resto de la interfaz se ve; esto no.
 */

describe("leerNumero", () => {
  it("entiende las tres formas de escribir el mismo importe", () => {
    expect(leerNumero("12500")).toBe(12500);
    expect(leerNumero("12.500")).toBe(12500);
    expect(leerNumero("12,500")).toBe(12500);
  });

  it("toma el último separador como decimal solo si deja dos dígitos o menos", () => {
    expect(leerNumero("1.234,56")).toBe(1234.56);
    expect(leerNumero("12,5")).toBe(12.5);
    // Tres dígitos detrás son miles, no milésimas de peso.
    expect(leerNumero("1.234.567")).toBe(1234567);
  });

  it("devuelve null cuando no hay número", () => {
    expect(leerNumero("")).toBeNull();
    expect(leerNumero("   ")).toBeNull();
    expect(leerNumero("abc")).toBeNull();
  });
});

describe("plata", () => {
  it("pone el menos antes del signo peso", () => {
    expect(plata(-1000)).toBe("−$1.000");
    expect(plata(1000)).toBe("$1.000");
  });

  it("trata lo que falta como cero en vez de romper", () => {
    expect(plata(null)).toBe("$0");
    expect(plata(undefined)).toBe("$0");
  });
});

describe("nuevoPrecio", () => {
  it("aplica el porcentaje y redondea al múltiplo pedido", () => {
    expect(nuevoPrecio(1000, 10, 1)).toBe(1100);
    expect(nuevoPrecio(1234, 10, 10)).toBe(1360);
    expect(nuevoPrecio(1234, 10, 100)).toBe(1400);
  });

  it("no deja gratis algo que tenía precio", () => {
    expect(nuevoPrecio(10, -90, 100)).toBe(100);
    expect(nuevoPrecio(0, 50, 10)).toBe(0);
  });
});

describe("margen", () => {
  it("es null cuando falta el costo, en vez de dar 100%", () => {
    expect(margen(1000, null)).toBeNull();
    expect(margen(1000, 0)).toBeNull();
    expect(margen(0, 500)).toBeNull();
  });

  it("calcula sobre el precio de venta", () => {
    expect(margen(1000, 600)).toBe(40);
  });
});

describe("fechas", () => {
  it("hoy usa la hora local, no UTC", () => {
    const referencia = new Date(2026, 0, 5, 23, 30);
    expect(hoy(referencia)).toBe("2026-01-05");
  });

  it("dia no corre la fecha un día para atrás", () => {
    // El caso que motivó la función: "2026-09-06" leído como instante UTC son
    // las 21 del 5 en Argentina.
    expect(dia("2026-09-06")).toContain("06");
  });
});
