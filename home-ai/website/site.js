(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- The film: plays muted on arrival; "with sound" restarts it with the voice.
  const film = $("#film"), pause = $("#film-pause");
  let fullFilm = false;
  const setPaused = (p) => { pause.textContent = p ? "Play" : "Pause"; pause.setAttribute("aria-pressed", String(p)); };
  const sound = $("#film-sound");
  // The buttons follow the video itself, so its own controls and the end of the film keep them right.
  const hero = $(".hero");
  // With the full film playing, the page's words step aside; they come back when it pauses or ends.
  film.addEventListener("play", () => { setPaused(false); if (fullFilm) { hero.classList.add("watching"); sound.textContent = "Playing with sound"; } });
  film.addEventListener("pause", () => { setPaused(true); hero.classList.remove("watching"); if (fullFilm && !film.ended) sound.textContent = "Resume the film with sound"; });
  const HERO_SOURCES = '<source src="meridian-film-hero.mp4" type="video/mp4"><source src="meridian-film-hero.webm" type="video/webm">';
  // When the full film ends, the page goes back to its short, silent loop, so the film's end card
  // never sits frozen under the page's words.
  film.addEventListener("ended", () => {
    hero.classList.remove("watching"); sound.textContent = "Watch again with sound";
    if (!fullFilm) return;
    fullFilm = false; film.innerHTML = HERO_SOURCES; film.load();
    film.muted = true; film.loop = true; film.controls = false;
    $("#film-note").textContent = "This is a short cut of the film. The full film is 1:19, with the guide\u2019s voice.";
    if (!reduce) film.play().catch(() => setPaused(true)); else setPaused(true);
  });
  setPaused(true);
  if (!reduce) film.play().catch(() => setPaused(true));
  pause.addEventListener("click", () => { if (film.paused) film.play().catch(() => {}); else { film.pause(); setPaused(true); } });
  // The hero plays a short cut. "With sound" loads the full film and plays it from the start.
  sound.addEventListener("click", () => {
    if (fullFilm && film.paused && !film.ended && film.currentTime > 0) { film.play().catch(() => setPaused(true)); return; }
    if (!fullFilm) {
      fullFilm = true;
      film.innerHTML = '<source src="meridian-film.mp4" type="video/mp4"><source src="meridian-film.webm" type="video/webm">';
      film.load();
      $("#film-note").textContent = "The full film, 1:19.";
    }
    film.muted = false; film.loop = false; film.controls = true; film.currentTime = 0;
    film.play().catch(() => setPaused(true));
  });

  // ---- Menu (narrow screens) and the current section in the nav.
  const menu = $("#menu"), links = $("#nav-links");
  menu.addEventListener("click", () => { const open = links.classList.toggle("open"); menu.setAttribute("aria-expanded", String(open)); });
  links.addEventListener("click", (e) => { if (e.target.closest("a")) { links.classList.remove("open"); menu.setAttribute("aria-expanded", "false"); } });
  const navFor = Object.fromEntries([...links.querySelectorAll("a")].map((a) => [a.getAttribute("href").slice(1), a]));
  const sectionIO = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    Object.values(navFor).forEach((a) => a.removeAttribute("aria-current"));
    if (navFor[e.target.id]) navFor[e.target.id].setAttribute("aria-current", "true");
  }), { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("main > section[id]").forEach((s) => sectionIO.observe(s));

  // ---- Screens and rooms.
  const SCREENS = {
    signature: { name: "Signature", best: "Great room or main entry", about: "The flagship. The house in realistic 3D beside the room you're in, with every control on glass.", has: ["The house in 3D: orbit, zoom, tap a room to fly in", "Rooms warm when lit and flush red on alerts", "Room tabs, scenes, device tiles, climate dial", "Electricity today, suggestions and confirmations"] },
    wallpaper: { name: "Wallpaper", best: "Living room or a large wall display", about: "The home's own photo behind frosted tiles. The photo follows the time of day, or the family uses a picture of their own house.", has: ["Photo backdrop for morning, day, evening and night", "Weather now and ahead, once a source is connected", "Temperature, humidity and electricity with a live line", "Every light, doors, locks, garage and water"] },
    studio: { name: "Studio", best: "Living room or kitchen; the model-home showpiece", about: "Haven at the center. A large orb listens and speaks, and underneath it Haven's agents light up as they work, together.", has: ["Tap the orb to talk; a waveform follows the voice", "Lighting, Climate, Security and Energy agents", "Lines between agents light when they work together", "Big clock, climate, lighting, electricity, doors"] },
    "command-center": { name: "Command Center", best: "Office or a large wall display", about: "Everything at once, for the person who runs the house.", has: ["3D house that filters the lights by room", "Climate dial and electricity chart", "Every light, door, lock, garage and the main water", "Room conditions, scenes and the latest updates"] },
    "family-hub": { name: "Family Hub", best: "Kitchen", about: "Big and friendly for everyone in the house, not just the owner.", has: ["Large clock and date", "Today's briefing, with Brief me now", "Big scene cards", "Too cold, too warm, too bright, too dark, just right"] },
    nightstand: { name: "Nightstand", best: "Bedroom", about: "Dim, quiet and easy to use half-asleep. Talk to it in the dark.", has: ["Large clock on a dark screen", "Goodnight: lock up, lights off, 68°F", "Warmer and cooler, learned as a preference", "Each bedroom's own photo behind the clock"] },
    rooms: { name: "Rooms", best: "Large or busy households", about: "Every room as its own card. One tap per device.", has: ["A card per room with big device buttons", "The thermostat in its own room", "Each room's sensors: motion, leaks, doors, light"] },
    entry: { name: "Entry", best: "Mudroom or garage door", about: "Built for the moment you walk in or out.", has: ["I'm leaving, I'm home, Lock up", "Security first: Ready, or what's open", "What's still on, with Turn off", "Doors, locks, garage and water in one tap"] },
  };
  const ROOMS = [
    ["great-room", "Great room", "signature"], ["living", "Living room", "wallpaper"], ["model", "Model home", "studio"], ["kitchen", "Kitchen", "family-hub"],
    ["bedroom", "Bedroom", "nightstand"], ["mudroom", "Mudroom", "entry"], ["office", "Office", "command-center"], ["landing", "Upstairs landing", "rooms"],
  ];
  const FINISHES = [["grounded", "Grounded"], ["futuristic", "Futuristic"], ["vivid", "Vivid light"], ["vivid-dark", "Vivid dark"]];
  const pick = { room: store.get("site.room") || "great-room", finish: store.get("site.finish") || "grounded" };
  if (!ROOMS.some((r) => r[0] === pick.room)) pick.room = "great-room";
  if (!FINISHES.some((f) => f[0] === pick.finish)) pick.finish = "grounded";
  const shot = (finish, id) => `shots/${finish}-${id}.jpg`;
  const thumb = (finish, id) => `shots/thumbs/${finish}-${id}.jpg`;
  const screenOf = (room) => ROOMS.find((r) => r[0] === room)[2];

  const roomsEl = $("#rooms");
  roomsEl.innerHTML = ROOMS.map(([id, name, scr]) => `<button role="tab" type="button" id="room-${id}" data-room="${id}" aria-controls="pick"><b>${name}</b><span>${SCREENS[scr].name}</span></button>`).join("");
  $("#finishes").innerHTML = FINISHES.map(([k, l]) => `<button type="button" data-finish="${k}">${l}</button>`).join("");
  $("#set").innerHTML = Object.entries(SCREENS).map(([id, s]) => `<button type="button" data-screen="${id}"><img data-shot="${id}" alt="" loading="lazy" width="720" height="450">${s.name}</button>`).join("");

  // Swap the big picture: dim it, load the next one, then bring it up under one scan line.
  // The first render (and reduced motion) just sets it.
  let firstPick = true, wanted = "";
  function swapShot(img, src) {
    const frame = img.parentElement;
    wanted = src;
    if (firstPick || reduce) { img.src = src; firstPick = false; return; }
    frame.classList.add("swap");
    const next = new Image();
    next.onload = next.onerror = () => {
      if (src !== wanted) return;
      img.src = src;
      frame.classList.remove("swap", "scan"); void frame.offsetWidth; frame.classList.add("scan");
    };
    next.src = src;
  }
  $("#pick-img").parentElement.addEventListener("animationend", (e) => e.currentTarget.classList.remove("scan"));

  function renderPick() {
    const id = screenOf(pick.room), s = SCREENS[id], room = ROOMS.find((r) => r[0] === pick.room)[1];
    roomsEl.querySelectorAll("[role=tab]").forEach((b) => { const on = b.dataset.room === pick.room; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    $("#pick").setAttribute("aria-labelledby", `room-${pick.room}`);
    $("#finishes").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.finish === pick.finish)));
    const img = $("#pick-img"), src = shot(pick.finish, id);
    img.alt = `The ${s.name} screen for the ${room.toLowerCase()}, in the ${FINISHES.find((f) => f[0] === pick.finish)[1]} finish`;
    if (wanted !== src) swapShot(img, src);
    $("#pick-name").textContent = `${room}: ${s.name}`;
    $("#pick-best").textContent = `Best for: ${s.best}`;
    $("#pick-about").textContent = s.about;
    $("#pick-has").innerHTML = s.has.map((h) => `<li>${h}</li>`).join("");
    $("#set").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.screen === id)));
    $("#set").querySelectorAll("img").forEach((im) => { im.src = thumb(pick.finish, im.dataset.shot); im.alt = `${SCREENS[im.dataset.shot].name} screen`; });
    store.set("site.room", pick.room); store.set("site.finish", pick.finish);
  }
  roomsEl.addEventListener("click", (e) => { const b = e.target.closest("[data-room]"); if (b) { pick.room = b.dataset.room; renderPick(); } });
  roomsEl.addEventListener("keydown", (e) => {
    const tabs = [...roomsEl.querySelectorAll("[role=tab]")], i = tabs.indexOf(document.activeElement);
    const next = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (i < 0 || !next) return;
    e.preventDefault(); const t = tabs[(i + next + tabs.length) % tabs.length]; t.focus(); t.click();
  });
  $("#finishes").addEventListener("click", (e) => { const b = e.target.closest("[data-finish]"); if (b) { pick.finish = b.dataset.finish; renderPick(); } });
  $("#set").addEventListener("click", (e) => {
    const b = e.target.closest("[data-screen]"); if (!b) return;
    pick.room = ROOMS.find((r) => r[2] === b.dataset.screen)[0]; renderPick();
    $(`#room-${pick.room}`).scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  renderPick();

  // ---- The live panel: loads on request, switches screens in place.
  const LIVE_FINISHES = [["grounded", "Grounded"], ["futuristic", "Futuristic"], ["vivid", "Vivid"]];
  const live = { finish: "grounded", screen: "signature", loaded: false };
  $("#live-finishes").innerHTML = LIVE_FINISHES.map(([k, l]) => `<button type="button" data-finish="${k}">${l}</button>`).join("");
  $("#live-screens").innerHTML = Object.entries(SCREENS).map(([id, s]) => `<button type="button" data-screen="${id}">${s.name}</button>`).join("");
  let frame = null, frameReady = false;
  function renderLive() {
    $("#live-finishes").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.finish === live.finish)));
    $("#live-screens").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.screen === live.screen)));
    $("#frame").style.setProperty("--poster", `url('${shot(live.finish, live.screen)}')`);
    if (!live.loaded) return;
    const src = `panel-${live.finish}.html#${live.screen}`;
    if (!frame) {
      frame = document.createElement("iframe");
      frame.title = "The Haven wall panel, running on a simulated house";
      frame.addEventListener("load", () => { frameReady = true; });
      $("#frame").append(frame); $("#frame-start").hidden = true;
    }
    const cur = frame.getAttribute("src") || "";
    // Same panel and already loaded: switch its screen in place. Otherwise load the page.
    if (frameReady && cur.split("#")[0] === src.split("#")[0]) { try { frame.contentWindow.location.hash = live.screen; return; } catch { /* fall through */ } }
    frameReady = false; frame.setAttribute("src", src);
  }
  $("#frame-load").addEventListener("click", () => { live.loaded = true; renderLive(); });
  $("#live-finishes").addEventListener("click", (e) => { const b = e.target.closest("[data-finish]"); if (b) { live.finish = b.dataset.finish; renderLive(); } });
  $("#live-screens").addEventListener("click", (e) => { const b = e.target.closest("[data-screen]"); if (b) { live.screen = b.dataset.screen; renderLive(); } });
  $("#pick-live").addEventListener("click", () => {
    live.screen = screenOf(pick.room); live.finish = pick.finish.startsWith("vivid") ? "vivid" : pick.finish; live.loaded = true; renderLive();
    $("#live").scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  });
  renderLive();

  // ---- Contact: posts to Meridian's CRM intake.
  const INTAKE = "https://glzodwhyavexpuusbqjy.supabase.co/functions/v1/intake";
  const form = $("#contact-form"), result = $("#f-result"), send = $("#f-send");
  const field = (id) => $(id).value.trim();
  function show(kind, html) { result.className = `result ${kind}`; result.innerHTML = html; result.hidden = false; }
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (field("#f-trap")) return;
    const name = field("#f-name"), email = field("#f-email"), phone = field("#f-phone");
    $("#f-name").setAttribute("aria-invalid", String(!name));
    const badEmail = email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    $("#f-email").setAttribute("aria-invalid", String(!!badEmail || (!email && !phone)));
    if (!name) { show("warn", "<p>Add your name so we know who to reply to.</p>"); $("#f-name").focus(); return; }
    if (badEmail) { show("warn", "<p>That email address doesn&rsquo;t look complete. Check it and send again.</p>"); $("#f-email").focus(); return; }
    if (!email && !phone) { show("warn", "<p>Add an email address or a phone number so we can reach you.</p>"); $("#f-email").focus(); return; }
    const message = [`Role: ${$("#f-role").value}`, field("#f-where") && `Project: ${field("#f-where")}`, field("#f-note")].filter(Boolean).join("\n");
    const body = { name, email: email || undefined, phone: phone || undefined, company: field("#f-company") || undefined, message, source: "meridian-website:haven" };
    send.disabled = true; send.textContent = "Sending…";
    try {
      const res = await fetch(INTAKE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.ok === false) throw Object.assign(new Error(out.error || `HTTP ${res.status}`), { server: true });
      show("ok", `<p><b>Thanks, ${esc(name)}.</b> Your request is with Meridian. We&rsquo;ll reply to ${esc(email || phone)} to set up your walkthrough.</p>`);
      form.reset();
    } catch (err) {
      if (err.server) {
        show("warn", `<p>Meridian couldn&rsquo;t accept this request (${esc(err.message)}). Check your details and send it again.</p>`);
        return;
      }
      const text = `${name}\n${[email, phone].filter(Boolean).join(" · ")}\n${message}`;
      show("warn", `<p>This page couldn&rsquo;t reach Meridian just now, so your request wasn&rsquo;t sent. Your details are below. Try again in a moment, or copy them.</p><pre id="f-copy-text">${esc(text)}</pre><div class="row"><button class="btn small" type="button" id="f-copy">Copy my request</button><button class="btn small quiet" type="submit">Try again</button></div>`);
      $("#f-copy").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(text); $("#f-copy").textContent = "Copied"; }
        catch { const r = document.createRange(); r.selectNodeContents($("#f-copy-text")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("#f-copy").textContent = "Selected: press copy"; }
      });
    } finally { send.disabled = false; send.textContent = "Request a walkthrough"; }
  });
})();
