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
    "compilado/**",
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
    // El proceso de Electron es CommonJS a propósito: el preload corre con
    // `sandbox: true`, y ahí Electron solo acepta `require`. El principal va
    // igual para que los dos se lean de la misma manera.
    files: ["electron/**/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);
