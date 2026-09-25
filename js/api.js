/*
 * API client for the Event Concierge. No secrets live here: the browser talks
 * only to this site's own serverless function, which holds ANTHROPIC_API_KEY.
 *
 *   Netlify   /.netlify/functions/chat   (netlify/functions/chat.js)
 *   Vercel    /api/chat                   (api/chat.js)
 *
 * The first endpoint that answers is remembered for the rest of the visit. When
 * neither is deployed (opening index.html from disk, or a plain static host),
 * ConciergeAPI.send rejects with { offline: true } and the app falls back to
 * its scripted answers and the inquiry form.
 */
(function () {
  'use strict';

  var ENDPOINTS = ['/.netlify/functions/chat', '/api/chat'];
  var TIMEOUT_MS = 30000;
  var working = null;          // the endpoint that answered last

  function post(url, body) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined,
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  /**
   * Send the conversation so far ([{ role: 'user'|'assistant', content }]).
   * Resolves with the reply text. Rejects with an Error that has:
   *   offline: true   no concierge function is deployed here
   *   status          the HTTP status when the function answered with an error
   */
  function send(messages) {
    var list = working ? [working] : location.protocol === 'file:' ? [] : ENDPOINTS.slice();
    function next(i) {
      if (i >= list.length) {
        var off = new Error('The concierge is offline.'); off.offline = true;
        return Promise.reject(off);
      }
      var url = list[i];
      return post(url, { messages: messages }).then(function (res) {
        // 404/405/501: nothing deployed at this path (static host), try the next one.
        if (res.status === 404 || res.status === 405 || res.status === 501) return next(i + 1);
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || typeof data.reply !== 'string') {
            var err = new Error(data.error || 'The concierge could not answer just now.');
            err.status = res.status;
            if (res.status === 503) err.offline = true;       // deployed without a key
            throw err;
          }
          working = url;
          return data.reply;
        });
      }, function (e) {
        if (e && e.name === 'AbortError') { var t = new Error('The concierge took too long to answer.'); t.status = 504; throw t; }
        return next(i + 1);                                    // network error: try the next host
      });
    }
    return next(0);
  }

  /**
   * Submit an inquiry as a Netlify Form ("inquiry", declared in index.html).
   * Resolves true when the host accepted it. On a host without Netlify Forms it
   * rejects, and the app offers an email draft instead.
   */
  function submitInquiry(fields) {
    var body = new URLSearchParams();
    body.append('form-name', 'inquiry');
    Object.keys(fields).forEach(function (k) { body.append(k, fields[k] == null ? '' : String(fields[k])); });
    return fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).then(function (res) {
      if (!res.ok) throw new Error('Inquiry not accepted (' + res.status + ')');
      return true;
    });
  }

  window.ConciergeAPI = { send: send, submitInquiry: submitInquiry };
})();
