import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import { cookieDeSesion, Respuesta, type Ruteador } from "../http.ts";
import { recortarObligatorio } from "../reglas.ts";
import {
  comoSeMuestra,
  cuidarElUltimoDueno,
  derivarClave,
  hashDeToken,
  HORAS_DE_SESION,
  nuevoToken,
  podarSesiones,
  validarClave,
  validarRol,
  validarUsuario,
  verificarClave,
} from "../usuarios.ts";
import type { Usuario } from "../tipos.ts";

/**
 * Quién usa el programa y cómo entra.
 *
 * Mientras no haya ningún usuario cargado, la aplicación funciona como siempre
 * y nadie tiene que escribir nada: un negocio que venía usándola no se queda
 * afuera por actualizar. El primer usuario que se crea prende la llave, y de
 * ahí en más hay que entrar.
 */

/**
 * Cuántos intentos fallidos seguidos se aguantan antes de hacer esperar.
 *
 * No es un ataque desde internet lo que preocupa —el servidor solo atiende a
 * esta computadora— sino el caso de todos los días: alguien que se queda solo
 * en el mostrador probando la contraseña del dueño. Con una espera que crece,
 * probar a mano deja de valer la pena.
 */
const INTENTOS_LIBRES = 5;
const ESPERA_MAXIMA_MS = 30_000;

/**
 * Los intentos fallidos, por usuario y en memoria.
 *
 * En memoria a propósito: no vale la pena escribir el archivo de datos en cada
 * contraseña errada, y que cerrar y abrir el programa limpie la cuenta es
 * aceptable. Quien reinicie la aplicación entre intento e intento va a tardar
 * más que la espera que esto impone.
 */
const fallos = new Map<string, { veces: number; ultimo: number }>();

function esperaPor(usuario: string): number {
  const marca = fallos.get(usuario);
  if (!marca || marca.veces <= INTENTOS_LIBRES) return 0;

  // Se duplica a partir del sexto: 1s, 2s, 4s… hasta medio minuto.
  const castigo = Math.min(2 ** (marca.veces - INTENTOS_LIBRES - 1) * 1000, ESPERA_MAXIMA_MS);
  const pasado = Date.now() - marca.ultimo;
  return Math.max(0, castigo - pasado);
}

export function rutasUsuarios(r: Ruteador, a: Almacen): void {
  /**
   * Con quién está abierta la aplicación.
   *
   * Es libre porque la pantalla de ingreso necesita preguntarlo antes de tener
   * sesión. No cuenta nada que un desconocido no pueda ver igual: si hace falta
   * entrar, y quién está adentro si ya entró.
   */
  r.get(
    "/usuarios/yo",
    ({ usuario }) => ({
      // Con la lista vacía la aplicación no pide contraseña. Es el estado en
      // que queda un negocio que actualiza desde una versión anterior.
      exigeIngreso: a.leer((d) => d.usuarios.some((u) => u.activo)),
      usuario: usuario ? comoSeMuestra(usuario) : null,
    }),
    "libre"
  );

  /**
   * Entrar.
   *
   * El mismo mensaje para usuario inexistente y contraseña errada: decir cuál
   * de las dos falló le regala a quien prueba la mitad del trabajo.
   */
  r.post(
    "/usuarios/ingresar",
    async ({ cuerpo }) => {
      const nombre = validarUsuario(cuerpo.usuario);

      const espera = esperaPor(nombre);
      if (espera > 0) {
        throw new Regla(
          `Demasiados intentos. Esperá ${Math.ceil(espera / 1000)} segundos y probá de nuevo.`
        );
      }

      const encontrado = a.leer((d) => d.usuarios.find((u) => u.usuario === nombre && u.activo));

      // Se verifica igual aunque el usuario no exista, contra una contraseña
      // inventada. Sin eso, un usuario que no existe contesta al instante y uno
      // que sí existe tarda lo que tarda scrypt: esa diferencia de tiempo dice
      // cuáles son los nombres válidos.
      const guardada =
        encontrado?.clave ?? "scrypt$00$" + "0".repeat(128);
      const correcta = await verificarClave(String(cuerpo.clave ?? ""), guardada);

      if (!encontrado || !correcta) {
        const marca = fallos.get(nombre) ?? { veces: 0, ultimo: 0 };
        fallos.set(nombre, { veces: marca.veces + 1, ultimo: Date.now() });
        throw new Regla("Usuario o contraseña incorrectos.");
      }

      fallos.delete(nombre);
      return abrirSesion(a, encontrado);
    },
    "libre"
  );

  /** Salir. La sesión se borra del archivo, no solo del navegador. */
  r.post("/usuarios/salir", ({ usuario }) => {
    if (usuario) {
      a.escribir((d) => {
        podarSesiones(d);
        d.sesiones = d.sesiones.filter((s) => s.usuarioId !== usuario.id);
      });
    }

    return new Respuesta(200, { ok: true }, { "Set-Cookie": cookieDeSesion(null, 0) });
  });

  /**
   * Crear el primero, cuando todavía no hay ninguno.
   *
   * Es libre porque para crearlo no hay con qué identificarse todavía. Deja de
   * poder usarse en cuanto existe un usuario activo: de ahí en más es `/usuarios`,
   * que pide ser dueño.
   *
   * Y lo deja adentro en el mismo acto. Sin eso, quien acaba de prender la
   * llave quedaría afuera de su propio negocio hasta volver a escribir lo que
   * escribió recién.
   */
  r.post(
    "/usuarios/primero",
    async ({ cuerpo }) => {
      if (a.leer((d) => d.usuarios.some((u) => u.activo))) {
        throw new Regla("Ya hay usuarios cargados. Entrá con el tuyo.");
      }

      const creado = await crear(a, cuerpo, "dueno");
      return abrirSesion(a, creado);
    },
    "libre"
  );

  // ──────────────────  De acá para abajo, solo el dueño  ──────────────────

  r.get("/usuarios", () => a.leer((d) => d.usuarios.map(comoSeMuestra)), "dueno");

  r.post("/usuarios", async ({ cuerpo }) => comoSeMuestra(await crear(a, cuerpo)), "dueno");

  r.put(
    "/usuarios/:id",
    ({ params, cuerpo }) =>
      a.escribir((d) => {
        const u = d.usuarios.find((x) => x.id === params.id);
        if (!u) throw new Regla("Ese usuario no existe.");

        const rol = cuerpo.rol === undefined ? u.rol : validarRol(cuerpo.rol);
        const activo = cuerpo.activo === undefined ? u.activo : cuerpo.activo === true;

        // Quedarse sin ningún dueño activo no tiene vuelta: nadie podría entrar
        // a Configuración, ni a los informes, ni acá a arreglarlo.
        cuidarElUltimoDueno(d, u.id, activo && rol === "dueno");

        u.nombre = recortarObligatorio(cuerpo.nombre as string, 60, "Poné un nombre.");
        u.rol = rol;
        u.activo = activo;

        // A quien se apaga o se degrada se lo echa ya. Esperar a que se le
        // venza la sesión dejaría a un ex empleado cobrando media jornada más.
        if (!activo || rol !== "dueno") {
          d.sesiones = d.sesiones.filter((s) => s.usuarioId !== u.id);
        }

        return comoSeMuestra(u);
      }),
    "dueno"
  );

  /**
   * Cambiar una contraseña.
   *
   * El dueño puede cambiar la de cualquiera sin saber la anterior —es la única
   * forma de que un empleado que la olvidó vuelva a trabajar—, pero cambiar la
   * propia pide la que está, para que una computadora que quedó abierta no
   * alcance para quedarse con la cuenta.
   */
  r.post(
    "/usuarios/:id/clave",
    async ({ params, cuerpo, usuario }) => {
      const objetivo = a.leer((d) => d.usuarios.find((x) => x.id === params.id));
      if (!objetivo) throw new Regla("Ese usuario no existe.");

      const esPropia = usuario?.id === objetivo.id;
      if (esPropia && !(await verificarClave(String(cuerpo.anterior ?? ""), objetivo.clave))) {
        throw new Regla("La contraseña actual no es correcta.");
      }

      const clave = await derivarClave(validarClave(cuerpo.clave));

      a.escribir((d) => {
        const u = d.usuarios.find((x) => x.id === objetivo.id)!;
        u.clave = clave;
        // Cambiar la contraseña cierra las sesiones de esa persona en todos
        // lados. Es lo que se espera cuando se la cambia justamente porque
        // alguien más la sabía.
        d.sesiones = d.sesiones.filter((s) => s.usuarioId !== u.id);
      });

      fallos.delete(objetivo.usuario);
      return { ok: true };
    },
    // No es "dueno": cada uno puede cambiar la suya. Quién puede cambiar la de
    // otro se decide adentro, comparando contra quién hizo el pedido.
    "empleado"
  );

  r.borrar(
    "/usuarios/:id",
    ({ params }) =>
      a.escribir((d) => {
        const u = d.usuarios.find((x) => x.id === params.id);
        if (!u) throw new Regla("Ese usuario no existe.");

        cuidarElUltimoDueno(d, u.id, false);

        // Se apaga, no se borra: las ventas y los turnos que lleva su nombre
        // tienen que seguir diciendo quién los hizo.
        u.activo = false;
        d.sesiones = d.sesiones.filter((s) => s.usuarioId !== u.id);

        return comoSeMuestra(u);
      }),
    "dueno"
  );
}

// ─────────────────────────────  Auxiliares  ─────────────────────────────

/** Da de alta un usuario, validando todo lo que viene de la pantalla. */
async function crear(
  a: Almacen,
  cuerpo: Record<string, unknown>,
  rolForzado?: "dueno"
): Promise<Usuario> {
  const usuario = validarUsuario(cuerpo.usuario);
  const nombre = recortarObligatorio(cuerpo.nombre as string, 60, "Poné un nombre.");
  const rol = rolForzado ?? validarRol(cuerpo.rol);
  const clave = await derivarClave(validarClave(cuerpo.clave));

  return a.escribir((d) => {
    if (d.usuarios.some((u) => u.usuario === usuario)) {
      throw new Regla(`Ya hay alguien con el usuario "${usuario}".`);
    }

    const nuevo: Usuario = {
      id: nuevoId(),
      nombre,
      usuario,
      clave,
      rol,
      activo: true,
      creadoEn: new Date().toISOString(),
      ultimoIngreso: null,
    };

    d.usuarios.push(nuevo);
    return nuevo;
  });
}

/** Abre la sesión, la guarda y devuelve la cookie con el token. */
function abrirSesion(a: Almacen, usuario: Usuario): Respuesta {
  const token = nuevoToken();
  const segundos = HORAS_DE_SESION * 3600;
  const ahora = new Date();

  const mostrado = a.escribir((d) => {
    podarSesiones(d);

    d.sesiones.push({
      hash: hashDeToken(token),
      usuarioId: usuario.id,
      creadaEn: ahora.toISOString(),
      expiraEn: new Date(ahora.getTime() + segundos * 1000).toISOString(),
    });

    const u = d.usuarios.find((x) => x.id === usuario.id)!;
    u.ultimoIngreso = ahora.toISOString();
    return comoSeMuestra(u);
  });

  return new Respuesta(
    200,
    { usuario: mostrado },
    { "Set-Cookie": cookieDeSesion(token, segundos) }
  );
}
