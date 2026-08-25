/* 420 FRIENDLY — owner portal data layer.
 *
 * IMPORTANT: the orders below are SAMPLE DATA, not real sales. Checkout is not
 * connected to a payment provider yet, so no real transaction exists to read.
 * They are here so the portal's tables, totals, filters and exports can be
 * built and verified against realistic shapes.
 *
 * When Stripe / Shopify is connected, replace `fetchOrders()` with a call to
 * that provider (or to your own backend) returning the same shape. Nothing else
 * in the portal needs to change.
 */

const ORDER_SHAPE_NOTE =
  "id, date (ISO), customer, email, items[{name,size,qty,price}], subtotal, shipping, total, status, invoice";

const SAMPLE_ORDERS = [
  {
    id: "420-1041", date: "2026-08-24", customer: "Marcus Webb", email: "m.webb@example.com",
    items: [{ name: "Vibrant Series Hoodie", size: "L", qty: 1, price: 120 },
            { name: "Sesh Socks (2-Pack)", size: "L/XL", qty: 1, price: 18 }],
    shipping: 0, status: "paid", invoice: "INV-1041", invoiceStatus: "paid", due: "2026-08-24"
  },
  {
    id: "420-1040", date: "2026-08-23", customer: "Dana Ruiz", email: "dana.ruiz@example.com",
    items: [{ name: "Terpene Joggers", size: "M", qty: 1, price: 85 }],
    shipping: 8, status: "paid", invoice: "INV-1040", invoiceStatus: "paid", due: "2026-08-23"
  },
  {
    id: "420-1039", date: "2026-08-22", customer: "Priya Raman", email: "p.raman@example.com",
    items: [{ name: "Midnight Windbreaker", size: "M", qty: 1, price: 140 }],
    shipping: 0, status: "pending", invoice: "INV-1039", invoiceStatus: "open", due: "2026-09-05"
  },
  {
    id: "420-1038", date: "2026-08-21", customer: "Alex Chen", email: "alex.chen@example.com",
    items: [{ name: "Vibrant Logo Tee", size: "M", qty: 2, price: 45 },
            { name: "Blazed Beanie", size: "ONE SIZE", qty: 1, price: 35 }],
    shipping: 0, status: "paid", invoice: "INV-1038", invoiceStatus: "paid", due: "2026-08-21"
  },
  {
    id: "420-1037", date: "2026-08-20", customer: "Jordan Blake", email: "j.blake@example.com",
    items: [{ name: "Smoke Signal Crewneck", size: "XL", qty: 1, price: 95 }],
    shipping: 8, status: "refunded", invoice: "INV-1037", invoiceStatus: "void", due: "2026-08-20"
  },
  {
    id: "420-1036", date: "2026-08-19", customer: "Sam Okafor", email: "s.okafor@example.com",
    items: [{ name: "Haze Snapback", size: "ONE SIZE", qty: 2, price: 40 }],
    shipping: 8, status: "paid", invoice: "INV-1036", invoiceStatus: "paid", due: "2026-08-19"
  },
  {
    id: "420-1035", date: "2026-08-18", customer: "Nina Alvarez", email: "nina.a@example.com",
    items: [{ name: "Vibrant Series Hoodie", size: "M", qty: 1, price: 120 },
            { name: "Terpene Joggers", size: "M", qty: 1, price: 85 }],
    shipping: 0, status: "paid", invoice: "INV-1035", invoiceStatus: "paid", due: "2026-08-18"
  },
  {
    id: "420-1034", date: "2026-08-16", customer: "Tomas Lind", email: "t.lind@example.com",
    items: [{ name: "Vibrant Logo Tee", size: "L", qty: 1, price: 45 }],
    shipping: 8, status: "pending", invoice: "INV-1034", invoiceStatus: "overdue", due: "2026-08-23"
  }
];

function orderSubtotal(o) {
  return o.items.reduce((s, i) => s + i.price * i.qty, 0);
}
function orderTotal(o) {
  return orderSubtotal(o) + (o.shipping || 0);
}

// Swap this for a real provider call. Async on purpose so the portal's render
// path already awaits it and will not need restructuring later.
async function fetchOrders() {
  return SAMPLE_ORDERS.map((o) => ({
    ...o,
    subtotal: orderSubtotal(o),
    total: orderTotal(o)
  }));
}

// True when the rows above are sample data rather than a live provider. The
// portal renders a banner off this so the numbers are never mistaken for real.
const USING_SAMPLE_DATA = true;

/* ===== Derived figures ===== */

function summarise(orders) {
  const counted = orders.filter((o) => o.status !== "refunded");
  const revenue = counted.reduce((s, o) => s + o.total, 0);
  const refunded = orders
    .filter((o) => o.status === "refunded")
    .reduce((s, o) => s + o.total, 0);
  const outstanding = orders
    .filter((o) => o.invoiceStatus === "open" || o.invoiceStatus === "overdue")
    .reduce((s, o) => s + o.total, 0);
  const units = counted.reduce(
    (s, o) => s + o.items.reduce((n, i) => n + i.qty, 0), 0);
  return {
    revenue,
    refunded,
    outstanding,
    orders: counted.length,
    units,
    avg: counted.length ? revenue / counted.length : 0,
    overdue: orders.filter((o) => o.invoiceStatus === "overdue").length
  };
}

/* ===== CSV export =====
 * Fields containing quotes, commas or newlines are escaped per RFC 4180 —
 * a customer name with a comma would otherwise shift every later column.
 */

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function ordersToCSV(orders) {
  const head = ["Order", "Date", "Customer", "Email", "Items", "Units",
                "Subtotal", "Shipping", "Total", "Status", "Invoice", "Invoice status", "Due"];
  const rows = orders.map((o) => [
    o.id, o.date, o.customer, o.email,
    o.items.map((i) => i.name + " (" + i.size + ") x" + i.qty).join("; "),
    o.items.reduce((n, i) => n + i.qty, 0),
    o.subtotal.toFixed(2), (o.shipping || 0).toFixed(2), o.total.toFixed(2),
    o.status, o.invoice, o.invoiceStatus, o.due
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

function downloadCSV(filename, csv) {
  // BOM so Excel reads UTF-8 names correctly instead of mangling accents.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fmtDate(iso) {
  const [y, m, d] = String(iso).split("-");
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return d + " " + (months[Number(m) - 1] || "") + " " + y;
}
