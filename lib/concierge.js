/*
 * The Event Concierge, server side. Shared by the Netlify function
 * (netlify/functions/chat.js) and the Vercel function (api/chat.js).
 *
 * The API key is read from process.env.ANTHROPIC_API_KEY (set it in the host's
 * dashboard, never in git). The system prompt lives here, not in the browser, so
 * a visitor can't repurpose the endpoint; input is capped so it can't be used as
 * a free, unlimited model proxy.
 */
'use strict';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_MESSAGES = 12;
const MAX_CHARS = 800;
const MAX_TOKENS = 500;

const SYSTEM = `You are the Event Concierge for All in 1 Events, a luxury event production company.
Services: Magic Mirror photo booth (full-length interactive touch mirror with animations and digital props), atmospheric lighting (DMX-controlled beams, uplighting, intelligent fixtures), VIP lounge rentals (white leather seating, LED cocktail tables, velvet decor), and bespoke planning (venue scouting, talent booking, timeline management, VIP table management and full-scale logistics).
How to answer:
- Be warm, concise and specific: two to four short sentences, plain text, no markdown.
- Never state prices, discounts, availability or guarantees: every event is quoted to its date, guest count, venue and services. Invite the visitor to press "Start Inquiry" for a custom quote.
- Stay on the topic of events and these services. Politely decline anything else.
- Contact: concierge@allin1events.com.`;

/** Validate and trim the conversation from the browser. Returns { messages } or { error }. */
function clean(body) {
  const list = body && Array.isArray(body.messages) ? body.messages : null;
  if (!list || !list.length) return { error: 'messages must be a non-empty array' };
  const messages = [];
  for (const m of list.slice(-MAX_MESSAGES)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return { error: 'each message needs a role (user or assistant) and text content' };
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) continue;
    const prev = messages[messages.length - 1];
    if (prev && prev.role === m.role) prev.content += '\n' + content;          // the API wants alternating turns
    else messages.push({ role: m.role, content });
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') return { error: 'the last message must be from the user' };
  return { messages };
}

/**
 * Handle one chat request body. Returns { status, body } for the host wrapper.
 * Errors to the browser are generic; details go to the server log only.
 */
async function reply(body, fetchImpl = fetch) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { status: 503, body: { error: 'The concierge is not configured yet.' } };
  const c = clean(body);
  if (c.error) return { status: 400, body: { error: c.error } };
  let res;
  try {
    res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM, messages: c.messages }),
    });
  } catch (e) {
    console.error('concierge: network error', e && e.message);
    return { status: 502, body: { error: 'The concierge could not be reached.' } };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('concierge: API error', res.status, data && data.error && data.error.type);
    return { status: res.status === 429 ? 429 : 502, body: { error: res.status === 429 ? 'The concierge is busy; please try again in a moment.' : 'The concierge could not answer just now.' } };
  }
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!text) return { status: 502, body: { error: 'The concierge could not answer just now.' } };
  return { status: 200, body: { reply: text } };
}

module.exports = { reply, clean, SYSTEM, MAX_MESSAGES, MAX_CHARS };
