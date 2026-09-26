# Haven: Enterprise Readiness Plan

What it takes for Haven to be bought, deployed and trusted by large companies, what's already done, and the order to do the rest. Timelines are estimates for a small focused team and assume the product decisions in this repo stand.

## Who buys it, and why

| Buyer | What they buy | What they need to see |
|---|---|---|
| **National home builders** | Haven pre-installed in every new home, as a selling feature and a warranty-cost reducer | Fast, repeatable install per floor plan; a fleet console; clean handoff at closing; low support load; brand safety |
| **Homeowners insurers** | Leak detection and automatic water shutoff, subsidized for policyholders | Proven prevention of water-damage events, audit-grade event logs, clear data terms |
| **Utilities** | Enrolled thermostats and water heaters for demand response and peak shaving | Standards-based control (e.g. OpenADR, CTA-2045), measured kWh, customer consent records |
| **Build-to-rent and property managers** | One system across thousands of homes, reset between residents | Multi-home management, role-based access, move-in/move-out workflows |

## Where Haven stands today

**Built and verified in this repo:**
- **Safety architecture:** one path to hardware, with hard limits, a leak interlock, and permissions by origin. The AI can't open, unlock or restore water without the owner's tap. Covered by automated tests.
- **Offline-first operation:** automations keep running with no internet, and chat falls back to a local command parser.
- **Agent stack:** a conversation agent, a nightly reflection agent with schema-validated output, and a deterministic learner. Nothing learned acts without the owner's consent.
- **Voice:** push-to-talk speech in and spoken replies out. On iPhone, Apple Watch and in the car, Siri Shortcuts do the same.
- **Home Assistant bridge:** the path to real Matter, Z-Wave and Zigbee devices. Tested against a stand-in hub.
- **Energy:** live power and today's use. It's clearly labeled as estimated until a real meter is connected, which then takes over.
- **Accessibility:** automated WCAG 2.2 AA audits (axe-core) run in the browser test suite. Currently 0 violations across the sign-in screen, whole home, a room, a leak alert, the Updates and About you tabs, phone width, and both visual styles.
- **Quality gate:** `npm run check` runs 100+ unit/API/integration tests and a browser run of every control, on the home server and the demo build.

**Not enterprise-ready yet:**
- A single owner token instead of user accounts and roles
- No cloud service, so no fleet console and no remote support
- No third-party security audit, penetration test or certifications
- No real-hardware pilot yet
- The live Claude integration is tested only against a mocked API

## Readiness by area

| Area | Today | Required for enterprise | Plan |
|---|---|---|---|
| **Identity & access** | One owner token | Per-person accounts; household roles (owner, member, guest, installer, property manager); time-boxed installer access; SSO (SAML/OIDC) for business consoles | Phase 1 roles on the home server; Phase 2 cloud identity with SSO |
| **Security program** | Local-first design, token auth with lockout, strict CSP, safety interlocks | SOC 2 Type II (Security, Availability, Confidentiality); annual third-party penetration test; threat model; SBOM and dependency scanning; signed updates; vulnerability disclosure program | Phase 1 threat model, SBOM (CycloneDX), dependency scanning in CI; Phase 2 pen test and SOC 2 Type I; Phase 3 Type II report after the observation period |
| **IoT security baselines** | n/a | Alignment with NISTIR 8259A and ETSI EN 303 645; eligibility for the U.S. Cyber Trust Mark; UL 2900-1 for any Haven-branded hub | Gap assessment in Phase 2; certification with the hub in Phase 3 |
| **Privacy** | Data stays in the house; profile visible and deletable; conversation log capped | Written data inventory and retention schedule; export and delete on request (CCPA/CPRA and other state laws; GDPR if sold in the EU); explicit consent for voice and learning; household-member and minor protections; data processing terms with every sub-processor, including the AI provider | Phase 1 retention defaults (events 90 days, conversations 30 days, profile until deleted) and in-app export; Phase 2 DPAs and a privacy notice reviewed by counsel |
| **AI governance** | AI can't take high-risk actions; tests prove it; offline fallback; model pinned in config | Alignment with the NIST AI Risk Management Framework; a written model-change process; red-team tests for prompt injection and unsafe requests; AI action audit trail; cost and rate controls; incident response for AI errors | Phase 1 red-team test suite in CI and AI actions tagged in the audit log; Phase 2 AI governance policy; consider ISO/IEC 42001 in Phase 3 |
| **Reliability** | Local control; state survives restarts; saves on shutdown | Published SLOs (local control and automations 99.9%/month, excluding power loss); monitoring; staged over-the-air updates with rollback; configuration backup; on-call and incident process; status page | Phase 1 health telemetry (opt-in) and config backup; Phase 2 OTA with staged rollout; Phase 3 status page and SLO reporting |
| **Fleet management** | One home per server | Multi-home console: provision from floor-plan templates, commissioning checklist, device inventory and health, service tickets, closing-day handoff (transfer ownership, wipe profile) | Phase 2 builder console (pilot scale); Phase 3 multi-tenant at production scale |
| **Hardware & certification** | Runs on Home Assistant with off-the-shelf devices | Approved device list per system; Matter certification for any Haven-branded hub; FCC Part 15 and UL/IEC 62368-1 for hub hardware; UL 325-compliant garage control; installer training | Phase 1 approved device list (see ANALYSIS.md); Phase 3 branded hub with certifications |
| **Accessibility** | Automated WCAG 2.2 AA audits with 0 violations; keyboard access; reduced-motion support | Manual screen-reader testing (VoiceOver, TalkBack); an Accessibility Conformance Report (VPAT) for procurement | Phase 2 manual audit and ACR |
| **Engineering quality** | 100+ tests; browser run of every control; accessibility audits | CI on every change; code review rules; release versioning and changelog; typed code for the server core; performance budgets | Phase 1 CI and release process; Phase 2 TypeScript for `src/core` and `src/safety.js` |
| **Localization** | English, °F | Spanish first; °C and metric; 12/24-hour time | Phase 2 |
| **Legal & commercial** | MIT license on the code | Master services agreement, SLA, data processing agreement; product liability review (Haven is not a listed life-safety or alarm system and must say so); E&O and cyber insurance; pricing (per-home license for builders, homeowner subscription, insurer-subsidized leak kit) | Phase 1 counsel review of positioning and disclaimers; Phase 2 contract templates |
| **Support** | Docs in the repo | Tiered support, remote diagnostics with homeowner consent, knowledge base, builder escalation path | Phase 2 with the fleet console |
| **Brand & design** | Two finished visual directions, a design system (DESIGN.md), accessible components | Brand guidelines, a white-label option for builders, a component library in a design tool | Phase 2 after the client picks a direction |

## Roadmap

**Phase 0: Prototype (done).** Everything in "Built and verified" above.

**Phase 1: Pilot-ready (about 0–3 months).** Goal: 10–25 homes in one builder community.
1. Live Claude integration tested with real keys; per-home API keys owned by the customer, never the developer's.
2. Real hardware: Home Assistant hub plus one approved device per system, commissioned from a floor-plan template.
3. Household accounts and roles on the home server; installer access that expires.
4. CI running `npm run check` on every change; SBOM, dependency scanning, threat model; red-team AI tests.
5. Retention defaults, data export, and a consent screen for voice and learning.
6. Pilot metrics dashboard (below).

**Phase 2: Enterprise-ready (about 3–9 months).** Goal: a signed builder or insurer contract.
1. Cloud service: builder console, remote diagnostics, staged OTA updates, config backup.
2. SSO for business users; audit-log export.
3. Third-party penetration test; SOC 2 Type I; privacy and AI governance policies; DPAs.
4. Accessibility Conformance Report; Spanish; °C.
5. Native iOS and watchOS app with Confirm on the watch, and push through Apple's notification service.

**Phase 3: Scale (about 9–18 months).** Goal: thousands of homes.
1. SOC 2 Type II report; Matter-certified Haven hub with FCC and UL/IEC certifications; Cyber Trust Mark.
2. Utility demand-response and insurer integrations.
3. Multi-tenant fleet management, status page, published SLOs.

## Pilot success metrics

| Metric | Target for a pilot |
|---|---|
| Water-damage events stopped by automatic shutoff | Every leak detected leads to shutoff within 2 seconds |
| Uptime of local control and automations | ≥ 99.9% of minutes, excluding power outages |
| Energy use versus comparable homes | Measured with meters; report the real number, no target promised |
| Homeowner satisfaction | NPS ≥ 50 at 90 days |
| Support load | ≤ 0.5 tickets per home per month after the first 30 days |
| AI safety | 0 high-risk actions without owner confirmation (enforced in code; verified from audit logs) |
| Learning | Share of suggestions accepted; share of learned items the homeowner deletes |

## Risks to manage

- **Liability.** Automations that control water, heat and doors need clear positioning: Haven is a convenience and loss-prevention system, not a monitored alarm or life-safety system. Counsel reviews the wording before any sale.
- **Vendor dependency.** Device clouds change their terms (Chamberlain's myQ closed third-party access in 2023). Prefer local protocols (Matter, Z-Wave) and keep the adapter layer thin.
- **AI provider terms and cost.** Use per-customer keys, cache prompts, cap usage, and keep the offline fallback. The house must never depend on the AI to be safe.
- **Privacy expectations.** Learning about a household is sensitive. Keep it visible, deletable, opt-in, and minimal. Never sell it.
