/* Secrets of Cint — scroll shop sample: Stage. Runs after shop.js.
   The stage is pinned; scrolling raises the next product into the light as the last sinks away. */
(function () {
  var S = window.SOC_SHOP, P = S.products, n = P.length;
  var track = document.getElementById("track"), pics = document.getElementById("pics"), infos = document.getElementById("infos"), dots = document.getElementById("dots"), spot = document.getElementById("spot");
  track.style.setProperty("--n", n + 0.6);
  P.forEach(function (p, i) {
    var wrap = document.createElement("div"); wrap.className = "pw"; wrap.innerHTML = S.plateHTML(p, "night", i < 2); pics.appendChild(wrap);
    var card = document.createElement("div"); card.className = "card"; card.innerHTML = S.infoHTML(p); infos.appendChild(card);
    var b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", p.name + " " + p.kind.toLowerCase()); b.innerHTML = "<i></i>";
    b.addEventListener("click", function () { window.scrollTo({ top: track.offsetTop + i * innerHeight + 2, behavior: S.reduce ? "auto" : "smooth" }); });
    dots.appendChild(b);
  });
  var plates = pics.querySelectorAll(".pw"), cards = infos.querySelectorAll(".card"), btns = dots.querySelectorAll("button");
  S.onSay(function (id) { plates.forEach(function (w, i) { w.classList.toggle("lit", P[i].id === id); }); });
  if (S.reduce) { S.focus(P[0].id); return; }
  var current = -1;
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function render() {
    var pos = (scrollY - track.offsetTop) / innerHeight;           // 0 at the first product, n-1 at the last
    pos = Math.max(0, Math.min(n - 1, pos));
    var idx = Math.round(pos);
    for (var i = 0; i < n; i++) {
      var d = pos - i;                                               // -1 … 0 … 1 : arriving … in the light … leaving
      var a = Math.max(0, 1 - Math.abs(d));
      // the last scent is almost gone before the next one appears: a short, faint hand-off, never two in the light
      var k = a > 0.35 ? ease((a - 0.35) / 0.65) : 0;
      // arriving: rises from well below, slightly small and turned; leaving: keeps rising and is gone
      // before the next one is bright, so two scents are never both in the light
      plates[i].style.opacity = k * k;
      plates[i].style.transform = "translateY(" + (-d * 150) + "px) scale(" + (0.88 + 0.12 * k) + ") rotate(" + (-d * 4) + "deg)";
      cards[i].style.opacity = k * k * k;
      cards[i].style.transform = "translateY(" + (-d * 40) + "px)";
      plates[i].style.pointerEvents = cards[i].style.pointerEvents = a > 0.5 ? "auto" : "none";
    }
    // the voice waits until the stage itself is on screen, not while the title is still up
    if (scrollY < track.offsetTop - innerHeight * 0.5) return;
    if (idx !== current) {
      current = idx;
      spot.style.setProperty("--tone", P[idx].tone);
      btns.forEach(function (b, j) { b.setAttribute("aria-current", j === idx ? "true" : "false"); });
      S.focus(P[idx].id);
    }
  }
  var ticking = false;
  addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { render(); ticking = false; }); } }, { passive: true });
  addEventListener("resize", render);
  render();
})();
