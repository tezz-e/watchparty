# Performance and failure handling

## Measurement conditions

Measurements were taken on 2026-10-17 using:

- Windows 11 Home Single Language, build 10.0.26200, 64-bit.
- AMD Ryzen 5 4600H (6 cores / 12 logical processors), Node.js 24.15.0, npm 11.12.1.
- Chromium 156.0.8078.4 (Playwright headless shell).
- One local machine, IPv4 loopback (`127.0.0.1`); no LAN, WAN, or VPN path was measured.
- The 10- and 20-client load runs used separate fresh server processes and separate rooms. Each used 20 sequential playback commands, one simultaneous command burst from every room member (all carrying the same version), then a forced disconnect/rejoin and a post-reconnect command.
- The browser run used two independent Chromium contexts at 1440×1000 and 1280×900 CSS pixels, device scale factor 1, and the generated 8-second, 640×360 VP9 WebM fixture in `tests/fixtures/afterglow-timecode.webm`.

All virtual clients and browsers ran on the same machine as the server. Results do not represent real devices on a LAN. The browser measurement is a decoded HTML video playback check, but it is one run of two contexts, not a multi-device guarantee.

## Results observed

All times below are milliseconds. Percentiles use the load-test's sorted-sample nearest-rank calculation (`ceil(p × n)`). Client propagation is measured from immediately before emitting a command until a client observes its authoritative `playback:state`. The simultaneous burst has a single accepted version; clients observe that accepted broadcast. Server delivery is separately measured from server emission until Socket.IO acknowledgements return.

| Virtual clients | Client samples (sequential) | Client propagation p50 / p95 / p99 | Simultaneous propagation p50 / p95 / p99 | Post-reconnect propagation p50 / p95 / p99 | Server delivery p50 / p95 / p99 | Reconnect acknowledgement | Server delivery timeouts |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 200 | 1.813 / 3.055 / 3.504 | 1.958 / 2.703 / 2.703 | 1.728 / 2.440 / 2.440 | 1.680 / 2.562 / 2.734 | 7.754 | 0 |
| 20 | 400 | 2.729 / 4.479 / 5.587 | 2.777 / 4.150 / 4.263 | 6.116 / 7.900 / 8.075 | 2.828 / 6.066 / 7.369 | 10.970 | 0 |

Both runs reported that stale concurrent commands resolved to one authoritative version and that a command after reconnect reached every client. The 20-client run reached the configured room capacity.

In the browser run, both contexts loaded the same local WebM and synchronized play. Across ten current-time comparisons spaced 100 ms apart after a 500 ms settling period, maximum observed absolute playhead difference was **0.0217 seconds (21.7 ms)**. This sample is below the 500 ms target, but one short loopback run is not evidence for all browsers, media sources, or networks.

The local load-test propagation p95 values are below the 250 ms target. Because these are loopback measurements, the required real local-network / 10-device measurement remains for the project owner; do not interpret this table as a LAN result.

## Reproduce

Run the complete Node suite, then the browser test:

```powershell
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:browser
```

The browser config starts its own server and Vite instances on ports `43761` and `43762`. If those ports are in use, stop the conflicting process before running the test.

For load tests, start the server in one terminal and run each size against a fresh server process for directly comparable server metrics:

```powershell
$env:PORT = "3001"
npm.cmd run server
```

In another terminal:

```powershell
npm.cmd run load-test -- http://localhost:3001 10 20
```

Restart the server before the 20-client run, then use:

```powershell
npm.cmd run load-test -- http://localhost:3001 20 20
```

The script's arguments are server URL, client count (1–20), and sequential playback command count (1–10,000). It creates a temporary room, sends simultaneous same-version updates, forces one participant to disconnect and rejoin with the same identity, verifies a later update reaches all clients, prints client and server percentiles, and disconnects its clients.

## Failure handling and unmeasured cases

- **Brief disconnect:** a member identity and room slot are retained for the configured reconnect grace period (15 seconds by default). Rejoining with the same browser identity receives the server's current room state. If the window expires, the member is removed and a disconnected host is elected away.
- **Host departure:** explicit host transfer is immediate and restricted to an online room member. An unplanned host disconnect retains the current host during the grace period; expiration triggers host election. If all members expire, the in-memory room is deleted.
- **Concurrent/stale playback update:** an update with a version older than the room's accepted version is not applied; the sender receives the current room state. The load tests confirmed a same-version burst resulted in a single accepted version at both tested sizes.
- **Slow or unresponsive client:** Socket.IO delivery acknowledgements time out after five seconds and are counted in server delivery telemetry. No timeout occurred in these runs. No deliberately throttled client was measured.
- **Process restart:** room state is in memory only. A server restart loses rooms; reconnecting clients cannot restore the pre-restart room. Disk snapshots and restart recovery are not implemented or tested.
- **Media source failure/buffering:** the browser reports media errors and buffering to the room; actual third-party availability, cross-origin behavior, and network variation are source-dependent and not included in the timing results.
- **LiveKit unavailable:** screen sharing is optional and reports an explicit unavailable state when credentials are missing. Token/permission tests pass, but LiveKit, Docker networking, HTTPS certificate trust, screen capture, and decoded WebRTC sharing were not exercised in these measurements.
- **External sync-only sources:** Afterglow distributes the intended shared clock and readiness state; it cannot inspect, control, or verify playback in another service.
