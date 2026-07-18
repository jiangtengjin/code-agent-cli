# Phase 1d: Normal/Auto Modes and MCP Integration - Design

> Version: 1.0
> Date: 2026-07-18
> Status: approved for implementation planning
> Based on: project design document, Phase 1d

## 1. Overview

Phase 1d turns the current chat loop into a complete MVP execution flow:

- Normal mode has bounded one-task execution instead of the same long loop as Auto mode.
- Auto mode can run a multi-step tool loop with an explicit iteration cap.
- Slash commands include session usage reporting.
- MCP stdio servers can be started from config, discovered, and exposed through the existing tool registry.
- The CLI status surface shows mode, model, context, and MCP availability without introducing a full TUI framework.

The implementation should keep the current readline-based UI and existing built-in tool model. This phase is a focused architecture extraction, not a UI rewrite.

## 2. Goals

1. Extract mode-specific execution from `src/cli/chat.ts`.
2. Add a `ModeRouter` and handler interface for `normal`, `auto`, `plan`, and `edit`.
3. Make Normal and Auto behavior meaningfully different.
4. Add session-level token usage tracking and expose it through `/usage`.
5. Integrate MCP through the official `@modelcontextprotocol/sdk` v1 production line.
6. Discover MCP tools from configured stdio servers and register them as normal `ToolDefinition` entries.
7. Preserve existing `--yolo`, slash command completion, prompt mode switching, `runPrompt`, and built-in tool behavior.

## 3. Non-Goals

- Plan mode execution semantics.
- Edit mode execution semantics.
- MCP management slash commands such as add/remove/list.
- MCP SSE or HTTP transports.
- OAuth, remote authentication, or MCP sampling.
- Cost estimation based on model-specific pricing.
- A full Ink/reactive TUI rewrite.
- Terminal command execution via `node-pty`.

Plan and Edit should continue to be selectable modes, but Phase 1d routes them through Normal behavior until their dedicated phases are implemented.

## 4. Dependencies

Add the latest production v1 release of the official MCP TypeScript SDK.

If the installed SDK requires a newer Zod 3.x version than the current dependency, update `zod` within the same major line. Do not adopt SDK v2 beta APIs in this phase.

Rationale:

- The project design document already specifies the official MCP SDK.
- SDK-managed protocol handling avoids hand-maintaining JSON-RPC initialization, capability negotiation, request correlation, and tool result parsing.
- The current phase only uses stdio transport, but the SDK keeps later SSE/HTTP support viable.

## 5. Architecture

### 5.1 New Modules

Add the following modules:

```text
src/modes/
  handler.ts
  router.ts
  normal.ts
  auto.ts

src/session/
  usage.ts
  execution.ts

src/tools/mcp/
  client.ts
  manager.ts
```

The exact filenames can be adjusted during implementation if local import boundaries suggest a better shape, but the responsibilities should remain separated.

### 5.2 Mode Handler Contract

Mode handlers own the LLM/tool loop policy. They do not own readline, slash commands, or UI rendering.

```ts
export interface ModeHandler {
  readonly mode: ChatMode;
  readonly maxIterations: number;
  run(input: string, context: RunContext): Promise<ModeRunResult>;
}
```

`RunContext` carries:

- `provider`
- `toolRegistry`
- `messages`
- `config`
- `usageTracker`
- `confirmToolCall`
- `skipConfirm`
- output callbacks for assistant text, tool progress, warnings, and timing

`ModeRunResult` carries:

- number of iterations used
- tool calls used
- whether the iteration cap was reached
- optional assistant content

The handler contract makes mode behavior independently testable without constructing the readline UI.

### 5.3 ModeRouter

`ModeRouter` maps the configured mode to a handler:

- `normal` -> `NormalModeHandler`
- `auto` -> `AutoModeHandler`
- `plan` -> `NormalModeHandler` fallback for Phase 1d
- `edit` -> `NormalModeHandler` fallback for Phase 1d

The fallback is intentional and should be explicit in code. It prevents unsupported modes from crashing while keeping future Plan/Edit implementation paths clear.

### 5.4 Normal Mode

Normal mode is a bounded interactive task loop:

1. Add the user message.
2. Call the LLM with current messages, system prompt, and registered tools.
3. If the LLM requests tools, execute them through the existing confirmation flow.
4. Add tool result messages.
5. Continue until the LLM returns text or the iteration cap is reached.

Default cap: `10` LLM calls.

This preserves "standard question-answer plus tools" while preventing Normal from behaving like a long-running autonomous agent.

### 5.5 Auto Mode

Auto mode uses the same execution primitives as Normal but with autonomous policy:

1. Add the user message.
2. Continue LLM/tool iterations until the LLM returns final text or the cap is reached.
3. Use more explicit progress text in the existing spinner/output path.
4. Emit a clear warning if the cap is reached.

Default cap: `25` LLM calls.

`--yolo` continues to skip confirmation for tools that require confirmation. Without `--yolo`, tool confirmation behavior remains the same as Normal.

## 6. Usage Tracking

Add a session-level usage tracker that accumulates every `LLMResponse.usage`:

```ts
export interface UsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}
```

Behavior:

- Every LLM response with `usage` is recorded.
- Per-response token logging can stay as it is.
- `/usage` prints cumulative prompt, completion, total tokens, LLM call count, and current model.
- `/clear` clears messages but does not reset usage unless implementation explicitly documents a separate reset command later.

No cost estimation is included in Phase 1d because model pricing is provider-specific and changes over time.

## 7. MCP Integration

### 7.1 Startup

At chat startup and prompt execution startup:

1. Create the built-in tool registry.
2. Create an MCP manager from `config.mcpServers`.
3. Start configured stdio servers.
4. Discover tools through SDK `listTools`.
5. Register MCP tools into the same `ToolRegistry`.

If `config.mcpServers` is empty or missing, startup should behave exactly as it does now.

### 7.2 Supported Transport

Phase 1d supports only stdio transport.

If a server config specifies `sse` or `http`, the manager should report a readable unsupported-transport warning and skip that server. It should not crash the whole CLI session.

### 7.3 Tool Naming

Register MCP tools with a stable namespace:

```text
mcp_<serverName>_<toolName>
```

The registered tool description should include the original server and tool name so the LLM can infer provenance.

### 7.4 Tool Execution

Each registered MCP tool maps to:

```ts
client.callTool(originalToolName, args)
```

The result is converted into the existing `ToolResult` shape:

- `success: true` when MCP `isError` is not set.
- `success: false` when MCP `isError` is true or the SDK call throws.
- Text content is preserved in `data` as a string or structured array, depending on result shape.
- Errors include server name and tool name.

### 7.5 Safety

All MCP tools require confirmation by default.

Reason:

- MCP tools are external and may perform file, network, or system-side effects.
- The current project already has a confirmation path for sensitive tools.
- `--yolo` already means "skip tool confirmation", so no new safety switch is required.

### 7.6 Shutdown

On readline close and after `runPrompt` finishes, stop all MCP clients and child processes through the manager.

Shutdown should be best-effort:

- Attempt to close every client.
- Do not hide the original task error if cleanup also fails.
- Avoid leaving child processes running.

## 8. CLI and Status Surface

Keep the readline UI.

Welcome/status display should include:

- mode
- provider/model
- masked API key
- current working directory
- MCP server count
- MCP tool count

The input frame continues to show mode. `/mode` updates the current mode and the prompt frame. `/usage` prints the usage snapshot.

This phase does not introduce a persistent bottom status bar because the current CLI is line-oriented. The "status bar" requirement is satisfied by the welcome/status surface and input frame until a future TUI rewrite.

## 9. Data Flow

Interactive chat:

```text
readline input
  -> slash command?
    -> handle slash command
  -> regular input
    -> draw user message
    -> ModeRouter.getHandler(mode)
    -> handler.run(input, RunContext)
      -> provider.chat(...)
      -> usageTracker.record(response.usage)
      -> tool calls?
        -> handleToolCalls(...)
        -> append tool results
        -> continue according to mode cap
      -> assistant text
    -> print timing
    -> prompt next input
```

Prompt mode:

```text
CLI -p prompt
  -> create provider
  -> create built-in tools
  -> start MCP manager
  -> ModeRouter.getHandler(config.mode ?? "normal")
  -> handler.run(prompt, RunContext)
  -> print assistant text and timing
  -> stop MCP manager
```

## 10. Error Handling

LLM errors:

- Keep existing `displayError` mapping.

Tool errors:

- Unknown tools append a tool error message and allow the loop to continue.
- Tool execution failures append a failed `ToolResult`.

MCP startup errors:

- A single MCP server failure should warn and skip that server.
- Other configured MCP servers should still start.

MCP tool call errors:

- Return `ToolResult { success: false, error }`.
- Include server/tool identity in the error message.

Iteration cap:

- Print a warning when cap is reached.
- Preserve messages generated so far.

## 11. Testing Strategy

Use test-driven implementation.

Unit tests:

- `ModeRouter` returns the correct handler for normal and auto.
- `ModeRouter` routes plan/edit through Normal fallback in Phase 1d.
- Normal mode uses cap `10`.
- Auto mode uses cap `25`.
- Handlers append user, assistant, and tool messages in the expected order.
- Usage tracker accumulates prompt, completion, total tokens, and call count.
- `/usage` prints cumulative usage.
- MCP manager starts configured stdio servers through SDK abstractions.
- MCP manager registers discovered tools into `ToolRegistry`.
- MCP tool execution maps SDK results to `ToolResult`.
- MCP shutdown closes all started clients.

Regression tests:

- `--yolo` still skips confirmation.
- Non-yolo tool calls still ask for confirmation.
- Existing slash suggestions and completions still work.
- `runPrompt` still avoids creating a readline interface.

Verification before commit:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 12. Implementation Sequence

1. Add usage tracker tests and implementation.
2. Add mode handler/router tests and implementation.
3. Refactor `runPrompt` and `startChat` to use handlers.
4. Add `/usage` tests and command behavior.
5. Add SDK dependency.
6. Add MCP manager/client tests with SDK mocks.
7. Implement MCP manager/client and tool registration.
8. Add startup/shutdown integration in chat and prompt flows.
9. Add status surface details.
10. Run full verification and commit implementation.

## 13. Acceptance Criteria

- Normal and Auto no longer share the same hard-coded `50` iteration loop.
- Normal caps at `10` LLM calls by default.
- Auto caps at `25` LLM calls by default.
- `/usage` reports cumulative session token usage.
- Configured stdio MCP servers start through the official SDK.
- MCP tools are discovered and registered under `mcp_<server>_<tool>`.
- MCP tools can be called through the existing tool execution path.
- MCP tools require confirmation unless `--yolo` is set.
- Chat and prompt flows both clean up MCP servers.
- Existing tests remain passing after refactor.
