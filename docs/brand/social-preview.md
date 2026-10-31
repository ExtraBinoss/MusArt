# Social preview

Open `/ssr` to inspect the dedicated 1200 × 630 share-image artboard. The English copy is intentionally fixed independently of the editor language. The current direction uses light paper, the shared violet mascot, the Melt wordmark, “Design with ease. Animate to captivate.” and `melt.plinka.eu`. There is no eyebrow, colored ball or slogan covering the artwork.

`apps/web/src/ui/brand/ssr` owns the React layout, CSS, portable artwork and one-frame native rendering adapter. The source images are supplied references recorded in `public/branding/social/SOURCES.txt`. The collage is built through validated engine commands. ASCII, Bayer/threshold dithering, inversion and image blending run through the existing Three/TSL render session. CSS does not simulate image effects, and the page does not read GPU pixels into JavaScript. Preparation is abortable; rendering is acknowledged before capture and native resources are explicitly disposed.

With the local app running, regenerate the checked-in PNG:

```sh
bun run brand:social
# Optional base URL, including a hosted base path:
bun run brand:social http://localhost:6100/MusArt/
```

The capture waits for the native frame, image decoding and font readiness, checks the exact artboard dimensions, and closes Chromium after success or failure. Output is `apps/web/public/branding/melt-social.png`. The shared route head references `https://melt.plinka.eu/branding/melt-social.png` as the Open Graph/Twitter share image. The `/ssr` preview is excluded from indexing.
