import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, nuevoId } from "../servidor/almacen.ts";
import { rutasCatalogo } from "../servidor/api/catalogo.ts";
import { rutasGastos } from "../servidor/api/gastos.ts";
import { rutasInformes } from "../servidor/api/informes.ts";
import { rutasPanel } from "../servidor/api/panel.ts";
import { rutasPedidos } from "../servidor/api/pedidos.ts";
import { rutasSistema } from "../servidor/api/sistema.ts";
import { rutasUsuarios } from "../servidor/api/usuarios.ts";
import { Respuesta, Ruteador, tokenDeCookies, type Acceso } from "../servidor/http.ts";
import {
  derivarClave,
  hashDeToken,
  nuevoToken,
  usuarioDeToken,
  verificarClave,
} from "../servidor/usuarios.ts";
import type { Producto } from "../servidor/tipos.ts";

/**
 * Quién entra y qué ve.
 *
 * Dos cosas distintas se prueban acá, y las dos se rompen en silencio:
 *
 * 1. Que no se pueda entrar sin contraseña.
 * 2. Que un empleado no vea los números del negocio — lo que costó la
 *    mercadería, cuánto se gana, cuánto hay fiado. Esto es lo más fácil de
 *    romper sin darse cuenta: alcanza con que una ruta devuelva el producto
 *    entero. Esconderlo en la pantalla no sirve; el dato viaja igual y se lee
 *    mirando la respuesta en el navegador.
 */

let carpeta: string;
let a: Almacen;
let r: Ruteador;

/** Quién hace el pedido. Sin usuarios cargados, la app no pide nada. */
function como(token: string | null): Acceso {
  // Igual que `quienPide` en el servidor: con el token, que es lo que
  // necesita "salir" para saber qué sesión cerrar.
  return a.leer((d) => ({
    usuario: usuarioDeToken(d, token),
    exigir: d.usuarios.some((u) => u.activo),
    token,
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

/** El token que quedó en la cookie de una respuesta. */
function tokenDe(resultado: unknown): string {
  const cookie = (resultado as Respuesta).cabeceras["Set-Cookie"]!;
  return tokenDeCookies(cookie.split(";")[0])!;
}

/** Crea el dueño inicial y devuelve su token. */
async function primerDueno(clave = "secreta") {
  const res = await pedir("POST", "/usuarios/primero", {
    nombre: "Joaquín",
    usuario: "joaco",
    clave,
  });
  return tokenDe(res);
}

/** Crea un empleado y devuelve su token. */
async function unEmpleado(dueno: string, clave = "mostrador") {
  await pedir("POST", "/usuarios", { nombre: "Sofía", usuario: "sofia", clave, rol: "empleado" }, dueno);
  const res = await pedir("POST", "/usuarios/ingresar", { usuario: "sofia", clave });
  return tokenDe(res);
}

function sembrarProducto(nombre: string, venta: number, costo: number): string {
  const id = nuevoId();
  const ahora = new Date().toISOString();

  a.escribir((d) => {
    const p: Producto = {
      id,
      categoriaId: null,
      nombre,
      descripcion: null,
      sku: null,
      codigoBarras: null,
      unidadMedida: "unidad",
      porPeso: false,
      precioCosto: costo,
      precioVenta: venta,
      precioMayorista: null,
      cantidadMayoristaMin: null,
      stock: 10,
      stockMinimo: 0,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    d.productos.push(p);
  });

  return id;
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-usuarios-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasUsuarios(r, a);
  rutasCatalogo(r, a);
  rutasPanel(r, a);
  rutasPedidos(r, a);
  rutasInformes(r, a);
  rutasGastos(r, a);
  rutasSistema(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("la contraseña", () => {
  it("no se guarda nunca en texto", async () => {
    const guardada = await derivarClave("mi contraseña");
    expect(guardada).not.toContain("mi contraseña");
    expect(guardada.startsWith("scrypt$")).toBe(true);
  });

  it("la misma contraseña da algo distinto cada vez", async () => {
    // Por la sal. Sin ella, dos personas con la misma contraseña comparten el
    // resultado y una tabla armada de antemano las abre a las dos.
    expect(await derivarClave("hola")).not.toBe(await derivarClave("hola"));
  });

  it("acepta la correcta y rechaza la de al lado", async () => {
    const guardada = await derivarClave("abracadabra");
    expect(await verificarClave("abracadabra", guardada)).toBe(true);
    expect(await verificarClave("abracadabr", guardada)).toBe(false);
    expect(await verificarClave("Abracadabra", guardada)).toBe(false);
    expect(await verificarClave("", guardada)).toBe(false);
  });

  it("un valor guardado que no tiene forma de contraseña no abre nada", async () => {
    expect(await verificarClave("", "")).toBe(false);
    expect(await verificarClave("x", "cualquier cosa")).toBe(false);
    expect(await verificarClave("x", "scrypt$$")).toBe(false);
  });
});

describe("mientras no hay usuarios", () => {
  it("la aplicación funciona como siempre", async () => {
    // Es el negocio que actualiza desde una versión anterior. Si esto pidiera
    // contraseña, quedaría afuera de su propio negocio sin forma de entrar.
    const yo = (await pedir("GET", "/usuarios/yo")) as { exigeIngreso: boolean };
    expect(yo.exigeIngreso).toBe(false);

    // Y hasta lo que después va a ser del dueño contesta con normalidad.
    expect(await pedir("GET", "/informes")).toBeTruthy();
  });
});

describe("el primer usuario", () => {
  it("se crea sin tener con qué entrar, y queda adentro", async () => {
    const res = await pedir("POST", "/usuarios/primero", {
      nombre: "Joaquín",
      usuario: "joaco",
      clave: "secreta",
    });

    // Sin esto, quien acaba de prender la llave quedaría afuera hasta volver a
    // escribir lo que escribió recién.
    const cookie = (res as Respuesta).cabeceras["Set-Cookie"];
    expect(cookie).toBeTruthy();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
  });

  it("es dueño, aunque pidan otra cosa", async () => {
    await pedir("POST", "/usuarios/primero", {
      nombre: "Vivo",
      usuario: "vivo",
      clave: "secreta",
      rol: "empleado",
    });

    expect(a.leer((d) => d.usuarios[0]!.rol)).toBe("dueno");
  });

  it("no se puede usar dos veces", async () => {
    await primerDueno();
    await expect(
      pedir("POST", "/usuarios/primero", { nombre: "Otro", usuario: "otro", clave: "secreta" })
    ).rejects.toThrow(/ya hay usuarios/i);
  });

  it("a partir de ahí hay que entrar", async () => {
    await primerDueno();

    const sinEntrar = (await pedir("GET", "/panel")) as Respuesta;
    expect(sinEntrar).toBeInstanceOf(Respuesta);
    expect(sinEntrar.estado).toBe(401);
  });
});

describe("entrar", () => {
  it("con la contraseña correcta", async () => {
    await primerDueno("secreta");
    const res = await pedir("POST", "/usuarios/ingresar", { usuario: "joaco", clave: "secreta" });
    expect((res as Respuesta).estado).toBe(200);
  });

  it("no importa cómo se escriba el usuario", async () => {
    await primerDueno("secreta");
    const res = await pedir("POST", "/usuarios/ingresar", { usuario: "  JOACO ", clave: "secreta" });
    expect((res as Respuesta).estado).toBe(200);
  });

  it("dice lo mismo si el usuario no existe que si la contraseña está mal", async () => {
    await primerDueno("secreta");

    // Decir cuál de las dos falló le regala a quien prueba la mitad del
    // trabajo: primero averigua los nombres y después ataca uno solo.
    await expect(
      pedir("POST", "/usuarios/ingresar", { usuario: "fantasma", clave: "x" })
    ).rejects.toThrow("Usuario o contraseña incorrectos.");

    await expect(
      pedir("POST", "/usuarios/ingresar", { usuario: "joaco", clave: "x" })
    ).rejects.toThrow("Usuario o contraseña incorrectos.");
  });

  it("hace esperar después de varios intentos", async () => {
    await primerDueno("secreta");

    for (let i = 0; i < 6; i++) {
      await expect(
        pedir("POST", "/usuarios/ingresar", { usuario: "joaco", clave: "no" })
      ).rejects.toThrow();
    }

    // El séptimo ya no llega a probar la contraseña: se lo frena antes.
    await expect(
      pedir("POST", "/usuarios/ingresar", { usuario: "joaco", clave: "no" })
    ).rejects.toThrow(/esperá/i);
  });

  it("un usuario apagado no entra", async () => {
    const dueno = await primerDueno();
    await unEmpleado(dueno);
    const id = a.leer((d) => d.usuarios.find((u) => u.usuario === "sofia")!.id);

    await pedir("DELETE", `/usuarios/${id}`, {}, dueno);

    await expect(
      pedir("POST", "/usuarios/ingresar", { usuario: "sofia", clave: "mostrador" })
    ).rejects.toThrow(/incorrectos/i);
  });
});

describe("la sesión", () => {
  it("el token no queda escrito en el archivo de datos", async () => {
    const token = await primerDueno();

    // El archivo se copia a un pendrive todos los días. Con el token en claro
    // adentro, cualquiera que agarre una copia entra como el dueño.
    const enDisco = fs.readFileSync(path.join(carpeta, "datos.json"), "utf8");
    expect(enDisco).not.toContain(token);
    expect(a.leer((d) => d.sesiones)).toHaveLength(1);
  });

  it("una vencida no sirve", async () => {
    const token = await primerDueno();
    expect(((await pedir("GET", "/panel", {}, token)) as Respuesta).estado).toBeUndefined();

    a.escribir((d) => {
      d.sesiones[0]!.expiraEn = new Date(Date.now() - 1000).toISOString();
    });

    const res = (await pedir("GET", "/panel", {}, token)) as Respuesta;
    expect(res.estado).toBe(401);
  });

  it("apagar a alguien lo echa en el momento", async () => {
    const dueno = await primerDueno();
    const empleado = await unEmpleado(dueno);
    const id = a.leer((d) => d.usuarios.find((u) => u.usuario === "sofia")!.id);

    await pedir("DELETE", `/usuarios/${id}`, {}, dueno);

    // No hay que esperar a que se le venza: un ex empleado no puede seguir
    // cobrando media jornada más.
    const res = (await pedir("GET", "/panel", {}, empleado)) as Respuesta;
    expect(res.estado).toBe(401);
  });

  it("salir la cierra", async () => {
    const token = await primerDueno();
    await pedir("POST", "/usuarios/salir", {}, token);

    expect(a.leer((d) => d.sesiones)).toHaveLength(0);
    expect(((await pedir("GET", "/panel", {}, token)) as Respuesta).estado).toBe(401);
  });

  it("salir en un dispositivo no cierra la sesión del otro", async () => {
    const compu = await primerDueno("secreta");
    // El mismo dueño abierto también en el celular. Se crea la sesión directo
    // y no entrando: otra prueba de este archivo deja a "joaco" con intentos
    // fallidos, y el freno de intentos haría fallar esta por otra razón.
    const celular = nuevoToken();
    a.escribir((d) => {
      d.sesiones.push({
        hash: hashDeToken(celular),
        usuarioId: d.usuarios[0]!.id,
        creadaEn: new Date().toISOString(),
        expiraEn: new Date(Date.now() + 3_600_000).toISOString(),
      });
    });

    await pedir("POST", "/usuarios/salir", {}, celular);

    expect(((await pedir("GET", "/panel", {}, celular)) as Respuesta).estado).toBe(401);
    expect(await pedir("GET", "/panel", {}, compu)).not.toBeInstanceOf(Respuesta);
  });

  it("cambiar la contraseña cierra las sesiones de esa persona", async () => {
    const token = await primerDueno("secreta");
    const id = a.leer((d) => d.usuarios[0]!.id);

    await pedir("POST", `/usuarios/${id}/clave`, { anterior: "secreta", clave: "otra" }, token);

    // Es lo que se espera cuando se la cambia justamente porque alguien más la
    // sabía: el que estaba adentro con la vieja se va.
    expect(((await pedir("GET", "/panel", {}, token)) as Respuesta).estado).toBe(401);
  });
});

describe("qué puede tocar un empleado", () => {
  let dueno: string;
  let empleado: string;

  beforeEach(async () => {
    dueno = await primerDueno();
    empleado = await unEmpleado(dueno);
  });

  it("no entra a los informes ni a los gastos", async () => {
    for (const camino of ["/informes", "/gastos"]) {
      const res = (await pedir("GET", camino, {}, empleado)) as Respuesta;
      expect(res.estado, camino).toBe(403);
    }
  });

  it("no cambia precios ni toca el catálogo", async () => {
    const id = sembrarProducto("Pan", 1000, 400);

    const creando = (await pedir(
      "POST",
      "/productos",
      { nombre: "Trucho", precioVenta: 1 },
      empleado
    )) as Respuesta;
    expect(creando.estado).toBe(403);

    const borrando = (await pedir("DELETE", `/productos/${id}`, {}, empleado)) as Respuesta;
    expect(borrando.estado).toBe(403);
  });

  it("no toca la configuración ni la copia de seguridad", async () => {
    for (const [metodo, camino] of [
      ["PUT", "/sistema/config"],
      ["POST", "/sistema/vaciar"],
      ["PUT", "/sistema/resguardo"],
      ["POST", "/sistema/restaurar"],
    ] as const) {
      const res = (await pedir(metodo, camino, {}, empleado)) as Respuesta;
      expect(res.estado, camino).toBe(403);
    }
  });

  it("no crea usuarios ni se asciende solo", async () => {
    const propio = a.leer((d) => d.usuarios.find((u) => u.usuario === "sofia")!.id);

    const creando = (await pedir(
      "POST",
      "/usuarios",
      { nombre: "X", usuario: "x", clave: "1234", rol: "dueno" },
      empleado
    )) as Respuesta;
    expect(creando.estado).toBe(403);

    const ascendiendo = (await pedir(
      "PUT",
      `/usuarios/${propio}`,
      { nombre: "Sofía", rol: "dueno" },
      empleado
    )) as Respuesta;
    expect(ascendiendo.estado).toBe(403);
  });

  it("pero sí puede cobrar y ver el catálogo", async () => {
    sembrarProducto("Pan", 1000, 400);

    expect((await pedir("GET", "/productos", {}, empleado)) as Respuesta).not.toBeInstanceOf(
      Respuesta
    );
    expect((await pedir("GET", "/panel", {}, empleado)) as Respuesta).not.toBeInstanceOf(Respuesta);
  });

  it("puede cambiar su propia contraseña, sabiendo la actual", async () => {
    const propio = a.leer((d) => d.usuarios.find((u) => u.usuario === "sofia")!.id);

    await expect(
      pedir("POST", `/usuarios/${propio}/clave`, { anterior: "mal", clave: "nueva" }, empleado)
    ).rejects.toThrow(/actual no es correcta/i);

    const bien = await pedir(
      "POST",
      `/usuarios/${propio}/clave`,
      { anterior: "mostrador", clave: "nueva" },
      empleado
    );
    expect(bien).toEqual({ ok: true });
  });

  it("no le cambia la contraseña a otro", async () => {
    const ajeno = a.leer((d) => d.usuarios.find((u) => u.usuario === "joaco")!.id);

    // Sin la del dueño, `anterior` no coincide y no pasa. Es lo que impide que
    // quien queda solo en el mostrador se quede con la cuenta del dueño.
    await expect(
      pedir("POST", `/usuarios/${ajeno}/clave`, { clave: "mia" }, empleado)
    ).rejects.toThrow();
  });
});

describe("lo que un empleado NO tiene que ver", () => {
  let dueno: string;
  let empleado: string;

  beforeEach(async () => {
    dueno = await primerDueno();
    empleado = await unEmpleado(dueno);
  });

  it("el costo de la mercadería no viaja en el catálogo", async () => {
    sembrarProducto("Pan francés", 2400, 1400);

    const suyo = (await pedir("GET", "/productos", {}, empleado)) as {
      items: { precioCosto: number | null; margen: number | null }[];
    };
    expect(suyo.items[0]!.precioCosto).toBeNull();
    expect(suyo.items[0]!.margen).toBeNull();

    // Y al dueño sí.
    const delDueno = (await pedir("GET", "/productos", {}, dueno)) as {
      items: { precioCosto: number | null }[];
    };
    expect(delDueno.items[0]!.precioCosto).toBe(1400);
  });

  it("tampoco pidiendo el producto de a uno, ni por código", async () => {
    const id = sembrarProducto("Pan francés", 2400, 1400);

    const uno = (await pedir("GET", `/productos/${id}`, {}, empleado)) as {
      precioCosto: number | null;
    };
    expect(uno.precioCosto).toBeNull();
  });

  it("el panel no le dice cuánto vale el depósito ni cuánto hay fiado", async () => {
    sembrarProducto("Pan francés", 2400, 1400);

    const suyo = (await pedir("GET", "/panel", {}, empleado)) as {
      stock: { valorVenta: number | null; valorCosto: number | null };
      fiado: number | null;
    };
    expect(suyo.stock.valorVenta).toBeNull();
    expect(suyo.stock.valorCosto).toBeNull();
    expect(suyo.fiado).toBeNull();

    const delDueno = (await pedir("GET", "/panel", {}, dueno)) as {
      stock: { valorVenta: number | null };
    };
    expect(delDueno.stock.valorVenta).toBe(24_000);
  });

  it("una venta no le muestra lo que costó cada renglón", async () => {
    const id = sembrarProducto("Pan francés", 2400, 1400);

    // Una venta hecha, con el costo del día guardado en el renglón.
    a.escribir((d) => {
      d.pedidos.push({
        id: nuevoId(),
        numero: 1,
        canal: "mostrador",
        estado: "entregado",
        nombre: "Mostrador",
        clienteId: null,
        notas: null,
        total: 2400,
        metodoPago: "efectivo",
        recibido: 2400,
        cajaId: null,
        usuarioId: null,
        usuario: null,
        descuento: 0,
        pagos: [],
        items: [
          {
            id: nuevoId(),
            productoId: id,
            nombre: "Pan francés",
            unidadMedida: "unidad",
            precio: 2400,
            costo: 1400,
            porPeso: false,
            cantidad: 1,
          },
        ],
        creadoEn: new Date().toISOString(),
      });
    });

    const suyo = (await pedir("GET", "/pedidos", {}, empleado)) as {
      items: { items: { costo?: number | null }[] }[];
    };
    expect(suyo.items[0]!.items[0]).not.toHaveProperty("costo");

    const delDueno = (await pedir("GET", "/pedidos", {}, dueno)) as {
      items: { items: { costo?: number | null }[] }[];
    };
    expect(delDueno.items[0]!.items[0]!.costo).toBe(1400);
  });

  it("no ve dónde está el archivo de datos ni cómo viene la copia", async () => {
    const suyo = (await pedir("GET", "/sistema", {}, empleado)) as Record<string, unknown>;
    expect(suyo.archivo).toBeUndefined();
    expect(suyo.resguardo).toBeUndefined();
    expect(suyo.conteos).toBeUndefined();
    // Pero sí el nombre del negocio, que va arriba de la columna.
    expect((suyo.config as { negocio: string }).negocio).toBeTruthy();
  });
});

describe("no quedarse sin dueño", () => {
  it("no se puede apagar al último", async () => {
    const dueno = await primerDueno();
    const id = a.leer((d) => d.usuarios[0]!.id);

    await expect(pedir("DELETE", `/usuarios/${id}`, {}, dueno)).rejects.toThrow(/al menos un dueño/i);
  });

  it("ni degradarlo a empleado", async () => {
    const dueno = await primerDueno();
    const id = a.leer((d) => d.usuarios[0]!.id);

    await expect(
      pedir("PUT", `/usuarios/${id}`, { nombre: "Joaquín", rol: "empleado" }, dueno)
    ).rejects.toThrow(/al menos un dueño/i);
  });

  it("pero sí si queda otro", async () => {
    const dueno = await primerDueno();
    await pedir("POST", "/usuarios", { nombre: "Ana", usuario: "ana", clave: "1234", rol: "dueno" }, dueno);

    const id = a.leer((d) => d.usuarios[0]!.id);
    const res = await pedir("PUT", `/usuarios/${id}`, { nombre: "Joaquín", rol: "empleado" }, dueno);
    expect((res as { rol: string }).rol).toBe("empleado");
  });
});

describe("dos personas no pueden tener el mismo usuario", () => {
  it("ni escribiéndolo distinto", async () => {
    const dueno = await primerDueno();

    await expect(
      pedir("POST", "/usuarios", { nombre: "Otro", usuario: "JOACO", clave: "1234", rol: "empleado" }, dueno)
    ).rejects.toThrow(/ya hay alguien/i);
  });
});
