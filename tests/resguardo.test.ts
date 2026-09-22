import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Almacen, Regla } from "../servidor/almacen.ts";
import { rutasSistema } from "../servidor/api/sistema.ts";
import { Ruteador } from "../servidor/http.ts";

/**
 * La copia fuera de la computadora.
 *
 * Es lo único que separa al negocio de perder todo el día que el disco no
 * arranca: las otras copias viven al lado del archivo y se van con él. Y es una
 * función que nadie mira funcionar —corre sola al abrir— así que si se rompe en
 * silencio, nadie se entera hasta que es tarde.
 *
 * Por eso las pruebas se ensañan con lo que sale mal: el pendrive desenchufado,
 * la carpeta que no deja escribir, la que se llena.
 */

let carpeta: string;
let destino: string;
let a: Almacen;

/** Las copias que quedaron en el destino, de la más vieja a la más nueva. */
function enDestino(raiz = destino): string[] {
  const dentro = path.join(raiz, "Visual App", "copias");
  if (!fs.existsSync(dentro)) return [];
  return fs
    .readdirSync(dentro)
    .filter((n) => n.startsWith("datos-") && n.endsWith(".json"))
    .sort();
}

beforeEach(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-resguardo-"));
  destino = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-pendrive-"));
  a = new Almacen(path.join(carpeta, "datos.json"));
});

afterEach(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
  fs.rmSync(destino, { recursive: true, force: true });
});

describe("probar el destino antes de aceptarlo", () => {
  it("una carpeta que anda no da problema", () => {
    expect(a.probarDestino(destino)).toBeNull();
  });

  it("no deja el archivo de prueba tirado", () => {
    a.probarDestino(destino);

    const dentro = path.join(destino, "Visual App", "copias");
    expect(fs.readdirSync(dentro)).toEqual([]);
  });

  it("avisa que no encuentra la carpeta, y lo dice en castellano", () => {
    // Un archivo donde tendría que ir la carpeta: el sistema no puede crear
    // una carpeta ahí. Es la forma reproducible de provocar el mismo error que
    // un pendrive desenchufado.
    const tapado = path.join(destino, "tapado");
    fs.writeFileSync(tapado, "no soy una carpeta");

    const problema = a.probarDestino(tapado);
    expect(problema).toBeTruthy();
    // Nada de "ENOTDIR: not a directory".
    expect(problema).not.toMatch(/^E[A-Z]+:/);
  });
});

describe("guardar la copia", () => {
  it("deja el archivo en el destino", () => {
    const escrito = a.resguardar(destino);

    expect(escrito).toBeTruthy();
    expect(fs.existsSync(escrito!)).toBe(true);
    expect(enDestino()).toHaveLength(1);
  });

  it("la copia tiene los datos de verdad, no un archivo vacío", () => {
    a.escribir((d) => {
      d.config.negocio = "Panadería del Centro";
    });

    const escrito = a.resguardar(destino)!;
    const leido = JSON.parse(fs.readFileSync(escrito, "utf8")) as {
      config: { negocio: string };
    };

    expect(leido.config.negocio).toBe("Panadería del Centro");
  });

  it("no la repite si ya hay una de hoy", () => {
    expect(a.resguardar(destino)).toBeTruthy();
    expect(a.resguardar(destino)).toBeNull();
    expect(enDestino()).toHaveLength(1);
  });

  it("pero la hace igual si se pide a mano", () => {
    a.resguardar(destino);
    expect(a.resguardar(destino, true)).toBeTruthy();
    expect(enDestino()).toHaveLength(2);
  });

  it("no deja el temporal dando vueltas", () => {
    a.resguardar(destino);

    const dentro = path.join(destino, "Visual App", "copias");
    expect(fs.readdirSync(dentro).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("va en su propia subcarpeta y no ensucia la raíz del pendrive", () => {
    a.resguardar(destino);
    expect(fs.readdirSync(destino)).toEqual(["Visual App"]);
  });
});

describe("cuando el destino no está", () => {
  it("lanza un error que se entiende, no el del sistema", () => {
    const tapado = path.join(destino, "tapado");
    fs.writeFileSync(tapado, "no soy una carpeta");

    // Es una Regla, así que la API la devuelve como 400 con el texto a la
    // vista en vez de un 500 y "algo falló".
    expect(() => a.resguardar(tapado)).toThrow(Regla);
    expect(() => a.resguardar(tapado)).not.toThrow(/^E[A-Z]+:/);
  });

  it("el estado lo reporta en vez de romperse", () => {
    const tapado = path.join(destino, "tapado");
    fs.writeFileSync(tapado, "no soy una carpeta");

    const estado = a.estadoResguardo(tapado);
    expect(estado.ultima).toBeNull();
    expect(estado.copias).toBe(0);
  });

  it("una carpeta elegida y todavía sin copias no es un error", () => {
    // Recién configurada: no hay nada guardado, pero nada anda mal tampoco.
    const estado = a.estadoResguardo(destino);
    expect(estado.error).toBeNull();
    expect(estado.copias).toBe(0);
  });

  /**
   * El pendrive que se sacan, que es el caso de todos los días.
   *
   * Es distinto de "recién configurada y todavía sin copias", y confundirlos es
   * lo peor que puede hacer esto: la pantalla diría "todavía no hay copias" con
   * cara de que está por haberlas, cuando en realidad hace semanas que no se
   * guarda nada.
   */
  it("la carpeta que ya no está es una falla, no un 'todavía nada'", () => {
    a.resguardar(destino);
    expect(a.estadoResguardo(destino).error).toBeNull();

    // Se lo llevaron.
    fs.rmSync(destino, { recursive: true });

    const estado = a.estadoResguardo(destino);
    expect(estado.error).toBeTruthy();
    expect(estado.error).toMatch(/pendrive/i);
  });

  /**
   * Y sobre todo: no inventarla.
   *
   * `mkdir` recursivo crea toda la rama sin chistar. Con el pendrive afuera,
   * eso escribía la copia en una carpeta nueva del disco de adentro —el mismo
   * disco del que esto protege— y contestaba que había salido bien.
   */
  it("no crea la carpeta que no está: la copia no puede caer en el disco de adentro", () => {
    a.resguardar(destino);
    fs.rmSync(destino, { recursive: true });

    expect(() => a.resguardar(destino, true)).toThrow(Regla);
    expect(fs.existsSync(destino)).toBe(false);
  });

  it("tampoco la inventa al elegirla", () => {
    const inexistente = path.join(destino, "que-no-existe");

    expect(a.probarDestino(inexistente)).toBeTruthy();
    expect(fs.existsSync(inexistente)).toBe(false);
  });
});

describe("el estado que ve la pantalla", () => {
  it("cuenta las copias y nombra la más nueva", () => {
    a.resguardar(destino);
    a.resguardar(destino, true);

    const estado = a.estadoResguardo(destino);
    expect(estado.copias).toBe(2);
    expect(estado.ultima).toBe(enDestino().at(-1));
    expect(estado.error).toBeNull();
  });

  it("se lee de la carpeta, así que borrar las copias se nota", () => {
    a.resguardar(destino);
    expect(a.estadoResguardo(destino).copias).toBe(1);

    // Alguien vacía el pendrive. El estado tiene que decir la verdad, no
    // repetir que el martes se copió.
    fs.rmSync(path.join(destino, "Visual App", "copias"), { recursive: true });
    expect(a.estadoResguardo(destino).copias).toBe(0);
  });
});

describe("no llenar el pendrive", () => {
  it("conserva las últimas veinte y borra el resto", () => {
    const dentro = path.join(destino, "Visual App", "copias");
    fs.mkdirSync(dentro, { recursive: true });

    // Veinticinco copias viejas, de días distintos.
    for (let dia = 1; dia <= 25; dia++) {
      const nombre = `datos-2025-03-${String(dia).padStart(2, "0")}-120000.json`;
      fs.writeFileSync(path.join(dentro, nombre), "{}");
    }

    a.resguardar(destino);

    const quedaron = enDestino();
    expect(quedaron).toHaveLength(20);
    // Se fueron las más viejas, no las más nuevas.
    expect(quedaron[0]).toBe("datos-2025-03-07-120000.json");
    expect(quedaron.at(-1)).toMatch(/^datos-20\d\d-/);
  });
});

/**
 * El día malo, de punta a punta.
 *
 * Una copia de seguridad de la que no se puede volver no es una copia de
 * seguridad. Y el caso real no es "quiero deshacer lo de esta mañana": es la
 * computadora que no arranca, una máquina nueva, y un pendrive.
 */
describe("volver desde el pendrive", () => {
  it("recupera el negocio en una computadora nueva", () => {
    // La computadora vieja, con el negocio cargado.
    a.escribir((d) => {
      d.config.negocio = "Panadería del Centro";
      d.clientes.push({
        id: "c1",
        nombre: "Doña Rosa",
        telefono: null,
        email: null,
        ciudad: null,
        direccion: null,
        dniCuit: null,
        razonSocial: null,
        notas: null,
        activo: true,
        creadoEn: new Date().toISOString(),
      });
    });
    a.resguardar(destino);

    // Se murió el disco. Máquina nueva, Visual App recién instalado: base
    // vacía, y el pendrive es lo único que sobrevivió.
    const nueva = fs.mkdtempSync(path.join(os.tmpdir(), "visualapp-nueva-"));
    const b = new Almacen(path.join(nueva, "datos.json"));
    expect(b.leer((d) => d.clientes)).toHaveLength(0);

    try {
      // Se elige la carpeta donde estaba la copia y se vuelve a ella.
      const cual = b.listarCopiasDe(destino)[0]!;
      b.restaurar(cual, destino);

      expect(b.leer((d) => d.config.negocio)).toBe("Panadería del Centro");
      expect(b.leer((d) => d.clientes[0]?.nombre)).toBe("Doña Rosa");
    } finally {
      fs.rmSync(nueva, { recursive: true, force: true });
    }
  });

  it("no acepta un nombre que se escape de la carpeta", () => {
    a.resguardar(destino);
    expect(() => a.restaurar("../../../datos.json", destino)).toThrow(Regla);
  });

  it("una copia rota no pisa lo que hay", () => {
    a.escribir((d) => {
      d.config.negocio = "Lo que estaba";
    });
    a.resguardar(destino);

    // Alguien abrió el archivo del pendrive y lo dejó cortado.
    const dentro = path.join(destino, "Visual App", "copias");
    const cual = fs.readdirSync(dentro)[0]!;
    fs.writeFileSync(path.join(dentro, cual), '{"productos": [', "utf8");

    expect(() => a.restaurar(cual, destino)).toThrow(Regla);
    // Y la base quedó como estaba.
    expect(a.leer((d) => d.config.negocio)).toBe("Lo que estaba");
  });
});

describe("desde la API", () => {
  let r: Ruteador;

  beforeEach(() => {
    r = new Ruteador();
    rutasSistema(r, a);
  });

  async function put(camino: string, cuerpo: Record<string, unknown>) {
    const { resultado } = await r.resolver("PUT", camino, new URLSearchParams(), cuerpo);
    return resultado as Record<string, unknown>;
  }

  async function get(camino: string) {
    const { resultado } = await r.resolver("GET", camino, new URLSearchParams(), {});
    return resultado as Record<string, unknown>;
  }

  it("elegir la carpeta la guarda y hace la primera copia en el momento", async () => {
    const puesto = await put("/sistema/resguardo", { carpeta: destino });

    expect(puesto.resguardo).toBe(destino);
    // Quien la configura tiene que VER el archivo aparecer, no confiar en que
    // mañana pase.
    expect(puesto.copia).toBeTruthy();
    expect(enDestino()).toHaveLength(1);
  });

  it("no guarda una carpeta que no sirve", async () => {
    const tapado = path.join(destino, "tapado");
    fs.writeFileSync(tapado, "no soy una carpeta");

    await expect(put("/sistema/resguardo", { carpeta: tapado })).rejects.toThrow();
    // Y no quedó configurada a medias.
    expect(a.leer((d) => d.config.resguardo)).toBeNull();
  });

  it("vaciar la carpeta la desconfigura", async () => {
    await put("/sistema/resguardo", { carpeta: destino });
    await put("/sistema/resguardo", { carpeta: "" });

    expect(a.leer((d) => d.config.resguardo)).toBeNull();
  });

  it("el estado viaja en /sistema, con los días desde la última", async () => {
    await put("/sistema/resguardo", { carpeta: destino });

    const sistema = await get("/sistema");
    const estado = sistema.resguardo as {
      carpeta: string;
      dias: number;
      copias: number;
      error: string | null;
    };

    expect(estado.carpeta).toBe(destino);
    expect(estado.dias).toBe(0); // se acaba de hacer
    expect(estado.copias).toBe(1);
    expect(estado.error).toBeNull();
  });

  it("cuenta bien los días de una copia vieja", async () => {
    await put("/sistema/resguardo", { carpeta: destino });

    // Se reemplaza la copia por una de hace cuatro días.
    const dentro = path.join(destino, "Visual App", "copias");
    for (const n of fs.readdirSync(dentro)) fs.unlinkSync(path.join(dentro, n));

    const hace4 = new Date();
    hace4.setDate(hace4.getDate() - 4);
    const dos = (n: number) => String(n).padStart(2, "0");
    const sello = `${hace4.getFullYear()}-${dos(hace4.getMonth() + 1)}-${dos(hace4.getDate())}`;
    fs.writeFileSync(path.join(dentro, `datos-${sello}-120000.json`), "{}");

    const sistema = await get("/sistema");
    expect((sistema.resguardo as { dias: number }).dias).toBe(4);
  });

  it("sin carpeta elegida, el estado lo dice sin inventar un error", async () => {
    const sistema = await get("/sistema");
    const estado = sistema.resguardo as { carpeta: null; dias: null; error: null };

    expect(estado.carpeta).toBeNull();
    expect(estado.dias).toBeNull();
    expect(estado.error).toBeNull();
  });
});
