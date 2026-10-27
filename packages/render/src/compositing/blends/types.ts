import type { Node } from "three/webgpu";
export type RGB = Node<"vec3">;
export type BlendFunction = (backdrop: RGB, source: RGB) => RGB;
