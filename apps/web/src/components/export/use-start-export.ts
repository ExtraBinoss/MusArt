import { getExportJobs, type ExportKind } from "../../services/export/jobs";
import { backgroundExportGate } from "../../services/export/background";
import type { ExportPaneProps } from "./workspace-model";
export function useStartExport(
  { engine, origin, page }: Pick<ExportPaneProps, "engine" | "origin" | "page">,
  kind: ExportKind,
) {
  return (
    task: (work: {
      signal: AbortSignal;
      progress: (fraction: number) => void;
      beforeFrame: () => Promise<void>;
    }) => Promise<void>,
  ) => {
    getExportJobs(engine).start(
      { kind, projectId: origin.project.id, name: page.name },
      async ({ signal, progress }) => {
        const gate = backgroundExportGate(signal);
        try {
          await task({ signal, progress, beforeFrame: gate.beforeFrame });
        } finally {
          gate.dispose();
        }
      },
    );
  };
}
