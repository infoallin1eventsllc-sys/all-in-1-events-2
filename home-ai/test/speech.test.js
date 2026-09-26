// Haven's ElevenLabs voice: the key stays on the home server, panels get
// audio, and any failure falls back to the browser's own voice.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Speech, spoken, DEFAULT_VOICE } from "../src/speech.js";
import { createServer } from "../src/http.js";
import { testHome } from "./helpers.js";

function fakeElevenLabs({ fail = false } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push({ url: req.url, key: req.headers["xi-api-key"], body: JSON.parse(body || "{}") });
      if (fail) { res.writeHead(429); return res.end("quota"); }
      res.writeHead(200, { "Content-Type": "audio/mpeg" });
      res.end(Buffer.from("ID3-fake-mp3"));
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, calls, url: `http://127.0.0.1:${server.address().port}/v1/text-to-speech` })));
}

test("spoken text reads words, not symbols", () => {
  assert.equal(spoken("It's 71°F and 45% humidity.\nAll secure."), "It's 71 degrees and 45 percent humidity.. All secure.");
});

test("without a key, the panel uses the browser's voice", async () => {
  const s = new Speech({ env: {} });
  assert.deepEqual(s.info(), { provider: "browser", voice: null });
  await assert.rejects(s.synthesize("hello"), (e) => e.statusCode === 503);
});

test("with a key: one request per new phrase, the default voice, cached repeats", async () => {
  const el = await fakeElevenLabs();
  try {
    const s = new Speech({ env: { ELEVENLABS_API_KEY: "xi-test" }, apiUrl: el.url });
    assert.deepEqual(s.info(), { provider: "elevenlabs", voice: DEFAULT_VOICE });
    const a = await s.synthesize("It's 71°F inside.");
    assert.equal(a.contentType, "audio/mpeg");
    assert.equal(a.audio.toString(), "ID3-fake-mp3");
    assert.equal(el.calls.length, 1);
    assert.match(el.calls[0].url, new RegExp(`/${DEFAULT_VOICE}\\?output_format=`));
    assert.equal(el.calls[0].key, "xi-test");
    assert.equal(el.calls[0].body.text, "It's 71 degrees inside.");
    assert.equal(el.calls[0].body.model_id, "eleven_flash_v2_5");
    await s.synthesize("It's 71°F inside.");
    assert.equal(el.calls.length, 1, "a repeat is served from the cache");
  } finally {
    el.server.close();
  }
});

test("errors fall back to the browser voice, and repeated errors pause requests", async () => {
  const el = await fakeElevenLabs({ fail: true });
  try {
    const s = new Speech({ env: { ELEVENLABS_API_KEY: "xi-test", HAVEN_VOICE_ID: "custom-voice" }, apiUrl: el.url });
    for (const t of ["one", "two", "three"]) await assert.rejects(s.synthesize(t), (e) => e.statusCode === 503 && /429/.test(e.message));
    assert.match(el.calls[0].url, /\/custom-voice\?/);
    await assert.rejects(s.synthesize("four"), /paused/);
    assert.equal(el.calls.length, 3, "no request while paused");
  } finally {
    el.server.close();
  }
});

test("/api/speech returns audio to the panel, never the key", async () => {
  const el = await fakeElevenLabs();
  const home = await testHome();
  home.speech = new Speech({ env: { ELEVENLABS_API_KEY: "xi-secret" }, apiUrl: el.url });
  const server = createServer(home, { token: "t" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: "Bearer t", "Content-Type": "application/json" };
  try {
    const state = await (await fetch(`${base}/api/state`, { headers: auth })).json();
    assert.deepEqual(state.voice, { provider: "elevenlabs", voice: DEFAULT_VOICE });
    assert.ok(!JSON.stringify(state).includes("xi-secret"));

    const res = await fetch(`${base}/api/speech`, { method: "POST", headers: auth, body: JSON.stringify({ text: "Goodnight." }) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "audio/mpeg");
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "ID3-fake-mp3");

    const empty = await fetch(`${base}/api/speech`, { method: "POST", headers: auth, body: JSON.stringify({ text: " " }) });
    assert.equal(empty.status, 400);
    const noAuth = await fetch(`${base}/api/speech`, { method: "POST", body: JSON.stringify({ text: "hi" }) });
    assert.equal(noAuth.status, 401);

    home.speech = new Speech({ env: {} });
    const off = await fetch(`${base}/api/speech`, { method: "POST", headers: auth, body: JSON.stringify({ text: "hi" }) });
    assert.equal(off.status, 503);
  } finally {
    server.closeAllConnections?.();
    server.close();
    el.server.close();
  }
});
