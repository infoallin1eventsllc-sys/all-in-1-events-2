# Haven Design System

## Brief
- **Mode:** Operate. The homeowner glances at the app, often on a phone and on the move, to see whether the house is OK and to fix what isn't. The client demo adds a Persuade layer, but the app itself stays task-first.
- **Voice:** calm, plain, trustworthy. The house is handled; Haven reports what happened.
- **Anti-references:** generic "AI SaaS" styling (purple gradients, glow on everything), dashboards of equal-weight tiles, sensors shouting as loudly as controls.

## Structure (both looks)
1. **Status line.** One sentence on the house ("All secure", "2 things need attention") with a chip per issue and a one-tap fix (Close, Lock). The summary always comes before the detail.
2. **Confirmations.** A card for anything waiting on the owner's OK: garage open, unlock, water on.
3. **At a glance.** Four tiles: Inside, Garage, Doors, Water.
4. **Ask Haven.** Chat.
5. **Scenes**, then **Rooms**. Controls get rows; sensors get one quiet line per room and turn red only when they matter.
6. **Updates** feed, then the **Simulator** when no hardware is connected.

## Color
Semantic colors (ok / warn / bad) only ever mean state.

| Token | Grounded light | Grounded dark | Futuristic |
|---|---|---|---|
| `--bg` | `#f1ede6` | `#17130f` | `#06070c` |
| `--surface` | `#fbf9f5` | `#211b16` | `rgba(16,20,33,.84)` |
| `--text` | `#2a241e` | `#f1ebe2` | `#e6f4ff` |
| `--accent` (actions) | `#6b4a2f` walnut | `#c9a27a` | `#40e0ff` cyan |
| `--on` (a light is on) | `#e0a43a` lamp amber | `#f0b64e` | `#40e0ff` |
| `--ok` / `--warn` / `--bad` | `#3f7a52` / `#a8641e` / `#b3362b` | `#7cc593` / `#e3a45a` / `#f07a6b` | `#3df5b0` / `#b592ff` / `#ff4d8d` |

Grounded follows the viewer's light/dark setting. Futuristic is dark only, by design.

## Type
- **Hanken Grotesk** (400–700) for everything in Grounded and for body text in Futuristic.
- **Chakra Petch** (500–600) for headings and numbers in Futuristic: an instrument-panel face.
- Scale: 1.55rem title, 1.15rem status, 1.2rem tile values, 1rem body, 0.85rem secondary, 0.72–0.75rem uppercase labels with 0.08–0.2em tracking. Numbers use tabular figures.
- System fonts are the fallback, so the app still reads well when the house has no internet.

## Motion
- The Futuristic orb is Haven's status mark. Its color is the house's state (cyan secure, violet waiting, magenta alert). It moves only while Haven is working on a reply, and not at all under reduced motion.
- Nothing else animates beyond button press feedback.

## Components
Status line, issue chip, confirmation card, summary tile, device row (name, state, controls), sensor line, scene button, feed item, look switch.
