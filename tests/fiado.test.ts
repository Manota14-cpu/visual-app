import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { rutasCaja } from "../servidor/api/caja.ts";
import { deudaTotal } from "../servidor/reglas.ts";
import { Ruteador } from "../servidor/http.ts";
import type { Producto } from "../servidor/tipos.ts";

/**
 * El fiado: plata del negocio que está en la calle.
 *
 * Es lo más delicado de la aplicación porque la deuda no se guarda como número:
 * se vuelve a deducir de las ventas y de los cobros cada vez que se la mira. Eso
 * evita que un saldo quede desincronizado de los hechos, pero obliga a que la
 * deducción esté bien en todos los casos — incluido el arqueo, donde una venta
 * fiada tiene que dejar el cajón como si esa venta no hubiera entrado.
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

function sembrarProducto(precio: number, stock = 100): string {
  const id = nuevoId();
  const ahora = new Date().toISOString();
  a.escribir((d) => {
    const p: Producto = {
      id,
      categoriaId: null,
      nombre: "Fideos",
      descripcion: null,
      sku: null,
      codigoBarras: null,
      unidadMedida: "unidad",
      porPeso: false,
      precioCosto: Math.round(precio / 2),
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
    d.productos.push(p);
  });
  return id;
}

function sembrarCliente(nombre = "Doña Rosa"): string {
  const id = nuevoId();
  a.escribir((d) => {
    d.clientes.push({
      id,
      nombre,
      telefono: null,
      email: null,
      ciudad: null,
      direccion: null,
      dniCuit: null,
      razonSocial: null,
      notas: null,
      activo: true,
      creadoEn: new Date().toISOString(),
    });
  });
  return id;
}

async function abrirCaja(fondo = 5000): Promise<string> {
  const caja = await post("/caja/abrir", { fondo });
  return caja.id as string;
}

/** Una venta fiada: se entrega `entrega` y el resto queda debiendo. */
async function fiar(cajaId: string, clienteId: string, total: number, entrega: number) {
  const producto = sembrarProducto(total);
  return post("/caja/cobrar", {
    cajaId,
    clienteId,
    fiar: true,
    items: [{ productoId: producto, nombre: "Fideos", precio: total, cantidad: 1 }],
    pagos: entrega > 0 ? [{ metodo: "efectivo", monto: entrega }] : [],
  });
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-fiado-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasCaja(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("fiar una venta", () => {
  it("exige un cliente: una deuda sin nombre no se cobra nunca", async () => {
    const cajaId = await abrirCaja();
    const producto = sembrarProducto(10_000);

    await expect(
      post("/caja/cobrar", {
        cajaId,
        fiar: true,
        items: [{ productoId: producto, nombre: "Fideos", precio: 10_000, cantidad: 1 }],
        pagos: [],
      })
    ).rejects.toThrow(/cliente/i);

    // Y no quedó nada a medias: ni venta, ni stock descontado.
    expect(a.leer((d) => d.pedidos)).toHaveLength(0);
    expect(a.leer((d) => d.productos[0]!.stock)).toBe(100);
  });

  it("descuenta el stock igual que cualquier venta", async () => {
    const cajaId = await abrirCaja();
    const cliente = sembrarCliente();
    await fiar(cajaId, cliente, 10_000, 0);

    // La mercadería salió del depósito aunque la plata no haya entrado.
    expect(a.leer((d) => d.productos[0]!.stock)).toBe(99);
    expect(a.leer((d) => d.pedidos)).toHaveLength(1);
  });

  it("deja debiendo lo que no se entregó", async () => {
    const cajaId = await abrirCaja();
    const cliente = sembrarCliente();

    const venta = await fiar(cajaId, cliente, 10_000, 4000);

    expect(venta.fiado).toBe(6000);
    expect(venta.deudaCliente).toBe(6000);
    expect(venta.vuelto).toBe(0);
  });

  it("no deja fiar una venta que se pagó entera", async () => {
    const cajaId = await abrirCaja();
    const cliente = sembrarCliente();

    await expect(fiar(cajaId, cliente, 10_000, 10_000)).rejects.toThrow(/se pago entera/i);
  });

  it("no deja entregar más que el total", async () => {
    const cajaId = await abrirCaja();
    const cliente = sembrarCliente();

    await expect(fiar(cajaId, cliente, 10_000, 12_000)).rejects.toThrow(/mas que el total/i);
  });

  it("sin fiar sigue exigiendo que la cuenta cierre", async () => {
    const cajaId = await abrirCaja();
    const producto = sembrarProducto(10_000);

    await expect(
      post("/caja/cobrar", {
        cajaId,
        items: [{ productoId: producto, nombre: "Fideos", precio: 10_000, cantidad: 1 }],
        pagos: [{ metodo: "efectivo", monto: 4000 }],
      })
    ).rejects.toThrow(/no coincide/i);
  });
});

describe("el cajón de una venta fiada", () => {
  it("solo recibe lo que se entregó, no el total", async () => {
    const cajaId = await abrirCaja(5000);
    const cliente = sembrarCliente();
    await fiar(cajaId, cliente, 10_000, 4000);

    const vista = await get("/caja");
    const totales = vista.totales as Record<string, number>;

    // La venta vale 10.000 y el informe la va a contar entera...
    expect(totales.total).toBe(10_000);
    // ...pero al cajón entraron 4.000, y eso es lo que tiene que cuadrar.
    expect(totales.efectivo).toBe(4000);
    expect(vista.esperado).toBe(9000); // 5000 de fondo + 4000
    expect(vista.fiadoDelTurno).toBe(6000);
  });

  it("una venta fiada sin entrega no mueve el cajón", async () => {
    const cajaId = await abrirCaja(5000);
    const cliente = sembrarCliente();
    await fiar(cajaId, cliente, 10_000, 0);

    const vista = await get("/caja");
    expect(vista.esperado).toBe(5000);
    expect(vista.fiadoDelTurno).toBe(10_000);
  });
});

describe("cobrar una deuda", () => {
  it("baja el saldo y sube el cajón", async () => {
    const cajaId = await abrirCaja(5000);
    const cliente = sembrarCliente();
    await fiar(cajaId, cliente, 10_000, 0);

    const cobro = await post("/caja/cobrar-fiado", {
      clienteId: cliente,
      monto: 4000,
      metodo: "efectivo",
    });

    expect(cobro.saldo).toBe(6000);

    const vista = await get("/caja");
    // El fondo más lo que trajo. La venta nunca pasó por el cajón.
    expect(vista.esperado).toBe(9000);
    expect(vista.cobradoDeFiado).toBe(4000);
    // Y no se confunde con lo cobrado por ventas del turno.
    expect((vista.totales as Record<string, number>).efectivo).toBe(0);
  });

  it("un pago por transferencia no toca el cajón", async () => {
    const cajaId = await abrirCaja(5000);
    const cliente = sembrarCliente();
    await fiar(cajaId, cliente, 10_000, 0);

    await post("/caja/cobrar-fiado", { clienteId: cliente, monto: 10_000, metodo: "transferencia" });

    const vista = await get("/caja");
    expect(vista.esperado).toBe(5000);
    expect(a.leer((d) => deudaTotal(d))).toBe(0);
  });

  it("no se puede cobrar más de lo que se debe", async () => {
    const cajaId = await abrirCaja();
    const cliente = sembrarCliente();
    await fiar(cajaId, cliente, 10_000, 0);

    await expect(
      post("/caja/cobrar-fiado", { clienteId: cliente, monto: 15_000, metodo: "efectivo" })
    ).rejects.toThrow(/no se puede cobrar de más/i);
  });

  it("no se le cobra a quien no debe nada", async () => {
    const cliente = sembrarCliente();
    await expect(
      post("/caja/cobrar-fiado", { clienteId: cliente, monto: 1000, metodo: "efectivo" })
    ).rejects.toThrow(/no tiene deuda/i);
  });

  it("se puede cobrar sin un turno abierto", async () => {
    const cajaId = await abrirCaja();
    const cliente = sembrarCliente();
    await fiar(cajaId, cliente, 10_000, 0);
    await post("/caja/cerrar", { cajaId, contado: 5000 });

    // La transferencia del domingo existe y no puede quedar sin anotar.
    const cobro = await post("/caja/cobrar-fiado", {
      clienteId: cliente,
      monto: 10_000,
      metodo: "transferencia",
    });

    expect(cobro.saldo).toBe(0);
    expect(cobro.enTurno).toBeNull();
  });

  it("varios pagos parciales cierran la cuenta", async () => {
    const cajaId = await abrirCaja();
    const cliente = sembrarCliente();
    await fiar(cajaId, cliente, 10_000, 0);

    await post("/caja/cobrar-fiado", { clienteId: cliente, monto: 3000, metodo: "efectivo" });
    await post("/caja/cobrar-fiado", { clienteId: cliente, monto: 3000, metodo: "efectivo" });
    const ultimo = await post("/caja/cobrar-fiado", {
      clienteId: cliente,
      monto: 4000,
      metodo: "efectivo",
    });

    expect(ultimo.saldo).toBe(0);
    expect(a.leer((d) => deudaTotal(d))).toBe(0);
  });
});

describe("la deuda se deduce de los hechos", () => {
  it("cancelar una venta fiada borra su deuda", async () => {
    const cajaId = await abrirCaja();
    const cliente = sembrarCliente();
    await fiar(cajaId, cliente, 10_000, 0);
    expect(a.leer((d) => deudaTotal(d))).toBe(10_000);

    a.escribir((d) => {
      d.pedidos[0]!.estado = "cancelado";
    });

    // La mercadería volvió: no hay nada que cobrar.
    expect(a.leer((d) => deudaTotal(d))).toBe(0);
  });

  it("suma la deuda de varios clientes", async () => {
    const cajaId = await abrirCaja();
    const rosa = sembrarCliente("Doña Rosa");
    const juan = sembrarCliente("Juan");

    await fiar(cajaId, rosa, 10_000, 0);
    await fiar(cajaId, juan, 5000, 2000);

    expect(a.leer((d) => deudaTotal(d))).toBe(13_000);
  });

  it("una venta común no genera deuda aunque tenga cliente", async () => {
    const cajaId = await abrirCaja();
    const cliente = sembrarCliente();
    const producto = sembrarProducto(10_000);

    await post("/caja/cobrar", {
      cajaId,
      clienteId: cliente,
      items: [{ productoId: producto, nombre: "Fideos", precio: 10_000, cantidad: 1 }],
      pagos: [{ metodo: "efectivo", monto: 10_000 }],
    });

    expect(a.leer((d) => deudaTotal(d))).toBe(0);
  });
});
