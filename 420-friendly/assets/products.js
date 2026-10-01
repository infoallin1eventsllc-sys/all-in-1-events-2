// 420 FRIENDLY — product catalog
//
// The Archive V.24 line: sixteen pieces, taken from the lookbook Otis built in
// Stitch. Names, prices, materials and colourways are transcribed from that
// lookbook rather than invented, so the storefront and the lookbook agree.
//
// ─────────────────────────────────────────────────────────────────────────
// WHERE THE PHOTOGRAPHS LIVE, AND WHY IT IS NOT IDEAL
//
// These point at Raylight's asset storage. That is a real improvement on what
// they replaced — the old catalog hotlinked `lh3.googleusercontent.com/aida/…`
// URLs, which Stitch issues temporarily and which expire, taking the pictures
// off a live storefront with them. Raylight's asset URLs do not expire.
//
// But they are still somebody else's server. If that project is deleted the
// images go with it. The durable fix is the same as it always was: the files
// committed into this repo, served from our own origin. They are 512×512 here,
// which is soft for a product page, so re-exporting them full size from Stitch
// and committing those is worth doing in one pass.
//
// Until then nothing breaks badly: `productArtHTML` paints the typographic art
// tile underneath every photo, so a URL that stops resolving reveals artwork
// rather than a hole.
// ─────────────────────────────────────────────────────────────────────────

const SHOT = "https://jkfgfwhjinktxvvmhpiy.supabase.co/storage/v1/object/public/assets/e00560e1-b9dc-4879-8f88-964a0d81ad1c/";

const CATALOG = [
  /* ===== HOODIES ===== */
  {
    id: "emerald-triangle-hoodie-black",
    name: "Emerald Triangle Master Hoodie",
    category: "HOODIES",
    subtitle: "Heavyweight Pullover Hoodie",
    colors: ["Blackout / Emerald"],
    price: 148,
    badge: "FLAGSHIP",
    blurb:
      "Ultra-dense 450GSM loopwheel cotton fleece with a raised dual-tone relief graphic, a Humboldt–Trinity–Mendocino topographical sleeve print, and gold-trimmed 3D puff embroidery. The anchor of the Archive.",
    features: ["450GSM Loopwheel Fleece", "3D Puff Embroidery", "Topographical Sleeve Graphic"],
    sizes: ["S", "M", "L", "XL"],
    image: SHOT + "86cf6826-7c63-485b-9dfb-4ccfd139a863.jpg",
    art: { from: "#0f2e1e", to: "#003005", word: "EMERALD\nTRIANGLE", tint: "#00e639" }
  },
  {
    id: "navy-hoodie",
    name: "Deep Navy Heavyweight Hoodie",
    category: "HOODIES",
    subtitle: "Pullover Hooded Fleece",
    colors: ["Deep Navy / Emerald"],
    price: 138,
    badge: "JUST DROPPED",
    blurb:
      "450GSM heavyweight fleece in deep navy, carrying the Sativa botanical crest across the chest. Cut long in the body with a double-lined hood.",
    features: ["450GSM Heavyweight Fleece", "Sativa Botanical Crest", "Double-Lined Hood"],
    sizes: ["S", "M", "L", "XL"],
    image: SHOT + "fcd9c726-e067-42db-97af-804260067fd1.jpg",
    art: { from: "#141c2e", to: "#0a0f1a", word: "SATIVA", tint: "#00e639" }
  },
  {
    id: "heather-grey-hoodie",
    name: "Heather Grey Archive Hoodie",
    category: "HOODIES",
    subtitle: "Loopwheel Fleece Hoodie",
    colors: ["Heather Grey / Emerald"],
    price: 135,
    badge: "ARCHIVE",
    blurb:
      "Loopwheel fleece in a soft heather grey, with the varsity 420 mark worked in tonal embroidery. The quietest piece in the run, and the one that goes with everything.",
    features: ["Loopwheel Cotton Fleece", "Tonal Varsity Embroidery", "Ribbed Cuffs and Hem"],
    sizes: ["S", "M", "L", "XL"],
    image: SHOT + "8b4e4704-17df-44a1-8243-898e0f25cd7b.jpg",
    art: { from: "#3a3a3a", to: "#222222", word: "VARSITY", tint: "#accfb7" }
  },
  {
    id: "crimson-hoodie",
    name: "Crimson Red Haze Hoodie",
    category: "HOODIES",
    subtitle: "Heavyweight Pullover Hoodie",
    colors: ["Crimson / Emerald"],
    price: 138,
    badge: "LIMITED DROP",
    blurb:
      "450GSM cotton in a deep crimson, with the Haze graphic printed high-density across the chest. The loudest colourway of the Archive, and the smallest run.",
    features: ["450GSM Cotton Fleece", "High-Density Chest Print", "Oversized Boxy Fit"],
    sizes: ["S", "M", "L", "XL"],
    image: SHOT + "b64d141f-f5df-48bb-b3bf-4201e02fea5c.jpg",
    art: { from: "#3d1414", to: "#1a0808", word: "HAZE", tint: "#00e639" }
  },

  /* ===== BOTTOMS ===== */
  {
    id: "navy-sweatpants",
    name: "Navy Blue Sativa Bottoms",
    category: "BOTTOMS",
    subtitle: "Heavyweight Sweatpants",
    colors: ["Deep Navy / Emerald"],
    price: 115,
    badge: "JUST DROPPED",
    blurb:
      "Architectural sweatpants in Sativa-spec fleece. Tapered through the leg, elasticated at the ankle, with the botanical crest at the hip.",
    features: ["Sativa-Spec Fleece", "Tapered Leg", "Hip Crest Embroidery"],
    sizes: ["S", "M", "L", "XL"],
    image: SHOT + "8c87c479-ce13-4b41-b145-ca99edd67b0b.jpg",
    art: { from: "#141c2e", to: "#0a0f1a", word: "SATIVA", tint: "#7db8ff" }
  },
  {
    id: "black-sweatpants",
    name: "Black Emerald Triangle Sweatpants",
    category: "BOTTOMS",
    subtitle: "Heavyweight Sweatpants",
    colors: ["Blackout / Emerald"],
    price: 118,
    badge: "MATCHING SUITE",
    blurb:
      "450GSM loopwheel fleece bottoms with the vertical NorCal regional graphic embroidered down the leg. Made to run with the Emerald Triangle hoodie.",
    features: ["450GSM Loopwheel Fleece", "Vertical Regional Graphic", "Matches the Master Hoodie"],
    sizes: ["S", "M", "L", "XL"],
    image: SHOT + "0a65f04d-9aa6-43d5-92c6-fa5d441846f0.jpg",
    art: { from: "#0f2e1e", to: "#050f09", word: "EMERALD", tint: "#00e639" }
  },
  {
    id: "grey-sweatpants",
    name: "Grey Emerald Triangle Pants",
    category: "BOTTOMS",
    subtitle: "French Terry Sweatpants",
    colors: ["Heather Grey / Emerald"],
    price: 115,
    badge: "ARCHIVE",
    blurb:
      "French terry in heather grey — lighter than the fleece bottoms and cut a touch looser. Hybrid spec, for the days that are neither one thing nor the other.",
    features: ["French Terry Cotton", "Relaxed Straight Leg", "Hybrid Spec Graphic"],
    sizes: ["S", "M", "L", "XL"],
    image: SHOT + "3bd325c3-2fc8-47f6-936b-cc20ff01e72f.jpg",
    art: { from: "#3a3a3a", to: "#222222", word: "HYBRID", tint: "#accfb7" }
  },
  {
    id: "white-sweatpants",
    name: "White Hybrid Tour Bottoms",
    category: "BOTTOMS",
    subtitle: "Chalk White Sweatpants",
    colors: ["Chalk White / Emerald"],
    price: 115,
    badge: "LIMITED DROP",
    blurb:
      "Chalk white, tour spec, and the hardest piece in the run to keep clean. Worth it. Emerald graphic at the thigh, drawcord at the waist.",
    features: ["Chalk White Cotton Fleece", "Emerald Thigh Graphic", "Tour Spec Cut"],
    sizes: ["S", "M", "L", "XL"],
    image: SHOT + "5497a789-f0e1-4e7c-a8eb-33f38e50948f.jpg",
    art: { from: "#e8e8e4", to: "#c9c9c2", word: "TOUR", tint: "#12752f" }
  },

  /* ===== TEES ===== */
  {
    id: "black-tee",
    name: "Black Archive Graphic Tee",
    category: "TEES",
    subtitle: "280GSM Heavyweight Jersey",
    colors: ["Blackout / Emerald"],
    price: 58,
    badge: "BEST SELLER",
    blurb:
      "280GSM heavyweight jersey — thick enough to hang properly and not go see-through. The 420 shield sits centre chest in emerald and white.",
    features: ["280GSM Heavyweight Jersey", "Centre Shield Graphic", "Pre-Shrunk"],
    sizes: ["S", "M", "L", "XL"],
    image: SHOT + "f5f8c1b1-2095-4938-ba85-9f2a67ea80ff.jpg",
    art: { from: "#1c1b1b", to: "#0e0e0e", word: "420", tint: "#00e639" }
  },
  {
    id: "white-tee",
    name: "White Clean Spec Tee",
    category: "TEES",
    subtitle: "280GSM Heavyweight Jersey",
    colors: ["White / Emerald"],
    price: 58,
    badge: "ARCHIVE",
    blurb:
      "The same 280GSM body in white, with the Emerald Triangle wordmark set small and high. The restrained one.",
    features: ["280GSM Heavyweight Jersey", "Minimal Wordmark", "Pre-Shrunk"],
    sizes: ["S", "M", "L", "XL"],
    image: SHOT + "8364c228-e2d2-4795-a42f-c77427029bfb.jpg",
    art: { from: "#f2f2ee", to: "#d8d8d2", word: "EMERALD\nTRIANGLE", tint: "#12752f" }
  },

  /* ===== HEADWEAR ===== */
  {
    id: "black-snapback",
    name: "Black 420 Haze Snapback",
    category: "HEADWEAR",
    subtitle: "Six-Panel Twill Snapback",
    colors: ["Blackout / Green Brim"],
    price: 48,
    badge: "JUST DROPPED",
    blurb:
      "Six-panel blackout twill with the raised 3D HAZE embroidery and a green under-brim. Flat peak, snap closure, one size.",
    features: ["Six-Panel Cotton Twill", "3D Raised Embroidery", "Green Under-Brim"],
    sizes: ["ONE SIZE"],
    image: SHOT + "1103ff6b-9ac4-49de-9867-a46ed5ec8f35.jpg",
    art: { from: "#131313", to: "#003005", word: "HAZE", tint: "#00e639" }
  },
  {
    id: "haze-snapback",
    name: "Heather Grey Haze Snapback",
    category: "HEADWEAR",
    subtitle: "Wool Blend Twill Snapback",
    colors: ["Heather Grey / Green Brim"],
    price: 48,
    badge: "BEST SELLER",
    blurb:
      "Wool blend twill in heather grey, raised 420 HAZE mark, deep green under-brim. One size fits most heads and all moods.",
    features: ["Wool Blend Twill", "3D Raised Embroidery", "Green Under-Brim"],
    sizes: ["ONE SIZE"],
    // The one photograph committed to this repo, at 1024px — sharper than the
    // 512px lookbook exports and not dependent on anyone else's storage.
    image: "assets/products/haze-snapback.webp",
    art: { from: "#3a3a3a", to: "#1a1a1a", word: "HAZE", tint: "#00e639" }
  },
  {
    id: "crimson-snapback",
    name: "Crimson Red Haze Snapback",
    category: "HEADWEAR",
    subtitle: "Cotton Twill Snapback",
    colors: ["Crimson / Green Brim"],
    price: 48,
    badge: "LIMITED DROP",
    blurb:
      "Crimson cotton twill, same raised HAZE mark, same green under-brim. The one people ask about.",
    features: ["Cotton Twill", "3D Raised Embroidery", "Green Under-Brim"],
    sizes: ["ONE SIZE"],
    image: SHOT + "372258c6-6001-432c-b11e-5c4ee0bb1d38.jpg",
    art: { from: "#3d1414", to: "#1a0808", word: "HAZE", tint: "#00e639" }
  },
  {
    id: "black-bucket-hat",
    name: "Black Haze Bucket Hat",
    category: "HEADWEAR",
    subtitle: "Tech Twill Bucket Hat",
    colors: ["Blackout / Emerald"],
    price: 52,
    badge: "JUST DROPPED",
    blurb:
      "Tech twill bucket with a stiffened brim that holds its shape, and the Haze mark embroidered at the front panel.",
    features: ["Tech Twill", "Structured Brim", "Front Panel Embroidery"],
    sizes: ["ONE SIZE"],
    image: SHOT + "a93e65ed-d09b-4857-9491-8ccd236e63c1.jpg",
    art: { from: "#1c1b1b", to: "#0e0e0e", word: "BUCKET", tint: "#00e639" }
  },
  {
    id: "crimson-bucket-hat",
    name: "Crimson Red Haze Bucket Hat",
    category: "HEADWEAR",
    subtitle: "Tech Twill Bucket Hat",
    colors: ["Crimson / Emerald"],
    price: 52,
    badge: "LIMITED DROP",
    blurb:
      "The bucket in crimson. Same tech twill, same structured brim, considerably harder to miss.",
    features: ["Tech Twill", "Structured Brim", "Front Panel Embroidery"],
    sizes: ["ONE SIZE"],
    image: SHOT + "9c251e80-b723-43f4-8006-e05dec473fa9.jpg",
    art: { from: "#3d1414", to: "#1a0808", word: "BUCKET", tint: "#00e639" }
  },
  {
    id: "grey-beanie",
    name: "Heather Grey Haze Beanie",
    category: "HEADWEAR",
    subtitle: "Architectural Rib Knit Beanie",
    colors: ["Heather Grey / Emerald"],
    price: 44,
    badge: "ARCHIVE",
    blurb:
      "Tight architectural rib in heather grey with a deep fold cuff and the 420 HAZE mark knitted in. Keeps the head warm and the fit correct.",
    features: ["Architectural Rib Knit", "Deep Fold Cuff", "Knitted-In Mark"],
    sizes: ["ONE SIZE"],
    image: SHOT + "c3cf738e-2b0b-4499-bc3d-59c61357fa68.jpg",
    art: { from: "#3a3a3a", to: "#1a1a1a", word: "HAZE", tint: "#00e639" }
  }
];

const CATEGORIES = ["ALL", ...new Set(CATALOG.map((p) => p.category))];

/* Six pages call this — cart, checkout, favorites, index, product and the
 * shared chrome — so it has to live with the catalog rather than in app.js. */
function getProduct(id) {
  return CATALOG.find((p) => p.id === id) || null;
}
