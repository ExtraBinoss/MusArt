import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { fiberTimerCompatibility } from "./scripts/vite/fiber-timer.ts";
const fiberThreeAdapter = fileURLToPath(
  new URL("./apps/web/src/canvas/render/fiber-three.ts", import.meta.url),
);
export default defineConfig({
  root: "apps/web",
  plugins: [fiberTimerCompatibility(fiberThreeAdapter), react(), tailwindcss()],
  optimizeDeps: { rolldownOptions: { plugins: [fiberTimerCompatibility(fiberThreeAdapter)] } },
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  build: { outDir: "../../dist", emptyOutDir: true, sourcemap: true, chunkSizeWarningLimit: 1000 },
  preview: { port: 6100, strictPort: true },
  server: { port: 6100, strictPort: true, fs: { allow: ["../.."] } },
});
