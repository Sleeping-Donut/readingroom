import { query } from "@solidjs/router";

import type { HistoryResponse } from "../types";

import { api } from "./client";

export const getHistory = query(async () => api.get<HistoryResponse>("/history"), "history");
