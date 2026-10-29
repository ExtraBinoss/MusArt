import { useMemo, type ComponentProps } from "react";
import { useEngineValue } from "../../state/session/editor";
import { Rulers } from "./Rulers";

/** Ruler visibility updates independently of the canvas geometry and selection subscribers. */
export function CanvasRulers(props: ComponentProps<typeof Rulers>) {
  const rulers = useEngineValue(props.engine, (snapshot) =>
    Boolean(snapshot.project.pages.find((page) => page.id === snapshot.pageId)?.rulers),
  );
  const page = useMemo(() => ({ ...props.page, rulers }), [props.page, rulers]);
  return <Rulers {...props} page={page} />;
}
