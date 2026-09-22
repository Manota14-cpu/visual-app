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
