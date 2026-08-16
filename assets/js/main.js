/* =============================================================
   Secrets of Cint — front-end interactions
   Vanilla JS, no dependencies. XSS-safe (textContent / DOM API).
   ============================================================= */
(function () {
  "use strict";

  /* ---------- Product catalogue ---------- */
  var PRODUCTS = [
    { id: "harlem-smock-santal", name: "Harlem Smock Santal", cat: "candles", label: "Candle",
      notes: "Sandalwood · Vetiver · Smoked Santal", price: 34, rating: 4.9, reviews: 48,
      img: "harlem-smock-santal.jpg", badge: "best" },
    { id: "exotic-peach-spray", name: "Exotic Peach Spray", cat: "sprays", label: "Room Spray",
      notes: "Juicy Peach · Coconut · Sweet Mango", price: 22, rating: 5.0, reviews: 36,
      img: "exotic-peach-spray.jpg", badge: "best" },
    { id: "juneteenth-freedom-day", name: "Juneteenth Freedom Day", cat: "heritage", label: "Heritage",
      notes: "Hibiscus · Red Currant · Smoked Mahogany", price: 38, rating: 5.0, reviews: 52,
      img: "juneteenth-freedom.jpg", badge: "ltd" },
    { id: "damn-that-candle-smell-good", name: "Damn That Candle Smell Good", cat: "candles", label: "Candle",
      notes: "Amber · Smoked Vanilla · Oak", price: 34, rating: 4.9, reviews: 64,
      img: "damn-that-candle.jpg", badge: "best" },
    { id: "sugar-hill-velvet", name: "Sugar Hill Velvet", cat: "heritage", label: "Heritage",
      notes: "Plum Nectar · Dark Musk · Vintage Leather", price: 36, rating: 4.8, reviews: 29,
      img: "sugar-hill-velvet.jpg", badge: "new" },
    { id: "uptown-citrus-basil", name: "Uptown Citrus & Basil", cat: "sprays", label: "Room Spray",
      notes: "Ruby Grapefruit · Wild Basil · Bergamot", price: 22, rating: 4.9, reviews: 21,
      img: "uptown-citrus-basil.jpg", badge: null },
    { id: "brownstone-smoked-cedar", name: "Brownstone Smoked Cedar", cat: "candles", label: "Candle",
      notes: "Smoked Birch · Cedarwood · Bourbon Vanilla", price: 36, rating: 4.9, reviews: 31,
      img: "brownstone-smoked-cedar.jpg", badge: null },
    { id: "apollo-glow", name: "Apollo Glow", cat: "heritage", label: "Heritage",
      notes: "Eucalyptus · Incense · Bergamot Zest", price: 38, rating: 5.0, reviews: 19,
      img: "apollo-glow.jpg", badge: "ltd" }
  ];

  var REVIEWS = [
    { author: "Marcus T.", loc: "Harlem, NY", title: "The Santal scent is out of this world!",
      body: "I live 4 blocks from Lenox Ave and bought Harlem Smock Santal. The hot throw fills my entire apartment within 15 minutes. Quality is unbelievable." },
    { author: "Kendra W.", loc: "Brooklyn, NY", title: "This peach spray smells SO good!",
      body: "Two spritzes of Exotic Peach on my sofa linen and it literally lasts all day. The mango and coconut blend is perfection." },
    { author: "Darnell R.", loc: "Atlanta, GA", title: "Honoring history with pure luxury",
      body: "The Juneteenth candle with the crackling wood wick and gold-leaf dusting is pure art. Smoked mahogany with tart hibiscus is unlike anything else." },
    { author: "Aaliyah M.", loc: "Philadelphia, PA", title: "Living up to its name!",
      body: "Every guest who walked in asked “What is that candle?!” I smiled and pointed at Secrets of Cint. Ordering 3 more right now." }
  ];

  var BADGE_TEXT = { best: "Best Seller", ltd: "Limited", new: "New" };

  /* ---------- Helpers ---------- */
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function svg(paths, w) {
    var s = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="' + (w || 15) + '" height="' + (w || 15) + '">' + paths + '</svg>';
    return s;
  }
  var ICON_CART = '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>';
  var ICON_HEART = '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"/>';
  var ICON_CHECK = '<path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5Z"/><path d="m9 12 2 2 4-4"/>';

  /* ---------- Cart state (demo) ---------- */
  var cart = 0;
  var cartCountEl = document.getElementById("cartCount");
  function addToCart(id) {
    var p = PRODUCTS.find(function (x) { return x.id === id; });
    cart += 1;
    cartCountEl.textContent = String(cart);
    cartCountEl.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.5)" }, { transform: "scale(1)" }],
      { duration: 360, easing: "ease-out" }
    );
    showToast((p ? p.name : "Item") + " added to cart");
  }

  /* ---------- Toast ---------- */
  var toast = document.getElementById("toast");
  var toastMsg = document.getElementById("toastMsg");
  var toastTimer;
  function showToast(msg) {
    toastMsg.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2600);
  }

  /* ---------- Render products ---------- */
  var grid = document.getElementById("productGrid");
  function starStr(r) { return "★★★★★"; }

  function buildCard(p) {
    var card = el("article", "card");
    card.setAttribute("data-cat", p.cat);

    var media = el("div", "card-media");
    var img = el("img");
    img.src = "assets/images/" + p.img;
    img.alt = p.name + " — " + p.notes;
    img.loading = "lazy";
    img.width = 1000; img.height = 1000;
    media.appendChild(img);

    if (p.badge) {
      var badges = el("div", "card-badges");
      var b = el("span", "badge " + p.badge);
      b.textContent = BADGE_TEXT[p.badge];
      badges.appendChild(b);
      media.appendChild(badges);
    }

    var fav = el("button", "card-fav");
    fav.setAttribute("aria-label", "Save " + p.name + " to wishlist");
    fav.innerHTML = svg(ICON_HEART, 17);
    fav.addEventListener("click", function () {
      fav.classList.toggle("on");
      showToast(fav.classList.contains("on") ? "Saved to wishlist" : "Removed from wishlist");
    });
    media.appendChild(fav);
    card.appendChild(media);

    var body = el("div", "card-body");
    var cat = el("span", "card-cat"); cat.textContent = p.label; body.appendChild(cat);
    var h3 = el("h3"); h3.textContent = p.name; body.appendChild(h3);
    var notes = el("p", "notes"); notes.textContent = p.notes; body.appendChild(notes);

    var meta = el("div", "card-meta");
    var price = el("span", "price"); price.textContent = "$" + p.price.toFixed(2);
    var rate = el("span", "rate");
    rate.innerHTML = '<span class="s">★</span> ' + p.rating.toFixed(1) + " (" + p.reviews + ")";
    meta.appendChild(price); meta.appendChild(rate);
    body.appendChild(meta);

    var add = el("button", "card-add");
    add.innerHTML = svg(ICON_CART, 15) + "<span>Add to Cart</span>";
    add.addEventListener("click", function () { addToCart(p.id); });
    body.appendChild(add);

    card.appendChild(body);
    return card;
  }

  function renderProducts(filter) {
    grid.textContent = "";
    PRODUCTS.forEach(function (p) {
      if (filter && filter !== "all" && p.cat !== filter) return;
      grid.appendChild(buildCard(p));
    });
    // re-observe newly added cards for reveal
    observeReveals();
  }

  /* ---------- Render reviews ---------- */
  var reviewsGrid = document.getElementById("reviewsGrid");
  function renderReviews() {
    REVIEWS.forEach(function (r) {
      var card = el("article", "review reveal");
      var stars = el("div", "stars"); stars.textContent = "★★★★★"; card.appendChild(stars);
      var h4 = el("h4"); h4.textContent = r.title; card.appendChild(h4);
      var body = el("p", "body"); body.textContent = "“" + r.body + "”"; card.appendChild(body);

      var verified = el("span", "verified");
      verified.innerHTML = svg(ICON_CHECK, 14) + " Verified Buyer";
      card.appendChild(verified);

      var who = el("div", "who");
      var av = el("div", "avatar"); av.textContent = r.author.charAt(0); who.appendChild(av);
      var m = el("div", "meta");
      var nm = el("div", "nm"); nm.textContent = r.author; m.appendChild(nm);
      var lo = el("div", "lo"); lo.textContent = r.loc; m.appendChild(lo);
      who.appendChild(m);
      card.appendChild(who);

      reviewsGrid.appendChild(card);
    });
  }

  /* ---------- Filters ---------- */
  var filters = document.getElementById("filters");
  filters.addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (!chip) return;
    filters.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");
    renderProducts(chip.getAttribute("data-filter"));
  });

  /* ---------- Spotlight add button ---------- */
  document.querySelectorAll("[data-add]").forEach(function (btn) {
    btn.addEventListener("click", function () { addToCart(btn.getAttribute("data-add")); });
  });
  document.getElementById("cartBtn").addEventListener("click", function () {
    showToast(cart > 0 ? "You have " + cart + " item" + (cart > 1 ? "s" : "") + " in your cart" : "Your cart is empty — start with our Signature");
  });

  /* ---------- Reveal on scroll ---------- */
  var revealObserver;
  function observeReveals() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal").forEach(function (n) { n.classList.add("in"); });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    }
    document.querySelectorAll(".reveal:not(.in)").forEach(function (n) { revealObserver.observe(n); });
  }

  /* ---------- Header scroll state ---------- */
  var header = document.getElementById("header");
  function onScroll() {
    if (window.scrollY > 12) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Marquee: duplicate track for seamless loop ---------- */
  var marquee = document.getElementById("marquee");
  if (marquee) { marquee.innerHTML += marquee.innerHTML; }

  /* ---------- Mobile nav ---------- */
  var mNav = document.getElementById("mobileNav");
  function setNav(open) {
    mNav.classList.toggle("open", open);
    mNav.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
  }
  document.getElementById("hamburger").addEventListener("click", function () { setNav(true); });
  document.getElementById("mClose").addEventListener("click", function () { setNav(false); });
  mNav.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setNav(false); }); });

  /* ---------- Newsletter ---------- */
  var newsForm = document.getElementById("newsForm");
  newsForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("newsEmail");
    var val = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      email.focus();
      showToast("Please enter a valid email address");
      return;
    }
    newsForm.style.display = "none";
    document.getElementById("newsOk").classList.add("show");
    showToast("You're on the list ✦");
  });

  /* ---------- Init ---------- */
  document.getElementById("year").textContent = String(new Date().getFullYear());
  renderProducts("all");
  renderReviews();
  observeReveals();
  onScroll();
})();
