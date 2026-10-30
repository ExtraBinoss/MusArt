import {
  compileMotion,
  createLayer,
  createPage,
  createProject,
  createMotionEasingPreset,
  EditorEngine,
  type TransitionStyle,
} from "@musart/core";

/** A tiny isolated authored scene uses the same validated transition command as the editor. */
export function createTransitionPreviewDocument(
  style: TransitionStyle,
  placement: "in" | "out",
  duration: number,
) {
  if (!Number.isSafeInteger(duration) || duration < 1)
    throw new RangeError("Invalid transition preview duration.");
  const group = createLayer("group", {
    id: "preview-subject",
    x: 16,
    y: 12,
    width: 160,
    height: 88,
  });
  const engine = new EditorEngine(
    createProject({
      id: "transition-preview",
      pages: [
        createPage({
          id: "preview",
          width: 192,
          height: 112,
          background: "#20232b",
          layers: [
            group,
            createLayer("rectangle", {
              id: "preview-paper",
              parentId: group.id,
              x: 0,
              y: 0,
              width: 160,
              height: 88,
              fill: "#ece5d4",
            }),
            createLayer("ellipse", {
              id: "preview-circle",
              parentId: group.id,
              x: 48,
              y: 12,
              width: 64,
              height: 64,
              fill: "#cf785e",
            }),
          ],
        }),
      ],
    }),
  );
  engine.transaction([
    { type: "setCompositionMode", mode: "motion" },
    { type: "setMotionDuration", duration: { value: duration, rate: 1000 } },
    {
      type: "applyMotionTransition",
      layerId: group.id,
      style,
      placement,
      duration: { value: duration, rate: 1000 },
      easing: createMotionEasingPreset("easeInOut"),
    },
  ]);
  return compileMotion(engine.getSnapshot().project, { compositionId: "preview" });
}
