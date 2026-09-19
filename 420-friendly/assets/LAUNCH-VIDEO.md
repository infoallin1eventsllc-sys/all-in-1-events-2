# Launch video — Archive V.24

Raylight project: **420 FRIENDLY — Haze Snapback Launch**
Runtime **62.1s**, 16:9, 30fps. Built from Otis's picks on 2026-09-13;
the M1–M12 "more angles and motion" section was appended on 2026-09-19
and the whole timeline was reworked the same day to float instead of pop.

## Cut sheet

| # | Shot | In | Dur | Content | Camera |
|---|---|---|---|---|---|
| 1 | Shot 1 | 0.0s | 5.77s | Haze snapback macro | existing |
| 2 | Shot 2 | 5.77s | 4.32s | 420 FRIENDLY 3D emblem | existing |
| 3 | GREY SET | 10.08s | 3.0s | H10 hoodie + P10 pant | linear drift 1.0→1.03 |
| 4 | WHITE SET | 13.08s | 3.0s | P4 pant + H8 hoodie | static |
| 5 | CRIMSON FAMILY | 16.08s | 3.6s | H5 + P5 + C3 snapback + C5 bucket | linear drift 1.0→1.03 |
| 6 | MIDNIGHT BLACK SET | 19.68s | 3.0s | H11 hoodie + P11 pant | static |
| 7 | SIGNATURE | 22.68s | 3.4s | H7 hoodie solo | push-in to 1.7x @1.6s |
| 8 | End card | 26.08s | 3.0s | "420 FRIENDLY" | dolly settle |
| 9 | M1 · SIGNATURE TILT | 29.08s | 3.2s | H7 leaned 30° | linear drift 1.0→1.05 |
| 10 | M2 · GREY TILT | 32.28s | 2.6s | H10 leaned 24° + P10 | linear drift 1.0→1.06 |
| 11 | M3 · GREY LEG | 34.88s | 1.9s | P10 macro | push 1.8x @0.2s |
| 12 | M4 · WHITE TILT | 36.78s | 3.2s | H8 leaned −24° + P4 | linear drift 1.0→1.05 |
| 13 | M5 · CRIMSON TILT | 39.98s | 2.8s | H5 leaned 22° + P5 + C3 + C5 | linear drift 1.0→1.05 |
| 14 | M6 · CRIMSON HAT | 42.78s | 1.9s | C3 macro | push 1.6x @0.15s |
| 15 | M7 · BLACK TILT | 44.68s | 3.2s | H11 leaned −22° + P11 | linear drift 1.0→1.05 |
| 16 | M8 · BLACK CREED | 47.88s | 2.1s | H11 chest macro | push 1.55x @0.15s |
| 17 | M9 · HEADWEAR | 49.98s | 2.9s | three caps in a row | linear drift 1.0→1.05 |
| 18 | M10 · FOLDED | 52.88s | 3.0s | folded H13 + P12 | linear drift 1.0→1.04 |
| 19 | M11 · CLIMAX | 55.88s | 3.0s | H7 hero | push 1.95x @1.5s |
| 20 | M12 · END CARD | 58.88s | 3.2s | "420 FRIENDLY / ARCHIVE V.24" | linear drift 1.0→1.04 |

The old end card (#8) still sits mid-timeline at 26.08s. Otis has been
offered a ~45s clean cut — delete #3–#7 and move #8 to the end — and
has not decided.

All eleven picks appear. Captions are Inter 400 at 0.034 in #c5c5c5;
the end card is Inter 700 at 0.075 in brand green #00e639 with a white
shimmer sweep. Every product shot carries the same graded stack:
bloom 0.6/0.75, vignette 0.55, film grain 0.03, depth of field f/4
(SIGNATURE runs slightly hotter at 0.7 / 0.6 / f3.5).

## Asset map for the picks

| Code | Piece | Source |
|---|---|---|
| H5 | Crimson hoodie, 420 FRIENDLY block | `ac423a3f-c860-4d31-8af6-44069dfd3d72.jpg` |
| H7 | Black hoodie, green leaf logo + INDICA sleeve | `8f0f1053-c06b-4070-bd1c-a5eba9f803b8.jpg` |
| H8 | White hoodie, HYBRID sleeve | `f0913a1b-672c-4893-8601-e82554de8f6a.jpg` |
| H10 | Heather grey hoodie, 420 FRIENDLY | `40b1f575-9df7-4cea-80fb-6bb494b36ea3.jpg` |
| H11 | Black hoodie, IN CANNABIS WE TRUST | `478ead31-0182-4b45-ba14-f2746df16dc5.jpg` |
| P4 | White pant, HYBRID leg | `5497a789-f0e1-4e7c-a8eb-33f38e50948f.jpg` |
| P5 | Crimson pant, 420 FRIENDLY thigh | `a36cd53c-3359-4c9f-9335-640c2333b162.jpg` |
| P10 | Grey pant, 420 FRIENDLY | `4d73f780-6f9a-4d03-9bef-258db39eb319.jpg` |
| P11 | Black pant, BELIEVE IN CANNABIS leg | `56e84e06-9272-4737-8df7-c617d1e880db.jpg` |
| C3 | Crimson snapback, 420 HAZE | `372258c6-6001-432c-b11e-5c4ee0bb1d38.jpg` |
| C5 | Crimson bucket hat, 420 HAZE | `9c251e80-b723-43f4-8006-e05dec473fa9.jpg` |

## How every layer arrives and leaves (2026-09-19)

Otis's note was "popping too hard… it needs to float, everything in
balance, in sequence, all flowing together." The fix, applied to all
19 visual shots:

- **Images do not honour `set_entrance` / `set_exit`.** The op returns
  `ok:true` and stores nothing — `get_shot_details` shows no `entrance`
  on an image, and a still at 36ms into the shot is already full
  brightness. Only text layers use those recipes. Every garment had been
  hard-cutting in and out since the first build; that was the pop.
- What works on images is **animation blocks**
  (`add_animation`, `direction: "reverse"` = settle-in from `amount` to
  rest, `"forward"` = leave from rest to `amount`). Each image now has:
  opacity 0→rest 650ms ease-out, scale 0.965→rest 1000ms ease-out,
  position y −0.03→rest 1000ms ease-out (all starting at the layer's
  `inMs`); then opacity →0 over the last 480ms ease-in, and on hero
  images scale →1.02 over the same window so the float continues through
  the cut. Partner tiles keep their 200–640ms `inMs` offsets so they
  cascade.
- Captions: 820ms ease-out fade with a 0.02 rise; 520ms ease-in fade
  out. The four original set captions had `exit.durationMs: 0` — fixed.
- Camera: the M-section's 1.26–1.45x pushes were rejected by Raylight's
  linter as "camera wobble". Hero shots now run one full-length **linear**
  drift ≤1.06; macros keep committed pushes ≥1.55x.
- `set_shot_duration` extends a shot **in place** — the next shot does
  not move, so lengthening M1/M4/M7/M10 created 600–800ms overlaps where
  two shots rendered on top of each other. `reorder_shot` to the shot's
  *current* index re-packs the timeline end-to-end. Do that after any
  duration change.
- `apply_edits` takes at most 50 edits per call.

## Open

- One code in Otis's pick list read as **"hp"** and could not be matched.
  Eleven of twelve resolved; this one is still unplaced.
- Emerald Triangle is confirmed part of the 420 Friendly brand (a sub-line
  in development), not a separate label.
- The three temporary PICK boards have been deleted from the timeline.
  `PICKER.md` retains the code map if another round of picking is needed.
