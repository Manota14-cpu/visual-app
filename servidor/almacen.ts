import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BaseDatos, ConfigBalanza } from "./tipos.ts";

/**
 * Un error de negocio, con un mensaje escrito para quien está usando la app.
 * La API lo devuelve como 400; cualquier otra excepción es un 500 y se anota en
 * la consola del servidor.
 */
export class Regla extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "Regla";
  }
}

export function nuevoId(): string {
  return randomUUID().replace(/-/g, "");
}

/**
 * Cuántas copias se conservan. Con una automática por día son casi tres
 * semanas de historia, que es hasta donde alguien va a querer volver.
 */
const COPIAS_A_GUARDAR = 20;

/**
 * El archivo JSON que hace de base de datos.
 *
 * Todo vive en memoria y se escribe entero en cada cambio. Con el volumen de un
 * negocio —miles de productos, decenas de miles de movimientos— el archivo no
 * pasa de unos pocos megas y serializarlo tarda milisegundos; a cambio no hay
 * motor que instalar, ni conexión que configurar, ni esquema que migrar.
 *
 * Dos garantías que sí hacen falta:
 *
 * 1. **Nada a medias.** Un cobro toca el pedido, sus pagos y el stock de varios
 *    productos. Si el cuarto renglón no tiene stock, los tres primeros no
 *    pueden quedar descontados. `escribir` guarda el estado anterior antes de
 *    tocar nada y lo restaura si la operación falla — es lo que una base hacía
 *    con una transacción.
 *
 * 2. **Ningún archivo roto.** Escribir sobre el archivo bueno significa que un
 *    corte de luz a mitad de camino deja un JSON truncado y se pierde todo. Se
 *    escribe en un temporal, se fuerza el temporal a disco con `fsync` y recién
 *    ahí se reemplaza, que es una operación atómica del sistema de archivos.
 *    Sin el `fsync` el rename es igual de atómico pero puede publicar un
 *    archivo cuyos bytes todavía no salieron de la caché del sistema.
 *
 * 3. **Nunca una sola copia.** El archivo vive en una computadora sola. Se
 *    guarda una copia fechada al abrir el programa y otra al cerrar cada turno
 *    de caja, y desde Configuración se puede volver a cualquiera de ellas.
 */
export class Almacen {
  readonly archivo: string;
  readonly carpetaCopias: string;

  private datos: BaseDatos;
  /** El último estado que llegó a guardarse bien. Es el punto de retorno. */
  private respaldo: string;

  constructor(archivo: string) {
    this.archivo = archivo;
    this.carpetaCopias = path.join(path.dirname(archivo), "copias");

    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.mkdirSync(this.carpetaCopias, { recursive: true });

    const existia = fs.existsSync(archivo);
    this.datos = this.cargar();
    this.respaldo = JSON.stringify(this.datos, null, 2);

    // Si el archivo no existía queda creado ya mismo: así se ve dónde vive la
    // información desde el primer arranque, sin tener que cargar algo primero.
    if (!existia) this.escribirArchivo(this.respaldo);
  }

  private cargar(): BaseDatos {
    if (!fs.existsSync(this.archivo)) return inicial();

    try {
      const texto = fs.readFileSync(this.archivo, "utf8");
      if (!texto.trim()) return inicial();
      return normalizar(JSON.parse(texto) as BaseDatos);
    } catch (error) {
      // Un archivo ilegible no se pisa: se aparta con la fecha en el nombre y
      // se arranca limpio. Perder los datos en silencio sería peor que
      // cualquier error.
      const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const apartado = `${this.archivo}.roto-${sello}`;
      fs.renameSync(this.archivo, apartado);
      console.error(
        `[almacen] el archivo no se pudo leer (${(error as Error).message}). Se guardó como ${apartado} y se empezó de cero.`
      );
      return inicial();
    }
  }

  /** Lectura. No toca el archivo. */
  leer<T>(consulta: (d: BaseDatos) => T): T {
    return consulta(this.datos);
  }

  /**
   * Escritura. Si la operación lanza, la base vuelve exactamente a como estaba
   * y el archivo no se toca.
   *
   * Node atiende un pedido por vez, así que no hace falta candado: mientras
   * corre esta función nadie más está tocando `datos`.
   */
  escribir<T>(operacion: (d: BaseDatos) => T): T {
    try {
      const resultado = operacion(this.datos);
      this.guardar();
      return resultado;
    } catch (error) {
      this.datos = JSON.parse(this.respaldo) as BaseDatos;
      throw error;
    }
  }

  private guardar(): void {
    const texto = JSON.stringify(this.datos, null, 2);
    this.escribirArchivo(texto);
    this.respaldo = texto;
  }

  private escribirArchivo(texto: string): void {
    const temporal = `${this.archivo}.tmp`;

    // Escribir y renombrar no alcanza por sí solo. El rename es atómico —el
    // archivo bueno nunca se ve a medias—, pero eso es una garantía sobre el
    // NOMBRE, no sobre el CONTENIDO: el sistema operativo puede tener los
    // bytes todavía en su caché cuando se corta la luz, y entonces el archivo
    // renombrado aparece vacío o cortado. `fsync` es lo que obliga a que los
    // datos estén de verdad en el disco ANTES de que el nombre cambie.
    const fd = fs.openSync(temporal, "w");
    try {
      fs.writeFileSync(fd, texto, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    renombrarConReintentos(temporal, this.archivo);
  }

  /**
   * Deja una copia fechada al lado del archivo y devuelve su ruta.
   *
   * Es lo que reemplaza a la descarga de un respaldo: la copia queda en la
   * computadora, en una carpeta que se puede abrir, sin pasar por el navegador.
   *
   * Las copias van sin indentar. El archivo de trabajo se escribe prolijo
   * porque está pensado para poder abrirlo y leerlo; una copia no se lee a
   * mano —se restaura desde Configuración— y sin los espacios ocupa un cuarto
   * menos, que multiplicado por una copia por día es la diferencia entre una
   * carpeta que molesta y una que no.
   */
  copiar(): string {
    const destino = this.nombreLibre(this.selloAhora());
    fs.writeFileSync(destino, JSON.stringify(this.datos), "utf8");
    this.podar();
    return destino;
  }

  /**
   * La copia del día, si todavía no se hizo. Devuelve su ruta, o null si ya
   * había una de hoy.
   *
   * Nadie se acuerda de apretar el botón de copia. Y el día que hace falta
   * —el disco que no arranca, la computadora que se moja— la última copia
   * resulta ser de hace cuatro meses. Esto corre solo al abrir el programa:
   * cuesta unos milisegundos y cambia "perdí todo" por "perdí lo de hoy".
   */
  copiaDelDia(): string | null {
    const hoy = this.selloAhora().slice(0, 10); // aaaa-mm-dd
    const yaHay = this.listarCopias().some((c) => c.startsWith(`datos-${hoy}`));
    if (yaHay) return null;
    return this.copiar();
  }

  /** Las copias que hay en el destino de afuera, de la más nueva a la más vieja. */
  listarCopiasDe(carpeta: string): string[] {
    try {
      const destino = this.carpetaDestino(carpeta);
      if (!this.destinoDisponible(carpeta) || !fs.existsSync(destino)) return [];
      return fs
        .readdirSync(destino)
        .filter((n) => n.startsWith("datos-") && n.endsWith(".json"))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  /** Las copias que hay, de la más nueva a la más vieja. */
  listarCopias(): string[] {
    if (!fs.existsSync(this.carpetaCopias)) return [];
    return fs
      .readdirSync(this.carpetaCopias)
      .filter((n) => n.startsWith("datos-") && n.endsWith(".json"))
      .sort()
      .reverse();
  }

  /**
   * Vuelve a una copia guardada.
   *
   * Antes de reemplazar nada deja una copia del estado actual: restaurar por
   * error la copia equivocada no puede ser un camino de ida. Y la copia se
   * valida ANTES de tocar la base — si el archivo está roto, esto lanza y todo
   * queda como estaba.
   */
  restaurar(nombre: string, carpeta?: string): { desde: string; respaldoPrevio: string } {
    // `carpeta` es el destino de la copia de afuera. Volver desde ahí es el
    // caso que le da sentido a todo esto: la computadora vieja no arranca, en
    // la nueva se instala Visual App, se elige el pendrive y se vuelve. Sin
    // esta rama la copia estaba pero había que meterla a mano en la carpeta
    // correcta, justo el día en que nadie quiere tocar nada.
    const desdeAfuera = carpeta !== undefined;
    const origenCarpeta = desdeAfuera ? this.carpetaDestino(carpeta) : this.carpetaCopias;
    const disponibles = desdeAfuera ? this.listarCopiasDe(carpeta) : this.listarCopias();

    // El nombre viene de la pantalla: se acepta un archivo de la carpeta de
    // copias y nada más. Sin esto, un "../../otra cosa" leería cualquier
    // archivo de la computadora.
    if (path.basename(nombre) !== nombre || !disponibles.includes(nombre)) {
      throw new Regla("Esa copia no existe.");
    }

    const origen = path.join(origenCarpeta, nombre);
    const texto = fs.readFileSync(origen, "utf8");

    let nueva: BaseDatos;
    try {
      nueva = JSON.parse(texto) as BaseDatos;
    } catch {
      throw new Regla("Esa copia está dañada y no se puede leer.");
    }

    if (!nueva || typeof nueva !== "object" || !Array.isArray(nueva.productos)) {
      throw new Regla("Ese archivo no es una copia de Visual App.");
    }

    const respaldoPrevio = this.copiar();
    this.datos = normalizar(nueva);
    this.guardar();

    return { desde: nombre, respaldoPrevio: path.basename(respaldoPrevio) };
  }

  private selloAhora(): string {
    const ahora = new Date();
    const dos = (n: number) => String(n).padStart(2, "0");
    return [
      ahora.getFullYear(),
      dos(ahora.getMonth() + 1),
      dos(ahora.getDate()),
      dos(ahora.getHours()) + dos(ahora.getMinutes()) + dos(ahora.getSeconds()),
    ].join("-");
  }

  /**
   * Ninguna copia pisa a otra. El nombre llegaba hasta el minuto, así que dos
   * copias seguidas —hacer una a mano y vaciar la base, por ejemplo— dejaban
   * una sola: la segunda borraba a la primera y la pantalla decía "guardada"
   * las dos veces.
   */
  private nombreLibre(sello: string): string {
    let destino = path.join(this.carpetaCopias, `datos-${sello}.json`);
    for (let n = 2; fs.existsSync(destino) && n < 100; n++) {
      destino = path.join(this.carpetaCopias, `datos-${sello}-${n}.json`);
    }
    return destino;
  }

  /**
   * Deja las últimas COPIAS_A_GUARDAR y borra el resto.
   *
   * Cada copia es la base entera. Con una por día y nada que las borre, la
   * carpeta crece para siempre hasta ser varias veces el tamaño de los datos
   * que protege. Veinte cubren casi un mes de trabajo, que es todo lo que
   * alguien va a querer mirar hacia atrás.
   */
  private podar(): void {
    const sobran = this.listarCopias().slice(COPIAS_A_GUARDAR);
    for (const nombre of sobran) {
      try {
        fs.unlinkSync(path.join(this.carpetaCopias, nombre));
      } catch {
        // Una copia que no se puede borrar —abierta en otro programa, por
        // ejemplo— no es motivo para voltear la operación que la generó.
      }
    }
  }

  // ──────────────────  La copia fuera de la computadora  ──────────────────
  //
  // Las copias de acá arriba viven al lado del archivo, en el mismo disco. Eso
  // protege de "me equivoqué y quiero volver atrás", que es lo más frecuente.
  // No protege del caso que las motiva: el disco que no arranca, la
  // computadora que se moja, la que se roban. Ahí las copias se van con ella.
  //
  // Por eso hay un segundo destino, que elige el negocio: un pendrive que queda
  // enchufado, la carpeta de OneDrive o Drive que ya usan, una carpeta de la
  // red. Nosotros no hosteamos nada ni tocamos datos ajenos — el negocio decide
  // dónde y es dueño de su respaldo.

  /** La subcarpeta donde se dejan las copias adentro del destino elegido. */
  private carpetaDestino(carpeta: string): string {
    // En una subcarpeta propia: el destino suele ser la raíz de un pendrive o
    // de OneDrive, y veinte archivos sueltos ahí adentro son un desastre.
    return path.join(carpeta, "Visual App", "copias");
  }

  /**
   * ¿Está la carpeta que eligió el negocio?
   *
   * Se mira la carpeta ELEGIDA, no la subcarpeta de copias. La diferencia
   * parece menor y no lo es: `mkdir` recursivo crea toda la rama sin chistar,
   * así que preguntando por la subcarpeta, un pendrive desenchufado se veía
   * igual que uno recién configurado —"todavía no hay copias"— y encima la
   * copia siguiente se escribía en una carpeta inventada en el disco de
   * adentro. Una copia de seguridad guardada en el mismo disco que protege no
   * es una copia de seguridad, y decía que todo andaba bien.
   */
  private destinoDisponible(carpeta: string): boolean {
    try {
      return fs.statSync(carpeta).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Explica en castellano por qué no se pudo escribir.
   *
   * El mensaje del sistema llega como "ENOENT: no such file or directory" y no
   * le dice nada a nadie. Y acá importa que se entienda: si la copia de
   * seguridad falla y el aviso no se entiende, se ignora.
   */
  private porQueFallo(error: unknown): string {
    const codigo = (error as NodeJS.ErrnoException).code;
    if (codigo === "ENOENT" || codigo === "ENXIO" || codigo === "EHOSTDOWN") {
      return "No se encuentra la carpeta. Si es un pendrive, fijate que esté enchufado.";
    }
    if (codigo === "ENOTDIR") return "Esa ruta no es una carpeta.";
    if (codigo === "EACCES" || codigo === "EPERM" || codigo === "EROFS") {
      return "La carpeta no deja escribir.";
    }
    if (codigo === "ENOSPC") return "No queda espacio en el destino.";
    if (codigo === "EBUSY") return "El destino está ocupado por otro programa.";
    return (error as Error).message;
  }

  /**
   * Prueba que se pueda escribir de verdad, y devuelve el error si no.
   *
   * Se escribe y se vuelve a leer un archivo de prueba en vez de mirar si la
   * carpeta existe: una carpeta de red puede existir y no dejar escribir, y un
   * pendrive protegido contra escritura se monta igual. Vale la pena saberlo
   * al elegir la carpeta y no seis meses después, el día que hace falta.
   */
  probarDestino(carpeta: string): string | null {
    if (!this.destinoDisponible(carpeta)) {
      return "No se encuentra esa carpeta. Fijate que esté bien escrita y, si es un pendrive, que esté enchufado.";
    }

    const prueba = path.join(this.carpetaDestino(carpeta), ".prueba-visual-app");
    try {
      fs.mkdirSync(this.carpetaDestino(carpeta), { recursive: true });
      const testigo = `Visual App ${new Date().toISOString()}`;
      fs.writeFileSync(prueba, testigo, "utf8");
      if (fs.readFileSync(prueba, "utf8") !== testigo) {
        return "La carpeta acepta escribir pero lo guardado no coincide.";
      }
      fs.unlinkSync(prueba);
      return null;
    } catch (error) {
      try {
        fs.unlinkSync(prueba);
      } catch {
        // Si tampoco se puede borrar el testigo, el error de arriba ya lo dice.
      }
      return this.porQueFallo(error);
    }
  }

  /**
   * Qué hay hoy en el destino. Se mira la carpeta, no un registro de lo hecho.
   *
   * Preguntarle a la carpeta es la única respuesta que no puede mentir: un
   * registro guardado diría "copiado el martes" aunque alguien haya borrado
   * los archivos o el pendrive sea otro. Y de paso, que la lectura falle ES la
   * señal de que el destino no está disponible ahora mismo.
   */
  estadoResguardo(carpeta: string): {
    ultima: string | null;
    copias: number;
    error: string | null;
  } {
    // Que no esté la carpeta elegida es una falla, no un "todavía nada": el
    // pendrive no está puesto y mientras tanto no hay copia de seguridad.
    if (!this.destinoDisponible(carpeta)) {
      return {
        ultima: null,
        copias: 0,
        error: "No se encuentra la carpeta. Si es un pendrive, fijate que esté enchufado.",
      };
    }

    // La subcarpeta de copias sí puede faltar sin drama: es la que creamos
    // nosotros, y que no esté solo quiere decir que todavía no se copió nada.
    const nombres = this.listarCopiasDe(carpeta);
    return { ultima: nombres[0] ?? null, copias: nombres.length, error: null };
  }

  /**
   * Deja la copia del día en el destino de afuera, si todavía no está.
   *
   * Devuelve la ruta escrita, o null si ya había una de hoy. Con `forzar` la
   * hace igual: quien aprieta el botón a mano quiere una copia de lo de recién,
   * no que le digan que ya hay una de esta mañana.
   *
   * Lanza con un mensaje entendible si el destino no está disponible: quien
   * llama decide si eso frena algo —no frena nada— pero el motivo tiene que
   * llegar a la pantalla, porque una copia que falla en silencio es peor que no
   * tenerla.
   */
  resguardar(carpeta: string, forzar = false): string | null {
    const destino = this.carpetaDestino(carpeta);
    const sello = this.selloAhora();
    const hoy = sello.slice(0, 10);

    // La carpeta elegida tiene que estar. Nosotros creamos la subcarpeta de
    // copias adentro, nunca la raíz: si `mkdir` recursivo la inventa, una copia
    // con el pendrive afuera termina en el disco de adentro, que es el disco
    // del que esto viene a proteger.
    if (!this.destinoDisponible(carpeta)) {
      throw new Regla("No se encuentra la carpeta. Si es un pendrive, fijate que esté enchufado.");
    }

    try {
      fs.mkdirSync(destino, { recursive: true });

      const existentes = fs
        .readdirSync(destino)
        .filter((n) => n.startsWith("datos-") && n.endsWith(".json"))
        .sort();
      if (!forzar && existentes.some((n) => n.startsWith(`datos-${hoy}`))) return null;

      const texto = JSON.stringify(this.datos);

      // Ningún nombre pisa a otro. El sello llega al segundo, así que dos
      // copias a mano seguidas caían en el mismo archivo: la segunda borraba a
      // la primera y la pantalla decía "guardada" las dos veces. Es el mismo
      // problema que `nombreLibre` resuelve para las copias de adentro.
      let archivo = path.join(destino, `datos-${sello}.json`);
      for (let n = 2; fs.existsSync(archivo) && n < 100; n++) {
        archivo = path.join(destino, `datos-${sello}-${n}.json`);
      }

      // Se escribe al lado y se renombra, igual que el archivo de trabajo: un
      // pendrive que se desenchufa a mitad de la copia no puede dejar un
      // archivo cortado con cara de copia buena.
      const temporal = `${archivo}.tmp`;
      fs.writeFileSync(temporal, texto, "utf8");
      fs.renameSync(temporal, archivo);

      // Y se comprueba que lo que quedó en el destino sea lo que se mandó.
      // En un disco extraíble o de red, que la escritura no tire error no
      // alcanza para saber que los bytes llegaron.
      const escrito = fs.statSync(archivo).size;
      if (escrito !== Buffer.byteLength(texto, "utf8")) {
        throw new Error(`La copia quedó incompleta (${escrito} bytes de ${texto.length}).`);
      }

      // Podar acá también: un pendrive de 4 GB con una copia por día y nada
      // que las borre se llena, y ahí dejan de entrar las nuevas.
      for (const viejo of [...existentes, path.basename(archivo)]
        .sort()
        .reverse()
        .slice(COPIAS_A_GUARDAR)) {
        try {
          fs.unlinkSync(path.join(destino, viejo));
        } catch {
          // Una copia vieja que no se deja borrar no invalida la nueva.
        }
      }

      return archivo;
    } catch (error) {
      throw new Regla(this.porQueFallo(error));
    }
  }

  tamano(): number {
    try {
      return fs.statSync(this.archivo).size;
    } catch {
      return 0;
    }
  }

  /** Deja la base como recién instalada. Antes deja una copia. */
  vaciar(): void {
    this.copiar();
    this.datos = inicial();
    this.guardar();
  }

  /** Reemplaza la base entera. Se usa al cargar los datos de ejemplo. */
  reemplazar(nueva: BaseDatos): void {
    this.datos = nueva;
    this.guardar();
  }
}

/**
 * Renombra, reintentando unos instantes si Windows tiene el archivo tomado.
 *
 * En Windows un rename falla con EPERM o EBUSY si otro programa tiene abierto
 * el destino en ese momento: el antivirus revisándolo, OneDrive subiéndolo, el
 * indexador de búsqueda. Dura milisegundos, pero sin reintento esa venta se
 * perdía con un "algo falló" en medio del mostrador. Hasta ocho intentos, en
 * menos de un segundo en total; si sigue tomado, el error sube como antes.
 */
function renombrarConReintentos(desde: string, hacia: string): void {
  for (let intento = 0; ; intento++) {
    try {
      fs.renameSync(desde, hacia);
      return;
    } catch (error) {
      const codigo = (error as NodeJS.ErrnoException).code ?? "";
      if (intento >= 8 || !["EPERM", "EBUSY", "EACCES"].includes(codigo)) throw error;
      // Espera sin ocupar el procesador. Es un servidor de un solo hilo, así que
      // bloquear un instante acá es lo mismo que el guardado ya hace con fsync.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (intento + 1));
    }
  }
}

/**
 * Completa lo que una base guardada antes no tenia.
 *
 * El archivo de una version vieja no conoce las listas que se agregaron
 * despues, y sin esto el programa arranca y explota al primer recorrido con un
 * "no es iterable". Es la migracion mas barata posible: agregar lo que falta y
 * no tocar nada de lo que ya estaba.
 */
function normalizar(d: BaseDatos): BaseDatos {
  d.cobrosFiado ??= [];

  // Una base guardada antes de que existiera la copia de afuera no trae el
  // campo. Queda en null, que es "todavía nadie eligió carpeta".
  d.config.resguardo ??= null;

  // Una base anterior a esto nunca dio permiso para salir a la red. Apagado.
  d.config.enRed ??= false;

  // La balanza, los permisos de los empleados y el bloqueo llegaron después.
  // Los permisos arrancan apagados: lo que antes podía cualquiera ahora lo
  // habilita el dueño, que es quien pidió poder decidirlo.
  d.config.balanza ??= balanzaInicial();
  d.config.empleados ??= { descuentos: false, anularVentas: false };
  d.config.bloqueoMinutos ??= 10;

  // Y una anterior a que hubiera usuarios arranca sin ninguno, que es
  // exactamente lo que corresponde: el negocio que ya la venía usando sigue
  // entrando sin contraseña hasta que decida crear el primero.
  d.proveedores ??= [];
  d.compras ??= [];
  d.vencimientos ??= [];
  d.recuentos ??= [];
  d.usuarios ??= [];
  d.sesiones ??= [];

  // Los gastos viejos traen el proveedor escrito a mano y ninguno apunta a un
  // proveedor de verdad. Queda en null: son gastos, no pagos a una cuenta.
  for (const g of d.gastos) g.proveedorId ??= null;

  // Y todo lo que pasó antes de que hubiera usuarios no tiene a quién
  // atribuirse. Queda explícito en null para que las pantallas no tengan que
  // preguntarse si el campo está o si es que no se sabe: no se sabe.
  for (const m of d.movimientos) {
    m.usuarioId ??= null;
    m.usuario ??= null;
  }
  for (const p of d.pedidos) {
    p.usuarioId ??= null;
    p.usuario ??= null;
    // Antes no existían los descuentos: nada de lo cargado tiene uno.
    p.descuento ??= 0;
  }
  for (const c of d.cambiosPrecio) {
    c.usuarioId ??= null;
    c.usuario ??= null;
  }
  for (const c of d.cajas) {
    c.abrioId ??= null;
    c.abrio ??= null;
    c.cerroId ??= null;
    c.cerro ??= null;
  }

  // Antes no existía la venta por peso: todo lo cargado hasta ahora es por
  // unidad. Se escribe explícito en vez de dejarlo indefinido, para que el
  // resto del programa no tenga que preguntarse si el campo está.
  for (const p of d.productos) {
    p.porPeso ??= false;
    // Antes los productos no sabían a quién se le compraban.
    p.proveedorId ??= null;
  }
  for (const pedido of d.pedidos) {
    for (const item of pedido.items) item.porPeso ??= false;
  }

  return d;
}

/**
 * El formato más común en las balanzas de mostrador: "20", cinco dígitos de
 * PLU y cinco de importe. Prendida: solo se usa con códigos que empiezan con
 * el prefijo y que no están cargados como producto, así que no molesta a
 * quien no tiene balanza.
 */
export function balanzaInicial(): ConfigBalanza {
  return { activa: true, prefijo: "20", digitosPlu: 5, contenido: "importe" };
}

/** Una base vacía, con una categoría para poder cargar el primer producto. */
export function inicial(): BaseDatos {
  const ahora = new Date().toISOString();

  return {
    version: 1,
    config: {
      negocio: "Mi negocio",
      detalle: null,
      resguardo: null,
      enRed: false,
      balanza: balanzaInicial(),
      empleados: { descuentos: false, anularVentas: false },
      bloqueoMinutos: 10,
      creadaEn: ahora,
    },
    categorias: [{ id: nuevoId(), nombre: "General", color: "#98989D", creadaEn: ahora }],
    productos: [],
    movimientos: [],
    cambiosPrecio: [],
    pedidos: [],
    clientes: [],
    gastos: [],
    cajas: [],
    cobrosFiado: [],
    proveedores: [],
    compras: [],
    vencimientos: [],
    recuentos: [],
    usuarios: [],
    sesiones: [],
    contadores: { pedido: 0, caja: 0 },
  };
}
