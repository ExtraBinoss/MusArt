import { cloneElement, isValidElement, useLayoutEffect, type ReactNode } from "react";
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

/** Preserve the genuine Radix asChild element/ref while gating only its mounted children. */
export function withPresentationBoundary(children: ReactNode, asChild?: boolean): ReactNode {
  return asChild && isValidElement<{ children?: ReactNode }>(children) ? (
    cloneElement(
      children,
      undefined,
      <PresentationBoundary>{children.props.children}</PresentationBoundary>,
    )
  ) : (
    <PresentationBoundary>{children}</PresentationBoundary>
  );
}
