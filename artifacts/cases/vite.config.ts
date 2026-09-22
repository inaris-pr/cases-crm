import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import path from "node:path";

const PORT = Number(process.env.VITE_PORT ?? process.env.PORT ?? 5173);
const API_PORT = Number(process.env.API_PORT ?? 3001);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  server: {
    host: "0.0.0.0",
    port: PORT,
    allowedHosts: true as any,
    proxy: {
      "/api": `http://localhost:${API_PORT}`,
      "/healthz": `http://localhost:${API_PORT}`,
    },
  },
});
