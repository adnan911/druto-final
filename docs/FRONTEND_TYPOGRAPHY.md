# Frontend typography standard

Druto uses one shared typography system for the marketing site, dashboard, hosted checkout, seller onboarding, and developer documentation UI.

## Font roles

- **DM Sans** is the UI and body face. Use `font-sans` for navigation, controls, tables, forms, and explanatory copy.
- **EB Garamond** is reserved for display headings and selected brand moments. Use `font-serif` or `font-display`; do not use it for dense interface text.
- **IBM Plex Mono** is for wallet addresses, transaction hashes, identifiers, code, and technical metadata only.

These are the only externally loaded font families. System fallbacks remain configured in the CSS tokens.

## Type scale

- Body: 15px / 1.55 line-height.
- Label: 13px.
- Caption and compact data: 12px minimum, with a readable line-height.
- Display and headings: use responsive Tailwind scale utilities (`text-2xl` through `text-6xl`) and tight heading line-height; keep headings in the display face.

Do not introduce text smaller than 12px for user-facing content. Dense chart labels and technical metadata are still user-facing; prefer adjusting layout or shortening content over shrinking type. Font weights should normally use 400, 500, 600, or 700.

## Implementation guidance

Use the shared CSS tokens in `client/src/index.css`, and avoid per-component font-family overrides. Keep body/interface typography sans-serif in both light and dark themes. Use Tailwind text-size utilities or the shared `text-body`, `text-label`, and `text-caption` tokens instead of arbitrary values. If a design needs a new role, add it centrally and apply it consistently across responsive states.
