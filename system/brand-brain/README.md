# Brand Brain

The shared voice the agent writes from. Before this existed, every draft was
guided by a single string — `Voice: warm, professional, upscale` — which is why
mock and early output read like anyone's marketing. These files replace that
string with something specific enough that a draft sounds like the business
that sent it.

## How it works

```
brand-brain/<brand>/*.md   ← you edit these (plain Markdown, no tooling)
        │  node cli.mjs brand-sync
        ▼
public.brand_brain table   ← what the edge functions actually read
        │
        ▼
system prompt on every draft
```

The functions run in Supabase and cannot read this repo, so the database is the
live copy. **Editing a file here changes nothing until you run
`node cli.mjs brand-sync`.** That is the one thing to remember.

## The four documents

Each brand has the same four, and they answer different questions. Keeping them
separate matters: mixing positioning into the voice guide produces drafts that
argue instead of speak.

| File | Answers |
|---|---|
| `voice-guide.md` | How we sound. Rhythm, vocabulary, what we never say |
| `positioning.md` | Who we are for, what we sell, what we are not |
| `messaging-bank.md` | Lines that are already approved and can be reused |
| `tone-rules.md` | Hard limits. Legal, safety, and claims we cannot make |

`tone-rules.md` is not stylistic. It is the one the agent must never override,
which is why it is last in the prompt and phrased as rules rather than advice.

## The three brands

| Folder | Business | What it sells |
|---|---|---|
| `all-in-1-events/` | All in 1 Events | Photo booths |
| `420-friendly/` | 420 Friendly | Cannabis-themed streetwear |
| `meridian-interface/` | Meridian Interface | Websites, apps, marketing systems |

They are genuinely different voices — a photo booth reassures, a streetwear
brand states and stops, an agency publishes numbers. That is the whole reason
these are separate documents rather than one shared "voice" setting.

Anything marked **NEEDS OTIS** in a positioning file is a gap the agent writes
around rather than invents. Filling those in is the highest-value edit here.

## Which brand is active

`settings.business_profile.brand` selects it. One system, one active brand at a
time; the others sit here ready. Switch with:

```sql
update settings
set value = jsonb_set(value, '{brand}', '"420-friendly"')
where key = 'business_profile';
```

## Adding a brand

Copy `_template/` to a new folder, fill it in, run `brand-sync`. Write in plain
sentences — this is read by a language model, so prose beats bullet fragments,
and a concrete example beats an adjective. "Short sentences. No hard sell."
teaches more than "concise and friendly".
