import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { CronExpressionParser } from "cron-parser";
import type { ThreadLimitState } from "./contract";

type Event = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["events"]["list"]>>[number];

function messageReset(message: string, createdAt: number) {
  const match = /resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i.exec(message);
  if (!match) return { resetsAt: null, timeZone: null };
  const [, hourText, minuteText, period, timeZone] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  if (hour < 1 || hour > 12 || minute > 59) return { resetsAt: null, timeZone: null };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(createdAt);
    const hours = (hour % 12) + (period!.toLowerCase() === "pm" ? 12 : 0);
    const resetsAt = CronExpressionParser.parse(`${minute} ${hours} * * *`, {
      currentDate: createdAt,
      tz: timeZone,
    })
      .next()
      .getTime();
    return { resetsAt, timeZone: timeZone! };
  } catch {
    return { resetsAt: null, timeZone: null };
  }
}

/** Only the latest failed turn can supply a limit, even after its unread flag clears. */
export function rateLimitDetails(events: readonly Event[]): ThreadLimitState | null {
  const rows = [...events].sort((a, b) => b.seq - a.seq);
  let failure: Extract<Event, { type: "provider/error" | "system/error" }> | undefined;
  let limits: Extract<Event, { type: "provider/rateLimits/updated" }> | undefined;
  for (const row of rows) {
    if (row.type === "turn/started") break;
    if (row.type === "turn/completed" && row.data.status !== "failed") break;
    if (row.type === "provider/rateLimits/updated" && !limits) limits = row;
    if (row.type === "provider/error" || row.type === "system/error") {
      if (row.type === "provider/error" && row.data.willRetry) continue;
      if (!failure || (failure.type === "system/error" && row.type === "provider/error")) failure = row;
    }
  }
  if (!failure) return null;
  const message = [failure.data.message, failure.type === "provider/error" ? failure.data.detail : null]
    .filter(Boolean)
    .join(": ");
  const category = failure.type === "provider/error" ? failure.data.errorInfo?.category : undefined;
  const isLimit =
    category === "rate-limit" ||
    category === "budget-exceeded" ||
    ((!category || category === "unknown" || category === "internal") &&
      /rate[_ -]?limit|(?:session|usage) limit|usage cap/i.test(message));
  if (!isLimit) return null;
  const reset = messageReset(message, failure.createdAt);
  const blocked = limits?.data.rateLimits.windows.filter((window) => window.status === "blocked") ?? [];
  if (blocked.length > 0 && blocked.every((window) => window.resetsAtMs !== null)) {
    reset.resetsAt = Math.max(...blocked.map((window) => window.resetsAtMs!));
  }
  return { message, ...reset, scheduled: null };
}
