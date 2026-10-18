// The sign-off on every email a client receives from the system, so each one
// carries Otis's digital business card. Plain text, because sendEmail sends
// text/plain: the links are typed out in full so every mail client makes them
// tappable. The card page itself (meridianinterface.com/card/) has the one-tap
// call, text, email, booking and save-to-contacts buttons.

export const CARD_URL = "https://meridianinterface.com/card/";
export const VCARD_URL = "https://meridianinterface.com/card/otis-williams.vcf";

export function emailSignature(): string {
  return [
    "Otis Williams",
    "Web Designer & Developer, Meridian Interface",
    "281-882-9198 | otis@meridianinterface.com",
    "",
    `My digital business card: ${CARD_URL}`,
    `Save my contact to your phone: ${VCARD_URL}`,
  ].join("\n");
}

/** Append the signature unless the body already carries the card link. */
export function withSignature(body: string): string {
  const b = String(body ?? "").replace(/\s+$/, "");
  if (b.includes(CARD_URL)) return b;
  return `${b}\n\n${emailSignature()}`;
}
