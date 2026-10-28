// The card's background, chosen by the card owner.
//
// The owner picks a background (or uploads a photo) in a private portal; the
// choice is stored server-side under one key, and every visitor's card reads it
// here. Visitors cannot change it. Built by build_card.py from
// assets/card-background.js; values in __CAPS__ are filled in at build time.
// Kept out of the HTML because the site's security policy runs no inline script.
(function () {
  var KEY = '__KEY__';
  var ENDPOINT = '__ENDPOINT__';
  var PUBLIC_BASE = '__PUBLIC_BASE__';   // how stored choices name the built-in backgrounds
  var LOCAL_BASE = '__LOCAL_BASE__';     // where this page loads them from (same origin)
  var DEFAULT_STEM = '__DEFAULT__';
  var THEMES = __THEMES__;
  var CACHE = 'card_bg:' + KEY;
  var root = document.documentElement;
  root.className += ' bgjs';

  function isUpload(url) {
    return /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[A-Za-z0-9._\/-]+$/.test(url);
  }
  function stemOf(url) {
    if (typeof url !== 'string' || url.indexOf(PUBLIC_BASE) !== 0) return null;
    var s = url.slice(PUBLIC_BASE.length).replace(/\.jpg$/, '');
    return THEMES.hasOwnProperty(s) ? s : null;
  }
  function apply(url) {
    var stem = stemOf(url), src, theme;
    if (stem) { src = LOCAL_BASE + stem + '.jpg'; theme = THEMES[stem]; }
    else if (typeof url === 'string' && url.length < 2048 && isUpload(url)) { src = url; theme = THEMES.__upload__; }
    else { src = LOCAL_BASE + DEFAULT_STEM + '.jpg'; theme = THEMES[DEFAULT_STEM]; }
    var st = root.style;
    st.setProperty('--top', theme.top);
    st.setProperty('--acc', theme.acc);
    st.setProperty('--acc-text', theme.accText);
    st.setProperty('--ink', theme.ink);
    var paint = function () {
      document.body.style.backgroundImage = 'url("' + src + '")';
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', theme.top);
      if (root.className.indexOf('bgset') < 0) root.className += ' bgset';
    };
    if (document.body) paint(); else document.addEventListener('DOMContentLoaded', paint);
  }

  var cached = null;
  try { cached = localStorage.getItem(CACHE); } catch (e) { /* storage off: no fast first paint */ }
  if (cached) apply(cached);
  // A slow or blocked network still ends with a background, never a blank card.
  var fallback = setTimeout(function () { if (!cached) apply(''); }, 2500);

  fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"list"}' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (b) {
      if (!b || !b.ok) return;
      clearTimeout(fallback);
      var url = (b.overrides && b.overrides[KEY]) || '';
      apply(url);
      try { if (url) localStorage.setItem(CACHE, url); else localStorage.removeItem(CACHE); } catch (e) { /* ignore */ }
    })
    .catch(function () { /* keep the cached or default background */ });
})();
