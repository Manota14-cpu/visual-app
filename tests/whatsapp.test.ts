import { describe, expect, it } from "vitest";
import { enlaceWhatsApp, mensajeDeuda, numeroWhatsApp } from "@/lib/whatsapp";

/**
 * El número al que va el recordatorio de deuda.
 *
 * Mandarle a alguien la deuda de otro es peor que no mandar nada: ante la
 * duda, el número no se arma y WhatsApp se abre para elegir el contacto.
 */
describe("el número para WhatsApp", () => {
  it("entiende los números como se dictan acá", () => {
    expect(numeroWhatsApp("3492 15-44-9075")).toBe("5493492449075");
    expect(numeroWhatsApp("011 15 5555-1234")).toBe("5491155551234");
    expect(numeroWhatsApp("11 5555-1234")).toBe("5491155551234");
    expect(numeroWhatsApp("0351 15 555-1234")).toBe("5493515551234");
    expect(numeroWhatsApp("3492 44-9075")).toBe("5493492449075");
  });

  it("acepta los que ya vienen con el código del país", () => {
    expect(numeroWhatsApp("+54 9 11 5555 1234")).toBe("5491155551234");
    expect(numeroWhatsApp("+54 11 5555 1234")).toBe("5491155551234");
    expect(numeroWhatsApp("0054 9 351 555 1234")).toBe("5493515551234");
  });

  it("no inventa un número cuando no le cierran las cifras", () => {
    expect(numeroWhatsApp("449075")).toBeNull();
    expect(numeroWhatsApp("")).toBeNull();
    expect(numeroWhatsApp(null)).toBeNull();
    expect(numeroWhatsApp("no tiene")).toBeNull();
    // Un celular anotado sin característica: con el 15 son diez cifras, pero
    // no hay forma de saber de qué ciudad es.
    expect(numeroWhatsApp("15 5555-1234")).toBeNull();
    expect(numeroWhatsApp("15-44-9075")).toBeNull();
  });
});

describe("el recordatorio", () => {
  it("saluda por el nombre de pila y dice cuánto y de dónde", () => {
    expect(mensajeDeuda("Marta Rodríguez", 36200, "Almacén Don Carlos")).toBe(
      "Hola Marta! Te escribimos de Almacén Don Carlos. Te recordamos que tenés un saldo pendiente de $36.200. Cuando puedas, pasá a saldarlo. ¡Gracias!"
    );
  });

  it("sin número abre WhatsApp para elegir el contacto", () => {
    expect(enlaceWhatsApp(null, "Hola")).toBe("https://wa.me/?text=Hola");
    expect(enlaceWhatsApp("11 5555-1234", "Hola Marta")).toBe("https://wa.me/5491155551234?text=Hola%20Marta");
  });
});
