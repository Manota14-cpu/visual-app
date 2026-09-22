import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { Regla } from "./almacen.ts";
import type { BaseDatos, Rol, Usuario } from "./tipos.ts";

/**
 * Contraseñas y sesiones.
 *
 * Todo sale de `node:crypto`, que ya viene con Node: una aplicación que se
 * distribuye como un archivo para hacer doble clic no puede sumar un paquete
 * nativo que haya que compilar en la computadora de cada negocio.
 */

/**
 * Cuánto dura una sesión sin volver a pedir la contraseña.
 *
 * Doce horas es un turno largo: quien abre a la mañana no tiene que volver a
 * escribirla al mediodía. Más que eso y la computadora del mostrador queda
 * abierta de un día para el otro, que es justo lo que esto viene a evitar.
 */
export const HORAS_DE_SESION = 12;

/**
 * El costo de derivar la contraseña.
 *
 * Es el de fábrica de Node y tarda como una décima de segundo. Ese retraso es
 * el punto: hace que probar contraseñas a lo bruto sea lento. Como se paga una
 * vez por ingreso y no por pedido, nadie lo nota.
 */
const COSTO = 16_384;
const LARGO_CLAVE = 64;

/** `scrypt` es de callback. Esta es la misma función, esperable. */
function derivar(texto: string, sal: Buffer): Promise<Buffer> {
  return new Promise((listo, falla) => {
    scrypt(texto.normalize("NFKC"), sal, LARGO_CLAVE, { N: COSTO }, (error, clave) => {
      if (error) falla(error);
      else listo(clave);
    });
  });
}

/**
 * Convierte una contraseña en lo que se guarda.
 *
 * Nunca se guarda el texto. Cada contraseña lleva su propia sal, así dos
 * personas con la misma contraseña no comparten el resultado y una tabla
 * armada de antemano no sirve de nada.
 */
export async function derivarClave(texto: string): Promise<string> {
  const sal = randomBytes(16);
  const clave = await derivar(texto, sal);
  return `scrypt$${sal.toString("hex")}$${clave.toString("hex")}`;
}

/**
 * ¿Es esta la contraseña?
 *
 * La comparación es de tiempo constante. Con un `===` común, el tiempo que
 * tarda en decir que no depende de cuántas letras acertó, y eso alcanza para
 * ir adivinando de a un carácter.
 */
export async function verificarClave(texto: string, guardada: string): Promise<boolean> {
  const partes = guardada.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;

  const sal = Buffer.from(partes[1]!, "hex");
  const esperada = Buffer.from(partes[2]!, "hex");
  if (sal.length === 0 || esperada.length !== LARGO_CLAVE) return false;

  const candidata = await derivar(texto, sal);
  return timingSafeEqual(candidata, esperada);
}

// ─────────────────────────────  Sesiones  ─────────────────────────────

/** El token que se le da al navegador. Nunca se guarda así. */
export function nuevoToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Lo que sí se guarda del token.
 *
 * El archivo de datos es texto común y encima se copia a un pendrive todos los
 * días. Con los tokens en claro adentro, cualquiera que agarre una copia entra
 * como el dueño sin saber ninguna contraseña. Del hash no se vuelve.
 *
 * Alcanza con SHA-256 sin sal: un token de 32 bytes al azar no se adivina con
 * una tabla, que es de lo que la sal protege a una contraseña.
 */
export function hashDeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * De quién es esta sesión, si sigue viva.
 *
 * Devuelve null cuando el token no existe, ya venció, o el usuario fue dado de
 * baja: apagar a alguien tiene que echarlo ya, no cuando se le venza la sesión.
 */
export function usuarioDeToken(d: BaseDatos, token: string | null): Usuario | null {
  if (!token) return null;

  const sesion = d.sesiones.find((s) => s.hash === hashDeToken(token));
  if (!sesion || new Date(sesion.expiraEn).getTime() <= Date.now()) return null;

  const usuario = d.usuarios.find((u) => u.id === sesion.usuarioId);
  return usuario?.activo ? usuario : null;
}

/**
 * Saca las sesiones que ya no sirven.
 *
 * Sin esto la lista crece para siempre: un ingreso por día durante tres años
 * son mil sesiones vencidas viajando adentro de cada copia de seguridad.
 */
export function podarSesiones(d: BaseDatos): void {
  const ahora = Date.now();
  d.sesiones = d.sesiones.filter((s) => new Date(s.expiraEn).getTime() > ahora);
}

// ──────────────────────────────  Reglas  ──────────────────────────────

/**
 * El nombre de usuario, normalizado.
 *
 * Sin mayúsculas ni acentos: quien escribe "Sofía" a la mañana escribe "sofia"
 * a la tarde, y las dos veces tiene que entrar. Se guarda ya convertido para
 * que la comparación sea directa.
 */
export function normalizarUsuario(texto: unknown): string {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Mínimo de la contraseña. Corto, pero no cualquier cosa. */
export const LARGO_MINIMO = 4;

export function validarUsuario(texto: unknown): string {
  const usuario = normalizarUsuario(texto);
  if (!usuario) throw new Regla("Poné un nombre de usuario.");
  if (usuario.length > 32) throw new Regla("El nombre de usuario es demasiado largo.");
  if (!/^[a-z0-9._-]+$/.test(usuario)) {
    throw new Regla("El usuario solo puede tener letras, números, puntos, guiones y guión bajo.");
  }
  return usuario;
}

export function validarClave(texto: unknown): string {
  const clave = String(texto ?? "");
  if (clave.length < LARGO_MINIMO) {
    throw new Regla(`La contraseña tiene que tener al menos ${LARGO_MINIMO} caracteres.`);
  }
  if (clave.length > 200) throw new Regla("La contraseña es demasiado larga.");
  return clave;
}

export function validarRol(texto: unknown): Rol {
  if (texto !== "dueno" && texto !== "empleado") throw new Regla("El rol no es válido.");
  return texto;
}

/**
 * Lo que se puede contar de un usuario hacia afuera.
 *
 * La contraseña derivada no sale nunca de acá. Es lo único que impide que
 * alguien se la lleve y la ataque con tiempo y una placa de video.
 */
export function comoSeMuestra(u: Usuario) {
  return {
    id: u.id,
    nombre: u.nombre,
    usuario: u.usuario,
    rol: u.rol,
    activo: u.activo,
    creadoEn: u.creadoEn,
    ultimoIngreso: u.ultimoIngreso,
  };
}

/**
 * El último dueño encendido no se puede apagar ni degradar.
 *
 * Sin esto, el negocio se queda sin nadie que pueda entrar a Configuración, a
 * los informes ni a los usuarios — y la única salida sería editar el archivo
 * JSON a mano.
 */
export function cuidarElUltimoDueno(d: BaseDatos, id: string, quedaDueno: boolean): void {
  if (quedaDueno) return;

  const otros = d.usuarios.filter((u) => u.id !== id && u.activo && u.rol === "dueno");
  if (otros.length === 0) {
    throw new Regla("Tiene que quedar al menos un dueño activo.");
  }
}

/**
 * ¿Quien pregunta puede ver los números del negocio?
 *
 * Sin nadie identificado también da que sí: es el negocio que todavía no cargó
 * usuarios, donde la aplicación funciona como siempre.
 */
export function esDueno(usuario: { rol: Rol } | null): boolean {
  return !usuario || usuario.rol === "dueno";
}

/**
 * El sello de quién hizo algo, listo para guardar.
 *
 * El nombre va copiado y no referenciado, por la misma razón que el nombre de
 * un producto en un renglón de venta: dar de baja a alguien, o corregirle una
 * letra al nombre, no puede reescribir lo que el historial dice que pasó.
 */
export function selloDe(usuario: { id: string; nombre: string } | null) {
  return {
    usuarioId: usuario?.id ?? null,
    usuario: usuario?.nombre ?? null,
  };
}
