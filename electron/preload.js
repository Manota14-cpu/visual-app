"use strict";

// El puente entre la ventana y el programa.
//
// La página corre aislada: no tiene Node, ni `require`, ni acceso al disco.
// Lo único que ve del programa es este objeto, `window.visualSolution`, y lo
// único que puede hacer con él es preguntar por actualizaciones y pedir que se
// bajen o se instalen. Cada pedido es un mensaje que el proceso principal
// valida antes de hacer nada.
//
// Todo lo demás —datos, copias, carpetas— pasa por la API HTTP de siempre,
// que es la misma que usa el celular desde el wifi del local.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("visualSolution", {
  escritorio: true,
  actualizacion: {
    estado: () => ipcRenderer.invoke("actualizacion:estado"),
    buscar: () => ipcRenderer.invoke("actualizacion:buscar"),
    descargar: () => ipcRenderer.invoke("actualizacion:descargar"),
    instalar: () => ipcRenderer.invoke("actualizacion:instalar"),
    /** Avisa cada cambio de estado. Devuelve la función para dejar de escuchar. */
    alCambiar: (funcion) => {
      if (typeof funcion !== "function") return () => {};
      const oyente = (_evento, estado) => funcion(estado);
      ipcRenderer.on("actualizacion:cambio", oyente);
      return () => ipcRenderer.removeListener("actualizacion:cambio", oyente);
    },
  },
});
