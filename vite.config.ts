import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { basename, isAbsolute, relative, resolve } from "node:path";

const privateRoots = new Set(["artifacts", "files", "server", "database", "scripts", ".git", ".vercel", ".supabase", ".codex", ".agents", ".aws"]);

export default defineConfig({
  plugins: [{
    name: "private-workspace-boundary",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          if (!req.url?.startsWith("/")) throw new Error("Invalid asset path");
          const path = decodeURIComponent(new URL(`http://vite.local${req.url}`).pathname).replaceAll("\\", "/");
          if (path.includes("\0")) throw new Error("Invalid asset path");
          const fsPath = path.toLowerCase().startsWith("/@fs/") ? path.slice(5).replace(/^\/([A-Za-z]:\/)/, "$1") : undefined;
          const file = fsPath === undefined ? resolve(server.config.root, `.${path}`) : resolve(fsPath);
          const local = relative(server.config.root, file); const first = local.split(/[\\/]/)[0].toLowerCase(); const name = basename(file).toLowerCase();
          if (isAbsolute(local) || local === ".." || local.startsWith("../") || local.startsWith("..\\") || privateRoots.has(first) || name.startsWith(".env") || /\.(env|pem|crt)$/.test(name)) throw new Error("Private workspace asset");
          next();
        } catch {
          res.statusCode = 403; res.setHeader("Content-Type", "text/plain"); res.setHeader("Cache-Control", "no-store"); res.end("Private workspace files are not public assets.");
        }
      });
    }
  }, react(), tailwindcss()],
  server: {
    port: 5173,
    watch: { ignored: [resolve("artifacts").replaceAll("\\", "/") + "/**", resolve("files").replaceAll("\\", "/") + "/**"] },
    fs: {
      deny: [".env", ".env.*", "**/*.env", "*.{crt,pem}", "**/.git/**", "**/.vercel/**", "**/.supabase/**", "**/.codex/**", "**/.agents/**", "**/.aws/**", resolve("artifacts").replaceAll("\\", "/") + "/**", resolve("files").replaceAll("\\", "/") + "/**", "**/server/**", "**/database/**", "**/scripts/**"]
    },
    proxy: {
      "/api": {
        target: "http://localhost:4174",
        changeOrigin: true
      }
    }
  }
});
