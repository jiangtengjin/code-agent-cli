import type { InteractionEventEmitter } from "../../interaction/emitter.js";
import type { InteractionEvent } from "../../interaction/events.js";
import type { InteractionRenderer } from "../../interaction/renderer-contract.js";
import type { TUIScene } from "../types.js";
import {
  type ShellAction,
  createInteractionEventAction,
  createSceneChangedAction,
} from "./actions.js";
import { reduceShellState } from "./reducer.js";
import { type ShellState, createInitialShellState } from "./state.js";

type ShellStoreListener = (state: ShellState) => void;
type InteractionEventSource = Pick<InteractionEventEmitter, "on">;

export interface ShellStore extends InteractionRenderer {
  getState(): ShellState;
  dispatch(action: ShellAction): ShellState;
  subscribe(listener: ShellStoreListener): () => void;
  navigate(scene: TUIScene): ShellState;
  dispose(): void;
}

export interface CreateShellStoreOptions {
  emitter?: InteractionEventSource;
  initialState?: Partial<ShellState>;
}

class TUIInteractionStore implements ShellStore {
  private state: ShellState;
  private readonly listeners = new Set<ShellStoreListener>();
  private readonly unsubscribeEmitter?: () => void;

  constructor(options: CreateShellStoreOptions = {}) {
    this.state = createInitialShellState(options.initialState);
    this.unsubscribeEmitter = options.emitter?.on((event) => {
      this.render(event);
    });
  }

  getState(): ShellState {
    return this.state;
  }

  dispatch(action: ShellAction): ShellState {
    const nextState = reduceShellState(this.state, action);
    if (nextState !== this.state) {
      this.state = nextState;
      for (const listener of this.listeners) {
        listener(this.state);
      }
    }

    return this.state;
  }

  subscribe(listener: ShellStoreListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  navigate(scene: TUIScene): ShellState {
    return this.dispatch(createSceneChangedAction(scene));
  }

  render(event: InteractionEvent): void {
    this.dispatch(createInteractionEventAction(event));
  }

  dispose(): void {
    this.unsubscribeEmitter?.();
    this.listeners.clear();
  }
}

export function createShellStore(options: CreateShellStoreOptions = {}): ShellStore {
  return new TUIInteractionStore(options);
}
