import type { InteractionEvent } from "../../interaction/events.js";
import type { TUIScene } from "../types.js";

export type ShellAction =
  | {
      type: "scene.changed";
      scene: TUIScene;
    }
  | {
      type: "interaction.received";
      event: InteractionEvent;
    };

export function createSceneChangedAction(scene: TUIScene): ShellAction {
  return {
    type: "scene.changed",
    scene,
  };
}

export function createInteractionEventAction(event: InteractionEvent): ShellAction {
  return {
    type: "interaction.received",
    event,
  };
}
