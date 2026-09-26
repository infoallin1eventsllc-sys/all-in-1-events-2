# Client Demos: Two Directions

Two looks for presenting Haven to a client. They pick a direction, then we build out a full room set in that style.

| | **Demo A: Futuristic** | **Demo B: Grounded** |
|---|---|---|
| Pitch | "Statement of innovation": the AI is visible and impressive | "Quiet luxury": the AI works invisibly and the home stays timeless |
| Palette | Charcoal and matte black with neon cyan, electric violet, white | Cream, walnut, soft gray with a soft blue-white glow |
| Concept images | Cinematic sci-fi render | Architectural-magazine photography |
| Haven app | Dark glass panels, glowing cyan, animated assistant orb | Warm neutrals, calm and quiet (the default) |

> **These images are concept art.** They show holograms, levitating furniture, drones and robot helpers that don't exist in Haven or in any home you can buy today. Label them "concept" in any deck so the client doesn't expect them in the house. What Haven actually delivers is listed in [ANALYSIS.md](ANALYSIS.md).

## Shareable demo links

Both apps run entirely in the browser with a simulated house: no server, no login.

- **Demo A, Futuristic:** https://claude.ai/artifact/NHSYrvBSADDcedguH3CBSm
- **Demo B, Grounded:** https://claude.ai/artifact/J46Rus2S3KzY9CpbpYKyCk

They're private until you share them from each page's Share menu. To rebuild them after changing the app, run `npm run build:demo` (it writes `dist/demo/`).

The demos use Haven's built-in command parser. The full Claude agent needs an API key on the home server, which must never go into a public page.

## Showing the app from the home server

Start Haven (`npm start`), then open either link on a phone or tablet:

- Demo A: `http://localhost:8787/?look=futuristic`
- Demo B: `http://localhost:8787/?look=grounded`

The **Grounded / Futuristic** switch at the top of the app changes the look at any time. Each device remembers its choice. The Simulator panel at the bottom makes the house react live during the pitch: make it night, trigger motion, cause a leak, say "open the garage" and tap Confirm.

## Concept images (first pass)

Generated on Higgsfield with the fast **Z Image** model at 2048×1152. The free Higgsfield plan doesn't allow the higher-quality models. For client-ready images, re-run these prompts on a paid plan or in Midjourney.

| Room | Demo A: Futuristic | Demo B: Grounded |
|---|---|---|
| Living room | [image](https://d8j0ntlcm91z4.cloudfront.net/user_3JCJestVZgBp8lJ2tJ8CJXNSkbz/hf_20260926_010344_7c34b6cb-1654-4007-bd86-94a3e5da4e95.png) | [image](https://d8j0ntlcm91z4.cloudfront.net/user_3JCJestVZgBp8lJ2tJ8CJXNSkbz/hf_20260926_010453_74d7417b-2961-4bca-b028-08915e72b4a4.png) |
| Kitchen | [image](https://d8j0ntlcm91z4.cloudfront.net/user_3JCJestVZgBp8lJ2tJ8CJXNSkbz/hf_20260926_010404_3767cbd0-0dd0-42bf-a4bd-eea4014e4181.png) | [image](https://d8j0ntlcm91z4.cloudfront.net/user_3JCJestVZgBp8lJ2tJ8CJXNSkbz/hf_20260926_010515_dc2180e8-8c72-4054-ae6e-95976b2ced59.png) |
| Primary bedroom | [image](https://d8j0ntlcm91z4.cloudfront.net/user_3JCJestVZgBp8lJ2tJ8CJXNSkbz/hf_20260926_010438_c452a358-6bff-416c-9787-acd45259d7c2.png) | [image](https://d8j0ntlcm91z4.cloudfront.net/user_3JCJestVZgBp8lJ2tJ8CJXNSkbz/hf_20260926_010534_9bb2f37a-a427-4fc5-b5af-67e9b47abae5.png) |

These links point to Higgsfield's storage. Download the images into the pitch deck in case the links expire.

## Prompts

### Demo A: Futuristic / Sci-Fi (full scene)

> A futuristic smart home interior, bold and immersive AI integration on full display. Wide-angle architectural visualization of an open-concept living space where large holographic panels float in mid-air, projecting vivid interactive interfaces — schedules, energy grids, security feeds — in glowing cyan and violet light. A sleek humanoid-adjacent AI orb/assistant hovers near the homeowner, its surface rippling with light as it 'speaks.' Walls are lined with thin illuminated circuitry patterns that pulse and shift color based on mood lighting and activity. Furniture appears to levitate slightly via magnetic risers, with embedded touch interfaces glowing on every surface. Floor-to-ceiling smart glass walls display transparent data overlays of the outside world (weather, traffic, air quality). A kitchen counter transforms into a full interactive touch-surface, ingredients being scanned by light beams for a recipe hologram. Autonomous drones and small robotic helpers move through the space performing tasks. Color palette: deep charcoal and matte black base architecture accented by neon cyan, electric violet, and white light. Style: cinematic sci-fi concept art, Unreal Engine render, dramatic volumetric lighting, high contrast, 8k detail, inspired by high-end futurist residential concept videos.

### Demo B: Grounded / Near-Future (full scene)

> A modern smart home interior at golden hour, showcasing seamless AI integration throughout the living space. Wide-angle architectural photography style showing an open-concept living room where holographic light displays float subtly above a sleek countertop, projecting real-time information (weather, schedule, energy usage) as soft blue-white glowing text and icons. Recessed ambient lighting strips embedded in ceiling coves and along walls pulse gently in warm amber, responding to a person's presence as they walk through the space. A minimalist wall-mounted display shows a friendly AI assistant interface with a soft glowing orb visualization, positioned near the entryway to greet residents. Smart glass windows subtly tint and adjust transparency. Furniture with integrated touch-sensitive surfaces and embedded sensors, camouflaged into clean Scandinavian-modern design — no visible wires or bulky tech, everything flush and built-in. Warm natural materials — wood, stone, linen — contrasted against subtle technological glow, conveying that technology serves comfort rather than dominating it. Color palette: warm neutrals (cream, walnut, soft gray) accented with cool blue-white ambient tech glow. Photorealistic, architectural digest style, soft natural lighting mixed with subtle blue-toned tech lighting, 8k detail, shallow depth of field, cinematic composition.

### Room versions

The room images above used shorter versions of these prompts, each opening with the room ("…focused on the kitchen", "…primary bedroom at night") and keeping the same palette and style keywords so each set reads as a matched trio. To make more rooms, keep the last two sentences (palette and style) identical and change only the room description.

**Tips**
- For a render look on Demo B, swap "Photorealistic, architectural digest style" for "3D render, Unreal Engine style".
- Generate 3–4 variations per room and pick the best one. Keep the style words identical across rooms so the set feels cohesive.
