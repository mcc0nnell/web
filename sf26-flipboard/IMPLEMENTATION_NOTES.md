# Implementation Notes

## Architecture decisions

- Kept everything browser-native ES modules with no dependencies.
- Split responsibilities into small modules:
  - `js/content.js`: scene + playlist configuration
  - `js/content-loader.js`: optional data source adapter (built-in, localStorage, remote JSON)
  - `js/board.js`: split-flap grid rendering and tile updates
  - `js/engine.js`: scene sequencing, controls, layout logic, timers
  - `js/sound.js`: mechanical flap-style click synthesis with mute/throttle
- Presentation chrome (operator HUD + rails) is optional and hidden by default.

## Scene model

Each scene has:
- `type`: `hero`, `now-next`, `room`, `countdown`, `sponsor`, `wayfinding`, or `alert`
- `name`: operator-visible label
- `payload`: type-specific text fields
- `dwellMs`: autoplay dwell duration
- optional `visualMode`: style accent (`accent` / `warn`)
- optional `rails`: top/bottom metadata text

Playlists are arrays of scene IDs, and quick keys map number keys to scene or playlist jumps.

## Extending for remote control later

The `content-loader` adapter already supports alternative content sources and merges them with defaults.

A future remote-control layer can write normalized scene payloads to:
- static JSON
- URL query-based presets
- local operator snapshots in `localStorage`
- remote HTTP endpoint polling

The render pipeline remains unchanged as long as it receives the normalized `content` shape (`board`, `playlists`, `scenes`, `quickKeys`).
