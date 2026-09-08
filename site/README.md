# Production site

Production application for the independent prop-firm information site.

**Status: Phase 1A — scaffold only.** This is not the website. It exists to prove the
architecture builds and runs. The approved V2 design, content, calculators, affiliate
handling, analytics and SEO are added in later phases.

## Requirements

- Node.js `>=20.3.0` (developed against 24.19.0 LTS)
- npm

## Setup

```bash
cd site
npm install
```

## Commands

| Command           | Description                                        |
| ----------------- | -------------------------------------------------- |
| `npm run dev`     | Start the dev server at `http://localhost:4321`     |
| `npm run build`   | Build the static site to `site/dist/`               |
| `npm run preview` | Serve the built output locally to check it          |
| `npm run check`   | TypeScript and Astro diagnostics (`astro check`)    |

## Architecture

- **Astro**, static output (`output: 'static'`). No adapter, no server runtime,
  no API routes, no database, no authentication.
- **TypeScript** in strict mode.
- Build output is plain HTML/CSS/JS in `dist/`, suitable for any static host.

## Deployment (not yet configured)

Intended target is Cloudflare Pages, configured in a later phase:

- Root directory: `site`
- Build command: `npm run build`
- Output directory: `dist`

Nothing is deployed yet. No DNS, no domain, no hosting resources exist.

## Environment

Copy `.env.example` to `.env` for local development. `.env` files are git-ignored.
No real values, keys or tokens are committed to this repository. The Phase 1A
scaffold reads no environment variables.

## Repository layout

```
/                 repository root
├── index.html      frozen V1 prototype — reference only, do not modify
├── index-v2.html   frozen V2 prototype — approved design reference, do not modify
└── site/           this application
```

The two prototype files at the repository root are frozen references. They are not
part of the build and are never copied into `dist/`.
