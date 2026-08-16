import type {
  DownloadClientsResponse,
  IndexersResponse,
  NotificationsResponse,
  TestResponse,
} from "../types";

import { api } from "./client";

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
  download_dir?: string;
  rate_limit?: number;
  concurrent_downloads?: number;
  enabled?: boolean;
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

export interface LibrarySettings {
  root_folder: string;
  audiobook_folder: string;
  rename_files: boolean;
  author_folder_format: string;
  book_file_format: string;
}

function buildIndexerSettings(input: IndexerInput): string {
  return JSON.stringify({
    url: input.url.trim(),
    ...(input.api_key.trim() ? { api_key: input.api_key.trim() } : {}),
  });
}

function buildClientSettings(input: DownloadClientInput): string {
  if (input.implementation === "http") {
    const settings: Record<string, unknown> = {};
    if (input.download_dir?.trim()) settings.download_dir = input.download_dir.trim();
    if (input.rate_limit !== undefined && input.rate_limit > 0)
      settings.rate_limit = input.rate_limit;
    if (input.concurrent_downloads !== undefined && input.concurrent_downloads > 0)
      settings.concurrent_downloads = input.concurrent_downloads;
    return JSON.stringify(settings);
  }
  return JSON.stringify({
    host: input.host.trim(),
    port: input.port || 0,
    ...(input.username.trim() ? { username: input.username.trim() } : {}),
    ...(input.password ? { password: input.password } : {}),
    ...(input.url_base.trim() ? { url_base: input.url_base.trim() } : {}),
    ...(input.category.trim() ? { category: input.category.trim() } : {}),
    ...(input.download_dir?.trim() ? { download_dir: input.download_dir.trim() } : {}),
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
  return api.post<{ id: number; success: boolean }>("/settings/downloadclients", {
    name: input.name,
    implementation: input.implementation,
    settings: buildClientSettings(input),
    enabled: input.enabled ?? true,
  });
}

export function updateDownloadClient(id: number, input: DownloadClientInput) {
  return api.put(`/settings/downloadclients/${id}`, {
    name: input.name,
    implementation: input.implementation,
    settings: buildClientSettings(input),
    priority: input.priority,
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
  });
}

export function setDownloadClientEnabled(id: number, enabled: boolean) {
  return api.put(`/settings/downloadclients/${id}`, { enabled });
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

export function getLibrarySettings() {
  return api.get<{ library: LibrarySettings }>("/settings/library");
}

export function updateLibrarySettings(settings: Partial<LibrarySettings>) {
  return api.put<{ success: boolean }>("/settings/library", settings);
}

export function getIntegrationSettings() {
  return api.get<{ api_key: string }>("/settings/integration");
}
