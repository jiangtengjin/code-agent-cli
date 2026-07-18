import type { ChatMode } from "../types/mode.js";
import { AutoModeHandler } from "./auto.js";
import type { ModeHandler } from "./handler.js";
import { NormalModeHandler } from "./normal.js";

export class ModeRouter {
  private readonly normal = new NormalModeHandler();
  private readonly auto = new AutoModeHandler();

  getHandler(mode: ChatMode | string | undefined): ModeHandler {
    if (mode === "auto") return this.auto;
    return this.normal;
  }
}
