import { describe, expect, it, vi } from "vitest";
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));
import { buildSdkZip, buildStarterZip } from "./zipDownloader";

describe("download archives", () => {
  it("includes the complete runnable starter and local SDK", () => {
    const zip = buildStarterZip();
    for (const path of ["package.json", "app/layout.tsx", "app/page.tsx", "app/globals.css", ".env.example", "lib/druto-sdk/index.js", "lib/druto-sdk/index.d.ts"]) {
      expect(zip.file(path), path).not.toBeNull();
    }
  });
  it("ships an immediately installable SDK with entry points", async () => {
    const zip = buildSdkZip();
    const pkg = JSON.parse(await zip.file("package.json")!.async("string"));
    expect(zip.file(pkg.main)).not.toBeNull();
    expect(zip.file(pkg.types)).not.toBeNull();
    expect(zip.file("README.md")).not.toBeNull();
  });
});
