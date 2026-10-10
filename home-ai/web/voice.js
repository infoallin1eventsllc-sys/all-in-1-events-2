// Voice for the Haven panel: the homeowner talks to Haven, Haven talks back.
//
// Uses the browser's built-in speech recognition and speech synthesis, so
// nothing is recorded or sent anywhere except the finished sentence, which
// goes to Haven like a typed message. Push-to-talk only: Haven never listens
// until the mic button is pressed.
//
// Where the browser can't listen (no support, no microphone permission, or
// a page that isn't HTTPS), the mic explains why and typing still works.
//
// Speaking: when the home server has an ElevenLabs voice, `synthesize(text)`
// returns its audio and the panel plays that; if it returns nothing or the
// audio can't play, the browser's built-in voice says it instead.
//
// iPad and iPhone (Safari) only let a page make sound that starts inside a
// tap, and Haven's reply arrives after the tap. So the first touch unlocks
// both voices: a silent word for the browser voice, and a moment of silence
// on the one audio player every ElevenLabs clip then plays through.
//
// onLevel(0..1) drives the waveform from real speech signals only: words the
// recognizer hears, each word the browser voice says, and the loudness of
// the ElevenLabs audio (measured once the panel has been touched, since
// browsers keep audio processing asleep until then).

export function createVoice({ onInterim, onFinal, onState, onLevel, synthesize = null }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  let recognizer = null;
  let listening = false;
  let voice = null;
  let audio = null;     // the ElevenLabs clip playing now (its object URL is on `audio.src`)
  let speakSeq = 0;     // newest speak() wins
  let audioCtx = null;  // for measuring the clip's loudness
  let player = null;    // the one audio element every clip plays through, unlocked on the first touch
  let analyser = null;  // its loudness meter, once audio processing runs
  let talking = false;  // a reply is being spoken right now

  // A tenth of a second of silence, as a WAV file (blob: is allowed by the panel's CSP).
  function silentWav() {
    const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, "data"); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }

  // On the first touch: wake audio processing, and unlock both voices for later replies.
  let woken = false;
  const wake = () => {
    if (woken) return;
    woken = true;
    window.removeEventListener("pointerdown", wake, true);
    window.removeEventListener("keydown", wake, true);
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && !audioCtx) audioCtx = new Ctx();
      audioCtx?.resume?.();
    } catch { audioCtx = null; }
    try {
      if (canSpeak) {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        speechSynthesis.speak(u);
      }
    } catch { /* the browser voice will try again on the next reply */ }
    try {
      player = new Audio();
      const hush = silentWav();
      player.src = hush;
      const p = player.play();
      // The next clip replaces the source; until then the player just sits paused.
      const done = () => { if (player.src === hush) player.pause(); URL.revokeObjectURL(hush); };
      if (p?.then) p.then(done, done); else done();
    } catch { player = null; }
  };
  window.addEventListener("pointerdown", wake, { once: true, capture: true });
  window.addEventListener("keydown", wake, { once: true, capture: true });

  // Measure the clip as it plays. Only when audio processing is running:
  // routing sound through a sleeping context would silence it. The meter goes
  // on the shared player once (an element can be attached to only one meter).
  function measure(clip) {
    try {
      if (!onLevel || clip !== player || audioCtx?.state !== "running") return;
      if (!analyser) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        audioCtx.createMediaElementSource(clip).connect(analyser);
        analyser.connect(audioCtx.destination);
      }
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (clip.paused || clip.ended || audio !== clip) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const x of buf) { const d = (x - 128) / 128; sum += d * d; }
        onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5));
        requestAnimationFrame(tick);
      };
      clip.addEventListener("playing", () => requestAnimationFrame(tick), { once: true });
    } catch { /* no measurement; the waveform stays calm */ }
  }

  const canListen = Boolean(Recognition) && window.isSecureContext !== false;
  const whyNot = !Recognition
    ? "This browser can't listen. Type instead, or use Siri with the Haven shortcut."
    : window.isSecureContext === false
      ? "Voice needs a secure connection. Open Haven over HTTPS (for example with Tailscale) to talk to it."
      : "";

  function pickVoice() {
    if (!canSpeak) return null;
    const voices = speechSynthesis.getVoices().filter((v) => /^en(-|_)/i.test(v.lang));
    const preferred = ["Samantha", "Ava", "Allison", "Google US English", "Microsoft Aria", "Microsoft Jenny"];
    return preferred.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean) || voices.find((v) => v.localService) || voices[0] || null;
  }
  if (canSpeak) {
    voice = pickVoice();
    speechSynthesis.addEventListener?.("voiceschanged", () => { voice = pickVoice(); });
  }

  function listen() {
    if (!canListen) { onState?.("unavailable", whyNot); return false; }
    if (listening) { stopListening(); return false; }
    silence(); // barge in: stop talking when they start
    recognizer = new Recognition();
    recognizer.lang = navigator.language?.startsWith("en") ? navigator.language : "en-US";
    recognizer.interimResults = true;
    recognizer.continuous = false;
    recognizer.maxAlternatives = 1;
    let finalText = "";
    recognizer.onresult = (e) => {
      onLevel?.(0.85);
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      onInterim?.((finalText + interim).trim());
    };
    recognizer.onerror = (e) => {
      const msg = e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone access is off. Allow it in your browser settings, or type instead."
        : e.error === "no-speech" ? "I didn't hear anything. Tap the mic and try again."
        : e.error === "audio-capture" ? "No microphone found. Type instead."
        : "Voice didn't work that time. Try again or type.";
      onState?.("error", msg);
    };
    recognizer.onend = () => {
      listening = false;
      onState?.("idle");
      if (finalText.trim()) onFinal?.(finalText.trim());
    };
    try {
      recognizer.start();
      listening = true;
      onState?.("listening");
      return true;
    } catch {
      onState?.("error", "Voice didn't start. Try again or type.");
      return false;
    }
  }

  function stopListening() {
    try { recognizer?.stop(); } catch { /* already stopped */ }
  }

  function speakWithBrowser(text) {
    if (!canSpeak || !text) return;
    speechSynthesis.cancel();
    // Read the words, not the symbols, a sentence at a time: some browsers stop
    // a long utterance partway. Split only where a sentence ends ("71.5" stays whole).
    const spoken = String(text).replace(/°F/g, " degrees").replace(/%/g, " percent").replace(/\n+/g, ". ");
    const parts = spoken.replace(/([.!?])\s+/g, "$1\u0000").split("\u0000").map((t) => t.trim()).filter(Boolean);
    const mine = speakSeq;
    const end = () => { if (mine === speakSeq) { talking = false; onState?.("idle"); } };
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      if (voice) u.voice = voice;
      u.rate = 1.02;
      u.pitch = 1;
      if (i === 0) u.onstart = () => { if (mine !== speakSeq) return; talking = true; onState?.("speaking"); onLevel?.(0.6); };
      u.onboundary = () => onLevel?.(0.9);
      if (i === parts.length - 1) u.onend = end;
      u.onerror = end;
      speechSynthesis.speak(u);
    });
  }

  async function speak(text) {
    if (!text) return;
    const mine = ++speakSeq;
    silence();
    speakSeq = mine;
    let blob = null;
    try { blob = synthesize ? await synthesize(text) : null; } catch { blob = null; }
    if (mine !== speakSeq) return; // something newer was said meanwhile
    if (!blob) return speakWithBrowser(text);
    const url = URL.createObjectURL(blob);
    // A player wired to the meter is silent while audio processing sleeps: wake it first.
    if (analyser && audioCtx?.state !== "running") { try { await audioCtx.resume(); } catch { /* plays unmeasured */ } }
    if (mine !== speakSeq) { URL.revokeObjectURL(url); return; }
    const clip = player || new Audio();
    clip.src = url;
    audio = clip;
    let finished = false;
    const done = (fallback) => {
      if (finished) return;
      finished = true;
      URL.revokeObjectURL(url);
      if (mine !== speakSeq) return; // a newer reply (or a tap) already took over the player
      audio = null;
      talking = false;
      onState?.("idle");
      if (fallback) speakWithBrowser(text);
    };
    measure(clip);
    clip.onplaying = () => { if (mine === speakSeq) { talking = true; onState?.("speaking"); } };
    clip.onended = () => done(false);
    clip.onerror = () => done(true);
    try { const p = clip.play(); p?.catch?.(() => done(true)); } catch { done(true); }
  }

  function silence() {
    speakSeq++;
    if (audio) { const clip = audio; audio = null; clip.pause(); URL.revokeObjectURL(clip.src); }
    if (canSpeak) speechSynthesis.cancel();
    if (talking) { talking = false; onState?.("idle"); }
  }

  return { canListen, canSpeak, whyNot, listen, stopListening, speak, silence, isListening: () => listening };
}
