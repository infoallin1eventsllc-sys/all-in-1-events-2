/* =============================================================
   Secrets of Cint — scroll shop samples: shared catalogue, sound, captions, cart.
   Every sample page calls SOC_SHOP.focus(id) when a product settles in view.
   Sound starts only from the Sound button (browsers block audio until the
   shopper interacts). Music loops softly and ducks under the narration; a
   caption shows each line whether sound is on or off.
   ============================================================= */
(function () {
  "use strict";

  var PRODUCTS = [
    { id: "moon-flower", name: "Moon Flower", kind: "Signature Candle", notes: "Bergamot · Leather · Labdanum", price: 35, tone: "#8c1906",
      line: "Moon Flower. Our signature. Bright bergamot, wrapped in soft leather and warm labdanum. Moody, and magnetic." },
    { id: "brewed-elixir", name: "Brewed Elixir", kind: "Signature Candle", notes: "Coffee · Hazelnut · Vanilla", price: 35, tone: "#917057",
      line: "Brewed Elixir. Fresh coffee, toasted hazelnut, and a soft swirl of vanilla. Two wicks, hand-poured in soy." },
    { id: "inferno-dreams", name: "Inferno Dreams", kind: "Signature Candle", notes: "Saffron · Sandalwood · Embers", price: 35, tone: "#8e8375",
      line: "Inferno Dreams. Saffron and sandalwood, with the warm glow of embers. Made for late nights." },
    { id: "exotic-peach-spray", name: "Exotic Peach", kind: "Room Spray", notes: "Peach · Coconut · Mango", price: 22, tone: "#c78d46",
      line: "Exotic Peach room spray. Ripe peach, creamy coconut, and mango. A spritz of summer, any time of year." },
    { id: "amber-blush-spray", name: "Amber Blush", kind: "Room Spray", notes: "Vanilla · White Amber · Jasmine", price: 22, tone: "#8a5d3d",
      line: "Amber Blush. Vanilla, white amber, and jasmine. Soft, warm, and a little bit romantic." },
    { id: "citrus-grove", name: "No.7 Citrus Grove", kind: "Reed Diffuser", notes: "Citrus · Green Vetiver · Amber", price: 28, tone: "#a6a192",
      line: "Number Seven, Citrus Grove. Bright citrus over green vetiver and amber. Fragrance all day, no flame needed." }
  ];
  var WELCOME = "Welcome to Secrets of Cint. Just scroll, and let the collection come to you.";
  var BY_ID = {}; PRODUCTS.forEach(function (p) { BY_ID[p.id] = p; });
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- audio: two music players crossfade so the loop has no gap ---------- */
  var MUSIC = 0.2, DUCK = 0.06;
  var on = false, music = [new Audio("audio/music.mp3"), new Audio("audio/music.mp3")], mi = 0;
  music.forEach(function (a) { a.preload = "auto"; a.volume = 0; });
  var voices = {};
  function voice(id) { if (!voices[id]) { var a = new Audio("audio/" + id + ".mp3"); a.preload = "auto"; voices[id] = a; } return voices[id]; }
  var targets = new Map();
  function fadeTo(a, v) { targets.set(a, v); }
  var speaking = null;
  setInterval(function () {
    if (on) {
      var cur = music[mi];
      if (cur.duration && cur.currentTime > cur.duration - 1.6) {        // start the other copy and crossfade
        var nx = music[1 - mi]; nx.currentTime = 0; nx.volume = 0; nx.play().catch(function () {});
        fadeTo(cur, 0); mi = 1 - mi;
      }
      fadeTo(music[mi], speaking ? DUCK : MUSIC);
    }
    targets.forEach(function (v, a) {
      var d = v - a.volume;
      if (Math.abs(d) < 0.012) { a.volume = v; if (v === 0 && !a.paused) a.pause(); }
      else a.volume = Math.max(0, Math.min(1, a.volume + (d > 0 ? 0.012 : -0.012)));
    });
  }, 50);

  /* ---------- captions ---------- */
  var cap, capText, capTimer;
  function caption(text, ms) {
    if (!cap) return;
    capText.textContent = text;
    cap.classList.add("show");
    clearTimeout(capTimer);
    capTimer = setTimeout(function () { cap.classList.remove("show"); }, ms || 7000);
  }

  /* ---------- narration ---------- */
  var focused = null, lastSaid = null, settle;
  function say(id) {
    var text = id === "welcome" ? WELCOME : BY_ID[id].line;
    if (speaking) { speaking.pause(); speaking = null; }
    if (!on) { caption(text, 6500); return; }
    var a = voice(id);
    a.currentTime = 0; speaking = a;
    a.onended = function () { if (speaking === a) speaking = null; };
    a.play().catch(function () { speaking = null; });
    caption(text, a.duration ? a.duration * 1000 + 900 : 9500);
  }
  // A product has to rest in view for a moment before it speaks, so a fast scroll doesn't stutter through six voices.
  function focus(id) {
    focused = id;
    clearTimeout(settle);
    if (!id || id === lastSaid) return;
    settle = setTimeout(function () { if (focused === id) { lastSaid = id; say(id); } }, 450);
  }

  /* ---------- sound button ---------- */
  var btn, hint;
  function setSound(next) {
    on = next;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.querySelector(".lbl").textContent = on ? "Sound off" : "Sound on";
    if (hint) { hint.remove(); hint = null; }
    if (on) {
      PRODUCTS.forEach(function (p) { voice(p.id); }); voice("welcome");   // warm the cache
      var m = music[mi]; m.volume = 0; m.play().catch(function () {}); fadeTo(m, MUSIC);
      lastSaid = focused;
      say(focused || "welcome");
    } else {
      if (speaking) { speaking.pause(); speaking = null; }
      music.forEach(function (a) { fadeTo(a, 0); });
    }
  }

  /* ---------- cart (sample) ---------- */
  var count = 0, toastEl, toastTimer;
  function add(id) {
    count += 1;
    document.querySelectorAll("[data-cart-count]").forEach(function (n) { n.textContent = String(count); });
    toastEl.textContent = BY_ID[id].name + " added to the sample cart";
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2400);
  }

  function mount() {
    var ui = document.createElement("div");
    ui.className = "ss-ui";
    ui.innerHTML =
      '<p class="ss-caption" role="status" aria-live="polite"><span class="ss-cap-k">Narration</span><span class="ss-cap-t"></span></p>' +
      '<div class="ss-sound-wrap">' +
        '<p class="ss-hint">Turn on sound for music and narration</p>' +
        '<button type="button" class="ss-sound" aria-pressed="false">' +
          '<svg class="i-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/></svg>' +
          '<svg class="i-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>' +
          '<span class="lbl">Sound on</span></button>' +
      '</div>' +
      '<p class="ss-toast" role="status" aria-live="polite"></p>';
    document.body.appendChild(ui);
    cap = ui.querySelector(".ss-caption"); capText = ui.querySelector(".ss-cap-t");
    btn = ui.querySelector(".ss-sound"); hint = ui.querySelector(".ss-hint");
    toastEl = ui.querySelector(".ss-toast");
    btn.addEventListener("click", function () { setSound(!on); });
    setTimeout(function () { if (hint) hint.classList.add("fade"); }, 9000);
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-add]"); if (b) add(b.getAttribute("data-add"));
    });
  }

  // Product markup shared by the samples (real DOM: headings, prices and buttons, not pictures of them)
  function infoHTML(p, headingTag) {
    var h = headingTag || "h2";
    return '<p class="ss-kind">' + p.kind + '</p><' + h + ' class="ss-name">' + p.name + '</' + h + '>' +
      '<p class="ss-notes">' + p.notes + '</p>' +
      '<div class="ss-buy"><span class="ss-price">$' + p.price.toFixed(2) + '</span>' +
      '<button type="button" class="ss-add" data-add="' + p.id + '">Add to Cart</button></div>';
  }

  window.SOC_SHOP = { products: PRODUCTS, reduce: reduce, focus: focus, infoHTML: infoHTML, add: add };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
