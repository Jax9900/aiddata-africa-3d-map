import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "./data/aiddataCompact.json": fileURLToPath(new URL("./src/data/aiddataCompact.js", import.meta.url)),
    },
  },
  server: {
    allowedHosts: true,
  },
});
