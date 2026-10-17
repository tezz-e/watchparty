# Afterglow

Afterglow is a small, real-time watch-party room for synchronized local media, direct video URLs, HLS, and YouTube. Recognized streaming services use an honest sync-only mode: each person opens the title in their own account, while the room supplies a shared clock, ready check, countdown, and personal clock nudge. The app never captures, embeds, proxies, or controls a streaming service's player.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run server
```

The production server serves the built app and Socket.IO from one origin (default port `3001`). Open that URL on each device. For Vite development, use `npm.cmd run dev`; its socket and API requests are proxied to `http://localhost:3001`. Set `VITE_BACKEND_URL` only when the API/media server is elsewhere. `VITE_SOCKET_URL` is an optional explicit Socket.IO URL override.

## Discovery and media

The hand-authored fallback catalog works offline and includes locally stored poster illustrations for open-movie titles. It does not contain third-party film files. To play a catalog title, obtain an authorized copy, add it to `media/` using the filename shown in `src/data/catalog.json`, and restart/refresh discovery. Catalog cards show whether the local file is present. A generated Afterglow timecode clip is included for local sync checks. Catalog service buttons open the configured service's home page in a new tab; the title is visible in the room, but no unverified search/deep-link URL is guessed.

Use a source you have verified before downloading:

```powershell
npm.cmd run check:media-links -- <verified-https-url>
npm.cmd run fetch:media -- <verified-https-url> <filename.mp4>
```

The link checker requires HTTP `206 Partial Content` and a valid `Content-Range` for `bytes=0-0`. The downloader verifies byte-range support before saving into `media/`. Large media files are git-ignored. Record the source and exact license in [CREDITS.md](./CREDITS.md).

The optional catalog seeder is a one-time snapshot operation, not a runtime dependency. It reads `TMDB_READ_ACCESS_TOKEN` from the server-side environment, fetches movie metadata, trailers and regional availability, downloads poster images locally, then writes `src/data/catalog.json` and `src/data/SEED_INFO.json`. Set `SEED_REGION` to a two-letter country code. It is intentionally not run as part of tests or builds. Review TMDB's current terms and JustWatch attribution requirements before running it; the script refuses to run unless `TMDB_TERMS_REVIEWED=1` is set. The official TMDB terms endpoint was unreachable from the environment used for this implementation.

```powershell
$env:SEED_REGION = "US"
$env:TMDB_TERMS_REVIEWED = "1"
npm.cmd run seed:catalog
```

Never use a `VITE_` variable for the TMDB token. The UI does not make TMDB requests at runtime; it uses the committed local snapshot and local posters.

## Media providers

| Source | Behavior |
| --- | --- |
| `library` | Files under `media/`, served by the app with byte-range support. |
| direct `url` | HTTP(S) MP4/WebM loaded separately by each participant. |
| `hls` | HLS via native browser support or hls.js; the media host must permit cross-origin access. |
| `youtube` | The official YouTube IFrame API; embed restrictions and browser autoplay policy still apply. |
| `external` | Sync-only clock. Open the title separately in your own account; Afterglow cannot inspect or steer that player. |
| `screen` | Not available yet; planned for the LiveKit milestone. |

The app never fetches arbitrary user media URLs from the server. URL checks validate shape only; each browser player reports whether media actually loads. HTTPS pages cannot play insecure HTTP media. Screen capture requires a secure context (HTTPS or localhost); LiveKit is not configured yet.

## Architecture

```text
React + Vite client
  ├─ local catalog JSON + local poster artwork
  ├─ HTML video / hls.js / YouTube IFrame adapters
  └─ sync-only external clock and readiness controls
           │ same-origin HTTP + Socket.IO
           ▼
Express + Socket.IO server
  ├─ authoritative in-memory room state and 15s reconnect grace
  ├─ URL-shape validation; no arbitrary URL fetching
  ├─ local media library with byte-range support
  └─ bounded delivery telemetry and latency percentiles
```

## Catalog attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch. Catalog data is a dated snapshot, not live availability; region and seed date are stored in `src/data/SEED_INFO.json` after seeding.

See [TESTING.md](./TESTING.md) for automated coverage, test conditions, and verification limitations.
