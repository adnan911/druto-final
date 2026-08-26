import app from "../index";

// Direct file-based mapping for /api/trpc/* requests. This avoids relying on
// a project-wide rewrite and guarantees tRPC receives the original request.
export default app;
