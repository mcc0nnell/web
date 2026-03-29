# CLAUDE.md — mcc0nnell.org

Personal portfolio site for Robert McConnell. Single-page Astro static site deployed to Cloudflare Pages.

## Stack

- **Framework:** Astro 5 (static output)
- **Styling:** Vanilla CSS (`src/styles/global.css`)
- **Interactivity:** Vanilla JS (inline in `index.astro`)
- **Fonts:** Instrument Serif, Outfit, IBM Plex Mono (Google Fonts)
- **Deploy:** Cloudflare Pages → `mcc0nnell.org`

## Commands

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # preview production build
```

## Structure

```
src/
  pages/
    index.astro   # entire site — single page
  styles/
    global.css    # all styles
public/           # static assets (images, video, etc.)
```

## Design System

| Token | Value | Use |
|---|---|---|
| Background | `#0F1520` | Page background |
| Midnight | `#1B2333` | Cards, sections |
| Accent | `#DC2626` | Red highlight, HR line |
| Foreground | `#E8ECF1` | Body text |

Typography: serif headers (Instrument Serif), sans body (Outfit), mono labels (IBM Plex Mono).

## Content Sections

1. **Hero** — title, tagline, animated HR
2. **Work** — 4 cards (FCC TRS policy featured, MITRE/ACE Direct, Deaf in Gov, background)
3. **Writing** — 3 thought leadership themes + pull quote
4. **SF26** — NAD 58th Biennial Conference AV/production role
5. **Projects** — external links (portal.deafingov.org, github.com/FCC/ACEdirect)
6. **Connect** — email, LinkedIn, GitHub

## Key Conventions

- All content lives directly in `src/pages/index.astro` — no CMS or content files
- No external JS dependencies; interactivity is vanilla (nav scroll, mobile toggle, IntersectionObserver reveals)
- Reduced motion is respected via `@media (prefers-reduced-motion)`
- Work grid: featured card spans 2 columns on desktop (`grid-column: span 2`)
- Build output is `dist/` — Cloudflare Pages build command is `npm run build`
