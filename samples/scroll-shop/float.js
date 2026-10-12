/* Secrets of Cint — scroll shop sample: float. Runs after shop.js. */
(function () {
  var S = window.SOC_SHOP, host = document.getElementById("products");
  S.products.forEach(function (p, i) {
    var sec = document.createElement("section");
    sec.className = "float"; sec.style.setProperty("--tone", p.tone); sec.setAttribute("data-id", p.id);
    sec.innerHTML = '<div class="glow"></div>' +
      '<div class="pic"><img src="img/' + p.id + '.webp" alt="' + p.name + ' — ' + p.notes + '" loading="' + (i < 2 ? "eager" : "lazy") + '" /></div>' +
      '<div class="info"><p class="count">' + String(i + 1).padStart(2, "0") + ' / ' + String(S.products.length).padStart(2, "0") + '</p>' + S.infoHTML(p) + '</div>';
    host.appendChild(sec);
  });
  var secs = host.querySelectorAll(".float");
  // drift in once a third of the section is on screen
  var reveal = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); reveal.unobserve(e.target); } }); }, { threshold: 0.3 });
  // the product crossing the middle of the screen is the one being talked about
  var middle = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) S.focus(e.target.getAttribute("data-id")); }); }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
  secs.forEach(function (s) { reveal.observe(s); middle.observe(s); });
})();
