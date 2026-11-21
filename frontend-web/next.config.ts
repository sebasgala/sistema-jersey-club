import type { NextConfig } from "next";

/**
 * Exportación estática (Azure Static Web Apps): la app corre 100 % en el navegador
 * y solo habla con el gateway (NEXT_PUBLIC_API_URL). No usa funciones de servidor.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
