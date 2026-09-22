import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { rutasCaja } from "../servidor/api/caja.ts";
import { rutasInformes } from "../servidor/api/informes.ts";
import { Ruteador } from "../servidor/http.ts";
import type { Producto } from "../servidor/tipos.ts";

/**
 * Los descuentos.
 *
 * El descuento se guarda aparte y no bajando el precio de los renglones.
 * Bajando el precio la venta cierra igual, pero se pierde para siempre el dato
 * de que hubo descuento: después nadie puede saber cuánta plata se regaló, ni
 * enterarse de que alguien viene haciendo 20% todos los días.
 *
 * Y el informe tiene que restarlo. Sumar los renglones a secas haría que el
 * margen salga mejor de lo que fue, justo en el negocio que más descuenta.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;

async function pedir(metodo: string, camino: string, cuerpo: Record<string, unknown> = {}) {
  const { resultado } = await r.resolver(metodo, camino, new URLSearchParams(), cuerpo);
  return resultado as Record<string, unknown>;
}

function sembrar(nombre: string, venta: number, costo: number): string {
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
      unidadMedida: "unidad",
      porPeso: false,
      precioCosto: costo,
      precioVenta: venta,
      precioMayorista: null,
      cantidadMayoristaMin: null,
      stock: 100,
      stockMinimo: 0,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora,
    } satisfies Producto);
  });
  return id;
}

async function cobrar(cajaId: string, id: string, precio: number, cantidad: number, descuento = 0) {
  const total = precio * cantidad - descuento;
  return pedir("POST", "/caja/cobrar", {
    cajaId,
    descuento,
    items: [{ productoId: id, nombre: "Pan", precio, cantidad }],
    pagos: [{ metodo: "efectivo", monto: total }],
  });
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-descuentos-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasCaja(r, a);
  rutasInformes(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("cobrar con descuento", () => {
  it("el total es el subtotal menos el descuento", async () => {
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };
    const pan = sembrar("Pan", 1000, 400);

    const venta = (await cobrar(caja.id, pan, 1000, 10, 2000)) as { total: number };
    expect(venta.total).toBe(8000);
  });

  it("y queda guardado, no escondido en el precio", async () => {
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };
    const pan = sembrar("Pan", 1000, 400);

    await cobrar(caja.id, pan, 1000, 10, 2000);

    const guardada = a.leer((d) => d.pedidos[0]!);
    expect(guardada.descuento).toBe(2000);
    // El renglón mantiene su precio de lista: es lo que permite saber después
    // cuánto se regaló.
    expect(guardada.items[0]!.precio).toBe(1000);
  });

  it("no se puede descontar más que la venta", async () => {
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };
    const pan = sembrar("Pan", 1000, 400);

    await expect(cobrar(caja.id, pan, 1000, 2, 5000)).rejects.toThrow(/mayor que la venta/i);
  });

  it("ni en negativo, que sería cobrar de más", async () => {
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };
    const pan = sembrar("Pan", 1000, 400);

    await expect(cobrar(caja.id, pan, 1000, 2, -500)).rejects.toThrow(/negativo/i);
  });

  it("descontar todo deja la venta en cero y se puede cobrar", async () => {
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };
    const pan = sembrar("Pan", 1000, 400);

    const venta = (await pedir("POST", "/caja/cobrar", {
      cajaId: caja.id,
      descuento: 2000,
      items: [{ productoId: pan, nombre: "Pan", precio: 1000, cantidad: 2 }],
      pagos: [],
      fiar: false,
    })) as { total: number };

    expect(venta.total).toBe(0);
  });
});

describe("el turno", () => {
  it("dice cuánta plata se regaló", async () => {
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };
    const pan = sembrar("Pan", 1000, 400);

    await cobrar(caja.id, pan, 1000, 10, 2000);
    await cobrar(caja.id, pan, 1000, 5, 500);

    const vista = (await pedir("GET", "/caja")) as { descuentos: number; totales: { total: number } };
    expect(vista.descuentos).toBe(2500);
    // Y el total del turno es lo que de verdad entró.
    expect(vista.totales.total).toBe(8000 + 4500);
  });
});

describe("el informe", () => {
  it("resta los descuentos del ingreso", async () => {
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };
    const pan = sembrar("Pan", 1000, 400);

    await cobrar(caja.id, pan, 1000, 10, 2000);

    const informe = (await pedir("GET", "/informes")) as {
      ventas: { ingreso: number; aPrecioDeLista: number; descuentos: number; margen: number };
    };

    expect(informe.ventas.aPrecioDeLista).toBe(10_000);
    expect(informe.ventas.descuentos).toBe(2000);
    expect(informe.ventas.ingreso).toBe(8000);
  });

  it("y por eso el margen no sale mejor de lo que fue", async () => {
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };
    const pan = sembrar("Pan", 1000, 400);

    // Diez panes: $10.000 de venta, $4.000 de costo. Sin descuento el margen
    // sería 60%. Con $2.000 de descuento entran 8.000 y el margen real es 50%.
    await cobrar(caja.id, pan, 1000, 10, 2000);

    const informe = (await pedir("GET", "/informes")) as {
      ventas: { ingreso: number; costo: number; margen: number };
    };

    expect(informe.ventas.costo).toBe(4000);
    expect(informe.ventas.margen).toBe(50);
  });

  it("sin descuentos, nada cambia", async () => {
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };
    const pan = sembrar("Pan", 1000, 400);

    await cobrar(caja.id, pan, 1000, 10);

    const informe = (await pedir("GET", "/informes")) as {
      ventas: { ingreso: number; descuentos: number; margen: number };
    };

    expect(informe.ventas.descuentos).toBe(0);
    expect(informe.ventas.ingreso).toBe(10_000);
    expect(informe.ventas.margen).toBe(60);
  });
});
