/* Secrets of Cint — scroll shop sample: current. Runs after shop.js. */
(function () {
  var S = window.SOC_SHOP, P = S.products, n = P.length;
  var track = document.getElementById("track"), stream = document.getElementById("stream"), bar = document.getElementById("bar");
  track.style.setProperty("--n", n + 0.5);
  var items = P.map(function (p, i) {
    var el = document.createElement("article"); el.className = "item";
    el.innerHTML = '<img src="img/' + p.id + '.webp" alt="' + p.name + ' — ' + p.notes + '" loading="' + (i < 2 ? "eager" : "lazy") + '" /><div class="info">' + S.infoHTML(p) + '</div>';
    stream.appendChild(el); return el;
  });
  if (S.reduce) { S.focus(P[0].id); return; }
  var current = -1;
  // position along the stream: each product owns one unit; it pauses (holds) for the middle 40% of its unit
  function place(d) {           // d: distance from "my turn", in units
    var hold = 0.2;
    var x = d > hold ? (d - hold) : d < -hold ? (d + hold) : 0;   // 0 while holding, then slides
    return x;
  }
  function render() {
    var pos = (scrollY - track.offsetTop) / (innerHeight * 0.9);
    pos = Math.max(-0.4, Math.min(n - 0.6, pos));
    var W = innerWidth * (innerWidth < 760 ? 1.35 : 1);      // on phones the neighbours wait further out, off the edges
    items.forEach(function (el, i) {
      var d = i - pos;                                       // positive: still to come (right); negative: gone (left)
      var x = place(d) * W * 0.85;
      var vis = Math.max(0, 1 - Math.abs(place(d)) * 1.1);
      var k = 0.82 + 0.18 * vis;
      el.style.transform = "translate(calc(-50% + " + x + "px), -50%) scale(" + k + ")";
      el.style.opacity = Math.max(0.0, Math.min(1, vis + 0.08));
      el.style.pointerEvents = vis > 0.6 ? "auto" : "none";
    });
    bar.style.width = (Math.max(0, Math.min(1, (pos + 0.4) / (n - 0.2))) * 100) + "%";
    var idx = Math.round(pos);
    if (idx >= 0 && idx < n && idx !== current) { current = idx; S.focus(P[idx].id); }
  }
  var ticking = false;
  addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { render(); ticking = false; }); } }, { passive: true });
  addEventListener("resize", render);
  render();
})();
