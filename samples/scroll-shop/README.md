# Scroll shop samples (experiments, not part of the site)

Three takes on shopping by scroll instead of a product grid: the shopper scrolls, the
scents arrive one at a time, and a voice says a line about each over soft music.
Nothing here is linked from the live site.

- `index.html` picks a sample.
- `float.html` **Sample A, Float.** Night page; each scent drifts in from a different side with its own glow.
- `stage.html` **Sample B, Stage.** One scent in the spotlight at a time; the stage is pinned and scrolling swaps the next one in. Dots on the right jump between products.
- `current.html` **Sample C, Current.** Ivory page; scrolling down carries the scents sideways in a slow stream.

Shared: `shop.css` (brand tokens, sound button, caption, cart toast), `shop.js` (catalogue, narration
timing, music loop with a gapless crossfade and ducking under the voice, captions, sample cart).

## Sound
Browsers never play audio before the visitor taps something, so every sample starts silent with a
**Sound on** button. With sound off the narration still appears as a caption. A product has to rest
on screen for 0.45 s before it speaks, so fast scrolling does not stutter through six voices.

- Voice: Higgsfield text-to-speech (Seed Audio 1.0), preset voice **Sloane**, seven lines in `audio/`
  (welcome + six products), trimmed and loudness-normalised to -16 LUFS. ElevenLabs was tried first
  (the voice used for the TikTok video) but the account's free tier is out of credits and blocked.
- Music: `audio/music.mp3`, the ambient felt-piano score written for the hero film (ElevenLabs Music,
  16 s, looped).
- Six products are included to keep the samples short; the catalogue in `shop.js` is easy to extend.

## Images
`img/*.webp` are the real product photos with the background removed (rembg, isnet-general-use) so the
products can float over the page. Harlem Smock was left out: its photo is a poster with lettering
baked in and does not cut out cleanly.
