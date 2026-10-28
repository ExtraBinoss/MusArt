/** Decorative format previews; the corresponding canvas template remains an empty document. */
const palettes = [
  ["#ffd9b7", "#f58eb2", "#a6a4f2"],
  ["#b5eee6", "#7dc5e5", "#b6acf2"],
  ["#e6efad", "#abd8bc", "#86c6c6"],
  ["#f3d2dc", "#d0b4ed", "#93afe2"],
  ["#c0d9f5", "#9eb8f1", "#c3b5e9"],
  ["#f8e4ad", "#e9b69a", "#dbb2d8"],
] as const;
export function templatePreview(id: string): string {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const [first, second, third] = palettes[hash % palettes.length]!;
  return `radial-gradient(ellipse at 15% 10%, ${first} 0%, transparent 60%), radial-gradient(ellipse at 85% 80%, ${third} 0%, transparent 65%), linear-gradient(${110 + (hash % 100)}deg, ${second}, ${third})`;
}
