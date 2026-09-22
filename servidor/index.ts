import path from "node:path";
import { fileURLToPath } from "node:url";

import { carpetaDeDatos, iniciarServidor, OtraCopiaAbierta } from "./aplicacion.ts";
import { direccionesDeRed } from "./red.ts";

// =====================================================================
// El servidor solo, sin ventana.
//
// La aplicación de verdad es `electron/main.js`, que arranca este mismo
// servidor adentro de su proceso. Esto queda para desarrollar la API a mano
// —`npm run servidor`— y para probarla desde un navegador:
//
//   node servidor/index.ts [--datos <carpeta>] [--puerto <n>]
// =====================================================================

const args = process.argv.slice(2);
const valor = (nombre: string): string | undefined => {
  const i = args.indexOf(nombre);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};

const aca = path.dirname(fileURLToPath(import.meta.url));
const puerto = Number(valor("--puerto"));

try {
  const servidor = await iniciarServidor({
    carpeta: carpetaDeDatos(valor("--datos") ?? process.env.VISUALAPP_DATOS),
    sitio: path.join(aca, "..", "out"),
    puerto: Number.isInteger(puerto) && puerto > 0 ? puerto : undefined,
  });

  console.log("");
  console.log("  Visual Solution (servidor solo)");
  console.log(`  Abierto en   http://localhost:${servidor.puerto}`);
  if (servidor.almacen.leer((d) => d.config.enRed)) {
    for (const ip of direccionesDeRed()) {
      console.log(`  Desde el local  http://${ip}:${servidor.puerto}`);
    }
  }
  console.log(`  Datos en     ${servidor.almacen.archivo}`);
  console.log("");
  console.log("  Ctrl+C para apagarlo.");
  console.log("");
} catch (error) {
  if (error instanceof OtraCopiaAbierta) {
    console.error(`  ${error.message} Cerrala antes de abrir otra.`);
  } else {
    console.error("  No se pudo abrir el servidor:", (error as Error).message);
  }
  process.exit(1);
}
