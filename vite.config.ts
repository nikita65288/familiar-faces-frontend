/// <reference types="node" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  define: {
    global: "window",
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  server: {
    proxy: {
      "/auth": "http://localhost:8080",
      "/users": "http://localhost:8080",
      "/chats": "http://localhost:8080",
      "/ws": {
        target: "http://localhost:8080",
        ws: true,
      },
    },
  },
});
