/* =============================================================
   Secrets of Cint — front-end interactions
   Vanilla JS, no dependencies. XSS-safe (textContent / DOM API).
   ============================================================= */
(function () {
  "use strict";

  /* ---------- Owner photo overrides (browser-local, live) ----------
     The Owner Photo Control panel (assets/js/portal.js) writes chosen
     images here so they appear on the site instantly for the owner.
     Applied to any <img data-product="<id>"> and product cards. */
  var SOC = {
    KEY: "soc_photos_v1",
    map: {},
    load: function () { try { this.map = JSON.parse(localStorage.getItem(this.KEY) || "{}"); } catch (e) { this.map = {}; } return this.map; },
    // returns false when the browser refuses to store it (quota), so callers can say so instead of failing silently
    save: function () { try { localStorage.setItem(this.KEY, JSON.stringify(this.map)); return true; } catch (e) { return false; } },
    get: function (id) { return this.map[id]; },
    set: function (id, src) { this.map[id] = src; var ok = this.save(); this.applyOne(id); return ok; },
    remove: function (id) { delete this.map[id]; this.save(); },
    clear: function () { this.map = {}; try { localStorage.removeItem(this.KEY); } catch (e) {} },
    applyOne: function (id) {
      var src = this.map[id];
      if (!src) return;
      var imgs = document.querySelectorAll('img[data-product="' + id + '"]');
      for (var i = 0; i < imgs.length; i++) imgs[i].src = src;
    },
    applyAll: function () { var self = this; Object.keys(this.map).forEach(function (id) { self.applyOne(id); }); }
  };
  SOC.load();
  window.SOC = SOC;

  /* ---------- Product catalogue (Secrets of Cint) ----------
     Names, prices & scent notes match the live store (shop.app / secretsofcint.com).
     Images are the brand's real photos except For Him, Vintage Bloom and Stress
     Relief, which are still placeholders (see CLIENT-APPROVAL-STATUS.md). No ratings
     or review counts are kept here: there are no real reviews to count yet. */
  var PRODUCTS = [
    { id: "harlem-smock", name: "Harlem Smock", cat: "candles", label: "Signature Candle",
      notes: "Santal · Sandalwood · Vetiver", price: 38,
      img: "real-harlem-smock.jpg", badge: "best" },
    { id: "moon-flower", name: "Moon Flower", cat: "candles", label: "Signature Candle",
      notes: "Bergamot · Leather · Labdanum", price: 35,
      img: "moon-flower.jpg", badge: "best" },
    { id: "inferno-dreams", name: "Inferno Dreams", cat: "candles", label: "Signature Candle",
      notes: "Saffron · Sandalwood · Embers", price: 35,
      img: "real-inferno-dreams.jpg", badge: "best" },
    { id: "exotic-peach", name: "Exotic Peach", cat: "candles", label: "Signature Candle",
      notes: "Mango · Coconut · Peach", price: 35,
      img: "real-exotic-peach.jpg", badge: null },
    { id: "brewed-elixir", name: "Brewed Elixir", cat: "candles", label: "Signature Candle",
      notes: "Coffee · Hazelnut · Vanilla", price: 35,
      img: "real-brewed-elixir.jpg", badge: "new" },
    { id: "for-him", name: "For Him", cat: "candles", label: "Signature Candle",
      notes: "Bourbon · Whiskey · Tobacco", price: 35,
      img: "for-him.jpg", badge: null },
    { id: "vintage-bloom", name: "Vintage Bloom", cat: "candles", label: "Signature Candle",
      notes: "Gardenia · Tuberose · Jasmine", price: 33,
      img: "vintage-bloom.jpg", badge: null },
    { id: "stress-relief", name: "Stress Relief", cat: "candles", label: "Signature Candle",
      notes: "Cucumber · Bamboo · Lavender", price: 35,
      img: "stress-relief.jpg", badge: null },
    { id: "exotic-peach-spray", name: "Exotic Peach Room Spray", cat: "sprays", label: "Room Spray",
      notes: "Peach · Coconut · Mango", price: 22,
      img: "real-exotic-peach-spray.jpg", badge: "best" },
    { id: "amber-blush-spray", name: "Amber Blush Room Spray", cat: "sprays", label: "Room Spray",
      notes: "Vanilla · White Amber · Jasmine", price: 22,
      img: "real-amber-blush.jpg", badge: null },
    { id: "stress-relief-spray", name: "Stress Relief Room Spray", cat: "sprays", label: "Room Spray",
      notes: "Cucumber · Lavender · Bamboo", price: 21,
      img: "stress-relief-spray.jpg", badge: null },
    { id: "moon-flower-spray", name: "Moon Flower Room Spray", cat: "sprays", label: "Room Spray",
      notes: "Bergamot · Leather · Labdanum", price: 22,
      img: "real-moon-flower-spray.jpg", badge: null },
    { id: "citrus-grove", name: "No.7 Citrus Grove", cat: "diffusers", label: "Reed Diffuser",
      notes: "Citrus · Green Vetiver · Amber", price: 28,
      img: "real-citrus-grove.jpg", badge: "new" }
  ];

  // Sample reviews. Names and cities are visible fill-in slots, never invented people:
  // the Owner Portal replaces these with real customer reviews.
  var REVIEWS = [
    { author: "[Customer name]", loc: "[City, state]", title: "The Santal scent is out of this world!",
      body: "I picked up Harlem Smock on a whim and the hot throw fills my entire apartment within 15 minutes. Quality is unbelievable." },
    { author: "[Customer name]", loc: "[City, state]", title: "This peach spray smells SO good!",
      body: "Two spritzes of Exotic Peach on my sofa linen and it literally lasts all day. The mango and coconut blend is perfection." },
    { author: "[Customer name]", loc: "[City, state]", title: "Moon Flower is pure luxury",
      body: "Bergamot, soft leather, and labdanum — the black vessel with the wood lid looks incredible on my mantel, too." },
    { author: "[Customer name]", loc: "[City, state]", title: "A brand with real soul",
      body: "You can feel the love and culture poured into every candle. The vessels are reusable and gorgeous. Ordering a few more right now." }
  ];

  var BADGE_TEXT = { best: "Best Seller", ltd: "Seasonal", new: "New Arrival" };

  /* ---------- Helpers ---------- */
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function svg(paths, w) {
    var s = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="' + (w || 15) + '" height="' + (w || 15) + '">' + paths + '</svg>';
    return s;
  }
  var ICON_CART = '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>';
  var ICON_HEART = '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"/>';

  /* ---------- Cart state (demo) ---------- */
  var cart = 0;
  var cartCountEl = document.getElementById("cartCount");
  var cartBtn = document.getElementById("cartBtn");
  function addToCart(id) {
    var p = PRODUCTS.find(function (x) { return x.id === id; });
    cart += 1;
    cartCountEl.textContent = String(cart);
    cartBtn.setAttribute("aria-label", "Cart, " + cart + " item" + (cart === 1 ? "" : "s"));
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
  var favs = {};   // wishlist state lives here, not in the DOM, so it survives filtering
  function buildCard(p) {
    var card = el("article", "card");
    card.id = "p-" + p.id;   // deep-link target (the hero's "In the film" links)
    card.setAttribute("data-cat", p.cat);

    var media = el("div", "card-media");
    var img = el("img");
    img.setAttribute("data-product", p.id);
    img.src = SOC.get(p.id) || ("assets/images/" + p.img);
    img.alt = p.name + " — " + p.notes;
    img.loading = "lazy";
    img.width = 1000; img.height = 1000;
    media.appendChild(img);


    var fav = el("button", "card-fav" + (favs[p.id] ? " on" : ""));
    fav.type = "button";
    fav.setAttribute("aria-label", "Save " + p.name + " to wishlist");
    fav.setAttribute("aria-pressed", favs[p.id] ? "true" : "false");
    fav.innerHTML = svg(ICON_HEART, 17);
    fav.addEventListener("click", function () {
      favs[p.id] = !favs[p.id];
      fav.classList.toggle("on", favs[p.id]);
      fav.setAttribute("aria-pressed", favs[p.id] ? "true" : "false");
      showToast(favs[p.id] ? p.name + " saved to wishlist" : p.name + " removed from wishlist");
    });
    media.appendChild(fav);
    card.appendChild(media);

    var body = el("div", "card-body");
    var cat = el("span", "card-cat"); cat.textContent = p.label; body.appendChild(cat);
    var h3 = el("h3"); h3.textContent = p.name; body.appendChild(h3);
    var notes = el("p", "notes"); notes.textContent = p.notes; body.appendChild(notes);

    var meta = el("div", "card-meta");
    var price = el("span", "price"); price.textContent = "$" + p.price.toFixed(2);
    meta.appendChild(price);   // no star rating until there are real reviews to count: never an invented stat
    if (p.badge) {   // the tag sits beside the price, never over the photo, so neither can hide the other
      var b = el("span", "badge " + p.badge); b.textContent = BADGE_TEXT[p.badge]; meta.appendChild(b);
    }
    body.appendChild(meta);

    var add = el("button", "card-add");
    add.type = "button";
    add.setAttribute("aria-label", "Add to Cart: " + p.name);   // starts with the visible words, so voice control ("click Add to Cart") still works
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
      var sample = r.author.charAt(0) === "[";   // a fill-in slot, not a real customer
      var card = el("article", "review reveal");
      var h3 = el("h3"); h3.textContent = r.title; card.appendChild(h3);
      var body = el("p", "body"); body.textContent = "“" + r.body + "”"; card.appendChild(body);

      var verified = el("span", "verified");
      verified.textContent = sample ? "Sample review" : "Customer review";
      card.appendChild(verified);

      var who = el("div", "who");
      var av = el("div", "avatar" + (sample ? " slot" : "")); av.textContent = sample ? "" : r.author.charAt(0); who.appendChild(av);
      var m = el("div", "meta");
      var nm = el("div", "nm" + (sample ? " slot" : "")); nm.textContent = r.author; m.appendChild(nm);
      var lo = el("div", "lo" + (sample ? " slot" : "")); lo.textContent = r.loc; m.appendChild(lo);
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
    filters.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); c.setAttribute("aria-pressed", "false"); });
    chip.classList.add("active");
    chip.setAttribute("aria-pressed", "true");
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
  var burger = document.getElementById("hamburger");
  var mClose = document.getElementById("mClose");
  function setNav(open, restoreFocus) {
    mNav.classList.toggle("open", open);
    if (open) mNav.removeAttribute("inert"); else mNav.setAttribute("inert", "");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) mClose.focus();
    else if (restoreFocus) burger.focus();
  }
  burger.addEventListener("click", function () { setNav(true); });
  mClose.addEventListener("click", function () { setNav(false, true); });
  mNav.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setNav(false); }); });
  mNav.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { setNav(false, true); return; }
    if (e.key !== "Tab") return;
    var f = mNav.querySelectorAll("button, a[href]"), first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // the sheet only exists below the desktop breakpoint; close it if the window grows past it
  window.addEventListener("resize", function () { if (window.innerWidth > 1180 && mNav.classList.contains("open")) setNav(false); });

  /* ---------- Newsletter ---------- */
  var newsForm = document.getElementById("newsForm");
  newsForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("newsEmail");
    var val = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      email.setAttribute("aria-invalid", "true");
      email.focus();
      showToast("Please enter a valid email address");
      return;
    }
    email.removeAttribute("aria-invalid");
    newsForm.style.display = "none";
    document.getElementById("newsOk").classList.add("show");
    showToast("You're on the list");
  });
  document.getElementById("newsEmail").addEventListener("input", function () { this.removeAttribute("aria-invalid"); });

  /* ---------- Init ---------- */
  document.getElementById("year").textContent = String(new Date().getFullYear());
  renderProducts("all");
  renderReviews();
  observeReveals();
  onScroll();
  SOC.applyAll();   // apply any owner photo overrides to hero/spotlight/static imgs
})();
