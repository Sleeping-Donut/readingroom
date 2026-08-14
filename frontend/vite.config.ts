import { defineConfig, lazyPlugins } from "vite-plus";
import solid from "@solidjs/vite-plugin";
import { fileRoutes } from "filesystem-routing/vite";

export default defineConfig({
  fmt: {
    ignorePatterns: ["src/file-routes.d.ts"],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  plugins: lazyPlugins(() => [
    solid({ start: true }),
    fileRoutes({ types: "src/file-routes.d.ts" }),
  ]),
  build: {
    target: "esnext",
  },
  server: {
    port: Number(process.env.FRONTEND_PORT) || 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5299",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
