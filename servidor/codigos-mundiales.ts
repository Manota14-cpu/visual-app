/**
 * La base mundial de códigos de barras.
 *
 * Cuando se escanea algo que no está cargado, se pregunta a las bases
 * abiertas de Open Food Facts: una para alimentos, otra para cosmética (el
 * shampoo, el jabón) y otra para el resto. Son gratis, no piden clave y
 * tienen buena parte de lo que se vende en un almacén argentino.
 *
 * Solo trae el nombre: el precio y el stock los sabe el negocio, no internet.
 * Sin conexión, o si tarda, se devuelve null y el producto se carga a mano.
 */

const BASES = [
  "https://world.openfoodfacts.org",
  "https://world.openbeautyfacts.org",
  "https://world.openproductsfacts.org",
];

const ESPERA_MS = 5000;

export interface ProductoMundial {
  nombre: string;
  marca: string | null;
  contenido: string | null;
  fuente: string;
}

export async function buscarCodigoMundial(codigo: string): Promise<ProductoMundial | null> {
  if (!/^\d{8,14}$/.test(codigo)) return null;

  // Las tres a la vez: preguntar de a una sumaba hasta quince segundos con el
  // cliente esperando en el mostrador.
  const respuestas = await Promise.all(BASES.map((base) => consultar(base, codigo)));
  return respuestas.find((r) => r !== null) ?? null;
}

async function consultar(base: string, codigo: string): Promise<ProductoMundial | null> {
  try {
    const respuesta = await fetch(
      `${base}/api/v2/product/${codigo}.json?fields=product_name,product_name_es,brands,quantity`,
      {
        // Las bases piden identificarse; es una consulta por lectura, no un robot.
        headers: { "User-Agent": "VisualApp/3.0 (comercio)" },
        signal: AbortSignal.timeout(ESPERA_MS),
      }
    );
    if (!respuesta.ok) return null;
    const cuerpo = (await respuesta.json()) as {
      status?: number;
      product?: { product_name?: string; product_name_es?: string; brands?: string; quantity?: string };
    };
    const p = cuerpo.product;
    const nombre = (p?.product_name_es || p?.product_name || "").trim();
    if (cuerpo.status !== 1 || !nombre) return null;

    const marca = p?.brands?.split(",")[0]?.trim() || null;
    const contenido = p?.quantity?.trim() || null;
    return { nombre, marca, contenido, fuente: new URL(base).hostname };
  } catch {
    return null;
  }
}

/** El nombre como se ve en la góndola: "Sedal Shampoo Ceramidas 340 ml". */
export function nombreSugerido(p: ProductoMundial): string {
  let nombre = p.nombre;
  if (p.marca && !plano(nombre).includes(plano(p.marca))) nombre = `${p.marca} ${nombre}`;
  if (p.contenido && !nombre.toLowerCase().includes(p.contenido.toLowerCase())) nombre = `${nombre} ${p.contenido}`;
  return nombre.slice(0, 160);
}

/** Sin mayúsculas ni signos: "Coca-Cola" y "Coca Cola" son la misma marca. */
function plano(texto: string): string {
  return texto.toLowerCase().replace(/[^a-z0-9]/g, "");
}
