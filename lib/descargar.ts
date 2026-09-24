/**
 * Guarda un texto como archivo, en Descargas.
 *
 * El servidor arma el contenido y el navegador lo guarda: no hace falta que el
 * programa escriba en el disco del usuario ni que le pregunte dónde. El
 * archivo cae en Descargas, como cualquier otro.
 */
export function descargarTexto(nombre: string, contenido: string, tipo = "text/csv;charset=utf-8"): void {
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // La descarga arranca después del clic, no durante: liberado en el mismo
  // momento, algunos navegadores guardaban un archivo vacío.
  setTimeout(() => URL.revokeObjectURL(enlace.href), 30_000);
}
