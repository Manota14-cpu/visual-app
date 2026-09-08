/**
 * El pulso de la ventana.
 *
 * La interfaz avisa cada veinte segundos que sigue abierta. El servidor mira
 * ese momento para saber si todavía hay alguien del otro lado: cuando pasa
 * demasiado tiempo sin noticias, se apaga solo.
 *
 * Vive en su propio archivo porque lo escriben los endpoints y lo lee el
 * arranque, y no tiene sentido que uno importe al otro para dos líneas.
 */

let ultimo = Date.now();

export function latir(): void {
  ultimo = Date.now();
}

export function ultimoLatido(): number {
  return ultimo;
}
