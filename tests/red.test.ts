import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen } from "../servidor/almacen.ts";
import { rutasSistema } from "../servidor/api/sistema.ts";
import { rutasUsuarios } from "../servidor/api/usuarios.ts";
import { Respuesta, Ruteador, tokenDeCookies, type Acceso } from "../servidor/http.ts";
import { esDireccionPrivada, puedeEntrar } from "../servidor/red.ts";
import { usuarioDeToken } from "../servidor/usuarios.ts";
import { matrizQr } from "../lib/qr.ts";

/**
 * Abrir el programa al wifi del local.
 *
 * Acá equivocarse no rompe una pantalla: deja entrar a alguien. Lo que
 * mantiene esto adentro del local son dos cosas, y las dos se prueban —que
 * solo pasen direcciones privadas, y que no se pueda prender sin contraseña—.
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

async function unDueno() {
  const res = await pedir("POST", "/usuarios/primero", {
    nombre: "Joaquín",
    usuario: "joaco",
    clave: "secreta",
  });
  const cookie = (res as Respuesta).cabeceras["Set-Cookie"]!;
  return tokenDeCookies(cookie.split(";")[0])!;
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-red-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
  r = new Ruteador();
  rutasUsuarios(r, a);
  rutasSistema(r, a);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("qué se considera la red del local", () => {
  it("los rangos que reparte un router puertas adentro", () => {
    for (const ip of ["192.168.1.37", "192.168.0.1", "10.0.0.5", "10.255.255.254", "172.16.0.1", "172.31.255.254"]) {
      expect(esDireccionPrivada(ip), ip).toBe(true);
    }
  });

  it("y nada que venga de internet", () => {
    // 172.32 en adelante ya es público, y es el error clásico al escribir
    // este rango a ojo.
    for (const ip of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "200.40.30.20", "1.1.1.1"]) {
      expect(esDireccionPrivada(ip), ip).toBe(false);
    }
  });
});

describe("el portero", () => {
  it("con la red apagada, solo esta computadora", () => {
    expect(puedeEntrar("localhost:5177", false)).toBe(true);
    expect(puedeEntrar("127.0.0.1:5177", false)).toBe(true);
    expect(puedeEntrar("192.168.1.37:5177", false)).toBe(false);
  });

  it("con la red prendida, también el wifi del local", () => {
    expect(puedeEntrar("192.168.1.37:5177", true)).toBe(true);
    expect(puedeEntrar("10.0.0.5:5177", true)).toBe(true);
  });

  it("pero nunca una dirección de internet", () => {
    expect(puedeEntrar("200.40.30.20:5177", true)).toBe(false);
    expect(puedeEntrar("8.8.8.8:5177", true)).toBe(false);
  });

  /**
   * Un dominio no entra ni con la red prendida.
   *
   * Es la puerta por la que se colaría un sitio de internet: si alguien apunta
   * `malo.com` a la IP del local, el navegador consideraría a Visual App "el
   * mismo sitio" y le dejaría leer las respuestas.
   */
  it("y ningún nombre de dominio, aunque apunte al local", () => {
    expect(puedeEntrar("http://malo.com", true)).toBe(false);
    expect(puedeEntrar("http://visual-app.local:5177", true)).toBe(false);
  });
});

describe("prender el acceso desde el celular", () => {
  it("no se puede sin usuarios con contraseña", async () => {
    // Sin esto, abrir el wifi deja entrar a cualquiera que esté conectado,
    // incluido un cliente si el local tiene wifi para clientes.
    await expect(pedir("PUT", "/sistema/red", { enRed: true })).rejects.toThrow(/usuarios/i);
    expect(a.leer((d) => d.config.enRed)).toBe(false);
  });

  it("con usuarios, sí", async () => {
    const dueno = await unDueno();

    const estado = (await pedir("PUT", "/sistema/red", { enRed: true }, dueno)) as {
      enRed: boolean;
    };

    expect(estado.enRed).toBe(true);
    expect(a.leer((d) => d.config.enRed)).toBe(true);
  });

  it("y un empleado no puede prenderlo", async () => {
    const dueno = await unDueno();
    await pedir(
      "POST",
      "/usuarios",
      { nombre: "Sofía", usuario: "sofia", clave: "mostrador", rol: "empleado" },
      dueno
    );
    const res = await pedir("POST", "/usuarios/ingresar", { usuario: "sofia", clave: "mostrador" });
    const empleado = tokenDeCookies(
      (res as Respuesta).cabeceras["Set-Cookie"]!.split(";")[0]
    )!;

    const negado = (await pedir("PUT", "/sistema/red", { enRed: true }, empleado)) as Respuesta;
    expect(negado.estado).toBe(403);
  });

  it("apagarlo vuelve a dejar solo esta computadora", async () => {
    const dueno = await unDueno();
    await pedir("PUT", "/sistema/red", { enRed: true }, dueno);
    await pedir("PUT", "/sistema/red", { enRed: false }, dueno);

    expect(a.leer((d) => d.config.enRed)).toBe(false);
  });
});

describe("el código QR", () => {
  /**
   * Solo se comprueba que salga algo con forma de QR.
   *
   * Que de verdad se LEA no se puede probar acá sin un decodificador, y el
   * codificador se verificó contra una implementación de referencia y contra
   * un lector real: sin eso, un QR mal armado se ve igual de bien que uno
   * bueno. Esto es el candado para que un cambio no lo rompa en silencio.
   */
  it("da una matriz cuadrada de un tamaño válido", () => {
    for (const texto of ["http://192.168.1.37:5177", "http://10.0.0.5:5177"]) {
      const m = matrizQr(texto);
      expect(m.length).toBeGreaterThanOrEqual(21);
      expect((m.length - 17) % 4).toBe(0);
      for (const fila of m) expect(fila).toHaveLength(m.length);
    }
  });

  it("tiene los tres ojos en las esquinas", () => {
    const m = matrizQr("http://192.168.1.37:5177");
    const lado = m.length;

    // El centro de cada ojo es negro y el anillo de alrededor, blanco.
    for (const [fy, fx] of [
      [3, 3],
      [3, lado - 4],
      [lado - 4, 3],
    ] as const) {
      expect(m[fy]![fx]).toBe(true);
      expect(m[fy - 2]![fx]).toBe(false);
    }
  });

  it("deja el separador blanco alrededor de los ojos", () => {
    // Estuvo negro, y con eso ningún lector reconocía el patrón.
    const m = matrizQr("Visual App");
    expect(m[0]![7]).toBe(false);
    expect(m[7]![0]).toBe(false);
    expect(m[7]![7]).toBe(false);
  });

  it("el mismo texto da siempre el mismo dibujo", () => {
    expect(matrizQr("http://10.0.0.5:5177")).toEqual(matrizQr("http://10.0.0.5:5177"));
  });
});
