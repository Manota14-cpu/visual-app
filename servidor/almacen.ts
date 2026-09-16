import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BaseDatos } from "./tipos.ts";

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
      return JSON.parse(texto) as BaseDatos;
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

    fs.renameSync(temporal, this.archivo);
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
  restaurar(nombre: string): { desde: string; respaldoPrevio: string } {
    // El nombre viene de la pantalla: se acepta un archivo de la carpeta de
    // copias y nada más. Sin esto, un "../../otra cosa" leería cualquier
    // archivo de la computadora.
    if (path.basename(nombre) !== nombre || !this.listarCopias().includes(nombre)) {
      throw new Regla("Esa copia no existe.");
    }

    const origen = path.join(this.carpetaCopias, nombre);
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
    this.datos = nueva;
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

/** Una base vacía, con una categoría para poder cargar el primer producto. */
export function inicial(): BaseDatos {
  const ahora = new Date().toISOString();

  return {
    version: 1,
    config: { negocio: "Mi negocio", detalle: null, creadaEn: ahora },
    categorias: [{ id: nuevoId(), nombre: "General", color: "#98989D", creadaEn: ahora }],
    productos: [],
    movimientos: [],
    cambiosPrecio: [],
    pedidos: [],
    clientes: [],
    gastos: [],
    cajas: [],
    contadores: { pedido: 0, caja: 0 },
  };
}
