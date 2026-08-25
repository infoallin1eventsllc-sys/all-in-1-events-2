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
  const token = await authToken();
  const opts = { ...(options || {}) };
  opts.headers = { ...(opts.headers || {}) };
  if (token) opts.headers.Authorization = "Bearer " + token;
  return fetch(url, opts);
}

/* Renders the signed-out / unavailable states into a container and returns
 * whether a signed-in user is present. */
async function requireOwner(mountId, onSignedIn) {
  const mount = document.getElementById(mountId);
  const identity = await loadIdentity();

  if (!identity) {
    mount.innerHTML = gateCard(
      "IDENTITY UNAVAILABLE",
      "The Netlify Identity script could not load. On a local static server this is expected — " +
      "sign-in only works on the deployed site. If you are seeing this on the live site, check " +
      "that Identity is enabled in the Netlify dashboard.",
      null
    );
    return false;
  }

  const render = async () => {
    const user = currentUser();
    if (user) {
      mount.innerHTML = "";
      mount.classList.add("hidden");
      await onSignedIn(user);
    } else {
      mount.classList.remove("hidden");
      mount.innerHTML = gateCard(
        "OWNER SIGN-IN REQUIRED",
        "This area holds order and customer information. Sign in with an account that has the " +
        "owner role. Order data is served only to a verified account — it is not in this page.",
        "SIGN IN"
      );
      const btn = document.getElementById("gate-signin");
      if (btn) btn.addEventListener("click", () => identity.open("login"));
    }
  };

  identity.on("login", () => { identity.close(); render(); });
  identity.on("logout", () => render());

  await render();
  return !!currentUser();
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
  if (btn && window.netlifyIdentity) {
    btn.addEventListener("click", () => window.netlifyIdentity.logout());
  }
}
