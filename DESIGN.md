---
name: Druto Dashboard
description: Approved dark-glass dashboard and payment-detail system
colors:
  charcoal: "#0d1318"
  ink: "#f1f6f5"
  muted: "#a9b9bd"
  quiet: "#8fa5ac"
  line: "rgba(191, 224, 225, .13)"
  glass: "rgba(24, 36, 43, .65)"
  mint: "#b9f3d9"
  lavender: "#c8c5f4"
  amber: "#efcc9d"
  primary-ink: "#14372e"
typography:
  headline:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-.035em"
  metric:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-.04em"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-.02em"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.55
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "13px"
rounded:
  status: "5px"
  search: "7px"
  control: "9px"
  metric: "15px"
  panel: "16px"
  dialog: "18px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  desktop-gutter: "36px"
components:
  button-primary:
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
    height: "42px"
  search:
    textColor: "{colors.ink}"
    rounded: "{rounded.search}"
    padding: "8px 10px"
  glass-panel:
    backgroundColor: "{colors.glass}"
    rounded: "{rounded.panel}"
  verified-status:
    textColor: "{colors.mint}"
    rounded: "{rounded.status}"
    padding: "3px 7px"
---

# Design System: Druto Dashboard

## Overview

**Creative North Star: "Approved dark-glass workspace"**

The approved dark-glass dashboard puts payment records, receiving destinations and merchant configuration in a compact workspace. Charcoal, translucent slate and mint carry the hierarchy; a restrained lavender material distinguishes receiving-wallet context. Manrope and tabular figures keep operational information readable.

Scope: signed-in dashboard surfaces and the payment-detail dialog. Landing, checkout and receipt styling are outside this document. This is a scan of the approved implementation, not a new identity exercise. PRODUCT.md was absent; no business model is inferred. Backend, authentication, D1 and Arc Testnet behavior are outside this visual change. Development screenshots show explicitly labeled, read-only sample data; the DEV-only provider is excluded from production. This document makes no mainnet or compliance claim.

**Key Characteristics:**
- Charcoal workspace with translucent slate panels.
- Mint actions and verification states; lavender wallet material.
- Payment records lead, with responsive navigation and horizontal table access.

## Colors

### Primary

Mint emphasizes primary actions, selected navigation, links and verified states. Primary ink keeps filled mint controls readable.

### Secondary

Lavender contributes a subtle receiving-wallet surface tint, not another primary action color. Amber marks pending, ready and review states.

### Neutral

Charcoal is the canvas; ink carries primary text. Muted carries descriptions and controls; quiet carries secondary metadata. Glass and line form translucent surfaces and fine separators. These primitives remain scoped to the dashboard and its payment-detail portal.

**The Evidence Rule.** Status color accompanies a visible status word; verified payment status requires recorded transfer evidence, while wallet ownership is a separate concept.

## Typography

Manrope with system-ui and sans-serif fallbacks is used throughout this scope. Use the frontmatter roles as the normative desktop scale. Table text is (13px); statuses and supporting record metadata are (12px). Amounts use tabular numerals. The Overview heading becomes (27px) at the mobile breakpoint; metric values become (29px) below 1250px and (27px) below 600px. Payment-detail headings use (600, 21px/1.3) and amounts use (36px/1.2). There is no separate display face or decorative mono identity.

## Layout

Desktop navigation occupies (232px), collapsing to (76px); the content container is capped at (1560px) with desktop side gutters from the spacing tokens. The topbar is (86px). Three summary cards use a (1.22fr 1fr 1fr) grid with (16px) gaps. The payment workspace pairs a flexible table with a (282px) side column and (22px) gap.

At max-width (1250px), the side cards move below the table into two columns and content gutters become (26px). At (900px), navigation becomes a fixed (240px) drawer; its open state traps focus, closes on Escape and restores focus. At (600px), gutters become (16px), actions wrap, the leading metric spans two columns and lower panels stack. Filters scroll horizontally without wrapping; the table keeps horizontal access and a scroll instruction. Wallet directory cards change from two columns to one below (1100px).

## Elevation & Depth

The approved reference intentionally uses glass, gradients and blur. Broad teal and lavender radial gradients sit behind translucent slate panels; panels use fine borders and (24px) backdrop blur, while the sidebar uses (26px). Receiving-wallet material uses a faint lavender-to-mint gradient. Ordinary cards remain shadowless; menus and the payment-detail dialog use ambient shadows. The dialog shadow is (`0 22px 85px #0007`). Opaque fallbacks use (`#19282e`) for glass panels and (`#101d22`) for navigation when backdrop-filter is unavailable.

**The Scoped Material Rule.** Preserve the approved glass and gradients inside this workspace; treat their scope as part of the system.

## Shapes

Use the frontmatter radii by role: small status chips, softly curved controls and broader panel/dialog corners. Fine (1px) translucent borders separate layers. Icons are line SVGs; avatar initials are content, not icon substitutes. Keep addresses and evidence identifiers wrappable in detail and wallet views.

## Components

- **Buttons:** primary controls use a mint diagonal gradient (`#d0f9e6` to `#9cdec9`), changing to (`#ddfff0` to `#b0ebd8`) on hover. Active controls move down (1px). Quiet controls use translucent surfaces and borders; text actions use mint. Common transitions are (.18s).
- **Search / selects:** compact dark fields with visible labels or accessible names. Search highlights its wrapper with a mint (2px) outline, offset (3px); other interactive controls use (2px) focus outlines offset (4px).
- **Navigation:** muted, medium-weight labels become mint on a faint gradient when active. Hover adds a subtle mint wash. Preserve the existing Druto mark and workspace/environment identity.
- **Cards:** glass panels hold tables and operational context. Metric cards use (21px 23px) desktop padding; mobile metrics use (16px). Panel headings use approximately (23px 24px 17px) padding.
- **Status chips:** small, text-bearing pills with a matching dot. Verified is mint; pending/ready/review is amber; expired is muted; failure uses a soft red. Preserve semantic words rather than relying on hue alone.
- **Receiving wallets:** lavender glass, seller selector, copyable address and explicit ownership state. Directory views show full wrapping addresses. Ownership is separate from identity/business verification; receiving wallets are not presented as payout balances.
- **Payment-detail dialog:** darker glass, title, seller/item description, prominent USDC amount, status and wrapping evidence rows. It is vertically scrollable within (`100dvh - 32px`); mobile width is (`100% - 32px`). Only valid recorded hashes link to the Arc Testnet explorer.
- **Data states:** retain loading, error/retry, empty and filtered-empty states. Show unavailable values as a dash rather than inventing data; webhook cards count configured endpoints rather than deliveries.

Content arrival lasts (.35s), using the shipped eased (5px) vertical reveal only when reduced motion is not requested. Reduced motion disables dashboard animations/transitions. This document does not certify every inherited component or global dialog behavior.

## Do's and Don'ts

### Do:
- Do preserve the approved glass and gradient material within dashboard scope.
- Do use visible status words with color, tabular amounts and explicit USDC units.
- Do retain keyboard focus, reduced-motion behavior and opaque glass fallbacks.

### Don't:
- Don't apply this dashboard system to landing or checkout without a separate brief.
- Don't turn sample figures, wallet ownership or endpoint counts into balance, identity, delivery or compliance claims.
- Don't add speculative charts or unavailable modules.

Source basis: `client/src/styles/dashboard-glass.css` (including its final cascade), `DashboardOverview.tsx`, `DashboardWallets.tsx`, and dashboard portions of `pages/Home.tsx`; approved direction contract dated 2026-11-13; desktop, tablet and mobile fold captures. Fold captures do not show every lower panel or dialog state. Legacy eyebrow styling in inherited dashboard code is not canonized as a reusable design rule; no runtime defects were repaired by this documentation pass.

## Fluid interaction refinement — 2026-11-13

This scoped refinement preserves the approved charcoal, mint and lavender identity.
The focal motion is a shared selection surface for navigation and payment filters:
260ms, cubic-bezier(.16,1,.3,1), transform-only FLIP, interruptible from its current
rendered position. Resize/font changes snap to the correct layout. Reduced motion
skips spatial animation. No idle loop, canvas or added animation dependency.

View continuity uses a 240ms/5px entrance. Payment details use a 480px desktop
right drawer (16px inset) and a mobile bottom sheet at <=600px. Open/close motion is
340ms/170ms. Keyboard focus stays in the dialog; mobile navigation restores and
contains focus and locks background scrolling. Copy feedback lasts 1800ms.

Material additions live only in dashboard-fluid.css: low-opacity teal/lavender
background washes, mint/white specular edges and slate interaction surfaces.
Their literal alpha colors are intentional local derivatives, not new status
semantics. Local radius steps are 7/8/10/11/14/16/18/22/24px for selectors,
controls, avatars, cards and responsive sheets; detail amounts use 40px desktop /
34px mobile and the utility footer uses 12px. The detector reports these scoped
additions as design-system advisories; its static scan is not an accessibility
or security certification.

Validation: 13 focused tests passed, TypeScript passed, D1 frontend build passed.
Desktop 1440, tablet 768 and mobile 390 widths had no horizontal overflow.
Rapid filter interruptions settled with zero indicator alignment error.
Reduced-motion captures had no selection/view animation. Payment-sheet focus
was contained and mobile/tablet navigation focus passed after the closing-dialog
focus-restore correction. Production fixtures are checked separately.
Build still reports a >500kB chunk warning. No deploy or Git push was performed.

## Dashboard appearance toggle — 2026-11-13
The existing dark glass appearance remains the default. An explicit light theme
uses white/slate surfaces, restrained sage/lavender tints, dark teal ink and
contrast-oriented status colors. The topbar sun/moon button names its next action.
Both desktop and mobile expose the same control. Appearance is stored under
druto.dashboard.theme; blocked storage does not prevent in-memory switching.

The dashboard-only data-druto-dashboard-theme root marker reaches Radix portals
and is restored/removed on unmount. It does not change the global app theme,
login, public checkout or landing design. Both payment details and profile dialogs
receive light tokens. Seller onboarding, receiving wallets, settings, controls,
status badges and the DEV preview banner have matching light surfaces.
No new dependency, backend change, payment action, deployment or Git push.

Validation: TypeScript passed; final D1 frontend production build passed with the
existing >500kB chunk warning. One batched inspection and one confirmation covered
1440px desktop, 700px tablet and 390px mobile. Both themes had zero page overflow,
toggle visibility passed, light preference survived reload, detail focus remained
contained and the dashboard marker was removed on preview exit. Static Impeccable
scan ran once; parsed contrast rules were not part of that static scan.
