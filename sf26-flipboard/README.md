# SF26 FlipBoard

SF26 FlipBoard is a static, browser-native split-flap signage engine for conference operations.

- No framework runtime required
- No backend required
- Works from `index.html` or static hosting
- Supports manual operator control + autoplay playlists

## Local use

Open `sf26-flipboard/index.html` directly in a browser, or serve with any static server:

```bash
cd sf26-flipboard
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Fullscreen TV / display use

- Press **F** for fullscreen.
- Use a Chromium kiosk mode launch command for dedicated displays:

```bash
chromium --kiosk http://localhost:8080
```

## Editing scenes (non-developers)

All editable signage content is in one file:

- `js/content.js`

Update:
- `content.scenes` for scene text and dwell time
- `content.playlists` for sequence order
- `content.quickKeys` for number-key scene/playlist jumps

## Operator controls

- **Space / Enter / Right Arrow**: next scene
- **Left Arrow**: previous scene
- **F**: fullscreen
- **M**: mute flap sound
- **A**: toggle autoplay
- **R**: restart current playlist
- **1–9**: jump via saved quick keys
- **O**: toggle operator HUD

## Kiosk/browser deployment

Recommended:
- Dedicated browser profile
- Fullscreen or kiosk startup
- Power-save disabled
- Auto-reload extension optional (for unattended recovery)

## Static hosting deployment

Upload the `sf26-flipboard/` directory to any static host (Cloudflare Pages, GitHub Pages, Netlify, S3 static hosting, etc.).

No build step is needed.

## Upgrade path (optional)

Current content source is `js/content.js`. The scene engine is intentionally separated so a future adapter can load scene data from:
- JSON file
- query params
- `localStorage`
- remote endpoint

without changing board rendering logic.
