import {
  CanvasSource,
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  Quality,
  canEncodeVideo,
} from "mediabunny";
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, SRGBColorSpace } from "three";
import { MeshBasicNodeMaterial, WebGPURenderer } from "three/webgpu";
import { texture } from "three/tsl";
import { createVideoFrameSource } from "../../../packages/render/src/sources/video/source";
import { VideoFrameTextureOwner } from "../../../packages/render/src/sources/video/texture";

export async function createVideoFixture(count = 3, width = 64, height = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const quality = new Quality("high");
  const codec = (await canEncodeVideo("avc", { width, height, quality })) ? "avc" : "vp8";
  if (!(await canEncodeVideo(codec, { width, height, quality })))
    throw new Error("No native fixture encoder is available");
  const target = new BufferTarget();
  const output = new Output({
    format: codec === "avc" ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target,
  });
  const source = new CanvasSource(canvas, { codec, quality });
  output.addVideoTrack(source);
  let done = false;
  try {
    await output.start();
    const times =
        count === 3 ? [0, 0.25, 0.75] : Array.from({ length: count }, (_, index) => index / 30),
      durations = count === 3 ? [0.25, 0.5, 0.75] : times.map(() => 1 / 30);
    for (let index = 0; index < times.length; index++) {
      context.fillStyle = ["#e02020", "#20d040", "#2020e0"][index % 3]!;
      context.fillRect(0, 0, width, height);
      await source.add(times[index]!, durations[index]!, {
        keyFrame: count === 3 || index % 60 === 0,
      });
    }
    source.close();
    await output.finalize();
    done = true;
    return {
      blob: new Blob([target.buffer!], { type: codec === "avc" ? "video/mp4" : "video/webm" }),
      codec,
    };
  } finally {
    if (!done) await output.cancel();
  }
}

/** Native witness only. PNG encoding is native; inspection happens on a different unprobed page. */
export async function runVideoSourceWitness(forceWebGL: boolean) {
  const { blob, codec } = await createVideoFixture();
  const source = createVideoFrameSource({
    assetId: "native-fixture",
    contentRevision: `vfr-${codec}-v1`,
    original: blob,
  });
  const owner = new VideoFrameTextureOwner();
  const renderer = new WebGPURenderer({ antialias: false, alpha: true, forceWebGL });
  const material = new MeshBasicNodeMaterial();
  const geometry = new PlaneGeometry(2, 2);
  const scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;
  scene.add(new Mesh(geometry, material));
  const images: string[] = [],
    pts: number[] = [],
    requests: number[] = [];
  let previousTexture: unknown;
  try {
    await renderer.init();
    renderer.setSize(64, 64, false);
    renderer.outputColorSpace = SRGBColorSpace;
    document.body.append(renderer.domElement);
    const backend = renderer.backend as unknown as {
      isWebGPUBackend?: boolean;
      device?: GPUDevice;
      gl?: WebGL2RenderingContext;
    };
    const render = async (lease: NonNullable<Awaited<ReturnType<typeof source.requestFrame>>>) => {
      pts.push(lease.timestamp.value / lease.timestamp.rate);
      await owner.withFrame(lease, async (nativeTexture) => {
        if (nativeTexture !== previousTexture) {
          material.colorNode = texture(nativeTexture).rgb;
          material.needsUpdate = true;
          previousTexture = nativeTexture;
        }
        renderer.render(scene, camera);
        if (backend.device) await backend.device.queue.onSubmittedWorkDone();
        else backend.gl?.finish();
        images.push(renderer.domElement.toDataURL("image/png"));
      });
    };
    const metadata = await source.metadata();
    for (const value of [0, 0.5, 1, 1, 0.5, 0]) {
      const started = performance.now();
      const lease = await source.requestFrame({ value: value * 100, rate: 100 });
      requests.push(performance.now() - started);
      if (!lease) throw new Error(`Expected native frame at ${value}`);
      await render(lease);
    }
    for await (const lease of source.samples([
      { value: 0, rate: 1 },
      { value: 1, rate: 2 },
      { value: 1, rate: 1 },
    ])) {
      if (!lease) throw new Error("Exact original-source iterator returned no frame");
      await render(lease);
    }
    const before = await source.requestFrame({ value: -1, rate: 10 });
    const end = await source.requestFrame({ value: 3, rate: 2 });
    before?.release();
    end?.release();
    const adapter = await navigator.gpu?.requestAdapter();
    const info = adapter?.info;
    await owner.dispose();
    await source.dispose();
    return {
      codec,
      bytes: blob.size,
      metadata,
      pts,
      requests,
      images,
      beforeFirstNull: before === null,
      exclusiveEndNull: end === null,
      backend: backend.isWebGPUBackend ? "webgpu" : "webgl",
      adapter: info
        ? {
            vendor: info.vendor,
            architecture: info.architecture,
            device: info.device,
            description: info.description,
          }
        : null,
      stats: source.stats(),
      browser: navigator.userAgent,
      readbacks: {
        ...(window as unknown as { __musartVideoReadbacks: object }).__musartVideoReadbacks,
      },
      nativeResources: {
        ...(window as unknown as { __musartNativeVideo: object }).__musartNativeVideo,
      },
    };
  } finally {
    await owner.dispose();
    await source.dispose();
    geometry.dispose();
    material.dispose();
    await renderer.dispose();
    renderer.domElement.remove();
  }
}
