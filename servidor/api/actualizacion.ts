import type { Almacen } from "../almacen.ts";
import { aplicar, estado, revisar } from "../actualizacion.ts";
import type { Ruteador } from "../http.ts";

/**
 * Las novedades del programa.
 *
 * Buscar es barato y no cambia nada, así que se puede pedir cuando se quiera.
 * Aplicar cierra el programa y lo vuelve a abrir, así que solo pasa cuando
 * alguien aprieta el botón.
 */
export function rutasActualizacion(r: Ruteador, _a: Almacen): void {
  r.get("/actualizacion", () => estado());

  r.post("/actualizacion/revisar", async () => await revisar());

  r.post("/actualizacion/aplicar", async () => {
    const resultado = await aplicar();

    // Se contesta primero y se apaga después. El actualizador ya está corriendo
    // suelto y espera unos segundos; irse acá dejaría al navegador con la
    // conexión cortada justo cuando todo salió bien.
    setTimeout(() => process.exit(0), 400).unref();

    return resultado;
  });
}
