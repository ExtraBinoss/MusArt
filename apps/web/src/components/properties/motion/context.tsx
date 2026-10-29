import { createContext, useContext, type ReactNode } from "react";
import type { MotionEditTarget } from "../../../state/session/motion-edit";

export interface MotionFieldEditor {
  begin(this: void, target?: MotionEditTarget): void;
  start?(this: void, target?: MotionEditTarget): void;
}
const MotionEditing = createContext<MotionFieldEditor | null>(null);

export function MotionFieldProvider({
  editor,
  children,
}: {
  editor: MotionFieldEditor;
  children: ReactNode;
}) {
  return <MotionEditing.Provider value={editor}>{children}</MotionEditing.Provider>;
}
export function useMotionFieldEditor() {
  return useContext(MotionEditing);
}
