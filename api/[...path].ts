// The Vercel build emits index.js. Importing index.src leaves an extensionless
// runtime import that Vercel cannot resolve after packaging the function.
import app from "./index.js";

// Vercel's file-based catch-all ensures /api/trpc/* and other API paths invoke
// the Express handler even when the project has no custom rewrite rule.
export default app;
