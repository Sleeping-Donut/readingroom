import { createRouter } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";
import { pageRoutes } from "virtual:file-routes";

// Router instance + typed path proxy. Kept in its own module so routes and
// components can import `paths` without a circular dependency on App.tsx.
export const Router = createRouter({
	routes: fileRoutes(pageRoutes),
});

export const { paths } = Router;
