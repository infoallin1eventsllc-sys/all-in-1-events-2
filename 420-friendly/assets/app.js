// 420 FRIENDLY — shared chrome (header / bottom nav / footer), cart, and helpers.
// Cart lives in localStorage only: this is a front-end preview, no backend yet.

const CART_KEY = "420_cart_v1";

// Mobile bottom bar (4 destinations, Nike-app style)
const NAV = [
  { href: "shop.html", label: "SHOP", icon: "storefront" },
  { href: "drops.html", label: "DROPS", icon: "bolt" },
  { href: "portal.html", label: "PORTAL", icon: "dashboard" },
  { href: "cart.html", label: "BAG", icon: "shopping_cart" }
];

// Desktop primary nav (Nike pattern: category-led, centered)
const PRIMARY_NAV = [
  { href: "shop.html", label: "Shop All" },
  { href: "shop.html?cat=HOODIES%20%26%20CREWS", label: "Hoodies" },
  { href: "shop.html?cat=TEES", label: "Tees" },
  { href: "shop.html?cat=HEADWEAR", label: "Headwear" },
  { href: "drops.html", label: "Drops" },
  { href: "portal.html", label: "Portal" }
];

// Utility bar (Nike pattern: secondary links above the masthead)
const UTILITY_NAV = [
  { href: "drops.html", label: "Drop Calendar" },
  { href: "portal.html", label: "Join the Portal" },
  { href: "favorites.html", label: "Favorites" }
];

// Escape anything interpolated into markup. Catalog data is ours, but the
// repo convention (see README) is: never trust interpolation, always escape.
function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function money(amount) {
  return "$" + Number(amount).toFixed(2) + " USD";
}

/* ===== Cart ===== */

function getCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // Private windows can block storage; the page keeps working without it.
  }
  updateCartBadges();
}

function addToCart(productId, size) {
  const product = getProduct(productId);
  if (!product) return;
  const chosenSize = product.sizes.includes(size) ? size : product.sizes[0];
  const cart = getCart();
  const line = cart.find((l) => l.id === productId && l.size === chosenSize);
  if (line) {
    line.qty += 1;
  } else {
    cart.push({ id: productId, size: chosenSize, qty: 1 });
  }
  saveCart(cart);
  toast(product.name.toUpperCase() + " / " + chosenSize + " — ADDED TO BAG");
}

function setLineQty(productId, size, qty) {
  let cart = getCart();
  const line = cart.find((l) => l.id === productId && l.size === size);
  if (!line) return;
  line.qty = qty;
  if (line.qty < 1) cart = cart.filter((l) => l !== line);
  saveCart(cart);
}

function cartCount() {
  return getCart().reduce((sum, l) => sum + l.qty, 0);
}

function cartSubtotal() {
  return getCart().reduce((sum, l) => {
    const product = getProduct(l.id);
    return product ? sum + product.price * l.qty : sum;
  }, 0);
}

function updateCartBadges() {
  const count = cartCount();
  document.querySelectorAll("[data-cart-count]").forEach((badge) => {
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.dataset.empty = count === 0 ? "true" : "false";
  });
}

/* ===== Toast ===== */

let activeToast = null;
function toast(message) {
  if (activeToast) activeToast.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.appendChild(el);
  activeToast = el;
  setTimeout(() => {
    el.classList.add("toast-out");
    setTimeout(() => {
      el.remove();
      if (activeToast === el) activeToast = null;
    }, 250);
  }, 2400);
}

/* ===== Product art tiles ===== */

// Renders the product visual: real photo when we have one, typographic
// art tile otherwise. `sizeClass` controls the tile's aspect/height.
function productArtHTML(product, sizeClass) {
  if (product.image) {
    return (
      '<img alt="' + esc(product.name) + '" loading="lazy" ' +
      'class="w-full h-full object-cover object-center absolute inset-0" ' +
      'src="' + esc(product.image) + '"/>'
    );
  }
  const art = product.art;
  const fontSize = sizeClass === "lg" ? "clamp(48px, 8vw, 110px)" : "clamp(28px, 4vw, 54px)";
  return (
    '<div class="art-tile absolute inset-0" style="background:linear-gradient(160deg,' +
    esc(art.from) + "," + esc(art.to) + ')">' +
    '<span class="art-word" style="color:' + esc(art.tint) + ";font-size:" + fontSize + '">' +
    esc(art.word) + "</span>" +
    '<span class="art-mark" style="color:' + esc(art.tint) + '">420 FRIENDLY</span>' +
    "</div>"
  );
}

/* ===== Favorites ===== */

const FAVS_KEY = "420_favs_v1";

function getFavs() {
  try {
    const favs = JSON.parse(localStorage.getItem(FAVS_KEY));
    return Array.isArray(favs) ? favs : [];
  } catch {
    return [];
  }
}

function isFav(productId) {
  return getFavs().includes(productId);
}

function toggleFav(productId) {
  let favs = getFavs();
  if (favs.includes(productId)) {
    favs = favs.filter((id) => id !== productId);
  } else {
    favs.push(productId);
  }
  try {
    localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
  } catch {
    // Storage unavailable; favorite state just won't persist.
  }
  return favs.includes(productId);
}

/* ===== Product cards (Nike-pattern anatomy: tile, status, name, category, colors, price) ===== */

function badgeTone(badge) {
  return badge === "PRE-ORDER" ? "text-secondary" : "text-tertiary";
}

function productCardHTML(product) {
  const colorCount = product.colors.length === 1
    ? product.colors[0]
    : product.colors.length + " Colorways";
  return (
    '<a href="product.html?id=' + esc(product.id) + '" class="group block">' +
    '<div class="relative aspect-[4/5] overflow-hidden bg-surface-container-low">' +
    productArtHTML(product, "sm") +
    "</div>" +
    '<div class="mt-3 space-y-1">' +
    '<p class="font-label-caps text-label-caps ' + badgeTone(product.badge) + '">' + esc(product.badge) + "</p>" +
    '<h3 class="font-body-md text-body-md text-on-surface group-hover:text-secondary transition-colors">' + esc(product.name) + "</h3>" +
    '<p class="font-body-md text-body-md text-on-surface-variant">' + esc(product.subtitle) + "</p>" +
    '<p class="font-body-md text-body-md text-on-surface-variant">' + esc(colorCount) + "</p>" +
    '<p class="font-body-md text-body-md text-on-surface pt-1">' + esc(money(product.price)) + "</p>" +
    "</div></a>"
  );
}

/* ===== Brand mark =====
 * A reproduction of the 420 Friendly badge: gold leaf, ring, "420", wordmark
 * and tagline on the deep-green field. It is inlined into the DOM rather than
 * loaded via <img> so its lettering renders in the page's Montserrat instead
 * of a system fallback. Gradient ids are per-instance so multiple badges on
 * one page never collide. Swap in an exported asset by replacing this
 * function's body with an <img> tag pointing at it.
 */

let badgeSeq = 0;

function brandBadgeHTML(heightClass) {
  const uid = "bg" + ++badgeSeq;
  const leaflet = (rot, w1, w2, len) =>
    '<g transform="rotate(' + rot + ')"><path d="M0,0 C-' + w1 + ',-' + Math.round(len * 0.43) +
    ' -' + w2 + ',-' + Math.round(len * 0.78) + ' 0,-' + len +
    ' C' + w2 + ',-' + Math.round(len * 0.78) + ' ' + w1 + ',-' + Math.round(len * 0.43) + ' 0,0 Z"/></g>';

  return (
    '<svg class="' + heightClass + ' w-auto shrink-0" viewBox="0 0 400 400" ' +
    'role="img" aria-label="420 Friendly — Clothing Brand">' +
    "<defs>" +
    '<linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#f7e79c"/>' +
    '<stop offset="42%" stop-color="#e9c349"/>' +
    '<stop offset="100%" stop-color="#a8811f"/>' +
    "</linearGradient></defs>" +
    // Field and borders
    '<rect x="0" y="0" width="400" height="400" rx="62" fill="#0a2e1b"/>' +
    '<rect x="21" y="21" width="358" height="358" rx="46" fill="none" ' +
    'stroke="url(#' + uid + ')" stroke-width="9"/>' +
    '<rect x="35" y="35" width="330" height="330" rx="36" fill="none" ' +
    'stroke="#1c5735" stroke-width="3"/>' +
    // Ring behind the leaf
    '<circle cx="200" cy="168" r="92" fill="none" stroke="url(#' + uid + ')" ' +
    'stroke-width="6" opacity="0.7"/>' +
    // Leaf — sits high enough that the lower fronds stay clear of the numerals
    '<g transform="translate(200,248)" fill="none" stroke="url(#' + uid + ')" ' +
    'stroke-width="7" stroke-linejoin="round" stroke-linecap="round">' +
    leaflet(0, 21, 13, 148) +
    leaflet(26, 18, 11, 130) + leaflet(-26, 18, 11, 130) +
    leaflet(53, 16, 10, 106) + leaflet(-53, 16, 10, 106) +
    leaflet(79, 13, 8, 80) + leaflet(-79, 13, 8, 80) +
    "</g>" +
    // Chevron wings, clear of the numerals on either side
    '<path d="M122,224 L98,241 L122,258" fill="none" stroke="url(#' + uid + ')" ' +
    'stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<path d="M278,224 L302,241 L278,258" fill="none" stroke="url(#' + uid + ')" ' +
    'stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>' +
    // Lettering
    '<text x="200" y="272" text-anchor="middle" fill="url(#' + uid + ')" ' +
    'font-family="Montserrat, \'Arial Black\', sans-serif" font-weight="900" ' +
    'font-size="86" letter-spacing="-1">420</text>' +
    '<text x="200" y="318" text-anchor="middle" fill="url(#' + uid + ')" ' +
    'font-family="Montserrat, \'Arial Black\', sans-serif" font-weight="900" ' +
    'font-size="41">420 FRIENDLY</text>' +
    '<text x="200" y="347" text-anchor="middle" fill="url(#' + uid + ')" ' +
    'font-family="Montserrat, \'Arial Black\', sans-serif" font-weight="700" ' +
    'font-size="23" letter-spacing="3">CLOTHING BRAND</text>' +
    // Sweep
    '<path d="M104,360 C158,351 246,366 298,355" fill="none" ' +
    'stroke="url(#' + uid + ')" stroke-width="7" stroke-linecap="round"/>' +
    "</svg>"
  );
}

/* ===== Shared chrome ===== */

function renderChrome(activeLabel) {
  const headerMount = document.getElementById("site-header");
  const navMount = document.getElementById("site-bottom-nav");
  const footerMount = document.getElementById("site-footer");

  if (headerMount) {
    // Utility bar — Nike keeps secondary links in a thin strip above the masthead.
    const utilityBar =
      '<div class="hidden md:flex justify-end items-center gap-4 h-9 px-margin-desktop bg-surface-container-lowest border-b border-outline-variant/40">' +
      UTILITY_NAV.map((item, i) =>
        (i > 0 ? '<span class="text-outline-variant" aria-hidden="true">|</span>' : "") +
        '<a href="' + item.href + '" class="font-body-md text-[13px] text-on-surface-variant hover:text-secondary transition-colors">' + item.label + "</a>"
      ).join("") +
      "</div>";

    const primaryLinks = PRIMARY_NAV.map((item) => {
      const active = item.label.toUpperCase() === String(activeLabel).toUpperCase();
      return (
        '<a href="' + item.href + '" class="font-body-md text-body-md transition-colors ' +
        (active ? "text-secondary" : "text-on-surface hover:text-secondary") +
        '">' + item.label + "</a>"
      );
    }).join("");

    headerMount.innerHTML =
      '<div class="fixed top-0 left-0 w-full z-50 bg-background/95 backdrop-blur-md border-b border-outline-variant">' +
      utilityBar +
      '<header class="flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16 gap-4">' +
      '<a href="index.html" data-brand aria-label="420 Friendly home" class="flex items-center shrink-0 hover:opacity-80 transition-opacity">' +
      brandBadgeHTML("h-14") +
      "</a>" +
      '<nav class="hidden md:flex items-center gap-7" aria-label="Primary">' + primaryLinks + "</nav>" +
      '<div class="flex items-center gap-1 shrink-0">' +
      // Search pill (Nike pattern) — routes to the shop page's filter field
      '<form action="shop.html" method="get" class="hidden lg:flex items-center gap-2 bg-surface-container rounded-full px-4 py-2 mr-2">' +
      '<span class="material-symbols-outlined text-on-surface-variant text-[18px]">search</span>' +
      '<label class="sr-only" for="site-search">Search products</label>' +
      '<input id="site-search" name="q" type="search" placeholder="Search" ' +
      'class="bg-transparent border-0 focus:ring-0 p-0 w-28 font-body-md text-[14px] text-on-surface placeholder:text-outline"/>' +
      "</form>" +
      '<a href="favorites.html" aria-label="Favorites" class="text-on-surface hover:text-secondary transition-colors p-2">' +
      '<span class="material-symbols-outlined">favorite</span></a>' +
      '<a href="cart.html" aria-label="Open bag" class="relative text-on-surface hover:text-secondary transition-colors active:scale-95 duration-200 p-2">' +
      '<span class="material-symbols-outlined">shopping_bag</span>' +
      '<span data-cart-count data-empty="true">0</span>' +
      "</a></div></header></div>";
  }

  if (navMount) {
    navMount.innerHTML =
      '<nav class="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 h-20 bg-surface-container-lowest/80 backdrop-blur-xl border-t border-outline-variant shadow-[0_-4px_20px_0_rgba(0,230,57,0.1)]" aria-label="Mobile">' +
      NAV.map((item) => {
        const active = item.label === activeLabel;
        const color = active
          ? "text-tertiary border-t-2 border-tertiary -mt-px"
          : "text-on-surface-variant";
        const fill = active ? ' style="font-variation-settings: \'FILL\' 1;"' : "";
        const badge = item.label === "BAG"
          ? '<span data-cart-count data-empty="true">0</span>'
          : "";
        return (
          '<a href="' + item.href + '" class="relative flex flex-col items-center justify-center ' +
          color + ' pt-2 hover:text-secondary transition-all active:scale-90 duration-300 w-1/4">' +
          '<span class="material-symbols-outlined mb-1"' + fill + ">" + item.icon + "</span>" +
          '<span class="font-label-caps text-label-caps text-[10px]">' + item.label + "</span>" +
          badge + "</a>"
        );
      }).join("") +
      "</nav>";
  }

  if (footerMount) {
    // Nike pattern: multi-column link footer, brand line and legal at the bottom.
    const column = (heading, links) =>
      '<div><p class="font-label-caps text-label-caps text-on-surface mb-4">' + heading + "</p>" +
      '<div class="flex flex-col gap-3">' +
      links.map((l) =>
        '<a href="' + l.href + '" class="font-body-md text-body-md text-on-surface-variant hover:text-secondary transition-colors">' + l.label + "</a>"
      ).join("") +
      "</div></div>";

    footerMount.innerHTML =
      '<footer class="border-t border-outline-variant/50 mt-24 pt-14 pb-10 px-margin-mobile md:px-margin-desktop">' +
      '<div class="max-w-container-max mx-auto grid grid-cols-2 md:grid-cols-4 gap-10">' +
      column("SHOP", [
        { href: "shop.html", label: "All Products" },
        { href: "shop.html?cat=HOODIES%20%26%20CREWS", label: "Hoodies & Crews" },
        { href: "shop.html?cat=TEES", label: "Tees" },
        { href: "shop.html?cat=BOTTOMS", label: "Bottoms" }
      ]) +
      column("MORE", [
        { href: "shop.html?cat=HEADWEAR", label: "Headwear" },
        { href: "shop.html?cat=ACCESSORIES", label: "Accessories" },
        { href: "shop.html?cat=JACKETS", label: "Jackets" },
        { href: "favorites.html", label: "Favorites" }
      ]) +
      column("THE BRAND", [
        { href: "drops.html", label: "Drop Calendar" },
        { href: "portal.html", label: "Join the Portal" },
        { href: "cart.html", label: "Your Bag" }
      ]) +
      '<div><div class="flex items-center">' +
      brandBadgeHTML("h-24") +
      "</div>" +
      '<p class="font-body-md text-body-md text-on-surface-variant mt-3">Streetwear for the concrete jungle. 420 Friendly is an apparel brand — every product is clothing, nothing more.</p></div>' +
      "</div>" +
      '<div class="max-w-container-max mx-auto mt-12 pt-6 border-t border-outline-variant/30 flex flex-col md:flex-row justify-between gap-2">' +
      '<p class="font-label-caps text-label-caps text-outline">&copy; 2026 420 FRIENDLY. ALL RIGHTS RESERVED.</p>' +
      '<p class="font-label-caps text-label-caps text-outline">FREE US SHIPPING OVER $100</p>' +
      "</div></footer>";
  }

  updateCartBadges();
}
