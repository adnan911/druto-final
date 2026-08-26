import type { Request, Response } from "express";
import type { Express } from "express";

type VercelRequest = Request;
type VercelResponse = Response;

type AppModules = {
  express: (typeof import("express"))["default"];
  createExpressMiddleware: typeof import("@trpc/server/adapters/express").createExpressMiddleware;
  appRouter: typeof import("../server/routers").appRouter;
  createContext: typeof import("../server/_core/context").createContext;
  registerOAuthRoutes: typeof import("../server/_core/oauth").registerOAuthRoutes;
  registerStorageProxy: typeof import("../server/_core/storageProxy").registerStorageProxy;
};

let appPromise: Promise<Express> | undefined;

async function loadAppModules(): Promise<AppModules> {
  const [expressModule, trpcModule, routerModule, contextModule, oauthModule, storageModule] = await Promise.all([
    import("express"),
    import("@trpc/server/adapters/express"),
    import("../server/routers"),
    import("../server/_core/context"),
    import("../server/_core/oauth"),
    import("../server/_core/storageProxy"),
  ]);

  return {
    express: expressModule.default,
    createExpressMiddleware: trpcModule.createExpressMiddleware,
    appRouter: routerModule.appRouter,
    createContext: contextModule.createContext,
    registerOAuthRoutes: oauthModule.registerOAuthRoutes,
    registerStorageProxy: storageModule.registerStorageProxy,
  };
}

async function createApp(): Promise<Express> {
  const modules = await loadAppModules();
  const app = modules.express();

  app.use(modules.express.json({ limit: "50mb" }));
  app.use(modules.express.urlencoded({ limit: "50mb", extended: true }));
  modules.registerStorageProxy(app);
  modules.registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "druto" });
  });

  const trpcMiddleware = modules.createExpressMiddleware({
    router: modules.appRouter,
    createContext: modules.createContext,
  });

  // Vercel can invoke the handler with either the original /api prefix or a
  // function-relative path. Support both shapes and the direct root fallback.
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
    // Keep the failure JSON-shaped so tRPC clients never try to parse Vercel's
    // plain-text FUNCTION_INVOCATION_FAILED response. The message is bounded
    // and contains no environment values or request data.
    console.error("[Vercel API bootstrap] failed", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Druto API bootstrap failed", detail: safeErrorMessage(error) }));
    }
  }
}
