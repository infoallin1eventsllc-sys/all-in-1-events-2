/* 420 FRIENDLY — owner portal helpers.
 *
 * Deliberately holds NO order data. Orders used to sit in this file, which is
 * served to anyone who asks for it; once real customer names and emails replace
 * the samples that would be a data leak by construction. They now come from
 * `/.netlify/functions/owner-orders`, which returns nothing without a verified
 * Identity token and the owner role.
 *
 * What is left here is arithmetic and formatting — safe to be public.
 */

const ORDERS_ENDPOINT = "/.netlify/functions/owner-orders";

// Resolves { orders, sample, viewer }. Throws with a message worth showing.
async function fetchOrders() {
  let res;
  try {
    res = await authedFetch(ORDERS_ENDPOINT);
  } catch {
    throw new Error(
      "Could not reach the orders service. On a local static server this is expected — " +
      "functions only run on the deployed site."
    );
  }

  if (res.status === 404) {
    throw new Error(
      "The orders function is not deployed. It runs on Netlify, not on a plain static server."
    );
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    throw new Error("The orders service returned an unreadable response.");
  }

  if (!res.ok) throw new Error(data.message || data.error || "Could not load orders.");
  return data;
}

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
