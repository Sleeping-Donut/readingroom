import { query } from "@solidjs/router";

import type { SystemStatus, SystemStats } from "../types";

import { api } from "./client";

export const getSystemStatus = query(
	async () => api.get<SystemStatus>("/system/status"),
	"system-status",
);

export const getSystemStats = query(
	async () => api.get<SystemStats>("/system/stats"),
	"system-stats",
);
