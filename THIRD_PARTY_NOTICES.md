# Third-party notices

The MIT license at the repository root covers MusArt's original source code. It does not replace licenses attached to dependencies, fonts, model weights, or sample photographs.

| Material                | Origin                                                                                                                      | License / notice                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI primitives           | [shadcn/ui](https://github.com/shadcn-ui/ui), official `new-york-v4` registry; [Radix](https://www.radix-ui.com/)           | MIT; source URLs in each copied component; [shadcn notice](docs/legal/shadcn-MIT.txt)                                                                   |
| Dither reference        | Plinka / React-Beautiful-Gradient                                                                                           | MIT; [preserved notice](docs/legal/plinka-gradient-MIT.txt); shader logic rewritten as TSL                                                              |
| Fonts                   | Inter and Space Grotesk through Fontsource                                                                                  | SIL Open Font License; [Inter](docs/legal/inter-OFL.txt), [Space Grotesk](docs/legal/space-grotesk-OFL.txt)                                             |
| Segmentation weights    | [Xenova/slimsam-77-uniform](https://huggingface.co/Xenova/slimsam-77-uniform), pinned revision in the implementation        | Apache-2.0; model card and upstream notices apply; downloaded on demand                                                                                 |
| Model runtime           | [Transformers.js](https://github.com/huggingface/transformers.js), [ONNX Runtime](https://github.com/microsoft/onnxruntime) | Apache-2.0 / MIT respectively; dependency licenses retained in their packages                                                                           |
| Performance photographs | [Unsplash](https://unsplash.com/license)                                                                                    | Unsplash License; [local attribution](apps/web/public/benchmark/ATTRIBUTION.md) and [source/checksum manifest](apps/web/public/benchmark/manifest.json) |

The original SVG demonstration artwork is implemented in `apps/web/src/services/projects/demo.ts`. Other dependency versions and their upstream license metadata are recorded in `package.json` and `bun.lock`.

References to Meta and Cerebral Valley describe the hackathon this independent project is being developed for. They do not imply official product status, sponsorship of MusArt, endorsement, or a prize award.
