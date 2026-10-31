import { useAtom, type PrimitiveAtom } from "jotai";
import { PreferencesDialog } from "./PreferencesDialog";

/** Modal state is subscribed here, never by the project/template grid. */
export function PreferencesHost({ state }: { state: PrimitiveAtom<boolean> }) {
  const [open, setOpen] = useAtom(state);
  return <PreferencesDialog open={open} onClose={() => setOpen(false)} />;
}
