// HTTP API for the Haven app (phone, tablet), Apple Shortcuts (Siri, Apple
// Watch, CarPlay, geofences) and anything else on the home network.
//
// Every /api route except /api/health needs the owner token, sent as
// "Authorization: Bearer <token>" (or ?token= for the live event stream,
// since browsers can't set headers on EventSource).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRoutes } from "./api.js";

const WEB_DIR = fileURLToPath(new URL("../web/", import.meta.url));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".json": "application/json", ".png": "image/png" };
const MAX_BODY = 64 * 1024;

export function createServer(home, { token }) {
  const failures = new Map(); // ip -> { count, since }
  const clients = new Set();

  home.bus.on("event", (e) => {
    const data = `data: ${JSON.stringify(e)}\n\n`;
    for (const res of clients) res.write(data);
  });

  const routes = createRoutes(home);

  function authorized(req, url) {
    const header = req.headers.authorization || "";
    const given = header.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("token") || "";
    const a = Buffer.from(given), b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function tooManyFailures(ip) {
    const f = failures.get(ip);
    if (!f) return false;
    if (Date.now() - f.since > 60_000) { failures.delete(ip); return false; }
    return f.count >= 10;
  }

  function noteFailure(ip) {
    const f = failures.get(ip) || { count: 0, since: Date.now() };
    f.count++;
    failures.set(ip, f);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const ip = req.socket.remoteAddress;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");

    if (!url.pathname.startsWith("/api/")) return serveStatic(url.pathname, res);

    if (url.pathname === "/api/stream") {
      if (!authorized(req, url)) return send(res, 401, { error: "unauthorized" });
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(": connected\n\n");
      clients.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
      req.on("close", () => { clients.delete(res); clearInterval(ping); });
      return;
    }

    const route = routes.find(([method, re]) => method === req.method && re.test(url.pathname));
    if (!route) return send(res, 404, { error: "not found" });
    const [, re, needsAuth, handler] = route;

    if (needsAuth) {
      if (tooManyFailures(ip)) return send(res, 429, { error: "too many attempts" });
      if (!authorized(req, url)) { noteFailure(ip); return send(res, 401, { error: "unauthorized" }); }
    }

    try {
      const body = req.method === "POST" ? await readJson(req) : {};
      const result = await handler(url, body, url.pathname.match(re));
      const status = typeof result?.status === "number" ? result.status : 200;
      send(res, status, result);
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.expose ? err.message : "Something went wrong." });
      if (!err.expose) home.bus.publish("server_error", { error: String(err.message || err) });
    }
  });
}

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); reject(Object.assign(new Error("Body too large"), { statusCode: 413, expose: true })); }
      else chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("Invalid JSON"), { statusCode: 400, expose: true })); }
    });
    req.on("error", reject);
  });
}

function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.normalize(path.join(WEB_DIR, rel));
  if (!file.startsWith(WEB_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(file).pipe(res);
}
