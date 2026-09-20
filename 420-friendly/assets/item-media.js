/* 420 FRIENDLY — music and video while the customer is shopping.
 *
 * Two small mounts, both fed by assets/media-links.js:
 *
 *   mountItemMedia()  product.html — the film, plus a listen button
 *   mountListenBar()  shop.html    — the listen button above the grid
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE MUSIC OPENS A NEW TAB INSTEAD OF PLAYING HERE
 *
 * A Spotify, Apple or YouTube player lives in an iframe, and the browser
 * destroys an iframe the instant you navigate. This shop is separate HTML
 * pages, so an embedded player would stop dead the moment a customer clicked
 * from a hoodie to a pant — which is exactly when they are browsing hardest.
 * No attribute or setting changes that; it is how documents work.
 *
 * A new tab is its own document. It survives every click on this site, so the
 * music genuinely plays for the whole visit. The cost is one tab switch, paid
 * once. The full in-page players still live on playlist.html, where a visitor
 * has come to sit and listen rather than to shop.
 *
 * The film is different: it is our own file on our own server, so it can play
 * right here with nothing loaded from anyone else until the visitor presses
 * play.
 * ─────────────────────────────────────────────────────────────────────────
 */

/* Nothing is configured → nothing renders.
 *
 * Note this is the opposite of playlist.html, which shows a card naming the
 * file to edit. That page is effectively the owner's console; these are
 * customer pages, and "paste your link into assets/media-links.js" is not
 * copy a shopper should ever read. Same reasoning for an unreadable link:
 * playlist.html shows the warning, the shop just stays quiet. One place to
 * look, and it is the place Otis already opens.
 */

// Spotify first, then Apple, then YouTube — whichever is configured.
function primaryService() {
  return linkedServices()[0] || null;
}

function listenAnchor(service, extraClass) {
  const a = document.createElement("a");
  a.href = service.page;
  a.target = "_blank";
  // noopener is the one that matters: without it the new tab gets a handle on
  // this one via window.opener and can navigate it somewhere else.
  a.rel = "noopener noreferrer";
  a.className =
    "inline-flex items-center justify-center gap-2 rounded-full border " +
    "border-outline-variant text-on-surface px-6 py-3 font-label-caps " +
    "text-label-caps hover:border-tertiary hover:text-tertiary " +
    "transition-colors focus:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-tertiary " + (extraClass || "");
  a.innerHTML =
    '<span class="material-symbols-outlined text-[18px]">' + service.icon + "</span>" +
    "<span>LISTEN ON " + esc(service.label.toUpperCase()) + "</span>" +
    '<span class="material-symbols-outlined text-[16px] text-on-surface-variant">open_in_new</span>';
  return a;
}

// Says plainly that a tab opens and that the music keeps going. A shopper who
// knows that is far likelier to press it than one guessing what the arrow does.
function listenNote(service) {
  const p = document.createElement("p");
  p.className = "font-body-md text-body-md text-on-surface-variant";
  p.textContent =
    "Opens " + service.label + " in a new tab, so it keeps playing while you shop.";
  return p;
}

/* The film. Drawn as our own poster-and-button card; the <video> element is
 * only created on click, which is also when the file starts downloading. A
 * product page therefore costs a visitor nothing extra unless they want it.
 */
function filmCard() {
  const file = parseLocalPath(BRAND_FILM && BRAND_FILM.file);
  if (!file) return null;
  const poster = parseLocalPath(BRAND_FILM.poster);

  const stage = document.createElement("div");
  stage.className =
    "relative aspect-video overflow-hidden rounded-xl bg-surface-container-low";

  /* The still is the film's own opening frame, so it already carries the
   * wordmark dead centre. Titling over that would stack type on type — the
   * caption sits along the bottom instead, under its own gradient, and the
   * middle is left to the play symbol. */
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "player-facade player-facade--dark absolute inset-0 h-full w-full " +
    "flex items-center justify-center " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-tertiary " +
    "cursor-pointer group";
  btn.innerHTML =
    '<span class="text-on-primary inline-block transition-transform group-hover:scale-110">' +
    playGlyph(64) + "</span>" +
    '<span class="facade-caption inset-x-0 bottom-0 p-5 text-left">' +
    '<span class="block font-label-caps text-label-caps">' +
    esc(BRAND_FILM.title || "WATCH THE FILM") + "</span>" +
    (BRAND_FILM.caption
      // Two lines of caption over the poster crowds the artwork on a phone;
      // the title alone still says what the card is.
      ? '<span class="hidden sm:block font-body-md text-body-md opacity-90 mt-1">' +
        esc(BRAND_FILM.caption) + "</span>"
      : "") +
    "</span>";

  if (poster) {
    btn.style.backgroundImage = "url(" + JSON.stringify(poster) + ")";
    btn.style.backgroundSize = "cover";
    btn.style.backgroundPosition = "center";
  } else {
    btn.style.background = "linear-gradient(160deg,#0f2e1e,#003005)";
  }

  btn.addEventListener("click", () => {
    const video = document.createElement("video");
    video.src = file;
    video.controls = true;
    video.autoplay = true; // Safe: only ever reached from the visitor's click.
    video.playsInline = true;
    if (poster) video.poster = poster;
    video.className = "absolute inset-0 w-full h-full object-contain bg-black rounded-xl";
    btn.replaceWith(video);
    video.focus({ preventScroll: true });
  });

  stage.appendChild(btn);
  return stage;
}

/* product.html — under the garment, above "You may also like". */
function mountItemMedia(mountId) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const film = filmCard();
  const service = primaryService();
  if (!film && !service) return; // Nothing configured: render nothing at all.

  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 md:grid-cols-12 gap-gutter items-center";

  if (film) {
    const left = document.createElement("div");
    left.className = "md:col-span-7 min-w-0";
    left.appendChild(film);
    grid.appendChild(left);
  }

  const right = document.createElement("div");
  right.className = (film ? "md:col-span-5" : "md:col-span-12") + " min-w-0";

  const eyebrow = document.createElement("p");
  eyebrow.className = "font-label-caps text-label-caps text-tertiary mb-3";
  eyebrow.textContent = "SEE IT AND HEAR IT";
  right.appendChild(eyebrow);

  const lead = document.createElement("p");
  lead.className = "font-body-lg text-body-lg text-on-surface";
  lead.textContent = film
    ? "Watch the collection move, and put the soundtrack on while you look."
    : "Put the soundtrack on while you look.";
  right.appendChild(lead);

  if (service) {
    const row = document.createElement("div");
    row.className = "mt-6 flex flex-col items-start gap-3";
    row.appendChild(listenAnchor(service));
    row.appendChild(listenNote(service));
    right.appendChild(row);
  }

  const more = document.createElement("a");
  more.href = "playlist.html";
  more.className =
    "inline-flex items-center gap-1 mt-6 font-label-caps text-label-caps " +
    "text-secondary underline decoration-1 underline-offset-4 hover:text-tertiary transition-colors";
  more.textContent = service ? "ALL PLAYERS AND THE FULL REEL" : "THE SOUND";
  right.appendChild(more);

  grid.appendChild(right);
  mount.appendChild(grid);
}

/* shop.html — one quiet control above the grid, and nothing at all until a
 * playlist is linked. */
function mountListenBar(mountId) {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  const service = primaryService();
  if (!service) return;

  const row = document.createElement("div");
  row.className = "flex flex-wrap items-center gap-x-4 gap-y-2";
  row.appendChild(listenAnchor(service));
  row.appendChild(listenNote(service));
  mount.appendChild(row);
}
