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
  contrast, QR wording, no prices).
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
- `assets/backgrounds/*.jpg` + `tops.json`, `assets/fonts/*.woff2`
- `examples/otis-williams.json`
- `previews/*.jpg`: the boards Otis reviewed
- `designs/plain/`: the four earlier plain designs and their generator
