/* All in 1 Events — API client.
 *
 * Every network call the page makes goes through here, so the pages stay
 * unaware of where things are hosted. Two endpoints:
 *
 *   chat  → /.netlify/functions/chat  (concierge replies)
 *   lead  → /.netlify/functions/lead  (inquiry → Meridian CRM)
 *
 * The API key for the chat model lives only in the serverless function's
 * environment. It must never appear in this file — this file is served to
 * every visitor.
 */

const API = {
  chat: "/.netlify/functions/chat",
  lead: "/.netlify/functions/lead"
};

/* Scripted answers for the common questions. These are used when the chat
 * backend is not configured, so the concierge is still useful on day one
 * rather than apologising. They are also what the quick-reply buttons fire. */
const FAQ = {
  pricing:
    "Packages start at $1,500 for a photo booth with an attendant, and scale with " +
    "lighting, VIP lounge and full production. Tell me your date, guest count and " +
    "the services you want and I'll come back with a written quote.",
  availability:
    "We book most Fridays and Saturdays two to three months out, and midweek dates " +
    "are usually open at shorter notice. Share your date and I'll confirm whether " +
    "it's free.",
  venues:
    "We work in ballrooms, warehouses, rooftops and private estates, and we handle " +
    "load-in and power planning for each. If you tell me the venue I can flag " +
    "anything that needs early attention — ceiling height, rigging and power are " +
    "the usual ones."
};

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    throw new Error("unreadable response");
  }
  return { ok: res.ok, status: res.status, data };
}

/* Resolves { reply, live }. `live` is false when the answer came from the
 * scripted fallback rather than the model, so the UI can say so instead of
 * passing off a canned line as a considered reply. */
async function sendChat(message, history) {
  try {
    const { ok, status, data } = await postJSON(API.chat, { message, history });
    if (ok && data.reply) return { reply: data.reply, live: true };
    if (status === 404 || data.error === "not_configured") {
      return { reply: fallbackReply(message), live: false };
    }
    return {
      reply: data.message || "Something went wrong reaching the concierge. " +
             "Use Start Inquiry and a person will reply to you directly.",
      live: false
    };
  } catch {
    return { reply: fallbackReply(message), live: false };
  }
}

function fallbackReply(message) {
  const m = String(message).toLowerCase();
  if (/pric|cost|quote|how much|\$/.test(m)) return FAQ.pricing;
  if (/avail|date|book|when|free/.test(m)) return FAQ.availability;
  if (/venue|space|location|where|room/.test(m)) return FAQ.venues;
  if (/photo ?booth|mirror/.test(m))
    return "Our Magic Mirror booth is a full-length mirror with animated prompts, " +
           "props and instant prints, and an attendant stays with it all night. " +
           "It's included in most packages.";
  if (/light/.test(m))
    return "Lighting covers uplighting, dance-floor wash, monogram projection and " +
           "haze. We design it to the room once we know the venue.";
  return "I can help with pricing, availability, venues and our services. " +
         "For anything specific to your event, use Start Inquiry — tell us the " +
         "date and details and we'll reply with a quote.";
}

/* Resolves { delivered, message }. Never reports success unless the CRM
 * accepted the lead. */
async function sendInquiry(payload) {
  try {
    const { ok, status, data } = await postJSON(API.lead, payload);
    if (ok && data.ok !== false) {
      return { delivered: true, message: "Sent — we'll reply to your email shortly." };
    }
    if (status === 400 && data.error) {
      return { delivered: false, message: String(data.error) };
    }
    if (status === 404 || data.error === "not_configured") {
      return {
        delivered: false,
        message: "Our form isn't connected yet. Email concierge@allin1events.com and we'll pick it up."
      };
    }
    return {
      delivered: false,
      message: data.message || "We couldn't send that. Try again, or email concierge@allin1events.com."
    };
  } catch {
    return {
      delivered: false,
      message: "No connection. Check your network, or email concierge@allin1events.com."
    };
  }
}
