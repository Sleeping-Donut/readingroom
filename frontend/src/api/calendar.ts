import { query } from "@solidjs/router";
import { api } from "./client";
import type { CalendarResponse } from "../types";

export const getCalendar = query(async () => api.get<CalendarResponse>("/calendar"), "calendar");
