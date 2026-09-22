import os from "node:os";

/**
 * Atender a los celulares del local, sin abrirle la puerta a internet.
 *
 * El programa escucha en 127.0.0.1 y ahí no llega nadie de afuera. Para que el
 * celular del mostrador entre hay que escuchar en la red, y eso cambia quién
 * puede tocar la puerta: ya no es solo esta computadora.
 *
 * Dos cosas lo mantienen adentro del local:
 *
 * 1. **Solo direcciones privadas.** Se acepta 192.168.x.x, 10.x.x.x y
 *    172.16–31.x.x, que son los rangos que los routers reparten puertas
 *    adentro y que ningún router enruta desde internet. Una dirección pública
 *    se rechaza igual que antes.
 *
 * 2. **Contraseña obligatoria.** Sin usuarios creados esto no se puede
 *    prender. Abrir el wifi sin contraseña deja entrar a cualquiera que esté
 *    conectado, incluido un cliente si el local tiene wifi para clientes.
 */

/** Los rangos que un router reparte puertas adentro. */
const PRIVADAS = [
  /^10\./,
  /^192\.168\./,
  // 172.16.0.0 – 172.31.255.255. El 172.32 en adelante ya es público.
  /^172\.(1[6-9]|2\d|3[01])\./,
  // Lo que un dispositivo se autoasigna cuando el router no contesta.
  /^169\.254\./,
];

export function esDireccionPrivada(ip: string): boolean {
  const limpia = ip.replace(/^::ffff:/, "");
  if (limpia === "127.0.0.1" || limpia === "::1" || limpia === "localhost") return true;
  return PRIVADAS.some((rango) => rango.test(limpia));
}

/**
 * Las direcciones por las que se llega a esta computadora desde el local.
 *
 * Puede haber más de una —wifi y cable a la vez es lo normal— y no hay forma
 * de saber cuál va a usar el celular. Se devuelven todas y la pantalla las
 * muestra: quien mira sabe si está en el wifi o enchufado.
 */
export function direccionesDeRed(): string[] {
  const encontradas: string[] = [];

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const cada of interfaces ?? []) {
      if (cada.family !== "IPv4" || cada.internal) continue;
      if (!esDireccionPrivada(cada.address)) continue;
      encontradas.push(cada.address);
    }
  }

  // Las de 192.168 primero: es lo que reparte un router hogareño, y es la que
  // casi siempre corresponde. Las 169.254 al final — esas son de cuando algo
  // anda mal, y si hay otra, la otra sirve.
  return encontradas.sort((x, y) => puntaje(y) - puntaje(x));
}

function puntaje(ip: string): number {
  if (ip.startsWith("192.168.")) return 3;
  if (ip.startsWith("10.")) return 2;
  if (ip.startsWith("169.254.")) return 0;
  return 1;
}

/**
 * ¿Este `Host` o `Origin` puede entrar?
 *
 * Con la red apagada, solo esta computadora — es lo que había siempre. Con la
 * red prendida, además cualquier dirección privada.
 *
 * Se mira la dirección escrita en la cabecera y no de dónde vino el paquete,
 * porque de eso justamente se defiende: un dominio de internet que apunte a la
 * IP del local haría que el navegador considere a Visual App "el mismo sitio"
 * y le deje leer las respuestas.
 */
export function puedeEntrar(valor: string | undefined, enRed: boolean): boolean {
  if (valor === undefined) return true;

  const sinEsquema = valor.replace(/^https?:\/\//, "");
  const sinPuerto = sinEsquema.replace(/:\d+$/, "");

  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(sinPuerto)) return true;
  if (!enRed) return false;

  // Una dirección y nada más. Un nombre de dominio no entra ni con la red
  // prendida: es la puerta por la que se colaría un sitio de internet.
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(sinPuerto)) return false;

  return esDireccionPrivada(sinPuerto);
}
