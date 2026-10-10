// Haven's speaking voice.
//
// With ELEVENLABS_API_KEY set, the home server turns what Haven says into
// natural speech with ElevenLabs and the panels play it. Without a key (and
// in the browser demo), panels use the browser's built-in voice. The key
// never leaves the home server: panels ask /api/speech for audio.
//
// Only the words Haven is about to say are sent to ElevenLabs.
import fs from "node:fs";
import path from "node:path";

const API = "https://api.elevenlabs.io/v1/text-to-speech";

// The voices a homeowner can choose for their home (ElevenLabs library voices; samples of each
// are on the website and in docs/voice/). The choice is the household's: one setting, saved on the
// home server, used by every panel. HAVEN_VOICE_ID still sets any other ElevenLabs voice instead.
export const VOICES = [
  { id: "lily", name: "Lily D", about: "Clear, calm and warm", voiceId: "LtYRTlMfWU5Q6Me90AIR" },
  { id: "sia", name: "Sia", about: "Warm and gentle", voiceId: "CUvmi6RSy4BQr6vnMyEw" },
  { id: "richard", name: "Richard", about: "Deep and velvety", voiceId: "pCF9NkBQJrxUnQsbPkyR" },
  { id: "charlotte", name: "Charlotte", about: "Smooth and relaxed, British", voiceId: "I7QBbqvBcOGnmbD4D98p" },
];
// "Lily D": clear, calm, warm and unhurried; the guide's voice in the film, and the default.
export const DEFAULT_VOICE = VOICES[0].voiceId;
const MAX_CHARS = 1000;
const CACHE_SIZE = 40;

// Read the words, not the symbols (same rules as the browser voice).
export function spoken(text) {
  return String(text).replace(/°F/g, " degrees").replace(/°/g, " degrees").replace(/%/g, " percent").replace(/\n+/g, ". ").trim().slice(0, MAX_CHARS);
}

export class Speech {
  constructor({ env = {}, fetch = globalThis.fetch, apiUrl = API, dataDir = null } = {}) {
    this.key = env.ELEVENLABS_API_KEY || null;
    this.file = dataDir ? path.join(dataDir, "voice.json") : null;
    // The household's pick (saved), else HAVEN_VOICE_ID as given, else Lily D.
    this.choice = this.load() || (env.HAVEN_VOICE_ID ? null : VOICES[0].id);
    this.customVoice = env.HAVEN_VOICE_ID || null;
    this.model = env.HAVEN_VOICE_MODEL || "eleven_flash_v2_5"; // lowest latency
    this.fetch = fetch;
    this.apiUrl = apiUrl;
    this.cache = new Map(); // voice|spoken text -> audio, most recent last
    this.failures = 0;
    this.pausedUntil = 0;
  }

  get provider() {
    return this.key ? "elevenlabs" : "browser";
  }

  // The ElevenLabs voice id in use.
  get voice() {
    return VOICES.find((v) => v.id === this.choice)?.voiceId || this.customVoice || DEFAULT_VOICE;
  }

  load() {
    try {
      const id = this.file && JSON.parse(fs.readFileSync(this.file, "utf8")).voice;
      return VOICES.some((v) => v.id === id) ? id : null;
    } catch { return null; }
  }

  info() {
    return {
      provider: this.provider, voice: this.key ? this.voice : null,
      choice: this.choice, choices: VOICES.map(({ id, name, about }) => ({ id, name, about })),
    };
  }

  // The homeowner picks the home's voice (from the panel). Saved on the home server.
  setVoice(id) {
    if (!VOICES.some((v) => v.id === id)) throw Object.assign(new Error(`Unknown voice. Choose one of: ${VOICES.map((v) => v.id).join(", ")}.`), { statusCode: 400, expose: true });
    this.choice = id;
    if (this.file) {
      try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify({ voice: id })); }
      catch (err) { console.error(`Couldn't save the voice choice: ${err.message}`); }
    }
    return this.info();
  }

  // Audio for one thing Haven says: { audio: Buffer, contentType }.
  // Throws (with statusCode 503) when the panel should use its own voice.
  async synthesize(text) {
    const unavailable = (message) => Object.assign(new Error(message), { statusCode: 503, expose: true });
    if (!this.key) throw unavailable("No ElevenLabs key: use the browser's voice.");
    const words = spoken(text);
    if (!words) throw Object.assign(new Error("Nothing to say."), { statusCode: 400, expose: true });
    const voice = this.voice;
    const key = `${voice}|${words}`;
    if (this.cache.has(key)) {
      const hit = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, hit);
      return { audio: hit, contentType: "audio/mpeg" };
    }
    // After repeated failures (quota, outage), stop asking for a while.
    if (Date.now() < this.pausedUntil) throw unavailable("ElevenLabs is paused after errors: use the browser's voice.");
    try {
      const res = await this.fetch(`${this.apiUrl}/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
        method: "POST",
        headers: { "xi-api-key": this.key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: words, model_id: this.model }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`ElevenLabs returned ${res.status}`);
      const audio = Buffer.from(await res.arrayBuffer());
      this.failures = 0;
      this.cache.set(key, audio);
      if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value);
      return { audio, contentType: "audio/mpeg" };
    } catch (err) {
      if (++this.failures >= 3) { this.pausedUntil = Date.now() + 10 * 60_000; this.failures = 0; }
      throw unavailable(`${err.message || err}: use the browser's voice.`);
    }
  }
}
