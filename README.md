# mcc0nnell.org (Astro)

A single-page landing site with a **Garrix-style “stage” hero** (full-bleed presence + atmosphere), then a tight **Wired-editorial** scroll.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy (Cloudflare Pages)

- Framework preset: **Astro**
- Build command: `npm run build`
- Output directory: `dist`

### Add custom domain
Attach `mcc0nnell.org` and (optionally) `www.mcc0nnell.org` in Cloudflare Pages → Custom Domains.

## Customize

Edit content in:
- `src/content/site.json`

Edit styling in:
- `src/styles/global.css`

## Optional: Add a real background video

1. Put an MP4 here: `public/hero.mp4`
2. In `src/components/HeroStage.astro`, set `useVideo` to `true`.

Keep it subtle:
- 15–30s loop
- no hard cuts
- low saturation
