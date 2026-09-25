/*
 * All in 1 Events: the Event Concierge chat and the inquiry form.
 *
 * Security: every message is rendered with textContent, never innerHTML, so
 * nothing a visitor or the model types can become markup.
 * Degrades gracefully: without a deployed concierge function the quick replies
 * and free-text questions get scripted answers that point to the inquiry form.
 */
(function () {
  'use strict';

  var CONTACT_EMAIL = 'concierge@allin1events.com';
  var MAX_HISTORY = 12;                          // messages sent to the concierge per request

  var AppState = { history: [], isAwaiting: false, open: false, greeted: false, interests: [] };

  // Scripted answers. They describe how quoting works rather than quote numbers:
  // put real prices here (or in the concierge's system prompt) when they're set.
  var SCRIPTS = {
    greeting: "Hi! I'm the All in 1 Events concierge. Ask me about photo booths, lighting, VIP lounges or full event planning, or start an inquiry and we'll reply with a custom quote.",
    pricing: 'Every event is quoted to its date, guest count, venue and the services you combine, so bundles cost less than booking each piece on its own. Start an inquiry with your date and a rough guest count and we\'ll send a custom quote.',
    availability: 'Popular dates (Fridays, Saturdays and holiday weekends) book early. Tell us your date in an inquiry and we\'ll confirm availability for the services you want.',
    venues: 'We produce events at private homes, hotels, lofts, rooftops and clubs, and we can help you scout a venue that fits your guest count and style. Share your area and headcount in an inquiry and we\'ll suggest options.',
    fallback: 'Thanks for asking! Our live concierge is offline right now. For anything specific (dates, packages, pricing), start an inquiry and our team will reply personally.',
  };
  var SERVICE_NAMES = { 'magic-mirror-btn': 'Magic Mirror Photo Booth', 'lighting-btn': 'Atmospheric Lighting', 'vip-btn': 'VIP Lounge Rentals' };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    launcher: $('chat-launcher'), panel: $('chat-panel'), close: $('chat-close-btn'),
    log: $('chat-messages'), quick: $('quick-replies'), inputRow: $('chat-input-row'),
    input: $('chat-input'), send: $('chat-send'),
    form: $('inquiry-form'), toggle: $('inquiry-toggle-btn'), submit: $('inquiry-submit'), back: $('inquiry-back'),
    name: $('iq-name'), email: $('iq-email'), date: $('iq-date'), msg: $('iq-msg'), error: $('iq-error'),
  };
  if (!el.panel || !el.launcher) return;

  // ---- panel ----------------------------------------------------------------------
  var lastFocus = null;
  function openChat(opts) {
    if (!AppState.open) {
      lastFocus = document.activeElement;
      AppState.open = true;
      el.panel.classList.remove('chat-panel-closed');
      el.panel.setAttribute('aria-hidden', 'false');
      el.launcher.setAttribute('aria-expanded', 'true');
      el.launcher.classList.add('is-hidden');
      if (!AppState.greeted) { AppState.greeted = true; addMessage('bot', SCRIPTS.greeting, false); }
    }
    if (opts && opts.inquiry) showInquiry(true);
    else setTimeout(function () { (AppState.formOpen ? el.name : el.input).focus(); }, 60);
  }
  function closeChat() {
    if (!AppState.open) return;
    AppState.open = false;
    el.panel.classList.add('chat-panel-closed');
    el.panel.setAttribute('aria-hidden', 'true');
    el.launcher.setAttribute('aria-expanded', 'false');
    el.launcher.classList.remove('is-hidden');
    (lastFocus && document.contains(lastFocus) ? lastFocus : el.launcher).focus();
  }
  el.launcher.setAttribute('aria-expanded', 'false');
  el.launcher.setAttribute('aria-controls', 'chat-panel');
  el.launcher.addEventListener('click', function () { openChat(); });
  el.close.addEventListener('click', closeChat);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && AppState.open) closeChat(); });

  // ---- messages -------------------------------------------------------------------
  function addMessage(who, text, record, isError) {
    var row = document.createElement('div');
    row.className = 'chat-msg ' + (who === 'user' ? 'from-user' : 'from-bot');
    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble' + (isError ? ' is-error' : '');
    bubble.textContent = text;                                   // XSS-safe
    row.appendChild(bubble);
    el.log.appendChild(row);
    el.log.scrollTop = el.log.scrollHeight;
    if (record !== false) {
      AppState.history.push({ role: who === 'user' ? 'user' : 'assistant', content: text });
      if (AppState.history.length > 40) AppState.history.splice(0, AppState.history.length - 40);
    }
    return row;
  }
  function showTyping() {
    var row = document.createElement('div');
    row.className = 'chat-msg from-bot';
    row.setAttribute('aria-label', 'Concierge is typing');
    var dots = document.createElement('div');
    dots.className = 'chat-bubble chat-typing';
    for (var i = 0; i < 3; i++) dots.appendChild(document.createElement('span'));
    row.appendChild(dots);
    el.log.appendChild(row);
    el.log.scrollTop = el.log.scrollHeight;
    return row;
  }
  function setBusy(b) {
    AppState.isAwaiting = b;
    el.send.disabled = b;
    el.log.setAttribute('aria-busy', b ? 'true' : 'false');
  }

  function scripted(text) {
    var t = text.toLowerCase();
    if (/(price|pricing|cost|quote|rate|how much|\$)/.test(t)) return SCRIPTS.pricing;
    if (/(avail|date|book|open|weekend|calendar)/.test(t)) return SCRIPTS.availability;
    if (/(venue|location|place|where|space)/.test(t)) return SCRIPTS.venues;
    return SCRIPTS.fallback;
  }

  function ask(text) {
    text = String(text || '').trim();
    if (!text || AppState.isAwaiting) return;
    addMessage('user', text);
    setBusy(true);
    var typing = showTyping();
    var convo = AppState.history.slice(-MAX_HISTORY);
    while (convo.length && convo[0].role !== 'user') convo.shift();      // the API wants a user turn first
    window.ConciergeAPI.send(convo).then(function (reply) {
      typing.remove();
      addMessage('bot', reply);
    }, function (err) {
      typing.remove();
      if (err && err.offline) addMessage('bot', scripted(text));
      else addMessage('bot', (err && err.message ? err.message + ' ' : '') + 'You can also start an inquiry and we\'ll reply by email.', false, true);
    }).then(function () { setBusy(false); });
  }

  el.send.addEventListener('click', function () { var v = el.input.value; el.input.value = ''; grow(); ask(v); });
  el.input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.send.click(); }
  });
  function grow() { el.input.style.height = 'auto'; el.input.style.height = Math.min(el.input.scrollHeight, 112) + 'px'; }
  el.input.addEventListener('input', grow);

  el.quick.addEventListener('click', function (e) {
    var b = e.target.closest('.quick-reply-btn');
    if (!b) return;
    var label = b.textContent.trim(), key = b.getAttribute('data-action');
    addMessage('user', label);
    addMessage('bot', SCRIPTS[key] || SCRIPTS.fallback);
  });

  // ---- inquiry form ---------------------------------------------------------------
  // A honeypot the visitor never sees; bots fill it and are dropped silently.
  var hp = document.createElement('input');
  hp.type = 'text'; hp.name = 'bot-field'; hp.tabIndex = -1; hp.autocomplete = 'off';
  hp.className = 'hp-field'; hp.setAttribute('aria-hidden', 'true');
  el.form.appendChild(hp);
  if (el.date) el.date.min = new Date().toISOString().slice(0, 10);

  function showInquiry(on) {
    AppState.formOpen = on;
    el.form.classList.toggle('hidden', !on);
    el.inputRow.classList.toggle('hidden', on);
    el.quick.classList.toggle('hidden', on);
    el.log.classList.toggle('hidden', on);
    if (on) {
      if (AppState.interests.length && !el.msg.value) el.msg.value = 'Interested in: ' + AppState.interests.join(', ') + '. ';
      setTimeout(function () { el.name.focus(); }, 60);
    } else setTimeout(function () { el.input.focus(); }, 60);
  }
  el.toggle.addEventListener('click', function () { showInquiry(true); });
  el.back.addEventListener('click', function () { showInquiry(false); });

  function validateEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function fail(field, message) {
    [el.name, el.email, el.date, el.msg].forEach(function (f) { f.classList.remove('is-invalid'); f.removeAttribute('aria-invalid'); });
    if (field) { field.classList.add('is-invalid'); field.setAttribute('aria-invalid', 'true'); field.focus(); }
    el.error.textContent = message;
    el.error.classList.toggle('hidden', !message);
  }
  function mailtoFor(f) {
    var body = 'Name: ' + f.name + '\nEmail: ' + f.email + '\nEvent date: ' + (f.eventDate || 'not set') + '\n\n' + f.details;
    return 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent('Event inquiry from ' + f.name) + '&body=' + encodeURIComponent(body);
  }

  el.submit.addEventListener('click', function () {
    var f = { name: el.name.value.trim(), email: el.email.value.trim(), eventDate: el.date.value, details: el.msg.value.trim() };
    if (f.name.length < 2) return fail(el.name, 'Please enter your name.');
    if (!validateEmail(f.email)) return fail(el.email, 'Please enter a valid email address.');
    if (f.eventDate && f.eventDate < new Date().toISOString().slice(0, 10)) return fail(el.date, 'Please pick a date that is not in the past.');
    if (f.details.length < 10) return fail(el.msg, 'Tell us a little about the event (type, guest count, services).');
    fail(null, '');
    if (hp.value) { done(f, true); return; }                           // a bot: pretend it worked
    el.submit.disabled = true; el.submit.textContent = 'Sending…';
    window.ConciergeAPI.submitInquiry(f).then(function () { done(f, true); }, function () { done(f, false); })
      .then(function () { el.submit.disabled = false; el.submit.textContent = 'Send Inquiry'; });
  });

  function done(f, sent) {
    showInquiry(false);
    if (sent) {
      addMessage('bot', 'Thanks, ' + f.name.split(' ')[0] + '! Your inquiry is in. We\'ll reply to ' + f.email + ' with availability and a custom quote.', false);
      [el.name, el.email, el.date, el.msg].forEach(function (x) { x.value = ''; });
      AppState.interests = [];
    } else {
      // The host doesn't take form posts (e.g. opened from disk): hand over an email draft instead.
      var row = addMessage('bot', 'We couldn\'t send that from here. ', false, true);
      var a = document.createElement('a');
      a.href = mailtoFor(f); a.textContent = 'Email your inquiry to ' + CONTACT_EMAIL;
      row.firstChild.appendChild(a);
    }
  }

  // ---- page buttons ---------------------------------------------------------------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('#header-book-btn, .magic-mirror-btn, .lighting-btn, .vip-btn, a[href="#contact"]');
    if (!t) return;
    e.preventDefault();
    for (var cls in SERVICE_NAMES) {
      if (t.classList.contains(cls) && AppState.interests.indexOf(SERVICE_NAMES[cls]) < 0) AppState.interests.push(SERVICE_NAMES[cls]);
    }
    openChat({ inquiry: true });
  });
})();
