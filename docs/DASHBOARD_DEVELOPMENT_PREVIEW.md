# Dashboard development preview

This is a local UI preview, not a login/session bypass.

- Open /dashboard on the Vite development server and choose **Skip sign-in · preview dashboard**.
- Direct shortcut: /dashboard?preview=dashboard.
- The preview renders the existing dashboard with its own QueryClient and in-memory tRPC link.
- No HTTP fallback, account credentials, real seller records, wallet connection control, payment creation, profile changes or other mutations.
- All queries outside the fixture allowlist fail closed. All mutations and subscriptions fail closed.
- **Exit preview** destroys the preview cache and returns to normal wallet sign-in.
- Sample transactions are explicitly marked as having no onchain transaction.
- import.meta.env.DEV gates both the button and lazy import. Production builds exclude the preview module and data automatically; there is no deployable skip-auth flag.

Start from the Cloudflare checkout:

    pnpm exec vite --mode d1 --host 127.0.0.1 --port 5186 --strictPort

This starts only the frontend on loopback. Normal wallet sign-in requires a separately configured backend; this preview does not.

Validation performed: focused transport isolation tests, TypeScript check, D1 Vite production build to a separate verification directory, scan of production assets for preview code/data, and browser skip/navigation/exit.

Audit continuity: this feature was added after the 2026-11-12 paused source-audit checkpoint. Existing audit snapshots/reports are preserved and refer to their earlier source; a resumed audit must compare these new frontend changes.