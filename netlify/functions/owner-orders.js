/**
 * Owner-only order data.
 *
 * THIS is where the protection lives. Hiding `owner.html` in JavaScript would
 * not protect anything — the file is still served to anyone who asks for it,
 * and disabling JS or reading source walks straight past a client-side check.
 * So the page shell is public and carries no data, and the data lives here,
 * behind a token Netlify verifies before this function ever runs.
 *
 * Netlify Identity populates `context.clientContext.user` only when the request
 * carries a valid, unexpired Identity JWT. A forged or missing token leaves it
 * undefined. The signature check is done by the platform, not by hand here —
 * hand-rolled JWT parsing is exactly where auth bugs come from.
 *
 * Setup: 420-friendly/PAYMENTS-SETUP.md → "Locking the owner pages".
 */

// Sample orders live server-side on purpose. They were previously in a public
// JS file; once real customer names and emails replace them, that file would
// have been readable by anyone. Same shape as before.
const SAMPLE_ORDERS = [
  { id: "420-1041", date: "2026-08-24", customer: "Marcus Webb", email: "m.webb@example.com",
    items: [{ name: "Vibrant Series Hoodie", size: "L", qty: 1, price: 120 },
            { name: "Sesh Socks (2-Pack)", size: "L/XL", qty: 1, price: 18 }],
    shipping: 0, status: "paid", invoice: "INV-1041", invoiceStatus: "paid", due: "2026-08-24" },
  { id: "420-1040", date: "2026-08-23", customer: "Dana Ruiz", email: "dana.ruiz@example.com",
    items: [{ name: "Terpene Joggers", size: "M", qty: 1, price: 85 }],
    shipping: 8, status: "paid", invoice: "INV-1040", invoiceStatus: "paid", due: "2026-08-23" },
  { id: "420-1039", date: "2026-08-22", customer: "Priya Raman", email: "p.raman@example.com",
    items: [{ name: "Midnight Windbreaker", size: "M", qty: 1, price: 140 }],
    shipping: 0, status: "pending", invoice: "INV-1039", invoiceStatus: "open", due: "2026-09-05" },
  { id: "420-1038", date: "2026-08-21", customer: "Alex Chen", email: "alex.chen@example.com",
    items: [{ name: "Vibrant Logo Tee", size: "M", qty: 2, price: 45 },
            { name: "Blazed Beanie", size: "ONE SIZE", qty: 1, price: 35 }],
    shipping: 0, status: "paid", invoice: "INV-1038", invoiceStatus: "paid", due: "2026-08-21" },
  { id: "420-1037", date: "2026-08-20", customer: "Jordan Blake", email: "j.blake@example.com",
    items: [{ name: "Smoke Signal Crewneck", size: "XL", qty: 1, price: 95 }],
    shipping: 8, status: "refunded", invoice: "INV-1037", invoiceStatus: "void", due: "2026-08-20" },
  { id: "420-1036", date: "2026-08-19", customer: "Sam Okafor", email: "s.okafor@example.com",
    items: [{ name: "Haze Snapback", size: "ONE SIZE", qty: 2, price: 40 }],
    shipping: 8, status: "paid", invoice: "INV-1036", invoiceStatus: "paid", due: "2026-08-19" },
  { id: "420-1035", date: "2026-08-18", customer: "Nina Alvarez", email: "nina.a@example.com",
    items: [{ name: "Vibrant Series Hoodie", size: "M", qty: 1, price: 120 },
            { name: "Terpene Joggers", size: "M", qty: 1, price: 85 }],
    shipping: 0, status: "paid", invoice: "INV-1035", invoiceStatus: "paid", due: "2026-08-18" },
  { id: "420-1034", date: "2026-08-16", customer: "Tomas Lind", email: "t.lind@example.com",
    items: [{ name: "Vibrant Logo Tee", size: "L", qty: 1, price: 45 }],
    shipping: 8, status: "pending", invoice: "INV-1034", invoiceStatus: "overdue", due: "2026-08-23" }
];

const REQUIRED_ROLE = process.env.OWNER_ROLE || "owner";

exports.handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;

  if (!user) {
    return json(401, {
      error: "unauthorized",
      message: "Sign in to view orders."
    });
  }

  const roles = (user.app_metadata && user.app_metadata.roles) || [];
  if (!roles.includes(REQUIRED_ROLE)) {
    // Being explicit here saves a long debugging session: a correct login with
    // the role unset looks identical to a rejected login otherwise.
    return json(403, {
      error: "forbidden",
      message:
        'Signed in as ' + (user.email || "unknown") + ', but this account does not have the "' +
        REQUIRED_ROLE + '" role. Add it in Netlify → Identity → the user → ' +
        'Edit roles, then sign out and back in.'
    });
  }

  const orders = SAMPLE_ORDERS.map((o) => {
    const subtotal = o.items.reduce((s, i) => s + i.price * i.qty, 0);
    return { ...o, subtotal, total: subtotal + (o.shipping || 0) };
  });

  return json(200, {
    orders,
    // Drives the portal's "these aren't real sales" banner. Flip to false when
    // this function reads a real payment provider instead of the list above.
    sample: true,
    viewer: user.email || null
  });
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}
