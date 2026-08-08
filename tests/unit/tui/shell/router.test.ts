import { describe, expect, it } from "vitest";
import {
  ROOT_SCENE,
  SHELL_SCENES,
  SHELL_SLASH_COMMANDS,
  completeGotoCommand,
  completeSlashCommand,
  findShellCommand,
  getCommandSuggestions,
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

  it("falls back to the root chat scene for unknown scenes", () => {
    expect(normalizeScene("nope")).toBe(ROOT_SCENE);
    expect(normalizeScene("nope")).toBe("chat");
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
    expect(completeSlashCommand("/approve")).toBe("/approve ");
    expect(completeSlashCommand("/rev")).toBe("/review ");
  });

  it("completes an exact command match with a trailing space", () => {
    expect(completeSlashCommand("/settings")).toBe("/settings ");
    expect(completeSlashCommand("/mode")).toBe("/mode ");
  });

  it("normalizes an alias to its canonical command name", () => {
    // 别名可以输，但补全会把它纠成规范名，用户下次就知道正名。
    expect(completeSlashCommand("/config")).toBe("/settings ");
    expect(completeSlashCommand("/task")).toBe("/tasks ");
    expect(completeSlashCommand("/usage")).toBe("/status ");
  });

  it("does not guess on ambiguous prefixes", () => {
    // /re matches /review, /reject, /resume
    expect(completeSlashCommand("/re")).toBeUndefined();
    // /appr matches both /approvals and /approve
    expect(completeSlashCommand("/appr")).toBeUndefined();
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
    expect(names).toContain("settings");
    expect(names).toContain("help");
    for (const entry of SHELL_SLASH_COMMANDS) {
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("reaches every non-root scene through a dedicated command", () => {
    // 用户不该被迫记住 `/goto <scene>`：除根场景外每个场景都要有自己的命令。
    const reachableScenes = new Set(
      SHELL_SLASH_COMMANDS.map((entry) => entry.scene).filter(Boolean),
    );
    for (const scene of SHELL_SCENES) {
      if (scene === ROOT_SCENE) {
        continue;
      }
      expect(reachableScenes).toContain(scene);
    }
  });
});

describe("findShellCommand", () => {
  it("resolves a command by its canonical name", () => {
    expect(findShellCommand("mode")?.name).toBe("mode");
  });

  it("resolves a command through its aliases", () => {
    expect(findShellCommand("config")?.name).toBe("settings");
    expect(findShellCommand("task")?.name).toBe("tasks");
    expect(findShellCommand("?")?.name).toBe("help");
  });

  it("is case and whitespace insensitive", () => {
    expect(findShellCommand("  MODE ")?.name).toBe("mode");
  });

  it("returns undefined for unknown or empty input", () => {
    expect(findShellCommand("nope")).toBeUndefined();
    expect(findShellCommand("")).toBeUndefined();
  });
});

describe("getCommandSuggestions", () => {
  it("returns nothing without a leading slash", () => {
    expect(getCommandSuggestions("hello")).toEqual([]);
    expect(getCommandSuggestions("")).toEqual([]);
  });

  it("lists the whole catalog for a bare slash", () => {
    expect(getCommandSuggestions("/")).toHaveLength(SHELL_SLASH_COMMANDS.length);
  });

  it("ranks the exact command name first", () => {
    expect(getCommandSuggestions("/mode")[0].command.name).toBe("mode");
    expect(getCommandSuggestions("/mod")[0].command.name).toBe("mode");
  });

  it("finds commands through chinese intent keywords", () => {
    expect(getCommandSuggestions("/模式")[0].command.name).toBe("mode");
    expect(getCommandSuggestions("/帮助")[0].command.name).toBe("help");
    expect(getCommandSuggestions("/审批")[0].command.name).toBe("approvals");
  });

  it("finds commands through aliases", () => {
    expect(getCommandSuggestions("/config")[0].command.name).toBe("settings");
  });

  it("stops suggesting once the argument region starts", () => {
    // 进了参数区就该让位给参数提示，别把用户正在输的内容挤走。
    expect(getCommandSuggestions("/mode ")).toEqual([]);
    expect(getCommandSuggestions("/mode plan")).toEqual([]);
  });

  it("returns nothing when no command matches", () => {
    expect(getCommandSuggestions("/zzzz")).toEqual([]);
  });
});
