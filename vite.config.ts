import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  root: "apps/web",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  build: { outDir: "../../dist", emptyOutDir: true, sourcemap: true, chunkSizeWarningLimit: 1000 },
  preview: { port: 6100, strictPort: true },
  server: { port: 6100, strictPort: true, fs: { allow: ["../.."] } },
});
