import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** A recycled card retains its Radix shell, never another attachment's open editor or focus. */
export function usePopoverOwner(owner: string) {
  const current = useRef<string | null>(owner);
  const [state, setState] = useState<{ owner: string; open: boolean } | null>(null);
  useLayoutEffect(() => {
    current.current = owner;
    return () => {
      current.current = null;
    };
  }, [owner]);
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (current.current !== owner) return false;
      setState({ owner, open });
      return true;
    },
    [owner],
  );
  const onCloseAutoFocus = useCallback(
    (event: { preventDefault(): void }) => {
      if (current.current !== owner || state?.owner !== owner) event.preventDefault();
    },
    [owner, state?.owner],
  );
  return { open: state?.owner === owner && state.open, onOpenChange, onCloseAutoFocus };
}
