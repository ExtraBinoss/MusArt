import type { ReactNode, SyntheticEvent } from "react";

/** Retain shown controls without changing inherited styles while their model catches up. */
export function InspectorInteractionBoundary({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  function guard(event: SyntheticEvent) {
    if (!busy) return;
    event.preventDefault();
    event.stopPropagation();
  }
  return (
    <div
      className="inspector-selection-boundary"
      aria-busy={busy}
      onPointerDownCapture={guard}
      onPointerUpCapture={guard}
      onClickCapture={guard}
      onKeyDownCapture={guard}
      onKeyUpCapture={guard}
      onBeforeInputCapture={guard}
      onChangeCapture={guard}
      onContextMenuCapture={guard}
      onBlurCapture={guard}
      onFocusCapture={(event) => {
        if (!busy) return;
        guard(event);
        if (event.target instanceof HTMLElement) event.target.blur();
      }}
    >
      {children}
    </div>
  );
}
