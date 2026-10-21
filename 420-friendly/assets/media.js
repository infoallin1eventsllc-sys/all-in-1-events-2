/* 420 FRIENDLY — owner media library.
 *
 * Two halves that never both run on one page:
 *
 *   initMediaManager()   — the owner's screen (media.html): uploads, and a
 *                          slot for YouTube music videos by link
 *   renderLandingMedia() — the player visitors see (index.html)
 *   renderMusicVideos()  — the YouTube videos the owner added (playlist.html)
 *
 * WHY UPLOADS ARE SPLIT UP
 *
 * A Netlify function receives at most about 6 MB per request, so a 40 MB video
 * cannot be posted in one go. The file is sliced here, each slice is sent on
 * its own, and the function reassembles them. That also means a dropped
 * connection costs one slice instead of the whole upload, and the progress bar
 * reflects real bytes rather than guessing.
 *
 * The aim is that the owner never has to know any of that. They choose a file
 * and watch a bar fill.
 */

const MEDIA_ENDPOINT = "/.netlify/functions/media";
const MEDIA_PUBLIC_ENDPOINT = "/.netlify/functions/media-public";

/* Base64 in slices. `btoa(String.fromCharCode(...bytes))` on a multi-megabyte
 * array blows the argument limit and throws — the failure looks like a broken
 * upload rather than a broken conversion, so it is worth never hitting. */
function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const STEP = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  }
  return btoa(binary);
}

function prettyBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return Math.round((n / (1024 * 1024)) * 10) / 10 + " MB";
}

async function mediaPost(payload) {
  const res = await authedFetch(MEDIA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* fall through to the generic message below */
  }
  if (!res.ok) {
    const err = new Error(data.message || "That did not go through.");
    err.code = data.error;
    throw err;
  }
  return data;
}

/* Upload one file, reporting progress as a 0–1 fraction. */
async function uploadOne(file, onProgress) {
  const init = await mediaPost({
    action: "init",
    contentType: file.type,
    size: file.size,
    name: file.name
  });

  const chunkBytes = init.chunkBytes;
  const total = Math.ceil(file.size / chunkBytes);

  for (let i = 0; i < total; i++) {
    const slice = file.slice(i * chunkBytes, Math.min((i + 1) * chunkBytes, file.size));
    const buf = await slice.arrayBuffer();
    await mediaPost({
      action: "chunk",
      id: init.id,
      index: i,
      data: bytesToBase64(buf)
    });
    // Cap at 0.95 until finalize returns — reassembly is real work and a bar
    // that sits at 100% while nothing visibly happens reads as a hang.
    onProgress(Math.min(0.95, (i + 1) / total));
  }

  const done = await mediaPost({ action: "finalize", id: init.id, chunks: total });
  onProgress(1);
  return done.item;
}

/* ===== Owner screen ===== */

function initMediaManager(mountId) {
  const root = document.getElementById(mountId);
  root.innerHTML =
    '<div id="media-drop" class="border-2 border-dashed border-outline-variant rounded-2xl ' +
    'px-6 py-12 text-center transition-colors">' +
    '<span class="material-symbols-outlined text-tertiary text-[44px]">upload</span>' +
    '<p class="font-headline-md text-headline-md text-on-surface uppercase tracking-tighter mt-3">Add music or video</p>' +
    '<p class="font-body-md text-body-md text-on-surface-variant mt-2 max-w-md mx-auto">' +
    "Drag files here, or choose them below. Video goes onto the front page. Music also becomes " +
    "the store soundtrack — it plays along the bottom of every page while customers shop." +
    "</p>" +
    '<label class="inline-flex items-center gap-2 mt-6 rounded-full bg-primary text-on-primary py-4 px-8 ' +
    'font-label-caps text-label-caps hover:bg-inverse-surface transition-all duration-300 cursor-pointer">' +
    '<span class="material-symbols-outlined text-[18px]">add</span>CHOOSE FILES' +
    '<input id="media-input" type="file" multiple accept="audio/*,video/*" class="sr-only"/></label>' +
    '<p class="font-body-md text-[13px] text-on-surface-variant mt-4">' +
    "Music up to 20 MB · Video up to 60 MB" +
    "</p></div>" +
    '<div id="media-queue" class="mt-6 flex flex-col gap-3"></div>' +
    youtubeSlotHTML() +
    '<div id="media-list" class="mt-10"></div>';

  wireYoutubeSlot(refreshList);

  const input = document.getElementById("media-input");
  const drop = document.getElementById("media-drop");

  input.addEventListener("change", () => {
    handleFiles([...input.files]);
    // Reset so choosing the same file twice still fires a change event.
    input.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) =>
    drop.addEventListener(evt, (e) => {
      e.preventDefault();
      drop.classList.add("border-tertiary");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    drop.addEventListener(evt, (e) => {
      e.preventDefault();
      drop.classList.remove("border-tertiary");
    })
  );
  drop.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files) handleFiles([...e.dataTransfer.files]);
  });

  refreshList();

  async function handleFiles(files) {
    const queue = document.getElementById("media-queue");
    for (const file of files) {
      const row = document.createElement("div");
      row.className = "border border-outline-variant/60 rounded-xl px-4 py-3";
      const name = document.createElement("p");
      name.className = "font-body-md text-body-md text-on-surface";
      // textContent, not innerHTML: a filename is whatever the file was called.
      name.textContent = file.name;
      const status = document.createElement("p");
      status.className = "font-label-caps text-label-caps text-on-surface-variant mt-1";
      status.textContent = "PREPARING… " + prettyBytes(file.size);
      const barWrap = document.createElement("div");
      barWrap.className = "h-1.5 rounded-full bg-surface-container-highest mt-3 overflow-hidden";
      const bar = document.createElement("div");
      bar.className = "h-full bg-tertiary transition-all duration-200";
      bar.style.width = "0%";
      barWrap.appendChild(bar);
      row.append(name, status, barWrap);
      queue.appendChild(row);

      try {
        await uploadOne(file, (p) => {
          bar.style.width = Math.round(p * 100) + "%";
          status.textContent = p >= 1 ? "DONE" : "UPLOADING… " + Math.round(p * 100) + "%";
        });
        status.textContent = "ADDED TO THE SITE";
        status.className = "font-label-caps text-label-caps text-tertiary mt-1";
        setTimeout(() => row.remove(), 2500);
        await refreshList();
      } catch (err) {
        bar.classList.remove("bg-tertiary");
        bar.classList.add("bg-error");
        status.textContent = err.message || "That did not upload.";
        status.className = "font-body-md text-body-md text-error mt-1";
      }
    }
  }

  async function refreshList() {
    const mount = document.getElementById("media-list");
    let data;
    try {
      const res = await authedFetch(MEDIA_ENDPOINT, { method: "GET" });
      data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not load your media.");
    } catch (err) {
      mount.innerHTML = "";
      const p = document.createElement("p");
      p.className = "font-body-md text-body-md text-error";
      p.textContent = err.message;
      mount.appendChild(p);
      return;
    }

    const items = data.items || [];
    mount.innerHTML =
      '<h2 class="font-headline-md text-headline-md text-on-surface uppercase tracking-tighter mb-4">' +
      "On the site</h2>";

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "font-body-md text-body-md text-on-surface-variant";
      empty.textContent = "Nothing uploaded yet. Whatever you add above shows up here and on the front page.";
      mount.appendChild(empty);
      return;
    }

    items.forEach((item) => mount.appendChild(itemRow(item, refreshList)));
  }
}

/* The YouTube slot: paste the link from YouTube's Share button, give it a
 * title if you like, press ADD. The link is read here first so a typo is
 * explained before anything is sent, and read again by the function, which
 * is the check that counts. */
function youtubeSlotHTML() {
  return (
    '<form id="yt-form" class="mt-8 panel" novalidate>' +
    '<div class="flex items-center gap-3 mb-2">' +
    '<span class="material-symbols-outlined text-tertiary">smart_display</span>' +
    '<p class="font-headline-md text-headline-md text-on-surface uppercase tracking-tighter">Add a YouTube music video</p>' +
    "</div>" +
    '<p class="font-body-md text-body-md text-on-surface-variant max-w-xl">' +
    "Open the video on YouTube, press Share, copy the link and paste it here. A playlist link works too. " +
    "It plays on The Sound page and on the front page; YouTube loads only when a customer presses play." +
    "</p>" +
    '<div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 mt-5">' +
    '<div><label for="yt-url" class="sr-only">YouTube link</label>' +
    '<input id="yt-url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://youtu.be/…" ' +
    'class="w-full rounded-full bg-surface-container border border-outline-variant focus:border-secondary focus:ring-0 ' +
    'px-5 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline"/></div>' +
    '<div><label for="yt-title" class="sr-only">Title shown on the site</label>' +
    '<input id="yt-title" type="text" maxlength="120" autocomplete="off" placeholder="Title shown on the site (optional)" ' +
    'class="w-full rounded-full bg-surface-container border border-outline-variant focus:border-secondary focus:ring-0 ' +
    'px-5 py-3 font-body-md text-body-md text-on-surface placeholder:text-outline"/></div>' +
    '<button id="yt-add" type="submit" class="rounded-full bg-primary text-on-primary py-3 px-8 font-label-caps text-label-caps ' +
    'hover:bg-inverse-surface transition-all duration-300 flex items-center justify-center gap-2">' +
    '<span class="material-symbols-outlined text-[18px]">add</span>ADD</button>' +
    "</div>" +
    '<p id="yt-status" class="font-label-caps text-label-caps mt-3 hidden" role="status"></p>' +
    "</form>"
  );
}

function wireYoutubeSlot(onAdded) {
  const form = document.getElementById("yt-form");
  const url = document.getElementById("yt-url");
  const title = document.getElementById("yt-title");
  const btn = document.getElementById("yt-add");
  const status = document.getElementById("yt-status");

  const say = (text, bad) => {
    status.textContent = text;
    status.className = "font-label-caps text-label-caps mt-3 " + (bad ? "text-error" : "text-tertiary");
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = url.value.trim();
    if (!value) {
      say("PASTE A YOUTUBE LINK FIRST", true);
      url.focus();
      return;
    }
    const parsed = parseYouTubeAny(value);
    if (!parsed) {
      say("THAT DOES NOT LOOK LIKE A YOUTUBE LINK. USE THE ONE FROM YOUTUBE'S SHARE BUTTON — https://youtu.be/… OR A PLAYLIST LINK.", true);
      url.focus();
      return;
    }

    btn.disabled = true;
    const label = btn.innerHTML;
    btn.textContent = "ADDING…";
    try {
      const data = await mediaPost({ action: "link", url: value, label: title.value.trim() });
      say('ADDED — "' + (data.item && data.item.label) + '" IS ON THE SITE', false);
      url.value = "";
      title.value = "";
      toast("ADDED TO THE SITE");
      await onAdded();
    } catch (err) {
      say(String(err.message || "That did not go through.").toUpperCase(), true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });
}

function itemRow(item, onChanged) {
  const row = document.createElement("div");
  row.className =
    "flex flex-wrap items-center gap-4 border-b border-outline-variant/50 py-4";

  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined text-tertiary";
  icon.textContent = item.kind === "audio" ? "music_note" : item.kind === "youtube" ? "smart_display" : "movie";

  const main = document.createElement("div");
  main.className = "flex-1 min-w-[200px]";

  const label = document.createElement("input");
  label.type = "text";
  label.value = item.label || "";
  label.setAttribute("aria-label", "Title");
  label.className =
    "w-full bg-transparent border-0 border-b border-transparent hover:border-outline-variant " +
    "focus:border-secondary focus:ring-0 p-0 font-body-lg text-body-lg text-on-surface";
  // Save on blur rather than per keystroke: one request when they finish,
  // instead of one per letter typed.
  label.addEventListener("blur", async () => {
    if (label.value === item.label) return;
    try {
      await mediaPost({ action: "rename", id: item.id, label: label.value });
      item.label = label.value;
      toast("TITLE SAVED");
    } catch (err) {
      toast(err.message);
    }
  });

  const meta = document.createElement("p");
  meta.className = "font-label-caps text-label-caps text-on-surface-variant mt-1";
  meta.textContent =
    (item.kind === "audio" ? "MUSIC" : item.kind === "youtube"
      ? "YOUTUBE · " + (item.ytKind === "playlist" ? "PLAYLIST" : "MUSIC VIDEO") : "VIDEO") +
    (item.bytes ? " · " + prettyBytes(item.bytes) : "") +
    (item.visible === false ? " · HIDDEN" : "");

  main.append(label, meta);

  // A way to check it is the right video, without loading YouTube into the
  // portal. The URL is rebuilt from the stored id, never taken from the record.
  const yt = item.kind === "youtube" ? parseYouTubeAny(item.ytId) : null;
  if (yt) {
    const open = document.createElement("a");
    open.href = yt.page;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.className =
      "rounded-full border border-outline-variant text-on-surface py-2 px-5 font-label-caps " +
      "text-label-caps hover:border-secondary hover:text-secondary transition-colors";
    open.textContent = "OPEN";
    row.__open = open; // placed between the title and the buttons below
  }

  const hide = document.createElement("button");
  hide.type = "button";
  hide.className =
    "rounded-full border border-outline-variant text-on-surface py-2 px-5 font-label-caps " +
    "text-label-caps hover:border-secondary hover:text-secondary transition-colors";
  hide.textContent = item.visible === false ? "SHOW" : "HIDE";
  hide.addEventListener("click", async () => {
    try {
      await mediaPost({ action: "rename", id: item.id, visible: item.visible === false });
      await onChanged();
    } catch (err) {
      toast(err.message);
    }
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className =
    "rounded-full border border-outline-variant text-on-surface py-2 px-5 font-label-caps " +
    "text-label-caps hover:border-error hover:text-error transition-colors";
  del.textContent = "DELETE";
  del.addEventListener("click", async () => {
    // Deleting media is not recoverable — there is no second copy anywhere.
    if (!confirm('Delete "' + (item.label || "this file") + '" permanently?')) return;
    try {
      await mediaPost({ action: "delete", id: item.id });
      await onChanged();
      toast("DELETED");
    } catch (err) {
      toast(err.message);
    }
  });

  row.append(icon, main);
  if (row.__open) row.appendChild(row.__open);
  row.append(hide, del);
  return row;
}

/* ===== What visitors see ===== */

/* A YouTube music video, drawn as our own card. The iframe — and with it the
 * first request to YouTube — is created on the click, from a URL rebuilt out
 * of the stored id. No thumbnail is fetched for the art: that request would
 * be YouTube tracking a visitor who never pressed play, wearing a disguise. */
function youtubeFacade(item, index) {
  const yt = parseYouTubeAny(item.ytId);
  if (!yt) return null;

  const stage = document.createElement("div");
  stage.className = "relative aspect-video overflow-hidden rounded-xl bg-surface-container-low";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "player-facade player-facade--dark group absolute inset-0 w-full h-full rounded-xl " +
    "flex flex-col items-center justify-center gap-3 text-center px-6 " +
    "hover:border-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-tertiary " +
    "transition-colors cursor-pointer";
  btn.style.background = index % 2 === 0
    ? "linear-gradient(160deg,#0f2e1e,#003005)"
    : "linear-gradient(160deg,#1d2320,#33453a)";
  btn.setAttribute("aria-label", "Play " + (item.label || "music video") + " from YouTube");
  btn.innerHTML =
    '<span class="text-tertiary inline-block group-hover:scale-110 transition-transform">' + playGlyph(52) + "</span>" +
    '<span class="font-label-caps text-label-caps">' + esc(item.label || "Music video") + "</span>" +
    '<span class="font-body-md text-[13px] opacity-80">YouTube loads when you press play</span>';
  btn.addEventListener("click", () => {
    const frame = document.createElement("iframe");
    // Autoplay only here, from the visitor's own click.
    frame.src = yt.embed + (yt.embed.includes("?") ? "&" : "?") + "autoplay=1";
    frame.title = item.label || "Music video";
    frame.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
    frame.setAttribute("allowfullscreen", "");
    frame.style.border = "0";
    frame.className = "absolute inset-0 w-full h-full rounded-xl";
    btn.replaceWith(frame);
    // One thing playing at a time: pause our own players.
    document.querySelectorAll("audio, video").forEach((el) => { try { el.pause(); } catch { /* fine */ } });
  });
  stage.appendChild(btn);

  const card = document.createElement("div");
  card.className = "flex flex-col";
  card.appendChild(stage);
  const h = document.createElement("h3");
  h.className = "font-body-lg text-body-lg text-on-surface mt-4";
  h.textContent = item.label || "Music video";
  card.appendChild(h);
  return card;
}

async function publicMediaItems() {
  try {
    const res = await fetch(MEDIA_PUBLIC_ENDPOINT);
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    // Offline, or no functions (a plain static server). Say nothing — an
    // empty media section should simply not appear rather than show an error
    // to a customer who cannot do anything about it.
    return [];
  }
}

/* The Sound: every music video the owner added, newest first. The section is
 * shown only when there is at least one, so the page never carries an empty
 * heading. */
async function renderMusicVideos(mountId, sectionId) {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  const videos = (await publicMediaItems()).filter((i) => i.kind === "youtube");
  const cards = videos.map(youtubeFacade).filter(Boolean);
  if (!cards.length) return;
  mount.className = "grid grid-cols-1 md:grid-cols-2 gap-gutter";
  cards.forEach((c) => mount.appendChild(c));
  const section = sectionId && document.getElementById(sectionId);
  if (section) section.classList.remove("hidden");
}

async function renderLandingMedia(mountId) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const items = await publicMediaItems();
  if (!items.length) return;

  const video = items.find((i) => i.kind === "video");
  const tracks = items.filter((i) => i.kind === "audio");
  // The two newest music videos; the full set is on The Sound.
  const musicVideos = items.filter((i) => i.kind === "youtube").slice(0, 2)
    .map(youtubeFacade).filter(Boolean);
  if (!video && !tracks.length && !musicVideos.length) return;

  mount.classList.remove("hidden");
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 md:grid-cols-2 gap-gutter items-start";
  musicVideos.forEach((c) => grid.appendChild(c));

  if (video) {
    const stage = document.createElement("div");
    stage.className = "relative aspect-video overflow-hidden rounded-xl bg-surface-container-low";
    const el = document.createElement("video");
    el.src = video.src;
    el.controls = true;
    // preload="none" so opening the home page costs nothing until someone
    // presses play. `playsInline` keeps iPhones from going fullscreen.
    el.preload = "none";
    el.playsInline = true;
    el.className = "absolute inset-0 w-full h-full object-cover";
    el.setAttribute("aria-label", video.label || "Video");
    stage.appendChild(el);
    const cap = document.createElement("p");
    cap.className = "font-body-md text-body-md text-on-surface-variant mt-3";
    cap.textContent = video.label || "";
    const col = document.createElement("div");
    col.append(stage, cap);
    grid.appendChild(col);
  }

  if (tracks.length) {
    const col = document.createElement("div");
    col.className = "border border-outline-variant/50 rounded-xl p-5";
    const h = document.createElement("p");
    h.className = "font-label-caps text-label-caps text-tertiary mb-4";
    h.textContent = "NOW PLAYING";
    col.appendChild(h);

    tracks.slice(0, 6).forEach((track) => {
      const wrap = document.createElement("div");
      wrap.className = "mb-4 last:mb-0";
      const name = document.createElement("p");
      name.className = "font-body-md text-body-md text-on-surface mb-2";
      name.textContent = track.label || "Track";
      const audio = document.createElement("audio");
      audio.src = track.src;
      audio.controls = true;
      audio.preload = "none";
      audio.className = "w-full";
      audio.setAttribute("aria-label", track.label || "Track");
      wrap.append(name, audio);
      col.appendChild(wrap);
    });
    grid.appendChild(col);
  }

  mount.appendChild(grid);
}
