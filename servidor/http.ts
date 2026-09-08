import type { IncomingMessage, ServerResponse } from "node:http";
import { Regla } from "./almacen.ts";

/**
 * El ruteador.
 *
 * Son nueve archivos de endpoints y ningún middleware: un ruteador de sesenta
 * líneas alcanza y evita sumar un framework —con su árbol de dependencias— a
 * una aplicación que se distribuye como un archivo para hacer doble clic.
 */

export interface Contexto {
  /** Las partes variables de la ruta: `/productos/:id` deja `{ id }`. */
  params: Record<string, string>;
  /** Lo que viene después del `?`. */
  consulta: URLSearchParams;
  /** El cuerpo del pedido, ya interpretado. Vacío en un GET. */
  cuerpo: Record<string, unknown>;
}

type Manejador = (ctx: Contexto) => unknown | Promise<unknown>;

/**
 * Una respuesta con un código distinto de 200.
 *
 * Los campos se asignan a mano en vez de declararlos en el constructor: Node
 * ejecuta estos archivos borrando los tipos, sin compilarlos, y esa forma corta
 * no se puede borrar — deja de ser JavaScript válido.
 */
export class Respuesta {
  readonly estado: number;
  readonly cuerpo: unknown;

  constructor(estado: number, cuerpo: unknown) {
    this.estado = estado;
    this.cuerpo = cuerpo;
  }
}

export function noEncontrado(mensaje: string): Respuesta {
  return new Respuesta(404, { error: mensaje });
}

interface Ruta {
  metodo: string;
  patron: RegExp;
  nombres: string[];
  manejador: Manejador;
}

export class Ruteador {
  private readonly rutas: Ruta[] = [];

  get(camino: string, manejador: Manejador) {
    return this.agregar("GET", camino, manejador);
  }
  post(camino: string, manejador: Manejador) {
    return this.agregar("POST", camino, manejador);
  }
  put(camino: string, manejador: Manejador) {
    return this.agregar("PUT", camino, manejador);
  }
  borrar(camino: string, manejador: Manejador) {
    return this.agregar("DELETE", camino, manejador);
  }

  private agregar(metodo: string, camino: string, manejador: Manejador): this {
    const nombres: string[] = [];
    const patron = camino.replace(/:([a-zA-Z]+)/g, (_, nombre: string) => {
      nombres.push(nombre);
      return "([^/]+)";
    });

    this.rutas.push({ metodo, patron: new RegExp(`^${patron}$`), nombres, manejador });
    return this;
  }

  /**
   * Busca la ruta y la ejecuta. Devuelve false si ninguna coincide, para que
   * quien llame decida qué hacer con eso.
   *
   * Las rutas se prueban en el orden en que se registraron: `/productos/buscar`
   * tiene que declararse antes que `/productos/:id`, o el literal terminaría
   * entrando como id.
   */
  async resolver(
    metodo: string,
    camino: string,
    consulta: URLSearchParams,
    cuerpo: Record<string, unknown>
  ): Promise<{ encontrada: boolean; resultado?: unknown }> {
    for (const ruta of this.rutas) {
      if (ruta.metodo !== metodo) continue;
      const coincidencia = ruta.patron.exec(camino);
      if (!coincidencia) continue;

      const params: Record<string, string> = {};
      ruta.nombres.forEach((nombre, i) => {
        params[nombre] = decodeURIComponent(coincidencia[i + 1] ?? "");
      });

      return { encontrada: true, resultado: await ruta.manejador({ params, consulta, cuerpo }) };
    }

    return { encontrada: false };
  }
}

/** Lee el cuerpo de un pedido y lo interpreta como JSON. */
export async function leerCuerpo(req: IncomingMessage): Promise<Record<string, unknown>> {
  const partes: Buffer[] = [];
  let tamano = 0;

  for await (const parte of req) {
    tamano += (parte as Buffer).length;
    // Nada de lo que manda esta aplicación se acerca a un mega. Un cuerpo más
    // grande que eso no es un formulario: es algo que salió mal.
    if (tamano > 1_000_000) throw new Regla("El pedido es demasiado grande.");
    partes.push(parte as Buffer);
  }

  if (partes.length === 0) return {};

  try {
    const texto = Buffer.concat(partes).toString("utf8").trim();
    if (!texto) return {};
    const datos: unknown = JSON.parse(texto);
    return typeof datos === "object" && datos !== null ? (datos as Record<string, unknown>) : {};
  } catch {
    throw new Regla("El pedido llegó mal formado.");
  }
}

export function responderJson(res: ServerResponse, estado: number, cuerpo: unknown): void {
  const texto = JSON.stringify(cuerpo ?? null);
  res.writeHead(estado, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(texto),
    "Cache-Control": "no-store",
  });
  res.end(texto);
}
