import { api } from "./client";
import type {
  DownloadClientsResponse,
  IndexersResponse,
  NotificationsResponse,
  TestResponse,
} from "../types";

export interface IndexerInput {
  name: string;
  implementation: string;
  url: string;
  api_key: string;
  enable_rss: boolean;
  enable_search: boolean;
  priority?: number;
}

export interface DownloadClientInput {
  name: string;
  implementation: string;
  host: string;
  port: number;
  username: string;
  password: string;
  url_base: string;
  category: string;
  priority?: number;
}

export interface NotificationInput {
  name: string;
  implementation: string;
  webhook_url: string;
  on_grab: boolean;
  on_import: boolean;
  on_upgrade: boolean;
  on_health_issue: boolean;
}

function buildIndexerSettings(input: IndexerInput): string {
  return JSON.stringify({
    url: input.url.trim(),
    ...(input.api_key.trim() ? { api_key: input.api_key.trim() } : {}),
  });
}

function buildClientSettings(input: DownloadClientInput): string {
  return JSON.stringify({
    host: input.host.trim(),
    port: input.port || 0,
    ...(input.username.trim() ? { username: input.username.trim() } : {}),
    ...(input.password ? { password: input.password } : {}),
    ...(input.url_base.trim() ? { url_base: input.url_base.trim() } : {}),
    ...(input.category.trim() ? { category: input.category.trim() } : {}),
  });
}

export function listIndexers() {
  return api.get<IndexersResponse>("/settings/indexers");
}

export function addIndexer(input: IndexerInput) {
  return api.post("/settings/indexers", {
    name: input.name,
    implementation: input.implementation,
    settings: buildIndexerSettings(input),
    enable_rss: input.enable_rss,
    enable_search: input.enable_search,
  });
}

export function updateIndexer(id: number, input: IndexerInput) {
  return api.put(`/settings/indexers/${id}`, {
    ...input,
    settings: buildIndexerSettings(input),
  });
}

export function removeIndexer(id: number) {
  return api.delete(`/settings/indexers/${id}`);
}

export function testIndexer(id: number) {
  return api.post<TestResponse>(`/settings/indexers/${id}/test`);
}

export function listDownloadClients() {
  return api.get<DownloadClientsResponse>("/settings/downloadclients");
}

export function addDownloadClient(input: DownloadClientInput) {
  return api.post("/settings/downloadclients", {
    name: input.name,
    implementation: input.implementation,
    settings: buildClientSettings(input),
  });
}

export function updateDownloadClient(id: number, input: DownloadClientInput) {
  return api.put(`/settings/downloadclients/${id}`, {
    name: input.name,
    implementation: input.implementation,
    settings: buildClientSettings(input),
    priority: input.priority,
  });
}

export function removeDownloadClient(id: number) {
  return api.delete(`/settings/downloadclients/${id}`);
}

export function testDownloadClient(id: number) {
  return api.post<TestResponse>(`/settings/downloadclients/${id}/test`);
}

export function listNotifications() {
  return api.get<NotificationsResponse>("/notifications");
}

export function addNotification(input: NotificationInput) {
  return api.post("/notifications", {
    name: input.name,
    implementation: input.implementation,
    settings: JSON.stringify({ webhook_url: input.webhook_url }),
    on_grab: input.on_grab,
    on_import: input.on_import,
    on_upgrade: input.on_upgrade,
    on_health_issue: input.on_health_issue,
  });
}

export function removeNotification(id: number) {
  return api.delete(`/notifications/${id}`);
}

export function testNotification(id: number) {
  return api.post(`/notifications/${id}/test`);
}
