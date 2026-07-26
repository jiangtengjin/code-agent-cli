import type { InteractionEvent } from "./events.js";

export interface InteractionRenderer {
  render(event: InteractionEvent): void | Promise<void>;
  flush?(): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

export async function replayInteractionEvents(
  events: Iterable<InteractionEvent>,
  renderer: InteractionRenderer,
): Promise<void> {
  for (const event of events) {
    await renderer.render(event);
  }

  if (renderer.flush) {
    await renderer.flush();
  }
}
