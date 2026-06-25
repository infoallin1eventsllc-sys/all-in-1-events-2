# CLAUDE.md — All in 1 Events Website

This file documents the codebase structure, development conventions, and workflow guidelines for AI assistants (and human developers) working in this repository.

---

## Project Overview

**All in 1 Events** is a luxury event-production marketing website with an AI-powered concierge chatbot. It is a vanilla HTML/CSS/JavaScript project — no framework, no build step, no bundler. The chatbot is backed by the Anthropic Claude API, called securely through a serverless function so the API key never reaches the browser.

**Live deployment targets:** Netlify (primary) and Vercel (secondary).

---

## Repository Structure

```
all-in-1-events/
├── index.html                    # Single-page app entry point
├── css/
│   └── styles.css                # All styles, animations, CSS variables
├── js/
│   ├── app.js                    # Core UI logic: chat, form, state, XSS-safe rendering
│   └── api.js                    # Environment-aware API client
├── netlify/
│   └── functions/
│       └── chat.js               # Netlify serverless function (Anthropic proxy)
├── vercel/
│   └── api/
│       └── chat.js               # Vercel serverless function (same logic)
├── netlify.toml                  # Netlify: headers, function path, build settings
├── vercel.json                   # Vercel: headers, function config
├── package.json                  # Dev dependency: netlify-cli; scripts for local dev
├── .env.example                  # Documents required env vars (no secrets)
├── ARCHITECTURE.md               # Deep file-by-file breakdown
├── SECURITY-and-DEPLOYMENT.md    # Threat model, deployment checklist, incident response
├── INQUIRY-FORM-SETUP.md         # How to wire the inquiry form to a real backend
├── PRE-LAUNCH-CHECKLIST.md       # Production go-live checklist
└── QUICK-REFERENCE.md            # One-page cheat sheet for common tasks
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES6+) |
| AI backend | Anthropic Claude API (via serverless proxy) |
| Deployment | Netlify functions / Vercel serverless |
| Styling | Custom CSS with glass-morphism, CSS variables, animations |
| No dependencies | No React, Vue, Angular, or bundler |

---

## Development Commands

```bash
# Option 1 — Open directly in browser (demo/offline mode)
open index.html
# The chatbot runs against the Claude.ai in-artifact endpoint in this mode.

# Option 2 — Local HTTP server (no serverless functions)
python -m http.server 8000
# Visit http://localhost:8000

# Option 3 — Full local dev with serverless functions (requires ANTHROPIC_API_KEY in .env)
npm install
npm start           # runs: netlify dev → http://localhost:8888
```

> There is no build step. Editing any `.html`, `.css`, or `.js` file takes effect immediately on refresh.

---

## Environment Variables

Copy `.env.example` to `.env` for local dev. **Never commit `.env`.**

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key, read by the serverless function only |

Set this variable in the host dashboard (Netlify → Site settings → Environment variables, or Vercel → Project settings → Environment Variables). It is never placed in any client-side file.

---

## Architecture: How the Chat Works

```
User types message
    ↓
js/app.js  — XSS-safe DOM rendering via textContent, state management, input validation
    ↓
js/api.js  — detects environment:
    • local/demo  → Claude.ai in-artifact endpoint
    • deployed    → POST /.netlify/functions/chat  (or /api/chat on Vercel)
    ↓
Serverless function (netlify/functions/chat.js)
    • reads ANTHROPIC_API_KEY from process.env
    • validates request body
    • calls Anthropic Messages API
    • returns response (API key never leaves server)
    ↓
js/app.js renders response safely via textContent
```

---

## Critical Security Conventions

These patterns are intentional and must be preserved:

1. **Never use `innerHTML` for user or bot content.** Always use `textContent`. This is the primary XSS defence.
2. **Never place `ANTHROPIC_API_KEY` in any client-side file** (`index.html`, `js/app.js`, `js/api.js`). It belongs only in `process.env` inside the serverless function.
3. **Never commit `.env`.** It is gitignored. Use `.env.example` as the template.
4. **CSP headers** are set in `netlify.toml` and `vercel.json`. Do not loosen the `script-src` directive without review.
5. **Input length caps** — form fields are capped (800–1000 characters). Maintain these limits on both client and server.

---

## Key File Responsibilities

### `js/app.js`
- Owns all UI state (`AppState` object: `history`, `isAwaiting`)
- Handles chat rendering, quick-reply buttons, inquiry form validation
- All DOM text insertion uses `textContent` (XSS-safe)
- Keyboard shortcuts: Enter to send, Shift+Enter for newline
- Accessibility: focus management, ARIA attributes, `role="log"` on message list

### `js/api.js`
- Single abstraction for all API calls
- Auto-detects local vs. deployed by checking `window.location`
- Tries Netlify endpoint, falls back to Vercel endpoint
- No API key; no secrets

### `netlify/functions/chat.js` and `vercel/api/chat.js`
- Validates HTTP method (POST only) and request body shape
- Reads `process.env.ANTHROPIC_API_KEY`
- Calls Anthropic API and proxies response
- Returns sanitised error messages (no internal stack traces to client)
- Sets CORS headers

### `netlify.toml`
- Sets `[functions] directory = "netlify/functions"`
- Configures security headers: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`

---

## Deployment

### Netlify (recommended)
1. Connect the repo to Netlify
2. Set `ANTHROPIC_API_KEY` in Site settings → Environment variables
3. Push to `main` — Netlify auto-deploys

### Vercel
1. Connect the repo to Vercel
2. Set `ANTHROPIC_API_KEY` in Project settings → Environment Variables
3. Push to `main` — Vercel auto-deploys

---

## Testing Checklist (Manual)

- [ ] Chat opens/closes; typing works; send button disables while awaiting
- [ ] Quick-reply buttons (Pricing, Availability, Venues) respond instantly
- [ ] Inquiry form validates required fields and email format
- [ ] AI responds to varied, open-ended questions
- [ ] Mobile layout: chat panel, input resizing, touch interactions
- [ ] HTTPS enforced; CSP produces no console errors in DevTools
- [ ] Keyboard navigation works (Tab through form, Enter to send)
- [ ] No `sk-ant-` key string appears anywhere in source: `grep -r "sk-ant-" .`

---

## Coding Conventions

- **No framework.** Keep it vanilla. Adding React or a bundler is out of scope.
- **No inline JS in `index.html`.** All logic goes in `js/`.
- **CSS variables** for colors and spacing; avoid hardcoded values.
- **Error handling:** every async function has a `try/catch`; errors are logged server-side, user-friendly messages shown client-side.
- **Comments** explain security decisions and non-obvious behaviour, not what the code does.
- **No `console.log` in production serverless functions** unless it avoids logging the API key or PII.

---

## Reference Docs

- Detailed file-by-file breakdown → `ARCHITECTURE.md`
- Security, threats, and deployment → `SECURITY-and-DEPLOYMENT.md`
- Pre-launch checklist → `PRE-LAUNCH-CHECKLIST.md`
- Inquiry form wiring → `INQUIRY-FORM-SETUP.md`
- Anthropic Messages API → https://docs.anthropic.com/en/api/messages
