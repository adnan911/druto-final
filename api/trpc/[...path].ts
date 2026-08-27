import type { IncomingMessage, ServerResponse } from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { serialize } from "cookie";

type CookieOptions = {
  maxAge?: number;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
};

type CookieResponse = {
  cookie: (name: string, value: string, options?: CookieOptions) => void;
  clearCookie: (name: string, options?: CookieOptions) => void;
};

type NodeRequest = IncomingMessage & { body?: unknown };
type ExpressLikeRequest = NodeRequest & {
  protocol?: string;
  hostname?: string;
};
type NodeResponse = ServerResponse;

let handlerPromise: Promise<(req: IncomingMessage, res: ServerResponse) => void> | undefined;

function appendSetCookie(res: ServerResponse, value: string) {
  const current = res.getHeader("set-cookie");
  const values = Array.isArray(current) ? current.map(String) : current ? [String(current)] : [];
  res.setHeader("set-cookie", [...values, value]);
}

function createCookieResponse(res: ServerResponse): CookieResponse {
  return {
    cookie(name, value, options = {}) {
      appendSetCookie(res, serialize(name, value, {
        ...options,
        sameSite: options.sameSite ?? "lax",
      }));
    },
    clearCookie(name, options = {}) {
      appendSetCookie(res, serialize(name, "", {
        ...options,
        maxAge: 0,
        sameSite: options.sameSite ?? "lax",
      }));
    },
  };
}

function normalizeRequest(req: NodeRequest): ExpressLikeRequest {
  const normalized = Object.create(req) as ExpressLikeRequest;
  const originalUrl = req.url ?? "/";
  const strippedUrl = originalUrl
    .replace(/^\/api\/trpc(?=\/|$)/, "")
    .replace(/^\/trpc(?=\/|$)/, "");
  normalized.url = strippedUrl || "/";
  normalized.protocol = String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0].trim();
  normalized.hostname = (req.headers.host ?? "").split(":")[0] || undefined;
  return normalized;
}

async function getHandler() {
  handlerPromise ??= (async () => {
    const [{ appRouter }, { createContext }] = await Promise.all([
      import("../../server/routers"),
      import("../../server/_core/context"),
    ]);

    return createHTTPHandler({
      router: appRouter,
      basePath: "/",
      createContext: ({ req, res }) => createContext({
        req: req as never,
        res: createCookieResponse(res) as never,
      }),
    });
  })();
  return handlerPromise;
}

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Unknown tRPC bootstrap error";
  return error.message.replace(/\s+/g, " ").slice(0, 240) || "Unknown tRPC bootstrap error";
}

export default async function handler(req: NodeRequest, res: NodeResponse) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
    res.setHeader("access-control-allow-headers", "content-type, authorization, x-trpc-source");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.end();
    return;
  }

  try {
    const trpcHandler = await getHandler();
    return trpcHandler(normalizeRequest(req), res);
  } catch (error) {
    console.error("[Vercel tRPC bootstrap] failed", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        error: {
          message: "Druto tRPC bootstrap failed",
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
