# Integrating a New Home with an AI Agent: Full Analysis

This is the groundwork behind Haven: what's already out there, what's actually new, which hardware and protocols to pick for a new build, where AI helps and where it's dangerous, and how the homeowner stays informed through the day.

---

## 1. Has this been done before?

Parts of it, yes. The whole of it, not really.

| What exists | What it does well | What it lacks |
|---|---|---|
| **Crestron, Control4, Savant** (pro-installed) | Whole-house control, very reliable, dealer-supported | $20k–$100k+, locked to a dealer, rule-based, no real reasoning or conversation |
| **Apple Home, Google Home, Alexa** | Cheap, voice, phone/watch apps | Siloed, shallow automations, no judgment, no running commentary on the house |
| **Home Assistant** (open source) | Talks to ~3,000 device integrations, runs locally | Needs a technical owner; automations are hand-written |
| **Josh.ai, Brilliant** | Better natural-language control | Command-and-control only; doesn't manage the house or report on it |

**What's genuinely new in Haven:** an agent that understands the *whole* house at once, handles routine control, explains itself in plain language, and **talks to the homeowner throughout the day**: morning, midday, evening, and a night lock-up check, plus instant alerts. All of that sits behind a safety layer the AI can't bypass. Doing this in a **new build** is the real advantage: the wiring, sensors and valves go in before the drywall, which is far cheaper and more reliable than retrofitting.

---

## 2. Architecture

```
 ┌──────────────────────────── Homeowner ────────────────────────────┐
 │ iPhone app · iPad · Apple Watch · CarPlay/Siri · push alerts      │
 └───────────────▲───────────────────────────────▲───────────────────┘
                 │ HTTPS over private VPN        │ push (ntfy / Pushover)
 ┌───────────────┴───────────────────────────────┴───────────────────┐
 │ HAVEN (runs on a small computer inside the house)                 │
 │                                                                   │
 │  AI agent (Claude)  ──►  SAFETY CONTROLLER  ◄──  Automations      │
 │  language, judgment,     limits, interlocks,     motion, leak,    │
 │  briefings               who may do what         away, freeze...  │
 │                                │                                  │
 │                         Device adapter                            │
 └────────────────────────────────┬──────────────────────────────────┘
                                  │
 ┌────────────────────────────────┴──────────────────────────────────┐
 │ Home Assistant hub: Matter/Thread · Z-Wave · Zigbee · Wi-Fi       │
 └───────────────────────────────────────────────────────────────────┘
   lights · fans · thermostat · water heater · water valve · garage
   locks · motion/presence · leak · door contacts · light/temp sensors
```

Three rules shape the design:

1. **The AI never touches hardware.** It asks the safety controller, which can refuse.
2. **Safety doesn't depend on the internet or the AI.** Leak shutoff, motion lights, away mode and freeze protection are plain local code. If the internet drops, the house keeps working and chat falls back to a built-in command parser.
3. **Hardware is the source of truth.** State comes back *from* the devices. The AI never assumes a command worked.

---

## 3. Protocols: what to standardize on

| Protocol | Use it for | Notes |
|---|---|---|
| **Matter over Thread** | Sensors, locks, new devices | The industry standard going forward. Works with Apple, Google, Amazon and Home Assistant. Low power, mesh network. |
| **Matter over Wi-Fi** | Plugged-in devices | Fine for powered devices. Keep them on a separate IoT network. |
| **Z-Wave (800 series / Long Range)** | Locks, water valves, garage relays, anything that has to work | Very reliable, separate radio band from Wi-Fi, long range. Mature device catalog. |
| **Zigbee** | Cheap sensors | Good and inexpensive. Its radio band overlaps Wi-Fi, so plan channels. |
| **Lutron Caséta / RadioRA** | Light switches, dimmers, fan controls | The most dependable lighting control available. Proprietary but open to Home Assistant. |
| **Hard-wired** | Leak detection at the water heater, main valve, garage | Wired where failure is expensive. |

**Recommendation:** Home Assistant as the hub (on a small dedicated box with Thread, Z-Wave and Zigbee radios), with Matter devices wherever they're available. Haven talks to Home Assistant, not to hundreds of brands directly. Home Assistant can also re-publish everything into **Apple Home** (its HomeKit Bridge), which gives native Siri, Apple Watch and CarPlay controls for free.

---

## 4. Each system in the house

### Lights
- Use **smart switches and dimmers, not smart bulbs.** Guests and kids still use the wall switch, and the switch keeps working if the hub is down.
- New build: **run a neutral wire to every switch box** and use deep boxes. This one decision prevents most smart-switch headaches.
- Exterior lights on a dusk sensor plus motion, with a **lux (light level) sensor** so lights don't come on in daylight.

### Motion and presence
- **PIR motion sensors** are cheap and fast. Good for hallways, garage and driveway lighting.
- **mmWave presence sensors** (e.g. Aqara FP2) detect someone sitting still, so the lights don't go off while you read. Use them in the living room, office and bathrooms.
- Haven's rule: lights come on only when it's dark, turn off after the room is empty for N minutes, and **never fight a person**. If someone changes a light by hand, Haven stops managing it.

### Ceiling fans
- Wired fans: Lutron Caséta fan speed control, or a Matter/Z-Wave fan controller.
- Fans with remote controls: a **Bond Bridge** learns the remote and exposes the fan to the hub.
- Worth pairing with the thermostat: running fans lets the AC setpoint go up 2–4°F at the same comfort.

### Heating and air conditioning
- A smart thermostat the hub can control **locally**: ecobee (via HomeKit/Matter), Honeywell T6 Pro Z-Wave, or a Matter thermostat. Avoid anything that only works through a brand's cloud.
- High-end "communicating" HVAC systems are often proprietary. Ask the installer about third-party control *before* buying.
- **Never short-cycle the compressor.** The thermostat enforces minimum run times. Haven only sets modes and targets.
- Away setback and freeze protection run automatically. Hard limits: 55–85°F.

### Water heater
- A **heat-pump water heater** with Wi-Fi (e.g. Rheem ProTerra/EcoNet, A.O. Smith) cuts water-heating energy by more than half and exposes modes: heat pump, high demand, vacation.
- Newer units have a **CTA-2045** port for utility demand-response programs. Ask for it.
- Safety: **120°F is the default.** Haven refuses settings above 125°F (scald risk) or below 110°F (bacteria risk).
- Leak sensor and drain pan under the tank. On a leak there, Haven shuts off the main water *and* the heater.

### Main water shutoff and leak detection
- **The single highest-value device in the house.** Water damage is one of the most common and expensive homeowners insurance claims.
- Options: an all-in-one smart valve with flow monitoring (Moen Flo, Phyn Plus) or a motorized actuator on a standard ball valve (Z-Wave/Zigbee).
- Leak sensors: water heater, every sink cabinet, dishwasher, fridge line, washing machine, toilets, HVAC condensate pan.
- Haven shuts the water off **in under a second, without the AI or the internet**, and **won't turn it back on while any sensor is still wet**, even for the owner.
- Many insurers give a discount for automatic shutoff. Ask.

### Garage door
- **Important:** Chamberlain/LiftMaster (myQ) shut off third-party access to their cloud in late 2023. For local control use **ratgdo** or **Konnected blaQ** (both talk to the opener directly), or a Tailwind/Meross controller, or a Z-Wave garage relay with a tilt sensor.
- **UL 325 safety standard:** a door that closes without someone watching must flash a light and beep before it moves. Use a controller that does this if Haven will ever auto-close the door (it does when everyone has left).
- Haven's rules: **only the owner can open it** (from the app, Siri, the watch or the car). The AI has to wait for a tap to confirm. Automations can't open it unless the owner opts in to auto-open on arrival. Anyone can close it. It won't reverse within 10 seconds.

### Door locks
- A Matter or Z-Wave deadbolt. **Schlage Encode Plus** and **Aqara U100** support **Apple Home Key** (tap your iPhone or Apple Watch to unlock).
- Haven rule: **locking is always allowed; unlocking is owner-only.** The AI can ask; it can't do it alone.

### Door and window contacts
- On exterior doors and the garage entry door. Used for the "door open while the AC is running" nudge and the night lock-up check.

### Sensors to add later
Smoke/CO (a listener module on interconnected alarms), air quality (CO₂, VOC, PM2.5), humidity in bathrooms (auto exhaust fan), sump pump level, freezer temperature.

---

## 5. Where the AI belongs, and where it doesn't

| Job | Who does it | Why |
|---|---|---|
| Shut off water on a leak | **Automation** | Must happen in under a second, even offline |
| Motion lights, away mode, freeze protection | **Automation** | Predictable, instant, testable |
| Hard limits (temperatures, water interlock, garage anti-bounce) | **Safety controller** | Nobody overrides these, including the AI |
| Understand "it's stuffy in here" | **AI** | Language and judgment |
| Decide what's worth telling the homeowner, and how | **AI** | Summaries, tone, priorities |
| Morning / midday / evening / night briefings | **AI**, with a template fallback | Turns 200 events into 3 sentences |
| Open the garage, unlock a door, restore water | **Owner only** | The AI can ask; a human taps Confirm |

**Risk tiers, enforced in `src/safety.js`:**

- **Low** (lights, fans): anyone, including the AI on its own.
- **Medium** (thermostat, water heater, closing/locking): owner, AI on request, automations.
- **High** (open garage, unlock, restore water): owner directly; the AI only after the owner confirms; automations never, unless the owner opts in.
- **Protective** actions (close, lock, shut off water) are always allowed, from anyone.

**The AI has no way to approve its own request.** The tool it uses has no "confirmed" field. Confirmation codes are single-use and expire in 2 minutes.

### Risks specific to an AI in the house
- **Prompt injection:** text from outside (a device name, a message) could try to instruct the AI. Mitigation: the AI's authority is capped by the safety controller no matter what it's told.
- **Hallucinated success:** the prompt requires the AI to report only what tool results say, and the app shows real device state.
- **Latency:** a round-trip to an AI service takes about 1–3 seconds. That's fine for conversation, but it's why lights on motion are never routed through the AI.
- **Cost:** a rough estimate for a typical household (4 briefings plus ~20 chat requests a day) is **about $15–40 a month** in AI usage on the default model, with prompt caching. A cheaper model can be set in `.env`.

---

## 6. Talking to the homeowner through the day

| When | What they get | Where |
|---|---|---|
| 7:00 AM | Morning: overnight events, indoor temperature, anything open | Phone, watch |
| 12:30 PM | Midday: only what changed and matters | Phone, watch |
| 6:00 PM | Evening: arrivals, energy, anything pending | Phone, watch |
| 10:00 PM | Night lock-up check: garage, locks, lights. "Say goodnight and I'll lock up" | Phone, watch |
| Anytime | **Urgent:** leak, freeze risk, device failure. Breaks through quiet hours | Phone, watch (high priority) |
| Anytime | **Normal:** garage left open, door open while AC runs, house secured | Phone, watch (held during quiet hours) |
| Anytime | Everything else | App activity feed only |

Written for a watch face: a title under 40 characters, 2–4 sentences, the most important thing first, at most one suggested action. Non-urgent alerts during quiet hours (10:30 PM–6:30 AM by default) are held and folded into the morning briefing.

---

## 7. Apple Watch, iPhone, iPad and the car

- **iPhone / iPad:** the Haven app is an installable web app (Share → Add to Home Screen). It works on Android and desktop too.
- **Apple Watch:** push alerts from iPhone mirror to the watch automatically. Siri Shortcuts run on the watch ("Hey Siri, ask Haven…").
- **Car:** a "Garage" Shortcut appears in CarPlay and works by voice. Arrival geofences turn on the driveway lights. If the house is bridged into Apple Home, the garage door also shows up as a native CarPlay button when you pull in.
- **Tap-to-unlock:** Apple Home Key locks unlock with iPhone or Apple Watch at the door.
- Step-by-step setup: [APPLE-SETUP.md](APPLE-SETUP.md).

Next step after the web app: a native iOS/watchOS app for richer watch complications, actionable notifications (Confirm right on the watch), and Live Activities.

---

## 8. Security and privacy

- **Local first.** Haven and the hub run inside the house. Device control never depends on a cloud account.
- **No open ports on the router.** For remote access use a private VPN such as **Tailscale** or WireGuard. The phone joins the home network privately from anywhere.
- **Separate network for smart devices** (an IoT VLAN or guest network) so a cheap sensor can't reach laptops.
- **Owner token** on every API call, compared in constant time, with lockout after repeated failures.
- **Audit log** of every action: who or what did it, why, and what was refused (`data/events.jsonl`).
- What goes to the AI service: device states and recent events, only when chatting or briefing. No cameras, no audio.

## 9. Reliability

- **UPS battery** on the hub, Haven, router and modem (~$150). Most "smart home failures" are power blips.
- **Physical controls always work**: switches, lock keypads, the garage wall button, the manual valve handle.
- A motorized water valve **holds its position** on power loss. Know where the manual handle is.
- Haven saves device state to disk and resumes after a restart.
- Battery-powered sensors: replace batteries yearly; add a low-battery check to the briefings (roadmap).

## 10. Codes, trades and permits

- A **licensed electrician** for switches, the water heater circuit, and the garage opener circuit.
- A **licensed plumber** for the shutoff valve (on the main line after the meter, with a bypass) and the water heater.
- HVAC contractor for the thermostat wiring (C-wire at every thermostat location).
- **UL 325** compliance for any remote or automatic garage close.
- Keep all equipment listed by UL or ETL.

## 11. New-build prewire checklist

- [ ] Neutral wire and deep box at every switch location
- [ ] C-wire (common) at every thermostat, plus a spare conductor
- [ ] Cat6 to a central closet from every room, the garage, the ceiling where Wi-Fi access points go, and exterior camera spots
- [ ] Dedicated circuit and outlet at the equipment closet; space for a UPS
- [ ] Wi-Fi access points in the ceiling (one per ~1,500 sq ft, plus the garage)
- [ ] Motorized shutoff valve location on the main line with a bypass and a nearby outlet
- [ ] Drain pan and leak sensor under the water heater and washer; outlet near the water heater for a heat-pump model
- [ ] Outlet and low-voltage run at the garage door opener for the controller
- [ ] Low-voltage runs to exterior doors for contacts and doorbell
- [ ] Junction boxes for driveway and porch motion sensors
- [ ] Conduit to the attic and to exterior walls for future changes

## 12. Rough hardware budget (4-bedroom new build)

| Item | Approx. cost |
|---|---|
| Hub box with Thread/Z-Wave/Zigbee radios (e.g. Home Assistant Green + radios) | $200–350 |
| Smart switches and dimmers, 25 at ~$60 | $1,500 |
| Fan controls, 4 | $250 |
| Thermostat(s) | $150–500 |
| Smart shutoff valve with flow monitoring | $500–700 |
| Leak sensors, 10 | $200–350 |
| Motion/presence sensors, 8 | $250–600 |
| Garage controller (ratgdo/Konnected) | $50–100 |
| Smart deadbolts, 2 | $500–600 |
| Door contacts, 6 | $150 |
| UPS | $150 |
| Heat-pump water heater (premium over standard) | $1,000–2,000 |
| **Total (excluding water heater premium)** | **~$4,000–5,500** |

Versus $20,000–100,000+ for a pro-installed Crestron/Control4/Savant system.

## 13. Roadmap

> The enterprise version of this roadmap (security, privacy, AI governance, fleet management, certifications) is in [ENTERPRISE-PLAN.md](ENTERPRISE-PLAN.md).


1. **Now (this repo):** safety controller, automations, AI agent, briefings, web app, Shortcuts, simulator, Home Assistant bridge, tests.
2. **Next:** connect a real Home Assistant hub; set up Tailscale, ntfy/Pushover and the Shortcuts; live in it for two weeks and tune the thresholds.
3. **Then:** native iOS/watchOS app with Confirm buttons on the watch; low-battery and offline-device checks in briefings; energy reporting from a whole-home energy monitor; weather forecast in briefings.
4. **Later:** learn routines (the house notices you always want 68°F at 9:30 PM and suggests it), smoke/CO integration, multi-home support for builders who want to offer this in every home they sell.
