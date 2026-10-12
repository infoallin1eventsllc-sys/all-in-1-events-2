/* Secrets of Cint — scroll shop sample: stage. Runs after shop.js. */
(function () {
  var S = window.SOC_SHOP, P = S.products, n = P.length;
  var track = document.getElementById("track"), pics = document.getElementById("pics"), infos = document.getElementById("infos"), dots = document.getElementById("dots"), spot = document.getElementById("spot");
  track.style.setProperty("--n", n + 0.6);
  P.forEach(function (p, i) {
    var img = document.createElement("img"); img.src = "img/" + p.id + ".webp"; img.alt = p.name + " — " + p.notes; img.loading = i < 2 ? "eager" : "lazy"; pics.appendChild(img);
    var card = document.createElement("div"); card.className = "card"; card.innerHTML = S.infoHTML(p); infos.appendChild(card);
    var b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", p.name); b.innerHTML = "<i></i>";
    b.addEventListener("click", function () { window.scrollTo({ top: track.offsetTop + i * innerHeight + 2, behavior: S.reduce ? "auto" : "smooth" }); });
    dots.appendChild(b);
  });
  var imgs = pics.querySelectorAll("img"), cards = infos.querySelectorAll(".card"), btns = dots.querySelectorAll("button");
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
      var k = ease(a);
      // d < 0: arriving, rises up from below; d > 0: leaving, keeps rising and fades
      imgs[i].style.opacity = k;
      imgs[i].style.transform = "translateY(" + (-d * 60) + "px) scale(" + (0.86 + 0.14 * k) + ")";
      cards[i].style.opacity = k * k;
      cards[i].style.transform = "translateY(" + (-d * 30) + "px)";
      imgs[i].style.pointerEvents = cards[i].style.pointerEvents = a > 0.5 ? "auto" : "none";
    }
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
