import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen } from "../servidor/almacen.ts";

/**
 * El archivo de datos y sus copias.
 *
 * Es lo único que hay entre el negocio y perderlo todo: no hay servidor, no hay
 * nube, hay un JSON en una computadora. Estas pruebas cubren las tres promesas
 * que hace `Almacen` —nada a medias, ningún archivo roto, nunca una sola copia—
 * porque las tres se rompen en silencio.
 */

let carpeta: string;
let archivo: string;
let a: Almacen;

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-almacen-"));
  archivo = path.join(carpeta, "datos.json");
  a = new Almacen(archivo);
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe("escribir", () => {
  it("deja el cambio cuando la operación termina bien", () => {
    a.escribir((d) => {
      d.config.negocio = "Kiosco del Centro";
    });

    expect(a.leer((d) => d.config.negocio)).toBe("Kiosco del Centro");

    // Y quedó en el archivo, no solo en memoria.
    const enDisco = JSON.parse(fs.readFileSync(archivo, "utf8")) as { config: { negocio: string } };
    expect(enDisco.config.negocio).toBe("Kiosco del Centro");
  });

  it("vuelve todo atrás si la operación lanza a mitad de camino", () => {
    a.escribir((d) => {
      d.config.negocio = "Antes";
    });

    expect(() =>
      a.escribir((d) => {
        d.config.negocio = "A medias";
        d.categorias = [];
        throw new Error("algo salió mal");
      })
    ).toThrow("algo salió mal");

    expect(a.leer((d) => d.config.negocio)).toBe("Antes");
    expect(a.leer((d) => d.categorias.length)).toBe(1);
  });

  it("después de fallar sigue pudiendo escribir", () => {
    expect(() =>
      a.escribir(() => {
        throw new Error("no");
      })
    ).toThrow();

    a.escribir((d) => {
      d.config.negocio = "Después del error";
    });

    expect(a.leer((d) => d.config.negocio)).toBe("Después del error");
  });
});

describe("el archivo", () => {
  it("no deja el temporal tirado", () => {
    a.escribir((d) => {
      d.config.negocio = "Kiosco";
    });

    expect(fs.existsSync(`${archivo}.tmp`)).toBe(false);
  });

  it("aparta un archivo ilegible en vez de pisarlo", () => {
    fs.writeFileSync(archivo, "{ esto no es json", "utf8");

    const otro = new Almacen(archivo);
    expect(otro.leer((d) => d.productos)).toEqual([]);

    // El original no se perdió: quedó al lado con la fecha en el nombre.
    const apartados = fs.readdirSync(carpeta).filter((n) => n.includes(".roto-"));
    expect(apartados).toHaveLength(1);
  });
});

describe("las copias", () => {
  it("hace una sola copia por día", () => {
    expect(a.copiaDelDia()).not.toBeNull();
    // La segunda vez ya hay una de hoy y no hace nada.
    expect(a.copiaDelDia()).toBeNull();
    expect(a.listarCopias()).toHaveLength(1);
  });

  it("dos copias seguidas no se pisan", () => {
    a.copiar();
    a.copiar();
    expect(a.listarCopias()).toHaveLength(2);
  });

  it("no guarda más de veinte", () => {
    for (let i = 0; i < 25; i++) a.copiar();
    expect(a.listarCopias()).toHaveLength(20);
  });
});

describe("restaurar", () => {
  it("vuelve al estado de la copia y guarda el actual antes de pisarlo", () => {
    a.escribir((d) => {
      d.config.negocio = "Como estaba en la copia";
    });
    const copia = path.basename(a.copiar());

    a.escribir((d) => {
      d.config.negocio = "Lo de después";
    });

    const r = a.restaurar(copia);

    expect(a.leer((d) => d.config.negocio)).toBe("Como estaba en la copia");
    // Lo de después no se perdió: quedó guardado como copia.
    const previa = JSON.parse(
      fs.readFileSync(path.join(a.carpetaCopias, r.respaldoPrevio), "utf8")
    ) as { config: { negocio: string } };
    expect(previa.config.negocio).toBe("Lo de después");
  });

  it("no lee archivos de afuera de la carpeta de copias", () => {
    expect(() => a.restaurar("../datos.json")).toThrow(/no existe/i);
    expect(() => a.restaurar("no-existe.json")).toThrow(/no existe/i);
  });

  it("rechaza una copia dañada sin tocar la base", () => {
    a.escribir((d) => {
      d.config.negocio = "Intacto";
    });

    const rota = path.join(a.carpetaCopias, "datos-2026-01-01-000000.json");
    fs.writeFileSync(rota, "{ roto", "utf8");

    expect(() => a.restaurar(path.basename(rota))).toThrow(/dañada/i);
    expect(a.leer((d) => d.config.negocio)).toBe("Intacto");
  });

  it("rechaza un archivo que no es una base de Visual App", () => {
    const ajeno = path.join(a.carpetaCopias, "datos-2026-01-02-000000.json");
    fs.writeFileSync(ajeno, JSON.stringify({ hola: "mundo" }), "utf8");

    expect(() => a.restaurar(path.basename(ajeno))).toThrow(/no es una copia/i);
  });
});
