# Afterglow five-minute demo

Use two browser windows (or two devices) and the local generated test clip. Start with `npm.cmd run server` and `npm.cmd run dev` in separate terminals; open the Vite URL in both browsers. The repeatable version of the local-video portion is `npm.cmd run test:browser`.

| Time | Demo |
| --- | --- |
| 0:00–0:30 | On the identity screen, choose a name and switch between Moss glow, Amber lamp, and Blue hour. Reload to show that the selected theme persists. |
| 0:30–1:00 | Create a room using `http://localhost:5173/tests/fixtures/afterglow-timecode.webm`. Invite the second browser from the room; it joins through the copied room link and receives the same source and current room state. |
| 1:00–1:40 | Start playback and seek. Confirm both local video elements advance together. Show the room's LIVE SYNC indicator and measured client latency. Explain that each browser loads the same media itself; the app distributes room state, not video. |
| 1:40–2:25 | In Discovery, search with a misspelling, filter by category/genre, inspect local availability, and add an available item to the shared queue. If no authorized catalog file is installed, use the generated local clip rather than implying a catalog title can play. |
| 2:25–3:10 | Add another queue entry, vote from both members, and demonstrate host reorder/removal. Create a poll, vote/change a vote from each browser, close it as host, and send the winner to the queue. |
| 3:10–3:50 | Send reactions during playback and show their timeline marks/highlights. Open People to show per-member latency, offset, drift, buffering, and connection state. Transfer host to the other online participant and confirm the remote changes. |
| 3:50–4:25 | Create a sync-only room with a recognized streaming-service link. Show the explicit limitation, mark both users ready, and start the host countdown. Explain that each user must open and control their own account/player. |
| 4:25–5:00 | Show `docs/PERFORMANCE.md`, the 10/20 virtual-client results and browser drift sample. State clearly that the measurements are loopback only. Show the LiveKit unavailable notice unless a separately configured HTTPS/Docker LiveKit deployment has actually been tested. |

Do not claim that the local virtual-client test is a real LAN test or that an external streaming player is synchronized at the media-frame level.
