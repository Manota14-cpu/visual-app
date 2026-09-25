import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { leerEtiqueta, verificadorValido } from "../servidor/balanza.ts";
import { rutasCaja } from "../servidor/api/caja.ts";
import { rutasCatalogo } from "../servidor/api/catalogo.ts";
import { rutasPedidos } from "../servidor/api/pedidos.ts";
import { rutasProveedores } from "../servidor/api/proveedores.ts";
import { rutasSistema } from "../servidor/api/sistema.ts";
import { rutasUsuarios } from "../servidor/api/usuarios.ts";
import { Respuesta, Ruteador, tokenDeCookies, type Acceso } from "../servidor/http.ts";
import { usuarioDeToken } from "../servidor/usuarios.ts";
import type { ConfigBalanza, Producto } from "../servidor/tipos.ts";

/**
 * El mostrador: la balanza, los permisos de los empleados y el aumento de la
 * lista de un proveedor.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;

function como(token: string | null): Acceso {
  return a.leer((d) => ({
    usuario: usuarioDeToken(d, token),
    exigir: d.usuarios.some((u) => u.activo),
    token,
  }));
}

async function pedir(metodo: string, camino: string, cuerpo: Record<string, unknown> = {}, token: string | null = null) {
  const { resultado } = await r.resolver(metodo, camino, new URLSearchParams(), cuerpo, como(token));
  return resultado;
}

async function listar(camino: string, consulta: Record<string, string>, token: string) {
  const { resultado } = await r.resolver("GET", camino, new URLSearchParams(consulta), {}, como(token));
  return resultado as { items: { id: string }[] };
}

function tokenDe(resultado: unknown): string {
  const cookie = (resultado as Respuesta).cabeceras["Set-Cookie"]!;
  return tokenDeCookies(cookie.split(";")[0])!;
}

async function primerDueno() {
  return tokenDe(await pedir("POST", "/usuarios/primero", { nombre: "Dueño", usuario: "dueno", clave: "secreta" }));
}

async function unEmpleado(dueno: string) {
  await pedir("POST", "/usuarios", { nombre: "Sofía", usuario: "sofia", clave: "mostrador", rol: "empleado" }, dueno);
  return tokenDe(await pedir("POST", "/usuarios/ingresar", { usuario: "sofia", clave: "mostrador" }));
}

function sembrar(nombre: string, precio: number, extra: Partial<Producto> = {}): string {
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
      precioCosto: null,
      precioVenta: precio,
      precioMayorista: null,
      cantidadMayoristaMin: null,
      stock: 100_000,
      stockMinimo: 0,
      proveedorId: null,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora,
      ...extra,
    });
  });
  return id;
}

/** Los doce primeros dígitos, más el verificador que corresponde. */
function ean(doce: string): string {
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return doce + ((10 - (suma % 10)) % 10);
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-mostrador-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasUsuarios(r, a);
  rutasCatalogo(r, a);
  rutasCaja(r, a);
  rutasPedidos(r, a);
  rutasProveedores(r, a);
  rutasSistema(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

// ─────────────────────────────────  Balanza  ─────────────────────────────────

const FORMATO: ConfigBalanza = { activa: true, prefijo: "20", digitosPlu: 5, contenido: "importe" };

describe("la etiqueta de la balanza", () => {
  it("se lee: PLU e importe", () => {
    expect(leerEtiqueta(ean("200012301550"), FORMATO)).toEqual({ plu: 123, valor: 1550 });
  });

  it("se descarta con el verificador mal: un dígito mal leído no cobra otra cosa", () => {
    const buena = ean("200012301550");
    const mala = buena.slice(0, 12) + ((Number(buena[12]) + 1) % 10);
    expect(verificadorValido(mala)).toBe(false);
    expect(leerEtiqueta(mala, FORMATO)).toBeNull();
  });

  it("no toca códigos de otro prefijo ni con la balanza apagada", () => {
    expect(leerEtiqueta(ean("779129300002"), FORMATO)).toBeNull();
    expect(leerEtiqueta(ean("200012301550"), { ...FORMATO, activa: false })).toBeNull();
  });

  it("entra a la caja con los gramos exactos que se pesaron", async () => {
    await pedir("PUT", "/sistema/mostrador", { balanza: FORMATO });
    sembrar("Jamón cocido", 18_990, { sku: "123", porPeso: true, unidadMedida: "kg" });

    // 350 g a $18.990 el kilo: la balanza imprime $6.647.
    const leido = (await pedir("GET", `/productos/codigo/${ean("200012306647")}`)) as {
      nombre: string;
      balanza: { cantidad: number; importeEtiqueta: number };
    };
    expect(leido.nombre).toBe("Jamón cocido");
    expect(leido.balanza.cantidad).toBe(350);
    expect(leido.balanza.importeEtiqueta).toBe(6647);
  });

  it("se cobra lo que dice la etiqueta aunque la balanza tenga otro precio", async () => {
    sembrar("Queso tybo", 20_000, { sku: "77", porPeso: true });
    // La balanza sigue con el precio viejo ($15.000): 500 g salen $7.500.
    // El cliente ve $7.500 en el paquete y eso es lo que se le cobra.
    const leido = (await pedir("GET", `/productos/codigo/${ean("200007707500")}`)) as {
      precioVenta: number;
      balanza: { cantidad: number };
    };
    expect(leido.balanza.cantidad).toBe(375);
    expect(Math.round((leido.precioVenta * leido.balanza.cantidad) / 1000)).toBe(7500);
  });

  it("un producto que no es por peso no se lee de la balanza", async () => {
    sembrar("Pan lactal", 3000, { sku: "88" });
    await expect(pedir("GET", `/productos/codigo/${ean("200008803000")}`)).rejects.toThrow(/por peso/);
  });

  it("con peso en la etiqueta usa los gramos tal cual", async () => {
    await pedir("PUT", "/sistema/mostrador", { balanza: { ...FORMATO, contenido: "peso" } });
    sembrar("Salame", 30_000, { sku: "5", porPeso: true });
    const leido = (await pedir("GET", `/productos/codigo/${ean("200000501234")}`)) as {
      balanza: { cantidad: number };
    };
    expect(leido.balanza.cantidad).toBe(1234);
  });

  it("un código cargado tal cual gana sobre la etiqueta", async () => {
    const codigo = ean("200012301550");
    sembrar("Producto interno", 100, { codigoBarras: codigo });
    const leido = (await pedir("GET", `/productos/codigo/${codigo}`)) as { nombre: string; balanza?: unknown };
    expect(leido.nombre).toBe("Producto interno");
    expect(leido.balanza).toBeUndefined();
  });

  it("dice qué PLU falta cargar", async () => {
    const res = (await pedir("GET", `/productos/codigo/${ean("200099901550")}`)) as Respuesta;
    expect(res.estado).toBe(404);
    expect(JSON.stringify(res.cuerpo)).toMatch(/999/);
  });

  it("la prueba de la configuración explica la etiqueta", async () => {
    sembrar("Jamón cocido", 18_990, { sku: "123", porPeso: true });
    const prueba = (await pedir("POST", "/sistema/balanza/probar", { codigo: ean("200012306647") })) as {
      ok: boolean;
      plu: number;
      cantidad: number;
      producto: { nombre: string };
    };
    expect(prueba).toMatchObject({ ok: true, plu: 123, cantidad: 350, producto: { nombre: "Jamón cocido" } });
  });

  it("rechaza un formato que no deja lugar al importe", async () => {
    await expect(
      pedir("PUT", "/sistema/mostrador", { balanza: { ...FORMATO, prefijo: "3" } })
    ).rejects.toThrow(/prefijo/);
  });
});

// ─────────────────────────────  Permisos  ─────────────────────────────

describe("lo que puede hacer un empleado", () => {
  let dueno: string;
  let empleado: string;
  let cajaId: string;
  let yerba: string;

  beforeEach(async () => {
    dueno = await primerDueno();
    empleado = await unEmpleado(dueno);
    cajaId = ((await pedir("POST", "/caja/abrir", { fondo: 0 }, dueno)) as { id: string }).id;
    yerba = sembrar("Yerba 1kg", 4000);
  });

  const cobro = (extra: Record<string, unknown> = {}) => ({
    cajaId,
    items: [{ productoId: yerba, nombre: "Yerba 1kg", precio: 4000, cantidad: 1 }],
    pagos: [{ metodo: "efectivo", monto: 4000 }],
    ...extra,
  });

  it("cobra al precio de lista", async () => {
    const venta = (await pedir("POST", "/caja/cobrar", cobro(), empleado)) as { total: number };
    expect(venta.total).toBe(4000);
  });

  it("sin permiso no hace descuentos ni cambia el precio", async () => {
    await expect(
      pedir("POST", "/caja/cobrar", cobro({ descuento: 500, pagos: [{ metodo: "efectivo", monto: 3500 }] }), empleado)
    ).rejects.toThrow(/descuentos los hace el dueño/);

    await expect(
      pedir(
        "POST",
        "/caja/cobrar",
        cobro({
          items: [{ productoId: yerba, nombre: "Yerba 1kg", precio: 100, cantidad: 1 }],
          pagos: [{ metodo: "efectivo", monto: 100 }],
        }),
        empleado
      )
    ).rejects.toThrow(/precio/);
  });

  it("con permiso sí, y el dueño siempre", async () => {
    const conDescuento = cobro({ descuento: 500, pagos: [{ metodo: "efectivo", monto: 3500 }] });
    expect(((await pedir("POST", "/caja/cobrar", conDescuento, dueno)) as { total: number }).total).toBe(3500);

    await pedir("PUT", "/sistema/mostrador", { empleados: { descuentos: true, anularVentas: false } }, dueno);
    expect(((await pedir("POST", "/caja/cobrar", conDescuento, empleado)) as { total: number }).total).toBe(3500);
  });

  it("sin permiso no anula ventas; con permiso sí", async () => {
    const venta = (await pedir("POST", "/caja/cobrar", cobro(), empleado)) as { id: string };

    await expect(
      pedir("POST", `/pedidos/${venta.id}/estado`, { estado: "cancelado" }, empleado)
    ).rejects.toThrow(/Anular o reabrir/);

    await pedir("PUT", "/sistema/mostrador", { empleados: { descuentos: false, anularVentas: true } }, dueno);
    const anulada = (await pedir("POST", `/pedidos/${venta.id}/estado`, { estado: "cancelado" }, empleado)) as {
      estado: string;
    };
    expect(anulada.estado).toBe("cancelado");
  });

  it("el empleado no cambia los permisos", async () => {
    const res = (await pedir(
      "PUT",
      "/sistema/mostrador",
      { empleados: { descuentos: true, anularVentas: true } },
      empleado
    )) as Respuesta;
    expect(res.estado).toBe(403);
  });

  it("la sesión trae el bloqueo y los permisos para la pantalla", async () => {
    await pedir("PUT", "/sistema/mostrador", { bloqueoMinutos: 5 }, dueno);
    const yo = (await pedir("GET", "/usuarios/yo", {}, empleado)) as {
      ajustes: { bloqueoMinutos: number; empleados: { descuentos: boolean } };
    };
    expect(yo.ajustes.bloqueoMinutos).toBe(5);
    expect(yo.ajustes.empleados.descuentos).toBe(false);

    const afuera = (await pedir("GET", "/usuarios/yo")) as { ajustes: unknown };
    expect(afuera.ajustes).toBeNull();
  });
});

// ─────────────────────────────  Proveedores  ─────────────────────────────

describe("el aumento de un proveedor", () => {
  it("se aplica solo a sus productos", async () => {
    const dueno = await primerDueno();
    const proveedor = (await pedir("POST", "/proveedores", { nombre: "Distribuidora Sur" }, dueno)) as { id: string };

    const arroz = sembrar("Arroz", 1500);
    const fideos = sembrar("Fideos", 1200);
    sembrar("Gaseosa", 2000);
    await pedir("POST", "/productos/masivo", { ids: [arroz, fideos], proveedorId: proveedor.id }, dueno);

    const suyos = (await pedir("GET", `/proveedores/${proveedor.id}/productos`, {}, dueno)) as { id: string }[];
    expect(suyos.map((p) => p.id).sort()).toEqual([arroz, fideos].sort());

    const filtrados = await listar("/productos", { proveedor: proveedor.id }, dueno);
    expect(filtrados.items).toHaveLength(2);

    await pedir(
      "POST",
      "/productos/precios/aplicar",
      { ids: suyos.map((p) => p.id), porcentaje: 8, aplicarA: "venta", redondeo: 100 },
      dueno
    );
    const precios = a.leer((d) => Object.fromEntries(d.productos.map((p) => [p.nombre, p.precioVenta])));
    expect(precios).toEqual({ Arroz: 1600, Fideos: 1300, Gaseosa: 2000 });
  });

  it("un empleado no ve de quién es cada producto", async () => {
    const dueno = await primerDueno();
    const empleado = await unEmpleado(dueno);
    const proveedor = (await pedir("POST", "/proveedores", { nombre: "Distribuidora Sur" }, dueno)) as { id: string };
    const arroz = sembrar("Arroz", 1500, { proveedorId: proveedor.id });

    const visto = (await pedir("GET", `/productos/${arroz}`, {}, empleado)) as { proveedorId: string | null };
    expect(visto.proveedorId).toBeNull();
  });
});

// ─────────────────────────────  Celular como escáner  ─────────────────────────────

describe("el celular como escáner de la caja", () => {
  it("lo que manda el celular lo toma la computadora una sola vez", async () => {
    const yerba = sembrar("Yerba 1kg", 4000);

    const enviado = (await pedir("POST", "/caja/remoto", { productoId: yerba })) as { nombre: string; escuchando: boolean };
    expect(enviado.nombre).toBe("Yerba 1kg");
    // Nadie preguntó todavía: el celular avisa que la computadora no escucha.
    expect(enviado.escuchando).toBe(false);

    const tomados = (await pedir("POST", "/caja/remoto/tomar")) as { producto: { id: string; precio: number } }[];
    expect(tomados).toHaveLength(1);
    expect(tomados[0]!.producto).toMatchObject({ id: yerba, precio: 4000 });

    // Dos cajas mirando no cobran dos veces lo mismo.
    expect(await pedir("POST", "/caja/remoto/tomar")).toEqual([]);

    // Ahora la computadora está escuchando.
    const otro = (await pedir("POST", "/caja/remoto", { productoId: yerba })) as { escuchando: boolean };
    expect(otro.escuchando).toBe(true);
  });

  it("lleva lo que trae el paquete de la balanza y el precio de ahora", async () => {
    const jamon = sembrar("Jamón cocido", 18_990, { porPeso: true });
    await pedir("POST", "/caja/remoto", { productoId: jamon, cantidad: 350 });
    a.escribir((d) => {
      d.productos.find((p) => p.id === jamon)!.precioVenta = 20_000;
    });

    const [tomado] = (await pedir("POST", "/caja/remoto/tomar")) as {
      producto: { precio: number; balanza: { cantidad: number } };
    }[];
    expect(tomado!.producto.precio).toBe(20_000);
    expect(tomado!.producto.balanza.cantidad).toBe(350);
  });

  it("rechaza un producto que no existe", async () => {
    await expect(pedir("POST", "/caja/remoto", { productoId: "nada" })).rejects.toThrow(/no existe/);
  });
});
