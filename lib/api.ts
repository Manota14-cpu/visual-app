/**
 * El único punto por el que la interfaz habla con el backend.
 *
 * En la aplicación, el servidor que corre adentro de Visual Solution sirve
 * estas páginas y la API desde el mismo origen, así que la dirección es
 * relativa. Durante el desarrollo, Next corre en el 3000 y la API en el 5177
 * (o en el que haya quedado: `electron/main.js` lo pasa en NEXT_PUBLIC_API).
 */
const BASE =
  process.env.NODE_ENV === "development"
    ? process.env.NEXT_PUBLIC_API ?? "http://localhost:5177"
    : "";

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly estado: number
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }
}

async function pedir<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  let respuesta: Response;

  try {
    respuesta = await fetch(`${BASE}/api${ruta}`, {
      ...opciones,
      // La sesión viaja en una cookie. En el paquete la interfaz y la API son
      // el mismo origen y la cookie iría sola; en desarrollo la pantalla corre
      // en otro puerto, y sin esto el navegador no la manda y todo contesta
      // "entrá con tu usuario" aunque la sesión esté abierta.
      credentials: "include",
      headers: { "Content-Type": "application/json", ...opciones?.headers },
    });
  } catch {
    // El backend es un programa en la misma computadora: si no contesta, se
    // cerró. Decirlo así ahorra buscar problemas de red que no existen.
    throw new ErrorApi("No se puede hablar con el programa. Cerrá Visual Solution y volvé a abrirlo.", 0);
  }

  if (respuesta.status === 204) return undefined as T;

  const texto = await respuesta.text();
  const cuerpo = texto ? (JSON.parse(texto) as unknown) : null;

  if (!respuesta.ok) {
    const mensaje =
      cuerpo && typeof cuerpo === "object" && "error" in cuerpo
        ? String((cuerpo as { error: unknown }).error)
        : "Algo salió mal.";
    throw new ErrorApi(mensaje, respuesta.status);
  }

  return cuerpo as T;
}

/** Arma `?a=1&b=2` salteando lo vacío, que si no viaja como "undefined". */
export function consulta(parametros: Record<string, string | number | undefined | null>): string {
  const partes = Object.entries(parametros)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return partes.length ? `?${partes.join("&")}` : "";
}

export const api = {
  get: <T>(ruta: string) => pedir<T>(ruta),
  post: <T>(ruta: string, cuerpo?: unknown) =>
    pedir<T>(ruta, { method: "POST", body: JSON.stringify(cuerpo ?? {}) }),
  put: <T>(ruta: string, cuerpo?: unknown) =>
    pedir<T>(ruta, { method: "PUT", body: JSON.stringify(cuerpo ?? {}) }),
  borrar: <T>(ruta: string) => pedir<T>(ruta, { method: "DELETE" }),
};
