import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ mode }) => {
  // Make .env vars (PNL_INBOX_DIR, PNL_DATA_DIR) visible to server functions in
  // dev. Vite only exposes VITE_-prefixed vars by default; the "" prefix loads
  // every key. Nitro already loads .env for `preview` / the built server.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    server: { host: "::", port: 8080 },
    css: { transformer: "lightningcss" },
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    plugins: [
      tailwindcss(),
      // `@` path alias comes from tsconfig.json ("paths": { "@/*": ["./src/*"] })
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // keep server-only modules out of the client bundle
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        // build the SSR server from src/server.ts (our error-page wrapper)
        server: { entry: "server" },
      }),
      nitro(),
      viteReact(),
    ],
  };
});
