// Branded social-card generator. Produces an on-brand Meridian SVG card from a
// headline and returns it as a base64 data URI (so it renders anywhere, incl.
// the dashboard and CSP-strict artifacts, with no external image host).
// SVG-as-image can't load web fonts, so we use a clean system sans stack.

const F = "'Helvetica Neue',Arial,sans-serif";

export function cardSvg(opts: { title: string; kicker?: string; tagline?: string }): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const kicker = opts.kicker ?? "MERIDIAN INTERFACE";
  const tagline = opts.tagline ?? "Websites · Apps · Marketing Systems";
  // Strip bracketed tags / emoji for a clean typographic card.
  const clean = String(opts.title)
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^\x20-\x7E'’.,!?&:-]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "Meridian Interface";

  // Greedy word-wrap: ~15 chars/line, max 4 lines.
  const words = clean.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > 15 && line) { lines.push(line.trim()); line = w; }
    else line = (line + " " + w).trim();
    if (lines.length === 4) break;
  }
  if (line && lines.length < 4) lines.push(line.trim());

  const startY = 470 - (lines.length - 1) * 46;
  const heads = lines.map((l, i) =>
    `<text x="80" y="${startY + i * 92}" font-family="${F}" font-size="78" font-weight="800" fill="#23262B" letter-spacing="-1">${esc(l)}</text>`
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
<defs>
<linearGradient id="mg" x1="120" y1="140" x2="1000" y2="980" gradientUnits="userSpaceOnUse"><stop stop-color="#3E4C63"/><stop offset="1" stop-color="#5B6472"/></linearGradient>
<radialGradient id="bg" cx="18%" cy="0%" r="90%"><stop offset="0" stop-color="#EEF1F6"/><stop offset="1" stop-color="#F5F4EF"/></radialGradient>
</defs>
<rect width="1080" height="1080" fill="url(#bg)"/>
<circle cx="1010" cy="1030" r="300" fill="#3E4C63" opacity="0.05"/>
<g transform="translate(80,84) scale(1.15)"><path d="M11 52V16.5C11 13.5 14.7 12.2 16.6 14.5L32 33L47.4 14.5C49.3 12.2 53 13.5 53 16.5V52H45V27L34.8 39.2C33.4 40.9 30.6 40.9 29.2 39.2L19 27V52H11Z" fill="url(#mg)"/></g>
<text x="152" y="118" font-family="${F}" font-size="26" font-weight="700" fill="#23262B" letter-spacing="0.5">Meridian Interface</text>
<text x="80" y="${startY - 78}" font-family="${F}" font-size="24" font-weight="700" fill="#4F6D8C" letter-spacing="3">${esc(kicker)}</text>
${heads}
<rect x="82" y="${startY + lines.length * 92 - 30}" width="96" height="8" rx="4" fill="#3E4C63"/>
<text x="80" y="1010" font-family="${F}" font-size="26" font-weight="700" fill="#23262B" letter-spacing="0.5">Meridian Interface</text>
<text x="80" y="1046" font-family="${F}" font-size="22" fill="#5B626C">${esc(tagline)}</text>
</svg>`;
}

export function cardDataUri(opts: { title: string; kicker?: string; tagline?: string }): string {
  const svg = cardSvg(opts);
  // Unicode-safe base64 for Deno/browsers.
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  return "data:image/svg+xml;base64," + b64;
}

// Map a content kind to a card kicker label.
export function kickerFor(kind: string): string {
  const m: Record<string, string> = {
    tip: "TIP OF THE WEEK", blog: "FROM THE BLOG", ad: "MERIDIAN INTERFACE",
    story: "MERIDIAN INTERFACE", post: "MERIDIAN INTERFACE",
  };
  return m[kind] ?? "MERIDIAN INTERFACE";
}
