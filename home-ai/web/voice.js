// Voice for the Haven panel: the homeowner talks to Haven, Haven talks back.
//
// Uses the browser's built-in speech recognition and speech synthesis, so
// nothing is recorded or sent anywhere except the finished sentence, which
// goes to Haven like a typed message. Push-to-talk only: Haven never listens
// until the mic button is pressed.
//
// Where the browser can't listen (no support, no microphone permission, or
// a page that isn't HTTPS), the mic explains why and typing still works.

export function createVoice({ onInterim, onFinal, onState }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  let recognizer = null;
  let listening = false;
  let voice = null;

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
    if (canSpeak) speechSynthesis.cancel(); // barge in: stop talking when they start
    recognizer = new Recognition();
    recognizer.lang = navigator.language?.startsWith("en") ? navigator.language : "en-US";
    recognizer.interimResults = true;
    recognizer.continuous = false;
    recognizer.maxAlternatives = 1;
    let finalText = "";
    recognizer.onresult = (e) => {
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

  function speak(text) {
    if (!canSpeak || !text) return;
    speechSynthesis.cancel();
    // Read the words, not the symbols.
    const spoken = String(text).replace(/°F/g, " degrees").replace(/%/g, " percent").replace(/\n+/g, ". ");
    const u = new SpeechSynthesisUtterance(spoken);
    if (voice) u.voice = voice;
    u.rate = 1.02;
    u.pitch = 1;
    u.onstart = () => onState?.("speaking");
    u.onend = () => onState?.("idle");
    u.onerror = () => onState?.("idle");
    speechSynthesis.speak(u);
  }

  function silence() {
    if (canSpeak) speechSynthesis.cancel();
  }

  return { canListen, canSpeak, whyNot, listen, stopListening, speak, silence, isListening: () => listening };
}
