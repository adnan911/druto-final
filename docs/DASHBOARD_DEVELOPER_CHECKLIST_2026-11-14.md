# Developer hub integration checklist — 14 November 2026

Status: local implementation; no push or hosted deployment in this task.
Dashboard route: /dashboard?section=developers.
DEV sample: /dashboard?preview=dashboard&section=developers.

Replaces the dashboard's static DeveloperIntegrationPage with an actionable
seller-specific integration console. The public /developers documentation
page is unchanged.

Observed evidence:
1. Selected seller is active and has receiving-wallet ownership proof.
2. An unrevoked key is linked to this merchant account.
3. The selected endpoint belongs to the account and is active.
4. A succeeded seller-bound intent has a transfer record to the current
   receiving wallet. A status string alone is insufficient.
5. The selected endpoint has acknowledged an event.

Each step is Observed, Action needed, Unknown or Prerequisite needed and links
to the existing seller, API key, Webhooks or Payments section.
Seller changes reset endpoint selection. Keys/payments/endpoints from another
seller cannot complete the selected seller's checklist.
Query errors/loading do not turn cached positive data into current completion.
Evidence can be manually refreshed and the oldest loaded timestamp is shown.

These are setup signals, not production-readiness or compliance certification.
A key's existence does not prove installation in a backend secret store.
HTTP acknowledgement does not prove raw-body signature verification, event
matching, durable receiver deduplication or fulfillment. The page explicitly
assigns those acceptance checks to the storefront developer.

Resources:
- SDK/starter archive version paths derive from their package.json metadata.
- ZIP and SHA-256 downloads; local-folder npm install command.
- Standalone Cloudflare starter with its own D1 and required fulfillment worker.
- Copyable server quickstart, full docs/setup and webhook-verification links.
- Existing dark/light system and responsive operation-first layout.

Validation:
- 13 tests passed: 7 evidence-boundary tests, 3 DEV transport tests and 3
  existing payment-view tests.
- TypeScript and Vite D1 frontend build passed. Existing >500kB chunk warning remains.
- One browser batch: desktop dark/light at 1440x1000 and mobile light 390x844.
  No overflow; one main heading; matching seller shows 5 signals; seller with
  revoked key/no endpoint shows action/blocked; pending seller blocks dependent
  steps; action links and browser Back work.
- One static design scan; not a full parsed accessibility/security audit.
- No real keys, transactions, endpoint changes or webhook retries.
- No backend contract/schema changes. The new Webhooks API from the prior
  local work must be released together with this UI.
- DEV sample module is checked separately for production exclusion.

Next agreed priority: Reports. Sandbox and Risk controls remain later scopes.
Existing audit reports/checkpoints were not modified.