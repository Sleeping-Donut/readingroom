import { query } from "@solidjs/router";

import type { CalendarResponse } from "../types";

import { api } from "./client";

export const getCalendar = query(async () => api.get<CalendarResponse>("/calendar"), "calendar");
