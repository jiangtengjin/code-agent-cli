import { Text } from "ink";
import { SCENE_LABELS } from "../shell/router.js";
import type { TUIScene } from "../types.js";

export function PlaceholderScene(props: { scene: Exclude<TUIScene, "home"> }) {
  return <Text>{SCENE_LABELS[props.scene]} scene bootstrap pending</Text>;
}
