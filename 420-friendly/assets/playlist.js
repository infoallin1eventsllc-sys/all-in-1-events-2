/* 420 FRIENDLY — "The Sound": the brand playlist and the video reel.
 *
 * The links themselves live in assets/media-links.js, which this page loads
 * first — the shop pages use the same file, so a playlist pasted once is live
 * on every surface. This file is only the page: tabs, facades and the reel.
 *
 * HOW THIS PAGE LOADS THIRD-PARTY PLAYERS
 *
 * Nothing from Spotify, Apple or YouTube is requested when the page opens.
 * Each player is drawn first as a static card of our own making; the real
 * iframe is only created when a visitor clicks play. That is deliberate:
 *
 *   - Those embeds set cookies and profile the visitor the moment they load.
 *     This site has no consent banner, so loading them unasked would be
 *     tracking people who never pressed play.
 *   - Three embeds is several megabytes. The page would be slow for the
 *     majority of visitors who never listen.
 *
 * The click is the consent and the click is the play button, so it costs
 * nothing in usability. Do not "simplify" this by putting the iframes
 * straight into the markup.
 */

function makeIframe(src, title, height) {
  const frame = document.createElement("iframe");
  frame.src = src;
  frame.title = title;
  frame.loading = "lazy";
  frame.width = "100%";
  frame.height = String(height);
  frame.style.border = "0";
  frame.setAttribute("allowfullscreen", "");
  frame.setAttribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
  );
  frame.className = "w-full rounded-xl";
  return frame;
}

/* The facade: our own card, standing in for a player that has not loaded.
 * It is a real <button> so it is keyboard-reachable and announced properly.
 */
function facadeButton(labelText, subText, onActivate) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "player-facade group w-full rounded-xl border border-outline-variant/60 " +
    "flex flex-col items-center justify-center gap-3 text-center px-6 py-16 " +
    "hover:border-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-tertiary " +
    "transition-colors cursor-pointer";
  btn.innerHTML =
    '<span class="text-tertiary inline-block group-hover:scale-110 transition-transform">' + playGlyph(52) + "</span>" +
    '<span class="font-label-caps text-label-caps text-on-surface">' + esc(labelText) + "</span>" +
    '<span class="font-body-md text-body-md text-on-surface-variant max-w-sm">' + esc(subText) + "</span>";
  btn.addEventListener("click", () => onActivate(btn));
  return btn;
}

function renderMusic(mountId, tabsId) {
  const mount = document.getElementById(mountId);
  const tabsMount = document.getElementById(tabsId);
  const services = linkedServices();
  const rejected = rejectedServices();

  if (rejected.length) {
    const warn = document.createElement("p");
    warn.className =
      "font-body-md text-body-md text-error border border-error/40 rounded-xl px-4 py-3 mb-4";
    warn.textContent =
      "Could not read the link for " + rejected.map((s) => s.label).join(" and ") +
      ". Check it in assets/media-links.js — it needs to be the plain share link.";
    mount.appendChild(warn);
  }

  if (!services.length) {
    mount.appendChild(setupCard("music"));
    return;
  }

  // Panels are built once and kept; switching back to a player that is already
  // playing should not tear it down and restart it.
  const panels = services.map((svc) => {
    const panel = document.createElement("div");
    panel.id = "panel-" + svc.key;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "tab-" + svc.key);
    panel.tabIndex = 0;

    const facade = facadeButton("PLAY ON " + svc.label.toUpperCase(), svc.note, (btn) => {
      const frame = makeIframe(svc.src, "420 Friendly playlist on " + svc.label, svc.height);
      btn.replaceWith(frame);
    });
    facade.style.minHeight = svc.height + "px";
    panel.appendChild(facade);
    return panel;
  });

  const tabs = services.map((svc, i) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = "tab-" + svc.key;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", "panel-" + svc.key);
    tab.innerHTML =
      '<span class="material-symbols-outlined text-[18px]">' + svc.icon + "</span>" +
      "<span>" + esc(svc.label) + "</span>";
    tab.className =
      "flex items-center gap-2 rounded-full px-5 py-3 font-label-caps text-label-caps " +
      "border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-tertiary";
    return tab;
  });

  function select(index) {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      // Roving tabindex: one stop for Tab, then arrow keys move within the set.
      tab.tabIndex = on ? 0 : -1;
      tab.className = tab.className.replace(/ ?(bg-primary|text-on-primary|border-primary|border-outline-variant|text-on-surface|hover:border-tertiary)\b/g, "");
      tab.className += on
        ? " bg-primary text-on-primary border-primary"
        : " border-outline-variant text-on-surface hover:border-tertiary";
      panels[i].hidden = !on;
    });
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(i));
    tab.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = (i + step + tabs.length) % tabs.length;
      select(next);
      tabs[next].focus();
    });
    tabsMount.appendChild(tab);
  });

  // A single service needs no tab strip — the panel speaks for itself.
  if (services.length === 1) tabsMount.classList.add("hidden");

  panels.forEach((p) => mount.appendChild(p));
  select(0);
}

function renderReel(mountId) {
  const mount = document.getElementById(mountId);

  const clips = VIDEO_REEL.map((clip) => {
    const yt = clip.youtube ? parseYouTubeVideo(clip.youtube) : null;
    const file = clip.file ? parseLocalPath(clip.file) : null;
    return { ...clip, ytSrc: yt && yt.embed, fileSrc: file };
  }).filter((c) => c.ytSrc || c.fileSrc);

  if (!clips.length) {
    mount.appendChild(setupCard("video"));
    return;
  }

  mount.className = "grid grid-cols-1 md:grid-cols-2 gap-gutter";

  clips.forEach((clip, i) => {
    const card = document.createElement("div");
    card.className = "flex flex-col";

    const stage = document.createElement("div");
    stage.className = "relative aspect-video overflow-hidden rounded-xl bg-surface-container-low";

    const poster = clip.poster ? parseLocalPath(clip.poster) : null;

    const facade = facadeButton("PLAY", clip.caption || "", (btn) => {
      if (clip.ytSrc) {
        const frame = makeIframe(clip.ytSrc, clip.title, 0);
        frame.className = "absolute inset-0 w-full h-full rounded-xl";
        frame.removeAttribute("height");
        btn.replaceWith(frame);
      } else {
        const video = document.createElement("video");
        video.src = clip.fileSrc;
        video.controls = true;
        video.autoplay = true; // Safe: this only runs from the visitor's click.
        video.playsInline = true;
        if (poster) video.poster = poster;
        video.className = "absolute inset-0 w-full h-full object-cover rounded-xl";
        btn.replaceWith(video);
      }
    });
    // The reel tiles sit on dark art, so the facade's default dark-on-light
    // brand text would be unreadable. This flips it and adds a scrim.
    facade.className += " player-facade--dark absolute inset-0 h-full";
    if (poster) {
      facade.style.backgroundImage = "url(" + JSON.stringify(poster) + ")";
      facade.style.backgroundSize = "cover";
      facade.style.backgroundPosition = "center";
    } else {
      // No still supplied — fall back to the typographic treatment the shop
      // already uses in place of photography, so the grid still reads as design.
      facade.style.background =
        i % 2 === 0
          ? "linear-gradient(160deg,#0f2e1e,#003005)"
          : "linear-gradient(160deg,#1d2320,#33453a)";
    }
    stage.appendChild(facade);

    const meta = document.createElement("div");
    meta.className = "mt-4";
    const h = document.createElement("h3");
    h.className = "font-body-lg text-body-lg text-on-surface";
    h.textContent = clip.title;
    meta.appendChild(h);
    if (clip.caption) {
      const c = document.createElement("p");
      c.className = "font-body-md text-body-md text-on-surface-variant mt-1";
      c.textContent = clip.caption;
      meta.appendChild(c);
    }

    card.appendChild(stage);
    card.appendChild(meta);
    mount.appendChild(card);
  });
}

/* Shown until the owner pastes a link. It is the page's real content right now,
 * so it says exactly what to do rather than reading as an error.
 */
function setupCard(kind) {
  const box = document.createElement("div");
  box.className =
    "border border-dashed border-outline-variant rounded-2xl bg-surface-container-low/50 px-6 py-12 text-center";

  const music =
    "<p>Open <span class=\"font-label-caps text-label-caps text-on-surface\">420-friendly/assets/media-links.js</span> " +
    "and paste your playlist link into <span class=\"font-label-caps text-label-caps text-on-surface\">PLAYLIST_CONFIG</span>. " +
    "One line per service — Spotify, Apple Music, YouTube. Fill in one or all three; " +
    "only the ones you fill in get a tab.</p>";

  const video =
    "<p>Add clips to <span class=\"font-label-caps text-label-caps text-on-surface\">VIDEO_REEL</span> in " +
    "<span class=\"font-label-caps text-label-caps text-on-surface\">420-friendly/assets/media-links.js</span>. " +
    "Each one takes a title plus either a YouTube link or the path to a video file you commit to the repo.</p>";

  box.innerHTML =
    '<span class="material-symbols-outlined text-outline text-[40px]">' +
    (kind === "music" ? "queue_music" : "movie") + "</span>" +
    '<p class="font-label-caps text-label-caps text-on-surface mt-4">' +
    (kind === "music" ? "NO PLAYLIST LINKED YET" : "NO CLIPS ADDED YET") + "</p>" +
    '<div class="font-body-md text-body-md text-on-surface-variant mt-3 max-w-lg mx-auto">' +
    (kind === "music" ? music : video) + "</div>";
  return box;
}
