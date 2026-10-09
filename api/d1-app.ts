import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { d1Router } from "../server/d1-router";
import { createD1Context } from "../server/d1-context";
import { checkD1Readiness } from "../server/d1-db";
import { drutoPublicOrigin } from "../server/public-origin";
import { assertWebhookEncryptionConfigured } from "../server/webhooks";

export function assertD1Configuration() {
  drutoPublicOrigin();
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Cloudflare D1 JWT secret is missing");
  }
  assertWebhookEncryptionConfigured();
}

export function createD1App() {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  // Dashboard mutations use cookies. Reject browser requests originating from
  // another site before any tRPC procedure executes. Bearer-key requests from
  // server-side marketplace SDKs do not send a browser session cookie.
  app.use((req, res, next) => {
    if (req.method === "POST" && req.headers.cookie && req.headers.origin) {
      try {
        const origin = new URL(req.headers.origin);
        const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || "");
        if (origin.host !== req.headers.host || origin.protocol !== (localHost ? "http:" : "https:")) {
          res.status(403).json({ error: "Cross-site mutation blocked" });
          return;
        }
      } catch { res.status(403).json({ error: "Invalid Origin" }); return; }
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => res.status(200).json({ ok: true, service: "druto-d1-testnet" }));
  app.get("/api/ready", async (_req, res) => {
    try {
      assertD1Configuration();
      await checkD1Readiness();
      res.status(200).json({ ready: true, database: "d1", network: "arc-testnet" });
    } catch { res.status(503).json({ ready: false }); }
  });
  const trpc = createExpressMiddleware({ router: d1Router, createContext: createD1Context });
  app.use("/api/trpc", trpc);
  app.use("/trpc", trpc);
  return app;
}
