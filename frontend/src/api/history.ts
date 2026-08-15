import { query } from "@solidjs/router";
import { api } from "./client";
import type { HistoryResponse } from "../types";

export const getHistory = query(async () => api.get<HistoryResponse>("/history"), "history");
