# Security & Deployment Guide

## Overview

This document covers the security architecture, threat model, and deployment process for the All in 1 Events website. It's designed for engineers, security reviewers, and DevOps teams.

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (chatbot)                                            │
│ - No secrets stored or displayed                             │
│ - All user/bot messages rendered via textContent (XSS-safe)  │
│ - Input validated (length, format)                           │
│ - Input locked while awaiting response                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS only
                     │
┌────────────────────▼────────────────────────────────────────┐
│ Serverless Function (Netlify/Vercel)                         │
│ - Reads ANTHROPIC_API_KEY from process.env                   │
│ - Validates request body (schema, length)                    │
│ - Calls Anthropic API securely                               │
│ - Returns sanitized response                                 │
│ - Logs errors server-side (never to client)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS
                     │ x-api-key header (secure)
                     │
┌────────────────────▼────────────────────────────────────────┐
│ Anthropic API (api.anthropic.com)                            │
│ - Authenticates via x-api-key header                         │
│ - Processes chat request                                     │
│ - Returns response (JSON)                                    │
└─────────────────────────────────────────────────────────────┘
```

**Key principle:** The API key never leaves the server. The browser only knows about the serverless function endpoint.

---

## Threat Model & Controls

### Threat 1: API Key Exposure

**Threat:** Attacker obtains the Anthropic API key and uses it to call the API directly, incurring costs or accessing sensitive data.

**Likelihood:** High (if key is in client-side code)  
**Impact:** High (billing, reputation)

**Controls:**
- ✅ API key stored in environment variables (process.env), not hardcoded
- ✅ No API key in HTML, JS, or git history
- ✅ `.env.example` shows format; `.env` is in `.gitignore`
- ✅ Function validates and sanitizes all requests before forwarding to API
- ✅ Rate limiting recommended (see below)

**Verification:**
```bash
# Check that no API key appears in the codebase
grep -r "sk-ant-" . --exclude-dir=node_modules

# Should return nothing (empty).
```

---

### Threat 2: XSS (Cross-Site Scripting)

**Threat:** Attacker injects HTML/JavaScript via a chat message; script executes in other users' browsers.

**Likelihood:** High (if rendering uses innerHTML)  
**Impact:** High (session hijacking, data theft)

**Controls:**
- ✅ All user and bot messages rendered via `textContent` (never `innerHTML`)
- ✅ Form inputs capped at 800 chars (chat) and 1000 chars (inquiry)
- ✅ Server-side: inquiry form inputs validated before processing
- ✅ HTML escaping applied to inquiry payload before storage/transmission

**Code Example (XSS-safe):**
```javascript
// SAFE: textContent (no HTML interpretation)
bubble.textContent = text;

// UNSAFE: innerHTML (allows HTML/JS injection)
// bubble.innerHTML = text;  // ❌ NEVER DO THIS
```

**Verification:**
- Open DevTools → Console
- Type in chat: `<img src=x onerror='alert("xss")'>`
- Message should appear as plain text (no popup)

---

### Threat 3: CSRF (Cross-Site Request Forgery)

**Threat:** Attacker tricks a user into submitting a form that modifies data on their behalf.

**Likelihood:** Low (inquiry form doesn't modify sensitive data)  
**Impact:** Medium (spam inquiries, data pollution)

**Controls:**
- ✅ Inquiry form requires user interaction (not auto-submitted)
- ✅ POST-only API (no state-changing GET requests)
- ✅ Session-based validation (if backend stores state)

**Optional enhancement:**
- Add a CSRF token to the inquiry form if backend stores submissions

---

### Threat 4: Network Eavesdropping

**Threat:** Attacker on a shared network intercepts API traffic and reads messages or keys.

**Likelihood:** Medium (if HTTP is used)  
**Impact:** Medium (message history, keys exposed)

**Controls:**
- ✅ HTTPS enforced (automatic on Netlify/Vercel)
- ✅ TLS 1.2+ required
- ✅ Secure headers set (see below)

**Verification:**
```bash
# Verify HTTPS is enforced
curl -I https://your-domain.com | grep -i "http/"
# Should show: HTTP/2 200 or HTTP/1.1 200
```

---

### Threat 5: Rate Limiting / DoS

**Threat:** Attacker floods the API with requests, consuming quota or crashing the service.

**Likelihood:** Medium  
**Impact:** High (quota exhaustion, service unavailability)

**Controls:**
- ✅ Input validation (max message length)
- ✅ Send button disabled while awaiting response (client-side)
- ⚠️ **Missing:** Server-side rate limiting (recommended)

**Recommended:** Add rate limiting to the serverless function.

Example (Netlify):
```javascript
// Use a rate-limiting library or Netlify's built-in
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({ windowMs: 60000, max: 10 });
exports.handler = limiter((event, context) => { /* ... */ });
```

---

## Security Headers

All responses include these headers (set in `netlify.toml` / `vercel.json`):

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer leakage |
| `Content-Security-Policy` | (see below) | Whitelist scripts, styles, resources |
| `Permissions-Policy` | `camera=(), microphone=()` | Disable unnecessary APIs |

**Content Security Policy:**
```
default-src 'self'                          # Only load from same origin
img-src 'self' https://lh3.googleusercontent.com data:  # Images from approved sources
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com  # Tailwind + Google Fonts
script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com  # App + Tailwind CDN
connect-src 'self' https://api.anthropic.com  # API calls to Anthropic only
```

**Note:** `unsafe-inline` for styles/scripts is necessary for Tailwind CDN and inline styles. For stricter CSP, build Tailwind to a static file and remove the CDN.

---

## Deployment Checklist

### Pre-Deployment

- [ ] No API key in any source file (use `grep -r "sk-ant-" .`)
- [ ] `.env` is in `.gitignore`
- [ ] `.env.example` exists with placeholder value
- [ ] `netlify.toml` or `vercel.json` is configured
- [ ] Serverless function (chat.js) validates all inputs
- [ ] HTTPS is enforced (automatic on Netlify/Vercel)
- [ ] Security headers are set (in config file)
- [ ] CSP is tested in DevTools (no console errors)

### Deployment (Netlify)

1. **Connect repository**
   - Go to [netlify.com](https://netlify.com) → "New site from Git"
   - Select repo, branch, and directory

2. **Add environment variable**
   - Site settings → Environment variables
   - Add `ANTHROPIC_API_KEY=sk-ant-...` (get from [console.anthropic.com](https://console.anthropic.com))
   - Do NOT commit this to git

3. **Deploy**
   - Netlify automatically builds and deploys on push
   - Functions are deployed to `/.netlify/functions/chat`

4. **Verify**
   ```bash
   curl -X POST https://your-domain.com/.netlify/functions/chat \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"hi"}],"system":"You are helpful"}'
   # Should return a valid response
   ```

### Deployment (Vercel)

1. **Connect repository**
   - Go to [vercel.com](https://vercel.com) → "New project"
   - Import repository

2. **Add environment variable**
   - Project settings → Environment variables
   - Add `ANTHROPIC_API_KEY=sk-ant-...`

3. **Deploy**
   - Vercel automatically deploys on push
   - Functions are deployed to `/api/chat`

4. **Verify**
   ```bash
   curl -X POST https://your-domain.com/api/chat \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"hi"}],"system":"You are helpful"}'
   ```

### Post-Deployment

- [ ] Visit the site over HTTPS (browser shows 🔒)
- [ ] Open DevTools → Security tab → Check certificate
- [ ] DevTools → Console: no CSP errors
- [ ] Test chat: type a message, verify response
- [ ] Test inquiry form: submit with valid email
- [ ] Test on mobile (iOS Safari, Chrome Android)
- [ ] Run Lighthouse audit (should pass security)

---

## Monitoring & Incident Response

### Monitor these metrics

- **Function invocations** (in host dashboard)
- **API errors** (5xx responses)
- **Rate limit hits** (429 responses)
- **Cost** (Anthropic console → Usage)

### If API key is compromised

1. **Immediately** revoke the key in [Anthropic console](https://console.anthropic.com)
2. Generate a new key
3. Update the environment variable in your host dashboard
4. Redeploy (if needed)
5. Review function logs for unauthorized calls

---

## Compliance & Best Practices

- **Data retention:** Chat history is only stored in the client's browser (session memory). It's not persisted to a database.
- **GDPR:** If you start storing user data, you'll need privacy policies and consent mechanisms.
- **PCI DSS:** If you add payment, you'll need a PCI-compliant payment processor (Stripe, etc.).
- **Logging:** Function logs are server-side only. Sensitive data (API keys, full chat history) is never logged.

---

## Troubleshooting

### Chat not working

1. Check DevTools → Network tab → POST request to function
   - Is it returning 200?
   - Are CORS headers present?

2. Check DevTools → Console for errors
   - Missing API key? Check host environment variables
   - Function timeout? Increase `maxDuration` in vercel.json

3. Check function logs
   - Netlify: Site settings → Functions → View logs
   - Vercel: Deployments → Select latest → Logs tab

### Security warnings in DevTools

1. CSP errors
   - Check `Content-Security-Policy` header in netlify.toml/vercel.json
   - Verify allowed domains (e.g., `https://cdn.tailwindcss.com`)

2. Mixed content warning
   - Ensure all external resources use HTTPS (not HTTP)

### Rate limiting not working

- Implement rate limiting in the serverless function (see "Threat 5" above)
- Test with: `for i in {1..20}; do curl -X POST ...; done`

---

## Resources

- [Anthropic API Docs](https://docs.anthropic.com)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Netlify Functions](https://docs.netlify.com/functions/overview)
- [Vercel Functions](https://vercel.com/docs/functions/quickstart)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

---

**Last Updated:** 2024  
**Status:** Production-ready
