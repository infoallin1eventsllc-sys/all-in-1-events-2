---
name: meridian-social-video
description: Deliver every Meridian Interface video, ad, reel or commercial in all the social media shapes at once (9:16 Reels/TikTok/Shorts with text clear of the app buttons, 4:5 Instagram/Facebook feed, 1:1 square, 16:9 YouTube/LinkedIn/X/website). Use whenever a video or ad is made, re-cut or exported for Otis or a client, whenever Otis says a video "looks weird" on Instagram or another platform, or asks for a video "for all social media". Carries the safe zones, the layered build that makes four shapes from one render without new credits, the crop offsets, and the posting guide.
---

# Every video ships in every social shape

Otis's rule (6 Nov 2026): **any video or ad I make is delivered fitted for all
social media platforms**, not one shape. It came from the seminar ad looking
"really weird" on Instagram: it was 9:16 only, Instagram's feed cropped it to
4:5 and cut the captions, and on Reels the app's caption text and buttons sat
on top of ours.

Re-shaping is free: it is re-rendering, never new generation. Do not spend
Higgsfield credits on it. (A true widescreen shot, where the stage fills a
16:9 frame, needs new landscape clips: quote first and only if Otis wants it.)

## The four deliverables

| File suffix | Size | Post it to |
|---|---|---|
| `-9x16-reels-tiktok-shorts` | 1080 x 1920 | Instagram Reels and Stories, TikTok, YouTube Shorts, Facebook Reels and Stories, Snapchat, Pinterest video |
| `-4x5-instagram-facebook-feed` | 1080 x 1350 | Instagram feed post, Facebook feed, LinkedIn feed |
| `-1x1-square` | 1080 x 1080 | Feed ads, LinkedIn, X, anywhere that squares |
| `-16x9-youtube-linkedin-x-web` | 1920 x 1080 | YouTube (normal video), LinkedIn, X, the website, email links |

All: H.264 High, 30 fps, AAC 192k 48 kHz, `+faststart`, BT.709 tags, about
-16 LUFS. Keep under 60 s for Stories, under 3 min for Shorts.

## Safe zones (where text may go)

- **9:16:** keep captions, banners, phone numbers and URLs out of the top
  ~270 px and the bottom ~670 px (Reels/TikTok/Shorts put the account name,
  caption and buttons there), and away from the right ~140 px below mid-height
  (like/comment buttons). Captions live around y 1030 to 1250.
- **4:5:** Instagram's profile grid shows the middle 3:4, so keep text 50 px in
  from the left and right edges.
- **1:1 and 16:9:** nothing covers the frame; keep 60 px margins.
- End card: centre it in the safe area (in 9:16, lift it about 200 px).
- Never let a caption sit on the presenter's face: check the frames.
- Footage that carries its own burnt-in captions (the leads reel, client clips):
  switch our captions off while it is full-frame, or the two sets stack. In a
  crop that would cut its captions (1:1), show that stretch whole on the
  blurred fill instead (seminar ad: 28.6 to 31.7 s).

## How to build them (layered, one render)

Split the overlay into two layers:

1. **Scene layer:** everything that belongs to the picture (panels on the
   stage screen, phones, product tiles). Render once at the master size and
   composite onto the footage: `scene.mp4`.
2. **Text layer:** captions, top banner, end card. Render once per format at
   that format's size, laid out for its safe zone.

Then per format: crop (or fit) `scene.mp4` and lay the text layer on top.

- 9:16: scene as is.
- 4:5: `crop=1080:1350:0:Y` and 1:1 `crop=1080:1080:0:Y`. Pick Y so the panels
  and the speaker's head are both inside (seminar ad: 130 and 140).
- 16:9: never black bars. The vertical picture centred at full height over a
  blurred, darkened, stretched copy of itself
  (`scale=1920:-2,crop=1920:1080,boxblur=40:3,eq=brightness=-0.18`).

Working example: `system/promo-ad/seminar-ad/`:
- `panel.html` takes `#fmt=9x16|4x5|1x1|16x9&mode=scene|text`.
- `render.mjs` reads `FMT`, `MODE` and `OUT`.
- `formats.sh` builds all four from `base.mp4`, `reel.mp4` and `mix2.wav`.

Copy that pattern for new ads. For a video with no overlay layer (a plain
clip), the crop and blur steps alone still apply, but add captions per format.

## Check before handing over

- One frame from each format at the same moments (an opening caption, a
  product panel, the full-frame moment, the end card) in a contact sheet.
  Look for cut-off captions, panels cut by the crop, text on faces, and the
  end card fitting.
- Durations equal, audio present in all four.
- Upload all four to Otis's Higgsfield library (media_upload, PUT from the
  sandbox, media_confirm) and give him the links with the posting table above.

## Posting guide to give Otis

- Instagram: post the **9:16** as a Reel (it also shows in the feed and
  grid); use the **4:5** only for a regular feed post. Never post the 9:16 as a
  feed post.
- TikTok, Shorts, Stories: **9:16**.
- Facebook: Reels/Stories **9:16**, feed **4:5**.
- LinkedIn and X: **4:5** or **1:1** in the feed, **16:9** for a normal video.
- YouTube: **9:16** as a Short, **16:9** as a normal video.
- Website: **16:9** (or 9:16 inside a phone frame).

## The ending

Every Meridian video ends with Otis's logo light-up. Use the cleaned, silent file `system/promo-ad/end-card/meridian-logo-ending-clean-9x16.mp4` (never the raw cut `meridian-logo-lightup-9x16.mp4`, whose sound and first frames belong to another ad and read as a glitch; see that folder's README) (navy, the M lights up in blue, "MERIDIAN INTERFACE"), then that video's own product line and the blue meridianinterface.com pill, laid out like `reference-agent-crm-ending-9x16.mp4`. Never redraw the mark. See the README in that folder.

## 16:9 from a vertical video: no blurred sides

Otis does not like blurred side fill on 16:9 (12 Nov 2026). When the video sits on a plain ground, centre the 1:1 crop on that same colour (black for a black stage) instead. For the navy end card, crop 1080x1080 at y=360 so the whole M and its light streak are in frame, and carry the navy to both edges by stretching the outer 4 px columns. Use blur fill only when the footage has no plain ground, and tell Otis first.
