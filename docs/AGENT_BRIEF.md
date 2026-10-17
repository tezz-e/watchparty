MISSION
You are taking over a half-finished project and must finish it to a high standard. The repo is github.com/tezz-e/watchparty ("Afterglow"); the local working copy is C:\Users\manee\Desktop\webdevtask on Windows (use PowerShell syntax for every command). Your job: verify the current state, then deliver all remaining work below. You may work autonomously inside a milestone, but stop and report at every CHECKPOINT. Read this whole brief now and re-read it at the start of every milestone.

HOW TO WORK
- Verify, don't trust. The previous agent's reports may be wrong. Before building on anything, run the tests and build and read the code.
- Commit at least once per milestone (small commits are better). Plain single-line commit messages. Never add Co-authored-by trailers or any attribution lines. Do not push; I will push.
- Never invent measurements, test results, API names or URLs. If you are unsure how a library works, read its installed types or official docs. Report anything you could not verify.
- If you have browser-control tooling, use it for real two-tab and multi-tab smoke tests; otherwise use Playwright. Say clearly which things were tested in a real browser and which were not.

ASSIGNMENT (verbatim requirements)
Watch Party. Goal: Build a real-time watch-party app where multiple users watch videos together with synchronized playback and shared movie discovery.
Core requirements:
- Create and join rooms via invite link or room code.
- Sync play, pause and seek across all participants.
- Movie recommendations with categories, filters and fuzzy search.
- Emoji reactions, live chat, shared playlists, group polls and host transfer.
- Automatic playback drift detection and correction.
- Reliable handling of late joins, reconnections and concurrent actions.
Constraints:
- At least 10 concurrent users per room.
- Playback control propagation <= 250 ms at p95 on a local network.
- Playback drift <= 500 ms after correction.
- Document latency measurements, test conditions and failure handling.
Bonus: creative features carry higher weightage. Evaluation favors originality, depth, multi-user interaction and reliability over basic functionality.

PROJECT CONTEXT
- Stack: Node + Express 5 + Socket.IO server (in-memory rooms), React + Vite client. Tests use `node --test` (tests/rooms.test.js and later additions); TESTING.md describes them.
- Original problem: the app only synced timing and accepted only direct .mp4/.webm URLs; the catalog was 5 hardcoded Google sample links that are DEAD. There was no real way to get content into a room.
- Original sync bugs: clients computed the target position with the server's updatedAt against their own Date.now() (breaks across real machines); drift was corrected only by a hard seek at >0.5 s, only on state updates; telemetry reported an average ack round-trip instead of p95 propagation; the poll was fixed; fuzzy search was a subsequence match; dependencies used "latest".
- Reported status of earlier work (VERIFY ALL OF IT):
  * Phase 0 (done, local commit 0655432): server split into server/ modules (rooms, handlers, validation, telemetry); client split into components/hooks/utils/data; dependencies pinned; .env.example added.
  * Phase 1a (reported done): clock-offset estimation, continuous correction loop with three zones, player adapter interface around the HTML video element, tests.
  * Phase 1b (reported done): "library" provider with a media/ folder and Range support, latency percentile metrics endpoint, load-test script.
  * Nothing from Phase 2 onward has been started.
- Known risk to check first: the client's socket URL defaulted to http://localhost:3001. On other devices that points at the wrong machine. The client must connect to the same origin that served it (or the page's hostname), configurable by env. Also make the production server serve the built client (dist/) on one port so a 10-device LAN test only needs one URL.

NON-NEGOTIABLE RULES
1. Secrets: I have a TMDB v4 read-access token. It is NOT in this brief. Never ask for it, print it, log it, hardcode it or commit it. It is read only from the environment variable TMDB_READ_ACCESS_TOKEN (set by me in .env or my shell). Never use VITE_-prefixed variables for secrets. .env must be git-ignored; .env.example has placeholders only. Do not run the seed script yourself; I run it with a VPN on.
2. DRM: Netflix, Prime Video, Disney+ and similar use DRM. Never try to capture, rip, proxy, embed, scrape or control their players. No DRM workarounds and no instructions to disable browser protections. The legitimate path is "sync-only mode": everybody opens the title in their own account and our room provides the shared clock.
3. Content: never commit a media URL you have not verified returns HTTP 200 with Range support (write a link-check script). Default content is files in media/ served by our server: open-licensed films (e.g. Blender open movies) or public domain material, with every file's license recorded in CREDITS.md, plus small ffmpeg-generated test clips. Large videos must not bloat the repo: commit only small clips, and provide an `npm run fetch:media` script that downloads verified open-licensed files, with media/ large files git-ignored. If you lack internet, tell me what to download.
4. The server must never fetch arbitrary user-supplied URLs (SSRF). Validate URL shape only; let the browser's player report whether it loads.
5. TMDB may be unreachable from where this app runs (blocked in my country). The app must never depend on TMDB at runtime (see catalog section).
6. Browsers allow screen capture only on https or localhost. Document this and provide an HTTPS dev option for multi-device LAN tests.

TARGET ARCHITECTURE: MEDIA PROVIDERS
A room's media is described as: kind, title, source, optional poster, duration, platform. All players implement one adapter interface (load, play, pause, seek, get current time, set rate if supported, buffering/error callbacks, destroy); the sync engine talks only to it. Kinds:
1. library: our own files with Range support (done in 1b; verify).
2. url: direct mp4/webm links.
3. hls: .m3u8 via hls.js (Safari native). Clear errors for CORS and mixed content.
4. youtube: official IFrame API; parse watch/youtu.be/shorts/embed URLs; handle embedding-disabled videos with a clear message and a room report. YouTube supports only discrete playback rates, so correct drift with seeks and a larger tolerance; document it.
5. screen: host shares a screen/tab/window over WebRTC through an SFU. Use LiveKit (open source, self-hostable with Docker; JS client and server SDKs). The server issues tokens; only the host/remote holder publishes, viewers subscribe-only. Config via LIVEKIT_URL, API key, API secret. Provide a docker-compose file. If LiveKit is not configured, the option is disabled with an explanation and the rest of the app works. Show a neutral notice that streaming services may block capture and suggest sync-only mode. Nothing more.
6. external: sync-only mode for streaming platforms.
Auto-detection: pasting any URL selects the provider. A known streaming-platform URL (domain list in a config file) gets an explanation and an offer to create an external sync-only room with that link as a deep link.

SYNC ENGINE REQUIREMENTS (verify implemented; fix if not)
- Clock offset estimated from repeated ping samples (lowest-RTT samples, median); all position math uses estimated server time.
- Continuous correction loop (~250 ms and on state updates): tiny drift = nothing; small drift = playbackRate nudge; large drift = hard seek. Thresholds documented, chosen so drift after correction stays under 500 ms.
- Buffering: clients report stalls; the room shows who is buffering; host option to pause the room until everyone has buffered.
- Late join: receive current media and position, wait until playable, then apply position. Reconnect: identity and state restored within the grace window.
- Autoplay-policy handling ("tap to start") that does not break sync.
- Stale/concurrent commands rejected by version, with tests for two simultaneous controllers.
- Source load failure is reported to the room; the host sees how many members failed.
- Basic hardening: input validation, payload size limits, rate limiting for chat/reactions/commands.

CATALOG: SEED ONCE, RUN OFFLINE
- Catalog sits behind a provider interface (search, filter by category/genre, details, availability). The only runtime provider is LOCAL: a catalog JSON plus poster images stored in the repo and served by our server. Never hotlink posters.
- Write `npm run seed:catalog`: reads TMDB_READ_ACCESS_TOKEN from the environment, sends it as an Authorization ****** fetches 30-40 curated titles (popular across genres plus the open-licensed films we host) with genres, synopsis, year, rating, trailer key, and watch-provider availability for SEED_REGION; downloads posters locally; writes the catalog JSON and a SEED_INFO file (date, region). Re-runnable, handles rate limits and failures, never prints the token, never overwrites the existing catalog on failure.
- Until I run it, provide a hand-written fallback catalog so every discovery feature works with no network. Real fuzzy search (typo tolerant), category and genre filters, sorting, "available on" display, and "start a sync-only room from this title".
- Read TMDB's current terms first. Put the required attribution (including the JustWatch credit for watch-provider data) in the footer and README, and state that the data is a snapshot with its seed date.
- Optional last: live TMDB search through a server-side cache if the token is set and reachable, silently falling back to LOCAL with an "offline catalog" badge.
- All discovery tests must pass with LOCAL and the network disabled.

SYNC-ONLY (EXTERNAL) MODE
Ready check (who has the title open and is ready), host-triggered 3-2-1 countdown, a shared room clock showing the intended position, host pause/resume of that clock, and a per-user +/- offset nudge. The UI must say honestly that this mode cannot control another site's player.

OTHER FEATURES
- Group polls: any member creates a poll with custom options; one changeable vote per member; host can close; live results; the winner can be pushed to the queue.
- Playlist: add from the catalog, a pasted URL or the library; upvotes; host reorder/remove; auto-advance.
- Reactions, chat, host transfer: keep working; add host transfer request/accept flow if it is simple.
- Creative features (build all three, polished): (a) reaction heatmap: reactions stored with the video timestamp and drawn as intensity marks on the seek bar, with a highlight list at the end; (b) live sync-health panel with each member's offset, drift, latency, buffering state; (c) the sync-only ready check and countdown. Keep the existing mood-based recommendations working.
- Optional reliability extra, after everything else: periodically snapshot rooms to disk so a server restart restores them and clients auto-rejoin.

MILESTONES (checkpoint after each)
M0. AUDIT AND FIXES. Verify everything reported above: run tests/build, read the code, run the load test, check Range with curl.exe, two-tab smoke test. Fix the socket-URL/same-origin issue, serve dist/ from the server, and fix anything broken or missing in Phase 1. Add docs/AGENT_BRIEF.md (this text) if absent. CHECKPOINT: report what was true vs. false in the earlier reports.
M1. PROVIDERS. YouTube, HLS, URL auto-detection, streaming-platform URL recognition, error reporting, buffering handling, with unit tests for URL detection/validation (many forms, including bad ones). CHECKPOINT.
M2. CATALOG AND DISCOVERY. LOCAL provider, fallback catalog, seed script (do not run), fuzzy search, filters, availability display, attribution, media fetch script, link-check script, CREDITS.md. Then M3 right away: sync-only external mode. CHECKPOINT after both.
M4. SCREEN SHARE. LiveKit token endpoint, permissions, docker-compose, HTTPS dev script, graceful fallback, documentation of the secure-context requirement. CHECKPOINT.
M5. POLLS, PLAYLIST, CREATIVE FEATURES. Polls, queue voting/reordering/auto-advance, reaction heatmap, sync-health panel, UI polish for desktop and phone widths. CHECKPOINT.
M6. MEASUREMENT, DOCS, HARDENING. Load test with 10 and 20 virtual clients including simultaneous commands and forced reconnects; Playwright multi-user test using a WebM clip (headless Chromium usually lacks H.264) with an ffmpeg test clip with a burned-in timecode; docs/PERFORMANCE.md containing only numbers you actually measured (hardware, OS, browser versions, network, room size, how latency/drift were computed, results, what was not measured) and failure-handling behaviour (disconnects, server restart, host leaving, slow client, source error, LiveKit unavailable); update README.md (setup, env vars, each source kind, limitations, text architecture diagram) and TESTING.md; write DEMO.md with a 5-minute script that shows each requirement, and a REQUIREMENTS_MATRIX.md mapping every requirement to the code, test and measurement that prove it. FINAL CHECKPOINT.

THINGS I WILL DO MYSELF
Run the TMDB seed with a VPN on, set my own .env, start Docker for LiveKit, and run the 10-device LAN test. Tell me exactly what to run and what to look for. Because I cannot test everything, make the load test and Playwright test strong.

FINAL ACCEPTANCE CHECKLIST
npm test and npm run build pass; app runs from one command on one port; no dead links; works offline with the local catalog; every requirement has evidence; no secrets in the repo history; docs match what actually exists.

REPORT FORMAT AT EACH CHECKPOINT
Files changed; commands run with real output summaries; what was tested in a real browser vs. not; anything you could not verify; decisions you made and why; the next milestone.
