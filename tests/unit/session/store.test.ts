import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStore } from "../../../src/session/store.js";
import type { SessionState } from "../../../src/types/session.js";

function buildState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: "session-1",
    kind: "interactive",
    mode: "normal",
    messages: [{ role: "user", content: "Fix the flaky test failure in CI" }],
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      calls: 0,
    },
    status: "idle",
    workspaceKey: "workspace-a",
    workspacePath: "/repo-a",
    createdAt: "2026-07-25T12:00:00.000Z",
    updatedAt: "2026-07-25T12:01:00.000Z",
    lastActiveAt: "2026-07-25T12:01:00.000Z",
    title: "Fix the flaky test failure in CI",
    ...overrides,
  };
}

describe("SessionStore", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const tempDir of tempDirs) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("persists index, meta, state, and transcript files for a session", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-agent-sessions-"));
    tempDirs.push(tempDir);
    const store = new SessionStore(tempDir);
    const state = buildState();

    await store.saveSession(state);
    await store.appendEvent(state.sessionId, {
      type: "message",
      createdAt: "2026-07-25T12:01:00.000Z",
      message: { role: "user", content: "Fix the flaky test failure in CI" },
    });

    const sessionDir = path.join(tempDir, "sessions", state.sessionId);
    const index = JSON.parse(await fs.readFile(path.join(tempDir, "index.json"), "utf8"));
    const meta = JSON.parse(await fs.readFile(path.join(sessionDir, "meta.json"), "utf8"));
    const savedState = JSON.parse(await fs.readFile(path.join(sessionDir, "state.json"), "utf8"));
    const transcript = await fs.readFile(path.join(sessionDir, "transcript.jsonl"), "utf8");

    expect(index).toHaveLength(1);
    expect(meta).toMatchObject({
      id: "session-1",
      workspaceKey: "workspace-a",
      workspacePath: "/repo-a",
    });
    expect(savedState).toMatchObject({
      sessionId: "session-1",
      title: "Fix the flaky test failure in CI",
    });
    expect(transcript.trim().split("\n")).toHaveLength(1);
  });

  it("lists sessions sorted by lastActiveAt and filters by workspace, kind, and archive status", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-agent-sessions-"));
    tempDirs.push(tempDir);
    const store = new SessionStore(tempDir);

    await store.saveSession(
      buildState({
        sessionId: "session-1",
        workspaceKey: "workspace-a",
        workspacePath: "/repo-a",
        lastActiveAt: "2026-07-25T12:01:00.000Z",
      }),
    );
    await store.saveSession(
      buildState({
        sessionId: "session-2",
        kind: "prompt",
        workspaceKey: "workspace-a",
        workspacePath: "/repo-a",
        lastActiveAt: "2026-07-25T12:02:00.000Z",
        updatedAt: "2026-07-25T12:02:00.000Z",
        title: "Prompt session",
      }),
    );
    await store.saveSession(
      buildState({
        sessionId: "session-3",
        workspaceKey: "workspace-b",
        workspacePath: "/repo-b",
        lastActiveAt: "2026-07-25T12:03:00.000Z",
        updatedAt: "2026-07-25T12:03:00.000Z",
        title: "Other workspace",
      }),
    );
    await store.saveSession(
      buildState({
        sessionId: "session-4",
        workspaceKey: "workspace-a",
        workspacePath: "/repo-a",
        status: "archived",
        lastActiveAt: "2026-07-25T12:04:00.000Z",
        updatedAt: "2026-07-25T12:04:00.000Z",
        title: "Archived session",
      }),
    );

    const visible = await store.listSessions({
      workspaceKey: "workspace-a",
      kind: "interactive",
    });
    const withArchived = await store.listSessions({
      workspaceKey: "workspace-a",
      includeArchived: true,
    });

    expect(visible.map((session) => session.id)).toEqual(["session-1"]);
    expect(withArchived.map((session) => session.id)).toEqual([
      "session-4",
      "session-2",
      "session-1",
    ]);
  });

  it("updates archive status in both summary and restorable state", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-agent-sessions-"));
    tempDirs.push(tempDir);
    const store = new SessionStore(tempDir);
    const state = buildState();

    await store.saveSession(state);
    await store.setArchiveState("session-1", true, "2026-07-25T12:05:00.000Z");

    const summary = await store.getSummary("session-1");
    const savedState = await store.loadSession("session-1");

    expect(summary).toMatchObject({
      id: "session-1",
      status: "archived",
      archivedAt: "2026-07-25T12:05:00.000Z",
    });
    expect(savedState).toMatchObject({
      sessionId: "session-1",
      status: "archived",
    });
  });
});
