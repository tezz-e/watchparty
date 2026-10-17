# Watch-party verification

Run the automated Socket.IO integration suite and production frontend build in PowerShell with:

```powershell
npm.cmd test
npm.cmd run test:browser
npm.cmd run build
```

The browser test requires Chromium once (`npx.cmd playwright install chromium`). It starts an isolated Node server and Vite dev server, creates a room in one Chromium context, joins via the invite link in another, loads `tests/fixtures/afterglow-timecode.webm` in both local video elements, and measures playhead drift after synchronization. It also checks the green default, persistent amber selection, and blue accent. The Playwright config uses ports `43761` and `43762`; stop any process occupying them before testing.

For a single-origin production/LAN run, build the client and start the server:

```powershell
npm.cmd run build
npm.cmd run server
```

Open the server URL from each device on the LAN; Socket.IO defaults to that same page origin. For Vite development, `vite.config.js` proxies Socket.IO, library, media, health and metrics requests to `http://localhost:3001`; set `VITE_BACKEND_URL` to override that backend. `VITE_SOCKET_URL` is an optional public explicit socket URL override.

The integration suite starts an isolated server on an available local port and checks:

| Scenario | Verification |
| --- | --- |
| Offline catalog | Curated local JSON and poster artwork load without TMDB; typo-tolerant search, category/genre filters, sorting, local availability, and service search links are covered by `tests/local-catalog.test.js`. |
| Room lifecycle | Creating a room is distinct from joining one; unknown and duplicate room IDs are rejected. |
| Media rules | Direct HTTP(S) `.mp4`/`.webm`/`.m3u8` URLs, supported YouTube links, and configured streaming-platform links are accepted; unrelated pages and deceptive domains are rejected. |
| Ten-client sync | Ten connected clients receive the same accepted playback state. |
| Capacity | A 21st online participant is rejected; room capacity is 20. |
| Late join | A joining client receives the server's current source and playhead. |
| Reconnect and host | Rejoining within the grace window retains host identity; expiry promotes the next online participant. |
| Queue and host control | Invalid picks are rejected, queue picks update the shared media, and stale concurrent commands do not overwrite newer state. |
| Poll and queue lifecycle | `tests/rooms.test.js` covers custom poll options, one changeable vote per member, host-only closure, winner-to-queue behavior, one-per-member queue upvotes, host reorder authorization, and highest-voted auto-advance with queue-order tie breaking. |
| Reaction heatmap | Reactions carry the current server playhead position; bounded room history feeds the visible timeline and end-of-video highlight summary. |
| Per-member sync health | Room presence exposes each member's latest round-trip time, estimated clock offset, local drift, buffering, and online status; malformed health samples are ignored. |
| Mood signal | One latest reaction per member contributes to the room mood, which changes when that member changes reaction. |
| Sync-only ready check | Room readiness is tracked per online member; only the host can start the three-second countdown, late joins cancel it, and the host alone can pause/resume the shared clock. |
| LiveKit fallback and authorization | `tests/livekit.test.js` checks configuration, host/shared-control publishing permissions, one-use/expiry tickets, redemption-time permission rechecks, and screen-only token grants. `tests/rooms.test.js` checks the explicit disabled-server response when LiveKit is unconfigured. |
| Personal clock nudge | Local sync-only offsets are limited to ±15 seconds in quarter-second increments and do not change server room state. |
| Local media library | `/api/library` lists top-level MP4/WebM files in `media/`; `/media/:filename` serves byte ranges. |
| Delivery percentiles | `/metrics/latency` reports server-observed delivery p50/p95/p99, cumulative samples/timeouts, and the current sample-window size. |
| Browser playback | `tests/browser/room-sync.spec.js` verifies local VP9 WebM playback in two headless Chromium contexts, shared invite, synchronized playhead, and theme selection/persistence. |

The client estimates its clock offset from the server timestamps in the latency ping response and uses that offset when calculating the canonical playhead. Playback correction runs every 250 ms in three zones: drift up to 80 ms is left alone, drift above 80 ms through 500 ms is corrected by adjusting playback rate within 0.95-1.05, and drift above 500 ms is corrected with a seek. `tests/playback-sync.test.js` covers offset estimation, zone boundaries, offset-adjusted playhead calculation, and the HTML video adapter.

YouTube sources use the official IFrame Player API in each participant's browser; Afterglow does not fetch, relay, or download the video. Supported links include `youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…`, `/live/…`, and `/embed/…`. Private, removed, or embedding-disabled videos report a room-visible error. Buffering presence is shown in the People panel. The YouTube player only accepts discrete playback rates, so this client does not rate-nudge it: it tolerates drift up to 500 ms and seeks beyond that. Successful playback still depends on the video's embed permissions, browser policy, and network access to YouTube.

HLS `.m3u8` URLs are played with the browser's native HLS support when available (Safari), otherwise with hls.js. The stream host must allow cross-origin requests for its manifest and segments; fatal network/CORS and decode errors are reported in the room. HTTP HLS media is blocked when the app is served over HTTPS, with a prompt to use HTTPS. Pasting a recognized streaming-platform URL (configured in `shared/streamingPlatforms.js`) offers a sync-only room that opens the deep link for each participant; it does not embed, inspect, or control that site's player. The room has a per-member ready check and host-controlled countdown, but cannot verify whether anyone actually started playback on the external service.

LiveKit is optional and disabled unless `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are set on the server. Its token endpoint redeems a short-lived, one-use ticket issued to an online room socket and rechecks membership and current host/shared-control permission. Tokens allow subscribing and publishing screen video only (no camera, microphone, or data tracks); the browser requests display capture with audio disabled. The app includes a local Docker Compose server and Caddy TLS proxy; configure HTTPS certificate paths and the LiveKit `wss://` URL as described in [README.md](./README.md#screen-sharing-livekit).

To manually verify actual screen-share media (not covered by this environment's automated suite):

1. Install Docker Desktop and `mkcert`; create/trust certificates covering the app and LiveKit hostnames/IPs.
2. Configure `.env` as in the README and run `docker compose up -d`.
3. In separate terminals run `npm.cmd run server` and `npm.cmd run dev:https`.
4. Open the HTTPS Vite URL in two browsers/devices, create a room, and confirm the host can share a browser tab/window and the other participant receives its video.
5. Confirm the guest cannot publish in host-control mode; transfer host or enable shared control and check the permission behavior. Stop sharing, deny the browser prompt, disconnect/reconnect a client, and verify clear recovery/error states.
6. Stop Docker and reload the room; verify the explicit “not configured” fallback and that normal synchronized playback remain available.

Automated tests verify ticket logic and the unconfigured fallback only; they do not start Docker or assert end-to-end WebRTC connectivity, TLS trust, UDP reachability, or decoded screen-share playback. Configure LiveKit's advertised network address and firewall/port forwarding separately for participants outside the local network. Screen capture of streaming services may be blocked by browser/service policy; use sync-only mode in that case.

For the M5 room tools, create a poll with two or more options (optionally give each a supported media URL), vote from multiple clients, change a vote, close it as host, and queue the winning option. Add multiple picks and verify upvotes, host-only reorder, then finish the current video to confirm the highest-voted next pick starts. Send reactions during playback and confirm marks appear along the seek bar and a summary appears when playback ends. The People drawer should show per-member RTT, offset, drift, buffering, and reconnect state.

Place authorized `.mp4` or `.webm` files in `media/`; the directory listing appears in discovery and supports byte-range seeking. Files in that directory are ignored by Git. Delivery metrics are retained in a bounded 10,000-sample window while the sample and timeout counters remain cumulative for the server process.

The local discovery snapshot and poster art are stored in `src/data/catalog.json` and `public/catalog/posters/`; discovery does not call TMDB at runtime. A card becomes playable when the matching authorized file exists in `media/`. The current snapshot is for Norway (`NO`), with its seed date and refresh deadline recorded in `src/data/SEED_INFO.json`. The optional `npm.cmd run seed:catalog` command requires `TMDB_READ_ACCESS_TOKEN` in the server environment and writes a dated, region-specific snapshot. Review current TMDB and JustWatch terms before reseeding. Never move the token into a `VITE_` variable.

Before adding a media URL to a manifest or downloading a film, verify it with:

```powershell
npm.cmd run check:media-links -- <verified-https-url>
npm.cmd run fetch:media -- <verified-https-url> <filename.mp4>
```

Both scripts reject unverified content for this app's use; the checker requires a `206` response with a byte-range `Content-Range`, and the downloader verifies that before writing to the git-ignored `media/` directory. No third-party movie URL was added to the fallback catalog.

Start the server in one PowerShell window and run the configurable Socket.IO load test in another:

```powershell
npm.cmd run server
npm.cmd run load-test -- http://localhost:3001 10 20
```

The load-test arguments are server URL, client count (1-20), and sequential playback command count (1-10000); defaults are `http://localhost:3001`, 10, and 20. The report includes sequential, simultaneous same-version, and post-reconnect propagation percentiles; it forces one participant to reconnect using the same member identity. It creates a temporary room on the target server and disconnects its clients when finished. See [docs/PERFORMANCE.md](./docs/PERFORMANCE.md) for measured 10/20-client conditions and results. Those measurements used loopback, not a real LAN.

For a LAN demo, use `npm.cmd run build` then `npm.cmd run server` and open `http://<host-LAN-IP>:3001` on each device. Invite links copy the current reachable host origin, or rewrite localhost to the server's active LAN IPv4. For browser development, `npm.cmd run dev:lan` binds Vite to all interfaces. A true LAN load measurement must run `npm.cmd run load-test -- http://<host-LAN-IP>:3001 10 20` from a different physical LAN device; see the exact procedure in [docs/PERFORMANCE.md](./docs/PERFORMANCE.md#measure-on-the-actual-lan).

The room UI reports average absolute local playback drift and its maximum from client `sync:drift` samples. It also reports the number of accepted playback commands and delivery acknowledgement round-trip time; the server tracks acknowledgements and timeouts. These are runtime observations, not guarantees of a particular network or media source. The automated suite exercises Socket.IO state propagation with ten clients; it does not launch ten real browsers or claim a browser-decoded media drift benchmark.

The grace-window setting can be shortened for local verification by setting `RECONNECT_GRACE_MS`. Production defaults to 15 seconds.
