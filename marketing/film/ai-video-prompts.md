# AI video prompts: Secrets of Cint monochrome film

How to use these:
- Generate each shot separately, as 9:16 at 24fps, 4–8 seconds each.
- Upload the real product photo as the image reference or start frame, so the vessel and label match the actual product.
- Leave all lettering out of the AI footage. Add the logo, the scent names and the tagline afterward in the editor; the Clipkit project already has them typeset.

Every prompt ends with the same style lock:

> **Style lock:** no color, strictly monochrome black and white. Soft but rich contrast, deep blacks, luminous whites, shallow depth of field, fine film grain, high-end editorial look. Slow, fluid, unhurried camera, gentle easing. Quiet, intimate, mysterious, sophisticated. No text, no lettering, no logos, no captions on screen.

**Shot 1: the strike (6s).** Total darkness. In extreme close-up, a single wooden match strikes and slowly flares to life. Its soft flame gently lights the wick of a candle in a dark glass vessel, and the warm glow spreads slowly across the glass. Silvery highlights glide across the wax and the curve of the vessel. Sound: a match strike, then a faint flame crackle. *Style lock.*

**Shot 2: the collection (8s).** A slow orbit around a candle in a matte black vessel with a natural wood lid, resting on a polished black surface with a soft, subtle reflection. A delicate band of light sweeps slowly across the vessel and label texture. A thin ribbon of white smoke curls upward in slow motion and dissolves into the shadows. *Style lock.*

**Shot 3: glass and smoke (6s).** A gentle push-in on a lit candle in a clear glass vessel. The flame sways softly, and a slow ribbon of smoke rises and fades into darkness. Shallow focus pulls gently from the flame to the glass rim. *Style lock.*

**Shot 4: together (6s).** Three candles stand together on a polished black surface in soft, low-key light. The center candle is lit, and its flame glows and flickers gently. Reflections shimmer faintly on the surface. The frame slowly fades to black. *Style lock.*

**Score prompt (ElevenLabs Music, already generated):** 16 seconds, instrumental. Soft, sparse ambient felt piano over a low, warm drone pad, around 60 BPM. Intimate and mysterious, high-end fragrance commercial, ending on a soft resolving chord. No drums, no vocals.

---

# Cut B: the cinematic version (dynamic camera, speed ramps)

A second, more energetic take on the same 15 seconds. Same rules as above: generate each shot on its own, keep every bit of lettering out of the AI footage, and add the logo in the editor at the end. Generators cap out around 5–10 seconds per clip, so the film is three clips plus the logo card.

Every prompt ends with this style lock:

> **Style lock B:** strictly monochrome black and white, no color anywhere. Deep blacks, luminous whites, rich contrast, shallow depth of field, anamorphic lens feel with soft horizontal flares, subtle film grain, ultra-sharp photorealistic detail. Smooth, elegant motion with speed ramps (slow motion easing into gentle acceleration) and cinematic easing. Ultra-premium commercial look. No text, no lettering, no logos, no captions on screen.

**Shot B1: the strike (0–3s, generate 4s).** Pure black. In extreme macro, a wooden match strikes; sparks burst outward in slow motion. The flame ignites and a ripple of light spreads across a polished black surface, catching a faint reflection. *Style lock B.*

**Shot B2: the collection (3–10s, generate 8s, or two 4s clips).** A sweeping orbit around a collection of matte black candles in frosted glass with crisp silver highlights, on a polished black surface with glossy shimmering reflections. The camera ramps from a fast push-in into slow motion, then glides on a dolly across the candles. Flames flicker with glowing embers. Ribbons of white smoke swirl and twist in slow motion, wrapping around the glass. Light streaks and soft lens flares sweep across the vessels. Fine dust drifts through volumetric beams of light. Smooth match-cuts between close-ups of wax, flame and glass. *Style lock B.*

**Shot B3: the reveal (10–13s, generate 4s).** The camera pulls back to reveal the full collection in dramatic low-key lighting. The smoke gathers around the candles, the flames brighten for a beat, then everything softly dissolves into darkness, ending on a clean black frame. *Style lock B.*

**Logo card (13–15s, built in the editor, not generated).** Leave the AI end frame empty black. In the editor (CapCut, Premiere, DaVinci Resolve, or the Clipkit project) place the **Secrets of Cint** logo at center and fade it in over about 1 second in crisp white, with a gentle glow and a subtle light sweep across the lettering. (The brief said "Secret of Cint"; the site and the labels use "Secrets of Cint".)

Logo file rules:
- Use the sharpest logo available: a vector (SVG, PDF or AI) or a transparent PNG at 2000px wide or more. Generators warp lettering, which is why the logo is never in the AI shots.
- The only logo in the repo today is `assets/images/logo.jpg` at 480×480, which is too small for a 4K frame. Ask the client for the vector or the original artwork. If none exists, upscale it (Topaz Gigapixel, Magnific, Adobe Super Resolution) or redraw it as a vector before placing it. The wordmark itself can also be typeset in Cormorant Garamond, as the first film does; type stays sharp at any size.
- Export the finished film at 4K (2160×3840 for 9:16, 3840×2160 for 16:9) so the logo stays crisp.

**Sound for Cut B (ElevenLabs, all available on the current plan):**
- Score: 16 seconds, instrumental. Deep, slow ambient score: a low sub drone with soft evolving pads and a faint distant piano note, around 55 BPM. Dark, luxurious, cinematic, ending on a held chord that fades. No drums, no vocals.
- SFX: a soft cinematic whoosh (0.8s) for each transition; a faint flame crackle bed (10s); the match strike already in `sfx-match-strike.mp3`.

**If the footage is generated with real product photos as the reference**, use the three cutouts in `cutouts/` as start frames so the candles match the actual products instead of a generic matte-black candle.
