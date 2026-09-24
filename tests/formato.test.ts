import { describe, expect, it } from "vitest";
import {
  leerNumero,
  margenSobreCosto,
  margenSobreVenta,
  nuevoPrecio,
  plata,
  hoy,
  dia,
  hora,
  fecha,
  fechaHora,
  billetesSugeridos,
} from "@/lib/formato";

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
    expect(margenSobreVenta(1000, null)).toBeNull();
    expect(margenSobreVenta(1000, 0)).toBeNull();
    expect(margenSobreVenta(0, 500)).toBeNull();

    expect(margenSobreCosto(1000, null)).toBeNull();
    expect(margenSobreCosto(1000, 0)).toBeNull();
    expect(margenSobreCosto(0, 500)).toBeNull();
  });

  it("son dos numeros distintos de la misma operacion", () => {
    // Cuesta 100, se vende a 150: le pongo 50% encima, y de cada peso que
    // entra me quedan 33 centavos. Confundirlos es creer que se gana la
    // mitad cuando se gana un tercio.
    expect(margenSobreCosto(150, 100)).toBe(50);
    expect(margenSobreVenta(150, 100)).toBe(33);
  });

  it("sobre la venta nunca llega a 100 y sobre el costo no tiene techo", () => {
    expect(margenSobreVenta(1000, 600)).toBe(40);
    expect(margenSobreCosto(1000, 600)).toBe(67);

    // Un producto que se vende a cinco veces lo que costo.
    expect(margenSobreVenta(500, 100)).toBe(80);
    expect(margenSobreCosto(500, 100)).toBe(400);
  });

  it("dan cero los dos cuando se vende al costo", () => {
    expect(margenSobreVenta(800, 800)).toBe(0);
    expect(margenSobreCosto(800, 800)).toBe(0);
  });

  it("dan negativo cuando se vende a perdida, en vez de esconderlo", () => {
    expect(margenSobreVenta(80, 100)).toBe(-25);
    expect(margenSobreCosto(80, 100)).toBe(-20);
  });
});

describe("fechas", () => {
  it("hoy usa la hora local, no UTC", () => {
    const referencia = new Date(2026, 0, 5, 23, 30);
    expect(hoy(referencia)).toBe("2026-01-05");
  });

  it("la hora va de 0 a 23, sin a. m. ni p. m.", () => {
    // Con el formato de doce horas, "abierto 24 sept · 10:24 p. m." cerraba
    // con un punto de más.
    expect(hora(new Date(2026, 8, 24, 22, 24))).toBe("22:24");
    expect(hora(new Date(2026, 8, 24, 9, 5))).toBe("09:05");
  });

  it("la fecha corta se escribe con espacio y no con guion", () => {
    const texto = fecha(new Date(2026, 8, 24, 22, 24));
    expect(texto).toMatch(/^24 sep/);
    expect(texto).not.toContain("-");
    expect(fechaHora(new Date(2026, 8, 24, 22, 24))).toMatch(/^24 sep\S* · 22:24$/);
  });

  it("dia no corre la fecha un día para atrás", () => {
    // El caso que motivó la función: "2026-09-06" leído como instante UTC son
    // las 21 del 5 en Argentina.
    expect(dia("2026-09-06")).toContain("06");
  });
});

describe("billetes sugeridos para el vuelto", () => {
  it("propone los montos redondos con que se suele pagar, de menor a mayor", () => {
    expect(billetesSugeridos(15200)).toEqual([16000, 20000]);
    expect(billetesSugeridos(3400)).toEqual([4000, 5000, 10000, 20000]);
    expect(billetesSugeridos(850)).toEqual([1000, 2000, 5000, 10000]);
    // «Te doy veinte» tiene que estar aunque haya montos más chicos.
    expect(billetesSugeridos(10400)).toEqual([11000, 12000, 15000, 20000]);
  });

  it("no propone el mismo total: para eso está «Justo»", () => {
    expect(billetesSugeridos(20000)).not.toContain(20000);
    expect(billetesSugeridos(10000)).toEqual([20000]);
  });

  it("con un total grande sigue proponiendo de a veinte mil", () => {
    expect(billetesSugeridos(47300)).toEqual([48000, 50000, 60000]);
  });

  it("sin nada que cobrar en efectivo no propone nada", () => {
    expect(billetesSugeridos(0)).toEqual([]);
    expect(billetesSugeridos(-500)).toEqual([]);
  });
});
