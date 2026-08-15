import { query } from "@solidjs/router";
import { api } from "./client";
import type { SystemStatus, SystemStats } from "../types";

export const getSystemStatus = query(
  async () => api.get<SystemStatus>("/system/status"),
  "system-status",
);

export const getSystemStats = query(
  async () => api.get<SystemStats>("/system/stats"),
  "system-stats",
);
