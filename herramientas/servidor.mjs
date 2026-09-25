// =====================================================================
//  Arma el servidor que va adentro del instalador.
//
//    node herramientas/servidor.mjs
//
//  Un solo archivo, minificado y sin comentarios: compilado/servidor/aplicacion.js.
//  Antes era el mismo código fuente pasado por tsc, carpeta por carpeta y con
//  cada comentario, suelto en la carpeta del programa instalado: cualquiera con
//  el instalador lo leía en el Bloc de notas. Minificado no es imposible de
//  leer, pero ya no es el código del proyecto tal cual.
//
//  Los tipos se siguen comprobando con `npm run typecheck`; esto solo arma.
// =====================================================================

import fs from "node:fs";
import { build } from "esbuild";

const salida = "compilado/servidor";

// Se borra entero: lo que haya quedado de un armado anterior —los archivos
// sueltos de tsc— entraría al instalador y volvería a dejar el código a la vista.
fs.rmSync(salida, { recursive: true, force: true });

await build({
  entryPoints: ["servidor/aplicacion.ts"],
  outfile: `${salida}/aplicacion.js`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  legalComments: "none",
  sourcemap: false,
  logLevel: "warning",
});

// Los .js de esta carpeta son módulos ES: es lo que espera el `import()` de
// electron/main.js.
fs.writeFileSync(`${salida}/package.json`, JSON.stringify({ type: "module" }));

const tamano = fs.statSync(`${salida}/aplicacion.js`).size;
console.log(`Servidor armado: ${salida}/aplicacion.js (${Math.round(tamano / 1024)} KB)`);
