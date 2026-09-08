/**
 * Leer y escribir CSV.
 *
 * Son sesenta líneas y evitan sumar una dependencia de planillas al proyecto,
 * que es lo que esta aplicación sacó a propósito. Un CSV lo abre Excel, lo abre
 * Google Sheets y lo abre el Bloc de notas — que es exactamente lo que hace
 * falta para migrar un catálogo de un lado a otro.
 */

/**
 * Convierte el texto de un archivo en filas y columnas.
 *
 * Respeta las comillas, porque un nombre de producto con coma adentro
 * —"Bandeja N°2, negra"— es lo normal, no la excepción. Dentro de comillas,
 * dos comillas seguidas son una comilla literal, que es como lo escribe Excel.
 */
export function leerCsv(texto: string, separador: string): string[][] {
  // Excel escribe un BOM al guardar como UTF-8. Si no se saca, la primera
  // columna del encabezado se llama "﻿sku" y no coincide con nada.
  const limpio = texto.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]!;

    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        celda += c;
      }
      continue;
    }

    if (c === '"') entreComillas = true;
    else if (c === separador) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else {
      celda += c;
    }
  }

  if (celda !== "" || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }

  // Las líneas en blanco del final no son filas vacías: son el Enter que quedó.
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

/**
 * Con qué separa las columnas este archivo.
 *
 * Excel en español guarda con punto y coma; casi todo lo demás, con coma. Se
 * decide contando cuál aparece más en el encabezado, que es la línea que
 * seguro no tiene texto libre adentro.
 */
export function separadorDe(texto: string): string {
  const encabezado = texto.replace(/^﻿/, "").split(/\r?\n/)[0] ?? "";
  const cuenta = (c: string) => encabezado.split(c).length - 1;

  const candidatos = [";", ",", "\t"];
  return candidatos.reduce((mejor, c) => (cuenta(c) > cuenta(mejor) ? c : mejor), ";");
}

/** Escapa una celda: comillas solo cuando hacen falta. */
function celda(valor: string | number | null, separador: string): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  if (texto.includes(separador) || texto.includes('"') || texto.includes("\n")) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/**
 * Arma el archivo.
 *
 * Va con punto y coma y con BOM: es lo que hace que Excel en español lo abra
 * en columnas y con los acentos derechos al hacerle doble clic, en vez de
 * volcar todo en la columna A y mostrar "Bandeja plÃ¡stica".
 */
export function armarCsv(filas: (string | number | null)[][], separador = ";"): string {
  const cuerpo = filas.map((f) => f.map((c) => celda(c, separador)).join(separador)).join("\r\n");
  return `﻿${cuerpo}\r\n`;
}
