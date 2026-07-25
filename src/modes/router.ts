import type { ChatMode } from "../types/mode.js";
import { AutoModeHandler } from "./auto.js";
import { EditModeHandler } from "./edit.js";
import type { ModeHandler } from "./handler.js";
import { NormalModeHandler } from "./normal.js";
import { PlanModeHandler } from "./plan.js";

export class ModeRouter {
  private readonly normal = new NormalModeHandler();
  private readonly auto = new AutoModeHandler();
  private readonly plan = new PlanModeHandler();
  private readonly edit = new EditModeHandler();

  getHandler(mode: ChatMode | string | undefined): ModeHandler {
    if (mode === "auto") return this.auto;
    if (mode === "plan") return this.plan;
    if (mode === "edit") return this.edit;
    return this.normal;
  }
}
