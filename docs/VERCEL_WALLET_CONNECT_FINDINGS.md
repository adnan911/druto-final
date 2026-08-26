# Vercel wallet-connect findings

## Verified on 2026-08-26

The supplied deployment `druto-final-f60b5m54c-rollingbolls911-6877s-projects.vercel.app` is protected by Vercel Authentication. A harmless request to `/` returns HTTP 302 with `content-type: text/plain` and redirects to `https://vercel.com/sso-api?...`. A harmless request to `/api/trpc/auth.me?batch=1&input=%7B%7D` returns the same Vercel SSO redirect. Therefore, from an unauthenticated browser context, the request does not reach the Druto serverless handler and cannot return tRPC JSON.

This explains the client-side JSON errors such as `Unexpected token 'A'` and `Unexpected token 'T'`: the frontend expects a JSON tRPC envelope but receives a Vercel protection/error response instead.

The repository routing correction is already on GitHub `main` at commit `232284e`: `api/trpc/[...path].ts` imports `../index`, which is the correct relative path to `api/index.ts`. TypeScript and the bounded production build pass locally.

## Required production decision

For a public hackathon demo, disable Vercel Authentication and Password Protection for the canonical Druto project, or provide a public production domain that is not behind deployment protection. If protection must remain enabled, the user’s browser must first authenticate with Vercel and retain the protection cookie for both the HTML page and every `/api/trpc/*` request.

The Vercel connector currently sees the `rollingbolls` team but no linked project, while Vercel reports that a `druto-final` project already exists. Consequently, protection settings for the existing project cannot be changed from this session until the project is visible in the connected Vercel team/account scope.
