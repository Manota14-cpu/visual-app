import { describe, expect, it } from "vitest";
import { armarCsv, leerCsv, separadorDe } from "../servidor/csv.ts";
import { numeroDeTexto } from "../servidor/reglas.ts";

/**
 * El archivo que entra por la importación no lo escribió este programa: lo
 * escribió Excel, o alguien a mano, o el sistema anterior del negocio. Si esto
 * se lee mal, el catálogo entero entra mal — y a diferencia de una pantalla,
 * no se ve hasta que ya pasó.
 */

describe("separadorDe", () => {
  it("reconoce el punto y coma que escribe Excel en español", () => {
    expect(separadorDe("sku;nombre;precio\nA;Cosa;100")).toBe(";");
  });

  it("reconoce la coma del CSV de toda la vida", () => {
    expect(separadorDe("sku,nombre,precio\nA,Cosa,100")).toBe(",");
  });

  it("no se confunde con las comas que hay dentro de los datos", () => {
    // El encabezado manda: es la única línea que seguro no tiene texto libre.
    expect(separadorDe('sku;nombre;precio\nA;"Bandeja, negra";100')).toBe(";");
  });

  it("reconoce el tabulador de lo pegado desde una planilla", () => {
    expect(separadorDe("sku\tnombre\tprecio")).toBe("\t");
  });
});

describe("leerCsv", () => {
  it("separa filas y columnas", () => {
    expect(leerCsv("a;b\n1;2", ";")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("respeta las comas dentro de las comillas", () => {
    expect(leerCsv('nombre,precio\n"Bandeja N°2, negra",100', ",")).toEqual([
      ["nombre", "precio"],
      ["Bandeja N°2, negra", "100"],
    ]);
  });

  it("entiende las comillas dobles como una comilla literal", () => {
    expect(leerCsv('a\n"Tubo de 3"" de largo"', ",")).toEqual([["a"], ['Tubo de 3" de largo']]);
  });

  it("aguanta el salto de línea adentro de una celda", () => {
    expect(leerCsv('a;b\n"Primera\nSegunda";2', ";")).toEqual([
      ["a", "b"],
      ["Primera\nSegunda", "2"],
    ]);
  });

  it("saca el BOM que Excel escribe adelante de todo", () => {
    // Sin esto la primera columna se llamaría "﻿sku" y no coincidiría con nada.
    expect(leerCsv("﻿sku;nombre", ";")[0]).toEqual(["sku", "nombre"]);
  });

  it("lee los finales de línea de Windows", () => {
    expect(leerCsv("a;b\r\n1;2\r\n", ";")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("ignora las líneas en blanco del final", () => {
    expect(leerCsv("a;b\n1;2\n\n\n", ";")).toHaveLength(2);
  });
});

describe("armarCsv", () => {
  it("entrecomilla solo lo que lo necesita", () => {
    const salida = armarCsv([
      ["nombre", "precio"],
      ["Bandeja; negra", 100],
      ["Vaso simple", 200],
    ]);

    expect(salida).toContain('"Bandeja; negra";100');
    expect(salida).toContain("Vaso simple;200");
  });

  it("escapa las comillas duplicándolas", () => {
    expect(armarCsv([['Tubo de 3" de largo']])).toContain('"Tubo de 3"" de largo"');
  });

  it("escribe el BOM para que Excel abra los acentos derechos", () => {
    expect(armarCsv([["categoría"]]).startsWith("﻿")).toBe(true);
  });

  it("vuelve a leerse tal como se escribió", () => {
    const original = [
      ["sku", "nombre", "precio"],
      ["A-1", 'Bandeja; con "comillas", y coma', "1200"],
    ];
    expect(leerCsv(armarCsv(original), ";")).toEqual(original);
  });
});

describe("numeroDeTexto", () => {
  it("lee las formas en que se escribe un importe en una planilla", () => {
    expect(numeroDeTexto("12500")).toBe(12500);
    expect(numeroDeTexto("12.500")).toBe(12500);
    expect(numeroDeTexto("$ 12.500")).toBe(12500);
    expect(numeroDeTexto("1.234,56")).toBe(1234.56);
  });

  it("da el mismo resultado que la interfaz", () => {
    // Son dos implementaciones —una en el servidor y otra en las pantallas— y
    // tienen que coincidir: el precio que se ve en la vista previa es el que se
    // guarda.
    expect(numeroDeTexto("1.234.567")).toBe(1234567);
    expect(numeroDeTexto("12,5")).toBe(12.5);
  });

  it("devuelve null cuando la celda no tiene un número", () => {
    expect(numeroDeTexto("")).toBeNull();
    expect(numeroDeTexto("   ")).toBeNull();
    expect(numeroDeTexto("sin definir")).toBeNull();
  });
});
