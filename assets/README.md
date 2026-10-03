# assets/

Drop the Meridian Interface logo here to replace the placeholder SVG monogram
used on `marketing-system.html`.

`meridian-logo.png` is in place: the Meridian mark (the M without the wordmark,
which stays legible at 26-34 px), copied from the Meridian site's
`public/brand/meridian-mark.png`. Replace it to change the logo.

## To use your real logo

1. Add your logo image to this folder named exactly:

       assets/meridian-logo.png

   (A square PNG with a transparent or ivory background works best — it is
   displayed at 34×34 px in the header and 26×26 px in the footer, scaled to fit.)

2. That's it. The page automatically shows the file when it exists, and falls
   back to the built-in SVG monogram when it doesn't — no code change required.

To use a different filename or format, update the two `<img src="assets/meridian-logo.png">`
references in `marketing-system.html` (header and footer).
