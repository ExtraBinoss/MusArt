import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Undefined keeps the panel's own header; null is a sheet whose header ref is still attaching. */
export const PanelHeaderTarget = createContext<HTMLElement | null | undefined>(undefined);

/** Preserve the panel's existing action owners and subscriptions when presenting them in a sheet. */
export function PanelHeaderActions({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const target = useContext(PanelHeaderTarget);
  return target === undefined ? fallback : target ? createPortal(children, target) : null;
}
