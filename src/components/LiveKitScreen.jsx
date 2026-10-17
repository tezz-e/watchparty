import { useEffect, useRef, useState } from "react";
import { Room as LiveKitRoom, RoomEvent, Track } from "livekit-client";

export default function LiveKitScreen({ roomId, connected, canPublish, requestTicket }) {
  const video = useRef(null);
  const liveRoom = useRef(null);
  const shareTrack = useRef(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [localSharing, setLocalSharing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let connectedRoom = null;

    const connect = async () => {
      try {
        if (!connected) {
          if (active) setStatus("connecting");
          return;
        }
        const statusResponse = await fetch("/api/livekit/status");
        if (!statusResponse.ok) throw new Error(`LiveKit status request failed (${statusResponse.status}).`);
        const configuration = await statusResponse.json();
        if (!configuration.enabled) {
          if (active) setStatus("unavailable");
          return;
        }

        const ticket = await requestTicket();
        if (!active) return;
        const tokenResponse = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket }),
        });
        const credentials = await tokenResponse.json();
        if (!tokenResponse.ok) throw new Error(credentials.error || `LiveKit token request failed (${tokenResponse.status}).`);
        if (!active) return;

        connectedRoom = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
        liveRoom.current = connectedRoom;
        const attachScreen = (track, isLocal = false) => {
          if (!active || track.source !== Track.Source.ScreenShare || !video.current) return;
          shareTrack.current = track;
          track.attach(video.current);
          video.current.muted = true;
          setSharing(true);
          setLocalSharing(isLocal);
          setError("");
        };
        const detachScreen = track => {
          if (!active || track !== shareTrack.current) return;
          track.detach(video.current || undefined);
          shareTrack.current = null;
          setSharing(false);
          setLocalSharing(false);
        };
        connectedRoom
          .on(RoomEvent.TrackSubscribed, track => attachScreen(track))
          .on(RoomEvent.TrackUnsubscribed, track => detachScreen(track))
          .on(RoomEvent.LocalTrackPublished, publication => {
            if (publication.track) attachScreen(publication.track, true);
          })
          .on(RoomEvent.LocalTrackUnpublished, publication => {
            if (publication.track) detachScreen(publication.track);
          })
          .on(RoomEvent.Disconnected, () => {
            if (!active) return;
            shareTrack.current?.detach(video.current || undefined);
            shareTrack.current = null;
            setSharing(false);
            setLocalSharing(false);
          });
        await connectedRoom.connect(credentials.url, credentials.token);
        if (active) setStatus("connected");
      } catch (connectError) {
        if (active) {
          setStatus("error");
          setError(connectError.message);
        }
        await connectedRoom?.disconnect();
      }
    };

    setStatus("connecting");
    setError("");
    connect();
    return () => {
      active = false;
      shareTrack.current?.detach(video.current || undefined);
      shareTrack.current = null;
      connectedRoom?.disconnect();
      if (liveRoom.current === connectedRoom) liveRoom.current = null;
    };
  }, [roomId, connected, canPublish, requestTicket]);

  const toggleScreenShare = async () => {
    const room = liveRoom.current;
    if (!room || !canPublish || busy) return;
    setBusy(true);
    setError("");
    try {
      if (!window.isSecureContext) {
        throw new Error("Screen sharing requires HTTPS or localhost. Open the app over a secure connection.");
      }
      if (room.localParticipant.isScreenShareEnabled) {
        await room.localParticipant.setScreenShareEnabled(false);
      } else {
        await room.localParticipant.setScreenShareEnabled(true, { audio: false });
      }
    } catch (shareError) {
      if (shareError.name === "NotAllowedError") {
        setError("Screen sharing was cancelled or blocked by the browser.");
      } else {
        setError(`Unable to start screen sharing: ${shareError.message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`livekit-panel ${sharing ? "sharing" : ""}`} aria-label="LiveKit screen sharing">
      <video ref={video} className="livekit-video" autoPlay playsInline muted hidden={!sharing}/>
      <div className="livekit-controls">
        <div>
          <span className="eyebrow">LIVE SCREEN SHARE</span>
          <small>
            {status === "unavailable" && "Not configured. The shared room clock still works."}
            {status === "connecting" && "Connecting to the room’s media relay…"}
            {status === "error" && "Screen sharing could not connect."}
            {status === "connected" && (sharing ? (localSharing ? "You are sharing your screen." : "A participant is sharing their screen.") : "Share a tab, window, or screen; video only.")}
          </small>
        </div>
        {status === "connected" && canPublish && (
          <button type="button" onClick={toggleScreenShare} disabled={busy || (sharing && !localSharing)}>
            {busy ? "Please wait…" : localSharing ? "Stop sharing" : sharing ? "Screen in use" : "Share screen"}
          </button>
        )}
        {status === "connected" && !canPublish && <small className="livekit-permission">Host or remote holder can share.</small>}
      </div>
      {status === "unavailable" && <p className="livekit-hint">Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET on the server. Use sync-only mode if a streaming service blocks capture.</p>}
      {error && <p className="livekit-error" role="alert">{error}</p>}
    </section>
  );
}
