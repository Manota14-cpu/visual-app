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

/**
 * Por dónde está atendiendo el servidor AHORA.
 *
 * No es lo mismo que lo configurado: prender el acceso desde el celular recién
 * tiene efecto al reabrir el programa, porque cambiar en caliente por dónde
 * escucha significaría soltar la conexión de quien esté cobrando.
 */
let puertoEnUso = 0;
let escuchandoEnRed = false;

export function anotarEscucha(puerto: number, enRed: boolean): void {
  puertoEnUso = puerto;
  escuchandoEnRed = enRed;
}

export function puertoDeEscucha(): number {
  return puertoEnUso;
}

export function estaEscuchandoEnRed(): boolean {
  return escuchandoEnRed;
}
