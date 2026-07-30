import { describe, expect, it } from "vitest";
import {
  SHELL_SCENES,
  SHELL_SLASH_COMMANDS,
  completeGotoCommand,
  completeSlashCommand,
  isTUIScene,
  normalizeScene,
  parseGotoCommand,
  resolveSceneQuery,
} from "../../../../src/tui/shell/router.js";

describe("router scene helpers", () => {
  it("lists all canonical scenes", () => {
    expect(SHELL_SCENES).toContain("chat");
    expect(SHELL_SCENES).toContain("approvals");
    expect(SHELL_SCENES).toContain("tasks");
  });

  it("guards scene values", () => {
    expect(isTUIScene("chat")).toBe(true);
    expect(isTUIScene("nope")).toBe(false);
  });

  it("falls back to home for unknown scenes", () => {
    expect(normalizeScene("nope")).toBe("home");
    expect(normalizeScene("chat")).toBe("chat");
  });

  it("resolves exact and prefix scene queries", () => {
    expect(resolveSceneQuery("chat")).toBe("chat");
    expect(resolveSceneQuery("app")).toBe("approvals");
    expect(resolveSceneQuery("set")).toBe("settings");
    expect(resolveSceneQuery("s")).toBe("settings");
    // ambiguous prefixes resolve to nothing
    expect(resolveSceneQuery("re")).toBeUndefined();
  });

  it("parses and completes /goto scene navigation", () => {
    expect(parseGotoCommand("/goto chat")).toBe("chat");
    expect(parseGotoCommand("/goto app")).toBe("approvals");
    expect(parseGotoCommand("/goto nope")).toBeUndefined();
    expect(parseGotoCommand("chat")).toBeUndefined();

    expect(completeGotoCommand("/goto ch")).toBe("/goto chat");
    expect(completeGotoCommand("/goto s")).toBe("/goto settings");
    expect(completeGotoCommand("/goto re")).toBeUndefined();
  });
});

describe("completeSlashCommand", () => {
  it("completes a unique command prefix with a trailing space", () => {
    expect(completeSlashCommand("/mod")).toBe("/mode ");
    expect(completeSlashCommand("/appr")).toBe("/approve ");
    expect(completeSlashCommand("/rev")).toBe("/review ");
  });

  it("completes an exact command match with a trailing space", () => {
    expect(completeSlashCommand("/config")).toBe("/config ");
    expect(completeSlashCommand("/mode")).toBe("/mode ");
  });

  it("does not guess on ambiguous prefixes", () => {
    // /re matches /review, /reject, /resume
    expect(completeSlashCommand("/re")).toBeUndefined();
  });

  it("returns undefined when no command matches", () => {
    expect(completeSlashCommand("/zzz")).toBeUndefined();
  });

  it("returns undefined without a leading slash", () => {
    expect(completeSlashCommand("mode")).toBeUndefined();
    expect(completeSlashCommand("")).toBeUndefined();
  });

  it("leaves a fully typed command plus argument intact when the prefix is already complete", () => {
    // once the command word is complete and an argument follows, there is nothing to complete
    expect(completeSlashCommand("/mode ")).toBeUndefined();
    expect(completeSlashCommand("/mode plan")).toBeUndefined();
  });

  it("still routes /goto scene completion through the scene resolver", () => {
    expect(completeSlashCommand("/goto ch")).toBe("/goto chat");
    expect(completeSlashCommand("/goto app")).toBe("/goto approvals");
    expect(completeSlashCommand("/goto s")).toBe("/goto settings");
    // ambiguous scene prefix stays undefined
    expect(completeSlashCommand("/goto re")).toBeUndefined();
  });

  it("exposes the canonical slash command catalog", () => {
    const names = SHELL_SLASH_COMMANDS.map((entry) => entry.name);
    expect(names).toContain("goto");
    expect(names).toContain("mode");
    expect(names).toContain("approve");
    expect(names).toContain("config");
    for (const entry of SHELL_SLASH_COMMANDS) {
      expect(typeof entry.description).toBe("string");
    }
  });
});
