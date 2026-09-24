import { plata } from "@/lib/formato";

/**
 * Un teléfono argentino como lo pide WhatsApp: 549 + característica + número.
 *
 * En la agenda los números están escritos como cada uno los dicta: "3492
 * 15-44-9075", "011 15 5555-1234", "+54 9 11 5555 1234". Sin el 0 de la
 * característica, sin el 15 del celular y con el 9 de los celulares adelante
 * quedan diez cifras, que es lo que tiene todo número de acá.
 *
 * Si no se llega a esas diez cifras devuelve null: mejor abrir WhatsApp sin
 * destinatario, para elegirlo a mano, que mandarle la deuda a otra persona.
 */
export function numeroWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  let cifras = telefono.replace(/\D/g, "");
  if (cifras.startsWith("00")) cifras = cifras.slice(2);
  if (cifras.startsWith("54")) {
    cifras = cifras.slice(2);
    if (cifras.startsWith("9")) cifras = cifras.slice(1);
  }
  if (cifras.startsWith("0")) cifras = cifras.slice(1);

  // Con el 15 quedan doce: la característica tiene dos, tres o cuatro cifras,
  // y el 15 va justo después.
  if (cifras.length === 12) {
    const largo = [2, 3, 4].find((n) => cifras.slice(n, n + 2) === "15");
    if (largo) cifras = cifras.slice(0, largo) + cifras.slice(largo + 2);
  }

  // Toda característica empieza con 11, 2 o 3. Un "15 5555-1234" anotado
  // sin característica también da diez cifras, y armado así es el celular de
  // otra persona.
  return cifras.length === 10 && /^(11|[23])/.test(cifras) ? `549${cifras}` : null;
}

/** El recordatorio amable de lo que se debe, para mandarlo tal cual o corregirlo. */
export function mensajeDeuda(cliente: string, debe: number, negocio?: string | null): string {
  const nombre = cliente.trim().split(/\s+/)[0] ?? cliente;
  const desde = negocio?.trim() ? ` Te escribimos de ${negocio.trim()}.` : "";
  return `Hola ${nombre}!${desde} Te recordamos que tenés un saldo pendiente de ${plata(debe)}. Cuando puedas, pasá a saldarlo. ¡Gracias!`;
}

/** El enlace que abre WhatsApp con el mensaje escrito. */
export function enlaceWhatsApp(telefono: string | null | undefined, mensaje: string): string {
  const numero = numeroWhatsApp(telefono);
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(mensaje)}`;
}
