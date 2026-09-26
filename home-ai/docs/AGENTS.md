# Haven's Agent Stack

Haven is several parts with separate jobs. Only two of them use a language model, and neither can touch hardware directly.

```
 Homeowner ── voice (panel mic, Siri) ─┐
            ── text (panel, phone) ────┤
                                       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. Conversation agent (Claude, or the offline parser)       │
 │    understands requests and feelings, answers in plain      │
 │    words, uses tools                                        │
 └──────────────┬──────────────────────────────┬───────────────┘
                │ control_device / run_scene   │ record_feedback / remember / forget
                ▼                              ▼
 ┌──────────────────────────────┐   ┌──────────────────────────────────┐
 │ 5. Safety controller         │◄──│ 3. Learner (deterministic)        │
 │    limits, interlocks, who   │   │    comfort by time of day, habits │
 │    may do what; the only     │   │    → suggestions, undos → "stop   │
 │    path to hardware          │   │    doing that", accepted routines │
 └──────────────┬───────────────┘   └──────────────▲───────────────────┘
                │                                  │ notes, likes, routine ideas
                ▼                   ┌──────────────┴───────────────────┐
         Home Assistant /           │ 2. Reflection agent (Claude,     │
         simulator devices          │    or offline pattern counting)  │
                │                   │    reviews each day at 3 AM      │
                ▼                   └──────────────────────────────────┘
 ┌──────────────────────────────┐   ┌──────────────────────────────────┐
 │ 4. Automations (deterministic)│   │ 6. Briefing writer (Claude, or   │
 │    motion, leak, away,        │   │    template): morning, midday,   │
 │    freeze, garage             │   │    evening, night                │
 └──────────────────────────────┘   └──────────────────────────────────┘
                              ▼
                 Voice + panel + push to iPhone / Apple Watch
```

## The parts

| # | Part | Model? | What it does | Code |
|---|---|---|---|---|
| 1 | **Conversation agent** | Claude (`claude-opus-5`, effort `medium`), offline parser as fallback | Understands requests, questions and feelings. Uses tools: `get_home_state`, `control_device`, `run_scene`, `get_recent_events`, `notify_homeowner`, `record_feedback`, `remember`, `forget`, `get_profile`. Sees what it has learned about the homeowner on every turn. | `src/agent/claude.js`, `src/agent/local.js`, `src/agent/tools.js`, `prompts/agent-system.md` |
| 2 | **Reflection agent** | Claude with JSON-schema output, offline pattern counting as fallback | Once a day (3 AM, or "Review my day") it reads the day's feedback, hand-made changes and conversations, and returns notes, likes, dislikes and at most two routine ideas. | `src/reflection.js`, `claude.js` `reflect()`, `prompts/reflection.md` |
| 3 | **Learner** | No | Keeps the homeowner profile. Comfort feedback acts right away and is remembered per time of day. The same change on three different days becomes a suggestion; switching off an automatic light twice becomes "stop doing that?". Runs accepted routines. | `src/learning.js` |
| 4 | **Automations** | No | Instant, offline safety and comfort rules. They use what the learner knows: preferred brightness for motion lights, preferred temperature on arrival, rooms not to light automatically. | `src/automations.js` |
| 5 | **Safety controller** | No | The only path to hardware, for every part above and for the homeowner. Hard limits, the leak interlock, and permissions by origin. | `src/core/controller.js`, `src/safety.js` |
| 6 | **Briefing writer** | Claude, template fallback | Short scheduled updates that fit a watch face, including new suggestions. | `src/briefings.js` |

## Voice

The panel listens only while the mic button is pressed (push-to-talk) and uses the browser's own speech recognition, so only the finished sentence reaches Haven. Haven answers out loud with the browser's speech synthesis and reads briefings and urgent alerts aloud; the speaker button mutes it. On iPhone, Apple Watch and in the car, Siri Shortcuts do the same job (docs/APPLE-SETUP.md).

Voice input needs a secure page: the panel device itself (`localhost`) or HTTPS, for example `tailscale serve`. Over plain `http://` on the home network, browsers block the microphone and the panel says so.

## Rules that keep learning safe

1. **Nothing learned acts until the homeowner says yes.** Habits and reflection findings become suggestions with "Yes, do that" and "No thanks". A dismissed suggestion is never offered again.
2. **Learned routines run as automations**, so the safety controller refuses anything high-risk. Routines can never open the garage, unlock a door or turn water back on, and the learner won't even suggest those.
3. **Comfort feedback is the one exception, and only because the homeowner asked for it in that moment.** "I'm cold" changes the temperature 2°F within the hard limits.
4. **Everything learned is visible and deletable** in the panel's About you tab ("Forget", "Forget everything") or by saying "forget everything".
5. **The reflection agent is told what not to keep:** nothing about other people's health, money or relationships, and nothing that reads like tracking someone's movements.

## Where the data lives

`data/profile.json` on the home server: comfort preferences, likes, dislikes, notes, suggestions, routines, the last 500 hand-made changes, and the last 200 conversation exchanges. The conversation agent and the reflection agent send parts of it to the Claude API when they run; nothing else leaves the house.
