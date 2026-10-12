/* =============================================================
   Secrets of Cint — the scents, by scroll (the section under the hero film)
   Each scent drifts in on its own, settles beside its words, and lights up
   while a voice says a line about it over soft music. Sound starts only from
   the Sound button (browsers block audio until the shopper interacts); with
   sound off the line still appears as a caption.
   Names, prices and notes come from the catalogue in main.js
   (window.SOC_PRODUCTS); the spoken lines and glow tones live here.
   Add to Cart uses the site cart (main.js listens for [data-add]).
   The pictures are studio packshots on pure black (assets/images/scents),
   so each product is photographed *on* the page, never pasted onto it.
   ============================================================= */
(function () {
  "use strict";
  var section = document.getElementById("scents"), host = document.getElementById("scentsList");
  if (!section || !host || !window.SOC_PRODUCTS) return;

  var ORDER = ["moon-flower", "brewed-elixir", "inferno-dreams", "exotic-peach", "harlem-smock", "exotic-peach-spray", "amber-blush-spray", "moon-flower-spray", "citrus-grove"];
  var VOICE = {
    "moon-flower":        { tone: "#6a5a4e", line: "Moon Flower. Our signature. Bright bergamot, wrapped in soft leather and warm labdanum. Moody, and magnetic." },
    "brewed-elixir":      { tone: "#8a5a2e", line: "Brewed Elixir. Fresh coffee, toasted hazelnut, and a soft swirl of vanilla. Two wicks, hand-poured in soy." },
    "inferno-dreams":     { tone: "#9a5a22", line: "Inferno Dreams. Saffron and sandalwood, with the warm glow of embers. Made for late nights." },
    "exotic-peach":       { tone: "#b07a3a", line: "Exotic Peach. Mango, coconut and ripe peach, in black glass with a wooden lid. Sunshine, in a candle." },
    "harlem-smock":       { tone: "#6e6150", line: "Harlem Smock. Santal, sandalwood and vetiver. Smooth, grounding, and a little bit smoky. Our best seller." },
    "exotic-peach-spray": { tone: "#c08a48", line: "Exotic Peach room spray. Ripe peach, creamy coconut, and mango. A spritz of summer, any time of year." },
    "amber-blush-spray":  { tone: "#a0704a", line: "Amber Blush. Vanilla, white amber, and jasmine. Soft, warm, and a little bit romantic." },
    "moon-flower-spray":  { tone: "#7a7a86", line: "Moon Flower room spray. The signature scent, in a two ounce mist. Bergamot, leather and labdanum, anywhere you like." },
    "citrus-grove":       { tone: "#9a9a62", line: "Number Seven, Citrus Grove. Bright citrus over green vetiver and amber. Fragrance all day, no flame needed." }
  };
  var WELCOME = "Welcome to Secrets of Cint. Just scroll, and let the collection come to you.";
  var AUDIO = "assets/audio/scents/";
  var PLATES = window.SOC_PLATES || null;   // the single-file preview inlines the pictures here
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var byId = {};
  window.SOC_PRODUCTS.forEach(function (p) { byId[p.id] = p; });
  var items = [];
  ORDER.forEach(function (id) { if (byId[id] && VOICE[id]) items.push({ id: id, p: byId[id], tone: VOICE[id].tone, line: VOICE[id].line }); });
  if (!items.length) return;

  /* ---------- build the scents (DOM API, never markup from data) ---------- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var scents = items.map(function (it, i) {
    var p = it.p;
    var art = el("article", "scent");
    art.id = "scent-" + it.id;                       // deep-link target (the hero's "In the film" links)
    art.setAttribute("data-id", it.id);
    art.style.setProperty("--tone", it.tone);

    var pic = el("div", "scent-pic");
    var plate = el("div", "scent-plate");
    var img = el("img", "scent-img");
    img.src = PLATES && PLATES[it.id] ? PLATES[it.id] : "assets/images/scents/" + it.id + ".webp";
    img.width = 1050; img.height = 1400;
    img.alt = p.name + " — " + p.notes;
    img.loading = i < 2 ? "eager" : "lazy";
    img.decoding = "async";
    plate.appendChild(img);
    var sheen = el("span", "scent-sheen"); sheen.setAttribute("aria-hidden", "true"); plate.appendChild(sheen);
    pic.appendChild(plate);
    art.appendChild(pic);

    var info = el("div", "scent-info");
    info.appendChild(el("p", "scent-count", pad(i + 1) + " / " + pad(items.length)));
    info.appendChild(el("p", "scent-kind", p.label));
    info.appendChild(el("h3", "scent-name", p.name.replace(/ Room Spray$/, "")));
    info.appendChild(el("p", "scent-notes", p.notes));
    var buy = el("div", "scent-buy");
    buy.appendChild(el("span", "scent-price", "$" + p.price.toFixed(2)));
    var add = el("button", "scent-add", "Add to Cart");
    add.type = "button";
    add.setAttribute("data-add", it.id);
    add.setAttribute("aria-label", "Add to Cart: " + p.name);
    buy.appendChild(add);
    info.appendChild(buy);
    art.appendChild(info);
    host.appendChild(art);
    return art;
  });

  /* ---------- sound: two music players crossfade so the loop has no gap ---------- */
  var MUSIC = 0.2, DUCK = 0.06;
  var on = false, active = false;
  var music = [new Audio(AUDIO + "music.mp3"), new Audio(AUDIO + "music.mp3")], mi = 0;
  music.forEach(function (a) { a.preload = "none"; a.volume = 0; a.loop = false; });
  var voices = {};
  function voice(id) { if (!voices[id]) { var a = new Audio(AUDIO + id + ".mp3"); a.preload = "auto"; voices[id] = a; } return voices[id]; }
  var targets = new Map();
  function fadeTo(a, v) { targets.set(a, v); }
  var speaking = null;
  setInterval(function () {
    if (on && active) {
      var cur = music[mi];
      if (cur.duration && cur.currentTime > cur.duration - 1.6) {          // start the other copy and crossfade
        var nx = music[1 - mi]; nx.currentTime = 0; nx.volume = 0; nx.play().catch(function () {}); fadeTo(cur, 0); mi = 1 - mi;
      }
      fadeTo(music[mi], speaking ? DUCK : MUSIC);
    }
    targets.forEach(function (v, a) {
      var d = v - a.volume;
      if (Math.abs(d) < 0.012) { a.volume = v; if (v === 0 && !a.paused) a.pause(); }
      else a.volume = Math.max(0, Math.min(1, a.volume + (d > 0 ? 0.012 : -0.012)));
    });
  }, 50);

  /* ---------- the fixed UI: caption + sound button, shown only while the scents are on screen ---------- */
  var ui = el("div", "scents-ui");
  var cap = el("p", "scents-caption"); cap.setAttribute("role", "status"); cap.setAttribute("aria-live", "polite");
  cap.appendChild(el("span", "scents-cap-k", "Narration"));
  var capText = el("span", "scents-cap-t"); cap.appendChild(capText);
  ui.appendChild(cap);
  var wrap = el("div", "scents-sound-wrap");
  var hint = el("p", "scents-hint", "Turn on sound for music and the voice");
  wrap.appendChild(hint);
  var btn = el("button", "scents-sound"); btn.type = "button"; btn.setAttribute("aria-pressed", "false"); btn.setAttribute("aria-label", "Turn sound on");
  btn.innerHTML =
    '<svg class="i-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/></svg>' +
    '<svg class="i-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>' +
    '<span class="lbl">Sound on</span>';
  wrap.appendChild(btn);
  ui.appendChild(wrap);
  section.appendChild(ui);   // inside the section's landmark (fixed positioning still pins it to the screen)
  setTimeout(function () { hint.classList.add("fade"); }, 12000);

  var capTimer;
  function caption(text, ms) {
    capText.textContent = text;
    cap.classList.add("show");
    clearTimeout(capTimer);
    capTimer = setTimeout(function () { cap.classList.remove("show"); }, ms || 7000);
  }

  /* ---------- narration ---------- */
  var focused = null, lastSaid = null, settle, speakingId = null;
  function hush() {   // stop the voice mid-line (the scent it is about has left the screen, or another is up)
    if (speaking) { speaking.pause(); speaking = null; }
    speakingId = null;
  }
  function say(id) {
    var text = id === "welcome" ? WELCOME : VOICE[id].line;
    hush();
    scents.forEach(function (s) { s.classList.toggle("lit", s.getAttribute("data-id") === id); });
    if (!on) { caption(text, 6500); return; }
    var a = voice(id);
    a.currentTime = 0; speaking = a; speakingId = id;
    a.onended = function () { if (speaking === a) { speaking = null; speakingId = null; } };
    a.play().catch(function () { if (speaking === a) { speaking = null; speakingId = null; } });
    caption(text, a.duration ? a.duration * 1000 + 900 : 9500);
  }
  // A scent has to rest in view for a moment before it speaks, so a fast scroll doesn't stutter through nine voices.
  function focus(id) {
    focused = id;
    clearTimeout(settle);
    if (!id || id === lastSaid) return;
    settle = setTimeout(function () { if (focused === id) { lastSaid = id; say(id); } }, 450);
  }

  function setSound(next, quiet) {
    on = next;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
    btn.querySelector(".lbl").textContent = on ? "Sound off" : "Sound on";
    hint.classList.add("fade");
    if (on) {
      // one sound at a time on the page: the hero film goes quiet when the scents speak
      document.dispatchEvent(new CustomEvent("soc:sound", { detail: { source: "scents" } }));
      items.forEach(function (it) { voice(it.id); }); voice("welcome");   // warm the cache
      var m = music[mi]; m.volume = 0; m.play().catch(function () {}); fadeTo(m, MUSIC);
      lastSaid = focused;
      say(focused || "welcome");
    } else {
      if (speaking) { speaking.pause(); speaking = null; }
      music.forEach(function (a) { fadeTo(a, 0); });
      if (!quiet) cap.classList.remove("show");
    }
  }
  btn.addEventListener("click", function () { setSound(!on); });
  document.addEventListener("soc:sound", function (e) {
    if (on && e.detail && e.detail.source !== "scents") setSound(false, true);
  });

  /* ---------- the section's presence: music and the UI only while the scents are on screen ---------- */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      active = es[0].isIntersecting;
      ui.classList.toggle("show", active);
      if (!active) { music.forEach(function (a) { fadeTo(a, 0); }); }
      else if (on) { var m = music[mi]; if (m.paused) m.play().catch(function () {}); }
    }, { threshold: 0, rootMargin: "-20% 0px -20% 0px" }).observe(section);

    // drift in once a third of the scent is on screen
    var reveal = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); reveal.unobserve(e.target); } }); }, { threshold: 0.3 });
    scents.forEach(function (s) { reveal.observe(s); });
  } else {
    active = true; ui.classList.add("show");
    scents.forEach(function (s) { s.classList.add("in"); });
  }

  /* ---------- which scent is on screen ----------
     The voice is always about the scent whose centre is nearest the middle of the screen, and only
     once that centre is inside the middle 70% of the screen (so the scent above has mostly gone). If
     the shopper scrolls on while a line is still playing, the line stops the moment its scent has
     mostly left the screen, so the voice never describes a candle that is no longer in view.
     The same pass sets the depth drift: the picture moves at 88% of the page's speed, the words at 100%. */
  var ticking = false;
  function track() {
    var mid = innerHeight / 2, near = null, nearD = Infinity, spoken = null;
    scents.forEach(function (s) {
      var r = s.getBoundingClientRect();
      var d = r.top + r.height / 2 - mid;                  // px from the screen's middle
      if (!reduce && r.bottom > -200 && r.top < innerHeight + 200) s.querySelector(".scent-pic").style.setProperty("--drift", (d * 0.12).toFixed(1) + "px");
      if (Math.abs(d) < nearD) { nearD = Math.abs(d); near = s; }
      if (s.getAttribute("data-id") === speakingId) spoken = d;
    });
    focus(near && nearD < innerHeight * 0.35 ? near.getAttribute("data-id") : null);
    if (spoken !== null && Math.abs(spoken) > innerHeight * 0.6) {
      hush(); cap.classList.remove("show");
      scents.forEach(function (s) { s.classList.remove("lit"); });
      lastSaid = null;                                     // coming back to it later should say the line again
    }
    ticking = false;
  }
  addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(track); } }, { passive: true });
  addEventListener("resize", track);
  track();
})();
