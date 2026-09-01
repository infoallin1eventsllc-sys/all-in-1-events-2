/* 420 FRIENDLY — owner media library.
 *
 * Two halves that never both run on one page:
 *
 *   initMediaManager()  — the owner's upload screen (media.html)
 *   renderLandingMedia() — the player visitors see (index.html)
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
    "Drag files here, or choose them below. They go straight onto the front page." +
    "</p>" +
    '<label class="inline-flex items-center gap-2 mt-6 rounded-full bg-primary text-on-primary py-4 px-8 ' +
    'font-label-caps text-label-caps hover:bg-inverse-surface transition-all duration-300 cursor-pointer">' +
    '<span class="material-symbols-outlined text-[18px]">add</span>CHOOSE FILES' +
    '<input id="media-input" type="file" multiple accept="audio/*,video/*" class="sr-only"/></label>' +
    '<p class="font-body-md text-[13px] text-on-surface-variant mt-4">' +
    "Music up to 20 MB · Video up to 60 MB" +
    "</p></div>" +
    '<div id="media-queue" class="mt-6 flex flex-col gap-3"></div>' +
    '<div id="media-list" class="mt-10"></div>';

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

function itemRow(item, onChanged) {
  const row = document.createElement("div");
  row.className =
    "flex flex-wrap items-center gap-4 border-b border-outline-variant/50 py-4";

  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined text-tertiary";
  icon.textContent = item.kind === "audio" ? "music_note" : "movie";

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
    (item.kind === "audio" ? "MUSIC" : "VIDEO") +
    (item.bytes ? " · " + prettyBytes(item.bytes) : "") +
    (item.visible === false ? " · HIDDEN" : "");

  main.append(label, meta);

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

  row.append(icon, main, hide, del);
  return row;
}

/* ===== What visitors see ===== */

async function renderLandingMedia(mountId) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  let items = [];
  try {
    const res = await fetch(MEDIA_PUBLIC_ENDPOINT);
    const data = await res.json();
    items = data.items || [];
  } catch {
    // Offline, or no functions (a plain static server). Say nothing — an
    // empty media section should simply not appear rather than show an error
    // to a customer who cannot do anything about it.
    return;
  }

  if (!items.length) return;

  const video = items.find((i) => i.kind === "video");
  const tracks = items.filter((i) => i.kind === "audio");
  if (!video && !tracks.length) return;

  mount.classList.remove("hidden");
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 md:grid-cols-2 gap-gutter items-start";

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
