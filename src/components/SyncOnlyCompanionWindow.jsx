import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatTime } from "../utils/watchParty.js";
import { FALLBACK_PIP_EXPLANATION, isDocumentPipSupported } from "../utils/companionCues.js";

const PIP_STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #090b0a;
  color: #e5e7eb;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  user-select: none;
  overflow: hidden;
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.pip-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: 10px 12px;
  background: radial-gradient(circle at 50% 0%, #172419, #090c0a 85%);
  border: 1px solid #233125;
}
.pip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.pip-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #8fa08d;
  display: flex;
  align-items: center;
  gap: 5px;
}
.pip-title-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}
.pip-title-dot.paused {
  background: #f59e0b;
  box-shadow: 0 0 6px #f59e0b;
}
.pip-close-btn {
  background: none;
  border: none;
  color: #8fa08d;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 3px;
}
.pip-close-btn:hover {
  background: rgba(255,255,255,0.1);
  color: #fff;
}
.pip-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 6px 0;
  text-align: center;
}
.pip-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.pip-status-badge.play {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}
.pip-status-badge.pause {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.4);
}
.pip-status-badge.countdown {
  background: rgba(139, 92, 246, 0.25);
  color: #c4b5fd;
  border: 1px solid rgba(139, 92, 246, 0.5);
  animation: pipPulse 0.6s infinite alternate;
}
@keyframes pipPulse {
  0% { transform: scale(0.98); opacity: 0.85; }
  100% { transform: scale(1.04); opacity: 1; }
}
.pip-timecode {
  font-family: "SF Mono", "DM Mono", Menlo, Consolas, monospace;
  font-size: 38px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #c8ff76;
  text-shadow: 0 0 16px rgba(200, 255, 118, 0.3);
  line-height: 1;
}
.pip-offset-tag {
  font-size: 10px;
  color: #9ca3af;
  margin-top: 4px;
}
.pip-actions-row {
  display: flex;
  gap: 6px;
  width: 100%;
}
.pip-btn {
  flex: 1;
  background: #172118;
  border: 1px solid #324333;
  color: #d1fae5;
  border-radius: 6px;
  padding: 8px 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.15s ease;
}
.pip-btn:hover {
  background: #233324;
  border-color: #48624a;
}
.pip-btn:active {
  transform: scale(0.96);
}
.pip-btn.primary {
  background: #c8ff76;
  color: #121811;
  border-color: #c8ff76;
}
.pip-btn.primary:hover {
  background: #dcff9c;
}
.pip-btn.sync-in {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.4);
}
.pip-btn.sync-in:hover {
  background: rgba(16, 185, 129, 0.3);
}
.pip-sound-toggle {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.12);
  color: #9ca3af;
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 12px;
}
.pip-sound-toggle.active {
  color: #c8ff76;
  border-color: #c8ff76;
}
`;

export function SyncOnlyCompanionView({
  room,
  state,
  position = 0,
  countdownSeconds = null,
  localOffset = 0,
  hasRemote = false,
  onNudge,
  onSyncReset,
  onTogglePlayback,
  soundEnabled = false,
  onToggleSound,
  onClose,
}) {
  const [justSynced, setJustSynced] = useState(false);

  const isCountdown = state.externalCountdown && countdownSeconds !== null && countdownSeconds > 0;
  const isPlaying = state.playing;

  const handleSyncClick = () => {
    onSyncReset?.();
    setJustSynced(true);
    setTimeout(() => setJustSynced(false), 1500);
  };

  return (
    <div className="pip-wrapper">
      <div className="pip-header">
        <div className="pip-title">
          <span className={`pip-title-dot ${isPlaying ? "" : "paused"}`} />
          <span>AFTERGLOW COMPANION · {room?.id?.toUpperCase()}</span>
        </div>
        {onClose && (
          <button type="button" className="pip-close-btn" onClick={onClose} aria-label="Close floating timer">
            ✕
          </button>
        )}
      </div>

      <div className="pip-stage">
        {isCountdown ? (
          <div className="pip-status-badge countdown">
            <span>COUNTDOWN: {Math.ceil(countdownSeconds)}</span>
          </div>
        ) : isPlaying ? (
          <div className="pip-status-badge play">
            <span>▶ PLAY NOW</span>
          </div>
        ) : (
          <div className="pip-status-badge pause">
            <span>⏸ PAUSE NOW</span>
          </div>
        )}

        <div className="pip-timecode" aria-live="polite">
          {formatTime(position)}
        </div>

        <div className="pip-offset-tag">
          {localOffset !== 0
            ? `Your nudge: ${localOffset > 0 ? "+" : ""}${localOffset.toFixed(2)}s`
            : "In sync with room clock"}
        </div>
      </div>

      <div className="pip-actions-row">
        {hasRemote && (
          <button
            type="button"
            className="pip-btn primary"
            onClick={onTogglePlayback}
            title={isPlaying ? "Pause for room" : "Play for room"}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
        )}
        <button
          type="button"
          className="pip-btn"
          onClick={() => onNudge?.(-1)}
          title="Nudge timecode earlier 1s"
        >
          -1s
        </button>
        <button
          type="button"
          className="pip-btn"
          onClick={() => onNudge?.(1)}
          title="Nudge timecode later 1s"
        >
          +1s
        </button>
        <button
          type="button"
          className={`pip-btn sync-in ${justSynced ? "just-synced" : ""}`}
          onClick={handleSyncClick}
          title="Reset nudge and sync with room"
        >
          {justSynced ? "In sync! ✓" : "I’m in sync"}
        </button>
        {onToggleSound && (
          <button
            type="button"
            className={`pip-sound-toggle ${soundEnabled ? "active" : ""}`}
            onClick={onToggleSound}
            title={soundEnabled ? "Sound cues active" : "Enable sound cues"}
            aria-label="Toggle sound cues"
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
        )}
      </div>
    </div>
  );
}

export function SyncOnlyCompanionPortal({
  pipWindow,
  room,
  state,
  position = 0,
  countdownSeconds = null,
  localOffset = 0,
  hasRemote = false,
  onNudge,
  onSyncReset,
  onTogglePlayback,
  soundEnabled = false,
  onToggleSound,
  onClose,
}) {
  useEffect(() => {
    if (!pipWindow) return;

    try {
      pipWindow.document.title = "Afterglow Floating Companion";

      // Inject self-contained styles into the PiP window
      const style = pipWindow.document.createElement("style");
      style.textContent = PIP_STYLES;
      pipWindow.document.head.appendChild(style);

      // Copy parent document link stylesheets if available
      [...document.styleSheets].forEach(sheet => {
        try {
          if (sheet.href) {
            const link = pipWindow.document.createElement("link");
            link.rel = "stylesheet";
            link.href = sheet.href;
            pipWindow.document.head.appendChild(link);
          }
        } catch (e) {
          // Cross-origin CSS access
        }
      });
    } catch (e) {
      console.warn("Could not prepare PiP document head", e);
    }
  }, [pipWindow]);

  if (!pipWindow || !pipWindow.document?.body) return null;

  return createPortal(
    <SyncOnlyCompanionView
      room={room}
      state={state}
      position={position}
      countdownSeconds={countdownSeconds}
      localOffset={localOffset}
      hasRemote={hasRemote}
      onNudge={onNudge}
      onSyncReset={onSyncReset}
      onTogglePlayback={onTogglePlayback}
      soundEnabled={soundEnabled}
      onToggleSound={onToggleSound}
      onClose={onClose}
    />,
    pipWindow.document.body
  );
}

export { openDocumentPictureInPicture } from "../utils/companionCues.js";
