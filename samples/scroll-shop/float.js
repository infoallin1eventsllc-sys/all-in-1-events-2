/* Secrets of Cint — scroll shop sample: Float. Runs after shop.js.
   Each product drifts in from alternating sides, settles beside its words, then floats
   a little slower than the page as it scrolls by (depth), with a light sweep as it lands. */
(function () {
  var S = window.SOC_SHOP, host = document.getElementById("products");
  S.products.forEach(function (p, i) {
    var sec = document.createElement("section");
    sec.className = "float"; sec.setAttribute("data-id", p.id);
    sec.innerHTML = '<div class="pic">' + S.plateHTML(p, "night", i < 2) + '</div>' +
      '<div class="info"><p class="count">' + String(i + 1).padStart(2, "0") + ' / ' + String(S.products.length).padStart(2, "0") + '</p>' + S.infoHTML(p) + '</div>';
    host.appendChild(sec);
  });
  var secs = [].slice.call(host.querySelectorAll(".float"));
  // drift in once a third of the section is on screen; the plate lights up when it is the one being talked about
  var reveal = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); reveal.unobserve(e.target); } }); }, { threshold: 0.3 });
  var middle = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) S.focus(e.target.getAttribute("data-id")); }); }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
  secs.forEach(function (s) { reveal.observe(s); middle.observe(s); });
  S.onSay(function (id) { secs.forEach(function (s) { s.classList.toggle("lit", s.getAttribute("data-id") === id); }); });
  if (S.reduce) return;
  // depth: the plate moves at 88% of the page's speed while the words move at 100%
  var ticking = false;
  function drift() {
    var mid = innerHeight / 2;
    secs.forEach(function (s) {
      var r = s.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) return;
      var d = (r.top + r.height / 2 - mid);                 // px from the screen's middle
      s.querySelector(".pic").style.setProperty("--drift", (d * 0.12).toFixed(1) + "px");
    });
    ticking = false;
  }
  addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(drift); } }, { passive: true });
  drift();
})();
