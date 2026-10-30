import {
  assetOriginalIdentity,
  isOriginalMediaAsset,
  createLayerGeometryIndex,
  type Asset,
  type Composition,
  type Layer,
} from "@musart/core";

interface AssetState {
  token: number;
  data: unknown;
  width: number | undefined;
  height: number | undefined;
  mime: string;
}
function assetData(asset: Asset): unknown {
  if (isOriginalMediaAsset(asset)) return assetOriginalIdentity(asset);
  const descriptor = Object.getOwnPropertyDescriptor(asset, "dataUrl");
  if (!descriptor) return undefined;
  // Compare an opaque accessor's identity without calling or binding the original getter.
  return "value" in descriptor ? descriptor.value : Reflect.get(descriptor, "get");
}

/** Exact, bounded paint interning; original image bytes never enter a signature. */
export class SelectionPreviewIdentity {
  private readonly layers = new WeakMap<Layer, number>();
  private readonly frozen = new WeakSet<object>();
  private readonly assets = new WeakMap<Asset, AssetState>();
  private readonly assetAliases = new Map<string, WeakRef<Asset>[]>();
  private readonly order = new WeakMap<Composition, Map<string, number>>();
  private readonly paints = new Map<string, number>();
  private bytes = 0;
  private sequence = 0;

  private immutable(value: object): boolean {
    if (this.frozen.has(value)) return true;
    if (!Object.isFrozen(value)) return false;
    for (const child of Object.values(value))
      if (child && typeof child === "object" && !this.immutable(child)) return false;
    this.frozen.add(value);
    return true;
  }

  private paint(layer: Layer): number {
    const immutable = this.immutable(layer);
    const cached = immutable ? this.layers.get(layer) : undefined;
    if (cached !== undefined) return cached;
    const {
      id: _id,
      name: _name,
      parentId: _parentId,
      locked: _locked,
      guides: _guides,
      margin: _margin,
      padding: _padding,
      ...paint
    } = layer;
    const key = JSON.stringify(paint);
    let token = this.paints.get(key);
    if (token === undefined) token = ++this.sequence;
    else {
      this.paints.delete(key);
      this.bytes -= key.length * 2;
    }
    if (key.length * 2 <= 1024 * 1024) {
      this.paints.set(key, token);
      this.bytes += key.length * 2;
      while (this.paints.size > 1024 || this.bytes > 1024 * 1024) {
        const oldest = this.paints.keys().next().value!;
        this.paints.delete(oldest);
        this.bytes -= oldest.length * 2;
      }
    }
    if (immutable) this.layers.set(layer, token);
    return token;
  }

  private asset(asset: Asset | undefined): number {
    if (!asset) return 0;
    const data = assetData(asset),
      cached = this.assets.get(asset),
      matches = (state: AssetState | undefined, value: Asset, bytes: unknown) =>
        state &&
        state.data === bytes &&
        state.width === value.width &&
        state.height === value.height &&
        state.mime === value.mime;
    if (matches(cached, asset, data)) return cached!.token;
    const candidates = asset.id.length <= 256 ? (this.assetAliases.get(asset.id) ?? []) : [];
    let token: number | undefined;
    for (const reference of typeof data === "string" ? candidates : []) {
      const original = reference.deref();
      if (!original) continue;
      const previous = this.assets.get(original),
        oldData = assetData(original);
      if (matches(previous, original, oldData) && matches(previous, asset, data)) {
        token = previous!.token;
        break;
      }
    }
    token ??= ++this.sequence;
    this.assets.set(asset, {
      token,
      data,
      width: asset.width,
      height: asset.height,
      mime: asset.mime,
    });
    if (asset.id.length <= 256) {
      this.assetAliases.delete(asset.id);
      this.assetAliases.set(
        asset.id,
        [
          new WeakRef(asset),
          ...candidates.filter((item) => item.deref() && item.deref() !== asset),
        ].slice(0, 4),
      );
      if (this.assetAliases.size > 256)
        this.assetAliases.delete(this.assetAliases.keys().next().value!);
    }
    return token;
  }

  /** Match selected export dependencies: subtrees, processing ancestors and complete enabled masks. */
  read(
    page: Composition,
    assets: Record<string, Asset>,
    ids: readonly string[],
    options: { includeDisabledMasks?: boolean } = {},
  ): string {
    const geometry = createLayerGeometryIndex(page);
    let order = this.order.get(page);
    if (!order) {
      order = new Map(page.layers.map((layer, at) => [layer.id, at]));
      if (
        Object.isFrozen(page) &&
        Object.isFrozen(page.layers) &&
        page.layers.every((layer) => Object.isFrozen(layer))
      )
        this.order.set(page, order);
    }
    const included = new Set<string>(),
      expanded = new Set<string>(),
      paths = new Set<string>(),
      pending: { id: string; subtree: boolean }[] = [];
    function path(id: string) {
      let current: string | null = id;
      while (current && !paths.has(current)) {
        paths.add(current);
        pending.push({ id: current, subtree: false });
        current = geometry.get(current).parentId;
      }
    }
    for (const id of ids) {
      if (!geometry.byId.has(id)) throw new Error("Preview layer is missing.");
      path(id);
      pending.push({ id, subtree: true });
    }
    while (pending.length) {
      const { id, subtree } = pending.pop()!,
        layer = geometry.get(id);
      if (!included.has(id)) {
        included.add(id);
        if (
          layer.mask &&
          (layer.mask.enabled || options.includeDisabledMasks) &&
          layer.mask.layerId
        ) {
          path(layer.mask.layerId);
          pending.push({ id: layer.mask.layerId, subtree: true });
        }
      }
      if (subtree && !expanded.has(id)) {
        expanded.add(id);
        for (const child of geometry.children(id)) pending.push({ id: child.id, subtree: true });
      }
    }
    const nodes = [...included].sort((a, b) => order!.get(a)! - order!.get(b)!);
    return JSON.stringify([
      page.colorSpace ?? "srgb",
      [...ids].sort(),
      nodes.map((id) => {
        const layer = geometry.get(id);
        return [
          id,
          layer.parentId,
          this.paint(layer),
          this.asset(layer.assetId ? assets[layer.assetId] : undefined),
          this.asset(
            layer.mask && (layer.mask.enabled || options.includeDisabledMasks) && layer.mask.assetId
              ? assets[layer.mask.assetId]
              : undefined,
          ),
        ];
      }),
    ]);
  }
}
