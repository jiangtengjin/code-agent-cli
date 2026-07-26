import type { InteractionEvent, InteractionEventOfType, InteractionEventType } from "./events.js";

export type InteractionEventListener = (event: InteractionEvent) => void;

export class InteractionEventEmitter {
  private readonly listeners = new Set<InteractionEventListener>();
  private readonly listenersByType = new Map<InteractionEventType, Set<InteractionEventListener>>();

  emit<TEvent extends InteractionEvent>(event: TEvent): TEvent {
    for (const listener of this.listeners) {
      listener(event);
    }

    const typedListeners = this.listenersByType.get(event.type);
    if (typedListeners) {
      for (const listener of typedListeners) {
        listener(event);
      }
    }

    return event;
  }

  on(listener: InteractionEventListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  onType<TType extends InteractionEventType>(
    type: TType,
    listener: (event: InteractionEventOfType<TType>) => void,
  ): () => void {
    const typedListener = listener as InteractionEventListener;
    const bucket = this.listenersByType.get(type) ?? new Set<InteractionEventListener>();
    bucket.add(typedListener);
    this.listenersByType.set(type, bucket);

    return () => {
      const current = this.listenersByType.get(type);
      if (!current) {
        return;
      }

      current.delete(typedListener);
      if (current.size === 0) {
        this.listenersByType.delete(type);
      }
    };
  }
}
