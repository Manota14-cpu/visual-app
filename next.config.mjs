/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // La interfaz se compila a archivos estáticos y viaja adentro del .exe. No
  // hay servidor de Next en producción: quien atiende los pedidos es el
  // servidor que corre adentro de Visual App (servidor/aplicacion.ts),
  // que además sirve estos archivos.
  output: "export",

  // Sin servidor de Next tampoco hay optimizador de imágenes.
  images: { unoptimized: true },

  // `next dev` escribe por su cuenta un AGENTS.md y un CLAUDE.md en la raíz del
  // proyecto en cada arranque. No son parte del programa.
  agentRules: false,

  // Cada ruta se escribe como `productos.html` en vez de `productos/index.html`:
  // es lo que espera el servidor al resolver una dirección sin extensión.
  trailingSlash: false,
};

export default nextConfig;
