import { useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";
import { getExportJobs } from "../../services/export/jobs";
export function useExportJob(engine: EnginePort) {
  const jobs = getExportJobs(engine);
  return { jobs, job: useSyncExternalStore(jobs.subscribe, jobs.read, jobs.read) };
}
