import { createSignal } from "solid-js";
import * as v from "valibot";

import type { SystemStatus, User } from "../types";

import { api, setOnUnauthorized } from "./client";

const USER_SCHEMA = v.object({
  id: v.number(),
  username: v.string(),
  role: v.string(),
});

interface LoginResponse {
  token: string;
  user: User;
}

interface RegisterResponse {
  id: number;
  username: string;
  success: boolean;
}

const [user, setUser] = createSignal<User | null>(null);
const [authEnabled, setAuthEnabled] = createSignal(false);

function loadUser() {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem("readingroom_user");
    if (stored) {
      const parsed = v.safeParse(USER_SCHEMA, JSON.parse(stored));
      if (parsed.success) setUser(parsed.output);
    }
  } catch {
    /* ignore */
  }
}

loadUser();

export async function login(username: string, password: string): Promise<User> {
  const res = await api.post<LoginResponse>("/auth/login", { username, password });
  localStorage.setItem("readingroom_token", res.token);
  localStorage.setItem("readingroom_user", JSON.stringify(res.user));
  setUser(res.user);
  return res.user;
}

export async function register(username: string, password: string): Promise<User> {
  await api.post<RegisterResponse>("/auth/register", { username, password });
  return login(username, password);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.put<{ success: boolean }>("/auth/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export function logout() {
  localStorage.removeItem("readingroom_token");
  localStorage.removeItem("readingroom_user");
  setUser(null);
}

setOnUnauthorized(() => logout());

export async function checkAuthEnabled(): Promise<boolean> {
  try {
    const status = await api.get<SystemStatus>("/system/status");
    setAuthEnabled(status.auth_enabled);
    return status.auth_enabled;
  } catch {
    return false;
  }
}

export { user, authEnabled };
