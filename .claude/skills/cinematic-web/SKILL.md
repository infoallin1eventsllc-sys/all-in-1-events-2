---
name: cinematic-web
description: "How to make a landing page look expensive — load it whenever a hero, a landing page, or a client site needs to read premium, cinematic, or enterprise-grade, and whenever a request reaches for video, imagery, or a generation tool to get there. It holds: the ranking of hero media by what actually reads high-end (coded motion, then real footage, then composed sequence, then generated clip last) and why that order surprises people; the weight budget a hero has to hit and what blows it; the four techniques that read cinematic and cost nothing — grade, grain, depth, load choreography; the tells that mark a site as cheap no matter the budget, including AI-generated hero imagery; and which of Otis's connected tools does which of these jobs. Use it before choosing a hero treatment, before proposing or buying a generation tool for a website, before adding video to a page, and whenever the goal is stated as Fortune 500, premium, luxury, or high-end. Skip it for internal tools, dashboards, documents, and pages with no marketing surface."
---

# Making a page look expensive

The instinct is that premium comes from richer assets. It comes from
restraint, weight discipline, and four cheap techniques. The most expensive
thing on most premium sites is the whitespace.

## Hero media, ranked by what actually reads high-end

Counter-intuitive, and load-bearing. Work down this list; stop at the first
one the brief can support.

**1. Coded generative motion.** A canvas or SVG composition drawn in code.
Reads as bespoke because it is, weighs almost nothing, stays sharp at any
pixel density, re-themes with the palette, and can hold still gracefully for
reduced-motion and Save-Data.

The proof is `HeroBackdrop.tsx` in the Meridian site: a wireframe globe that
replaced a 16-second Earth clip. About 1.4 MB of video and poster became
about 9 KB of code, with no loss in the look. Its one real cost is CPU where
video used hardware decode, paid down with visibility checks so nothing draws
while scrolled away or backgrounded.

**2. Real footage, properly graded.** Unbeatable when the subject is the
proof. For All in 1 Events, footage of an actual room Otis lit outranks any
generated shot, because the page's job is to convince someone he can do it.
Grade it, cut it short, mute it, loop it.

**3. Composed sequence.** Branded motion assembled from real assets, exact
and repeatable. The studio reel is this: rendered by Clipkit from an approved
composition, two cuts, served from the studio's own bucket.

**4. Generated clip or image.** Last, and narrow. Legitimate for abstract
texture, light, a concept board, a mood piece where no footage exists and
none can be filmed. Never to depict work that was not done.

## The weight budget

A hero asset is the largest thing above the fold, so it decides whether the
page feels fast. Fast is most of what "premium" means on a phone.

| Treatment | Target | Notes |
|---|---|---|
| Coded motion | under 20 KB | The whole composition, as code |
| Looping background video | under 1.5 MB | WebM first, MP4 fallback, muted, poster frame |
| Hero still image | under 200 KB | AVIF or WebP, correctly sized, never a 4K JPEG |
| Total above the fold | under 1 MB | Everything: fonts, CSS, hero, first paint |

Blowing this is the most common way an expensive-looking design ships as a
slow site, which reads as cheap regardless of the art.

## The four techniques that read cinematic and cost nothing

These, not the asset, are what separates a nice page from an expensive one.

**Grade.** Real film has a colour cast. Push the whole frame toward one
temperature and crush the blacks slightly. A `filter` or a blend-mode overlay
in the brand accent unifies mismatched footage and stock into one look.

**Grain and vignette.** A 2–4% noise overlay and a soft corner falloff. It
kills the plastic digital flatness that marks a page as templated. Cheap in
CSS, enormous in effect.

**Depth.** Two or three layers moving at different rates, subtly. Cinematic
means the frame has dimension. Keep it under about 20 px of travel or it
reads as a parallax gimmick from 2014.

**Load choreography.** What the page does in its first 600 ms. One
orchestrated reveal — hero settles, headline rises, accent arrives last —
reads as directed. Scattered fade-ins on eight elements read as a template.
One moment, not eight.

## The tells that mark a site as cheap

No budget fixes these, and a better generator makes several worse.

- **Generated hero imagery.** The look is now recognisable on sight and reads
  as a placeholder nobody replaced. This is the direct answer to "should I buy
  a better image generator to look premium": a better generator produces a
  more polished version of the thing that signals low budget.
- Stock photos of people in a meeting who are not the client's people.
- More than one accent colour fighting for the same attention.
- Text set over a busy image with no scrim, so it is unreadable at some widths.
- Autoplaying anything with sound.
- Five different easings, because motion was added per component.
- A carousel. Nobody clicks past the first slide.
- Fabricated numbers, logos of clients who are not clients, invented awards.

## Which tool for which job

| Job | Reach for |
|---|---|
| Bespoke hero motion | Write it. Canvas or SVG, seeded, themed from tokens |
| Grade, grain, retouch a real frame | **Adobe for creativity** |
| Cut and caption real footage | **Descript** |
| Branded sequence from real assets | **Clipkit**, or **HyperFrames** for HTML compositions |
| Social cuts and thumbnails | **vidIQ** |
| Abstract texture or a concept shot with camera movement | **Higgsfield** (custom connector, spends credits) |
| Typeface pairing for a premium ramp | **Adobe** — `font_recommend`, `font_preview` |
| See how real premium products solve a surface | **Mobbin** |

## The Apple tier, and how it is actually made

Otis names Apple as the bar. Worth being precise about what Apple does,
because the obvious reading of "generated to perfection" points the wrong way.

**Apple's product imagery is rendered, not prompted.** It comes out of the
CAD files the product was designed in — the same geometry the factory builds
from. That is why it is perfect: exact edges, exact materials, any angle, any
lighting, repeatable to the pixel, and ready months before a physical unit
exists. It is generated the way an architect's rendering is generated, from a
model, not the way a prompt generator is. Those two things share a word and
nothing else. Prompt generation is non-deterministic and uncontrollable, which
is the opposite of the property that makes Apple's imagery look the way it
does.

**This route is open to Otis, with tools already connected.** His products are
rooms and interfaces, and both can be modelled:

| Apple does | Otis's equivalent |
|---|---|
| Renders the phone from CAD | Model the lounge set, truss, booth, uplighting — **Trimble SketchUp** (`build_model`), or **Three.js 3D Viewer** via the `img2threejs` skill |
| Studio-lights the render | Light the scene in the model: key, fill, rim, at real-world scale |
| Exports frames at every angle | Render a turntable or a dolly move as a numbered frame sequence |
| Retouches and grades | **Adobe for creativity** |

For All in 1 Events this is stronger than it sounds: a modelled set can be
shown before it is built, which is a sales tool, not just a graphic.

**The signature scroll move.** Apple's product pages scrub a pre-rendered
image sequence as you scroll — typically 60–150 frames drawn to a `<canvas>`,
with scroll progress selecting the frame index and the section pinned while it
plays. It looks like video but obeys the scroll wheel, which is why it feels
authored rather than played. It is fully reproducible: render the frames from
the 3D model above, then scrub them.

The discipline that makes it work, and the reason most copies feel broken:
- Small frames. Size them to their displayed box, not to 4K.
- Preload on idle with `Promise.all`, and never draw a frame that has not
  finished decoding.
- Cap the device pixel ratio so retina stays crisp without exploding memory.
- Provide a static poster and skip the sequence entirely under
  `prefers-reduced-motion` or Save-Data.
- Count the total payload against the budget above. A careless sequence is
  several megabytes and undoes everything.

**The half that is not imagery, and is most of the effect.** Type-led layout at
display sizes with tight tracking. Near-monochrome, so the only colour in
frame comes from the subject. One idea per full-viewport section. Enormous
whitespace. Sticky sections where the copy changes and the image holds.

That half costs nothing, needs no renders, and is where a page most often
fails to reach the bar. Copy it first.

**Honest limit.** Apple runs a large team on an unlimited budget with the
actual CAD files. The techniques copy exactly; the volume does not. Aim for
one page with one rendered sequence done properly, rather than a whole site of
half-rendered ones.

## The check before calling it premium

Run `awesome-design`'s four questions — squint, grayscale, phone, stranger —
and add two:

5. **Throttle.** Does it still feel fast on a simulated 3G phone?
6. **Substitute.** If the hero asset were replaced with a flat brand-colour
   block, would the page still look designed? If yes, the design is doing the
   work and the asset is a bonus. If no, the asset is carrying a page that has
   no structure, and no better asset will fix that.

Question 6 is the whole skill in one line.
