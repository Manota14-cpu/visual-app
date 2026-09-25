import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { rutasCaja } from "../servidor/api/caja.ts";
import { rutasPedidos } from "../servidor/api/pedidos.ts";
import { Ruteador, type Acceso } from "../servidor/http.ts";
import type { Producto, Usuario } from "../servidor/tipos.ts";

/**
 * La planilla de ventas.
 *
 * Es lo que se le manda al contador: tiene que abrir en columnas en un Excel en
 * español, traer lo mismo que la pantalla estaba mostrando y no dejarse sacar
 * por cualquiera que atienda el mostrador.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;
let cajaId: string;

async function llamar(metodo: string, camino: string, cuerpo: Record<string, unknown> = {}, acceso?: Acceso) {
  const [ruta, busqueda] = camino.split("?");
  const { resultado } = await r.resolver(metodo, ruta!, new URLSearchParams(busqueda), cuerpo, acceso);
  return resultado as Record<string, unknown>;
}

function sembrar(nombre: string, precio: number, porPeso = false): string {
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
      unidadMedida: porPeso ? "kg" : "unidad",
      porPeso,
      precioCosto: null,
      precioVenta: precio,
      precioMayorista: null,
      cantidadMayoristaMin: null,
      stock: porPeso ? 50_000 : 100,
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

beforeEach(async () => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-prueba-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasCaja(r, a);
  rutasPedidos(r, a);
  cajaId = (await llamar("POST", "/caja/abrir", { fondo: 0 })).id as string;
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("la planilla de ventas", () => {
  it("una fila por venta, separada por punto y coma, con los importes como números", async () => {
    const coca = sembrar("Coca-Cola 2,25 L", 3200);
    const pan = sembrar("Pan francés", 2800, true);
    await llamar("POST", "/caja/cobrar", {
      cajaId,
      items: [
        { productoId: coca, nombre: "Coca-Cola 2,25 L", precio: 3200, cantidad: 2 },
        { productoId: pan, nombre: "Pan francés", precio: 2800, cantidad: 750 },
      ],
      pagos: [{ metodo: "efectivo", monto: 8500 }],
    });

    const r1 = await llamar("GET", "/pedidos/exportar");
    const contenido = r1.contenido as string;
    const lineas = contenido.replace(/^﻿/, "").trim().split("\r\n");

    expect(r1.ventas).toBe(1);
    expect(r1.nombre).toMatch(/^ventas-\d{4}-\d{2}-\d{2}\.csv$/);
    // El BOM es lo que hace que Excel lea los acentos derechos.
    expect(contenido.startsWith("﻿")).toBe(true);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toBe("Número;Fecha;Hora;Canal;Estado;Cliente;Vendió;Pago;Lo que se llevó;Descuento;Total");

    const celdas = lineas[1]!.split(";");
    expect(celdas[0]).toBe("1");
    expect(celdas[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(celdas[2]).toMatch(/^\d{2}:\d{2}$/);
    expect(celdas[7]).toBe("Efectivo");
    expect(lineas[1]).toContain("2 × Coca-Cola 2,25 L · 750 g Pan francés");
    expect(celdas[celdas.length - 1]).toBe("8500");
  });

  it("trae lo mismo que la pantalla estaba filtrando", async () => {
    const coca = sembrar("Coca-Cola", 3200);
    const yerba = sembrar("Yerba", 4950);
    for (const [id, nombre, precio] of [
      [coca, "Coca-Cola", 3200],
      [yerba, "Yerba", 4950],
      [yerba, "Yerba", 4950],
    ] as const) {
      await llamar("POST", "/caja/cobrar", {
        cajaId,
        items: [{ productoId: id, nombre, precio, cantidad: 1 }],
        pagos: [{ metodo: "transferencia", monto: precio }],
      });
    }

    const r1 = await llamar("GET", "/pedidos/exportar?q=yerba");
    expect(r1.ventas).toBe(2);
    expect(r1.contenido as string).not.toContain("Coca-Cola");
  });

  it("no deja que un nombre se ejecute como fórmula al abrirla en Excel", async () => {
    const coca = sembrar("Coca-Cola", 3200);
    await llamar("POST", "/caja/cobrar", {
      cajaId,
      nombre: '=HYPERLINK("http://x","ver")',
      items: [{ productoId: coca, nombre: "Coca-Cola", precio: 3200, cantidad: 1 }],
      pagos: [{ metodo: "efectivo", monto: 3200 }],
    });

    const contenido = (await llamar("GET", "/pedidos/exportar")).contenido as string;
    expect(contenido).toContain(`"'=HYPERLINK(""http://x"",""ver"")"`);
    expect(contenido).not.toMatch(/;=HYPERLINK/);
  });

  it("es solo del dueño", async () => {
    const empleado = { id: "e", nombre: "Sofía", usuario: "sofia", rol: "empleado", activo: true } as unknown as Usuario;
    const r1 = await llamar("GET", "/pedidos/exportar", {}, { usuario: empleado, exigir: true });
    expect(r1).not.toHaveProperty("contenido");
  });
});
