import { useLayoutEffect, type ReactNode } from "react";
import { getUiPresentation } from "../../../state/session/ui-presentation";
/** Mount inside the actual overlay content: a closed Radix shell owns no lease. */
export function PresentationBoundary({
  children,
  surface = window,
}: {
  children?: ReactNode;
  surface?: Window;
}) {
  useLayoutEffect(() => getUiPresentation(surface).hold(), [surface]);
  return children;
}
