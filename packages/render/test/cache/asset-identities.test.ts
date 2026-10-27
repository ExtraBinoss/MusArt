import { expect, it } from "vitest";
import type { Asset } from "@musart/core";
import { AssetIdentities } from "../../src/cache/asset-identities";
const asset = (id: string, dataUrl: string): Asset => ({
  id,
  dataUrl,
  name: id,
  mime: "image/png",
  width: 1,
  height: 1,
});
it("shares content tokens and preserves oversized originals across equivalent live clones", () => {
  const identities = new AssetIdentities({ maxBytes: 64 }),
    original = asset("oversized", "x".repeat(1000));
  const token = identities.identity(original),
    clone = { ...original };
  expect(identities.identity(clone)).toBe(token);
  expect(identities.identity({ ...clone })).toBe(token);
  expect(identities.stats()).toMatchObject({
    retainedBytes: 0,
    retainedContents: 0,
    candidateKeys: 1,
    candidateReferences: 1,
  });
  expect(identities.identity(undefined)).toBe("missing");
  const other = asset("small", "abc");
  expect(identities.identity({ ...other, id: "alias" })).toBe(identities.identity(other));
});
it("never aliases colliding project IDs or stale tokens after mutating the original content", () => {
  const identities = new AssetIdentities({ maxBytes: 1 }),
    a = asset("shared-id", "original"),
    b = asset("shared-id", "different");
  const first = identities.identity(a),
    second = identities.identity(b);
  expect(first).not.toBe(second);
  expect(identities.identity({ ...a })).toBe(first);
  expect(identities.identity({ ...b })).toBe(second);
  a.dataUrl = "mutated";
  const mutated = identities.identity(a);
  expect(mutated).not.toBe(first);
  expect(mutated).not.toBe(second);
  expect(identities.identity({ ...a })).toBe(mutated);
  b.dataUrl = "not-yet-memoized";
  expect(identities.identity(asset(b.id, b.dataUrl))).not.toBe(second);
});
it("refreshes weak representatives on clone hits and drops dead candidates without retaining originals", () => {
  const references: { value: Asset | undefined }[] = [];
  const identities = new AssetIdentities({
    maxBytes: 1,
    reference: (value) => {
      const holder = { value };
      references.push(holder);
      return { deref: () => holder.value };
    },
  });
  const original = asset("same", "large-original"),
    token = identities.identity(original),
    clone = { ...original };
  expect(identities.identity(clone)).toBe(token);
  references[0]!.value = undefined; // original's representative can disappear; latest clone remains
  expect(identities.identity({ ...clone })).toBe(token);
  for (const reference of references) reference.value = undefined;
  const replacement = identities.identity({ ...clone });
  expect(replacement).not.toBe(token); // safe cache miss once every representative is gone
  expect(identities.stats().candidateReferences).toBe(1);
});
it("bounds keys, competing same-ID contents, retained bytes and metadata identifier length", () => {
  const identities = new AssetIdentities({
    maxEntries: 2,
    maxBytes: 64,
    maxCandidateKeys: 2,
    maxCandidatesPerKey: 2,
  });
  const originals = Array.from({ length: 20 }, (_, index) =>
    asset(`id-${index % 3}`, `content-${index}`),
  );
  for (const original of originals) identities.identity(original);
  expect(identities.stats().candidateKeys).toBe(2);
  expect(identities.stats().candidateReferences).toBeLessThanOrEqual(4);
  expect(identities.stats().retainedBytes).toBeLessThanOrEqual(64);
  expect(identities.stats().retainedContents).toBeLessThanOrEqual(2);
  identities.identity(asset("x".repeat(300), "large".repeat(1000)));
  expect(identities.stats().candidateKeys).toBe(2);
  for (const options of [
    { maxCandidateKeys: 0 },
    { maxCandidatesPerKey: Infinity },
    { maxCandidatesPerKey: 1.5 },
    { maxBytes: 0 },
  ])
    expect(() => new AssetIdentities(options)).toThrow(RangeError);
});
