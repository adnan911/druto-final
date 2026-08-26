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
type NodeResponse = ServerResponse & CookieResponse;

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

async function getHandler() {
  handlerPromise ??= (async () => {
    const [{ appRouter }, { createContext }] = await Promise.all([
      import("../../server/routers"),
      import("../../server/_core/context"),
    ]);

    return createHTTPHandler({
      router: appRouter,
      basePath: "/api/trpc/",
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
    return trpcHandler(req, res);
  } catch (error) {
    console.error("[Vercel tRPC bootstrap] failed", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Druto tRPC bootstrap failed", detail: safeErrorMessage(error) }));
    }
  }
}
