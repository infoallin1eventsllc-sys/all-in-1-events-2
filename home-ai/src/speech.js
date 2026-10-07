// Haven's speaking voice.
//
// With ELEVENLABS_API_KEY set, the home server turns what Haven says into
// natural speech with ElevenLabs and the panels play it. Without a key (and
// in the browser demo), panels use the browser's built-in voice. The key
// never leaves the home server: panels ask /api/speech for audio.
//
// Only the words Haven is about to say are sent to ElevenLabs.
const API = "https://api.elevenlabs.io/v1/text-to-speech";

// "Lily D" (ElevenLabs library voice): clear, calm, warm and unhurried; the guide's voice in the
// film. Change it with HAVEN_VOICE_ID (a sample of the old "River" default is in docs/voice/).
export const DEFAULT_VOICE = "LtYRTlMfWU5Q6Me90AIR";
const MAX_CHARS = 1000;
const CACHE_SIZE = 40;

// Read the words, not the symbols (same rules as the browser voice).
export function spoken(text) {
  return String(text).replace(/°F/g, " degrees").replace(/°/g, " degrees").replace(/%/g, " percent").replace(/\n+/g, ". ").trim().slice(0, MAX_CHARS);
}

export class Speech {
  constructor({ env = {}, fetch = globalThis.fetch, apiUrl = API } = {}) {
    this.key = env.ELEVENLABS_API_KEY || null;
    this.voice = env.HAVEN_VOICE_ID || DEFAULT_VOICE;
    this.model = env.HAVEN_VOICE_MODEL || "eleven_flash_v2_5"; // lowest latency
    this.fetch = fetch;
    this.apiUrl = apiUrl;
    this.cache = new Map(); // spoken text -> audio, most recent last
    this.failures = 0;
    this.pausedUntil = 0;
  }

  get provider() {
    return this.key ? "elevenlabs" : "browser";
  }

  info() {
    return { provider: this.provider, voice: this.key ? this.voice : null };
  }

  // Audio for one thing Haven says: { audio: Buffer, contentType }.
  // Throws (with statusCode 503) when the panel should use its own voice.
  async synthesize(text) {
    const unavailable = (message) => Object.assign(new Error(message), { statusCode: 503, expose: true });
    if (!this.key) throw unavailable("No ElevenLabs key: use the browser's voice.");
    const words = spoken(text);
    if (!words) throw Object.assign(new Error("Nothing to say."), { statusCode: 400, expose: true });
    if (this.cache.has(words)) {
      const hit = this.cache.get(words);
      this.cache.delete(words);
      this.cache.set(words, hit);
      return { audio: hit, contentType: "audio/mpeg" };
    }
    // After repeated failures (quota, outage), stop asking for a while.
    if (Date.now() < this.pausedUntil) throw unavailable("ElevenLabs is paused after errors: use the browser's voice.");
    try {
      const res = await this.fetch(`${this.apiUrl}/${encodeURIComponent(this.voice)}?output_format=mp3_44100_64`, {
        method: "POST",
        headers: { "xi-api-key": this.key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: words, model_id: this.model }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`ElevenLabs returned ${res.status}`);
      const audio = Buffer.from(await res.arrayBuffer());
      this.failures = 0;
      this.cache.set(words, audio);
      if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value);
      return { audio, contentType: "audio/mpeg" };
    } catch (err) {
      if (++this.failures >= 3) { this.pausedUntil = Date.now() + 10 * 60_000; this.failures = 0; }
      throw unavailable(`${err.message || err}: use the browser's voice.`);
    }
  }
}
