import { runExecutionLoop } from "../session/execution.js";
import type { ModeHandler, ModeRunResult, RunContext } from "./handler.js";

export class NormalModeHandler implements ModeHandler {
  readonly mode = "normal" as const;
  readonly maxIterations = 10;

  run(input: string, context: RunContext): Promise<ModeRunResult> {
    return runExecutionLoop(input, context, this.maxIterations);
  }
}
