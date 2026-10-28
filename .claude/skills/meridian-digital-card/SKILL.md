---
name: meridian-digital-card
description: >-
  Build a digital business card, the phone page a QR code opens, for Otis or for
  a Meridian Interface client. Use whenever Otis asks for a digital business
  card, virtual card, QR card, contact card page, "card like this template", a
  new background or color for his card, or wants to sell a digital card to a
  client. Carries the four approved layouts, six owned backgrounds in six
  colors, a build script, a recolor script and a phone screenshot check, plus
  the rules learned building Otis's own card (third-party template art, logo
  contrast, QR wording, no prices). "Wallpaper" in Otis's words means the
  card's own background, which the card owner chooses privately (like a phone
  wallpaper) and every visitor sees; the kit wires that up. It can also make
  optional downloadable phone and computer wallpapers.
---

# Meridian digital business card

A digital business card is one phone-width page: logo, name, role, one line on
what the person does, buttons to call, text, email, visit and book, a "Save to
contacts" file (.vcf), and a QR code that opens the page. Otis's own lives at
`meridianinterface.com/card/` (website repo `public/card/`), and his printed QR
code points there, so **always ship to that same address** when updating his.

Digital business cards are also a product Otis sells. For a client, build the
same page with their details, logo and colors, and host it on their site or as
a Meridian-hosted page. Never put a price on the card or in the email that
sends it; Otis negotiates price himself.

## Build one

```bash
KIT=.claude/skills/meridian-digital-card
python3 $KIT/scripts/build_card.py $KIT/examples/otis-williams.json out/ --layout 1 --background ribbon --palette blue
cd out && python3 -m http.server 4811 &          # serve, then check it
node $KIT/scripts/shoot.mjs http://127.0.0.1:4811 /tmp/shots .   # screenshot + sideways-scroll check at 390, 375, 320px
```

Look at the screenshot before showing anyone. The script measures, it does not see.

For Otis's live card: build with his example config (it uses the site's
`/fonts` and `/brand` paths), copy `index.html` and `bg.jpg` into the website's
`public/card/`, and set `"bg_url": "/card/bg.jpg"` in the config first. Then run
**meridian-prelaunch-qa** (both scripts) before pushing to main.

## Config fields (`examples/otis-williams.json`)

| Field | What it is |
|---|---|
| `name`, `company`, `role`, `location` | Shown on the card. |
| `tagline` | One line under the role (layout 1). |
| `tagline_long` | Longer line (layout 2). |
| `services_line` | What they offer (layout 4). |
| `phone` (E.164), `phone_display`, `email`, `website`, `website_display` | Contact buttons. |
| `booking_url`, `booking_label`, `booking_label_long` | The Book button. |
| `vcard_url`, `qr` | The .vcf file and the QR image (layout 3). |
| `logo` | `{mark, line1, line2}` for a mark plus live wordmark (Meridian), or `{image}` for a client's full logo. |
| `fonts_url` | Omit to copy the fonts next to the page; Otis's site uses `/fonts`. |
| `canonical`, `description`, `og_image`, `favicon` | Page and share-preview tags. |
| `layout`, `background`, `palette` | Defaults; the command-line flags override them. |

## The four layouts (`previews/four-layouts.jpg`)

1. **Template match.** Logo, name, role, line; white Call and Email pills and an
   accent Book pill; round Text, Website and Save buttons sitting over the art.
   Copied from the templates Otis liked. His favourite so far.
2. **Big name.** Name on two lines, white Book button, glass Call, Text, Email.
3. **Event QR.** QR code front and centre, for holding up a phone at events.
4. **Glass panel.** Every detail listed on a frosted panel over the art.

Older plain designs (Daylight, Meridian Line, Wallet Pass, Studio; no art
background) are in `designs/plain/` with `previews/plain-designs-A-D.jpg`.

## Backgrounds and colors

Six owned backgrounds in `assets/backgrounds/`, generated in Otis's Higgsfield
account with GPT Image 2.5 (medium, 2K, 9:16, 1 credit each, 26 Oct 2026):

| Name | Look | Higgsfield job |
|---|---|---|
| `ribbon` | Layered blue wave, lime lines | d2ccb584-3269-4df3-8d6a-70117f8294a1 |
| `light-trails` | Two glowing waves, darker | df80c932-6379-48e9-9392-90efcbdbedba |
| `liquid-glass` | Glossy glass waves | cd463514-9d91-4b09-9a99-18eebe90bdba |
| `glass-tower` | Office tower corner at dusk | 87545c8c-1174-494c-81c3-42a195f5d333 |
| `houston-skyline` | Downtown Houston, blue hour | 57cabcf6-e6f0-4fed-bff1-023574693d69 |
| `curved-facade` | Curved glass building | bb3ecf83-616c-4e4a-bb51-c958b74a0dab |

Palettes: `blue` (Meridian default), `purple`, `teal`, `gold` (charcoal and
gold), `red`, `sunset`. Ribbon and glass-tower already exist in every palette;
make any other with `python3 scripts/recolor.py <background> <palette>` (needs
numpy and opencv-python), which also refreshes `tops.json`. Recolors are free;
new art costs credits, so quote and wait for Otis's "go" first.

Background rules for any new art:
- Tall phone shape (9:16), the top 55 to 60 percent calm and empty for text,
  the subject in the bottom 40 percent. No text, signs or logos in the image.
- On phones the page shows the art at 112 percent height from the top, so the
  subject sits below the buttons. Check the round buttons of layout 1 do not
  land on a busy spot (they sit on the tallest towers of the skyline).

## The card's wallpaper: a background the owner chooses

This is what Otis means by "wallpaper": the background of the card itself. The
owner changes it the way they change a phone's wallpaper, and every visitor
sees the choice. Visitors cannot change it and there is nothing for them to
download. (A public "Get my wallpapers" page was built on 27 Oct by mistake,
went live on 28 Oct, and was taken down the same day at Otis's request.)

How it works on Otis's card (config fields in `examples/otis-williams.json`):

- `background_key` (`card.background`): the slot in the site's image-override
  store, the same store the portal's Photo Control publishes to. Reads are
  public; writes need the owner session. No server change was needed.
- `build_card.py` copies every built-in background to `<out>/bg/` (plus
  240px `bg/thumbs/` for the picker) and writes `card.js` from
  `assets/card-background.js`. The script sits in the head, not deferred, so
  the default never flashes before the owner's choice; it reads the saved
  choice, caches it, falls back to the default after 2.5 s, maps a built-in
  choice to its colours (the Book button turns gold with gold, and so on), and
  accepts an uploaded photo only from Supabase public storage.
- The picker: website `src/components/OwnerCardWallpaper.tsx` (with
  `src/data/cardBackgrounds.ts`), shown at the top of Photo Control in the
  Studio portal (footer, "Studio login"). Tap a background, upload a photo,
  or reset to Blue Ribbon.

For a client card: give it its own key (for example `card.<client>.background`)
and its own `background_public_base`. Until clients have their own login, Otis
sets their choice from his portal; a client self-serve picker needs a client
sign-in first.

## Optional: downloadable wallpapers (phone, laptop, desktop)

Not used on Otis's card (see above). A card can still offer downloadable wallpapers if a client wants them. For each background, six files:

| File | Size | What it is |
|---|---|---|
| `<bg>-phone-qr.jpg` | 1290x2796 | Lock screen: white card with the QR to the card page, name, role and logo. The top third stays clear for the clock and the bottom for the flashlight and camera buttons. The one to hold up at events. |
| `<bg>-phone.jpg` | 1290x2796 | Clean: the art and a small logo. |
| `<bg>-laptop.jpg` / `-laptop-clean.jpg` | 2880x1800 | 16:10 (MacBook): glass panel bottom left with QR, name, phone, email, site; or just a small logo bottom right. Kept clear of the Mac dock and Windows taskbar. |
| `<bg>-desktop.jpg` / `-desktop-clean.jpg` | 2560x1440 | 16:9 monitors, same two versions. |

```bash
node $KIT/scripts/wallpapers.mjs card.json $KIT/assets/wallpaper-plates out/wallpapers-files [ribbon houston-skyline ...]
python3 $KIT/scripts/wallpaper_page.py card.json out/wallpapers-files out/card/wallpapers --background ribbon --palette blue
```

`wallpaper_page.py` copies the files to `files/`, makes previews in `thumbs/`
(needs ffmpeg) and writes the page: a preview per background, download buttons
(Phone: lock screen with my QR, clean; Computer: laptop, desktop, and clean
versions), and how-to steps for iPhone, Android, Mac and Windows. Set
`wallpapers_url` in the card config and every layout shows a "Get my
wallpapers" button. Check the page with `shoot.mjs` and make sure every
download link answers 200.

Config fields for wallpapers: `wallpapers_url` (link on the card),
`logo_mark_file` and `qr_file` (local files the renderer reads; Otis's are in
`examples/`), optional `wallpapers_bg_url` (page background path when served
somewhere other than next to the page).

**QR codes for clients:** `pip install segno`, then
`python3 -c "import segno; segno.make('https://their-site/card/', error='m').save('qr.svg', border=1)"`.
Scan it with a phone before shipping. The QR always points at the card page.

**Plates** (`assets/wallpaper-plates/`): `<bg>-phone.jpg` is the original
1520x2688 art scaled to 2796 tall and centre-cropped; `<bg>-laptop.jpg` is a
1520x950 band of the original around the art, enlarged to 2880x1800 (the
desktop size is cut from it). The originals live in Otis's Higgsfield library
(job ids above). To add a palette's wallpapers, recolor the plates with the
same method as `recolor.py`.

Traps met building these: a page loaded with `setContent` cannot read local
`file://` images, so `wallpapers.mjs` writes each page to a file and opens it,
and stops if any picture failed to load; the logo row inside the white QR card
needs `margin:0` on its image or the card's centring splits the mark from the
name; AI upscaling (EDSR) takes about ten minutes per laptop plate here, so the
plates use a sharpened Lanczos resize instead (one, curved-facade, is EDSR).

## Rules learned the hard way

- **Never ship third-party template art.** Otis sent two template screenshots
  (a glass building, a blue and lime wave). Cut-outs of those were fine for
  previews only: the rights are unknown, and the building photo carried a real
  company's sign (Parkopedia) and a street plaque. Live cards use owned art.
- **Logo on dark art:** Meridian uses the mark plus live white text, never the
  lockup file (its wordmark is near-black). Never recolor the mark. A client's
  logo needs a light version or a plate behind it.
- **The QR code opens the card page.** Say "scan to open my card", not "scan to
  save my contact".
- **Recolor with a circular hue blend.** A straight blend through red (hue wrap)
  painted a hard orange band across the sunset version.
- **No em dashes** in visitor copy. **No prices** anywhere on a card.
- Use they/them for clients and third parties in copy and notes.
- The services line on Otis's card lists his five products: websites, online
  stores, booking systems, CRM, video ads. The live card (Oct 2026) still says
  "Websites · Dashboards · CRM · Logos" until he picks a design.

## Files

- `scripts/build_card.py` (build), `scripts/recolor.py` (palettes), `scripts/shoot.mjs` (check)
- `scripts/wallpapers.mjs` (wallpapers), `scripts/wallpaper_page.py` (the download page)
- `assets/wallpaper-plates/` (phone and laptop plates for the six backgrounds)
- `assets/backgrounds/*.jpg` + `tops.json`, `assets/fonts/*.woff2`
- `examples/otis-williams.json`, `examples/otis-williams-qr.svg`, `examples/meridian-mark.png`
- `previews/*.jpg`: the boards Otis reviewed
- `designs/plain/`: the four earlier plain designs and their generator
