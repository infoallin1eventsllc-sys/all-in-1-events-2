# Pre-Launch Checklist

Use this checklist before launching to a director, client, or production.

---

## Phase 1: Code Review (Before Deployment)

### Secrets & Security
- [ ] No API key in any source file
  ```bash
  grep -r "sk-ant-" . --exclude-dir=node_modules
  # Should return: (nothing)
  ```
- [ ] `.env` is in `.gitignore`
  ```bash
  cat .gitignore | grep "^.env"
  # Should return: .env
  ```
- [ ] `.env.example` exists (template only, no real key)
- [ ] No hardcoded API URLs or credentials
- [ ] `.gitignore` blocks: `.env`, `node_modules/`, `*.log`

### Code Quality
- [ ] HTML is semantic (nav, main, footer, section, dialog)
- [ ] CSS is organized with comments
- [ ] JS uses `textContent`, never `innerHTML` for user data
- [ ] Form validation on client-side (length, email regex)
- [ ] Error handling in try/catch blocks
- [ ] All DOM references use `document.getElementById()` (not selectors alone)
- [ ] Event listeners cleaned up (no memory leaks)
- [ ] Console.log statements are for debugging (use in dev, consider removing in prod)

### Accessibility
- [ ] All buttons have `aria-label` or visible text
- [ ] Form inputs have `<label>` or `aria-label`
- [ ] Focus states visible (CSS `:focus-visible`)
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Images have `alt` text
- [ ] Color contrast passes WCAG AA (use [WebAIM](https://webaim.org/resources/contrastchecker/))
- [ ] Semantic HTML tags (not all divs)

### Dependencies
- [ ] `package.json` exists and lists all dependencies
- [ ] No vulnerable dependencies
  ```bash
  npm audit
  # Should return: 0 vulnerabilities
  ```

---

## Phase 2: Inquiry Form Backend

**CRITICAL: Your inquiry form must have a backend before launch.**

- [ ] **Choose one option:**
  - [ ] Option 1 (Netlify): Using Netlify Forms (if deploying on Netlify)
  - [ ] Option 2 (Any host): Using Formspree or similar webhook service
  - [ ] Option 3 (Advanced): Custom serverless function + email service

- [ ] **Implementation verified:**
  - [ ] Test form submission locally or in staging
  - [ ] Verify submission appears in your backend/email
  - [ ] Confirm customer receives confirmation email
  - [ ] Check that your team receives the inquiry
  - [ ] Verify error handling (try submitting invalid data)

---

## Phase 3: Security Configuration

### Serverless Functions
- [ ] Rate limiting implemented (10 req/min per IP)
- [ ] Health check endpoint working (GET request)
- [ ] Input validation on all endpoints
- [ ] Error messages don't expose internal details
- [ ] Logging doesn't include sensitive data

### Deployment Config Files
- [ ] `netlify.toml` or `vercel.json` exists
- [ ] Security headers are set:
  - [ ] `X-Frame-Options: DENY`
  - [ ] `X-Content-Type-Options: nosniff`
  - [ ] `Content-Security-Policy` configured
  - [ ] `Referrer-Policy` set
  - [ ] `Permissions-Policy` restricts camera/mic
- [ ] CSP whitelist includes only needed domains:
  - [ ] `https://cdn.tailwindcss.com` (if using CDN)
  - [ ] `https://fonts.googleapis.com` and `https://fonts.gstatic.com`
  - [ ] `https://api.anthropic.com` (for API calls)
  - [ ] `https://lh3.googleusercontent.com` (for images)

### Environment Variables
- [ ] `ANTHROPIC_API_KEY` is set in host dashboard (not in code)
- [ ] Any other secrets are in env vars, not in code
- [ ] Environment-specific configs are in place (dev vs prod if needed)

---

## Phase 4: Testing

### Browser Testing
- [ ] Test on Chrome (desktop)
- [ ] Test on Safari (desktop)
- [ ] Test on Firefox (desktop)
- [ ] Test on Chrome (mobile, Android)
- [ ] Test on Safari (mobile, iOS)
- [ ] Test on Edge (Windows)

### Responsive Design
- [ ] Mobile (320px): Layout works, text readable
- [ ] Tablet (768px): Layout breaks? Check CSS grid/flex
- [ ] Desktop (1280px): Full layout visible, no weird spacing
- [ ] Landscape orientation: Works on mobile

### Functionality
- [ ] Chat opens/closes smoothly
- [ ] Typing a message works
- [ ] Quick reply buttons (Pricing, Availability, Venues) respond instantly
- [ ] AI response appears within 5 seconds
- [ ] Inquiry form opens/closes
- [ ] Inquiry form validates (try submitting empty fields)
- [ ] Submit button disables while awaiting response
- [ ] Textarea auto-grows as you type
- [ ] Enter key sends, Shift+Enter new line
- [ ] Mobile: chat panel doesn't break layout

### Performance
- [ ] Page loads in <3 seconds (run Lighthouse)
- [ ] Chat responds in <2 seconds (network latency acceptable)
- [ ] No console errors
- [ ] No console warnings (except expected third-party libs)
- [ ] Lighthouse audit: Security ≥90%, Performance ≥80%

### Accessibility
- [ ] Tab through entire page: all interactive elements reachable
- [ ] Screen reader test: chat and form are navigable
- [ ] Use [WAVE browser extension](https://wave.webaim.org/extension/) for auto-audit
- [ ] Color contrast: Text and buttons pass AA standard

### Security
- [ ] Site loads over HTTPS (browser shows 🔒)
- [ ] DevTools → Security tab → Certificate valid
- [ ] DevTools → Console: No CSP errors
- [ ] CSP header visible in Network tab
- [ ] XSS test: Paste `<img src=x onerror='alert("xss")'>` in chat → should show as plain text, not trigger popup
- [ ] Rate limiting works: Spam requests get 429 errors

---

## Phase 5: Deployment

### Pre-Deployment
- [ ] All code committed to git
- [ ] Remote repository (GitHub, GitLab, Bitbucket) set up
- [ ] `.env` is NOT in git history
  ```bash
  git log --all --full-history -- .env
  # Should return: (nothing)
  ```
- [ ] No untracked files with secrets

### Deploy to Host

**For Netlify:**
- [ ] Repository connected to Netlify
- [ ] Build command: default (no build needed)
- [ ] Publish directory: root `.`
- [ ] Environment variable `ANTHROPIC_API_KEY` set in dashboard
- [ ] Functions directory: `netlify/functions`

**For Vercel:**
- [ ] Repository connected to Vercel
- [ ] Framework preset: Other (static)
- [ ] Environment variable `ANTHROPIC_API_KEY` set in dashboard
- [ ] Functions directory: `vercel/api`

### Post-Deployment
- [ ] Deployment succeeded (check host dashboard)
- [ ] Site is live at your domain
- [ ] Domain shows HTTPS (browser 🔒)
- [ ] Run Lighthouse audit on live site
- [ ] Test chat functionality on live site
- [ ] Test inquiry form on live site (check backend)
- [ ] Check that API key is NOT exposed
  ```bash
  curl https://your-domain.com | grep -i "sk-ant-"
  # Should return: (nothing)
  ```

---

## Phase 6: Post-Launch

### Day 1
- [ ] Monitor function logs (check for errors)
- [ ] Monitor API usage (Anthropic console)
- [ ] Respond to first inquiry quickly (show responsiveness)
- [ ] Check email to make sure inquiries are arriving

### Week 1
- [ ] Replace placeholder pricing in `SCRIPTS.pricing` (js/app.js)
- [ ] Test with a few real customer inquiries
- [ ] Collect feedback from early users
- [ ] Monitor Lighthouse scores weekly
- [ ] Check for any error spikes

### Ongoing
- [ ] Set up analytics (Google Analytics, Mixpanel)
- [ ] Set up error tracking (Sentry, LogRocket)
- [ ] Monitor API costs (set billing alerts in Anthropic console)
- [ ] Collect customer feedback on chat quality
- [ ] A/B test chat copy and quick-reply buttons
- [ ] Refine system prompt based on usage patterns

---

## Checklist Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Code Review | ✅ Ready | See Phase 1 above |
| Security | ✅ Ready | See Phase 3 above |
| Inquiry Form | ⚠️ **TODO** | Must choose backend (Phase 2) |
| Testing | ⚠️ **TODO** | Test on real devices (Phase 4) |
| Deployment | ⚠️ **TODO** | Follow Phase 5 |
| Post-Launch | ⏳ After | Follow Phase 6 |

---

## Quick Reference: What a Director Will Ask

| Question | Answer | Evidence |
|----------|--------|----------|
| Where's the API key? | In process.env, not in code | `grep -r "sk-ant-"` returns nothing |
| Is it XSS-safe? | Yes, using textContent | Check js/app.js line ~180 |
| How do you prevent abuse? | Rate limiting on function | Check netlify/functions/chat.js |
| What if the API is down? | Graceful fallback to inquiry form | Check js/app.js try/catch ~line 210 |
| Where do inquiries go? | [Your chosen backend] | [Link to Netlify Forms / Formspree / Function] |
| Is it accessible? | Yes, WCAG AA compliant | Lighthouse audit, WAVE extension test |
| How's performance? | <3s load, <2s chat response | Lighthouse report |

---

## Red Flags (Don't Launch If Any Are True)

❌ API key appears anywhere in source code  
❌ `.env` is in git history  
❌ Inquiry form doesn't have a backend  
❌ Site doesn't load over HTTPS  
❌ CSP errors in DevTools Console  
❌ Chat doesn't respond (no error message)  
❌ Mobile layout is broken  
❌ Lighthouse Security < 80%  

---

## Sign-Off

Before you claim "ready to launch," confirm:

- [ ] Code is clean and documented
- [ ] Security is verified (no hardcoded secrets)
- [ ] Inquiry form backend is working
- [ ] Tests pass on real devices
- [ ] Director or colleague has reviewed the code
- [ ] You've tested the live site (after deploy)

**Status: Ready to Launch?** ___________  
**Date:** ___________  
**Reviewed by:** ___________

---

**Last Updated:** 2024  
**Maintenance:** Review this checklist monthly during first quarter after launch.
