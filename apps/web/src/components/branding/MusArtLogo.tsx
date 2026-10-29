import styles from "./MusArtLogo.module.css";

/** User-supplied transparent artwork, preserved verbatim at the appropriate density. */
export function MusArtLogo({
  size = 30,
  decorative = true,
}: {
  size?: number;
  decorative?: boolean;
}) {
  return (
    <img
      className={styles.logo}
      src={`${import.meta.env.BASE_URL}branding/musart-icon-32.png`}
      srcSet={`${import.meta.env.BASE_URL}branding/musart-icon-32.png 1x, ${import.meta.env.BASE_URL}branding/musart-icon-64.png 2x`}
      width={size}
      height={size}
      alt={decorative ? "" : "MusArt"}
      aria-hidden={decorative || undefined}
      decoding="async"
      draggable={false}
    />
  );
}
