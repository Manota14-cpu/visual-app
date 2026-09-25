import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { rutasCaja } from "../servidor/api/caja.ts";
import { rutasPanel } from "../servidor/api/panel.ts";
import { importeRenglon as servidorImporte, contarRenglones } from "../servidor/reglas.ts";
import { importeRenglon as pantallaImporte, peso } from "@/lib/formato";
import { Ruteador } from "../servidor/http.ts";
import type { Producto } from "../servidor/tipos.ts";

/**
 * Los productos que se venden por peso.
 *
 * El precio es por kilo y la cantidad va en gramos. Es la parte más fácil de
 * equivocar de toda la aplicación: un factor de mil mal puesto cobra medio kilo
 * de pan a quinientos mil pesos, o a cincuenta centavos, y las dos cosas se ven
 * igual de mal en el mostrador.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;

async function post(camino: string, cuerpo: Record<string, unknown> = {}) {
  const { resultado } = await r.resolver("POST", camino, new URLSearchParams(), cuerpo);
  return resultado as Record<string, unknown>;
}

async function get(camino: string) {
  const { resultado } = await r.resolver("GET", camino, new URLSearchParams(), {});
  return resultado as Record<string, unknown>;
}

/** Un producto por peso: `precio` es por kilo y `stock` en gramos. */
function sembrarPorPeso(nombre: string, precioPorKilo: number, gramos: number): string {
  const id = nuevoId();
  const ahora = new Date().toISOString();

  a.escribir((d) => {
    const p: Producto = {
      id,
      categoriaId: null,
      nombre,
      descripcion: null,
      sku: null,
      codigoBarras: null,
      unidadMedida: "kg",
      porPeso: true,
      precioCosto: Math.round(precioPorKilo / 2),
      precioVenta: precioPorKilo,
      precioMayorista: null,
      cantidadMayoristaMin: null,
      stock: gramos,
      stockMinimo: 0,
      proveedorId: null,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    d.productos.push(p);
  });

  return id;
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-peso-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasCaja(r, a);
  rutasPanel(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("cuánto sale un renglón por peso", () => {
  it("medio kilo de pan a $1.000 el kilo sale $500", () => {
    expect(servidorImporte(1000, 500, true)).toBe(500);
  });

  it("un kilo entero sale el precio del kilo", () => {
    expect(servidorImporte(1000, 1000, true)).toBe(1000);
  });

  it("dos kilos y cuarto salen lo que tienen que salir", () => {
    expect(servidorImporte(1000, 2250, true)).toBe(2250);
    expect(servidorImporte(3800, 2250, true)).toBe(8550);
  });

  it("cien gramos de algo caro no se redondean a cero", () => {
    // Jamón crudo a $28.000 el kilo: cien gramos son 2.800.
    expect(servidorImporte(28_000, 100, true)).toBe(2800);
    // Y diez gramos, 280.
    expect(servidorImporte(28_000, 10, true)).toBe(280);
  });

  it("redondea al peso, sin dejar centavos colgados", () => {
    // 333 g de algo a $1.000 el kilo son 333 pesos justos.
    expect(servidorImporte(1000, 333, true)).toBe(333);
    // 333 g a $1.001: 333,333 → 333.
    expect(servidorImporte(1001, 333, true)).toBe(333);
    // 500 g a $1.001: 500,5 → 501, no 500.
    expect(servidorImporte(1001, 500, true)).toBe(501);
  });

  it("un producto que no es por peso se multiplica y nada más", () => {
    expect(servidorImporte(1000, 500)).toBe(500_000);
    expect(servidorImporte(1000, 500, false)).toBe(500_000);
  });
});

describe("el servidor y las pantallas no pueden discrepar", () => {
  it("dan el mismo importe en todos los casos", () => {
    const casos: [number, number, boolean][] = [
      [1000, 500, true],
      [1000, 1000, true],
      [28_000, 100, true],
      [1001, 500, true],
      [3800, 2250, true],
      [1000, 3, false],
      [990, 12, false],
    ];

    for (const [precio, cantidad, porPeso] of casos) {
      expect(pantallaImporte(precio, cantidad, porPeso)).toBe(
        servidorImporte(precio, cantidad, porPeso)
      );
    }
  });
});

describe("cómo se escribe un peso", () => {
  it("hasta el kilo, en gramos", () => {
    expect(peso(500)).toBe("500 g");
    expect(peso(1)).toBe("1 g");
    expect(peso(999)).toBe("999 g");
  });

  it("del kilo para arriba, en kilos", () => {
    expect(peso(1000)).toBe("1 kg");
    expect(peso(1250)).toBe("1,25 kg");
    expect(peso(2000)).toBe("2 kg");
  });
});

describe("vender pan por peso", () => {
  it("cobra 500 pesos por medio kilo a 1000 el kilo, y descuenta 500 gramos", async () => {
    const caja = await post("/caja/abrir", { fondo: 0 });
    const cajaId = caja.id as string;

    // Diez kilos de pan a $1.000 el kilo.
    const pan = sembrarPorPeso("Pan francés", 1000, 10_000);

    const venta = await post("/caja/cobrar", {
      cajaId,
      items: [{ productoId: pan, nombre: "Pan francés", precio: 1000, cantidad: 500 }],
      pagos: [{ metodo: "efectivo", monto: 500 }],
    });

    expect(venta.total).toBe(500);
    // Quedan nueve kilos y medio.
    expect(a.leer((d) => d.productos[0]!.stock)).toBe(9500);
  });

  it("no deja vender más peso del que hay", async () => {
    const caja = await post("/caja/abrir", { fondo: 0 });
    const pan = sembrarPorPeso("Pan francés", 1000, 300); // 300 g

    await expect(
      post("/caja/cobrar", {
        cajaId: caja.id,
        items: [{ productoId: pan, nombre: "Pan francés", precio: 1000, cantidad: 500 }],
        pagos: [{ metodo: "efectivo", monto: 500 }],
      })
    ).rejects.toThrow(/stock insuficiente/i);

    expect(a.leer((d) => d.productos[0]!.stock)).toBe(300);
  });

  it("la pantalla no puede decidir que algo se vende por peso", async () => {
    const caja = await post("/caja/abrir", { fondo: 0 });

    // Un producto por UNIDAD, a mil pesos cada uno.
    const id = nuevoId();
    const ahora = new Date().toISOString();
    a.escribir((d) => {
      d.productos.push({
        id,
        categoriaId: null,
        nombre: "Gaseosa",
        descripcion: null,
        sku: null,
        codigoBarras: null,
        unidadMedida: "unidad",
        porPeso: false,
        precioCosto: 500,
        precioVenta: 1000,
        precioMayorista: null,
        cantidadMayoristaMin: null,
        stock: 100,
        stockMinimo: 0,
        proveedorId: null,
        activo: true,
        creadoEn: ahora,
        actualizadoEn: ahora,
      });
    });

    // Si la pantalla pudiera declararlo por peso, dos gaseosas saldrían $2 en
    // vez de $2.000. El catálogo manda.
    await expect(
      post("/caja/cobrar", {
        cajaId: caja.id,
        items: [
          { productoId: id, nombre: "Gaseosa", precio: 1000, cantidad: 2, porPeso: true },
        ],
        pagos: [{ metodo: "efectivo", monto: 2 }],
      })
    ).rejects.toThrow(/no coincide/i);
  });

  it("devolver 250 gramos devuelve el peso al stock", async () => {
    const caja = await post("/caja/abrir", { fondo: 0 });
    const cajaId = caja.id as string;
    const pan = sembrarPorPeso("Pan francés", 1000, 10_000);

    await post("/caja/cobrar", {
      cajaId,
      items: [{ productoId: pan, nombre: "Pan francés", precio: 1000, cantidad: 1000 }],
      pagos: [{ metodo: "efectivo", monto: 1000 }],
    });
    expect(a.leer((d) => d.productos[0]!.stock)).toBe(9000);

    await post("/caja/devolver", {
      cajaId,
      items: [{ productoId: pan, nombre: "Pan francés", precio: 1000, cantidad: 250 }],
      metodoPago: "efectivo",
    });

    expect(a.leer((d) => d.productos[0]!.stock)).toBe(9250);

    const vista = await get("/caja");
    const totales = vista.totales as Record<string, number>;
    // Mil cobrados menos doscientos cincuenta devueltos.
    expect(totales.total).toBe(750);
  });
});

describe("contar renglones sin mezclar peras con manzanas", () => {
  it("separa unidades de gramos", () => {
    const contado = contarRenglones([
      { porPeso: false, cantidad: 6 },
      { porPeso: true, cantidad: 500 },
      { porPeso: false, cantidad: 2 },
      { porPeso: true, cantidad: 1250 },
    ]);

    // Ocho unidades y un kilo setecientos cincuenta. No "1758 unidades".
    expect(contado.unidades).toBe(8);
    expect(contado.gramos).toBe(1750);
  });

  it("un renglón sin marca cuenta como unidad", () => {
    expect(contarRenglones([{ cantidad: 3 }]).unidades).toBe(3);
  });
});

describe("lo que vale lo que hay en góndola", () => {
  it("no multiplica gramos por el precio del kilo", async () => {
    // Diez kilos de pan a $1.000 el kilo valen $10.000, no diez millones.
    sembrarPorPeso("Pan francés", 1000, 10_000);

    const { resultado } = await r.resolver("GET", "/panel", new URLSearchParams(), {});
    const panel = resultado as { stock: { valorVenta: number; valorCosto: number } };

    expect(panel.stock.valorVenta).toBe(10_000);
    // El costo sembrado es la mitad del precio.
    expect(panel.stock.valorCosto).toBe(5000);
  });

  it("suma bien un catálogo mezclado", async () => {
    sembrarPorPeso("Pan francés", 1000, 10_000); // 10 kg → $10.000

    // Y diez gaseosas a $1.500 → $15.000.
    const ahora = new Date().toISOString();
    a.escribir((d) => {
      d.productos.push({
        id: nuevoId(),
        categoriaId: null,
        nombre: "Gaseosa",
        descripcion: null,
        sku: null,
        codigoBarras: null,
        unidadMedida: "unidad",
        porPeso: false,
        precioCosto: 750,
        precioVenta: 1500,
        precioMayorista: null,
        cantidadMayoristaMin: null,
        stock: 10,
        stockMinimo: 0,
        proveedorId: null,
        activo: true,
        creadoEn: ahora,
        actualizadoEn: ahora,
      });
    });

    const { resultado } = await r.resolver("GET", "/panel", new URLSearchParams(), {});
    const panel = resultado as { stock: { valorVenta: number } };

    expect(panel.stock.valorVenta).toBe(25_000);
  });
});
