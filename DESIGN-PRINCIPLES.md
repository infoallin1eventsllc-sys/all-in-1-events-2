# Design Principles

The distilled version. `DESIGN-SYSTEM.md` says *what values to use*; the
`taste` skill says *what Otis picks*; this says *why good design works at
all*. Twelve principles, each one sentence of law and a line of practice.

---

**1. Hierarchy is the whole job.**
A reader should know what matters most in half a second, blindfolded by a
squint test. If everything is emphasized, nothing is — pick the one thing
per view that gets to be loud.

**2. Contrast creates meaning; sameness creates calm.**
Big against small, dense against empty, mono against prose. Use contrast
where you want attention and sameness everywhere else — a design fails when
those are reversed.

**3. Whitespace is structure, not absence.**
Space groups what belongs together and separates what doesn't. Padding that
doesn't encode a relationship is just distance.

**4. Type does 80% of the work.**
Get the pairing, scale, and spacing right and a page looks designed with no
decoration at all. Tighter and heavier as display gets bigger; room to
breathe as body gets longer; labels spaced and capped.

**5. One accent, working.**
An accent color is a pointing finger. Two fingers pointing at different
things is confusion; a rainbow is noise. Semantic state colors (error,
success) are signage, not accent.

**6. The grid is felt, not seen.**
Alignment is why a page feels professional before anyone can say why.
Break the grid once, on purpose, where it earns attention — never by
accident.

**7. Every element earns its place.**
The strongest move in design is deletion. Filler stats, decorative icons,
padded sections — a thousand no's for every yes. If a section feels empty,
that's a composition problem, not a content shortage.

**8. Honest beats impressive.**
A visible `[PLACEHOLDER]` outranks a fabricated number. A plain page that
loads outranks a stunning one that doesn't. Design that lies — fake
testimonials, invented stats, painted device chrome — is failed design
regardless of polish.

**9. Motion is punctuation.**
One well-placed reveal is a period; scattered micro-effects are a stutter.
Animate to explain state change, never to prove effort. Under 350ms,
respectful of reduced-motion, gone when it says nothing.

**10. Interactive things look interactive; state reads at a glance.**
Affordance is a contract: pills press, fields accept, cards lift. Loading
holds the layout it will fill. Selection changes edge, not fill. Nobody
should have to hover to discover.

**11. Copy is a design material.**
The words are in the layout whether designed or not. Concrete beats vibe
("DMX-controlled beams" beats "amazing lighting"), short beats clever,
and a button labels its consequence.

**12. Consistency compounds; novelty spends.**
Every reused pattern earns trust and speed; every new one costs learning.
Spend novelty like money — one memorable move per design, funded by
ruthless consistency everywhere else.

---

## The test

Before shipping anything visual, four questions:

1. **Squint** — does the hierarchy survive blur?
2. **Grayscale** — does it still work with the color removed?
3. **Phone** — does it hold at 375px?
4. **Stranger** — could someone who wasn't in the room say what this page
   wants them to do?

Four yeses or it isn't done.
