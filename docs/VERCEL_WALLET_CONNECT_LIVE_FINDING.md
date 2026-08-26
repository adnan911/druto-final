# Live Vercel wallet-connect finding

After Vercel deployment protection was disabled, the deployment root became publicly reachable and served the Druto HTML. The API is still failing: `/api/health` and `/api/trpc/auth.me?batch=1&input=%7B%7D` return HTTP 500 `FUNCTION_INVOCATION_FAILED` with the plain-text body `A server error has occurred`.

The live dashboard page renders the Connect wallet button, but a click in the sandbox browser produced no modal, no inline error, and no browser-console output. This is consistent with the serverless API failing before the wallet challenge request can return tRPC JSON, or with the hosted-wallet fallback configuration not being available in that deployment. No signature or payment was attempted.
