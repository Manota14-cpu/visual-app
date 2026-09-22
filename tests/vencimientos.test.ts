import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { rutasPanel } from "../servidor/api/panel.ts";
import { diasHasta, rutasVencimientos } from "../servidor/api/vencimientos.ts";
import { Ruteador } from "../servidor/http.ts";
import type { Producto } from "../servidor/tipos.ts";

/**
 * Lo que se vence.
 *
 * Dos cosas que importan: que la cuenta de días no se corra —una fecha es un
 * día del calendario, no un instante— y que tirar algo descuente el stock. Si
 * alguien tira la leche y el sistema sigue creyendo que está en la heladera,
 * el problema es el mismo de antes pero al revés.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;

async function pedir(metodo: string, camino: string, cuerpo: Record<string, unknown> = {}) {
  const { resultado } = await r.resolver(metodo, camino, new URLSearchParams(), cuerpo);
  return resultado as Record<string, unknown>;
}

function sembrar(nombre: string, stock: number, porPeso = false): string {
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
      precioCosto: 100,
      precioVenta: 200,
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

/** Una fecha a tantos días de hoy, en aaaa-mm-dd local. */
function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-vencimientos-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasVencimientos(r, a);
  rutasPanel(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("contar los días", () => {
  it("hoy es cero, no menos uno", () => {
    // Una fecha es un día del calendario. Leerla como instante UTC la corre
    // un día para atrás en Argentina, y "vence hoy" pasaría a decir "vencido".
    expect(diasHasta(enDias(0))).toBe(0);
  });

  it("mañana, pasado y ayer", () => {
    expect(diasHasta(enDias(1))).toBe(1);
    expect(diasHasta(enDias(2))).toBe(2);
    expect(diasHasta(enDias(-1))).toBe(-1);
  });
});

describe("anotar una partida", () => {
  it("queda con su fecha y su cantidad", async () => {
    const leche = sembrar("Leche entera 1L", 40);

    const p = (await pedir("POST", "/vencimientos", {
      productoId: leche,
      fecha: enDias(3),
      cantidad: 12,
    })) as { dias: number; cantidad: number };

    expect(p.dias).toBe(3);
    expect(p.cantidad).toBe(12);
  });

  it("dos partidas del mismo producto conviven", async () => {
    // La leche que vence el martes y la que vence en tres semanas son el mismo
    // producto: un solo campo "vence el" obligaría a mentir en una de las dos.
    const leche = sembrar("Leche entera 1L", 40);

    await pedir("POST", "/vencimientos", { productoId: leche, fecha: enDias(2), cantidad: 6 });
    await pedir("POST", "/vencimientos", { productoId: leche, fecha: enDias(20), cantidad: 34 });

    const lista = (await pedir("GET", "/vencimientos")) as { items: { dias: number }[] };
    expect(lista.items).toHaveLength(2);
    // De la que vence primero a la que vence último.
    expect(lista.items[0]!.dias).toBe(2);
  });

  it("no se anota sin fecha ni sin cantidad", async () => {
    const leche = sembrar("Leche entera 1L", 40);

    await expect(
      pedir("POST", "/vencimientos", { productoId: leche, cantidad: 5 })
    ).rejects.toThrow(/fecha/i);

    await expect(
      pedir("POST", "/vencimientos", { productoId: leche, fecha: enDias(3), cantidad: 0 })
    ).rejects.toThrow(/cuánto/i);
  });
});

describe("tirar lo vencido", () => {
  it("descuenta el stock y deja el movimiento", async () => {
    const leche = sembrar("Leche entera 1L", 40);
    const p = (await pedir("POST", "/vencimientos", {
      productoId: leche,
      fecha: enDias(-1),
      cantidad: 6,
    })) as { id: string };

    await pedir("POST", `/vencimientos/${p.id}/tirar`, {});

    expect(a.leer((d) => d.productos[0]!.stock)).toBe(34);

    const mov = a.leer((d) => d.movimientos[0]);
    expect(mov?.tipo).toBe("salida");
    expect(mov?.cantidad).toBe(6);
    expect(mov?.motivo).toMatch(/^Vencido el /);
  });

  it("tirar parte deja el resto anotado", async () => {
    const leche = sembrar("Leche entera 1L", 40);
    const p = (await pedir("POST", "/vencimientos", {
      productoId: leche,
      fecha: enDias(-1),
      cantidad: 6,
    })) as { id: string };

    await pedir("POST", `/vencimientos/${p.id}/tirar`, { cantidad: 2 });

    expect(a.leer((d) => d.productos[0]!.stock)).toBe(38);
    expect(a.leer((d) => d.vencimientos[0]!.cantidad)).toBe(4);
  });

  it("y tirar todo la saca de la lista", async () => {
    const leche = sembrar("Leche entera 1L", 40);
    const p = (await pedir("POST", "/vencimientos", {
      productoId: leche,
      fecha: enDias(-1),
      cantidad: 6,
    })) as { id: string };

    await pedir("POST", `/vencimientos/${p.id}/tirar`, { cantidad: 6 });
    expect(a.leer((d) => d.vencimientos)).toHaveLength(0);
  });

  it("sacarla sin tirar no toca el stock", async () => {
    // Se vendió a tiempo: la partida ya no está, pero nadie tiró nada.
    const leche = sembrar("Leche entera 1L", 40);
    const p = (await pedir("POST", "/vencimientos", {
      productoId: leche,
      fecha: enDias(2),
      cantidad: 6,
    })) as { id: string };

    await pedir("DELETE", `/vencimientos/${p.id}`);

    expect(a.leer((d) => d.productos[0]!.stock)).toBe(40);
    expect(a.leer((d) => d.movimientos)).toHaveLength(0);
  });
});

describe("el aviso", () => {
  it("separa lo vencido de lo que está por vencer", async () => {
    const leche = sembrar("Leche entera 1L", 40);

    await pedir("POST", "/vencimientos", { productoId: leche, fecha: enDias(-2), cantidad: 1 });
    await pedir("POST", "/vencimientos", { productoId: leche, fecha: enDias(3), cantidad: 1 });
    // Este falta mucho: no es urgente.
    await pedir("POST", "/vencimientos", { productoId: leche, fecha: enDias(60), cantidad: 1 });

    const lista = (await pedir("GET", "/vencimientos")) as {
      vencidos: number;
      porVencer: number;
    };
    expect(lista.vencidos).toBe(1);
    expect(lista.porVencer).toBe(1);

    const panel = (await pedir("GET", "/panel")) as {
      pendientes: { vencidos: number; porVencer: number };
    };
    expect(panel.pendientes.vencidos).toBe(1);
    expect(panel.pendientes.porVencer).toBe(1);
  });

  it("el filtro de urgentes deja afuera lo que falta mucho", async () => {
    const leche = sembrar("Leche entera 1L", 40);
    await pedir("POST", "/vencimientos", { productoId: leche, fecha: enDias(3), cantidad: 1 });
    await pedir("POST", "/vencimientos", { productoId: leche, fecha: enDias(60), cantidad: 1 });

    const { resultado } = await r.resolver(
      "GET",
      "/vencimientos",
      new URLSearchParams("estado=urgentes"),
      {}
    );
    expect((resultado as { items: unknown[] }).items).toHaveLength(1);
  });
});
