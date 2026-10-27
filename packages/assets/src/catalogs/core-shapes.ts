// Copied from ResumI (MIT); see docs/legal/resumi-MIT.txt.
// Core shape geometry adapted from cv-creator-private.
const pointsPath = (points: Array<[number, number]>) =>
  `${points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join("")}Z`;

function regularPolygon(sides: number, rotation = -90, inset = 0) {
  const radius = 50 - inset;
  return pointsPath(
    Array.from({ length: sides }, (_, index) => {
      const angle = ((rotation + (index * 360) / sides) * Math.PI) / 180;
      return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius] as [number, number];
    }),
  );
}

function star(points: number, inner = 0.46, rotation = -90) {
  return pointsPath(
    Array.from({ length: points * 2 }, (_, index) => {
      const radius = index % 2 ? 50 * inner : 50;
      const angle = ((rotation + (index * 180) / points) * Math.PI) / 180;
      return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius] as [number, number];
    }),
  );
}

export const SHAPE_KINDS = [
  "rectangle",
  "circle",
  "triangle",
  "diamond",
  "pentagon",
  "hexagon",
  "octagon",
  "star-4",
  "star-5",
  "star-6",
  "star-8",
  "burst",
  "cross",
  "plus",
  "x",
  "arrow-right",
  "arrow-left",
  "chevron-right",
  "heart",
  "drop",
  "arch",
  "capsule",
  "ticket",
  "wave",
  "flag",
  "bookmark",
  "blob-1",
  "blob-2",
  "blob-3",
  "spark",
  "custom-icon",
] as const;

export type LucideIconKind = `lucide:${string}`;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export interface ShapeDefinition {
  id: ShapeKind;
  name: string;
  path: string;
  viewBox: string;
  width: number;
  height: number;
  aspectRatio: number;
  asset?: string;
  strokeOnly?: boolean;
}

const CORE_SHAPES = [
  {
    id: "rectangle",
    name: "Rectangle",
    path: "M0 0H100V100H0Z",
    aspectRatio: 1.6,
  },
  {
    id: "circle",
    name: "Cercle",
    path: "M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z",
    aspectRatio: 1,
  },
  {
    id: "triangle",
    name: "Triangle",
    path: pointsPath([
      [50, 0],
      [100, 100],
      [0, 100],
    ]),
    aspectRatio: 1,
  },
  {
    id: "diamond",
    name: "Losange",
    path: pointsPath([
      [50, 0],
      [100, 50],
      [50, 100],
      [0, 50],
    ]),
    aspectRatio: 1,
  },
  {
    id: "pentagon",
    name: "Pentagone",
    path: regularPolygon(5),
    aspectRatio: 1,
  },
  { id: "hexagon", name: "Hexagone", path: regularPolygon(6), aspectRatio: 1 },
  { id: "octagon", name: "Octogone", path: regularPolygon(8), aspectRatio: 1 },
  { id: "star-4", name: "Étoile 4", path: star(4, 0.32), aspectRatio: 1 },
  { id: "star-5", name: "Étoile 5", path: star(5, 0.45), aspectRatio: 1 },
  { id: "star-6", name: "Étoile 6", path: star(6, 0.5), aspectRatio: 1 },
  { id: "star-8", name: "Étoile 8", path: star(8, 0.48), aspectRatio: 1 },
  { id: "burst", name: "Explosion", path: star(16, 0.76), aspectRatio: 1 },
  {
    id: "cross",
    name: "Croix",
    path: pointsPath([
      [38, 0],
      [62, 0],
      [62, 38],
      [100, 38],
      [100, 62],
      [62, 62],
      [62, 100],
      [38, 100],
      [38, 62],
      [0, 62],
      [0, 38],
      [38, 38],
    ]),
    aspectRatio: 1,
  },
  {
    id: "plus",
    name: "Plus doux",
    path: "M40 0H60V40H100V60H60V100H40V60H0V40H40Z",
    aspectRatio: 1,
  },
  {
    id: "x",
    name: "Croix X",
    path: pointsPath([
      [18, 0],
      [50, 32],
      [82, 0],
      [100, 18],
      [68, 50],
      [100, 82],
      [82, 100],
      [50, 68],
      [18, 100],
      [0, 82],
      [32, 50],
      [0, 18],
    ]),
    aspectRatio: 1,
  },
  {
    id: "arrow-right",
    name: "Flèche droite",
    path: pointsPath([
      [0, 28],
      [58, 28],
      [58, 0],
      [100, 50],
      [58, 100],
      [58, 72],
      [0, 72],
    ]),
    aspectRatio: 1.4,
  },
  {
    id: "arrow-left",
    name: "Flèche gauche",
    path: pointsPath([
      [100, 28],
      [42, 28],
      [42, 0],
      [0, 50],
      [42, 100],
      [42, 72],
      [100, 72],
    ]),
    aspectRatio: 1.4,
  },
  {
    id: "chevron-right",
    name: "Chevron",
    path: pointsPath([
      [0, 0],
      [52, 0],
      [100, 50],
      [52, 100],
      [0, 100],
      [48, 50],
    ]),
    aspectRatio: 1,
  },
  {
    id: "heart",
    name: "Cœur",
    path: "M50 92C42 82 5 62 5 31C5 12 28 2 42 18L50 27L58 18C72 2 95 12 95 31C95 62 58 82 50 92Z",
    aspectRatio: 1,
  },
  {
    id: "drop",
    name: "Goutte",
    path: "M50 0C50 0 88 43 88 67A38 38 0 1 1 12 67C12 43 50 0 50 0Z",
    aspectRatio: 0.82,
  },
  {
    id: "arch",
    name: "Arche",
    path: "M0 100V50A50 50 0 0 1 100 50V100Z",
    aspectRatio: 1,
  },
  {
    id: "capsule",
    name: "Capsule",
    path: "M25 0H75A25 25 0 0 1 100 25V75A25 25 0 0 1 75 100H25A25 25 0 0 1 0 75V25A25 25 0 0 1 25 0Z",
    aspectRatio: 1.8,
  },
  {
    id: "ticket",
    name: "Ticket",
    path: "M0 0H100V35A15 15 0 0 0 100 65V100H0V65A15 15 0 0 0 0 35Z",
    aspectRatio: 1.6,
  },
  {
    id: "wave",
    name: "Vague",
    path: "M0 22C18 0 34 0 50 22C66 44 82 44 100 22V78C82 100 66 100 50 78C34 56 18 56 0 78Z",
    aspectRatio: 1.8,
  },
  {
    id: "flag",
    name: "Drapeau",
    path: "M0 0C24 14 42 14 62 4C76-3 89 0 100 7V78C84 69 70 68 55 77C35 89 18 88 0 77Z",
    aspectRatio: 1.5,
  },
  {
    id: "bookmark",
    name: "Marque-page",
    path: pointsPath([
      [10, 0],
      [90, 0],
      [90, 100],
      [50, 72],
      [10, 100],
    ]),
    aspectRatio: 0.72,
  },
  {
    id: "blob-1",
    name: "Blob 1",
    path: "M86 18C101 34 96 63 81 81C66 99 37 104 17 88C-3 72-3 42 12 20C27-2 70 1 86 18Z",
    aspectRatio: 1,
  },
  {
    id: "blob-2",
    name: "Blob 2",
    path: "M92 34C106 58 85 92 57 98C29 104 0 81 3 51C6 21 25-2 54 1C73 3 82 17 92 34Z",
    aspectRatio: 1,
  },
  {
    id: "blob-3",
    name: "Blob 3",
    path: "M76 5C96 14 105 42 96 65C87 88 60 105 35 96C10 87-5 62 2 38C9 14 28 3 49 1C60 0 68 1 76 5Z",
    aspectRatio: 1,
  },
  {
    id: "spark",
    name: "Étincelle",
    path: "M50 0C54 32 68 46 100 50C68 54 54 68 50 100C46 68 32 54 0 50C32 46 46 32 50 0Z",
    aspectRatio: 1,
  },
] satisfies Array<Omit<ShapeDefinition, "viewBox" | "width" | "height">>;

export const SHAPE_CATALOG: ShapeDefinition[] = CORE_SHAPES.map((shape) => ({
  ...shape,
  viewBox: "0 0 100 100",
  width: 100,
  height: 100,
}));
export function shapeDefinition(kind: string) {
  return SHAPE_CATALOG.find((shape) => shape.id === kind);
}
