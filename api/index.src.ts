import express, { type Express, type Request, type Response } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers.js";
import { createContext } from "../server/_core/context.js";
import { registerOAuthRoutes } from "../server/_core/oauth.js";
import { registerStorageProxy } from "../server/_core/storageProxy.js";

type VercelRequest = Request;
type VercelResponse = Response;

let appPromise: Promise<Express> | undefined;

async function createApp(): Promise<Express> {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use((req, _res, next) => {
    if (req.method === "POST" && req.body && typeof req.body === "object" && !("json" in req.body) && !Array.isArray(req.body)) {
      req.body = { json: req.body };
    }
    next();
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "druto" });
  });

  const trpcMiddleware = createExpressMiddleware({
    router: appRouter,
    createContext,
  });

  app.use("/api/trpc", trpcMiddleware);
  app.use("/trpc", trpcMiddleware);
  app.use(trpcMiddleware);
  return app;
}

function getApp(): Promise<Express> {
  appPromise ??= createApp();
  return appPromise;
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown serverless bootstrap error";
  return error.message.replace(/\s+/g, " ").slice(0, 240) || "Unknown serverless bootstrap error";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    console.error("[Vercel API bootstrap] failed", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        error: {
          message: "Druto API bootstrap failed",
          code: -32603,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
            path: typeof req.url === "string" ? req.url.split("?")[0] : undefined,
            detail: safeErrorMessage(error),
          },
        },
      }));
    }
  }
}
