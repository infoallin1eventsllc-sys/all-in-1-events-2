# Live Cards app: clients make their own backgrounds (idea, 24 Nov 2026)

Otis's idea: after trying the demo, a client downloads an app, picks photos or videos from their own phone library, and builds their own live card.

## Proof it works
`preview.html` has a "Make your own (prototype)" box: choose a photo or video from the device, type a name and title, pick "Fill the card" or "Bottom of the card". It runs entirely in the browser with an object URL; nothing is uploaded or saved. A photo set to fill also gets the finger-parallax effect.

## Two ways to ship it
1. **Web app first (recommended).** A page on meridianinterface.com that a client adds to their home screen; it opens full screen with its own icon, like an app. Works on iPhone and Android, no store review, no store fees, updates instantly. Reads the photo library through the phone's normal picker.
2. **App Store and Google Play later.** The same web app wrapped as a store app. Needs an Apple developer account and a Google Play developer account (both are paid, by Otis, to Apple and Google), store listings, screenshots, a privacy policy and review time.

## What the real product needs (the prototype has none of this)
- Client sign-in, so a card belongs to someone.
- Saving: uploads stored in Supabase Storage, with size limits and automatic shrinking of video.
- Each client's own card address and QR code.
- Editing all the card's details: buttons, links, logo, colors.
- Payment or a plan check (Otis sets prices).
- Rules: clients confirm they own what they upload; a way to take a card down.
- Privacy policy and terms.

## Suggested order
Prototype (done) -> web app with sign-in and saving for a few test clients -> payments -> store apps if clients ask for them.
