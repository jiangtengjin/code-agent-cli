import { describe, expect, it } from "vitest";
import { isValidApiKey, maskApiKey } from "../../src/utils/api-key.js";

describe("maskApiKey", () => {
  it("masks middle of API key with asterisks, keeping first 4 and last 4 chars", () => {
    expect(maskApiKey("sk-ant12345abcdef99")).toBe("sk-a*****ef99");
  });

  it("returns **** for keys 8 chars or shorter", () => {
    expect(maskApiKey("short")).toBe("****");
  });

  it("handles empty string", () => {
    expect(maskApiKey("")).toBe("****");
  });
});

describe("isValidApiKey", () => {
  it("returns true for non-empty string", () => {
    expect(isValidApiKey("sk-xxx")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isValidApiKey("")).toBe(false);
  });
});
