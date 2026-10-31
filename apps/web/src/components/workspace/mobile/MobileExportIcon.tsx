import type { EnginePort } from "@musart/core";
import { Download, LoaderCircle, TriangleAlert } from "lucide-react";
import { useExportJob } from "../../export/use-export-job";
export function MobileExportIcon({ engine }: { engine: EnginePort }) {
  const { jobs, job } = useExportJob(engine);
  return (
    <span className="mobile-export-icon">
      {jobs.pending ? (
        <LoaderCircle size={20} className="animate-spin" />
      ) : job?.status === "failed" ? (
        <TriangleAlert size={20} />
      ) : (
        <Download size={20} strokeWidth={1.6} />
      )}
      {jobs.pending && job && (
        <>
          <small>{job.percent}%</small>
          <span className="mobile-export-track">
            <span style={{ width: `${job.percent}%` }} />
          </span>
        </>
      )}
    </span>
  );
}
