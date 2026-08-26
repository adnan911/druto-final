import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { registerStorageProxy } from "../server/_core/storageProxy";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerStorageProxy(app);
registerOAuthRoutes(app);

const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});

// Vercel may pass the rewritten request with either the /api prefix or the
// function-relative path. Supporting both keeps the endpoint stable across
// project-root and serverless routing configurations.
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc", trpcMiddleware);

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "druto" });
});

export default app;
