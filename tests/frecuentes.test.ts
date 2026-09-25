import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { rutasCaja } from "../servidor/api/caja.ts";
import { rutasCatalogo } from "../servidor/api/catalogo.ts";
import { Ruteador } from "../servidor/http.ts";
import type { Producto } from "../servidor/tipos.ts";

/**
 * Lo que la caja ofrece a un toque.
 *
 * Tiene que ser lo que se pide seguido y nada más: un producto dado de baja,
 * una devolución o algo vendido hace meses en ese lugar son un botón que miente.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;
let cajaId: string;

async function llamar(metodo: string, camino: string, cuerpo: Record<string, unknown> = {}) {
  const { resultado } = await r.resolver(metodo, camino, new URLSearchParams(), cuerpo);
  return resultado as Record<string, unknown>;
}

function sembrar(nombre: string, precio = 1000, stock = 100): string {
  const id = nuevoId();
  const ahora = new Date().toISOString();
  a.escribir((d) => {
    const producto: Producto = {
      id,
      categoriaId: null,
      nombre,
      descripcion: null,
      sku: null,
      codigoBarras: null,
      unidadMedida: "unidad",
      porPeso: false,
      precioCosto: precio / 2,
      precioVenta: precio,
      precioMayorista: null,
      cantidadMayoristaMin: null,
      stock,
      stockMinimo: 0,
      proveedorId: null,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    d.productos.push(producto);
  });
  return id;
}

/** Una venta de mostrador con una unidad de cada producto. */
async function vender(...ids: string[]) {
  const items = ids.map((id) => {
    const p = a.leer((d) => d.productos.find((x) => x.id === id)!);
    return { productoId: id, nombre: p.nombre, precio: p.precioVenta, cantidad: 1 };
  });
  const total = items.reduce((s, i) => s + i.precio, 0);
  return llamar("POST", "/caja/cobrar", { cajaId, items, pagos: [{ metodo: "efectivo", monto: total }] });
}

async function frecuentes(): Promise<string[]> {
  const lista = (await llamar("GET", "/productos/frecuentes")) as unknown as { nombre: string }[];
  return lista.map((p) => p.nombre);
}

beforeEach(async () => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-prueba-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasCatalogo(r, a);
  rutasCaja(r, a);
  cajaId = (await llamar("POST", "/caja/abrir", { fondo: 0 })).id as string;
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("lo que más se vende, a un toque", () => {
  it("ordena por cuántas ventas lo llevaron, no por cuántas unidades", async () => {
    const pan = sembrar("Pan");
    const leche = sembrar("Leche");
    const yerba = sembrar("Yerba");

    await vender(pan, leche);
    await vender(pan);
    await vender(pan, yerba);
    await vender(leche);

    expect(await frecuentes()).toEqual(["Pan", "Leche", "Yerba"]);
  });

  it("no ofrece lo que nunca se vendió", async () => {
    sembrar("Nunca vendido");
    const pan = sembrar("Pan");
    await vender(pan);

    expect(await frecuentes()).toEqual(["Pan"]);
  });

  it("deja afuera lo dado de baja, lo cancelado y lo de hace más de un mes", async () => {
    const pan = sembrar("Pan");
    const viejo = sembrar("Viejo");
    const baja = sembrar("Dado de baja");
    const cancelado = sembrar("Cancelado");

    await vender(pan);
    await vender(viejo);
    await vender(baja);
    const venta = await vender(cancelado);

    a.escribir((d) => {
      const hace40Dias = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      for (const p of d.pedidos) {
        if (p.items.some((i) => i.productoId === viejo)) p.creadoEn = hace40Dias;
        if (p.id === venta.id) p.estado = "cancelado";
      }
      d.productos.find((p) => p.id === baja)!.activo = false;
    });

    expect(await frecuentes()).toEqual(["Pan"]);
  });

  it("no cuenta las devoluciones", async () => {
    const pan = sembrar("Pan");
    const leche = sembrar("Leche");
    await vender(pan);
    await vender(leche);

    a.escribir((d) => {
      const venta = d.pedidos.find((p) => p.items.some((i) => i.productoId === pan))!;
      d.pedidos.push({ ...venta, id: nuevoId(), numero: 99, canal: "devolucion", total: -venta.total });
      d.pedidos.push({ ...venta, id: nuevoId(), numero: 100, canal: "devolucion", total: -venta.total });
    });

    // Con las devoluciones contadas, Pan tendría tres "ventas" y quedaría
    // primero; sin ellas empata con Leche y gana lo último vendido.
    expect(await frecuentes()).toEqual(["Leche", "Pan"]);
  });

  it("devuelve lo mismo que el buscador, para agregarlo igual", async () => {
    const pan = sembrar("Pan", 2800, 40);
    await vender(pan);

    const [primero] = (await llamar("GET", "/productos/frecuentes")) as unknown as Record<string, unknown>[];
    expect(primero).toMatchObject({ id: pan, nombre: "Pan", precio: 2800, stock: 39, porPeso: false });
  });

  it("ofrece ocho como mucho", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => sembrar(`Producto ${i}`));
    for (const id of ids) await vender(id);

    expect(await frecuentes()).toHaveLength(8);
  });
});
