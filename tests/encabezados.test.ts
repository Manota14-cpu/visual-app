import { describe, expect, it } from "vitest";
import { mapearEncabezado } from "../servidor/api/traspaso.ts";

/**
 * Qué columna es cada cosa.
 *
 * Es la parte de la importación que falla en silencio: si el encabezado no se
 * reconoce, la columna se ignora y el archivo entra igual, sin un solo error, y
 * el stock queda como estaba. Por eso se prueba acá y no a ojo.
 */

const campo = (encabezado: string) => mapearEncabezado([encabezado])[0];

describe("reconocer la columna de stock", () => {
  it("acepta cómo la escribe la gente, no solo «stock»", () => {
    for (const escrito of [
      "stock",
      "Stock",
      "STOCK",
      "Stock actual",
      "Cantidad de stock",
      "Cantidad en stock",
      "Stock disponible",
      "Cantidad",
      "Cant.",
      "Existencias",
      "Existencia actual",
      "Unidades disponibles",
    ]) {
      expect(campo(escrito), `"${escrito}"`).toBe("stock");
    }
  });

  it("no confunde el stock mínimo con el stock", () => {
    // El de arriba es cuánto hay; el de abajo, cuándo hay que reponer. Que la
    // palabra «stock» se llevara los dos era el error obvio de buscar por
    // pedazos, y habría cargado el mínimo como si fuera la existencia.
    for (const escrito of ["Stock mínimo", "stock minimo", "Mínimo", "Cantidad mínima", "Reponer en"]) {
      expect(campo(escrito), `"${escrito}"`).toBe("stockMinimo");
    }
  });
});

describe("reconocer los precios", () => {
  it("separa el costo del precio de venta", () => {
    expect(campo("Precio de costo")).toBe("costo");
    expect(campo("Costo unitario")).toBe("costo");
    expect(campo("Precio de compra")).toBe("costo");

    expect(campo("Precio")).toBe("precio");
    expect(campo("Precio de venta")).toBe("precio");
    expect(campo("Precio público")).toBe("precio");
  });
});

describe("reconocer los códigos", () => {
  it("distingue el código interno del de barras", () => {
    expect(campo("Código")).toBe("sku");
    expect(campo("SKU")).toBe("sku");
    expect(campo("Código interno")).toBe("sku");

    expect(campo("Código de barras")).toBe("codigoBarras");
    expect(campo("EAN")).toBe("codigoBarras");
    expect(campo("Cod. barras")).toBe("codigoBarras");
  });
});

describe("el resto", () => {
  it("reconoce lo demás con sus nombres habituales", () => {
    expect(campo("Producto")).toBe("nombre");
    expect(campo("Nombre del artículo")).toBe("nombre");
    expect(campo("Rubro")).toBe("categoria");
    expect(campo("Familia")).toBe("categoria");
    expect(campo("Unidad de medida")).toBe("unidad");
    expect(campo("Presentación")).toBe("unidad");
    expect(campo("Descripción")).toBe("descripcion");
  });

  it("deja fuera lo que no entiende, en vez de adivinar", () => {
    expect(campo("Proveedor")).toBe("");
    expect(campo("IVA")).toBe("");
    expect(campo("")).toBe("");
  });
});

describe("dos columnas para el mismo campo", () => {
  it("se queda con la que lo dice con todas las letras", () => {
    // Una planilla con las dos: la exacta gana aunque venga después. Quedarse
    // con la primera hacía que una columna auxiliar le ganara a la buena por
    // estar más a la izquierda.
    expect(mapearEncabezado(["Cantidad de stock", "Stock"])).toEqual(["", "stock"]);
    expect(mapearEncabezado(["Stock", "Stock actual"])).toEqual(["stock", ""]);
  });

  it("ante dos aproximadas se queda con la primera", () => {
    expect(mapearEncabezado(["Stock actual", "Cantidad en stock"])).toEqual(["stock", ""]);
  });
});

describe("una planilla de verdad", () => {
  it("mapea un encabezado completo escrito a mano", () => {
    expect(
      mapearEncabezado([
        "Código",
        "Producto",
        "Rubro",
        "Precio de costo",
        "Precio público",
        "Stock actual",
        "Stock mínimo",
        "Proveedor",
      ])
    ).toEqual([
      "sku",
      "nombre",
      "categoria",
      "costo",
      "precio",
      "stock",
      "stockMinimo",
      "",
    ]);
  });
});
