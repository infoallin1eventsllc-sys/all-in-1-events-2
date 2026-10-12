# Scroll shop samples (experiments, not part of the site)

Three takes on shopping by scroll instead of a product grid: the shopper scrolls, the
scents arrive one at a time, and a voice says a line about each over soft music.
Sample A (Float) is now on the live site, directly under the hero film (`assets/js/scroll-shop.js`); the other two stay here as alternatives.

- `index.html` picks a sample.
- `float.html` **Sample A, Float.** Night page; each scent drifts in from a different side, settles
  beside its words, lights up while the voice speaks, and floats a little slower than the page (depth).
- `stage.html` **Sample B, Stage.** One scent in the spotlight at a time; the stage is pinned and
  scrolling raises the next one into the light as the last sinks away. Dots on the right jump between products.
- `current.html` **Sample C, Current.** Ivory page; scrolling down carries the scents sideways in a slow
  stream. Each pauses in the middle while the voice speaks, bobbing gently, then drifts on.

Shared: `shop.css` (brand tokens, product plate, sound button, caption, cart toast), `shop.js`
(catalogue of nine products, narration timing, music loop with a gapless crossfade and ducking under
the voice, captions, sample cart), and per-page `float.js` / `stage.js` / `current.js` (the motion;
external files because the deploy CSP blocks inline scripts).

## Pictures
`img/night/<id>.webp` and `img/ivory/<id>.webp` are studio packshots of each product, generated with
Higgsfield (Nano Banana Pro, the real product photo as the image reference so the label is the real
label) on a seamless ground that is the page colour: pure black for Float and Stage, the site's ivory
for Current. `process.py` (kept with the session notes) then forces the ground to exactly `#000000`
or `#FAF8F5` and feathers the frame edges into the page, so the product sits *on* the page with no
box around it. Each plate carries its own glow in the product's tone, a light sweep when it lands,
and a slow breathe while it is being talked about.

## Sound
Browsers never play audio before the visitor taps something, so every sample starts silent with a
**Sound on** button. With sound off the narration still appears as a caption. A product has to rest
on screen for 0.45 s before it speaks, so fast scrolling does not stutter through nine voices, and the
voice waits until the first scent is actually on screen.

- Voice: Higgsfield text-to-speech (Seed Audio 1.0), preset voice **Sloane**, ten lines in `audio/`
  (welcome + nine products), trimmed and loudness-normalised to -16 LUFS. ElevenLabs was tried first
  (the voice used for the TikTok video) but the account's free tier is out of credits and blocked.
- Music: `audio/music.mp3`, the ambient felt-piano score written for the hero film (ElevenLabs Music,
  16 s, looped).

## Products
Moon Flower, Brewed Elixir, Inferno Dreams, Exotic Peach and Harlem Smock (signature candles), Exotic
Peach, Amber Blush and Moon Flower (room sprays), No.7 Citrus Grove (reed diffuser). Prices are
placeholders until the client confirms them.
