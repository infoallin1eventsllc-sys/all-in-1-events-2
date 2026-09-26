// Local-time helpers. The house runs on its own timezone, not the server's.

export function localParts(tz, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "long",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hhmm: `${hour}:${get("minute")}`, weekday: get("weekday") };
}

export function minutesOf(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// True if hhmm falls in [start, end), handling windows that cross midnight.
export function inWindow(hhmm, start, end) {
  const t = minutesOf(hhmm), s = minutesOf(start), e = minutesOf(end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

export function friendlyTime(tz, date = new Date()) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(date);
}
