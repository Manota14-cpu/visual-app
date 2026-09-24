import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen } from "../servidor/almacen.ts";
import { rutasCaja } from "../servidor/api/caja.ts";
import { rutasCatalogo } from "../servidor/api/catalogo.ts";
import { rutasClientes } from "../servidor/api/clientes.ts";
import { rutasPedidos } from "../servidor/api/pedidos.ts";
import { rutasProveedores } from "../servidor/api/proveedores.ts";
import { rutasRecuento } from "../servidor/api/recuento.ts";
import { rutasTraspaso } from "../servidor/api/traspaso.ts";
import { rutasVencimientos } from "../servidor/api/vencimientos.ts";
import { Respuesta, Ruteador } from "../servidor/http.ts";

/**
 * Los errores que encontró la revisión a fondo, uno por prueba.
 *
 * Cada uno costaba plata o stock sin que nada avisara: un descuento que se
 * perdía al editar, una deuda que desaparecía, pan que pasaba a venderse por
 * unidad al importar una planilla.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;

async function pedir(metodo: string, camino: string, cuerpo: Record<string, unknown> = {}) {
  const { resultado } = await r.resolver(metodo, camino, new URLSearchParams(), cuerpo);
  return resultado as Record<string, unknown>;
}

/** Espera un error de negocio y devuelve su mensaje. */
async function falla(metodo: string, camino: string, cuerpo: Record<string, unknown> = {}) {
  try {
    const resultado = await pedir(metodo, camino, cuerpo);
    if (resultado instanceof Respuesta && resultado.estado >= 400) {
      return String((resultado.cuerpo as { error: string }).error);
    }
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`${metodo} ${camino} no falló`);
}

async function producto(nombre: string, precio: number, stock: number, porPeso = false, extra = {}) {
  return (await pedir("POST", "/productos", {
    nombre,
    precioVenta: precio,
    precioCosto: Math.round(precio / 2),
    stock,
    porPeso,
    ...extra,
  })) as { id: string; stock: number; porPeso: boolean };
}

let caja: { id: string };
let cliente: { id: string };

beforeEach(async () => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-errores-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasCatalogo(r, a);
  rutasCaja(r, a);
  rutasPedidos(r, a);
  rutasClientes(r, a);
  rutasProveedores(r, a);
  rutasRecuento(r, a);
  rutasTraspaso(r, a);
  rutasVencimientos(r, a);
  caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };
  cliente = (await pedir("POST", "/clientes", { nombre: "Doña Rosa" })) as { id: string };
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

const debe = async () => ((await pedir("GET", `/clientes/${cliente.id}`)) as { debe: number }).debe;

describe("editar una venta", () => {
  it("conserva el descuento que se hizo al cobrar", async () => {
    const leche = await producto("Leche", 1000, 10);
    const venta = (await pedir("POST", "/caja/cobrar", {
      cajaId: caja.id,
      descuento: 300,
      items: [{ productoId: leche.id, nombre: "Leche", precio: 1000, cantidad: 2 }],
      pagos: [{ metodo: "efectivo", monto: 1700 }],
    })) as { id: string };

    const editada = (await pedir("PUT", `/pedidos/${venta.id}`, {
      items: [{ productoId: leche.id, nombre: "Leche", precio: 1000, cantidad: 2 }],
    })) as { total: number; pagos: { monto: number }[] };

    expect(editada.total).toBe(1700);
    expect(editada.pagos[0]!.monto).toBe(1700);
  });

  it("no da por pagada una venta fiada con entrega", async () => {
    const leche = await producto("Leche", 1000, 10);
    const venta = (await pedir("POST", "/caja/cobrar", {
      cajaId: caja.id,
      fiar: true,
      clienteId: cliente.id,
      items: [{ productoId: leche.id, nombre: "Leche", precio: 1000, cantidad: 3 }],
      pagos: [{ metodo: "efectivo", monto: 1000 }],
    })) as { id: string };
    expect(await debe()).toBe(2000);

    await pedir("PUT", `/pedidos/${venta.id}`, {
      items: [{ productoId: leche.id, nombre: "Leche", precio: 1000, cantidad: 3 }],
    });

    expect(await debe()).toBe(2000);
  });
});

describe("devolver algo que se llevó fiado", () => {
  it("a cuenta baja la deuda y no saca plata del cajón", async () => {
    const leche = await producto("Leche", 1000, 10);
    await pedir("POST", "/caja/cobrar", {
      cajaId: caja.id,
      fiar: true,
      clienteId: cliente.id,
      items: [{ productoId: leche.id, nombre: "Leche", precio: 1000, cantidad: 3 }],
      pagos: [],
    });
    const cajonAntes = ((await pedir("GET", "/caja")) as { esperado: number }).esperado;

    await pedir("POST", "/caja/devolver", {
      cajaId: caja.id,
      clienteId: cliente.id,
      aCuenta: true,
      items: [{ productoId: leche.id, nombre: "Leche", precio: 1000, cantidad: 1 }],
    });

    const turno = (await pedir("GET", "/caja")) as { esperado: number; cobradoDeFiado: number };
    expect(await debe()).toBe(2000);
    expect(turno.esperado).toBe(cajonAntes);
    // No es plata que entró: el turno no lo cuenta como cobrado.
    expect(turno.cobradoDeFiado).toBe(0);
  });

  it("a cuenta no se puede devolver más de lo que debe", async () => {
    const leche = await producto("Leche", 1000, 10);
    await pedir("POST", "/caja/cobrar", {
      cajaId: caja.id,
      fiar: true,
      clienteId: cliente.id,
      items: [{ productoId: leche.id, nombre: "Leche", precio: 1000, cantidad: 1 }],
      pagos: [],
    });

    const mensaje = await falla("POST", "/caja/devolver", {
      cajaId: caja.id,
      clienteId: cliente.id,
      aCuenta: true,
      items: [{ productoId: leche.id, nombre: "Leche", precio: 1000, cantidad: 3 }],
    });
    expect(mensaje).toMatch(/debe/);
  });
});

describe("la venta por peso", () => {
  it("sobrevive a exportar e importar el catálogo", async () => {
    const pan = await producto("Pan francés", 3200, 20_000, true);
    const exportado = (await pedir("GET", "/catalogo/exportar")) as { contenido: string };

    await pedir("POST", "/catalogo/importar/aplicar", { texto: exportado.contenido, crearFaltantes: false });

    const despues = (await pedir("GET", `/productos/${pan.id}`)) as { porPeso: boolean; stock: number };
    expect(despues.porPeso).toBe(true);
    expect(despues.stock).toBe(20_000);
  });

  it("no se cambia con stock cargado", async () => {
    const leche = await producto("Leche", 1000, 10);
    const mensaje = await falla("PUT", `/productos/${leche.id}`, {
      nombre: "Leche",
      precioVenta: 1000,
      porPeso: true,
    });
    expect(mensaje).toMatch(/stock/);
  });
});

describe("el recuento", () => {
  it("no deshace lo que se vendió mientras se contaba", async () => {
    const leche = await producto("Leche", 1000, 10);

    // La planilla dice 10. Mientras se cuenta, se venden 2.
    await pedir("POST", "/caja/cobrar", {
      cajaId: caja.id,
      items: [{ productoId: leche.id, nombre: "Leche", precio: 1000, cantidad: 2 }],
      pagos: [{ metodo: "efectivo", monto: 2000 }],
    });

    // En la estantería se contaron 9 (faltaba una desde antes de la venta).
    await pedir("POST", "/recuento", {
      lineas: [{ productoId: leche.id, contado: 9, esperado: 10 }],
    });

    const despues = (await pedir("GET", `/productos/${leche.id}`)) as { stock: number };
    expect(despues.stock).toBe(7);
  });
});

describe("proveedores", () => {
  it("borrar una compra ya pagada no deja la cuenta a favor", async () => {
    const molino = (await pedir("POST", "/proveedores", { nombre: "Molino" })) as { id: string };
    const { compra } = (await pedir("POST", "/compras", {
      proveedorId: molino.id,
      detalle: "Harina",
      total: 5000,
      entrega: 2000,
    })) as { compra: { id: string } };

    const mensaje = await falla("DELETE", `/compras/${compra.id}`);
    expect(mensaje).toMatch(/Gastos/);
  });
});

describe("vencimientos", () => {
  it("se puede tirar una partida aunque parte ya se haya vendido", async () => {
    const yogur = await producto("Yogur", 800, 12);
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const partida = (await pedir("POST", "/vencimientos", {
      productoId: yogur.id,
      fecha,
      cantidad: 12,
    })) as { id: string };

    // Se vendieron 5 antes de vencer.
    await pedir("POST", "/caja/cobrar", {
      cajaId: caja.id,
      items: [{ productoId: yogur.id, nombre: "Yogur", precio: 800, cantidad: 5 }],
      pagos: [{ metodo: "efectivo", monto: 4000 }],
    });

    const tirado = (await pedir("POST", `/vencimientos/${partida.id}/tirar`, {})) as { ok: boolean };
    expect(tirado.ok).toBe(true);
    const despues = (await pedir("GET", `/productos/${yogur.id}`)) as { stock: number };
    expect(despues.stock).toBe(0);
  });
});

describe("el lector", () => {
  it("encuentra el SKU aunque llegue en minúsculas", async () => {
    await producto("Leche", 1000, 10, false, { sku: "LEC-001" });
    const encontrado = (await pedir("GET", "/productos/codigo/lec-001")) as { nombre: string };
    expect(encontrado.nombre).toBe("Leche");
  });
});

describe("el sitio", () => {
  it("encuentra los datos de una pantalla que el navegador pide con puntos", async () => {
    const { Sitio } = await import("../servidor/sitio.ts");
    const raiz = path.join(carpeta, "sitio");
    fs.mkdirSync(path.join(raiz, "panel", "__next.panel"), { recursive: true });
    fs.writeFileSync(path.join(raiz, "panel", "__next.panel", "__PAGE__.txt"), "datos del panel");
    fs.writeFileSync(path.join(raiz, "404.html"), "no está");

    const sitio = new Sitio(raiz);
    const datos = sitio.resolver("/panel/__next.panel.__PAGE__.txt");
    expect(datos?.estado).toBe(200);
    expect(datos?.contenido.toString()).toBe("datos del panel");

    // Lo que no existe es un 404 de verdad, aunque se sirva la página 404.
    expect(sitio.resolver("/no-existe")?.estado).toBe(404);
  });
});
