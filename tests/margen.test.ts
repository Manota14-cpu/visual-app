import { describe, expect, it } from "vitest";
import {
  margenSobreCosto as servidorSobreCosto,
  margenSobreVenta as servidorSobreVenta,
} from "../servidor/reglas.ts";
import {
  margenSobreCosto as pantallaSobreCosto,
  margenSobreVenta as pantallaSobreVenta,
} from "@/lib/formato";

/**
 * Los dos márgenes, y que el servidor y las pantallas digan lo mismo.
 *
 * El cálculo está escrito dos veces —una en `servidor/reglas.ts` y otra en
 * `lib/formato.ts`— porque las pantallas no comparten código con el servidor.
 * Mientras sea así, el riesgo no es que el cálculo esté mal: es que alguien
 * corrija uno de los dos y el producto muestre un margen al escribirlo y otro
 * al listarlo, sin que nada falle.
 */

const CASOS: [venta: number, costo: number | null][] = [
  [150, 100],
  [1000, 600],
  [500, 100],
  [800, 800],
  [80, 100], // vendido a pérdida
  [3990, 2150],
  [1, 1],
  [99_999_999, 1],
  [1000, null],
  [1000, 0],
  [0, 500],
];

describe("los dos márgenes", () => {
  it("son dos números distintos de la misma operación", () => {
    // Cuesta 100, se vende a 150: le pongo 50% encima, y de cada peso que
    // entra me quedan 33 centavos.
    expect(servidorSobreCosto(150, 100)).toBe(50);
    expect(servidorSobreVenta(150, 100)).toBe(33);
  });

  it("sobre la venta nunca llega a 100; sobre el costo no tiene techo", () => {
    expect(servidorSobreVenta(500, 100)).toBe(80);
    expect(servidorSobreCosto(500, 100)).toBe(400);
  });

  it("el de costo siempre es mayor o igual al de venta cuando hay ganancia", () => {
    for (const [venta, costo] of CASOS) {
      const v = servidorSobreVenta(venta, costo);
      const c = servidorSobreCosto(venta, costo);
      if (v === null || c === null) continue;
      if (v > 0) expect(c).toBeGreaterThanOrEqual(v);
    }
  });

  it("son null cuando falta el costo, en vez de dar 100%", () => {
    expect(servidorSobreVenta(1000, null)).toBeNull();
    expect(servidorSobreCosto(1000, null)).toBeNull();
    expect(servidorSobreVenta(1000, 0)).toBeNull();
    expect(servidorSobreCosto(1000, 0)).toBeNull();
    expect(servidorSobreVenta(0, 500)).toBeNull();
    expect(servidorSobreCosto(0, 500)).toBeNull();
  });

  it("dan negativo a pérdida, en vez de esconderlo", () => {
    expect(servidorSobreVenta(80, 100)).toBe(-25);
    expect(servidorSobreCosto(80, 100)).toBe(-20);
  });
});

describe("el servidor y las pantallas no pueden discrepar", () => {
  it("dan el mismo número en todos los casos", () => {
    for (const [venta, costo] of CASOS) {
      expect(pantallaSobreVenta(venta, costo)).toBe(servidorSobreVenta(venta, costo));
      expect(pantallaSobreCosto(venta, costo)).toBe(servidorSobreCosto(venta, costo));
    }
  });
});
