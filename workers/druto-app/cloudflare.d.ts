// Narrow entrypoint declarations keep Worker bindings out of the Node server's
// global Buffer/Request types. Wrangler bundles against the actual runtime.
interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface Hyperdrive {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
}

interface ExportedHandler<Env> {
  fetch?(request: Request, env: Env, context: unknown): Promise<Response> | Response;
  scheduled?(event: unknown, env: Env, context: unknown): Promise<void> | void;
}

declare module "cloudflare:node" {
  import type { Server } from "node:http";
  export function httpServerHandler(server: Server): {
    fetch(request: Request, env: unknown, context: unknown): Promise<Response>;
  };
}
