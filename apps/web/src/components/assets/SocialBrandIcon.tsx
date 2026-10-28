import { SOCIAL_BRANDS } from "@musart/assets";
import { PaletteVector } from "./PaletteVector";

const brands = new Map(SOCIAL_BRANDS.map((brand) => [brand.id, brand]));
export function SocialBrandIcon({
  id,
  className,
  size = 16,
}: {
  id: string;
  className?: string;
  size?: number;
}) {
  const artwork = brands.get(id.startsWith("brand-") ? id : `brand-${id}`);
  if (!artwork) return null;
  return (
    <span className={className} style={{ display: "inline-flex", width: size, height: size }}>
      <PaletteVector item={artwork} />
    </span>
  );
}
