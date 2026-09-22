import type { IncomingMessage, ServerResponse } from "node:http";
import { Regla } from "./almacen.ts";
import type { Usuario } from "./tipos.ts";

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
  /**
   * Quién está haciendo el pedido, si hay alguien identificado.
   *
   * Null mientras el negocio no cargó ningún usuario: ahí la aplicación
   * funciona como siempre y no hay a quién atribuirle nada.
   */
  usuario: Usuario | null;
}

type Manejador = (ctx: Contexto) => unknown | Promise<unknown>;

/**
 * Quién puede llamar a una ruta.
 *
 * - `libre`    cualquiera, sin identificarse. Es para entrar y para las dos o
 *              tres cosas que la pantalla de ingreso necesita saber antes.
 * - `empleado` cualquiera que haya entrado. Es lo normal, y el valor por
 *              omisión: una ruta a la que nadie le puso permiso queda cerrada
 *              a los de afuera, no abierta.
 * - `dueno`    solo el dueño. Costos, márgenes, informes, gastos, la
 *              configuración y los usuarios.
 */
export type Permiso = "libre" | "empleado" | "dueno";

/**
 * Con qué credenciales llega el pedido.
 *
 * `exigir` en false es el caso del negocio que todavía no creó ningún usuario:
 * la aplicación se usa como antes de que esto existiera, sin pedir contraseña.
 * Es lo que hace que actualizar a esta versión no deje a nadie afuera de su
 * propio negocio.
 */
export interface Acceso {
  usuario: Usuario | null;
  exigir: boolean;
}

/** Sin usuarios cargados no se le pide nada a nadie. */
export const ACCESO_ABIERTO: Acceso = { usuario: null, exigir: false };

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
  /** Cabeceras extra. Hoy solo la cookie de la sesión. */
  readonly cabeceras: Record<string, string>;

  constructor(estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}) {
    this.estado = estado;
    this.cuerpo = cuerpo;
    this.cabeceras = cabeceras;
  }
}

/** Cómo se llama la cookie que lleva la sesión. */
export const COOKIE_SESION = "visualapp_sesion";

/**
 * La cookie de la sesión, armada.
 *
 * `HttpOnly` es lo que importa: sin eso, cualquier script de la página podría
 * leer el token y llevárselo. `SameSite=Strict` impide que otra pestaña la
 * mande en un pedido a nuestra API. `Secure` no va, porque esto viaja por
 * http://localhost y ahí el navegador descartaría la cookie.
 */
export function cookieDeSesion(token: string | null, segundos: number): string {
  const partes = [
    `${COOKIE_SESION}=${token ?? ""}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${token ? segundos : 0}`,
  ];
  return partes.join("; ");
}

/** El token que trae el pedido, si trae alguno. */
export function tokenDeCookies(cabecera: string | undefined): string | null {
  if (!cabecera) return null;

  for (const trozo of cabecera.split(";")) {
    const corte = trozo.indexOf("=");
    if (corte < 0) continue;
    if (trozo.slice(0, corte).trim() !== COOKIE_SESION) continue;

    const valor = trozo.slice(corte + 1).trim();
    // Solo hexadecimal: es lo único que produce `nuevoToken`, y así una cookie
    // con basura adentro se descarta antes de buscarla en ningún lado.
    return /^[a-f0-9]{16,128}$/.test(valor) ? valor : null;
  }

  return null;
}

export function noEncontrado(mensaje: string): Respuesta {
  return new Respuesta(404, { error: mensaje });
}

interface Ruta {
  metodo: string;
  patron: RegExp;
  nombres: string[];
  manejador: Manejador;
  permiso: Permiso;
}

export class Ruteador {
  private readonly rutas: Ruta[] = [];

  get(camino: string, manejador: Manejador, permiso?: Permiso) {
    return this.agregar("GET", camino, manejador, permiso);
  }
  post(camino: string, manejador: Manejador, permiso?: Permiso) {
    return this.agregar("POST", camino, manejador, permiso);
  }
  put(camino: string, manejador: Manejador, permiso?: Permiso) {
    return this.agregar("PUT", camino, manejador, permiso);
  }
  borrar(camino: string, manejador: Manejador, permiso?: Permiso) {
    return this.agregar("DELETE", camino, manejador, permiso);
  }

  private agregar(
    metodo: string,
    camino: string,
    manejador: Manejador,
    permiso: Permiso = "empleado"
  ): this {
    const nombres: string[] = [];
    const patron = camino.replace(/:([a-zA-Z]+)/g, (_, nombre: string) => {
      nombres.push(nombre);
      return "([^/]+)";
    });

    this.rutas.push({ metodo, patron: new RegExp(`^${patron}$`), nombres, manejador, permiso });
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
    cuerpo: Record<string, unknown>,
    acceso: Acceso = ACCESO_ABIERTO
  ): Promise<{ encontrada: boolean; resultado?: unknown }> {
    for (const ruta of this.rutas) {
      if (ruta.metodo !== metodo) continue;
      const coincidencia = ruta.patron.exec(camino);
      if (!coincidencia) continue;

      // El permiso se comprueba ACÁ y no en cada pantalla. Esconder un botón
      // no protege nada: cualquiera puede escribir la dirección de la API a
      // mano. La interfaz esconde lo que no corresponde para no ofrecer lo
      // imposible; esto es lo que de verdad lo impide.
      const negado = negar(ruta.permiso, acceso);
      if (negado) return { encontrada: true, resultado: negado };

      const params: Record<string, string> = {};
      ruta.nombres.forEach((nombre, i) => {
        params[nombre] = decodeURIComponent(coincidencia[i + 1] ?? "");
      });

      return {
        encontrada: true,
        resultado: await ruta.manejador({
          params,
          consulta,
          cuerpo,
          usuario: acceso.usuario,
        }),
      };
    }

    return { encontrada: false };
  }
}

/**
 * Devuelve la respuesta de rechazo, o null si el pedido puede pasar.
 *
 * Se distingue 401 de 403 a propósito: "entrá" y "entraste, pero esto no es
 * tuyo" piden cosas distintas de la pantalla. Con el primero manda a la
 * pantalla de ingreso; con el segundo no, porque volver a escribir la misma
 * contraseña no va a cambiar nada.
 */
function negar(permiso: Permiso, acceso: Acceso): Respuesta | null {
  // Todavía no hay usuarios: la aplicación funciona como siempre. Es lo que
  // hace que actualizar a esta versión no deje a nadie afuera de su negocio.
  if (!acceso.exigir) return null;
  if (permiso === "libre") return null;

  if (!acceso.usuario) {
    return new Respuesta(401, { error: "Entrá con tu usuario.", ingresar: true });
  }

  if (permiso === "dueno" && acceso.usuario.rol !== "dueno") {
    return new Respuesta(403, { error: "Esto lo puede ver solamente el dueño." });
  }

  return null;
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
