/**
 * Lo que la aplicación de escritorio le presta a la interfaz.
 *
 * Adentro de Visual App instalado, `electron/preload.js` deja un objeto
 * `window.visualApp` con lo poco que la página puede pedirle al
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
  imprimir: () => Promise<{ ok: boolean; motivo: string | null }>;
  guardarPdf: (nombre: string) => Promise<{ ok: boolean; archivo: string | null }>;
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
    visualApp?: PuenteEscritorio;
  }
}

/** El puente, o `null` fuera de la aplicación de escritorio. */
export function escritorio(): PuenteEscritorio | null {
  if (typeof window === "undefined") return null;
  return window.visualApp?.escritorio ? window.visualApp : null;
}

/**
 * Imprime la pantalla actual.
 *
 * En la aplicación de escritorio lo hace el programa: `window.print()` en una
 * ventana de Electron no abre nada. En el celular o en un navegador, el de
 * siempre. Si falla, lanza un error con un texto para mostrar.
 */
export async function imprimir(): Promise<void> {
  const puente = escritorio();
  if (!puente) {
    window.print();
    return;
  }
  const resultado = await puente.imprimir();
  if (!resultado.ok) throw new Error(motivoDeImpresion(resultado.motivo));
}

/**
 * Por qué no se pudo imprimir, dicho para quien está en el mostrador.
 *
 * "Failed to enumerate printers" es Windows sin su servicio de impresión: no
 * ve ninguna impresora, ni siquiera la de PDF. Es un ajuste de Windows, no
 * del programa, y hay que decir dónde se arregla.
 */
function motivoDeImpresion(motivo: string | null): string {
  if (motivo === "Failed to enumerate printers") {
    return 'Windows no puede imprimir: el servicio "Cola de impresión" está apagado. Se prende desde Servicios de Windows (buscá "Servicios" en el menú Inicio). Mientras tanto podés guardar en PDF.';
  }
  if (motivo === "no valid printers available") {
    return "No hay ninguna impresora instalada en esta computadora. Podés guardar en PDF.";
  }
  return "No se pudo imprimir. Revisá que la impresora esté prendida y conectada, o guardá en PDF.";
}

/**
 * Guarda la pantalla actual como PDF, preguntando dónde. Devuelve la ruta, o
 * `null` si se canceló.
 *
 * Fuera de la aplicación de escritorio abre el cuadro de impresión del
 * navegador, que trae "Guardar como PDF" entre los destinos.
 */
export async function guardarPdf(nombre: string): Promise<string | null> {
  const puente = escritorio();
  if (!puente) {
    window.print();
    return null;
  }
  const resultado = await puente.guardarPdf(nombre);
  if (!resultado.ok) throw new Error("No se pudo guardar el PDF.");
  return resultado.archivo;
}
