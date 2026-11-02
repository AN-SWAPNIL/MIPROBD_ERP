import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { loadEnvFile } from "node:process";

loadEnvFile(new URL("./config/prototype.env", import.meta.url));

export default defineConfig({
  envDir: false,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4174",
        changeOrigin: true
      }
    }
  }
});
