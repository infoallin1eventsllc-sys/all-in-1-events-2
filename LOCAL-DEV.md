# Running the site on your own computer

This lets you click through the whole site — including the Owner Portal,
uploads and checkout — before anything is deployed. Nothing you do here
touches the live site.

## One-time setup

**1. Install Node.js** (skip if you already have it)

Download the **LTS** version from [nodejs.org](https://nodejs.org) and install
it. To check it worked, open Terminal (Mac) or PowerShell (Windows) and run:

```
node -v
```

You should see a version number like `v22.x.x`.

**2. Get the code**

```
git clone https://github.com/infoallin1eventsllc-sys/all-in-1-events-2.git
cd all-in-1-events-2
git checkout claude/420-friendly-hoodie-page-yl8ho9
```

That last line matters — the 420 Friendly site lives on that branch, not on
`main`.

**3. Install the dependencies**

```
npm install
```

Takes a minute or two the first time.

**4. Create your local settings file**

In the project folder, make a file called exactly `.env` containing:

```
OWNER_PASSCODE=pick-a-long-passphrase-here
```

This is your **local** passcode. It has nothing to do with the live site, so
it can be anything eight characters or longer. `.env` is already in
`.gitignore`, so it will never be committed — but do not paste a real
production secret into it out of habit.

## Every time you want to work on the site

```
npm start
```

Wait for `Server now ready`, then open:

**http://localhost:8888/420-friendly/index.html**

Stop it with `Ctrl+C` in the terminal when you are done.

### What works locally

Everything that does not need somebody else's account:

| Works | Needs a key you have not added |
|---|---|
| The whole storefront, cart, favourites | Real card payments (Stripe) |
| The Owner Portal, using your `.env` passcode | PayPal / Venmo |
| Music &amp; video uploads — real storage, real playback | The AI concierge |
| Invoices, CSV export | Sending signups to the CRM |
| Playlist embeds, once you paste a link | |

If a feature needs a key, the page says which one rather than failing
silently, so you can tell "not set up yet" from "broken".

## The one rule when editing

**If you add or change a Tailwind class in any HTML or JS file, run this:**

```
npm run build:420
```

The stylesheet is compiled ahead of time. A class that has not been compiled
in does nothing at all — no error, no warning, the element just renders
unstyled. This has cost real debugging time twice on this project.

Run it from the **project root**, not from inside `420-friendly/`, or it
writes to the wrong place.

## Quick reference

| Command | What it does |
|---|---|
| `npm start` | Runs the full site with working functions (what you want) |
| `npm run build:420` | Recompiles the CSS — run after any class change |
| `git pull` | Gets the latest changes |
| `Ctrl+C` | Stops the server |

## If something goes wrong

**"command not found: npm"** — Node.js is not installed, or the terminal was
open before you installed it. Close it, open a new one, try again.

**Port 8888 already in use** — something else is on that port:
`npm start -- --port 8899`, then use that number in the URL.

**The Portal says the passcode is wrong** — check `.env` is in the project
root (not in `420-friendly/`), has no quotes around the value, and that you
restarted `npm start` after creating it. Environment changes are only picked
up at startup.

**A page looks unstyled or an element is the wrong size** — run
`npm run build:420`. This is almost always the cause.
