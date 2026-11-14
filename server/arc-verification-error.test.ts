import { describe, expect, it } from "vitest";
import { arcVerificationError } from "./arc-verification-error";

describe("Arc verification error boundary", () => {
  it("returns a useful rejection for an invalid payer proof", () => {
    const result = arcVerificationError(new Error("Invalid payer confirmation signature"));
    expect(result.code).toBe("BAD_REQUEST");
    expect(result.message).toBe("Invalid payer confirmation signature");
  });

  it("does not reveal upstream RPC response bodies or URLs", () => {
    const result = arcVerificationError(new Error("RPC failed: https://rpc.example/?key=secret <html>private</html>"));
    expect(result.code).toBe("SERVICE_UNAVAILABLE");
    expect(result.message).not.toMatch(/secret|private|rpc\.example/i);
    expect(result.message).toMatch(/before sending funds again/i);
  });
});
