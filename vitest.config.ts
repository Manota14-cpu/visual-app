import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Para que los tests importen el código real con el alias "@/".
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
