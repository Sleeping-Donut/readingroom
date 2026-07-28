import type { Component } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { api } from "../api/client";
import type { SystemStatus } from "../types";

export const Dashboard: Component = () => {
  const status = createQuery<SystemStatus>(() => ({
    queryKey: ["system-status"],
    queryFn: () => api.get("/system/status"),
  }));

  return (
    <div>
      <h2 class="text-2xl font-bold mb-4">Dashboard</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <p class="text-sm text-gray-400">Status</p>
          <p class="text-lg font-semibold">{status.data?.name ?? "Loading..."}</p>
          <p class="text-xs text-gray-500">v{status.data?.version ?? "?"}</p>
        </div>
      </div>
    </div>
  );
};
