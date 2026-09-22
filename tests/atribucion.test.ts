import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { rutasCaja } from "../servidor/api/caja.ts";
import { rutasCatalogo } from "../servidor/api/catalogo.ts";
import { rutasMovimientos } from "../servidor/api/movimientos.ts";
import { rutasUsuarios } from "../servidor/api/usuarios.ts";
import { Respuesta, Ruteador, tokenDeCookies, type Acceso } from "../servidor/http.ts";
import { usuarioDeToken } from "../servidor/usuarios.ts";
import type { Producto } from "../servidor/tipos.ts";

/**
 * Quién hizo cada cosa.
 *
 * Es lo que hace que tener usuarios sirva para algo más que cerrar puertas. La
 * pregunta que un dueño hace de verdad no es "quién puede ver los costos" sino
 * "quién hizo esa devolución" y "quién cerró la caja con faltante".
 *
 * El nombre se guarda COPIADO, no referenciado. Si a esa persona la dan de
 * baja o le corrigen una letra al nombre, el historial tiene que seguir
 * diciendo quién fue el día que pasó.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;

function como(token: string | null): Acceso {
  return a.leer((d) => ({
    usuario: usuarioDeToken(d, token),
    exigir: d.usuarios.some((u) => u.activo),
  }));
}

async function pedir(
  metodo: string,
  camino: string,
  cuerpo: Record<string, unknown> = {},
  token: string | null = null
) {
  const { resultado } = await r.resolver(metodo, camino, new URLSearchParams(), cuerpo, como(token));
  return resultado;
}

function tokenDe(resultado: unknown): string {
  const cookie = (resultado as Respuesta).cabeceras["Set-Cookie"]!;
  return tokenDeCookies(cookie.split(";")[0])!;
}

async function sofia() {
  const dueno = tokenDe(
    await pedir("POST", "/usuarios/primero", { nombre: "Joaquín", usuario: "joaco", clave: "secreta" })
  );
  await pedir(
    "POST",
    "/usuarios",
    { nombre: "Sofía", usuario: "sofia", clave: "mostrador", rol: "empleado" },
    dueno
  );
  const suyo = tokenDe(
    await pedir("POST", "/usuarios/ingresar", { usuario: "sofia", clave: "mostrador" })
  );
  return { dueno, empleado: suyo };
}

function sembrarProducto(nombre: string, precio: number): string {
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
      precioCosto: Math.round(precio / 2),
      precioVenta: precio,
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

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-atribucion-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasUsuarios(r, a);
  rutasCaja(r, a);
  rutasCatalogo(r, a);
  rutasMovimientos(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("la venta guarda quién la hizo", () => {
  it("con el nombre copiado, no una referencia", async () => {
    const { empleado } = await sofia();
    const pan = sembrarProducto("Pan francés", 1000);
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 }, empleado)) as { id: string };

    await pedir(
      "POST",
      "/caja/cobrar",
      {
        cajaId: caja.id,
        items: [{ productoId: pan, nombre: "Pan francés", precio: 1000, cantidad: 2 }],
        pagos: [{ metodo: "efectivo", monto: 2000 }],
      },
      empleado
    );

    const venta = a.leer((d) => d.pedidos[0]!);
    expect(venta.usuario).toBe("Sofía");
    expect(venta.usuarioId).toBeTruthy();
  });

  it("y el historial no cambia si después la dan de baja", async () => {
    const { dueno, empleado } = await sofia();
    const pan = sembrarProducto("Pan francés", 1000);
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 }, empleado)) as { id: string };

    await pedir(
      "POST",
      "/caja/cobrar",
      {
        cajaId: caja.id,
        items: [{ productoId: pan, nombre: "Pan francés", precio: 1000, cantidad: 1 }],
        pagos: [{ metodo: "efectivo", monto: 1000 }],
      },
      empleado
    );

    // Se va del negocio.
    const id = a.leer((d) => d.usuarios.find((u) => u.usuario === "sofia")!.id);
    await pedir("DELETE", `/usuarios/${id}`, {}, dueno);

    // La venta de aquel día la hizo Sofía, y va a seguir diciéndolo.
    expect(a.leer((d) => d.pedidos[0]!.usuario)).toBe("Sofía");
  });

  it("sin usuarios cargados no se inventa a nadie", async () => {
    const pan = sembrarProducto("Pan francés", 1000);
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 })) as { id: string };

    await pedir("POST", "/caja/cobrar", {
      cajaId: caja.id,
      items: [{ productoId: pan, nombre: "Pan francés", precio: 1000, cantidad: 1 }],
      pagos: [{ metodo: "efectivo", monto: 1000 }],
    });

    expect(a.leer((d) => d.pedidos[0]!.usuario)).toBeNull();
  });
});

describe("el movimiento de stock también", () => {
  it("una venta deja el movimiento a nombre de quien cobró", async () => {
    const { empleado } = await sofia();
    const pan = sembrarProducto("Pan francés", 1000);
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 0 }, empleado)) as { id: string };

    await pedir(
      "POST",
      "/caja/cobrar",
      {
        cajaId: caja.id,
        items: [{ productoId: pan, nombre: "Pan francés", precio: 1000, cantidad: 3 }],
        pagos: [{ metodo: "efectivo", monto: 3000 }],
      },
      empleado
    );

    const mov = a.leer((d) => d.movimientos.find((m) => m.tipo === "venta"));
    expect(mov?.usuario).toBe("Sofía");
  });

  it("una entrada de mercadería, a nombre de quien la cargó", async () => {
    const { dueno } = await sofia();
    const pan = sembrarProducto("Pan francés", 1000);

    await pedir("POST", `/productos/${pan}/stock`, { cantidad: 50, motivo: "Horneada" }, dueno);

    const mov = a.leer((d) => d.movimientos.find((m) => m.tipo === "entrada"));
    expect(mov?.usuario).toBe("Joaquín");
  });

  it("y viaja a la pantalla", async () => {
    const { dueno } = await sofia();
    const pan = sembrarProducto("Pan francés", 1000);
    await pedir("POST", `/productos/${pan}/stock`, { cantidad: 10, motivo: "Horneada" }, dueno);

    const lista = (await pedir("GET", "/movimientos", {}, dueno)) as {
      items: { usuario: string | null }[];
    };
    expect(lista.items[0]!.usuario).toBe("Joaquín");
  });
});

describe("el turno de caja", () => {
  it("guarda quién lo abrió y quién lo cerró, aunque sean distintos", async () => {
    const { dueno, empleado } = await sofia();

    // Sofía abre a la mañana.
    const caja = (await pedir("POST", "/caja/abrir", { fondo: 20_000 }, empleado)) as {
      id: string;
    };

    // Y el dueño cierra a la noche.
    await pedir("POST", "/caja/cerrar", { cajaId: caja.id, contado: 20_000 }, dueno);

    const cerrada = a.leer((d) => d.cajas[0]!);
    expect(cerrada.abrio).toBe("Sofía");
    expect(cerrada.cerro).toBe("Joaquín");
  });
});

describe("el cambio de precio", () => {
  it("queda a nombre de quien lo hizo", async () => {
    const { dueno } = await sofia();
    const pan = sembrarProducto("Pan francés", 1000);

    await pedir(
      "PUT",
      `/productos/${pan}`,
      { nombre: "Pan francés", precioVenta: 1200, precioCosto: 500 },
      dueno
    );

    const cambio = a.leer((d) => d.cambiosPrecio[0]);
    expect(cambio?.usuario).toBe("Joaquín");
    expect(cambio?.precioNuevo).toBe(1200);
  });
});
