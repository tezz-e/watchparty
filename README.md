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

## Shared room tools

Room members can create a poll with custom options and change their vote until the host closes it. Add a supported direct media URL to a poll option to let the host send the winning pick to the shared queue. Queue picks accept upvotes, host reorder/remove, and automatically advance at the end of the current media; the most-upvoted queued item plays next, with manual queue order breaking ties. Reactions are recorded against the room playhead, drawn over the seek bar, and summarized as highlights when playback ends. The People panel includes each member's latest measured round-trip time, clock offset, drift, buffering, and connection status. The sync-only ready check remains honest that the app cannot read or control playback on another service.

## Screen sharing (LiveKit)

Screen sharing is an optional video-only room feature. The room server issues a short-lived, one-use ticket and rechecks room membership and publishing permission before exchanging it for a five-minute LiveKit token. Everyone can subscribe; only the host can publish in host-control rooms, while shared-control rooms allow the current remote holders to publish. If LiveKit is not configured, the app shows that clearly and the rest of the room continues to work. Browser screen capture needs HTTPS (or localhost); streaming services may block capture, so use the sync-only mode for those services.

For local development, install Docker Desktop and `mkcert`, then generate and trust a certificate for the exact hostnames/IP addresses your browser will use:

```powershell
mkcert -install
New-Item -ItemType Directory -Force .\certs
mkcert -cert-file .\certs\afterglow-cert.pem -key-file .\certs\afterglow-key.pem localhost 127.0.0.1 ::1 192.168.1.23
```

Replace `192.168.1.23` with this computer's LAN address. Install/trust the local certificate authority on each client device as required by its operating system/browser. The certificate and key are ignored by Git.

Add these settings to the ignored project-root `.env` file, replacing the hostname with one present in the certificate. The LiveKit key/secret below match the development-only values in `livekit.yaml`:

```dotenv
AFTERGLOW_HTTPS_CERT=certs/afterglow-cert.pem
AFTERGLOW_HTTPS_KEY=certs/afterglow-key.pem
LIVEKIT_URL=wss://192.168.1.23:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

Start the local LiveKit server and its TLS WebSocket proxy, then run the app server and Vite in separate PowerShell windows:

```powershell
docker compose up -d
npm.cmd run server
npm.cmd run dev:https
```

Open `https://192.168.1.23:5173` on each client. The Vite HTTPS certificate and LiveKit's `wss://` endpoint must both match trusted certificate names. The compose setup exposes LiveKit signaling through Caddy on TCP `7880`, ICE/TCP on `7881`, and a limited WebRTC UDP range (`50000-50100`). For clients outside the local network, configure routing/firewall and LiveKit's advertised public address; this development compose file is not a production deployment. Without Docker/LiveKit, run the app normally and verify its graceful unavailable state.

## Discovery and media

The hand-authored fallback catalog works offline and includes locally stored poster illustrations for open-movie titles. It does not contain third-party film files. To play a catalog title, obtain an authorized copy, add it to `media/` using the filename shown in `src/data/catalog.json`, and restart/refresh discovery. Catalog cards show whether the local file is present. A generated Afterglow timecode clip is included for local sync checks. Catalog service buttons open the configured service's home page in a new tab; the title is visible in the room, but no unverified search/deep-link URL is guessed.

Use a source you have verified before downloading:

```powershell
npm.cmd run check:media-links -- <verified-https-url>
npm.cmd run fetch:media -- <verified-https-url> <filename.mp4>
```

The link checker requires HTTP `206 Partial Content` and a valid `Content-Range` for `bytes=0-0`. The downloader verifies byte-range support before saving into `media/`. Large media files are git-ignored. Record the source and exact license in [CREDITS.md](./CREDITS.md).

The catalog is an offline snapshot, not a runtime dependency. The current snapshot contains 32 TMDB titles and locally stored posters for Norway (`NO`), plus the 8 open-movie fallback records. The snapshot date and six-month refresh deadline are recorded in `src/data/SEED_INFO.json`. TMDB's API terms require attribution, a TMDB logo, and prohibit caching API data for more than six months; watch-provider data is powered by JustWatch and requires JustWatch attribution. The discovery screen displays the snapshot region/date and attribution.

```powershell
$env:SEED_REGION = "NO"
$env:TMDB_TERMS_REVIEWED = "1"
node --env-file=.env .\scripts\seed-catalog.js
```

Review the current TMDB and JustWatch terms before reseeding. The script reads `TMDB_READ_ACCESS_TOKEN` from `.env`, requires the terms-review confirmation above, downloads posters locally, and replaces the snapshot only after all requests succeed. Never use a `VITE_` variable for the token. The UI does not make TMDB requests at runtime.

## Media providers

| Source | Behavior |
| --- | --- |
| `library` | Files under `media/`, served by the app with byte-range support. |
| direct `url` | HTTP(S) MP4/WebM loaded separately by each participant. |
| `hls` | HLS via native browser support or hls.js; the media host must permit cross-origin access. |
| `youtube` | The official YouTube IFrame API; embed restrictions and browser autoplay policy still apply. |
| `external` | Sync-only clock. Open the title separately in your own account; Afterglow cannot inspect or steer that player. |
| screen share | Optional LiveKit WebRTC screen video; participants subscribe locally, and room permissions limit publishing. |

The app never fetches arbitrary user media URLs from the server. URL checks validate shape only; each browser player reports whether media actually loads. HTTPS pages cannot play insecure HTTP media. Screen capture requires a secure context (HTTPS or localhost).

## Architecture

```text
React + Vite client
  ├─ local catalog JSON + local poster artwork
  ├─ HTML video / hls.js / YouTube IFrame adapters
  ├─ sync-only external clock and readiness controls
  ├─ shared polls, voted playlist, and reaction heatmap
  ├─ per-member sync health
  └─ LiveKit WebRTC screen video (optional)
           │ same-origin HTTP + Socket.IO
           ▼
Express + Socket.IO server
  ├─ authoritative in-memory room state and 15s reconnect grace
  ├─ poll votes, playlist votes, timestamped reactions, and member telemetry
  ├─ one-use room tickets and scoped LiveKit access tokens
  ├─ URL-shape validation; no arbitrary URL fetching
  ├─ local media library with byte-range support
  └─ bounded delivery telemetry and latency percentiles
```

## Catalog attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch. Catalog data is a dated snapshot, not live availability; region and seed date are stored in `src/data/SEED_INFO.json` after seeding.

See [TESTING.md](./TESTING.md) for automated coverage, test conditions, and verification limitations.
