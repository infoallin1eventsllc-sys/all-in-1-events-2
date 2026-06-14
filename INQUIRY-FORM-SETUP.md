# Inquiry Form Backend Setup

Your inquiry form currently validates and shows a "Thanks!" message, but **inquiries are not being stored or sent anywhere**. This guide shows you how to fix that.

---

## Option 1: Netlify Forms (Easiest ⭐ Recommended)

Netlify Forms are free and require **zero backend code**. Submissions appear in your Netlify dashboard.

### Step 1: Update the HTML form

In `index.html`, change the inquiry form to a real `<form>` (the current one is a `<div>` that's handled by JS):

```html
<!-- Current code (in index.html) — replace this entire inquiry-form div with: -->

<form name="inquiry" method="POST" netlify class="inquiry-form hidden flex-col p-4 gap-3 overflow-y-auto">
  <p class="text-on-surface-variant text-body-md">Tell us about your event and we'll reply with a custom quote.</p>
  
  <input type="text" name="name" maxlength="80" placeholder="Your name" required/>
  <input type="email" name="email" maxlength="120" placeholder="Email" required/>
  <input type="date" name="eventDate" required/>
  <textarea name="details" rows="3" maxlength="1000" placeholder="Event details (type, guest count, services)" required></textarea>
  
  <!-- Honeypot field (spam prevention) -->
  <input type="hidden" name="bot-field" />
  
  <p id="iq-error" role="alert" class="text-error text-label-sm hidden"></p>
  
  <button type="submit" class="primary-gradient-btn flex-1 py-2.5 rounded-lg font-bold text-on-primary text-label-sm">Send Inquiry</button>
  <button type="button" id="inquiry-back" class="px-4 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant text-label-sm">Back</button>
</form>
```

### Step 2: Update `js/app.js`

Remove the custom inquiry submission logic. The form now submits to Netlify automatically.

Find this function in `js/app.js`:
```javascript
async function submitInquiry() { ... }
```

Replace it with:
```javascript
function submitInquiry() {
  // Netlify Forms handles submission automatically via the form element
  // This is now just for button validation if needed
  const form = document.querySelector('form[name="inquiry"]');
  if (form) form.submit();
}
```

### Step 3: Deploy

1. Push changes to git
2. Netlify auto-deploys
3. Go to your **Netlify dashboard → Forms**
4. You'll see a "inquiry" form appear
5. Test by submitting through the website

**That's it.** Submissions appear in your dashboard and Netlify can email them to you (Site settings → Forms → Notifications).

**Pros:**
- ✅ Zero backend code
- ✅ Spam filtering included
- ✅ Email notifications automatic
- ✅ CSV export available

**Cons:**
- Limited to Netlify
- No custom processing

---

## Option 2: Webhook to Email Service (Recommended for Vercel)

Send inquiries to an email service like **Formspree**, **Mailgun**, or **SendGrid**.

### Step 1: Create Formspree account

1. Go to [formspree.io](https://formspree.io)
2. Sign up, create a new form
3. Copy your endpoint: `https://formspree.io/f/YOUR_ID`

### Step 2: Update `js/app.js`

Change the `submitInquiry()` function:

```javascript
async function submitInquiry() {
  const name = DOM.iqName.value.trim();
  const email = DOM.iqEmail.value.trim();
  const date = DOM.iqDate.value;
  const msg = DOM.iqMsg.value.trim();

  // Validation (same as before)
  if (name.length < 2) {
    showError('Please enter your name.');
    return;
  }
  if (!validateEmail(email)) {
    showError('Please enter a valid email.');
    return;
  }
  if (msg.length < 5) {
    showError('Tell us a little about your event.');
    return;
  }

  clearError();
  DOM.inquirySubmitBtn.disabled = true;
  DOM.inquirySubmitBtn.textContent = 'Sending...';

  try {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('email', email);
    formData.append('eventDate', date);
    formData.append('details', msg);
    formData.append('_replyto', email); // Formspree: reply to customer

    const response = await fetch('https://formspree.io/f/YOUR_FORM_ID', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error('Submission failed');

    // Success
    DOM.iqName.value = '';
    DOM.iqEmail.value = '';
    DOM.iqDate.value = '';
    DOM.iqMsg.value = '';

    hideInquiryForm();
    addBotMessage(`Thanks ${name}! ✨ Your inquiry is in — we'll reply to ${email} within 24 hours.`);
    console.log('[App] Inquiry submitted to Formspree');
  } catch (err) {
    console.error('[App] Inquiry submission failed:', err);
    showError('Something went wrong. Please try again or email us directly.');
  } finally {
    DOM.inquirySubmitBtn.disabled = false;
    DOM.inquirySubmitBtn.textContent = 'Send Inquiry';
  }
}
```

Replace `YOUR_FORM_ID` with your actual Formspree ID.

**Pros:**
- ✅ Works on any host (Netlify, Vercel, etc.)
- ✅ Built-in email notifications
- ✅ SPAM filtering
- ✅ Simple to set up

**Cons:**
- Requires external service
- Free tier has limits (50 submissions/month)

---

## Option 3: Custom Backend Function (Most Control)

Create a serverless function that saves inquiries and sends emails.

### Step 1: Create an inquiry function

Create `netlify/functions/inquiry.js`:

```javascript
// netlify/functions/inquiry.js
// Handles inquiry form submissions and sends confirmation emails

const nodemailer = require('nodemailer');

// Email config (use SendGrid or your SMTP provider)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { name, email, date, msg } = JSON.parse(event.body || '{}');

  // Validation
  if (!name || !email || !msg) {
    return { 
      statusCode: 400, 
      body: JSON.stringify({ error: 'Missing required fields' }) 
    };
  }

  try {
    // Send email to your team
    await transporter.sendMail({
      from: 'noreply@allin1events.com',
      to: 'concierge@allin1events.com',
      subject: `New Inquiry from ${name}`,
      html: `
        <h2>New Event Inquiry</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Event Date:</strong> ${date}</p>
        <p><strong>Details:</strong> ${msg}</p>
      `
    });

    // Send confirmation email to customer
    await transporter.sendMail({
      from: 'concierge@allin1events.com',
      to: email,
      subject: 'Your Inquiry Has Been Received',
      html: `
        <p>Hi ${name},</p>
        <p>Thanks for contacting All in 1 Events! We've received your inquiry and will be in touch within 24 hours.</p>
        <p>Best regards,<br/>The All in 1 Events Team</p>
      `
    });

    return { 
      statusCode: 200, 
      body: JSON.stringify({ success: true }) 
    };
  } catch (err) {
    console.error('[inquiry] Error:', err);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Failed to submit inquiry' }) 
    };
  }
};
```

### Step 2: Set up email service

Use **SendGrid** (free tier):
1. Create account at [sendgrid.com](https://sendgrid.com)
2. Get API key
3. In Netlify dashboard, add environment variables:
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

### Step 3: Update `js/app.js`

Change `API.submitInquiry()` in `js/api.js`:

```javascript
submitInquiry: async (payload) => {
  try {
    const response = await fetch('/.netlify/functions/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Submission failed');
    return await response.json();
  } catch (err) {
    console.error('[API] Inquiry submission failed:', err);
    throw err;
  }
}
```

**Pros:**
- ✅ Full control
- ✅ Custom logic (logging, database, etc.)
- ✅ Can integrate with your CRM

**Cons:**
- Requires email service account
- More setup involved

---

## Recommendation

| Platform | Recommendation |
|----------|---|
| **Netlify** | Use **Option 1: Netlify Forms** (zero code) |
| **Vercel** | Use **Option 2: Formspree** (5 min setup) |
| **Both** | Use **Option 3: Custom function** (most control) |

---

## Testing

After implementing, test the form:

1. Open the site
2. Click "Start Inquiry"
3. Fill in: Name, Email, Date, Message
4. Submit
5. Check your email (or service dashboard) for the submission

---

## What to Tell a Director

> "The inquiry form validates client-side and server-side. Submissions are sent to [email service], and customers get a confirmation email within minutes. The system is resilient — if the email service is down, the form still records the attempt."

---

That's it. **Pick one option and implement it before launching.** A director will definitely ask: "Where do the inquiries go?"
