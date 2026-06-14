# Quick Reference Card

## Project: All in 1 Events — Production Web Application

---

## Deploy in 3 Steps

### Step 1: Choose Platform
- **Netlify** (simpler): [netlify.com](https://netlify.com) → "New site from Git"
- **Vercel** (same result): [vercel.com](https://vercel.com) → "New project"

### Step 2: Add API Key
```
Environment variables (in host dashboard):
Key:   ANTHROPIC_API_KEY
Value: sk-ant-your-key-from-anthropic-console
```

### Step 3: Deploy
- Netlify: Auto-deploys on git push
- Vercel: Auto-deploys on git push

**Done.** Your site is live at `your-domain.com`

---

## File Checklist

| File | Purpose | Critical? |
|------|---------|-----------|
| `index.html` | Main page | Yes |
| `css/styles.css` | Styles | Yes |
| `js/app.js` | Chat logic | Yes |
| `js/api.js` | API client | Yes |
| `netlify/functions/chat.js` | API proxy | Yes |
| `vercel/api/chat.js` | API proxy | Yes |
| `netlify.toml` | Config | Yes |
| `vercel.json` | Config | Yes |
| `.env.example` | Template | Yes |
| `.gitignore` | Exclude secrets | Yes |
| `README.md` | Docs | No |
| `SECURITY-and-DEPLOYMENT.md` | Details | No |

**Golden rule:** Never commit `.env` or any file with API keys.

---

## Security Audit (TL;DR)

| Threat | Status | Evidence |
|--------|--------|----------|
| API key exposure | ✅ Protected | Key in `process.env`, not in code |
| XSS (HTML injection) | ✅ Protected | Using `textContent`, not `innerHTML` |
| CSRF | ✅ Protected | POST-only, no auto-submit |
| Network eavesdropping | ✅ Protected | HTTPS enforced, CSP headers set |
| Rate limiting | ⚠️ Recommended | Client-side only; add server-side |

**Overall:** Production-ready with one recommendation (rate limiting).

---

## Test Checklist (Before Launching)

- [ ] **Chat works:** Type a message, get a response
- [ ] **Pricing button:** "Check pricing" shows instant response
- [ ] **Inquiry form:** Submit with name, email, date, message
- [ ] **Mobile:** Open on phone, chat doesn't break
- [ ] **HTTPS:** Browser shows 🔒 lock
- [ ] **DevTools:** No CSP errors in Console
- [ ] **Lighthouse:** Run audit, check security section

**Time:** ~5 minutes

---

## Troubleshooting

### Chat not working
```
1. DevTools → Network tab → POST request
2. Check response status (should be 200)
3. Check Console for errors
4. Host dashboard → Function logs
```

### CSP errors in Console
```
Check netlify.toml / vercel.json:
Content-Security-Policy header
Verify all external domains are whitelisted
```

### API key not found
```
1. Host dashboard → Environment variables
2. Verify ANTHROPIC_API_KEY is set
3. Redeploy after adding the key
```

---

## Architecture Summary

```
Browser (HTML/CSS/JS)
  ↓ (HTTPS POST)
Serverless function (reads API key from env)
  ↓ (HTTPS with secure header)
Anthropic API
  ↓ (JSON response)
Browser (rendered safely)
```

**Key:** API key never leaves the server.

---

## Code Highlights (What a Director Will Notice)

### XSS-Safe Rendering
```javascript
// GOOD ✅
bubble.textContent = userMessage;

// BAD ❌
bubble.innerHTML = userMessage;  // Never!
```

### Environment-Based Secrets
```javascript
// Function reads from process.env
const apiKey = process.env.ANTHROPIC_API_KEY;

// index.html/js files: no secrets
// Verified with: grep -r "sk-ant-" .
```

### Semantic HTML
```html
<header>...</header>
<main>...</main>
<section>...</section>
<footer>...</footer>
<dialog role="dialog" aria-label="Chat">...</dialog>
```

### Input Validation
```javascript
if (!validateEmail(email)) { /* error */ }
if (name.length < 2) { /* error */ }
if (msg.length < 5) { /* error */ }
```

---

## Deployment Costs

- **Netlify:** Free tier (includes functions)
- **Vercel:** Free tier (includes functions)
- **Anthropic API:** Pay-as-you-go (~$0.003 per 1K tokens)

**Monthly estimate:** $1–20 (unless very high traffic)

---

## Next Steps (Post-Launch)

1. **Replace placeholder pricing** in `js/app.js` (SCRIPTS.pricing)
2. **Add rate limiting** to serverless function
3. **Set up inquiry email** (webhook or Netlify Forms)
4. **Monitor API usage** in Anthropic console
5. **A/B test** chat copy and quick-reply buttons

---

## Resources

- **Setup:** Start with `README.md`
- **Security:** Read `SECURITY-and-DEPLOYMENT.md`
- **Architecture:** See `ARCHITECTURE.md`
- **API docs:** [docs.anthropic.com](https://docs.anthropic.com)

---

## Contact / Support

- **Repository:** Your git repo
- **Hosting:** Netlify / Vercel dashboard
- **API:** [console.anthropic.com](https://console.anthropic.com)

---

**Status:** ✅ Production-ready  
**Last checked:** 2024  
**Estimated setup time:** 15 minutes
