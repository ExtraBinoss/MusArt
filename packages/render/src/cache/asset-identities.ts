import type { Asset } from "@musart/core";
import { SourceIdentities } from "./source-identities";
interface Identity {
  readonly dataUrl: string;
  readonly id: string;
}
interface Candidate {
  readonly reference: { deref(): Asset | undefined };
  readonly id: string;
}
interface Options {
  maxEntries?: number;
  maxBytes?: number;
  maxCandidateKeys?: number;
  maxCandidatesPerKey?: number;
  reference?: (asset: Asset) => Candidate["reference"];
}
/** Content deduplication is byte-bounded; live oversized originals survive equivalent object clones. */
export class AssetIdentities {
  private readonly contents: SourceIdentities;
  private readonly live = new WeakMap<Asset, Identity>();
  private readonly candidates = new Map<string, Candidate[]>();
  private readonly keyLimit: number;
  private readonly candidateLimit: number;
  private readonly reference: (asset: Asset) => Candidate["reference"];
  constructor(options: Options = {}) {
    this.contents = new SourceIdentities(
      options.maxEntries ?? 128,
      options.maxBytes ?? 16 * 1024 * 1024,
    );
    this.keyLimit = options.maxCandidateKeys ?? 128;
    this.candidateLimit = options.maxCandidatesPerKey ?? 4;
    if (
      ![this.keyLimit, this.candidateLimit].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      )
    )
      throw new RangeError("Invalid weak asset identity budget.");
    this.reference = options.reference ?? ((asset) => new WeakRef(asset));
  }
  private remember(asset: Asset, id: string): void {
    // Valid document IDs are short. Never retain an unbounded caller-supplied ID.
    if (asset.id.length > 256) return;
    const previous = this.candidates.get(asset.id) ?? [];
    const survivors = previous.filter(
      (candidate) => candidate.id !== id && candidate.reference.deref() !== undefined,
    );
    this.candidates.delete(asset.id);
    this.candidates.set(
      asset.id,
      [{ reference: this.reference(asset), id }, ...survivors].slice(0, this.candidateLimit),
    );
    while (this.candidates.size > this.keyLimit)
      this.candidates.delete(this.candidates.keys().next().value!);
  }
  identity(asset: Asset | undefined): string {
    if (!asset) return "missing";
    const cached = this.live.get(asset);
    if (cached?.dataUrl === asset.dataUrl) {
      this.remember(asset, cached.id);
      return cached.id;
    }
    const candidates = asset.id.length <= 256 ? this.candidates.get(asset.id) : undefined;
    let id: string | undefined;
    for (const candidate of candidates ?? []) {
      const original = candidate.reference.deref();
      if (!original) continue;
      const previous = this.live.get(original);
      // Verify both current content and its memoized identity: mutable external assets
      // must not donate an old token after changing their dataUrl.
      if (previous?.dataUrl === original.dataUrl && original.dataUrl === asset.dataUrl) {
        id = previous.id;
        break;
      }
    }
    id ??= this.contents.intern(asset.dataUrl);
    this.live.set(asset, { dataUrl: asset.dataUrl, id });
    this.remember(asset, id);
    return id;
  }
  stats() {
    const content = this.contents.stats();
    return {
      retainedBytes: content.bytes,
      retainedContents: content.entries,
      candidateKeys: this.candidates.size,
      candidateReferences: [...this.candidates.values()].reduce(
        (sum, entries) => sum + entries.length,
        0,
      ),
    };
  }
}
