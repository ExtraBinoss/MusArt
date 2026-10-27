import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type Asset,
  type EffectType,
} from "@musart/core";
import manifest from "../../../public/benchmark/manifest.json";
import { readDataUrl } from "../assets/imports";
export type FixtureLoader = (path: string) => Promise<string>;
export async function loadFixtureImage(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Photo de test indisponible: ${path}`);
  return readDataUrl(await response.blob());
}
/** Fixed, offline-capable 50-image contact sheet. No random scene or remote URL is used. */
export async function createPerformanceProject(
  count = 50,
  loader: FixtureLoader = loadFixtureImage,
) {
  if (!Number.isInteger(count) || count < 1 || count > 50)
    throw new Error("La scène de charge accepte 1 à 50 images.");
  const assets: Record<string, Asset> = {};
  const images = manifest.images.slice(0, count);
  for (let offset = 0; offset < images.length; offset += 5) {
    await Promise.all(
      images.slice(offset, offset + 5).map(async (image, index) => {
        const number = offset + index;
        const id = `stress-asset-${number}`;
        assets[id] = {
          id,
          name: image.file,
          mime: "image/jpeg",
          width: image.width,
          height: image.height,
          dataUrl: await loader(`/benchmark/${image.file}`),
        };
      }),
    );
  }
  const maskSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="165"><rect width="220" height="165" rx="24" fill="white"/></svg>';
  assets["stress-mask"] = {
    id: "stress-mask",
    name: "Masque arrondi",
    mime: "image/svg+xml",
    width: 220,
    height: 165,
    dataUrl: `data:image/svg+xml;base64,${btoa(maskSvg)}`,
  };
  const groups = Array.from({ length: Math.ceil(count / 10) }, (_, index) =>
    createLayer("group", {
      id: `stress-group-${index}`,
      name: `Série ${index + 1}`,
      x: 48,
      y: 235 + index * 222,
      width: 2304,
      height: 200,
    }),
  );
  const effectTypes: EffectType[] = [
    "dither",
    "ascii",
    "brightness",
    "contrast",
    "grayscale",
    "blur",
  ];
  const photos = images.map((image, index) =>
    createLayer("image", {
      id: `stress-image-${index}`,
      name: `${String(index + 1).padStart(2, "0")} — ${manifest.photos[image.photo]!.name}`,
      assetId: `stress-asset-${index}`,
      parentId: groups[Math.floor(index / 10)]!.id,
      x: (index % 10) * 230,
      y: 0,
      width: 220,
      height: 165,
      rotation: index % 9 === 0 ? 2 : 0,
      opacity: index % 13 === 0 ? 0.85 : 1,
      blendMode: index % 11 === 0 ? "multiply" : "normal",
      mask: index % 5 === 0 ? { assetId: "stress-mask", enabled: true, inverted: false } : null,
      effects: [
        createEffect(effectTypes[index % effectTypes.length]!, {
          id: `stress-fx-${index}-1`,
          amount: effectTypes[index % effectTypes.length] === "brightness" ? 0.55 : 0.75,
          scale: 5 + (index % 5),
          levels: 4,
          color: index % 2 === 0,
        }),
        createEffect("contrast", { id: `stress-fx-${index}-2`, amount: 0.56 }),
      ],
    }),
  );
  const labels = images.map((_, index) =>
    createLayer("text", {
      id: `stress-label-${index}`,
      name: `Légende ${index + 1}`,
      parentId: groups[Math.floor(index / 10)]!.id,
      x: (index % 10) * 230,
      y: 176,
      width: 220,
      height: 20,
      text: `${String(index + 1).padStart(2, "0")}  /  ${effectTypes[index % effectTypes.length]}`,
      fontFamily: "Inter",
      fontSize: 13,
      fontWeight: 500,
      fill: "#60656d",
      letterSpacing: 0.4,
    }),
  );
  const page = createPage({
    id: "stress-page",
    name: `Planche contact — ${count} images`,
    width: 2400,
    height: 1500,
    background: "#f2f0eb",
    layers: [
      createLayer("text", {
        id: "stress-title",
        name: "Titre",
        x: 48,
        y: 45,
        width: 2000,
        height: 110,
        text: "Matière & lumière.",
        fontFamily: "Space Grotesk",
        fontSize: 96,
        fontWeight: 500,
        fill: "#202329",
        letterSpacing: -4,
      }),
      createLayer("text", {
        id: "stress-subtitle",
        name: "Sous-titre",
        x: 52,
        y: 167,
        width: 2000,
        height: 35,
        text: `${count} images  /  ${count * 2} effets  /  textures et composition GPU`,
        fontSize: 23,
        fontWeight: 400,
        fill: "#60656d",
      }),
      ...groups,
      ...photos,
      ...labels,
      createLayer("text", {
        id: "stress-credit",
        name: "Crédits",
        x: 48,
        y: 1395,
        width: 2300,
        height: 40,
        text: "MusArt • Scène de charge locale • Photographies Unsplash, 10 sources × 5 variantes • Crédits dans public/benchmark/manifest.json",
        fontSize: 17,
        fontWeight: 400,
        fill: "#60656d",
      }),
    ],
  });
  return createProject({
    id: `stress-project-${count}`,
    name: `Matière & lumière — ${count} images`,
    createdAt: "2026-10-27T00:00:00.000Z",
    updatedAt: "2026-10-27T00:00:00.000Z",
    pages: [page],
    assets,
  });
}
