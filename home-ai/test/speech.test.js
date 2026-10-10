// Haven's ElevenLabs voice: the key stays on the home server, panels get
// audio, and any failure falls back to the browser's own voice.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Speech, spoken, DEFAULT_VOICE, VOICES } from "../src/speech.js";
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
  assert.deepEqual({ ...s.info(), choices: undefined }, { provider: "browser", voice: null, choice: "lily", choices: undefined });
  await assert.rejects(s.synthesize("hello"), (e) => e.statusCode === 503);
});

test("with a key: one request per new phrase, the default voice, cached repeats", async () => {
  const el = await fakeElevenLabs();
  try {
    const s = new Speech({ env: { ELEVENLABS_API_KEY: "xi-test" }, apiUrl: el.url });
    assert.equal(s.info().provider, "elevenlabs");
    assert.equal(s.info().voice, DEFAULT_VOICE);
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
    assert.equal(state.voice.voice, DEFAULT_VOICE);
    assert.deepEqual(state.voice.choices.map((v) => v.id), ["lily", "sia", "richard", "charlotte"]);
    assert.ok(state.voice.choices.every((v) => !("voiceId" in v)), "the choices carry names, not provider ids");
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

test("the homeowner chooses the home's voice: it is used, cached apart, and saved", async () => {
  const el = await fakeElevenLabs();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haven-voice-"));
  try {
    const s = new Speech({ env: { ELEVENLABS_API_KEY: "xi-test" }, apiUrl: el.url, dataDir: dir });
    assert.equal(s.info().choice, "lily");
    await s.synthesize("Goodnight.");
    const richard = VOICES.find((v) => v.id === "richard");
    assert.equal(s.setVoice("richard").choice, "richard");
    await s.synthesize("Goodnight.");
    assert.equal(el.calls.length, 2, "the same words in a new voice are a new request");
    assert.match(el.calls[1].url, new RegExp(`/${richard.voiceId}\\?`));
    // Saved on the home server: a restart keeps the choice.
    assert.equal(new Speech({ env: {}, dataDir: dir }).info().choice, "richard");
    assert.throws(() => s.setVoice("robot"), (e) => e.statusCode === 400);
    assert.equal(s.info().choice, "richard");
  } finally {
    el.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("HAVEN_VOICE_ID still sets a custom voice until the homeowner picks one", () => {
  const s = new Speech({ env: { ELEVENLABS_API_KEY: "k", HAVEN_VOICE_ID: "custom-voice" } });
  assert.equal(s.info().voice, "custom-voice");
  assert.equal(s.info().choice, null);
  s.setVoice("sia");
  assert.equal(s.info().voice, VOICES.find((v) => v.id === "sia").voiceId);
});

test("/api/voice sets the home's voice for every panel", async () => {
  const home = await testHome();
  const server = createServer(home, { token: "t" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: "Bearer t", "Content-Type": "application/json" };
  try {
    const set = await fetch(`${base}/api/voice`, { method: "POST", headers: auth, body: JSON.stringify({ voice: "charlotte" }) });
    assert.equal(set.status, 200);
    assert.equal((await set.json()).choice, "charlotte");
    assert.equal((await (await fetch(`${base}/api/state`, { headers: auth })).json()).voice.choice, "charlotte");
    const bad = await fetch(`${base}/api/voice`, { method: "POST", headers: auth, body: JSON.stringify({ voice: "x" }) });
    assert.equal(bad.status, 400);
    const noAuth = await fetch(`${base}/api/voice`, { method: "POST", body: JSON.stringify({ voice: "sia" }) });
    assert.equal(noAuth.status, 401);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
