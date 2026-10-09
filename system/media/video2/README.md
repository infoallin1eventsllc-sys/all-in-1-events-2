# Video 2 hero backdrop (the light square)

Otis's own Higgsfield clip `hf_20261007_010907_7a0a3c5a` (5 s, 24 fps). Nothing was
generated for this; the file came from his gallery.

The clip has two hard cuts (frames 40-41, the light frame flying through the camera, and
77-78, the cut to the settled square), so playing it forward and back would replay them
backwards. The backdrop uses the settled square only (frames 79-121).

Rebuild: extract the frames (`ffmpeg -i clip.mp4 -pix_fmt rgb24 full/%03d.png`), keep
`grade_lut.npy` beside them (the navy grade, learned per channel from the earlier approved
polish; it matches it to 3.5 levels), then `python v2loop.py <dir>`: half speed, forward
then back with 24-frame eased turnarounds, in-betweens blended by optical flow, 216 frames
= 9 s. Encode H.264 crf 20 and VP9 1.4 Mbps two-pass; poster is frame 000.

On the site (branch `preview/hero-video2`): wide screens place the clip 20% right with a
feathered left edge, so the square holds the right half beside the headline, and the demo
cards are not rendered there; below lg the hero is unchanged.
