import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen } from "../servidor/almacen.ts";
import { rutasGastos } from "../servidor/api/gastos.ts";
import { rutasInformes } from "../servidor/api/informes.ts";
import { rutasPanel } from "../servidor/api/panel.ts";
import { rutasProveedores } from "../servidor/api/proveedores.ts";
import { Ruteador } from "../servidor/http.ts";
import { deudaProveedor, deudaProveedores } from "../servidor/reglas.ts";

/**
 * Lo que el negocio debe.
 *
 * La deuda no se guarda: se suma lo comprado y se le resta lo pagado, cada vez.
 * Es la misma decisión que con el fiado de clientes, y por la misma razón — un
 * saldo guardado es un número más que puede quedar desincronizado de los
 * hechos que lo explican, y con plata ajena eso no se puede permitir.
 *
 * Y pagarle a un proveedor ES un gasto, no una entidad nueva. Si fueran dos
 * cosas distintas, el informe contaría la harina dos veces.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;

async function pedir(metodo: string, camino: string, cuerpo: Record<string, unknown> = {}) {
  const { resultado } = await r.resolver(metodo, camino, new URLSearchParams(), cuerpo);
  return resultado as Record<string, unknown>;
}

async function unProveedor(nombre = "Molino del Sur") {
  const p = (await pedir("POST", "/proveedores", { nombre })) as { id: string };
  return p.id;
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-proveedores-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasProveedores(r, a);
  rutasGastos(r, a);
  rutasPanel(r, a);
  rutasInformes(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("la cuenta de un proveedor", () => {
  it("una compra sube la deuda", async () => {
    const id = await unProveedor();

    await pedir("POST", "/compras", {
      proveedorId: id,
      detalle: "Harina 000 x 10 bolsas",
      total: 340_000,
    });

    expect(a.leer((d) => deudaProveedor(d, id))).toBe(340_000);
  });

  it("pagarle la baja", async () => {
    const id = await unProveedor();
    await pedir("POST", "/compras", { proveedorId: id, detalle: "Harina", total: 340_000 });

    await pedir("POST", `/proveedores/${id}/pagar`, { monto: 140_000 });

    expect(a.leer((d) => deudaProveedor(d, id))).toBe(200_000);
  });

  it("pagar lo que se debe la deja en cero", async () => {
    const id = await unProveedor();
    await pedir("POST", "/compras", { proveedorId: id, detalle: "Harina", total: 100_000 });
    await pedir("POST", `/proveedores/${id}/pagar`, { monto: 100_000 });

    expect(a.leer((d) => deudaProveedor(d, id))).toBe(0);
  });

  it("no deja pagar más de lo que se debe", async () => {
    const id = await unProveedor();
    await pedir("POST", "/compras", { proveedorId: id, detalle: "Harina", total: 100_000 });

    await expect(
      pedir("POST", `/proveedores/${id}/pagar`, { monto: 150_000 })
    ).rejects.toThrow(/no se puede pagar de más/i);
  });

  it("una compra pagada en el acto no deja deuda", async () => {
    const id = await unProveedor();

    await pedir("POST", "/compras", {
      proveedorId: id,
      detalle: "Levadura",
      total: 25_000,
      entrega: 25_000,
    });

    expect(a.leer((d) => deudaProveedor(d, id))).toBe(0);
  });

  it("la entrega no puede ser mayor que la compra", async () => {
    const id = await unProveedor();

    await expect(
      pedir("POST", "/compras", {
        proveedorId: id,
        detalle: "Levadura",
        total: 25_000,
        entrega: 30_000,
      })
    ).rejects.toThrow(/no puede ser mayor/i);
  });

  it("la deuda se deduce: borrar la compra la borra", async () => {
    const id = await unProveedor();
    const r1 = (await pedir("POST", "/compras", {
      proveedorId: id,
      detalle: "Harina",
      total: 340_000,
    })) as { compra: { id: string } };

    await pedir("DELETE", `/compras/${r1.compra.id}`);

    // No hay saldo guardado que quede colgado: se vuelve a sumar de lo que
    // quedó, y no quedó nada.
    expect(a.leer((d) => deudaProveedor(d, id))).toBe(0);
  });
});

describe("pagarle a un proveedor es un gasto", () => {
  it("y aparece en los gastos, no en una lista aparte", async () => {
    const id = await unProveedor();
    await pedir("POST", "/compras", { proveedorId: id, detalle: "Harina", total: 100_000 });
    await pedir("POST", `/proveedores/${id}/pagar`, { monto: 40_000 });

    const gastos = (await pedir("GET", "/gastos")) as {
      items: { monto: number; proveedorId: string | null; categoria: string }[];
    };

    expect(gastos.items).toHaveLength(1);
    expect(gastos.items[0]!.monto).toBe(40_000);
    expect(gastos.items[0]!.proveedorId).toBe(id);
    expect(gastos.items[0]!.categoria).toBe("mercaderia");
  });

  it("y la compra NO es un gasto, así no se cuenta dos veces", async () => {
    const id = await unProveedor();

    // Se compran 100.000 de harina y todavía no se pagó nada.
    await pedir("POST", "/compras", { proveedorId: id, detalle: "Harina", total: 100_000 });

    // Del negocio no salió un peso: el informe no puede decir que sí.
    const gastos = (await pedir("GET", "/gastos")) as { items: unknown[] };
    expect(gastos.items).toHaveLength(0);
  });
});

describe("el resumen de cuenta", () => {
  it("mezcla compras y pagos en una sola lista", async () => {
    const id = await unProveedor();
    await pedir("POST", "/compras", {
      proveedorId: id,
      detalle: "Harina",
      total: 100_000,
      fecha: "2026-09-01",
    });
    await pedir("POST", `/proveedores/${id}/pagar`, { monto: 30_000, fecha: "2026-09-10" });

    const cuenta = (await pedir("GET", `/proveedores/${id}/cuenta`)) as {
      movimientos: { tipo: string; monto: number }[];
      comprado: number;
      pagado: number;
      deuda: number;
    };

    expect(cuenta.movimientos).toHaveLength(2);
    // De la más nueva a la más vieja.
    expect(cuenta.movimientos[0]!.tipo).toBe("pago");
    expect(cuenta.comprado).toBe(100_000);
    expect(cuenta.pagado).toBe(30_000);
    expect(cuenta.deuda).toBe(70_000);
  });
});

describe("no perder de vista una deuda", () => {
  it("no se archiva un proveedor al que se le debe", async () => {
    const id = await unProveedor();
    await pedir("POST", "/compras", { proveedorId: id, detalle: "Harina", total: 100_000 });

    await expect(pedir("DELETE", `/proveedores/${id}`)).rejects.toThrow(/saldá la cuenta/i);
  });

  it("pero sí uno con la cuenta al día", async () => {
    const id = await unProveedor();
    await pedir("POST", "/compras", { proveedorId: id, detalle: "Harina", total: 100_000 });
    await pedir("POST", `/proveedores/${id}/pagar`, { monto: 100_000 });

    const r1 = (await pedir("DELETE", `/proveedores/${id}`)) as { activo: boolean };
    expect(r1.activo).toBe(false);
  });
});

describe("el panel lo muestra", () => {
  it("suma lo que se le debe a todos", async () => {
    const molino = await unProveedor("Molino del Sur");
    const lacteos = await unProveedor("Lácteos Rafaela");

    await pedir("POST", "/compras", { proveedorId: molino, detalle: "Harina", total: 340_000 });
    await pedir("POST", "/compras", { proveedorId: lacteos, detalle: "Manteca", total: 120_000 });
    await pedir("POST", `/proveedores/${molino}/pagar`, { monto: 40_000 });

    expect(a.leer(deudaProveedores)).toBe(420_000);

    const panel = (await pedir("GET", "/panel")) as { aProveedores: number };
    expect(panel.aProveedores).toBe(420_000);
  });
});

describe("dos proveedores no pueden llamarse igual", () => {
  it("ni escribiéndolo distinto", async () => {
    await unProveedor("Molino del Sur");
    await expect(pedir("POST", "/proveedores", { nombre: "MOLINO DEL SUR" })).rejects.toThrow(
      /ya hay un proveedor/i
    );
  });
});
