# Watch-party verification

Run the automated Socket.IO integration suite and production frontend build in PowerShell with:

```powershell
npm.cmd test
npm.cmd run build
```

The integration suite starts an isolated server on an available local port and checks:

| Scenario | Verification |
| --- | --- |
| Room lifecycle | Creating a room is distinct from joining one; unknown and duplicate room IDs are rejected. |
| Media rules | Direct HTTP(S) URLs ending in `.mp4` or `.webm` are accepted; page URLs are rejected. |
| Ten-client sync | Ten connected clients receive the same accepted playback state. |
| Capacity | A 21st online participant is rejected; room capacity is 20. |
| Late join | A joining client receives the server's current source and playhead. |
| Reconnect and host | Rejoining within the grace window retains host identity; expiry promotes the next online participant. |
| Queue and host control | Invalid picks are rejected, queue picks update the shared media, and stale concurrent commands do not overwrite newer state. |
| Mood signal | One latest reaction per member contributes to the room mood, which changes when that member changes reaction. |
| Local media library | `/api/library` lists top-level MP4/WebM files in `media/`; `/media/:filename` serves byte ranges. |
| Delivery percentiles | `/metrics/latency` reports server-observed delivery p50/p95/p99, cumulative samples/timeouts, and the current sample-window size. |

The client estimates its clock offset from the server timestamps in the latency ping response and uses that offset when calculating the canonical playhead. Playback correction runs every 250 ms in three zones: drift up to 80 ms is left alone, drift above 80 ms through 500 ms is corrected by adjusting playback rate within 0.95-1.05, and drift above 500 ms is corrected with a seek. `tests/playback-sync.test.js` covers offset estimation, zone boundaries, offset-adjusted playhead calculation, and the HTML video adapter.

Place authorized `.mp4` or `.webm` files in `media/`; the directory listing appears in discovery and supports byte-range seeking. Files in that directory are ignored by Git. Delivery metrics are retained in a bounded 10,000-sample window while the sample and timeout counters remain cumulative for the server process.

Start the server in one PowerShell window and run the configurable Socket.IO load test in another:

```powershell
npm.cmd run server
npm.cmd run load-test -- http://localhost:3001 10 20
```

The load-test arguments are server URL, client count (1-20), and playback command count (1-10000); defaults are `http://localhost:3001`, 10, and 20. The report includes client-observed command propagation percentiles and the server delivery-latency endpoint. It creates a temporary room on the target server and disconnects its clients when finished.

The room UI reports average absolute local playback drift and its maximum from client `sync:drift` samples. It also reports the number of accepted playback commands and delivery acknowledgement round-trip time; the server tracks acknowledgements and timeouts. These are runtime observations, not guarantees of a particular network or media source. The automated suite exercises Socket.IO state propagation with ten clients; it does not launch ten real browsers or claim a browser-decoded media drift benchmark.

The grace-window setting can be shortened for local verification by setting `RECONNECT_GRACE_MS`. Production defaults to 15 seconds.
