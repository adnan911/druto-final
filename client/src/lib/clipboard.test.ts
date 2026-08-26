import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./clipboard";

describe("copyTextToClipboard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the browser clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyTextToClipboard("hello Druto")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello Druto");
  });

  it("returns false when no browser document is available", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", undefined);

    await expect(copyTextToClipboard("server-side text")).resolves.toBe(false);
  });
});
