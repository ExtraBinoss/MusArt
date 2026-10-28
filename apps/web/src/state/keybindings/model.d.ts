import type { EffectType } from "@musart/core";
import type { SearchAction } from "../../components/search/catalog/model";

export type NudgeDirection = "Left" | "Right" | "Up" | "Down";
export type CommandId =
  | `action:${SearchAction}`
  | `effect:${EffectType}`
  | "app:search"
  | `nudge:${NudgeDirection}`
  | `nudge:${NudgeDirection}Large`;
/** Mod means Ctrl on Windows/Linux and Command on macOS; persisted values stay portable. */
export interface KeyChord {
  readonly key: string;
  readonly mod: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}
export type BindingOverrides = Readonly<Partial<Record<CommandId, readonly KeyChord[]>>>;
export interface BindingSnapshot {
  readonly overrides: BindingOverrides;
  readonly bindings: ReadonlyMap<CommandId, readonly KeyChord[]>;
}
