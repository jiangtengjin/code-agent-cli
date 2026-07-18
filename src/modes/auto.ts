import { runExecutionLoop } from "../session/execution.js";
import type { ModeHandler, ModeRunResult, RunContext } from "./handler.js";

export class AutoModeHandler implements ModeHandler {
  readonly mode = "auto" as const;
  readonly maxIterations = 25;

  run(input: string, context: RunContext): Promise<ModeRunResult> {
    return runExecutionLoop(input, context, this.maxIterations);
  }
}
