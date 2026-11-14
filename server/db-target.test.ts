import { describe, expect, it } from "vitest";
import { assertDatabaseTarget } from "./db-target";

const target = "mysql://abc.druto_app:fixture-password@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/druto_testnet";

describe("production database cutover guard", () => {
  it("accepts only the restricted Arc Testnet target", () => {
    expect(() => assertDatabaseTarget(target, "production")).not.toThrow();
    for (const wrong of [
      target.replace("/druto_testnet", "/test"),
      target.replace("abc.druto_app", "abc.root"),
      target.replace(".tidbcloud.com", ".example.com"),
      target.replace(":4000/", ":3306/"),
      target.replace("mysql://", "https://"),
      target.replace(":fixture-password@", "@"),
    ]) expect(() => assertDatabaseTarget(wrong, "production")).toThrow();
  });

  it("rejects missing credentials even in development", () => {
    expect(() => assertDatabaseTarget(undefined, "development")).toThrow("DATABASE_URL is required");
    expect(() => assertDatabaseTarget(target.replace("/druto_testnet", "/local"), "development")).not.toThrow();
  });
});
