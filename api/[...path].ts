import app from "./index";

// Vercel's file-based catch-all ensures /api/trpc/* and other API paths invoke
// the Express handler even when the project has no custom rewrite rule.
export default app;
