export function safeName(name: string) {
  return (
    Array.from(name, (character) =>
      character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? "-" : character,
    )
      .join("")
      .trim()
      .slice(0, 120) || "MusArt"
  );
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Browsers may consume the URL after the click task has completed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
