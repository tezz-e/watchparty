# Watch-party verification

Run the automated Socket.IO integration suite and production frontend build with:

```sh
npm test
npm run build
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

The room UI reports average absolute local playback drift and its maximum from client `sync:drift` samples. It also reports the number of accepted playback commands and delivery acknowledgement round-trip time; the server tracks acknowledgements and timeouts. These are runtime observations, not guarantees of a particular network or media source. The automated suite exercises Socket.IO state propagation with ten clients; it does not launch ten real browsers or claim a browser-decoded media drift benchmark.

The grace-window setting can be shortened for local verification by setting `RECONNECT_GRACE_MS`. Production defaults to 15 seconds.
