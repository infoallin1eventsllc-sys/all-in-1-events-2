/* ============================
   ALL IN 1 EVENTS — API LAYER
   ============================ */

(function () {
  'use strict';

  // Determine which backend URL to call based on where the page is hosted.
  function detectBackendUrl() {
    const h = window.location.hostname;
    if (h.endsWith('netlify.app') || h.includes('netlify')) {
      return '/.netlify/functions/chat';
    }
    if (h.endsWith('vercel.app') || h.includes('vercel')) {
      return '/api/chat';
    }
    // localhost / static preview → demo mode (no backend needed)
    return null;
  }

  const BACKEND_URL = detectBackendUrl();
  const DEMO_MODE   = !BACKEND_URL;

  // Curated demo responses keyed to keywords.
  const DEMO_RESPONSES = [
    {
      keywords: ['price', 'cost', 'how much', 'rate', 'fee', 'package'],
      reply: 'Our packages start at $500 for intimate gatherings. Magic Mirror Photo Booth from $799, Atmospheric Lighting from $1,200, and VIP Lounge setups from $2,500. Want a custom quote? Hit "Start Inquiry" and we\'ll tailor one for your event!'
    },
    {
      keywords: ['availab', 'book', 'schedule', 'calendar', 'date', 'weekend'],
      reply: 'We typically book 4–8 weeks out for weekends. Share your event date and we\'ll confirm availability — or click "Start Inquiry" and we\'ll reach back within 24 hours!'
    },
    {
      keywords: ['venue', 'location', 'where', 'travel', 'city'],
      reply: 'We service the greater metro area and travel up to 150 miles. We\'ve worked venues from rooftop bars to grand ballrooms. What type of venue are you considering?'
    },
    {
      keywords: ['photo', 'mirror', 'booth', 'magic', 'interactive'],
      reply: 'The Magic Mirror is a full-length 6 ft interactive touch mirror — live animations, digital props, themed overlays, and instant social sharing. Needs a 7×7 ft space and includes a dedicated attendant. A crowd-pleaser at weddings, galas, and nightlife events!'
    },
    {
      keywords: ['light', 'dmx', 'beam', 'uplight', 'glow', 'color'],
      reply: 'Our Atmospheric Lighting packages feature DMX-controlled moving heads, up to 24 LED uplights, intelligent beam fixtures, and custom color programming matched to your brand or theme.'
    },
    {
      keywords: ['vip', 'lounge', 'seating', 'leather', 'velvet'],
      reply: 'VIP Lounge packages include premium white leather sectionals, illuminated LED cocktail tables, velvet rope setups, custom signage, and plush décor — perfect for exclusive zones at galas, corporate parties, and nightclub events.'
    },
    {
      keywords: ['plan', 'coordinat', 'organiz', 'logistic', 'manag', 'full service'],
      reply: 'Our Bespoke Planning covers venue scouting, vendor coordination, talent booking, timeline management, and day-of execution. We handle the precision so you handle the party.'
    },
    {
      keywords: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'howdy'],
      reply: 'Welcome to All in 1 Events! I\'m your AI Event Concierge. I can help with services, pricing, availability, or kick off an inquiry. What kind of event are you planning?'
    },
    {
      keywords: ['thank', 'thanks', 'great', 'awesome', 'perfect'],
      reply: 'You\'re very welcome! Is there anything else I can help you with — pricing, availability, or details on a specific service?'
    }
  ];

  function getDemoResponse(userMessage) {
    const lower = userMessage.toLowerCase();
    for (const item of DEMO_RESPONSES) {
      if (item.keywords.some(kw => lower.includes(kw))) {
        return item.reply;
      }
    }
    return 'Great question! We specialize in luxury event production — photo booths, atmospheric lighting, VIP lounges, and full-service planning. Would you like details on a specific service, or shall I help start an inquiry?';
  }

  /**
   * Send a chat message array to the backend (or return a demo reply).
   * @param {Array<{role: string, content: string}>} messages
   * @returns {Promise<string>} The assistant's reply text.
   */
  async function sendChatMessage(messages) {
    if (DEMO_MODE) {
      // Simulate a short network delay for realism
      await new Promise(r => setTimeout(r, 700 + Math.random() * 600));
      return getDemoResponse(messages[messages.length - 1].content);
    }

    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    return data.reply || data.content || 'No response received.';
  }

  /**
   * Submit the inquiry form to the backend.
   * @param {{name: string, email: string, date: string, message: string}} payload
   * @returns {Promise<void>}
   */
  async function submitInquiry(payload) {
    if (DEMO_MODE) {
      await new Promise(r => setTimeout(r, 900));
      return; // success in demo mode
    }

    const url = BACKEND_URL.replace('/chat', '/inquiry');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Inquiry API error ${res.status}`);
  }

  // Expose to app.js
  window.AllIn1API = { sendChatMessage, submitInquiry, DEMO_MODE };
})();
