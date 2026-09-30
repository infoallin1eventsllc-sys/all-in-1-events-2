// Before / after, room by room: two panes pinned side by side while the page
// scrolls through the rooms. The "before" pane changes first and the "after"
// pane follows a beat later (the offset timing that makes the pair feel alive).
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

export function setupCompare(section) {
  const track = section.querySelector(".compare-track");
  const panes = [...section.querySelectorAll(".pane")];
  const rooms = [...section.querySelectorAll(".compare-room")];
  const dots = [...section.querySelectorAll(".compare-dots button")];
  const n = rooms.length;
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const draw = () => {
    const r = track.getBoundingClientRect();
    const p = clamp01(-r.top / Math.max(1, track.offsetHeight - innerHeight)) * (n - 1);
    panes.forEach((pane, side) => {
      const q = p - (side ? 0.16 : 0);   // the after pane lags
      [...pane.querySelectorAll("img")].forEach((img, i) => {
        const k = 1 - clamp01(Math.abs(q - i) / 1.0);
        const a = smooth(0, 1, k);
        img.style.opacity = a.toFixed(3);
        img.style.transform = still.matches ? "none" : `translateY(${((i - q) * 22).toFixed(1)}px) scale(${(1.04 - a * 0.04).toFixed(4)})`;
        img.style.visibility = a > 0.001 ? "visible" : "hidden";
      });
    });
    const i = Math.round(p);
    rooms.forEach((el, j) => { const a = smooth(0, 1, 1 - clamp01(Math.abs(p - j) / 0.6)); el.style.opacity = a.toFixed(3); el.style.transform = `translateY(${((j - p) * 14).toFixed(1)}px)`; el.style.visibility = a > 0.001 ? "visible" : "hidden"; });
    dots.forEach((d, j) => { if (j === i) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current"); });
  };
  let raf = 0;
  const kick = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", kick);
  dots.forEach((d, j) => d.addEventListener("click", () => scrollTo({ top: track.offsetTop + (j / (n - 1)) * (track.offsetHeight - innerHeight), behavior: still.matches ? "auto" : "smooth" })));
  draw();
}

// The section's markup, from a list of rooms and the pair of stills for each.
export function compareMarkup({ rooms, stills, beforeLabel, afterLabel }) {
  const pane = (side, label) => `<figure class="pane ${side}">${rooms.map((r, i) => `<img src="${stills(r.id, side)}" alt="${r.name}, ${label.toLowerCase()}" ${i ? 'loading="lazy"' : ""}>`).join("")}<figcaption>${label}</figcaption></figure>`;
  return `<div class="compare-track" style="height:${rooms.length * 100}vh"><div class="compare-stage">
    ${pane("before", beforeLabel)}${pane("after", afterLabel)}
    <div class="compare-rooms">${rooms.map((r) => `<div class="compare-room"><b>${r.name}</b><span>${r.note}</span></div>`).join("")}</div>
    <div class="compare-dots" role="group" aria-label="Rooms">${rooms.map((r) => `<button type="button" aria-label="${r.name}"></button>`).join("")}</div>
  </div></div>`;
}
