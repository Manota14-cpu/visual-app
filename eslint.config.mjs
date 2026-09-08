import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "dist/**",
    "next-env.d.ts",
    // El servidor y las herramientas son Node puro, no React: esta
    // configuración es la de Next y sus reglas con tipos no los alcanzan —
    // marcaba como sin usar cada import que solo aparece en una anotación.
    // Los revisa `npm run typecheck`, que corre con noUnusedLocals y todo lo
    // demás en estricto.
    "servidor/**",
    "herramientas/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);
