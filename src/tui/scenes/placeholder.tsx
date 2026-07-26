import { Text } from "ink";
import type { TUIScene } from "../types.js";

const SCENE_LABELS: Record<Exclude<TUIScene, "home">, string> = {
  chat: "Chat",
  approvals: "Approvals",
  resume: "Resume",
  review: "Review",
  settings: "Settings",
  mcp: "MCP",
  tasks: "Tasks",
};

export function PlaceholderScene(props: { scene: Exclude<TUIScene, "home"> }) {
  return <Text>{SCENE_LABELS[props.scene]} scene bootstrap pending</Text>;
}
