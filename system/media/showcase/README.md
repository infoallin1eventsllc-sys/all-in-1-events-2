# Showcase backdrop (glass panes)

Otis's Higgsfield clip (three glass panes, threads of light, slow camera swing)
rebuilt from real screens, 7 Oct 2026. Large pane: meridianinterface.com. Phone
and tablet panes: all ten products, cutting every 1.2 s. 12 s seamless loop.

Rebuild (after the site or a demo changes):

1. Serve the website build: `npx vite preview --port 4799` in meridian-interface-website.
2. Capture: `node tools/capture.mjs http://localhost:4799 shots` (phone + tablet of
   every demo). The site screenshot `shots/site.png` is a 1440x900 capture of the
   home page at 1.333x with the demo bar hidden (see the session log).
3. Put three.js next to scene.html (`three.module.js` and `three.core.js`, r186).
4. Serve this folder (`python3 -m http.server 4811`) and render:
   `node tools/render.mjs http://127.0.0.1:4811/scene.html frames 24 12`
5. Encode: `ffmpeg -framerate 24 -i frames/f%04d.jpg -c:v libx264 -pix_fmt yuv420p
   -crf 22 -preset slow -tune animation -movflags +faststart -an showcase.mp4`

`tools/measure.mjs` reports where the panes reach across the loop; keep them
between 0.50 and 0.97 of the width so they never sit behind the headline.
Chromium needs `--use-angle=swiftshader` in a sandbox with no GPU.
