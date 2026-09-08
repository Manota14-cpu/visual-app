import { describe, expect, it } from "vitest";
import { esPosterior } from "../servidor/actualizacion.ts";

/**
 * Qué versión es más nueva.
 *
 * Es la decisión que dispara todo lo demás: si dice que sí, el programa se baja
 * un archivo de internet y se reemplaza a sí mismo. Equivocarse para el lado de
 * "hay novedades" es reinstalar lo mismo en un bucle; para el otro, es quedarse
 * clavado en una versión vieja sin que nadie se entere.
 */
describe("esPosterior", () => {
  it("compara número por número, no como texto", () => {
    // El caso que hace fallar la comparación alfabética: "1.10.0" es posterior
    // a "1.9.0", pero como texto iría antes.
    expect(esPosterior("1.10.0", "1.9.0")).toBe(true);
    expect(esPosterior("2.0.0", "1.99.99")).toBe(true);
  });

  it("reconoce lo que de verdad es más nuevo", () => {
    expect(esPosterior("1.0.1", "1.0.0")).toBe(true);
    expect(esPosterior("1.1.0", "1.0.9")).toBe(true);
  });

  it("no se actualiza a lo mismo ni para atrás", () => {
    expect(esPosterior("1.0.0", "1.0.0")).toBe(false);
    expect(esPosterior("0.9.9", "1.0.0")).toBe(false);
  });

  it("completa con ceros lo que no está escrito", () => {
    expect(esPosterior("1.0", "1.0.0")).toBe(false);
    expect(esPosterior("1.0.1", "1.0")).toBe(true);
  });

  it("ante algo que no es una versión, no hace nada", () => {
    // Un aviso mal publicado no puede disparar una instalación.
    expect(esPosterior("hola", "1.0.0")).toBe(false);
    expect(esPosterior("", "1.0.0")).toBe(false);
    expect(esPosterior("1.0.x", "1.0.0")).toBe(false);
  });
});
