import { spawn } from "node:child_process";

/**
 * Abre otro programa —el navegador, el explorador de archivos— sin arriesgar
 * el propio.
 *
 * `spawn` no lanza una excepción cuando el programa no existe o no se puede
 * ejecutar: avisa después, con un evento `error`. Un evento `error` que nadie
 * escucha en Node no es un error: es el final del proceso. Envuelto en
 * `try/catch` parecía cubierto y no lo estaba — probado, el proceso se muere
 * igual.
 *
 * Que no abra el explorador es un incordio. Que se apague Visual App con una
 * venta a medio cobrar, no.
 */
export function lanzar(programa: string, args: string[]): void {
  try {
    const hijo = spawn(programa, args, { detached: true, stdio: "ignore" });
    hijo.on("error", (error) => {
      console.error(`[lanzar] no se pudo abrir ${programa}: ${error.message}`);
    });
    hijo.unref();
  } catch (error) {
    console.error(`[lanzar] no se pudo abrir ${programa}: ${(error as Error).message}`);
  }
}
