/* Secrets of Cint — scroll shop sample: Current. Runs after shop.js.
   Scrolling down carries the products sideways in a slow stream; each pauses in the middle
   while the voice speaks, bobbing gently like something floating, then drifts on. */
(function () {
  var S = window.SOC_SHOP, P = S.products, n = P.length;
  var track = document.getElementById("track"), stream = document.getElementById("stream"), bar = document.getElementById("bar");
  track.style.setProperty("--n", n + 0.5);
  var items = P.map(function (p, i) {
    var el = document.createElement("article"); el.className = "item";
    el.innerHTML = S.plateHTML(p, "ivory", i < 2) + '<div class="info">' + S.infoHTML(p) + '</div>';
    stream.appendChild(el); return el;
  });
  S.onSay(function (id) { items.forEach(function (el, i) { el.classList.toggle("lit", P[i].id === id); }); });
  if (S.reduce) { S.focus(P[0].id); return; }
  var current = -1, lastY = scrollY, vel = 0;
  // each product owns one unit of scroll; it holds in the middle for the central 40% of its unit, then slides
  function place(d) { var hold = 0.2; return d > hold ? d - hold : d < -hold ? d + hold : 0; }
  function render() {
    var pos = (scrollY - track.offsetTop) / (innerHeight * 0.9);
    pos = Math.max(-0.4, Math.min(n - 0.6, pos));
    var W = innerWidth * (innerWidth < 760 ? 1.35 : 1);      // on phones the neighbours wait further out, off the edges
    items.forEach(function (el, i) {
      var d = i - pos;                                       // positive: still to come (right); negative: gone (left)
      var x = place(d) * W * 0.85;
      var vis = Math.max(0, 1 - Math.abs(place(d)) * 1.1);
      var k = 0.82 + 0.18 * vis;
      var bob = Math.sin((pos - i) * Math.PI * 1.6 + i) * 10 * (1 - vis) ;   // gentle rise and fall while travelling
      var tilt = Math.max(-5, Math.min(5, -vel * 0.02)) * (1 - vis * 0.6);     // leans into the direction of travel
      el.style.transform = "translate(calc(-50% + " + x.toFixed(1) + "px), calc(-50% + " + bob.toFixed(1) + "px)) scale(" + k.toFixed(3) + ") rotate(" + tilt.toFixed(2) + "deg)";
      el.style.opacity = Math.max(0, Math.min(1, vis + 0.08));
      el.style.pointerEvents = vis > 0.6 ? "auto" : "none";
    });
    bar.style.width = (Math.max(0, Math.min(1, (pos + 0.4) / (n - 0.2))) * 100) + "%";
    var idx = Math.round(pos);
    // the voice waits until the first scent has actually arrived, not while the title is still up
    if (pos > -0.25 && idx >= 0 && idx < n && idx !== current) { current = idx; S.focus(P[idx].id); }
  }
  var ticking = false;
  addEventListener("scroll", function () {
    vel = vel * 0.6 + (scrollY - lastY) * 0.4; lastY = scrollY;
    if (!ticking) { ticking = true; requestAnimationFrame(function () { render(); ticking = false; }); }
  }, { passive: true });
  // let the tilt settle back when scrolling stops
  setInterval(function () { if (Math.abs(vel) > 0.5) { vel *= 0.85; render(); } }, 60);
  addEventListener("resize", render);
  render();
})();
