import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@content": fileURLToPath(new URL("../src/content/articles.ts", import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: [fileURLToPath(new URL("..", import.meta.url))],
    },
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/voice": "http://127.0.0.1:3000",
      "/v1": "http://127.0.0.1:3000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
