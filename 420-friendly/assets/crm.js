/* 420 FRIENDLY — lead capture.
 *
 * Sends a form submission to `/.netlify/functions/lead`, which forwards it into
 * the Meridian marketing system: the contact lands in the CRM, an activity is
 * logged, and a follow-up is queued for the agent to draft.
 *
 * The local copy is a fallback, not the point. If the CRM is unreachable — the
 * function is not deployed yet, the visitor is offline — the address is still
 * kept in this browser so the signup is not simply lost, and the UI says which
 * of the two happened rather than claiming success either way.
 */

const LEAD_ENDPOINT = "/.netlify/functions/lead";
const LOCAL_LEADS_KEY = "420_pending_leads";

function rememberLocally(lead) {
  try {
    const list = JSON.parse(localStorage.getItem(LOCAL_LEADS_KEY) || "[]");
    if (!list.some((l) => l.email === lead.email)) {
      list.push({ ...lead, at: new Date().toISOString() });
      localStorage.setItem(LOCAL_LEADS_KEY, JSON.stringify(list));
    }
  } catch {
    // Private windows block storage; nothing more to do here.
  }
}

/* Resolves { delivered, message }. `delivered` is true only when the CRM
 * actually accepted the lead — never optimistically. */
async function submitLead(lead) {
  rememberLocally(lead);

  let res;
  try {
    res = await fetch(LEAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead)
    });
  } catch {
    return {
      delivered: false,
      message: "SAVED HERE — COULD NOT REACH THE CRM, WE'LL STILL HAVE YOUR EMAIL"
    };
  }

  if (res.status === 404) {
    return {
      delivered: false,
      message: "SAVED HERE — LEAD SERVICE NOT DEPLOYED YET"
    };
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    return { delivered: false, message: "SAVED HERE — THE CRM SENT AN UNREADABLE REPLY" };
  }

  if (!res.ok || data.ok === false) {
    // A validation complaint is worth showing verbatim; anything else is noise.
    const msg = res.status === 400 && data.error
      ? String(data.error).toUpperCase()
      : "SAVED HERE — THE CRM DID NOT ACCEPT IT YET";
    return { delivered: false, message: msg };
  }

  return { delivered: true, message: "YOU'RE ON THE LIST — WATCH YOUR INBOX" };
}
