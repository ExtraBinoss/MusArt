/** Native drag feedback owns a minimal DOM snapshot; the canonical source row never moves. */
export function layerDragImage(row: HTMLElement, transfer: DataTransfer, name: string) {
  const document = row.ownerDocument,
    preview = document.createElement("div"),
    label = document.createElement("span"),
    style = getComputedStyle(row);
  preview.className = "layer-drag-preview";
  preview.setAttribute("aria-hidden", "true");
  preview.inert = true;
  Object.assign(preview.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "max-content",
    maxWidth: "260px",
    height: "24px",
    background: "transparent",
    border: "0",
    boxShadow: "none",
    pointerEvents: "none",
    color: style.color,
    font: style.font,
  });
  const source = row.querySelector(".layer-thumbnail"),
    image = source?.querySelector("img"),
    content = image?.complete && image.naturalWidth > 0 ? image : source?.querySelector("svg");
  if (content) {
    const thumbnail = document.createElement("span"),
      clone = content.cloneNode(true) as HTMLElement | SVGElement;
    thumbnail.className = "layer-thumbnail";
    thumbnail.style.background = "transparent";
    clone.removeAttribute("data-thumbnail-reveal");
    clone.style.animation = "none";
    clone.style.opacity = "1";
    clone.style.display = "";
    thumbnail.append(clone);
    preview.append(thumbnail);
  }
  label.className = "layer-name";
  label.textContent = name;
  preview.append(label);
  document.body.append(preview);
  try {
    transfer.setDragImage(preview, 12, 12);
  } catch (error) {
    preview.remove();
    throw error;
  }
  return () => preview.remove();
}
