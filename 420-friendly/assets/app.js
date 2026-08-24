// 420 FRIENDLY — shared chrome (header / bottom nav / footer), cart, and helpers.
// Cart lives in localStorage only: this is a front-end preview, no backend yet.

const CART_KEY = "420_cart_v1";

const NAV = [
  { href: "index.html", label: "SHOP", icon: "storefront" },
  { href: "drops.html", label: "DROPS", icon: "bolt" },
  { href: "portal.html", label: "PORTAL", icon: "dashboard" },
  { href: "cart.html", label: "BAG", icon: "shopping_cart" }
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

/* ===== Shared chrome ===== */

function renderChrome(activeLabel) {
  const headerMount = document.getElementById("site-header");
  const navMount = document.getElementById("site-bottom-nav");
  const footerMount = document.getElementById("site-footer");

  if (headerMount) {
    const desktopLinks = NAV.map((item) => {
      const active = item.label === activeLabel;
      return (
        '<a href="' + item.href + '" class="font-label-caps text-label-caps transition-colors ' +
        (active ? "text-tertiary" : "text-on-surface-variant hover:text-secondary") +
        '">' + item.label + "</a>"
      );
    }).join("");
    headerMount.innerHTML =
      '<header class="fixed top-0 left-0 w-full z-50 border-b border-outline-variant bg-background/90 backdrop-blur-md flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16">' +
      '<a href="index.html" class="font-headline-md text-headline-md font-bold tracking-tighter text-secondary hover:text-tertiary transition-colors">420 FRIENDLY</a>' +
      '<nav class="hidden md:flex items-center gap-8" aria-label="Primary">' + desktopLinks + "</nav>" +
      '<a href="cart.html" aria-label="Open bag" class="relative text-secondary hover:text-tertiary transition-colors active:scale-95 duration-200 p-2 -mr-2">' +
      '<span class="material-symbols-outlined">shopping_bag</span>' +
      '<span data-cart-count data-empty="true">0</span>' +
      "</a></header>";
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
    footerMount.innerHTML =
      '<footer class="border-t border-outline-variant/50 mt-20 py-10 px-margin-mobile md:px-margin-desktop">' +
      '<div class="max-w-container-max mx-auto flex flex-col md:flex-row justify-between gap-6">' +
      '<div><p class="font-headline-md text-headline-md font-bold tracking-tighter text-secondary">420 FRIENDLY</p>' +
      '<p class="font-body-md text-body-md text-on-surface-variant mt-2 max-w-md">Streetwear for the concrete jungle. 420 Friendly is an apparel brand — every product is clothing, nothing more.</p></div>' +
      '<div class="flex flex-col gap-2">' +
      NAV.map((item) =>
        '<a href="' + item.href + '" class="font-label-caps text-label-caps text-on-surface-variant hover:text-secondary transition-colors">' + item.label + "</a>"
      ).join("") +
      "</div></div>" +
      '<p class="font-label-caps text-label-caps text-outline mt-10 max-w-container-max mx-auto">&copy; 2026 420 FRIENDLY. ALL RIGHTS RESERVED.</p>' +
      "</footer>";
  }

  updateCartBadges();
}
