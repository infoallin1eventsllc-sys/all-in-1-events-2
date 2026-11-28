---
name: reverse-engineer-video
description: "Turn a creator video into kept knowledge — load it whenever Otis pastes a TikTok, Instagram Reel or YouTube Short link, or asks to read, break down, reverse engineer, trace or 'make a skill out of' a video. It holds: how to get everything a video carries from this sandbox (caption, auto-captions, comments, the MP4, on-screen text by OCR, the linked guide or PDF) and which tool works when TikTok is blocked; how to trace each named feature to the mechanism behind it with a source, instead of guessing from its name; where the result lands so every later session finds it (the matching skill, the video library here, the plugin, a zip for claude.ai); and the honesty rules: never enter his email at a gate, read downloaded code before using it, check its licence, build nothing unless asked. Skip it for videos he only wants summarised, which need the read step alone."
---

# Reverse-engineer a video into a skill

Otis sends creator videos that show a build, a design rule or a tool. The
job is never to build what the video shows. It is to read everything the
video carries, trace how each feature works, and file what is worth keeping
where every later session finds it. `restraint` applies: most videos add a
section to an existing skill, not a new skill.

## Where things land, so they outlive the session

| What | Where |
|---|---|
| A rule, a look, a technique | The matching skill in `.claude/skills/` (`taste`, `dashboard-design`, `cinematic-web`, `scroll-reveal`, `remotion-video`, `apple-interface`, `img2threejs`). A new topic gets a new skill with a "Where this came from" section at the end |
| Every video read | A row in `references/library.md` here: date, creator and link, claim, how it was read, what was kept and where, what was dropped or is pending |
| Scripts | `scripts/` here. Never leave a working script only in a sandbox: the remote box resets between sessions |
| Making it reach other projects | `/sync-toolkit`, bump `version` in `plugin/meridian-toolkit/.claude-plugin/plugin.json`, commit, push. For claude.ai chats, zip the skill folder and send it; he uploads it at Settings → Capabilities → Skills |

## Read: get everything the video carries

TikTok and most creator domains are blocked from this sandbox
(`ENOTFOUND`). The tools, in the order that works:

1. **Composio's cloud machine** (`COMPOSIO_REMOTE_BASH_TOOL`). Reaches
   TikTok. Public content only: no keys, no client files, nothing private.
   It resets between sessions, so paste `scripts/tiktok_read.py` in with a
   heredoc each time (`cat > /tmp/tiktok_read.py <<'EOF' … EOF`), then
   `python3 /tmp/tiktok_read.py "<url>"`. It prints the caption, stats,
   English auto-captions, every comment (the creator's own comment usually
   holds the link) and saves the MP4 to `/tmp/video.mp4`. A 403 from the
   tool itself is the tool, not the site: retry with a shorter command.
2. **Frames and OCR** for on-screen text: lists, the URL shown at the end,
   code, UI labels. `scripts/frames_ocr.sh` samples 1.5 frames a second
   and prints the text that changes. To look at one frame, shrink it to
   200px wide JPEG (about 8 KB), base64 it, write the text into the
   scratchpad, decode it there and Read the JPEG.
3. **Follow the link**: pinned comment, on-screen URL (OCR), bio.
   `tinyurl` → resolve with `curl -o /dev/null -w "%{redirect_url}"`.
   Notion, tiiny.host, PDFs → Firecrawl reads the page; a PDF is read with
   `pypdf` on the remote box.
4. **An email gate** (enter your address, we send the link): stop and ask.
   Never enter his email anywhere.

Also available: vidIQ `vidiq_watch_shortform_content` gives a scene-by-scene
walkthrough for 10 credits (balance was 0 on 25 Oct 2026; call
`vidiq_balance` first). Firecrawl refuses `tiktok.com` outright but is right
for the linked pages. Web search for a pack by name usually finds nothing;
the creator's own domain, read off the last frame, is the better lead.

## Trace: how each feature works

For every feature the video names, write a card before writing any rule:

- **Name** and what the viewer sees.
- **Mechanism**: the library and the key technique. "Three.js scene, a
  raycaster on click, the drawer is HTML beside the canvas." "Remotion
  `<Sequence>` with a spring on scale." "A CSS backdrop-filter on the nav."
- **Source**: the creator's guide, PDF or repo when public; otherwise the
  underlying library's docs (Context7 or the vendor page), and say which.
  Neither available → mark **unverified: name only** and write no
  implementation. Eighteen effect names are not eighteen effects.
- **Evidence**: the transcript line, frame time or guide section.
- **Verdict**: keep, keep with a change, or drop, and why, against `taste`,
  `awesome-design`, `restraint` and `meridian-engineering` (no-build stack,
  tokens only, keys stay on the server).

Downloaded code: put it in its own empty directory, read every file before
using any of it, check the licence before it goes into the repo or plugin,
never run it from inside its own directory.

## File it

- Rewrite into Otis's rules; never paste the creator's prompt or copy as
  the rule. His tokens, his stack, his security rules win.
- End the receiving skill with a "Where this came from" paragraph: creator,
  date read, what was kept, dropped and changed.
- Record what was dropped and why, so the next session does not redo it.
- Add the library row, even for a video that produced nothing.

## Honesty

- A video is marketing. The comments and the creator's own guide are often
  more candid than the clip (valeridoesai's guide: "showpiece, not daily
  driver"). Read them and keep their caveats.
- "Claude can build X" is not "X works without a build". A connector that
  lets Claude read data is not a live feed on a published page.
- Never claim a feature works from its name, and never build it to find out
  unless he asks.

## Done check

- [ ] Caption, auto-captions, comments and frames read; link followed, or the gate reported and left to him.
- [ ] One card per named feature, each with a source and a verdict.
- [ ] Rules landed in the right skill; the library row is written.
- [ ] Plugin synced and version bumped; zip sent when he wants it in claude.ai.
- [ ] Nothing built.

## Where this came from

Written 26 Oct 2026 from four videos read in one session (see
`references/library.md`), after Otis asked that what is learned from a video
stay usable in every later session and that each feature be traced rather
than taken on faith.
