# Watch-party verification

Run the automated Socket.IO integration suite and production frontend build in PowerShell with:

```powershell
npm.cmd test
npm.cmd run build
```

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
| Mood signal | One latest reaction per member contributes to the room mood, which changes when that member changes reaction. |
| Sync-only ready check | Room readiness is tracked per online member; only the host can start the three-second countdown, late joins cancel it, and the host alone can pause/resume the shared clock. |
| Personal clock nudge | Local sync-only offsets are limited to ±15 seconds in quarter-second increments and do not change server room state. |
| Local media library | `/api/library` lists top-level MP4/WebM files in `media/`; `/media/:filename` serves byte ranges. |
| Delivery percentiles | `/metrics/latency` reports server-observed delivery p50/p95/p99, cumulative samples/timeouts, and the current sample-window size. |

The client estimates its clock offset from the server timestamps in the latency ping response and uses that offset when calculating the canonical playhead. Playback correction runs every 250 ms in three zones: drift up to 80 ms is left alone, drift above 80 ms through 500 ms is corrected by adjusting playback rate within 0.95-1.05, and drift above 500 ms is corrected with a seek. `tests/playback-sync.test.js` covers offset estimation, zone boundaries, offset-adjusted playhead calculation, and the HTML video adapter.

YouTube sources use the official IFrame Player API in each participant's browser; Afterglow does not fetch, relay, or download the video. Supported links include `youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…`, `/live/…`, and `/embed/…`. Private, removed, or embedding-disabled videos report a room-visible error. Buffering presence is shown in the People panel. The YouTube player only accepts discrete playback rates, so this client does not rate-nudge it: it tolerates drift up to 500 ms and seeks beyond that. Successful playback still depends on the video's embed permissions, browser policy, and network access to YouTube.

HLS `.m3u8` URLs are played with the browser's native HLS support when available (Safari), otherwise with hls.js. The stream host must allow cross-origin requests for its manifest and segments; fatal network/CORS and decode errors are reported in the room. HTTP HLS media is blocked when the app is served over HTTPS, with a prompt to use HTTPS. Pasting a recognized streaming-platform URL (configured in `shared/streamingPlatforms.js`) offers a sync-only room that opens the deep link for each participant; it does not embed, inspect, or control that site's player. The fuller ready-check and countdown flow is a later milestone.

Place authorized `.mp4` or `.webm` files in `media/`; the directory listing appears in discovery and supports byte-range seeking. Files in that directory are ignored by Git. Delivery metrics are retained in a bounded 10,000-sample window while the sample and timeout counters remain cumulative for the server process.

The local discovery snapshot and poster art are stored in `src/data/catalog.json` and `public/catalog/posters/`; discovery does not call TMDB at runtime. A card becomes playable when the matching authorized file exists in `media/`. The optional `npm.cmd run seed:catalog` command requires `TMDB_READ_ACCESS_TOKEN` in the server environment and writes a dated, region-specific snapshot. It was not run for this verification. The current TMDB terms endpoint could not be reached here; review current terms and JustWatch attribution before seeding. Never move the token into a `VITE_` variable.

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

The load-test arguments are server URL, client count (1-20), and playback command count (1-10000); defaults are `http://localhost:3001`, 10, and 20. The report includes client-observed command propagation percentiles and the server delivery-latency endpoint. It creates a temporary room on the target server and disconnects its clients when finished.

The room UI reports average absolute local playback drift and its maximum from client `sync:drift` samples. It also reports the number of accepted playback commands and delivery acknowledgement round-trip time; the server tracks acknowledgements and timeouts. These are runtime observations, not guarantees of a particular network or media source. The automated suite exercises Socket.IO state propagation with ten clients; it does not launch ten real browsers or claim a browser-decoded media drift benchmark.

The grace-window setting can be shortened for local verification by setting `RECONNECT_GRACE_MS`. Production defaults to 15 seconds.
