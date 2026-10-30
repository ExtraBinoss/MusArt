# Original MusArt sounds

`silk-whoosh.wav`, `soft-plop.wav` and `glass-chime.wav` are original procedural sound effects generated from MusArt's TypeScript recipes in `apps/web/src/services/motion/audio/sfx.ts`.

They contain no third-party recordings, samples, voices or generated speech. The repository's MIT license applies, Copyright (c) 2026 MusArt contributors. The original source recipes and generated recordings may be used, modified and redistributed under that license.

`bun scripts/templates/generate.ts` regenerates the mono 48 kHz PCM16 WAV originals and pins their exact SHA-256 hashes in each template manifest. The headless template author places the sounds using validated Motion audio commands. In Bloom demonstrates a whoosh, two pops and a chime; Stress Lab demonstrates the same original-media path alongside multiple video and image tracks.

The stock photos and flower video retain their separate provenance in `sources.json` and the existing stock-media documentation.
