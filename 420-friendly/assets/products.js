// 420 FRIENDLY — product catalog
// Static, trusted data. Swap `image` in when real photography is ready;
// until then each product renders a typographic art tile from `art`.
const CATALOG = [
  {
    id: "vibrant-hoodie",
    name: "Vibrant Series Hoodie",
    price: 120,
    badge: "LIMITED DROP",
    blurb:
      "Heavyweight black fleece constructed for the concrete jungle. Featuring a high-density 'Vibrant Typographic Logo' print pulsating with electric energy across the chest. Built for high impact.",
    features: [
      "High-Density Print Technology",
      "Heavyweight 450gsm Cotton Fleece",
      "Oversized Boxy Fit"
    ],
    sizes: ["S", "M", "L", "XL"],
    image:
      "https://lh3.googleusercontent.com/aida/AEtjO1WRAVb1NqCfk3yxs2bYifnE8zsANK1cdZHjlFPADdM57hjiDRbl8YiWAR-fon1CVvnCMhl7qKDphT27P-8YgE-eCslwk9DBQFVw9yeFTgZ2olWDhOf1w0zgi6Em76BYFCkTI0fvnt8iOmH1gpX_JnzJWrmtptwROjE-eqwOaKvSEV5zpPrBGTNS-N_lmgPGwz6wqv0ubZ8qDCNiscXc7NLn-9477Rl84eeKVIlq5lNESsrCSPtMufGqVho",
    art: { from: "#0f2e1e", to: "#003005", word: "VIBRANT", tint: "#00e639" }
  },
  {
    id: "vibrant-tee",
    name: "Vibrant Logo Tee",
    price: 45,
    badge: "LIVE",
    blurb:
      "The daily driver. Midweight combed cotton with the Vibrant Typographic Logo hit across the chest in electric green. Pre-shrunk, garment-dyed black.",
    features: [
      "220gsm Combed Cotton",
      "Garment-Dyed, Pre-Shrunk",
      "Relaxed Street Fit"
    ],
    sizes: ["S", "M", "L", "XL"],
    image: null,
    art: { from: "#1c1b1b", to: "#0f2e1e", word: "VIBRANT\nTEE", tint: "#00e639" }
  },
  {
    id: "smoke-signal-crew",
    name: "Smoke Signal Crewneck",
    price: 95,
    badge: "LIVE",
    blurb:
      "A slow-burn classic. Brushed-back fleece crewneck with tonal 'Smoke Signal' embroidery and a gold hit at the cuff. Made to loop through every session.",
    features: [
      "400gsm Brushed-Back Fleece",
      "Tonal Chest Embroidery",
      "Ribbed Side Panels"
    ],
    sizes: ["S", "M", "L", "XL"],
    image: null,
    art: { from: "#201f1f", to: "#131313", word: "SMOKE\nSIGNAL", tint: "#e9c349" }
  },
  {
    id: "blazed-beanie",
    name: "Blazed Beanie",
    price: 35,
    badge: "LIVE",
    blurb:
      "Tight-knit acrylic beanie with the 420 FRIENDLY woven label front and center. Deep cuff, zero slouch. Keeps the head warm and the fit correct.",
    features: [
      "Tight-Knit Acrylic",
      "Woven Front Label",
      "Deep Fold Cuff"
    ],
    sizes: ["ONE SIZE"],
    image: null,
    art: { from: "#2a2a2a", to: "#131313", word: "BLAZED", tint: "#e9c349" }
  },
  {
    id: "terpene-joggers",
    name: "Terpene Joggers",
    price: 85,
    badge: "LIVE",
    blurb:
      "Matched to the Vibrant Hoodie. Tapered heavyweight fleece joggers with a stacked ankle, zip pockets that actually hold, and the logo printed down the left leg.",
    features: [
      "450gsm Cotton Fleece",
      "Secure Zip Pockets",
      "Tapered Stacked Fit"
    ],
    sizes: ["S", "M", "L", "XL"],
    image: null,
    art: { from: "#0f2e1e", to: "#1c1b1b", word: "TERPENE", tint: "#00e639" }
  },
  {
    id: "haze-snapback",
    name: "Haze Snapback",
    price: 40,
    badge: "LIVE",
    blurb:
      "Six-panel snapback in blackout twill with a raised 3D-embroidered 420 mark and an under-brim in electric green. One size fits most heads and all moods.",
    features: [
      "Blackout Cotton Twill",
      "3D Raised Embroidery",
      "Green Under-Brim"
    ],
    sizes: ["ONE SIZE"],
    image: null,
    art: { from: "#131313", to: "#003005", word: "HAZE", tint: "#00e639" }
  },
  {
    id: "sesh-socks",
    name: "Sesh Socks (2-Pack)",
    price: 18,
    badge: "LIVE",
    blurb:
      "Cushioned crew socks in a two-pack: one blackout pair, one electric green pair. Jacquard-knit logo at the calf so the fit talks even when you don't.",
    features: [
      "Cushioned Sole",
      "Jacquard-Knit Logo",
      "Two Pairs Per Pack"
    ],
    sizes: ["S/M", "L/XL"],
    image: null,
    art: { from: "#1c1b1b", to: "#201f1f", word: "SESH", tint: "#72ff70" }
  },
  {
    id: "midnight-windbreaker",
    name: "Midnight Windbreaker",
    price: 140,
    badge: "PRE-ORDER",
    blurb:
      "Water-resistant ripstop shell with a packable hood, reflective 420 hits, and a gold half-zip. Built for late walks and early exits. Ships with the next drop.",
    features: [
      "Water-Resistant Ripstop",
      "Reflective Logo Hits",
      "Packs Into Its Own Pocket"
    ],
    sizes: ["S", "M", "L", "XL"],
    image: null,
    art: { from: "#131313", to: "#2f4d3b", word: "MID\nNIGHT", tint: "#accfb7" }
  }
];

function getProduct(id) {
  return CATALOG.find((p) => p.id === id) || null;
}
