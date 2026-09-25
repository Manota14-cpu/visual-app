import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { rutasCaja } from "../servidor/api/caja.ts";
import { rutasCatalogo } from "../servidor/api/catalogo.ts";
import { rutasInformes } from "../servidor/api/informes.ts";
import { rutasPanel } from "../servidor/api/panel.ts";
import { Ruteador } from "../servidor/http.ts";
import type { Producto } from "../servidor/tipos.ts";

/**
 * Lo que encontró la auditoría en los números que se muestran.
 *
 * Gramos y unidades mezclados en listas que no los separaban: una categoría
 * con 187 unidades y 15,9 kg decía "16.087", y el pan francés figuraba con
 * "5.050 unidades" vendidas.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;

async function pedir(metodo: string, camino: string, cuerpo: Record<string, unknown> = {}) {
  const { resultado } = await r.resolver(metodo, camino, new URLSearchParams(), cuerpo);
  return resultado as Record<string, unknown>;
}

function sembrar(nombre: string, stock: number, porPeso: boolean, minimo = 0): string {
  const id = nuevoId();
  const ahora = new Date().toISOString();
  const categoria = a.leer((d) => d.categorias[0]!.id);
  a.escribir((d) => {
    d.productos.push({
      id,
      categoriaId: categoria,
      nombre,
      descripcion: null,
      sku: null,
      codigoBarras: null,
      unidadMedida: porPeso ? "kg" : "unidad",
      porPeso,
      precioCosto: 500,
      precioVenta: 1000,
      precioMayorista: null,
      cantidadMayoristaMin: null,
      stock,
      stockMinimo: minimo,
      proveedorId: null,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora,
    } satisfies Producto);
  });
  return id;
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-auditoria-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasPanel(r, a);
  rutasCaja(r, a);
  rutasInformes(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("el panel no mezcla gramos con unidades", () => {
  it("el stock por categoría los separa", async () => {
    sembrar("Pan francés", 15_900, true);
    sembrar("Leche", 187, false);

    const panel = (await pedir("GET", "/panel")) as {
      stockPorCategoria: { productos: number; unidades: number; gramos: number }[];
    };
    const general = panel.stockPorCategoria[0]!;

    expect(general.productos).toBe(2);
    expect(general.unidades).toBe(187);
    expect(general.gramos).toBe(15_900);
  });

  it("lo que hay que reponer dice si son gramos", async () => {
    sembrar("Factura surtida", 1450, true, 2000);

    const panel = (await pedir("GET", "/panel")) as {
      criticos: { stock: number; porPeso: boolean }[];
    };
    expect(panel.criticos[0]!.porPeso).toBe(true);
  });
});

describe("el informe", () => {
  it("dice si lo vendido de un producto son gramos", async () => {
    const pan = sembrar("Pan francés", 20_000, true);
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };
    await pedir("POST", "/caja/cobrar", {
      cajaId: caja.id,
      items: [{ productoId: pan, nombre: "Pan francés", precio: 1000, cantidad: 5050 }],
      pagos: [{ metodo: "efectivo", monto: 5050 }],
    });

    const informe = (await pedir("GET", "/informes")) as {
      porProducto: { unidades: number; porPeso: boolean }[];
    };
    expect(informe.porProducto[0]!.unidades).toBe(5050);
    expect(informe.porProducto[0]!.porPeso).toBe(true);
  });

  it("agrupa las ventas por quien las hizo", async () => {
    const leche = sembrar("Leche", 100, false);
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };

    // Dos ventas, sin usuarios: quedan sin identificar, no repartidas.
    for (const descuento of [0, 200]) {
      await pedir("POST", "/caja/cobrar", {
        cajaId: caja.id,
        descuento,
        items: [{ productoId: leche, nombre: "Leche", precio: 1000, cantidad: 2 }],
        pagos: [{ metodo: "efectivo", monto: 2000 - descuento }],
      });
    }

    const informe = (await pedir("GET", "/informes")) as {
      porUsuario: { usuario: string; ventas: number; vendido: number; descuentos: number }[];
    };

    expect(informe.porUsuario).toHaveLength(1);
    expect(informe.porUsuario[0]!.usuario).toBe("Sin identificar");
    expect(informe.porUsuario[0]!.ventas).toBe(2);
    expect(informe.porUsuario[0]!.vendido).toBe(3800);
    expect(informe.porUsuario[0]!.descuentos).toBe(200);
  });
});

describe("los códigos para las etiquetas", () => {
  it("no le inventa uno al que ya trae el de fábrica", async () => {
    rutasCatalogo(r, a);
    const pan = sembrar("Pan francés", 1000, true);
    const gaseosa = sembrar("Gaseosa", 10, false);
    a.escribir((d) => {
      d.productos.find((p) => p.id === gaseosa)!.codigoBarras = "7790895000997";
    });

    const todas = (await pedir("POST", "/productos/skus/proponer")) as unknown as { id: string }[];
    const paraEtiquetas = (await pedir("POST", "/productos/skus/proponer", {
      soloSinCodigo: true,
    })) as unknown as { id: string; sku: string }[];

    expect(todas.map((p) => p.id).sort()).toEqual([pan, gaseosa].sort());
    expect(paraEtiquetas.map((p) => p.id)).toEqual([pan]);
    expect(paraEtiquetas[0]!.sku).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-\d{3}$/);
  });
});
