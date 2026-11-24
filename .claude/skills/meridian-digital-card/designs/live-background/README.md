# Live card background (experiment, 24 Nov 2026)

`preview.html` (needs `ribbon.jpg` and `mark.png` beside it) shows Otis's card, layout 1, with a moving background:

- **Sunrise (default, added at Otis's request):** dawn sky over three layers of hills; the sun climbs for about 14 s and stops in clear sky below the round buttons (it hid behind them at first), then clouds and birds drift. Finger shifts the hills for depth; a tap sends a warm pulse of light. Pressing Sunrise replays it.
- **Live ribbon:** layered blue bands with lime and cyan glow lines, drawn on a canvas every frame. They drift on their own, rise toward the pointer or finger, and a tap on the background sends a ripple. Free: no generated art, no video file.
- **Living photo:** the owned ribbon.jpg with slight parallax that follows the finger and a soft light passing along it.
- **Today's card:** the still version, for comparison.

Respects reduced motion. Preview only, shared with Otis as a private artifact; not on the website. To ship: move the canvas into build_card.py as an optional background, keep the top 55 percent calm for text, run meridian-prelaunch-qa, and get Otis's OK.

## Realistic sunrise, still free (24 Nov 2026)
Otis asked for "more realistic, more amazing" at 1080 and chose to spend no credits (quotes he declined: 0.75 for a photo, 14 more for an 8 s video). The sunrise is now all code: stars fading at dawn, clouds from tileable noise textures tinted by the sun, three misty mountain ridges, a lake with a sun-glitter path, pine shoreline, vignette and fine grain. Sun climbs for 16 s and stops at 0.75 of the card height, between the round buttons (which sit near 0.69) and the ridge line. Tap sky = light pulse, tap lake = ripple.
Speed notes: a canvas blur filter and 3x device pixels halved the frame rate in testing; the canvas is capped at 2x and the cloud layer at 1.25x.

## Collection (24 Nov 2026)
The preview now has a theme picker fed by a `THEMES` list: Sunrise, Rocket launch, Sailing, Aurora, Dance party, Live ribbon, Living photo, Today's card. Each theme is `{id, name, canvas, draw(t, now), start?, tap?, hint}`. Product plan: `system/products/live-cards/PLAN.md`.
Trap: a tap's timestamp can be later than the frame's timestamp, so ages can be slightly negative; clamp before using them as a radius.

## Twelve themes (24 Nov 2026)
Added Mountain bike, Jet ski, Jets, Drag race, Night ride, Snowboarding, Fireworks; the picker groups themes by collection (`col` on each THEMES entry). All 60 fps in headless tests at 2x. Vehicles and people are drawn as clean illustrations (rear-view cars and motorcycle, line-built bicycle, planform jets); photo-real versions belong to the Cinematic tier.
Notes: scenes that loop on a clock keep their own start time (`start` hook) so a theme always opens at a good moment; taps reach a scene through `tap(now)` or the shared `ripples` list (`hop(now)` gives a 0 to 1 jump curve from the last tap).

## Max quality: Ocean sunrise (WebGL), 24 Nov 2026
Otis asked to push the code-drawn style as far as it can go. `drawOcean` is a per-pixel fragment shader (original, no art files) on a second canvas `#gl`: sky with a low sun and glow, noise clouds lit from the sun side, hazy mountains left and right of an open horizon, a normal-perturbed ocean plane with Fresnel sky reflection and a sun glitter path, tap ripples in the wave height, stars at dawn, filmic tone mapping, vignette and grain. The sun rises over 20 s. It is the default theme when WebGL is available (`glOK`); otherwise the picker simply omits it.
- First pass was washed out: the wide sun-glow lobe (`pow(sd,5)`) and half-coverage clouds greyed the whole sky. Fixed with narrower lobes, sparser clouds, darker zenith, a saturation lift and a stronger top shade for the white text.
- Quality adapts: the canvas starts at 2x and drops in steps to 0.5x when frames run slow. Headless Chromium renders it in software (about 100 ms a frame), so judge speed on a real phone, not in tests.
- The camera math in JS (`uy=.5-r.y+.30`, focal 1.2) must match the shader so tap ripples land under the finger.

## Video backgrounds from Otis's own ads (24 Nov 2026)
Two themes under "Your videos" play an mp4 in a `<video id="vid">` pinned to the bottom of the card (muted, loop, playsinline); the card behind takes the video's own ground colour (`bg`) and the top edge is feathered (`feather`, percent).
- `bg-pcflat.mp4`: the tall PC Flat cut cropped to its picture band, `crop=1080:757:0:483`, 864 px wide, crf 25, no audio, 0.57 MB.
- `bg-laptop.mp4`: the exploding-laptop reel, first 9.6 s only (the logo end plate starts fading in at 9.8 s and the card already carries the logo), `crop=1080:1040:0:450`, crf 26, no audio, 1.4 MB.
Why crop: the card's buttons cover roughly 0.34 to 0.72 of its height, so a full-frame 9:16 video hides its own action. A wide band at the bottom keeps everything visible.
Testing trap: `python3 -m http.server` has no range support, so setting `currentTime` in a test silently stays on the first frame; let the video play and wait instead.

## Sound (24 Nov 2026)
Both video backgrounds now carry their audio (AAC 112k, about -16 LUFS each; the laptop cut was 2.2 dB hotter and was turned down, with a 0.7 s fade-out so the loop does not cut off mid-note). Browsers refuse to auto-play sound, so the card always opens silent and a round speaker button (`#snd`, top right) unmutes on tap; switching to a theme without sound mutes again.
Trap: the HTML `hidden` attribute does not hide SVG child elements outside the artifact's reset, so the speaker icon's two states are switched with `style.display`.

## Interactive demo ad (24 Nov 2026)
`demo-ad.html` is the client-facing version of the preview: pitch ("The business card that moves."), the working card, a grouped background picker, four plain statements of what it does, and "Book a free 1-on-1" (links to `/?book=web_design`). Otis asked for an ad clients can click, touch and use, instead of a video. Differences from `preview.html`: the card's name is a `.nm` div so the page owns the only `h1`; the picker drops Living photo and Today's card and lists Signature, then "Your own video", then the collections; picking a background scrolls the card back into view on small screens. No prices, no em dashes.
Published as a private artifact for Otis. To reach clients it needs either sharing from the artifact's Share menu or a home on meridianinterface.com (his OK plus meridian-prelaunch-qa; the page needs the site's CSP checked for `<video>` and WebGL).

## Motorcycle video (24 Nov 2026)
`bg-moto.mp4`: Otis's 16:9 exploded-motorcycle clip, whole frame (a 16:9 picture is about 26 percent of the card's height, which is exactly the open zone under the buttons, so no crop), 1280x720, crf 26, 2.5 MB, loudness raised from -21.6 to -16 LUFS, picture and sound fade to black at the loop point because the clip starts wide and ends close. Added to both pages as "Motorcycle".
Caution before public use: the bike is styled like a well-known touring model and has a badge on the tank. A card or ad for a real client should not look like another brand's product; check with Otis where the clip came from.
