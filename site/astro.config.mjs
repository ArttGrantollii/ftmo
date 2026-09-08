// @ts-check
import { defineConfig } from 'astro/config';

// Phase 1A scaffold configuration.
// Static output only: no adapter, no server runtime, no API routes.
// Deployment target is a static host (Cloudflare Pages), configured in a later phase.
export default defineConfig({
  output: 'static',

  // `site` is required later for canonical URLs and sitemap generation.
  // Left unset in Phase 1A because the production domain has not been chosen.
  // site: 'https://example.com',

  build: {
    // Emit `about/index.html` rather than `about.html` so the host serves
    // clean URLs without per-file redirect rules.
    format: 'directory',
  },
});
