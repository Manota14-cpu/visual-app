import { describe, expect, it } from "vitest";
import { vendidoHaceUnaSemana } from "../servidor/api/panel.ts";
import { saludo } from "@/lib/formato";

/**
 * La comparación de "Vendido hoy".
 *
 * Tiene que comparar lo comparable: el mismo día de la semana y cortado a la
 * misma hora. Si no, cualquier mañana el Panel diría que el negocio se hunde.
 */

// Jueves 24 de septiembre de 2026, 11:30 de la mañana.
const ahora = new Date(2026, 8, 24, 11, 30);

function venta(dia: number, horaDelDia: number, total: number, estado = "entregado") {
  return { estado, total, creadoEn: new Date(2026, 8, dia, horaDelDia, 0).toISOString() };
}

describe("lo vendido hace una semana", () => {
  it("suma el mismo día de la semana pasada, solo hasta esta hora", () => {
    const pedidos = [
      venta(17, 9, 1000), // jueves pasado, antes de las 11:30: cuenta
      venta(17, 11, 500), // también
      venta(17, 18, 9000), // jueves pasado a la tarde: todavía no llegó esa hora hoy
      venta(16, 10, 7000), // miércoles pasado: otro día
      venta(24, 10, 3000), // hoy: no es la semana pasada
    ];
    expect(vendidoHaceUnaSemana(pedidos, ahora)).toBe(1500);
  });

  it("no cuenta lo cancelado y resta las devoluciones", () => {
    const pedidos = [venta(17, 9, 1000), venta(17, 10, 800, "cancelado"), venta(17, 10, -200)];
    expect(vendidoHaceUnaSemana(pedidos, ahora)).toBe(800);
  });

  it("sin ventas ese día da cero", () => {
    expect(vendidoHaceUnaSemana([], ahora)).toBe(0);
  });
});

describe("el saludo del Panel", () => {
  it("cambia con la hora del día, como se saluda acá", () => {
    expect(saludo(new Date(2026, 8, 24, 8, 0))).toBe("Buen día");
    expect(saludo(new Date(2026, 8, 24, 12, 0))).toBe("Buenas tardes");
    expect(saludo(new Date(2026, 8, 24, 20, 0))).toBe("Buenas noches");
    expect(saludo(new Date(2026, 8, 24, 2, 0))).toBe("Buenas noches");
  });
});
