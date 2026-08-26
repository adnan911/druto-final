# Druto Frontend Design Direction

## Three initial approaches

### Theme Name: Ledger Light
Very Brief Intro: A bright, editorial operations interface where financial state is expressed through precise typography, paper-like surfaces, and restrained ink-and-cobalt accents. It should feel dependable, transparent, and calm under pressure.
Probability: 0.07

### Theme Name: Arc Signal
Very Brief Intro: A dark, high-contrast command center with electric cyan signal lines and luminous transaction states. It makes the blockchain rail feel tangible and fast, but keeps the operational surfaces disciplined rather than game-like.
Probability: 0.03

### Theme Name: Merchant Atelier
Very Brief Intro: A warm, tactile finance workspace inspired by premium accounting tools and studio dashboards, pairing mineral neutrals with a vivid mint signature. It makes complex money movement feel human and approachable.
Probability: 0.08

## Chosen approach: Ledger Light

### Design Movement
Contemporary editorial Swiss design fused with high-trust financial operations software. The interface uses a strong information hierarchy, visible system state, and carefully composed asymmetry instead of ornamental dashboard chrome.

### Core Principles
1. **Trust through legibility.** Amounts, statuses, IDs, and next actions are always easy to distinguish.
2. **Operational calm.** Surfaces remain light and spacious while dense data is grouped into purposeful blocks.
3. **State is visible.** Pending, available, reserved, final, review, and failed states use language, icons, and color together.
4. **Precision with warmth.** The product should feel rigorous without looking sterile or institutional.

### Color Philosophy
The base is a warm near-white with graphite text, soft mineral panels, and a deep cobalt used sparingly for primary actions and active navigation. A signature sea-glass green marks finality and available funds; amber signals review or pending state; coral is reserved for failure and destructive actions. The palette should communicate that money is being handled carefully, not dramatically.

### Layout Paradigm
Use a persistent left navigation rail with a wide, asymmetric workspace. The overview page leads with a narrow contextual header, a dominant balance statement, and a split between trend signal and operational queue. Detail pages use a two-column record layout: the financial truth on the left and context, actions, and audit evidence on the right. The hosted checkout is intentionally separate: mobile-first, centered, quiet, and comfortable.

### Signature Elements
1. A small arc-shaped status mark appears beside Druto’s wordmark and in key settlement/finality moments.
2. Transaction identifiers use a distinctive monospace treatment with truncated display and copy affordances.
3. Thin ruled dividers and compact status pills create a ledger-like rhythm without heavy borders.

### Interaction Philosophy
Interactions should confirm state rather than entertain. Buttons respond with a short tactile press, filters update visibly, and every mocked mutation produces a clear toast plus a changed state. High-risk actions use confirmation dialogs and explain what will happen. Deferred integrations are labeled as test environment behavior rather than pretending to execute real money movement.

### Animation
Use restrained 160–220ms ease-out transitions for navigation, tabs, dropdowns, and status changes. Dashboard cards reveal with a light stagger on first load, but dense tables stay still for scanability. Checkout payment states use a single subtle arc pulse when moving from submitted to final. All non-essential motion is disabled under reduced-motion preferences.

### Typography System
Use DM Sans for interface copy and headings, with a slightly heavier display weight for key monetary statements. Use IBM Plex Mono for transaction hashes, API keys, IDs, and atomic amounts where precision matters. Hierarchy: compact uppercase eyebrow, 30–42px page title, 20–24px section title, 14–16px body, 12–13px metadata.

### Brand Essence
Druto is the stablecoin payment operating system for internet businesses that need onchain settlement without operational ambiguity. Personality: **exact, composed, forward-looking**.

### Brand Voice
Headlines are direct and confident; CTAs describe the action rather than making vague promises; microcopy explains system state in plain language. Avoid crypto hype and generic conversion filler.

Example lines:
- “Stablecoin payments, built for business.”
- “Final on Arc. Recorded in Druto.”

### Wordmark & Logo
The mark is a bold, text-free arc formed from two offset crescent strokes that nearly meet at the right edge, suggesting a payment moving from request to final settlement. The wordmark uses a custom-tightened lowercase “druto” treatment with a distinctive cut in the first “d” and a slightly extended terminal on the “o”.

### Signature Brand Color
**Druto Sea Glass — #1E9B83.** It is ownable, calm, and materially different from generic fintech blue while still reading as trustworthy when paired with graphite and warm white.

### File-level style reminder
Every CSS/component/page file should preserve the Ledger Light system: editorial Swiss structure, warm white surfaces, graphite text, cobalt action color, Druto Sea Glass for finality, IBM Plex Mono for identifiers, visible operational state, and restrained motion. When uncertain, ask: “Does this choice reinforce or dilute Ledger Light?”

## Scope boundary
This frontend uses mock data and local state only. API endpoints, database persistence, smart contracts, Arc blockchain/RPC/indexer connectivity, Circle Wallets, risk providers, and real payout execution remain deferred integration boundaries. The UI must label test behavior clearly and must never imply production readiness.

## Style Decisions

- The overview opener is operational rather than promotional: the dominant statement is available balance and settlement state; brand positioning becomes supporting copy.
- Dashboard surfaces use stronger ruled structure, denser metadata, and fewer generic rounded-card cues.
- The Druto arc is the recurring motif for finality, settlement progress, and payment movement across the overview and checkout.
