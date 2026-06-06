// Formatters default to UTC so SSR and client render the same string.
// Pass an IANA timezone string (e.g. "Europe/London") to display in course-local time.

export function fmtTime(iso: string, tz = "UTC") {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
}

export function fmtDateLong(iso: string, tz = "UTC") {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
}

export function fmtDateShort(iso: string, tz = "UTC") {
  return new Date(iso).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
}

export function initialsFrom(name?: string | null) {
  if (!name) return "··";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
