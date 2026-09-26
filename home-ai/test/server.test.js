// Starts the real `npm start` program twice to check first-run setup and
// that the house remembers its state across a restart (e.g. a power cut).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverJs = fileURLToPath(new URL("../src/server.js", import.meta.url));

function start(dataDir, port) {
  const child = spawn(process.execPath, [serverJs], {
    env: { PATH: process.env.PATH, HAVEN_DATA_DIR: dataDir, PORT: String(port), HOST: "127.0.0.1", HAVEN_OWNER_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const ready = new Promise((resolve, reject) => {
    const t = setInterval(() => { if (out.includes("Haven is running")) { clearInterval(t); resolve(); } }, 50);
    child.on("exit", (code) => { clearInterval(t); reject(new Error(`server exited ${code}: ${out}`)); });
  });
  return { child, ready, output: () => out };
}

const stop = (child) => new Promise((r) => { child.removeAllListeners("exit"); child.on("exit", r); child.kill("SIGTERM"); });

test("first start makes an owner token, and state survives a restart", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "haven-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  try {
    let s = start(dataDir, port);
    await s.ready;
    const token = s.output().match(/shown once\):\s*\n\s*(\S+)/)?.[1];
    assert.ok(token, "token printed on first start");
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, "secrets.json"), "utf8")).ownerToken, token);

    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const r = await fetch(`http://127.0.0.1:${port}/api/devices/light.porch`, { method: "POST", headers: auth, body: JSON.stringify({ command: { on: true, brightness: 35 } }) }).then((x) => x.json());
    assert.equal(r.status, "done");
    await stop(s.child); // stopped right away: shutdown must still save the change

    s = start(dataDir, port);
    await s.ready;
    assert.ok(!s.output().includes("shown once"), "token is not shown again");
    const state = await fetch(`http://127.0.0.1:${port}/api/state`, { headers: auth }).then((x) => x.json());
    const porch = state.rooms.flatMap((room) => room.devices).find((d) => d.id === "light.porch");
    assert.deepEqual([porch.state.on, porch.state.brightness], [true, 35]);
    const events = await fetch(`http://127.0.0.1:${port}/api/events`, { headers: auth }).then((x) => x.json());
    assert.ok(events.some((e) => e.type === "action" && e.device === "light.porch"), "activity log survives restart");
    await stop(s.child);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
