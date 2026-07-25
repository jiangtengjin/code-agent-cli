import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_SESSION_TITLE, createSessionState, createSessionSummary } from "./runtime.js";
import type { SessionEvent, SessionState, SessionSummary } from "../types/session.js";

type SessionMeta = {
  id: string;
  kind: SessionState["kind"];
  workspaceKey: string;
  workspacePath: string;
  createdAt: string;
  parentSessionId?: string;
};

type ListSessionsOptions = {
  workspaceKey?: string;
  kind?: SessionState["kind"];
  includeArchived?: boolean;
};

type FindSessionOptions = {
  workspaceKey?: string;
  kind?: SessionState["kind"];
  includeAllWorkspaces?: boolean;
  includeArchived?: boolean;
};

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");

  try {
    await rename(tempPath, filePath);
  } catch {
    await rm(filePath, { force: true });
    await rename(tempPath, filePath);
  }
}

function sortSessionsDescending(summaries: SessionSummary[]): SessionSummary[] {
  return [...summaries].sort((left, right) => {
    if (left.lastActiveAt === right.lastActiveAt) {
      return left.createdAt < right.createdAt ? 1 : -1;
    }
    return left.lastActiveAt < right.lastActiveAt ? 1 : -1;
  });
}

export class SessionStore {
  constructor(private readonly rootPath: string) {}

  async saveSession(state: SessionState): Promise<void> {
    const summary = createSessionSummary(state);
    const meta: SessionMeta = {
      id: state.sessionId,
      kind: state.kind,
      workspaceKey: state.workspaceKey,
      workspacePath: state.workspacePath,
      createdAt: state.createdAt,
      parentSessionId: state.parentSessionId,
    };

    await ensureDir(this.getSessionDir(state.sessionId));
    await writeJsonAtomic(this.getMetaPath(state.sessionId), meta);
    await writeJsonAtomic(this.getStatePath(state.sessionId), state);

    const index = await this.loadIndex();
    const nextIndex = sortSessionsDescending([
      ...index.filter((item) => item.id !== state.sessionId),
      summary,
    ]);
    await writeJsonAtomic(this.getIndexPath(), nextIndex);
  }

  async appendEvent(sessionId: string, event: SessionEvent): Promise<void> {
    await ensureDir(this.getSessionDir(sessionId));
    await appendFile(this.getTranscriptPath(sessionId), `${JSON.stringify(event)}\n`, "utf8");
  }

  async loadSession(sessionId: string): Promise<SessionState | undefined> {
    try {
      const content = await readFile(this.getStatePath(sessionId), "utf8");
      return JSON.parse(content) as SessionState;
    } catch {
      return this.rebuildSessionFromArtifacts(sessionId);
    }
  }

  async getSummary(sessionId: string): Promise<SessionSummary | undefined> {
    const index = await this.loadIndex();
    return index.find((summary) => summary.id === sessionId);
  }

  async listSessions(options: ListSessionsOptions = {}): Promise<SessionSummary[]> {
    const index = await this.loadIndex();

    return sortSessionsDescending(
      index.filter((summary) => {
        if (!options.includeArchived && summary.status === "archived") {
          return false;
        }
        if (options.workspaceKey && summary.workspaceKey !== options.workspaceKey) {
          return false;
        }
        if (options.kind && summary.kind !== options.kind) {
          return false;
        }
        return true;
      }),
    );
  }

  async findLatestSession(options: FindSessionOptions = {}): Promise<SessionSummary | undefined> {
    const sessions = await this.listSessions({
      workspaceKey: options.includeAllWorkspaces ? undefined : options.workspaceKey,
      kind: options.kind,
      includeArchived: options.includeArchived,
    });

    return sessions[0];
  }

  async findSessionByQuery(
    query: string,
    options: FindSessionOptions = {},
  ): Promise<SessionSummary | undefined> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return undefined;
    }

    const sessions = await this.listSessions({
      workspaceKey: options.includeAllWorkspaces ? undefined : options.workspaceKey,
      kind: options.kind,
      includeArchived: options.includeArchived,
    });

    const exactMatch = sessions.find(
      (session) =>
        session.id.toLowerCase() === normalizedQuery ||
        session.title.toLowerCase() === normalizedQuery,
    );
    if (exactMatch) {
      return exactMatch;
    }

    return sessions.find(
      (session) =>
        session.id.toLowerCase().startsWith(normalizedQuery) ||
        session.title.toLowerCase().startsWith(normalizedQuery),
    );
  }

  async setArchiveState(sessionId: string, archived: boolean, now: string): Promise<void> {
    const state = await this.loadSession(sessionId);
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    state.status = archived ? "archived" : "idle";
    state.archivedAt = archived ? now : undefined;
    state.updatedAt = now;
    state.lastActiveAt = now;

    await this.saveSession(state);
  }

  private async loadIndex(): Promise<SessionSummary[]> {
    try {
      const content = await readFile(this.getIndexPath(), "utf8");
      return JSON.parse(content) as SessionSummary[];
    } catch {
      return [];
    }
  }

  private async loadMeta(sessionId: string): Promise<SessionMeta | undefined> {
    try {
      const content = await readFile(this.getMetaPath(sessionId), "utf8");
      return JSON.parse(content) as SessionMeta;
    } catch {
      return undefined;
    }
  }

  private async rebuildSessionFromArtifacts(sessionId: string): Promise<SessionState | undefined> {
    const [meta, summary, transcript] = await Promise.all([
      this.loadMeta(sessionId),
      this.getSummary(sessionId),
      this.loadTranscriptEvents(sessionId),
    ]);

    if (!meta && !summary) {
      return undefined;
    }

    const createdAt = meta?.createdAt ?? summary?.createdAt ?? new Date(0).toISOString();
    const state = createSessionState({
      sessionId,
      kind: meta?.kind ?? summary?.kind ?? "interactive",
      mode: summary?.mode ?? "normal",
      workspaceKey: meta?.workspaceKey ?? summary?.workspaceKey ?? "",
      workspacePath: meta?.workspacePath ?? summary?.workspacePath ?? "",
      now: createdAt,
      title: summary?.title ?? DEFAULT_SESSION_TITLE,
      parentSessionId: meta?.parentSessionId ?? summary?.parentSessionId,
    });

    state.updatedAt = summary?.updatedAt ?? createdAt;
    state.lastActiveAt = summary?.lastActiveAt ?? createdAt;
    state.status = summary?.status ?? "idle";
    state.archivedAt = summary?.archivedAt;

    for (const event of transcript) {
      switch (event.type) {
        case "message":
          state.messages.push(event.message);
          break;
        case "status":
          state.status = event.status;
          if (event.status !== "archived") {
            state.archivedAt = undefined;
          }
          break;
        case "plan":
          state.pendingPlan = event.planState ?? undefined;
          break;
        case "fork":
          state.parentSessionId ??= event.parentSessionId;
          break;
        case "archive":
          state.status = "archived";
          state.archivedAt = event.createdAt;
          break;
        case "clear":
          state.messages = [];
          state.pendingPlan = undefined;
          state.status = "idle";
          state.archivedAt = undefined;
          break;
        case "resume":
          break;
        default:
          break;
      }

      state.updatedAt = event.createdAt;
      state.lastActiveAt = event.createdAt;
    }

    if (!summary?.title || summary.title === DEFAULT_SESSION_TITLE) {
      state.title = state.messages.length > 0 ? createSessionSummary(state).title : DEFAULT_SESSION_TITLE;
    }

    return state;
  }

  private async loadTranscriptEvents(sessionId: string): Promise<SessionEvent[]> {
    try {
      const content = await readFile(this.getTranscriptPath(sessionId), "utf8");
      return content
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as SessionEvent];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  }

  private getIndexPath(): string {
    return join(this.rootPath, "index.json");
  }

  private getSessionsRoot(): string {
    return join(this.rootPath, "sessions");
  }

  private getSessionDir(sessionId: string): string {
    return join(this.getSessionsRoot(), sessionId);
  }

  private getMetaPath(sessionId: string): string {
    return join(this.getSessionDir(sessionId), "meta.json");
  }

  private getStatePath(sessionId: string): string {
    return join(this.getSessionDir(sessionId), "state.json");
  }

  private getTranscriptPath(sessionId: string): string {
    return join(this.getSessionDir(sessionId), "transcript.jsonl");
  }
}
