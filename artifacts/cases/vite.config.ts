import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import path from "node:path";

const PORT = Number(process.env.VITE_PORT ?? process.env.PORT ?? 5173);
const API_PORT = Number(process.env.API_PORT ?? 3001);
// The dev server (and the /api proxy behind it) listens on this machine only.
// Set VITE_HOST=0.0.0.0 to expose it deliberately, e.g. in a cloud IDE.
const HOST = process.env.VITE_HOST ?? "127.0.0.1";
// The API binds to 127.0.0.1 (see API_HOST); proxy to that address directly
// rather than "localhost", which can resolve to ::1 first on macOS.
const API_TARGET = `http://127.0.0.1:${API_PORT}`;

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
    host: HOST,
    port: PORT,
    allowedHosts: true as any,
    proxy: {
      "/api": API_TARGET,
      "/healthz": API_TARGET,
    },
  },
});
