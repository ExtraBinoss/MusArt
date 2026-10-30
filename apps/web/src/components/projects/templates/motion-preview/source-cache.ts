import { compileMotion, type Project, type MotionProgram } from "@musart/core";
import type { PreparedMotionTemplate } from "../../../../services/projects/templates/motion/loader";
import type { MotionTemplateId } from "../../../../services/projects/templates/motion/model";

interface Entry {
  source: PreparedMotionTemplate;
  serialized: string;
  bytes: number;
  programs: Map<string, MotionProgram>;
}
/** Exact content comparison retains geometry identity after a fresh validated saved-project read.
 * Templates are immutable build assets. Failures/aborted preparation never enter this LRU.
 * The budget conservatively charges serialized text plus document objects, alongside original blobs. */
export class PreviewSourceCache {
  private readonly entries = new Map<string, Entry>();
  private bytes = 0;
  private generation = 0;
  constructor(private readonly maxBytes = 32 * 1024 * 1024) {}
  clear(): void {
    this.generation++;
    this.entries.clear();
    this.bytes = 0;
  }
  async template(
    id: MotionTemplateId,
    signal: AbortSignal,
    prepare: () => Promise<PreparedMotionTemplate>,
  ): Promise<PreparedMotionTemplate> {
    signal.throwIfAborted();
    const key = `template:${id}`,
      cached = this.touch(key);
    if (cached) return cached.source;
    const generation = this.generation;
    const source = await prepare();
    signal.throwIfAborted();
    if (generation === this.generation) this.put(key, source, JSON.stringify(source.project));
    return source;
  }
  retain(project: Project): Project {
    if ([...this.entries.values()].some((entry) => entry.source.project === project))
      return project;
    const key = `project:${project.id}`,
      cached = this.touch(key);
    if (cached?.source.project === project) return project;
    const serialized = JSON.stringify(project);
    if (cached?.serialized === serialized) return cached.source.project;
    this.put(key, { project, originals: [] }, serialized);
    return project;
  }
  compile(project: Project, compositionId: string): MotionProgram {
    const entry = [...this.entries.values()].find((item) => item.source.project === project);
    const cached = entry?.programs.get(compositionId);
    if (cached) return cached;
    const program = compileMotion(project, { compositionId });
    // One prepared artboard per retained document. Compilation owns a frozen geometry copy.
    if (entry) {
      entry.programs.clear();
      entry.programs.set(compositionId, program);
    }
    return program;
  }
  private touch(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }
  private put(key: string, source: PreparedMotionTemplate, serialized: string) {
    const old = this.entries.get(key);
    if (old) {
      this.entries.delete(key);
      this.bytes -= old.bytes;
    }
    const bytes =
      serialized.length * 10 + source.originals.reduce((n, item) => n + item.blob.size, 0);
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { source, serialized, bytes, programs: new Map() });
    this.bytes += bytes;
    while (this.entries.size > 4 || this.bytes > this.maxBytes) {
      const [oldest, entry] = this.entries.entries().next().value!;
      this.entries.delete(oldest);
      this.bytes -= entry.bytes;
    }
  }
}
