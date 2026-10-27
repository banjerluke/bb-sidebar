import type { ThreadLimitState } from "./contract";

export function limitTime(at: number, timeZone: string | null) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  })
    .format(at)
    .replace(":00", "")
    .replace(/\s/g, "")
    .toLowerCase();
}

export function limitStatus(limit: ThreadLimitState) {
  if (!limit.scheduled) return "Limit reached";
  if (limit.scheduled.failed) return "Schedule failed";
  return `Scheduled · ${limitTime(limit.scheduled.sendAt, limit.timeZone)}`;
}

export function limitDescription(limit: ThreadLimitState) {
  const at = limit.scheduled?.sendAt ?? limit.resetsAt;
  const date =
    at === null
      ? null
      : new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          ...(limit.timeZone ? { timeZone: limit.timeZone } : {}),
        }).format(at);
  return [
    limit.message,
    date ? `${limit.scheduled ? "Continue scheduled for" : "Resets"} ${date}` : null,
    limit.timeZone,
  ]
    .filter(Boolean)
    .join(" · ");
}
