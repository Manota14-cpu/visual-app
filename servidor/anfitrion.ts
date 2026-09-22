/**
 * Lo que el servidor le pide al programa que lo contiene.
 *
 * El servidor atiende pedidos y guarda datos; no sabe dibujar ventanas. Cuando
 * hace falta algo de la computadora —el cuadro de "elegir carpeta", abrir el
 * explorador, cerrar el programa— se lo pide a quien lo está corriendo:
 *
 *   - En la aplicación de escritorio, Electron: cuadros nativos de Windows,
 *     sin PowerShell ni consolas de por medio.
 *   - Corriendo suelto con `npm run servidor` (para desarrollar la API en un
 *     navegador), nadie: cada ruta cae a lo que puede hacer Node solo.
 *
 * Vive aparte para que las rutas no importen a Electron. Así se siguen
 * probando con `vitest` sin ventanas, y el servidor sigue arrancando solo.
 */
export interface Anfitrion {
  /** La versión del programa, la de `package.json`. */
  version: string;
  /** El cuadro de "elegir carpeta". `null` si la persona lo cerró sin elegir. */
  elegirCarpeta?: () => Promise<string | null>;
  /** Abre una carpeta en el explorador de archivos. */
  abrirCarpeta?: (carpeta: string) => void;
  /** Cierra el programa entero. */
  apagar?: () => void;
}

let actual: Anfitrion = {
  version: process.env.npm_package_version ?? "desarrollo",
};

export function usarAnfitrion(anfitrion: Anfitrion): void {
  actual = anfitrion;
}

export function anfitrion(): Anfitrion {
  return actual;
}
