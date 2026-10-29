import {
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGPURenderer,
} from "three/webgpu";
import {
  clamp,
  mx_cell_noise_float,
  mx_fractal_noise_float,
  mx_noise_float,
  mx_worley_noise_float_3d,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

/** Validation-only direct upstream operators. Never import MusArt's noise builders here. */
export interface NoisePrimaryOptions {
  algorithm: "perlin" | "cell" | "worley" | "fbm";
  forceWebGL: boolean;
}
declare global {
  interface Window {
    __noisePrimaryReference?: (
      options: NoisePrimaryOptions,
    ) => Promise<{ dataUrl: string; backend: string }>;
    __disposeNoisePrimary?: () => Promise<void>;
  }
}
let owner: {
  renderer: WebGPURenderer;
  geometry: PlaneGeometry;
  scene: Scene;
  camera: OrthographicCamera;
  forceWebGL: boolean;
} | null = null;
window.__disposeNoisePrimary = async () => {
  if (!owner) return;
  const current = owner;
  owner = null;
  current.scene.clear();
  current.geometry.dispose();
  await current.renderer.dispose();
};
window.__noisePrimaryReference = async ({ algorithm, forceWebGL }) => {
  if (owner?.forceWebGL !== forceWebGL) await window.__disposeNoisePrimary!();
  if (!owner) {
    const renderer = new WebGPURenderer({ alpha: true, antialias: false, forceWebGL });
    await renderer.init();
    renderer.setPixelRatio(1);
    renderer.setSize(128, 128, false);
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    owner = {
      renderer,
      geometry: new PlaneGeometry(2, 2),
      scene: new Scene(),
      camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
      forceWebGL,
    };
  }
  const p = vec3(vec2(uv().x, uv().y.oneMinus()).mul(128 / 16), 0.375);
  // These four primitives are directly defined by Three r186/MaterialX. fBm's
  // upstream raw signed sum is normalized independently from our octave loop.
  const fields = {
    perlin: mx_noise_float(p).mul(0.5).add(0.5),
    cell: mx_cell_noise_float(p),
    worley: mx_worley_noise_float_3d(p, 1),
    fbm: mx_fractal_noise_float(p, 4, 2, 0.5).div(1.875).mul(0.5).add(0.5),
  };
  if (!Object.hasOwn(fields, algorithm)) throw Error("Unknown primary noise reference.");
  const material = new MeshBasicNodeMaterial({
    transparent: false,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  material.fragmentNode = vec4(vec3(clamp(fields[algorithm], 0, 1)), 1);
  const mesh = new Mesh(owner.geometry, material);
  owner.scene.add(mesh);
  try {
    await owner.renderer.compileAsync(owner.scene, owner.camera);
    owner.renderer.render(owner.scene, owner.camera);
    // Same-task native snapshot, including WebGL's non-preserved framebuffer.
    return {
      dataUrl: owner.renderer.domElement.toDataURL("image/png"),
      backend:
        "isWebGLBackend" in owner.renderer.backend && owner.renderer.backend.isWebGLBackend
          ? "webgl"
          : "webgpu",
    };
  } finally {
    owner.scene.remove(mesh);
    material.dispose();
  }
};
