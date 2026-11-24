# Meridian Live Cards: product plan (draft, 24 Nov 2026)

Otis's idea: sell digital business cards whose background is alive and reacts to touch, in every theme a client could want (avatars, cars, motorcycles, boats, rockets, planes, jets, jet skis, snowboarding, mountain biking, racing of all kinds, animation, spirituality, dancing, fun, outdoors).

## What exists today
Working preview (private artifact, source in `.claude/skills/meridian-digital-card/designs/live-background/preview.html`), all drawn by code, 0 credits:
twelve Live Art backgrounds in seven collections. Nature and outdoors: Sunrise, Mountain bike. Water: Sailing, Jet ski. Sky and space: Rocket launch, Jets. Motorsport: Drag race, Night ride (motorcycle). Snow and mountain: Snowboarding. Spirit: Aurora. Fun and party: Dance party, Fireworks. Plus the Meridian classics (Live ribbon, Living photo). Each reacts to a finger and to taps; text and buttons stay readable; reduced-motion phones get a still.

## Two ways to make a background
| | Live Art (code) | Cinematic (video) |
|---|---|---|
| Look | Polished illustration | Photo-real |
| Cost to make | 0 credits, about an hour of build time each | About 14.75 Higgsfield credits each at today's quote (0.75 picture + 14 for an 8 s clip) |
| Reacts to touch | Fully (waves lift, ripples, launches) | Light effects on top of the video only |
| Loads | Instantly, no file | 1 to 3 MB video, needs a poster frame |
| Best for | Nature, space, water, abstract, party, spiritual | Real cars, motorcycles, jets, people, avatars |

Rule from the card skill still applies: only owned or generated art, never third-party footage or real brands' logos, cars with badges removed.

## Collections (the catalog)
1. Nature and Outdoors: sunrise, ocean, forest, snowfall, campfire, mountain biking trail.
2. Water: sailing, jet ski, speedboat, surf.
3. Sky and Space: rocket launch, jets, planes, aurora, night sky.
4. Motorsport: drag strip, circuit racing, motorcycle racing, off-road.
5. Snow and Mountain: snowboarding, skiing, peaks.
6. Spirit: aurora meditation, candlelight, stained-glass light, sunrise prayer.
7. Fun and Party: dance floor, confetti, fireworks, arcade.
8. Avatars and Animation: the client as an animated character in any scene (Cinematic or custom).

## Product tiers (prices are Otis's to set; none are written here)
- **Classic card:** still background (what the card kit ships today).
- **Live card:** pick any Live Art background from the catalog.
- **Cinematic card:** a photo-real video background from the catalog.
- **Signature card:** made for one client: their car, their boat, their avatar, their colors.
- Add-ons: extra backgrounds to switch between, seasonal swaps, matching social pictures and the share preview.

## What has to be built to sell it
1. Move the engine into `build_card.py`: a `live_background` option that writes one small script per theme (no change to cards that don't use it).
2. Catalog page on meridianinterface.com where a visitor can try every background on a sample card. Needs Otis's OK and meridian-prelaunch-qa.
3. Owner picker: add the live backgrounds to the existing card background picker in the Studio portal.
4. Cinematic pipeline: prompt template, poster frame, loop trimming, compression target, fallback to a still.
5. Client sign-in so clients can switch their own background (today Otis sets it for them).
6. Samples for selling: a short video of each background for social posts and the pitch email.

## Suggested order
The first 12 Live Art themes are done (24 Nov). Next: ship Otis's own card with one, build the catalog page, then add Cinematic themes as clients ask for them so credits are only spent on paid work.

## Higgsfield quotes for Cinematic versions (24 Nov 2026, nothing generated)
Per background, 9:16, silent: picture (gpt_image_2_6) 0.75 credits, plus the video:
| Video setting | Video | Per background | All 12 |
|---|---|---|---|
| Kling 3.0 standard, 5 s | 7.5 | 8.25 | 99 |
| Kling 3.0 pro, 5 s | 8.75 | 9.5 | 114 |
| Kling 3.0 standard, 8 s | 12 | 12.75 | 153 |
| Kling 3.0 pro, 8 s | 14 | 14.75 | 177 |
| Kling 3.0 4K, 8 s | 48 | 48.75 | 585 |
| Seedance 2.5 720p, 8 s | 56 | 56.75 | 681 |
| Seedance 2.5 1080p, 8 s | 128 | 128.75 | 1,545 |
Balance at the time: 799.86 credits. Quotes were taken without a start picture attached, so re-quote each one before generating. Allow roughly half again for retakes. Otis must approve before any spend.
