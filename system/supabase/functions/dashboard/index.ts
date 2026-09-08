// Retired on 8 Sep 2026. This endpoint used to serve the whole CRM.
//
// It gated every contact, deal, message and report behind a 12-character
// passcode passed in the URL query string: `?key=...`. A secret in a URL is a
// secret in browser history, in server logs, and in the Referer header of every
// outbound link. There was no rate limiting and the comparison was not
// constant-time. It was, by a distance, the largest exposure of client personal
// data in this system, and it was reachable by anyone on the internet who knew
// or guessed the address.
//
// It is not gated more tightly, it is gone. The owner portal replaced everything
// it did - the Marketing and System Health tabs show the same numbers behind a
// real login - so hardening it would have preserved a second door to the same
// room for no gain. This function now holds no database client and no
// credentials: there is nothing here to leak.
//
// The previous implementation is in this file's git history if any of its
// layout is ever wanted again. `settings.dashboard.passcode` was deleted at the
// same time, so even a redeploy of that old code fails closed rather than
// serving data with a passcode someone might still have.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PORTAL = "https://meridian-interface-website.vercel.app";

Deno.serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      error: "gone",
      message:
        "The passcode dashboard has been retired. Its numbers live in the owner portal, behind a real login: open the site and go to Portal, then the Marketing or System Health tab.",
      portal: PORTAL,
      retired: "2026-09-08",
    }),
    {
      status: 410,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  )
);
