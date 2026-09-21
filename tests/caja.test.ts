import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { rutasCaja } from "../servidor/api/caja.ts";
import { Ruteador } from "../servidor/http.ts";
import type { Producto } from "../servidor/tipos.ts";

/**
 * El mostrador, probado de punta a punta.
 *
 * Un cobro toca cuatro cosas a la vez —la venta, sus pagos, el stock de cada
 * renglón y el turno— y `almacen.escribir` es lo único que impide que queden a
 * medias. Es el reemplazo de una transacción de base de datos y hasta acá no
 * tenía una sola prueba: el error de la devolución con los importes al revés
 * salió justamente de esta zona.
 *
 * Las pruebas usan las rutas de verdad contra un archivo de verdad en una
 * carpeta temporal. Probar las funciones sueltas no serviría: lo que hay que
 * verificar es que la operación entera se deshaga.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;

function llamar(metodo: string, camino: string, cuerpo: Record<string, unknown> = {}) {
  return r.resolver(metodo, camino, new URLSearchParams(), cuerpo);
}

async function post(camino: string, cuerpo: Record<string, unknown> = {}) {
  const { resultado } = await llamar("POST", camino, cuerpo);
  return resultado as Record<string, unknown>;
}

async function get(camino: string) {
  const { resultado } = await llamar("GET", camino);
  return resultado as Record<string, unknown>;
}

/** Un producto mínimo, con el stock que haga falta para la prueba. */
function sembrar(nombre: string, stock: number, precio: number): string {
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
      precioCosto: Math.round(precio / 2),
      precioVenta: precio,
      precioMayorista: null,
      cantidadMayoristaMin: null,
      stock,
      stockMinimo: 0,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    d.productos.push(producto);
  });

  return id;
}

function stockDe(id: string): number {
  return a.leer((d) => d.productos.find((p) => p.id === id)?.stock ?? -1);
}

async function abrirCaja(fondo = 10_000): Promise<string> {
  const caja = await post("/caja/abrir", { fondo });
  return caja.id as string;
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-prueba-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasCaja(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

// ─────────────────────────────────  Cobrar  ─────────────────────────────────

describe("cobrar en el mostrador", () => {
  it("descuenta el stock, deja la venta y devuelve el vuelto", async () => {
    const cajaId = await abrirCaja();
    const coca = sembrar("Coca-Cola 1.5L", 10, 2380);

    const venta = await post("/caja/cobrar", {
      cajaId,
      items: [{ productoId: coca, nombre: "Coca-Cola 1.5L", precio: 2380, cantidad: 2 }],
      pagos: [{ metodo: "efectivo", monto: 4760 }],
      recibido: 5000,
    });

    expect(venta.total).toBe(4760);
    expect(venta.vuelto).toBe(240);
    expect(stockDe(coca)).toBe(8);

    const pedidos = a.leer((d) => d.pedidos);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]!.items).toHaveLength(1);

    // El movimiento de stock no es opcional: sin él, "¿por qué me faltan dos?"
    // no se puede contestar.
    const movimientos = a.leer((d) => d.movimientos.filter((m) => m.tipo === "venta"));
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]!.stockResultante).toBe(8);
  });

  it("no acepta un cobro que no cierra con el total", async () => {
    const cajaId = await abrirCaja();
    const coca = sembrar("Coca-Cola 1.5L", 10, 2380);

    await expect(
      post("/caja/cobrar", {
        cajaId,
        items: [{ productoId: coca, nombre: "Coca-Cola 1.5L", precio: 2380, cantidad: 2 }],
        pagos: [{ metodo: "efectivo", monto: 4000 }],
      })
    ).rejects.toThrow(/no coincide/i);

    expect(stockDe(coca)).toBe(10);
    expect(a.leer((d) => d.pedidos)).toHaveLength(0);
  });

  it("reparte una venta pagada mitad y mitad y la etiqueta como mixta", async () => {
    const cajaId = await abrirCaja(0);
    const coca = sembrar("Coca-Cola 1.5L", 10, 1000);

    await post("/caja/cobrar", {
      cajaId,
      items: [{ productoId: coca, nombre: "Coca-Cola 1.5L", precio: 1000, cantidad: 3 }],
      pagos: [
        { metodo: "efectivo", monto: 1000 },
        { metodo: "tarjeta", monto: 2000 },
      ],
    });

    const vista = await get("/caja");
    const totales = vista.totales as Record<string, number>;

    // El cajón recibió solo la parte en efectivo, no los tres mil.
    expect(totales.efectivo).toBe(1000);
    expect(totales.tarjeta).toBe(2000);
    expect(totales.total).toBe(3000);
    expect(vista.esperado).toBe(1000);
    expect(a.leer((d) => d.pedidos[0]!.metodoPago)).toBe("mixto");
  });

  it("no deja cobrar sin un turno abierto", async () => {
    const coca = sembrar("Coca-Cola 1.5L", 10, 2380);

    await expect(
      post("/caja/cobrar", {
        cajaId: "no-existe",
        items: [{ productoId: coca, nombre: "Coca-Cola 1.5L", precio: 2380, cantidad: 1 }],
        pagos: [{ metodo: "efectivo", monto: 2380 }],
      })
    ).rejects.toThrow();

    expect(stockDe(coca)).toBe(10);
  });
});

// ─────────────────  Lo que la transacción tiene que deshacer  ─────────────────

describe("una venta que falla no deja nada a medias", () => {
  it("no descuenta los renglones anteriores si al último no le alcanza el stock", async () => {
    const cajaId = await abrirCaja();
    const uno = sembrar("Alfajor", 50, 900);
    const dos = sembrar("Agua", 50, 700);
    const tres = sembrar("Cigarrillos", 1, 5000); // solo queda uno

    await expect(
      post("/caja/cobrar", {
        cajaId,
        items: [
          { productoId: uno, nombre: "Alfajor", precio: 900, cantidad: 4 },
          { productoId: dos, nombre: "Agua", precio: 700, cantidad: 3 },
          { productoId: tres, nombre: "Cigarrillos", precio: 5000, cantidad: 2 },
        ],
        pagos: [{ metodo: "efectivo", monto: 4 * 900 + 3 * 700 + 2 * 5000 }],
      })
    ).rejects.toThrow(/stock insuficiente/i);

    // Éste es el punto de toda la prueba: los dos primeros ya habían pasado por
    // ajustarStock cuando el tercero lanzó.
    expect(stockDe(uno)).toBe(50);
    expect(stockDe(dos)).toBe(50);
    expect(stockDe(tres)).toBe(1);

    expect(a.leer((d) => d.pedidos)).toHaveLength(0);
    expect(a.leer((d) => d.movimientos.filter((m) => m.tipo === "venta"))).toHaveLength(0);
    // El número de venta tampoco se consume: la próxima venta buena es la #1.
    expect(a.leer((d) => d.contadores.pedido)).toBe(0);
  });

  it("el archivo en disco queda como estaba, no a mitad de camino", async () => {
    const cajaId = await abrirCaja();
    const uno = sembrar("Alfajor", 5, 900);

    const antes = fs.readFileSync(a.archivo, "utf8");

    await expect(
      post("/caja/cobrar", {
        cajaId,
        items: [{ productoId: uno, nombre: "Alfajor", precio: 900, cantidad: 99 }],
        pagos: [{ metodo: "efectivo", monto: 89_100 }],
      })
    ).rejects.toThrow();

    expect(fs.readFileSync(a.archivo, "utf8")).toBe(antes);
    // Y el temporal no queda tirado.
    expect(fs.existsSync(`${a.archivo}.tmp`)).toBe(false);
  });
});

// ───────────────────────────────  Devoluciones  ───────────────────────────────

describe("devolver", () => {
  it("suma el stock de vuelta y resta del cajón", async () => {
    const cajaId = await abrirCaja(5000);
    const coca = sembrar("Coca-Cola 1.5L", 10, 2000);

    await post("/caja/cobrar", {
      cajaId,
      items: [{ productoId: coca, nombre: "Coca-Cola 1.5L", precio: 2000, cantidad: 3 }],
      pagos: [{ metodo: "efectivo", monto: 6000 }],
    });
    expect(stockDe(coca)).toBe(7);

    await post("/caja/devolver", {
      cajaId,
      items: [{ productoId: coca, nombre: "Coca-Cola 1.5L", precio: 2000, cantidad: 1 }],
      metodoPago: "efectivo",
    });

    expect(stockDe(coca)).toBe(8);

    const vista = await get("/caja");
    const totales = vista.totales as Record<string, number>;

    // Seis mil cobrados menos dos mil devueltos. Si la devolución se guardara
    // con el signo al derecho, acá daría 8000 y el cajón saltaría el doble.
    expect(totales.efectivo).toBe(4000);
    expect(totales.total).toBe(4000);
    expect(vista.esperado).toBe(9000); // 5000 de fondo + 4000
  });
});

// ─────────────────────────────────  Arqueo  ─────────────────────────────────

describe("el arqueo del cierre", () => {
  it("suma el fondo y los ingresos y resta los retiros", async () => {
    const cajaId = await abrirCaja(10_000);
    const coca = sembrar("Coca-Cola 1.5L", 10, 1000);

    await post("/caja/cobrar", {
      cajaId,
      items: [{ productoId: coca, nombre: "Coca-Cola 1.5L", precio: 1000, cantidad: 5 }],
      pagos: [{ metodo: "efectivo", monto: 5000 }],
    });

    await post("/caja/movimiento", { cajaId, tipo: "retiro", monto: 3000, motivo: "Pago al fletero" });
    await post("/caja/movimiento", { cajaId, tipo: "ingreso", monto: 500, motivo: "Cambio" });

    // 10.000 + 5.000 + 500 − 3.000
    const cierre = await post("/caja/cerrar", { cajaId, contado: 12_500 });

    expect(cierre.esperado).toBe(12_500);
    expect(cierre.diferencia).toBe(0);
    expect(cierre.retiros).toBe(3000);
    expect(cierre.ingresos).toBe(500);
  });

  it("marca el faltante cuando lo contado no llega a lo esperado", async () => {
    const cajaId = await abrirCaja(10_000);
    const cierre = await post("/caja/cerrar", { cajaId, contado: 9500 });

    expect(cierre.esperado).toBe(10_000);
    expect(cierre.diferencia).toBe(-500);
  });

  it("exige un motivo para sacar plata del cajón", async () => {
    const cajaId = await abrirCaja();

    await expect(post("/caja/movimiento", { cajaId, tipo: "retiro", monto: 1000 })).rejects.toThrow(
      /para qué fue/i
    );
  });

  it("guarda una copia al cerrar el turno", async () => {
    const cajaId = await abrirCaja();
    const antes = a.listarCopias().length;

    await post("/caja/cerrar", { cajaId, contado: 10_000 });

    expect(a.listarCopias().length).toBe(antes + 1);
  });

  it("no deja cerrar dos veces el mismo turno", async () => {
    const cajaId = await abrirCaja();
    await post("/caja/cerrar", { cajaId, contado: 10_000 });

    await expect(post("/caja/cerrar", { cajaId, contado: 10_000 })).rejects.toThrow(/ya está cerrada/i);
  });

  it("no deja abrir un turno con otro abierto", async () => {
    await abrirCaja();
    await expect(post("/caja/abrir", { fondo: 1000 })).rejects.toThrow(/ya hay una caja abierta/i);
  });
});
