import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { rutasRecuento } from "../servidor/api/recuento.ts";
import { Ruteador } from "../servidor/http.ts";
import type { Producto } from "../servidor/tipos.ts";

/**
 * Contar la góndola.
 *
 * Lo que hace que esto sirva es que el ajuste pase por el mismo camino que
 * cualquier otro movimiento de stock: cada diferencia deja su movimiento con
 * motivo y fecha. Si el recuento tocara el stock por atrás, el historial
 * dejaría de explicar de dónde salió cada unidad.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;

async function pedir(metodo: string, camino: string, cuerpo: Record<string, unknown> = {}) {
  const { resultado } = await r.resolver(metodo, camino, new URLSearchParams(), cuerpo);
  return resultado as Record<string, unknown>;
}

function sembrar(nombre: string, stock: number, costo = 100, porPeso = false): string {
  const id = nuevoId();
  const ahora = new Date().toISOString();

  a.escribir((d) => {
    d.productos.push({
      id,
      categoriaId: null,
      nombre,
      descripcion: null,
      sku: null,
      codigoBarras: null,
      unidadMedida: porPeso ? "kg" : "unidad",
      porPeso,
      precioCosto: costo,
      precioVenta: costo * 2,
      precioMayorista: null,
      cantidadMayoristaMin: null,
      stock,
      stockMinimo: 0,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora,
    } satisfies Producto);
  });

  return id;
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-recuento-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasRecuento(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("la planilla para contar", () => {
  it("trae todo lo activo, sin paginar", async () => {
    for (let i = 0; i < 50; i++) sembrar(`Producto ${i}`, 10);

    const planilla = (await pedir("GET", "/recuento/planilla")) as {
      productos: { esperado: number }[];
    };

    // Un recuento se hace recorriendo la estantería con la planilla: de a
    // treinta por página se pierde la cuenta.
    expect(planilla.productos).toHaveLength(50);
    expect(planilla.productos[0]!.esperado).toBe(10);
  });
});

describe("aplicar el recuento", () => {
  it("corrige lo que no coincide", async () => {
    const pan = sembrar("Pan francés", 40);

    await pedir("POST", "/recuento", { lineas: [{ productoId: pan, contado: 37 }] });

    expect(a.leer((d) => d.productos[0]!.stock)).toBe(37);
  });

  it("y deja el movimiento, con motivo", async () => {
    const pan = sembrar("Pan francés", 40);
    await pedir("POST", "/recuento", { lineas: [{ productoId: pan, contado: 37 }] });

    const mov = a.leer((d) => d.movimientos[0]);
    expect(mov?.tipo).toBe("ajuste");
    expect(mov?.cantidad).toBe(3);
    expect(mov?.stockResultante).toBe(37);
    expect(mov?.motivo).toMatch(/^Recuento del \d{4}-\d{2}-\d{2}$/);
  });

  it("lo que coincide no genera movimiento", async () => {
    const pan = sembrar("Pan francés", 40);

    await pedir("POST", "/recuento", { lineas: [{ productoId: pan, contado: 40 }] });

    // No pasó nada, así que no hay nada que anotar.
    expect(a.leer((d) => d.movimientos)).toHaveLength(0);
  });

  it("pero sí queda guardado en el recuento", async () => {
    const pan = sembrar("Pan francés", 40);
    const leche = sembrar("Leche", 12);

    const rec = (await pedir("POST", "/recuento", {
      lineas: [
        { productoId: pan, contado: 40 },
        { productoId: leche, contado: 9 },
      ],
    })) as { contados: number; coinciden: number; faltantes: number };

    // Sin los que dieron bien no se sabe si se contó el depósito entero o
    // solamente lo que fallaba.
    expect(rec.contados).toBe(2);
    expect(rec.coinciden).toBe(1);
    expect(rec.faltantes).toBe(1);
  });

  it("también sube el stock cuando sobra", async () => {
    const pan = sembrar("Pan francés", 40);

    const rec = (await pedir("POST", "/recuento", {
      lineas: [{ productoId: pan, contado: 45 }],
    })) as { sobrantes: number };

    expect(a.leer((d) => d.productos[0]!.stock)).toBe(45);
    expect(rec.sobrantes).toBe(1);
  });
});

describe("valorizar la diferencia", () => {
  it("dice cuánta plata falta, no solo cuántas unidades", async () => {
    // Catorce caramelos de $10 no son catorce tortas de $8.000.
    const caramelo = sembrar("Caramelo", 100, 10);
    const torta = sembrar("Torta", 10, 8000);

    const rec = (await pedir("POST", "/recuento", {
      lineas: [
        { productoId: caramelo, contado: 86 },
        { productoId: torta, contado: 9 },
      ],
    })) as { valorFaltante: number };

    // 14 caramelos × 10 = 140, más una torta × 8.000.
    expect(rec.valorFaltante).toBe(8140);
  });

  it("un producto por peso se valoriza por kilo, no por gramo", async () => {
    // Diez kilos de pan a $1.400 el kilo. Faltan 500 gramos: son $700.
    const pan = sembrar("Pan francés", 10_000, 1400, true);

    const rec = (await pedir("POST", "/recuento", {
      lineas: [{ productoId: pan, contado: 9500 }],
    })) as { valorFaltante: number };

    expect(rec.valorFaltante).toBe(700);
  });
});

describe("lo que no se acepta", () => {
  it("contar en negativo", async () => {
    const pan = sembrar("Pan francés", 40);

    await expect(
      pedir("POST", "/recuento", { lineas: [{ productoId: pan, contado: -5 }] })
    ).rejects.toThrow(/negativo/i);
  });

  it("un recuento vacío", async () => {
    await expect(pedir("POST", "/recuento", { lineas: [] })).rejects.toThrow(/ningún producto/i);
  });

  it("y si una línea falla, no se aplica ninguna", async () => {
    const pan = sembrar("Pan francés", 40);
    const leche = sembrar("Leche", 12);

    await expect(
      pedir("POST", "/recuento", {
        lineas: [
          { productoId: pan, contado: 37 },
          { productoId: leche, contado: -1 },
        ],
      })
    ).rejects.toThrow();

    // El pan no se tocó: o entra el recuento entero, o no entra nada.
    expect(a.leer((d) => d.productos[0]!.stock)).toBe(40);
    expect(a.leer((d) => d.recuentos)).toHaveLength(0);
  });
});

describe("el historial", () => {
  it("guarda los recuentos hechos, del más nuevo al más viejo", async () => {
    const pan = sembrar("Pan francés", 40);

    await pedir("POST", "/recuento", { lineas: [{ productoId: pan, contado: 38 }] });
    await pedir("POST", "/recuento", { lineas: [{ productoId: pan, contado: 38 }] });

    const lista = (await pedir("GET", "/recuento")) as unknown as {
      contados: number;
    }[];
    expect(lista).toHaveLength(2);
  });
});
