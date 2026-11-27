/* 420 FRIENDLY — the in-store soundtrack.
 *
 * A small player pinned to the bottom of every page that keeps playing while a
 * customer browses. Mounted from renderChrome(), so it appears on all pages
 * without any page having to know about it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS PLAYS OUR OWN FILES AND NOT SPOTIFY
 *
 * A Spotify, Apple or YouTube embed lives in an iframe, and an iframe is
 * destroyed the moment the browser leaves the page. On a site made of separate
 * HTML pages, the music would stop dead on every single click. There is no
 * setting or trick that changes this — it is how browsers work, and it is why
 * sites with continuous music either use their own audio files or are built as
 * a single page that never actually navigates.
 *
 * So the streaming embeds stay where they make sense — playlist.html, where a
 * visitor sits and listens — and the shop soundtrack plays audio Otis uploads
 * through the Owner Portal. Those are ordinary files we serve, so we can pick
 * playback back up where it left off.
 *
 * HOW "KEEPS PLAYING" ACTUALLY WORKS
 *
 * It cannot be one continuous sound: each page is a fresh document with a
 * fresh <audio> element. What happens instead is that the track and the exact
 * playback position are written to localStorage as the customer listens, and
 * the next page reads them back and resumes from that second. The gap is the
 * page load itself — usually a blink, and much less than the silence of
 * starting over.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * TWO RULES THIS FILE WILL NOT BREAK
 *
 * 1. A first-time visitor never hears anything they did not ask for. Music
 *    starts only after someone presses play. Autoplaying sound at a stranger
 *    is the single fastest way to make them close the tab, and every browser
 *    blocks it anyway.
 * 2. If nothing has been uploaded, this renders nothing at all — no empty bar,
 *    no broken controls, no console noise.
 */

const SOUND_KEY = "420f:sound:v1";
const SOUND_FEED = "/.netlify/functions/media-public";

/* Playback state survives navigation in localStorage. Kept deliberately small:
 * which track, how far in, whether it was playing, and how loud. */
function soundState() {
  try {
    const raw = JSON.parse(localStorage.getItem(SOUND_KEY) || "{}");
    return {
      id: typeof raw.id === "string" ? raw.id : null,
      time: Number.isFinite(raw.time) && raw.time >= 0 ? raw.time : 0,
      playing: raw.playing === true,
      volume: Number.isFinite(raw.volume) ? Math.min(1, Math.max(0, raw.volume)) : 0.7,
      dismissed: raw.dismissed === true
    };
  } catch (e) {
    // Private browsing, or storage disabled. The player still works, it just
    // cannot carry position across pages — so degrade instead of throwing.
    return { id: null, time: 0, playing: false, volume: 0.7, dismissed: false };
  }
}

function saveSound(patch) {
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(Object.assign(soundState(), patch)));
  } catch (e) {
    /* nothing we can do, and nothing worth breaking the page over */
  }
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

async function mountSoundtrack() {
  if (document.getElementById("soundbar")) return;      // already mounted
  if (document.body.dataset.noSoundtrack === "1") return; // opted out by a page

  let tracks = [];
  try {
    const res = await fetch(SOUND_FEED, { headers: { Accept: "application/json" } });
    if (!res.ok) return;                                 // functions not running
    const data = await res.json();
    tracks = (data.items || []).filter((i) => i && i.kind === "audio" && i.id && i.src);
  } catch (e) {
    return; // offline, or served as plain files with no backend — stay silent
  }
  if (!tracks.length) return;

  const saved = soundState();
  if (saved.dismissed) return;

  let index = Math.max(0, tracks.findIndex((t) => t.id === saved.id));
  let seeking = false;

  /* ---- markup ---------------------------------------------------------- */
  const bar = document.createElement("div");
  bar.id = "soundbar";
  bar.className = "soundbar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Store soundtrack");
  bar.innerHTML =
    '<button class="sb-play" id="sb-play" aria-label="Play">' +
      '<span class="sb-ico" id="sb-ico" aria-hidden="true"></span>' +
    "</button>" +
    '<div class="sb-mid">' +
      '<div class="sb-top">' +
        '<span class="sb-eyebrow">NOW PLAYING</span>' +
        '<span class="sb-title" id="sb-title"></span>' +
      "</div>" +
      '<div class="sb-scrub">' +
        '<input id="sb-seek" class="sb-seek" type="range" min="0" max="1000" value="0" ' +
               'aria-label="Seek within track">' +
        '<span class="sb-time" id="sb-time">0:00</span>' +
      "</div>" +
    "</div>" +
    '<button class="sb-skip" id="sb-next" aria-label="Next track">NEXT</button>' +
    '<button class="sb-close" id="sb-close" aria-label="Close the soundtrack player">&times;</button>';

  const audio = new Audio();
  audio.preload = "metadata";
  audio.volume = saved.volume;

  document.body.appendChild(bar);
  document.body.classList.add("has-soundbar");

  const $sb = (id) => document.getElementById(id);
  const playBtn = $sb("sb-play"), ico = $sb("sb-ico"), titleEl = $sb("sb-title");
  const seek = $sb("sb-seek"), timeEl = $sb("sb-time");

  function paint() {
    const on = !audio.paused;
    ico.className = "sb-ico " + (on ? "is-pause" : "is-play");
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
    bar.classList.toggle("is-playing", on);
  }

  function load(i, { auto = false, at = 0 } = {}) {
    index = (i + tracks.length) % tracks.length;
    const t = tracks[index];
    audio.src = t.src;
    titleEl.textContent = t.label;
    if (at > 0) {
      // currentTime cannot be set before the browser knows the duration.
      audio.addEventListener("loadedmetadata", () => { audio.currentTime = at; }, { once: true });
    }
    saveSound({ id: t.id, time: at });
    if (auto) start();
    paint();
  }

  function start() {
    const p = audio.play();
    if (p && p.catch) {
      p.then(() => saveSound({ playing: true })).catch(() => {
        // The browser refused to start audio without a fresh tap on this page.
        // That is correct behaviour, not a bug — show the bar paused and let
        // the customer decide, rather than nagging or retrying in a loop.
        saveSound({ playing: false });
        bar.classList.add("needs-tap");
        paint();
      });
    }
    paint();
  }

  /* ---- controls -------------------------------------------------------- */
  playBtn.addEventListener("click", () => {
    bar.classList.remove("needs-tap");
    if (audio.paused) start();
    else { audio.pause(); saveSound({ playing: false }); paint(); }
  });

  $sb("sb-next").addEventListener("click", () => load(index + 1, { auto: true }));

  $sb("sb-close").addEventListener("click", () => {
    audio.pause();
    saveSound({ playing: false, dismissed: true });
    bar.remove();
    document.body.classList.remove("has-soundbar");
  });

  seek.addEventListener("input", () => { seeking = true; });
  seek.addEventListener("change", () => {
    if (Number.isFinite(audio.duration)) {
      audio.currentTime = (seek.value / 1000) * audio.duration;
    }
    seeking = false;
  });

  audio.addEventListener("timeupdate", () => {
    if (!seeking && Number.isFinite(audio.duration) && audio.duration > 0) {
      seek.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
      bar.style.setProperty("--progress", (audio.currentTime / audio.duration) * 100 + "%");
    }
    timeEl.textContent = fmtTime(audio.currentTime);
    saveSound({ time: audio.currentTime });
  });

  audio.addEventListener("ended", () => load(index + 1, { auto: true }));
  audio.addEventListener("play", paint);
  audio.addEventListener("pause", paint);

  // The last word on position before the page goes away. `pagehide` fires in
  // cases `beforeunload` does not, notably when iOS Safari backgrounds the tab.
  window.addEventListener("pagehide", () => {
    saveSound({ time: audio.currentTime, playing: !audio.paused });
  });

  /* ---- restore --------------------------------------------------------- */
  // Rule 1: only resume if this customer had it playing. A fresh visitor gets
  // a silent bar with a play button and nothing else.
  load(index, { auto: saved.playing, at: saved.id === tracks[index].id ? saved.time : 0 });
}
