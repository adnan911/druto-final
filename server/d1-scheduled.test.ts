import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("./d1-sessions", () => ({ cleanupD1Sessions: vi.fn() }));
vi.mock("./d1-webhook-drain", () => ({ drainD1WebhookOutbox: vi.fn() }));
import { cleanupD1Sessions } from "./d1-sessions";
import { drainD1WebhookOutbox } from "./d1-webhook-drain";
import { runD1Scheduled, D1_SESSION_CLEANUP_CRON, D1_WEBHOOK_CRON } from "./d1-scheduled";
afterEach(() => vi.resetAllMocks());

describe("D1 maintenance routing", () => {
  it("keeps cleanup isolated from webhook delivery and routes configured crons", async () => {
    const config = JSON.parse(readFileSync("wrangler.d1.jsonc", "utf8"));
    expect(config.triggers.crons).toEqual([D1_WEBHOOK_CRON, D1_SESSION_CLEANUP_CRON]);
    vi.mocked(cleanupD1Sessions).mockResolvedValue({ deleted: 0, limitReached: false });
    await runD1Scheduled(D1_SESSION_CLEANUP_CRON);
    expect(cleanupD1Sessions).toHaveBeenCalledOnce();
    expect(drainD1WebhookOutbox).not.toHaveBeenCalled();
    vi.mocked(drainD1WebhookOutbox).mockResolvedValue({ selected: 0, delivered: 0 } as never);
    await runD1Scheduled(D1_WEBHOOK_CRON);
    expect(drainD1WebhookOutbox).toHaveBeenCalledWith(2);
    expect(cleanupD1Sessions).toHaveBeenCalledOnce();
  });
  it("propagates failures and rejects unexpected schedules", async () => {
    vi.mocked(cleanupD1Sessions).mockRejectedValue(new Error("Database unavailable"));
    await expect(runD1Scheduled(D1_SESSION_CLEANUP_CRON)).rejects.toThrow("Database unavailable");
    expect(drainD1WebhookOutbox).not.toHaveBeenCalled();
    vi.mocked(drainD1WebhookOutbox).mockResolvedValue({ selected: 2, delivered: 1 } as never);
    await expect(runD1Scheduled(D1_WEBHOOK_CRON)).rejects.toThrow("retry or review");
    await expect(runD1Scheduled("* * * * *")).rejects.toThrow("Unknown");
  });
});
