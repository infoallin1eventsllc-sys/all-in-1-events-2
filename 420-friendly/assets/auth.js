/* 420 FRIENDLY — owner authentication (Netlify Identity).
 *
 * WHAT THIS DOES AND DOES NOT DO
 *
 * This file controls what the owner pages *show*. It is not the security
 * boundary and must never be treated as one: any visitor can read this script,
 * disable it, or request the HTML directly.
 *
 * The real boundary is server-side. Order data comes from
 * `/.netlify/functions/owner-orders`, which Netlify only reaches with a valid
 * Identity token, and which checks the account's role before returning
 * anything. Without a token that function returns 401 and no data exists to
 * leak, whatever the browser is persuaded to render.
 *
 * So: this gate is for tidiness and for telling the owner what to do. The
 * protection is that the page has nothing in it until the server says yes.
 */

/* ===== Passcode sessions =====
 * The passcode is checked by `/.netlify/functions/owner-auth`, never here. On
 * success that function returns a signed, expiring token which is what the data
 * function actually accepts. The passcode itself is never kept in the browser.
 *
 * sessionStorage, not localStorage: the session should end with the tab rather
 * than persisting on a shared or borrowed machine.
 */

const OWNER_TOKEN_KEY = "420_owner_token";
const AUTH_ENDPOINT = "/.netlify/functions/owner-auth";

function storedToken() {
  try {
    return sessionStorage.getItem(OWNER_TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token) {
  try {
    if (token) sessionStorage.setItem(OWNER_TOKEN_KEY, token);
    else sessionStorage.removeItem(OWNER_TOKEN_KEY);
  } catch {
    // Private windows block storage — the session simply will not persist.
  }
}

// Resolves { ok, message }.
async function submitPasscode(passcode) {
  let res;
  try {
    res = await fetch(AUTH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode })
    });
  } catch {
    return { ok: false, message: "Could not reach the sign-in service." };
  }

  // Several statuses all mean "no function answered here", and each host
  // reports it differently — Netlify without the function deployed gives 404,
  // a plain static server rejects POST with 501 or 405, a proxy in front may
  // give 502. They share one cause and one fix, so they share one message.
  if (res.status === 404 || res.status === 405 || res.status === 501 || res.status === 502) {
    return {
      ok: false,
      message:
        "The sign-in function is not running (HTTP " + res.status + "). It needs Netlify — " +
        "a plain static server cannot run it. If this is the live site, the deploy did not " +
        "include the functions."
    };
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    // A non-JSON body means the function crashed or something in front of it
    // answered instead. Naming the status is the difference between a
    // five-minute check of the Netlify function log and an afternoon of guessing.
    return {
      ok: false,
      message:
        "The sign-in service replied with something unreadable (HTTP " + res.status + "). " +
        "Check the function log in Netlify → Deploys → Functions."
    };
  }

  if (res.ok && data.token) {
    storeToken(data.token);
    return { ok: true };
  }
  return { ok: false, message: data.message || "That passcode is not right." };
}

function signOutPasscode() {
  storeToken(null);
}

const IDENTITY_WIDGET_SRC = "https://identity.netlify.com/v1/netlify-identity-widget.js";

let identityReady = null;

function loadIdentity() {
  if (identityReady) return identityReady;
  identityReady = new Promise((resolve) => {
    if (window.netlifyIdentity) {
      resolve(window.netlifyIdentity);
      return;
    }
    const s = document.createElement("script");
    s.src = IDENTITY_WIDGET_SRC;
    s.async = true;
    s.onload = () => {
      if (!window.netlifyIdentity) {
        resolve(null);
        return;
      }
      window.netlifyIdentity.init();
      resolve(window.netlifyIdentity);
    };
    // Blocked, offline, or running somewhere Identity does not exist (a plain
    // static server, for instance). Resolve null so callers can say so plainly
    // instead of hanging on a promise that never settles.
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return identityReady;
}

function currentUser() {
  return window.netlifyIdentity ? window.netlifyIdentity.currentUser() : null;
}

/* Returns a fresh JWT, refreshing it when close to expiry. Passing the raw
 * stored token would start failing an hour into a session. */
async function authToken() {
  const user = currentUser();
  if (!user) return null;
  try {
    return await user.jwt();
  } catch {
    return null;
  }
}

async function authedFetch(url, options) {
  const opts = { ...(options || {}) };
  opts.headers = { ...(opts.headers || {}) };

  // Passcode session first — it is the configured path on this site. The
  // Identity token is sent on Authorization, so the passcode token uses its own
  // header and the two can never be confused for one another.
  const passToken = storedToken();
  if (passToken) opts.headers["X-Owner-Token"] = passToken;

  const token = await authToken();
  if (token) opts.headers.Authorization = "Bearer " + token;

  return fetch(url, opts);
}

/* Gate. Passcode first; if no passcode session exists it offers the form, and
 * falls back to Netlify Identity when that is what the site is set up with.
 *
 * This gate decides what is DISPLAYED. It is not the security boundary — the
 * page is served to anyone. The boundary is that the data function refuses to
 * answer without a token the server signed.
 */
async function requireOwner(mountId, onSignedIn) {
  const mount = document.getElementById(mountId);

  const enter = async () => {
    mount.innerHTML = "";
    mount.classList.add("hidden");
    await onSignedIn({ via: "passcode" });
  };

  if (storedToken()) {
    await enter();
    return true;
  }

  mount.classList.remove("hidden");
  mount.innerHTML = passcodeCard();

  const form = document.getElementById("gate-form");
  const input = document.getElementById("gate-passcode");
  const err = document.getElementById("gate-error");
  const btn = document.getElementById("gate-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = input.value;
    if (!value) return;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "CHECKING…";
    err.classList.add("hidden");

    const result = await submitPasscode(value);

    btn.disabled = false;
    btn.textContent = label;
    // Clear the field either way — a passcode should not linger on screen.
    input.value = "";

    if (result.ok) {
      await enter();
    } else {
      err.textContent = result.message;
      err.classList.remove("hidden");
      input.focus();
    }
  });

  setTimeout(() => input.focus(), 100);
  return false;
}

function passcodeCard() {
  return (
    '<div class="max-w-md mx-auto text-center border border-outline-variant/50 rounded-2xl bg-surface-container-low/70 px-6 py-12 mt-10">' +
    '<span class="material-symbols-outlined text-outline text-[42px]">lock</span>' +
    '<p class="font-label-caps text-label-caps text-on-surface mt-4">OWNER ACCESS</p>' +
    '<p class="font-body-md text-body-md text-on-surface-variant mt-3">' +
    "Enter the owner passcode. Order data is served only to a verified session — " +
    "it is not contained in this page." +
    "</p>" +
    '<form id="gate-form" class="mt-8 flex flex-col gap-3">' +
    '<label class="sr-only" for="gate-passcode">Owner passcode</label>' +
    '<input id="gate-passcode" type="password" autocomplete="current-password" ' +
    'placeholder="PASSCODE" class="rounded-full bg-surface border border-outline-variant ' +
    'focus:border-secondary focus:ring-0 text-on-surface placeholder:text-outline ' +
    'font-label-caps text-label-caps px-6 py-4 text-center"/>' +
    '<button id="gate-submit" type="submit" class="rounded-full bg-primary text-on-primary ' +
    'py-4 px-8 font-label-caps text-label-caps hover:bg-inverse-surface transition-all duration-300">' +
    "UNLOCK</button>" +
    "</form>" +
    '<p id="gate-error" role="alert" class="hidden font-label-caps text-label-caps text-error mt-4"></p>' +
    "</div>"
  );
}

function gateCard(title, body, buttonLabel) {
  return (
    '<div class="max-w-xl mx-auto text-center border border-outline-variant/50 rounded-2xl bg-surface-container-low/70 px-6 py-14 mt-10">' +
    '<span class="material-symbols-outlined text-outline text-[42px]">lock</span>' +
    '<p class="font-label-caps text-label-caps text-on-surface mt-4">' + title + "</p>" +
    '<p class="font-body-md text-body-md text-on-surface-variant mt-3">' + body + "</p>" +
    (buttonLabel
      ? '<button id="gate-signin" class="mt-8 rounded-full bg-primary text-on-primary py-4 px-8 font-label-caps text-label-caps hover:bg-inverse-surface transition-all duration-300">' +
        buttonLabel + "</button>"
      : "") +
    "</div>"
  );
}

/* A sign-out control for the page header once signed in. */
function signOutButtonHTML() {
  return (
    '<button id="sign-out" class="rounded-full border border-outline-variant text-on-surface py-3 px-6 ' +
    'font-label-caps text-label-caps hover:border-error hover:text-error transition-all duration-300 ' +
    'flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">logout</span>SIGN OUT</button>'
  );
}

function wireSignOut() {
  const btn = document.getElementById("sign-out");
  if (!btn) return;
  btn.addEventListener("click", () => {
    signOutPasscode();
    if (window.netlifyIdentity && window.netlifyIdentity.currentUser()) {
      window.netlifyIdentity.logout();
    }
    location.reload();
  });
}
