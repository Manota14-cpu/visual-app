import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Que ningún archivo del proyecto quede con los acentos rotos.
 *
 * Pasó de verdad: una herramienta de Windows leyó un archivo UTF-8 como si
 * fuera de la codificación vieja y lo volvió a escribir, con lo que cada letra
 * acentuada se convirtió en dos símbolos raros. El archivo seguía compilando,
 * los tipos seguían bien y las pruebas seguían pasando — el daño estaba en el
 * texto que lee la gente: «Poné un nombre para el negocio» dejó de decir eso.
 *
 * (El ejemplo no se escribe acá a propósito: esta prueba se busca a sí misma.)
 *
 * Se detectó tres versiones después, y ya estaba publicado. Esta prueba lo
 * agarra en el momento, que es lo único que sirve: un error que no rompe nada
 * no se encuentra mirando.
 */

const RAIZ = path.join(import.meta.dirname, "..");
const SALTAR = new Set([
  "node_modules", ".git", "dist", "out", ".next", "publicar",
  ".claude", ".agents", ".codex",
]);

/**
 * Lo escrito a propósito.
 *
 * `csv.ts` explica justamente este problema, y para explicarlo lo muestra. Es
 * la única excepción, y está acá para que se vea que es una y cuál.
 */
const A_PROPOSITO: Record<string, number> = {
  "servidor/csv.ts": 1,
};

/** La marca de un texto UTF-8 leído como si fuera de la codificación vieja. */
const SOSPECHOSO = /[ÃÂ][-¿]/g;

function archivos(dir: string, encontrados: string[] = []): string[] {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SALTAR.has(entrada.name)) continue;

    const completa = path.join(dir, entrada.name);
    if (entrada.isDirectory()) archivos(completa, encontrados);
    else if (/\.(ts|tsx|js|mjs|json|md|ps1|css|svg)$/.test(entrada.name)) encontrados.push(completa);
  }
  return encontrados;
}

describe("los acentos de los archivos", () => {
  it("no tiene ninguno roto por una lectura con la codificación equivocada", () => {
    const rotos: string[] = [];

    for (const archivo of archivos(RAIZ)) {
      const relativa = path.relative(RAIZ, archivo).split(path.sep).join("/");
      const cuantos = (fs.readFileSync(archivo, "utf8").match(SOSPECHOSO) ?? []).length;
      const permitidos = A_PROPOSITO[relativa] ?? 0;

      if (cuantos > permitidos) rotos.push(`${relativa}: ${cuantos} (se permiten ${permitidos})`);
    }

    expect(rotos, `Hay acentos rotos:\n  ${rotos.join("\n  ")}`).toEqual([]);
  });

  it("no deja la marca de orden al principio de un archivo de código", () => {
    // El mismo comando que rompió los acentos dejó además un BOM adelante. En un
    // archivo de código no hace falta y es la señal de que alguien lo reescribió
    // con una herramienta que no debía.
    const conMarca = archivos(RAIZ)
      .filter((a) => /\.(ts|tsx|js|mjs|json|css)$/.test(a))
      .filter((a) => fs.readFileSync(a)[0] === 0xef)
      .map((a) => path.relative(RAIZ, a).split(path.sep).join("/"));

    expect(conMarca).toEqual([]);
  });
});
