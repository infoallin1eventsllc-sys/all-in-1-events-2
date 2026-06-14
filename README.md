# All in 1 Events — Production Website

A full-stack luxury event production site with an AI-powered concierge chatbot, built for security, scalability, and performance. This project demonstrates modern web development practices: serverless architecture, XSS-safe DOM rendering, environment-based configuration, and secure API key management.

## Project Structure

```
all-in-1-events/
├── index.html              # Main page (no external deps except CDN)
├── css/
│   └── styles.css          # Global styles, animations, themes
├── js/
│   ├── app.js              # Core app logic: chat, inquiry, UI state
│   └── api.js              # Abstracted API client (local or serverless)
├── netlify/
│   └── functions/
│       └── chat.js         # Serverless function (Netlify)
├── vercel/
│   └── api/
│       └── chat.js         # Serverless function (Vercel)
├── .env.example            # Template for environment variables
├── netlify.toml            # Netlify config: headers, functions, redirects
└── vercel.json             # Vercel config: headers, env vars
```

## Quick Start (Local Demo)

```bash
# Option 1: Open in browser (local demo mode)
open index.html

# The chatbot will run in "demo mode" (Claude.ai in-artifact endpoint).
# For real API calls, deploy serverless (see below).
```

## Features

- **AI Concierge Chat** — typed questions, scripted FAQ shortcuts, inquiry form
- **XSS-Safe Rendering** — all user/bot text inserted via `textContent`, never `innerHTML`
- **Serverless Backend** — API key never exposed to browser; runs on Netlify or Vercel
- **Environment Config** — separate `.env` per deployment (never commit secrets)
- **Security Headers** — CSP, X-Frame-Options, X-Content-Type-Options
- **Accessibility** — ARIA labels, keyboard navigation, screen-reader safe
- **Responsive Design** — mobile-first, glass-morphism aesthetic

## Deployment

### Netlify (recommended for beginners)

1. **Fork or clone this repo**
   ```bash
   git clone <your-repo-url>
   cd all-in-1-events
   ```

2. **Connect to Netlify**
   - Drag-and-drop the folder to [netlify.com/drop](https://netlify.com/drop), OR
   - Connect your Git repo in the Netlify dashboard

3. **Add the API key**
   - Go to **Site settings → Environment variables**
   - Add `ANTHROPIC_API_KEY` (your Claude API key)
   - Do **not** commit `.env` to git

4. **Deploy** — Netlify auto-deploys when you push to main

### Vercel

1. **Connect repo to [vercel.com](https://vercel.com)**

2. **Add environment variables**
   - Project settings → Environment Variables
   - Add `ANTHROPIC_API_KEY`

3. **Deploy** — automatic on push

## How It Works

```
User types in chat
    ↓
app.js calls api.js
    ↓
api.js detects environment:
  - Local/demo? Use Claude.ai in-artifact endpoint
  - Deployed? POST to /.netlify/functions/chat or /api/chat
    ↓
Serverless function (chat.js) reads API key from process.env
    ↓
Function calls Anthropic API securely (key never leaves server)
    ↓
Response returned to frontend, rendered safely via textContent
```

## Security

**Never put your API key in the browser.** This project enforces it:

- `index.html`, `js/app.js`, `js/api.js` contain **no secrets**
- `netlify/functions/chat.js` and `vercel/api/chat.js` read the key from `process.env`
- Environment variables are set in the host dashboard, never committed to git
- The `.env.example` file shows the format for local development (copy to `.env`, don't commit)

**XSS Protection:**
- All user and bot messages are inserted with `textContent` (not `innerHTML`)
- Form inputs are length-capped and validated client-side + server-side
- CSP header restricts script execution to approved sources only

**Deployment security:**
- HTTPS enforced automatically (Netlify / Vercel)
- Security headers configured in `netlify.toml` / `vercel.json`
- Rate limiting recommended on the serverless function (see `DEPLOY-and-SECURITY.md`)

## Code Quality

- **Modular** — separate files for HTML, CSS, JS, API logic
- **Commented** — inline explanations of security-critical sections
- **Error-resilient** — graceful fallbacks, detailed console logs for debugging
- **Accessible** — ARIA labels, keyboard support, semantic HTML
- **Performance** — minimal external dependencies, CSS animations over JS, responsive lazy images

## Development

### Local testing

```bash
# Run a simple HTTP server
python -m http.server 8000
# Visit http://localhost:8000
```

The chatbot will operate in demo mode (uses Claude.ai endpoint). To test the serverless function locally, install Netlify CLI:

```bash
npm install -g netlify-cli
netlify dev
# Runs on http://localhost:8888 with functions enabled
```

### Environment variables

Copy `.env.example` to `.env` (not committed):

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## Testing Checklist

- [ ] Chat opens/closes, typing works, send button disables while awaiting
- [ ] Quick replies (Pricing, Availability, Venues) respond instantly
- [ ] Inquiry form validates: name, email, date, message required
- [ ] AI responds to varied questions (ask 3+ different things)
- [ ] Mobile: chat panel doesn't break, input resizes, touch works
- [ ] Headers: site loads over HTTPS, CSP doesn't block anything
- [ ] Accessibility: tab through form, test with screen reader (or WAVE browser extension)

## Next Steps (Production)

1. Replace placeholder pricing in `SCRIPTS` (js/app.js) with real numbers
2. Wire inquiry form to a real backend (Netlify Forms, Formspree, or custom function)
3. Add rate limiting to the serverless function
4. Monitor API usage and costs (set quota alerts in Anthropic console)
5. A/B test chat copy and quick-reply buttons

## Support & Docs

- **Security:** see `DEPLOY-and-SECURITY.md`
- **API docs:** [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- **Netlify functions:** [docs](https://docs.netlify.com/functions/overview)
- **Vercel serverless:** [docs](https://vercel.com/docs/functions/quickstart)

---

**Built to impress.** Clean code, zero secrets, and production-ready. 🎯
