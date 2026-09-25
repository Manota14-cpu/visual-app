import { describe, expect, it } from "vitest";
import { decidirEnter } from "@/app/caja/buscador-productos";

/**
 * Qué pasa al apretar Enter en el buscador del mostrador.
 *
 * Es la decisión que más caro sale equivocar: de un lado carga el producto
 * correcto, del otro le cobra al cliente una cosa por otra y le descuenta el
 * stock al que no era. Y es difícil de ver a ojo, porque depende de una carrera
 * entre lo que se escribió y lo que el buscador alcanzó a contestar.
 */

const RESULTADOS = ["Coca-Cola 1.5L", "Coca-Cola 500ml", "Coca-Cola Zero"];

describe("Enter en el buscador", () => {
  it("elige el resaltado cuando la lista corresponde a lo escrito", () => {
    expect(decidirEnter("coca", "coca", RESULTADOS, 0)).toEqual({
      accion: "elegir",
      producto: "Coca-Cola 1.5L",
    });

    expect(decidirEnter("coca", "coca", RESULTADOS, 2)).toEqual({
      accion: "elegir",
      producto: "Coca-Cola Zero",
    });
  });

  it("ignora la lista cuando quedó vieja y busca el código exacto", () => {
    // El caso del lector: se escribió el código entero de un saque y la lista
    // sigue siendo la de la búsqueda anterior. Confiar en ella cargaría una
    // Coca-Cola en lugar del producto escaneado.
    const decision = decidirEnter("7790040123456", "coca", RESULTADOS, 0);

    expect(decision).toEqual({ accion: "codigo", codigo: "7790040123456" });
  });

  it("con un código de barras entero no elige de la lista, aunque parezca al día", () => {
    // Los shampoos de una misma línea comparten los primeros dígitos. La lista
    // puede ser la de un pedazo del código y su primero, otra variante.
    const variantes = ["Shampoo Manzana", "Shampoo Coco"];
    expect(decidirEnter("7791293000028", "7791293000028", variantes, 0)).toEqual({
      accion: "codigo",
      codigo: "7791293000028",
    });
  });

  it("busca el código cuando todavía no contestó nada", () => {
    expect(decidirEnter("7790040123456", "", [], 0)).toEqual({
      accion: "codigo",
      codigo: "7790040123456",
    });
  });

  it("busca el código cuando la búsqueda por nombre no encontró nada", () => {
    expect(decidirEnter("XJ-40", "XJ-40", [], 0)).toEqual({ accion: "codigo", codigo: "XJ-40" });
  });

  it("acepta códigos internos cortos", () => {
    // Con el umbral viejo —seis— un código de estantería de cuatro o cinco
    // caracteres no se consultaba nunca y Enter no hacía nada.
    expect(decidirEnter("A100", "A100", [], 0)).toEqual({ accion: "codigo", codigo: "A100" });
  });

  it("no hace nada con un texto demasiado corto", () => {
    expect(decidirEnter("ab", "ab", [], 0)).toEqual({ accion: "nada" });
    expect(decidirEnter("", "", [], 0)).toEqual({ accion: "nada" });
  });

  it("no se confunde por los espacios de los costados", () => {
    expect(decidirEnter("  coca  ", "coca", RESULTADOS, 0)).toEqual({
      accion: "elegir",
      producto: "Coca-Cola 1.5L",
    });
  });

  it("si el resaltado apunta fuera de la lista, va al código", () => {
    expect(decidirEnter("coca", "coca", [], 0)).toEqual({ accion: "codigo", codigo: "coca" });
  });
});
