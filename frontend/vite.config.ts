import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { fileRoutes } from "filesystem-routing/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
	fmt: {
		ignorePatterns: ["src/file-routes.d.ts"],
		useTabs: true,
		tabWidth: 4,
		// Tabs are for the JS/TS side only; data formats stay at two spaces.
		overrides: [
			{
				files: ["*.json", "*.yaml", "*.yml"],
				options: { useTabs: false, tabWidth: 2 },
			},
		],
		sortTailwindcss: {
			stylesheet: "./src/index.css",
		},
		sortImports: {
			groups: [
				"type-import",
				["value-builtin", "value-external"],
				"type-internal",
				"value-internal",
				["type-parent", "type-sibling", "type-index"],
				["value-parent", "value-sibling", "value-index"],
				"unknown",
			],
		},
	},
	lint: {
		// Setting `plugins` overwrites oxlint's default set, so list every
		// default plugin plus the non-default ones we opt into.
		plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "jsx-a11y", "vitest"],
		jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
		rules: {
			"vite-plus/prefer-vite-plus-imports": "error",
			"import/no-duplicates": "error",
		},
		options: { typeAware: true, typeCheck: true },
	},
	plugins: lazyPlugins(() => [
		tailwindcss(),
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
		globals: false,
		setupFiles: ["./vitest-setup.ts"],
	},
});
