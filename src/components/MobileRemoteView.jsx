import { useState } from "react";
import { formatTime } from "../utils/watchParty.js";
import { Icon } from "./Primitives.jsx";

export function MobileRemoteView({
  room,
  state,
  selfId,
  position = 0,
  countdownSeconds = null,
  externalReady = false,
  setExternalReady,
  hasRemote = false,
  localOffset = 0,
  updateLocalOffset,
  send,
  togglePlayback,
  soundEnabled = false,
  onToggleSound,
  wakeLockActive = false,
  sendReaction,
  onExitRemoteMode,
  theme = "green",
}) {
  const [justSynced, setJustSynced] = useState(false);

  const isCountdown = state.externalCountdown && countdownSeconds !== null && countdownSeconds > 0;
  const isStarted = state.externalStarted;
  const isPlaying = state.playing;
  const isHost = state.hostId === selfId;

  const handleSyncReset = () => {
    updateLocalOffset?.(0);
    if (!externalReady && setExternalReady) {
      setExternalReady(true);
    }
    setJustSynced(true);
    setTimeout(() => setJustSynced(false), 1500);
  };

  return (
    <div className="mobile-remote-container" data-theme={theme}>
      <header className="mobile-remote-header">
        <button
          type="button"
          className="remote-nav-toggle-btn"
          onClick={onExitRemoteMode}
          title="Switch to full room view with chat and playlist"
        >
          ← Full Room
        </button>

        <div className="remote-code-pill">
          <span className="remote-code-dot" />
          <b>{room?.id?.toUpperCase() || "ROOM"}</b>
        </div>

        <div className="remote-header-actions">
          {wakeLockActive && (
            <span className="remote-wakelock-badge" title="Screen wake lock is active — phone display will not sleep">
              ☀️ Awake
            </span>
          )}
          <button
            type="button"
            className={`remote-sound-btn ${soundEnabled ? "active" : ""}`}
            onClick={onToggleSound}
            title={soundEnabled ? "Sound cues active" : "Enable sound cues"}
            aria-label="Toggle sound cues"
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
        </div>
      </header>

      <main className="mobile-remote-body">
        <div className="mobile-remote-stage">
          <span className="remote-eyebrow">
            SHARED CLOCK {isStarted ? (isPlaying ? "· RUNNING" : "· PAUSED") : "· CUEING UP"}
          </span>

          <div className="remote-timecode-display" aria-live="polite">
            {formatTime(position)}
          </div>

          {isCountdown ? (
            <div className="remote-status-banner countdown">
              COUNTDOWN: {Math.ceil(countdownSeconds)}
            </div>
          ) : isStarted ? (
            <div className={`remote-status-banner ${isPlaying ? "play" : "pause"}`}>
              {isPlaying ? "▶ PLAY NOW" : "⏸ PAUSE NOW"}
            </div>
          ) : (
            <div className="remote-status-banner cueing">
              {externalReady ? "YOU ARE READY" : "CUE TO 00:00 & READY UP"}
            </div>
          )}

          <div className="remote-offset-readout">
            {localOffset !== 0
              ? `Your clock nudge: ${localOffset > 0 ? "+" : ""}${localOffset.toFixed(2)}s`
              : "Clock in sync with room"}
          </div>
        </div>

        <div className="mobile-remote-main-action">
          {!isStarted ? (
            <>
              <button
                type="button"
                className={`remote-huge-btn ready-toggle ${externalReady ? "is-ready" : ""}`}
                onClick={() => setExternalReady?.(!externalReady)}
              >
                {externalReady ? "YOU ARE READY ✓" : "MARK ME READY"}
              </button>

              {isHost && (
                <button
                  type="button"
                  className="remote-huge-btn countdown-trigger"
                  onClick={() => send?.("external:countdown")}
                >
                  {isCountdown ? `Starting in ${Math.ceil(countdownSeconds)}…` : "START 3-2-1"}
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className={`remote-huge-btn ${isPlaying ? "pause" : "resume"}`}
              disabled={!hasRemote}
              onClick={togglePlayback}
            >
              {isPlaying ? "PAUSE NOW ⏸" : "RESUME PLAY ▶"}
            </button>
          )}
        </div>

        <div className="mobile-remote-nudge-grid">
          <button
            type="button"
            className="remote-nudge-btn"
            onClick={() => updateLocalOffset?.(localOffset - 1)}
            aria-label="Nudge clock earlier by 1 second"
          >
            -1s
          </button>
          <button
            type="button"
            className={`remote-nudge-btn sync-btn ${justSynced ? "synced" : ""}`}
            onClick={handleSyncReset}
            aria-label="Reset clock offset and stay in sync"
          >
            {justSynced ? "In sync! ✓" : "I'm in sync"}
          </button>
          <button
            type="button"
            className="remote-nudge-btn"
            onClick={() => updateLocalOffset?.(localOffset + 1)}
            aria-label="Nudge clock later by 1 second"
          >
            +1s
          </button>
        </div>

        <div className="mobile-remote-reactions">
          {["✨", "♥", "⚡", "👏", "😂"].map(emoji => (
            <button
              key={emoji}
              type="button"
              className="remote-reaction-btn"
              onClick={() => sendReaction?.(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

export function DesktopRemoteHint({
  roomId,
  inviteUrl,
  onOpenRemoteMode,
  onCopyLink,
  copied = false,
}) {
  const [imgError, setImgError] = useState(false);
  const targetUrl = inviteUrl || (typeof window !== "undefined" ? window.location.href : "");

  return (
    <div className="desktop-remote-hint-card">
      <div className="remote-hint-copy">
        <div className="remote-hint-eyebrow">
          <span className="remote-hint-badge">REMOTE HANDHELD</span>
          <span>SECOND DEVICE</span>
        </div>
        <h4>Use this phone as your remote</h4>
        <p>
          Open Afterglow on your phone. The screen stays awake without dimming, with vibration
          countdown cues and huge one-thumb controls for couch watching.
        </p>

        <div className="remote-hint-actions">
          <button type="button" className="remote-hint-copy-btn" onClick={onCopyLink}>
            <Icon name={copied ? "check" : "link"} size={13} />
            <span>{copied ? "Link Copied!" : "Copy Mobile Link"}</span>
          </button>
          {onOpenRemoteMode && (
            <button type="button" className="remote-hint-mode-btn" onClick={onOpenRemoteMode}>
              <Icon name="device" size={13} />
              <span>Preview Remote Mode</span>
            </button>
          )}
        </div>
      </div>

      <div className="remote-hint-qr-box">
        {!imgError && targetUrl ? (
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=4&data=${encodeURIComponent(targetUrl)}`}
            alt={`QR code to join room ${roomId}`}
            className="remote-hint-qr-img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="remote-hint-qr-fallback">
            <Icon name="device" size={28} />
            <b>{roomId?.toUpperCase()}</b>
            <small>Scan room code</small>
          </div>
        )}
        <span className="remote-hint-code-tag">CODE: {roomId?.toUpperCase()}</span>
      </div>
    </div>
  );
}
