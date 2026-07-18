import { describe, expect, it } from "vitest";
import { ModeRouter } from "../../../src/modes/router.js";

describe("ModeRouter", () => {
  it("returns normal and auto handlers with different caps", () => {
    const router = new ModeRouter();

    expect(router.getHandler("normal")).toMatchObject({
      mode: "normal",
      maxIterations: 10,
    });
    expect(router.getHandler("auto")).toMatchObject({
      mode: "auto",
      maxIterations: 25,
    });
  });

  it("routes plan and edit through normal behavior in Phase 1d", () => {
    const router = new ModeRouter();

    expect(router.getHandler("plan")).toMatchObject({
      mode: "normal",
      maxIterations: 10,
    });
    expect(router.getHandler("edit")).toMatchObject({
      mode: "normal",
      maxIterations: 10,
    });
  });

  it("falls back to normal for invalid mode strings", () => {
    const router = new ModeRouter();

    expect(router.getHandler("invalid")).toMatchObject({
      mode: "normal",
      maxIterations: 10,
    });
  });

  it("falls back to normal when mode is undefined", () => {
    const router = new ModeRouter();

    expect(router.getHandler(undefined)).toMatchObject({
      mode: "normal",
      maxIterations: 10,
    });
  });
});
