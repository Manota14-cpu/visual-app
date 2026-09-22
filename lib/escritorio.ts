/**
 * Lo que la aplicación de escritorio le presta a la interfaz.
 *
 * Adentro de Visual Solution instalado, `electron/preload.js` deja un objeto
 * `window.visualSolution` con lo poco que la página puede pedirle al
 * programa: las actualizaciones. En cualquier otro lado —el celular entrando
 * por el wifi del local, o `npm run web` en un navegador— no existe, y la
 * interfaz simplemente no ofrece lo que no puede hacer.
 */

export type FaseActualizacion =
  | "inactiva"
  | "buscando"
  | "disponible"
  | "al-dia"
  | "descargando"
  | "lista"
  | "error"
  | "no-disponible";

export interface EstadoActualizacion {
  fase: FaseActualizacion;
  /** La versión instalada, la de `package.json`. */
  actual: string;
  /** La que está publicada en GitHub, si es más nueva. */
  nueva: string | null;
  notas: string | null;
  /** De 0 a 100, mientras baja. */
  progreso: number;
  error: string | null;
  revisadaEn: string | null;
}

interface PuenteEscritorio {
  escritorio: true;
  actualizacion: {
    estado: () => Promise<EstadoActualizacion | null>;
    buscar: () => Promise<EstadoActualizacion | null>;
    descargar: () => Promise<EstadoActualizacion | null>;
    instalar: () => Promise<null>;
    alCambiar: (funcion: (estado: EstadoActualizacion) => void) => () => void;
  };
}

declare global {
  interface Window {
    visualSolution?: PuenteEscritorio;
  }
}

/** El puente, o `null` fuera de la aplicación de escritorio. */
export function escritorio(): PuenteEscritorio | null {
  if (typeof window === "undefined") return null;
  return window.visualSolution?.escritorio ? window.visualSolution : null;
}
