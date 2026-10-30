# Landing page video slots

The landing page intentionally displays four video placeholders. No videos are generated or fetched. Its template carousel uses genuine previews of the editable templates from the catalog.

Place the future clips here:

- `canvas.mp4`: overview of the editor, text, images and video.
- `effects.mp4`: before/after effects.
- `motion.mp4`: keyframes and animation.
- `agent.mp4`: agent-assisted creation through MusArt commands and project files.

The four tiles use the matching `data-video-slot` in `src/components/projects/landing/LandingPage.tsx`. Replace each placeholder with a muted, inline video using the application's Vite base path. Keep a poster fallback and respect reduced motion; do not autoplay audio.
