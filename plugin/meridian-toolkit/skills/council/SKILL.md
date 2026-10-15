---
name: council
description: "Convene a council on a decision: several independent Claude subagents each argue from a fixed seat (skeptic, customer, accountant, operator, advocate), their answers are anonymized and peer-ranked, then a chairman synthesizes where they agreed, where they fought, the blind spots, and one recommendation. Invoke with /council <the decision or question> when Otis is weighing something that matters — take this client or not, which logo direction, raise the price, ship or wait, hire or contract — and a single answer would just agree with him. One model in different chairs, labeled as such; not the multi-vendor original. Skip it for lookups, quick edits, and anything with an objectively checkable answer."
disable-model-invocation: true
---

# The Council

Karpathy's LLM Council pattern, run on one model: independent seats, blind
peer review, chairman synthesis. Invoking `/council` **is** the user's request
to spawn subagents — proceed without asking again, but say up front how many
will run (usually 5 seats + 2 reviewers = 7).

**Label it honestly, every time.** The report header states: *Council of one
model in five chairs. Disagreement here comes from framing, not from different
training — treat consensus as weaker evidence than a multi-vendor council
would give.* Never let the output imply four vendors were consulted.

## Stage 0 — Frame the question

From `$ARGUMENTS`, write one decision sentence and the 3–6 facts the seats
need (budget, timeline, who's affected, what's already decided). Pull facts
from the repo, `meridian-stack`, and the conversation — do not invent them; a
missing fact is written as `[unknown: X]` and every seat is told it's
unknown. If the question has an objectively checkable answer, stop and say
the council is the wrong tool.

## Stage 1 — Seats answer independently

Spawn all seats **in parallel, in one message**, each as an Agent with the
same brief (decision sentence + facts) and ONLY its own stance. No seat sees
another seat's answer. Default seats:

| Seat | Stance the agent must hold |
|---|---|
| **Skeptic** | What breaks, what's being assumed, the failure that embarrasses us |
| **Customer** | How the client or guest actually experiences this, start to finish |
| **Accountant** | Cash, margin, time cost, what this displaces; numbers or `[unknown]` |
| **Operator** | Can it be executed on the day with the people and gear we have |
| **Advocate** | The strongest honest case FOR it — so the room isn't only defense |

Custom seats: `/council --seats "Venue manager, Insurer, Repeat client" <question>`
replaces the defaults; keep 3–6.

Each seat returns ≤200 words: position in one sentence, three reasons, one
thing that would change its mind. Instruct the agent to write in first
person from the seat and never to hedge toward the middle.

**Optional sixth seat — Devil's Advocate connector.** If the
`Devil_s_Advocate` MCP is connected and authorized in this session, run
`run_premortem` (or `challenge_assumptions`) on the decision sentence and
treat its output as a seat named **Premortem**. If the server is missing or
needs auth, skip it silently — do not stall the council on it.

## Stage 2 — Blind peer review

1. **Anonymize.** Relabel the seat answers **A, B, C, D, E** in a shuffled
   order. Record the mapping privately. Strip any self-identifying phrase
   ("as the accountant…").
2. Spawn **two reviewer agents in parallel**, each given all anonymized
   answers and this brief: *Rank A–E from most to least useful for making
   this decision. Judge on: grounded in the stated facts, names a concrete
   consequence, would change what we do. Ignore confidence and length. One
   line of reason per rank. Then name the single most important point that
   NO answer made.*
3. Reviewers never see the seat names or each other.

## Stage 3 — Chairman synthesis

You are the chairman. With the seat answers, both rankings, and the mapping,
write the report in exactly this shape:

```
# Council on: <decision sentence>
Council of one model in five chairs — disagreement is framing, not training.
Ran: <N> seats, 2 reviewers[, Premortem via Devil's Advocate].

## Where they agreed
- <point> (seats: …)

## Where they fought
- <Seat> vs <Seat>: <the actual disagreement in one line each>

## Blind spots
- <what reviewers said nobody raised>
- <a fact marked [unknown] that would settle a fight>

## Peer ranking
1. <Seat> — <reviewer's reason>   … (de-anonymized now, both reviewers' orders shown)

## Recommendation
<One paragraph. Take a position. Say what would reverse it.>

## Do next
- <the one fact to go find, or the one action, in a sentence>
```

Rules for the chairman: cite seats by name only after ranking; never average
the seats into mush — if they split, say which way you lean and why; the
recommendation is yours, not a vote count; keep the whole report under 600
words. Post it in chat. Do not write files unless asked.

## Cost and when not to

Seven subagents is a real spend. Use it for decisions with money, a client,
or a week of work attached. For a quick gut-check, say so and offer the
cheaper move: one Skeptic seat, no review.
