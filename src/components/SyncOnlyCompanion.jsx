import { useEffect, useState } from "react";
import { Icon } from "./Primitives.jsx";
import { compareSyncOffset, formatTimecode, parseTimecodeInput } from "../utils/syncOnlyMath.js";
import "./SyncOnlyCompanion.css";

export function SyncOnlyCompanion({
  state,
  selfId,
  members = [],
  onlineMembers = [],
  readyMembers = [],
  isHost = false,
  platform,
  config,
  send,
  externalReady,
  setExternalReady,
  localOffset = 0,
  updateLocalOffset,
  getCanonicalPosition,
  getServerNow,
  countdownSeconds = null,
  lastSeek = null,
  onClearSeek,
  children,
}) {
  const [, setTicker] = useState(0);
  const [copiedTime, setCopiedTime] = useState(false);
  const [syncInput, setSyncInput] = useState("");
  const [syncStatusReport, setSyncStatusReport] = useState(null);
  const [syncReported, setSyncReported] = useState(false);
  const [seekInput, setSeekInput] = useState("");
  const [seekError, setSeekError] = useState("");

  // Live ticker updating every 500ms
  useEffect(() => {
    const timer = setInterval(() => setTicker(t => t + 1), 500);
    return () => clearInterval(timer);
  }, []);

  const currentSeconds = getCanonicalPosition ? getCanonicalPosition(state) : state.position;
  const canonicalFormatted = formatTimecode(currentSeconds, true);
  const pausedTimeFormatted = formatTimecode(state.position, true);
  const isPaused = !state.playing && state.externalStarted;
  const isCountdown = state.externalCountdown && (!countdownSeconds || countdownSeconds > 0);

  const handleCopyTime = async (timeString = canonicalFormatted) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(timeString);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = timeString;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedTime(true);
      setTimeout(() => setCopiedTime(false), 1600);
    } catch (err) {
      console.error("Unable to copy timecode:", err);
    }
  };

  // Perform live comparison when syncInput is entered or nudged
  const parsedAttendeeSeconds = parseTimecodeInput(syncInput);
  const activeSyncComparison = parsedAttendeeSeconds !== null
    ? compareSyncOffset(parsedAttendeeSeconds, currentSeconds)
    : null;

  const handleApplySyncCheck = () => {
    if (!activeSyncComparison) return;
    const diff = activeSyncComparison.diff;
    updateLocalOffset?.(diff);
    send?.("sync:offset", {
      offsetSeconds: diff,
      status: activeSyncComparison.status,
      diffSeconds: diff,
    });
    setSyncStatusReport(activeSyncComparison);
    setSyncReported(true);
    setTimeout(() => setSyncReported(false), 2400);
  };

  const handleNudgeOffset = (deltaSeconds) => {
    const nextOffset = (localOffset || 0) + deltaSeconds;
    updateLocalOffset?.(nextOffset);
    const comparison = compareSyncOffset(currentSeconds + nextOffset, currentSeconds);
    send?.("sync:offset", {
      offsetSeconds: nextOffset,
      status: comparison.status,
      diffSeconds: nextOffset,
    });
  };

  const handleResetOffset = () => {
    updateLocalOffset?.(0);
    setSyncInput("");
    setSyncStatusReport(null);
    send?.("sync:offset", {
      offsetSeconds: 0,
      status: "in-sync",
      diffSeconds: 0,
    });
  };

  const handleHostSeek = (event) => {
    event?.preventDefault();
    setSeekError("");
    const parsed = parseTimecodeInput(seekInput);
    if (parsed === null) {
      setSeekError("Enter a valid time like 45:00 or 01:15:30");
      return;
    }
    send?.("external:seek", { position: parsed });
    setSeekInput("");
  };

  const platformName = platform?.name || "Netflix";

  return (
    <div className="sync-only-companion external-room-controls" role="region" aria-label="Sync-Only companion panel">
      {/* 1. Honest Copy Explainer Banner */}
      <div className="sync-explainer-banner">
        <div className="explainer-badge">
          <Icon name="spark" size={14} />
          <span>SYNC-ONLY WATCH PARTY</span>
        </div>
        <p className="explainer-copy">
          Afterglow can't control {platformName} itself. It keeps everyone on one shared clock. Use Pause / Resume together and the sync check to stay together.
        </p>
        {config?.source && (
          <a
            href={config.source}
            target="_blank"
            rel="noreferrer"
            className="explainer-platform-link"
            title={`Open title directly on ${platformName}`}
          >
            <span>Open in {platformName}</span>
            <Icon name="external" size={12} />
          </a>
        )}
      </div>

      {/* Seek Jump Banner if host jumped recently */}
      {lastSeek && (
        <div className="sync-jump-banner" role="status">
          <div className="jump-banner-content">
            <Icon name="swap" size={16} />
            <span>
              <strong>Host jumped to {lastSeek.formatted}.</strong> Seek your player to {lastSeek.formatted}.
            </span>
          </div>
          {onClearSeek && (
            <button
              type="button"
              className="jump-banner-dismiss"
              onClick={onClearSeek}
              aria-label="Dismiss seek banner"
            >
              <Icon name="check" size={14} />
              <span>I'm there</span>
            </button>
          )}
        </div>
      )}

      {/* 2. Full-Width PAUSED State Banner */}
      {isPaused && (
        <section className="sync-paused-banner" aria-label="Room playback paused">
          <div className="paused-banner-left">
            <span className="paused-label-pill">PAUSED FOR EVERYONE</span>
            <div className="paused-timecode-box">
              <span className="paused-timecode-digit">{pausedTimeFormatted}</span>
              <button
                type="button"
                className="copy-paused-time-btn"
                onClick={() => handleCopyTime(pausedTimeFormatted)}
                title="Copy paused timecode to clipboard"
              >
                <Icon name={copiedTime ? "check" : "link"} size={13} />
                <span>{copiedTime ? "COPIED" : "Copy time"}</span>
              </button>
            </div>
            <p className="paused-instruction">Pause your player at this time</p>
          </div>

          <div className="paused-banner-actions">
            {/* Attendee Confirmation Button */}
            <button
              type="button"
              className={`paused-confirm-btn ${externalReady ? "confirmed" : ""}`}
              onClick={() => setExternalReady?.(!externalReady)}
            >
              <Icon name={externalReady ? "check" : "play"} size={14} />
              <span>
                {externalReady
                  ? `I'm paused at ${pausedTimeFormatted} ✓`
                  : `I'm paused at ${pausedTimeFormatted}`}
              </span>
            </button>

            {/* Host Resume Controls */}
            {isHost && (
              <div className="paused-host-resume-block">
                <button
                  type="button"
                  className="resume-together-btn primary"
                  disabled={!onlineMembers.length || readyMembers.length !== onlineMembers.length}
                  onClick={() => send?.("external:countdown")}
                >
                  <Icon name="play" size={14} />
                  <span>
                    Resume together ({readyMembers.length}/{onlineMembers.length} ready)
                  </span>
                </button>
                {readyMembers.length < onlineMembers.length && (
                  <button
                    type="button"
                    className="resume-override-btn"
                    onClick={() => send?.("external:countdown", { override: true })}
                    title="Start the 3-2-1 resume countdown immediately even if not everyone checked in"
                  >
                    Resume anyway
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Countdown overlay if active */}
      {isCountdown && (
        <div className="sync-countdown-banner">
          <div className="countdown-pulse">
            <span className="countdown-number">
              {countdownSeconds !== null && countdownSeconds > 0 ? Math.ceil(countdownSeconds) : "GO!"}
            </span>
            <div className="countdown-copy">
              <b>3-2-1 Countdown Running</b>
              <span>Press play in your {platformName} player when the countdown reaches 0!</span>
            </div>
          </div>
          {isHost && (
            <button
              type="button"
              className="countdown-cancel-btn external-cancel-button"
              onClick={() => send?.("external:countdown-cancel")}
            >
              Cancel countdown
            </button>
          )}
        </div>
      )}

      {/* 3. Prominent Live Shared Timecode Ticker & Transport Header */}
      <section className="sync-ticker-deck">
        <div className="ticker-main">
          <div className="ticker-header-row">
            <span className="ticker-eyebrow">
              <span className={`ticker-dot ${state.playing ? "running" : "idle"}`} />
              SHARED ROOM CLOCK
            </span>
            <span className={`ticker-status-tag ${state.playing ? "running" : "paused"}`}>
              {state.playing ? "CLOCK RUNNING" : isPaused ? "PAUSED" : "NOT STARTED"}
            </span>
          </div>

          <div className="ticker-display-row">
            <span className="ticker-timecode" aria-label={`Current shared time: ${canonicalFormatted}`}>
              {canonicalFormatted}
            </span>
            <button
              type="button"
              className="ticker-copy-btn"
              onClick={() => handleCopyTime(canonicalFormatted)}
              title="Copy current shared timecode"
            >
              <Icon name={copiedTime ? "check" : "link"} size={13} />
              <span>{copiedTime ? "COPIED" : "Copy time"}</span>
            </button>
          </div>

          <p className="ticker-subtext">
            All room members are aligned to this master timecode. Keep your player in sync with this clock.
          </p>
        </div>

        {/* Host Play / Pause / Start Controls */}
        <div className="ticker-host-actions">
          {isHost && (
            <>
              {state.playing && (
                <button
                  type="button"
                  className="host-clock-pause-btn"
                  onClick={() => send?.("external:pause")}
                  title="Pause the shared clock for everyone"
                >
                  <Icon name="pause" size={14} />
                  <span>Pause for everyone</span>
                </button>
              )}
              {!state.externalStarted && (
                <button
                  type="button"
                  className="host-clock-start-btn external-countdown-button"
                  disabled={!onlineMembers.length || readyMembers.length !== onlineMembers.length}
                  onClick={() => send?.("external:countdown")}
                >
                  <Icon name="play" size={14} />
                  <span>Start 3-2-1 Countdown</span>
                </button>
              )}
            </>
          )}

          {!state.externalStarted && (
            <button
              type="button"
              className={`initial-ready-toggle external-ready-toggle ${externalReady ? "ready" : ""}`}
              onClick={() => setExternalReady?.(!externalReady)}
            >
              <Icon name={externalReady ? "check" : "spark"} size={13} />
              <span>{externalReady ? "I'm ready" : "Mark me ready"}</span>
            </button>
          )}
        </div>
      </section>

      {/* 4. "Where am I?" Sync Check & Local Offset Adjustment */}
      <section className="sync-check-card">
        <div className="sync-card-head">
          <div className="sync-card-title">
            <Icon name="sync" size={15} />
            <h3>Where am I? · Sync Check</h3>
          </div>
          <span className="sync-card-desc">
            Type the time currently shown on your player to see if you are ahead or behind.
          </span>
        </div>

        <div className="sync-check-inputs-row">
          <div className="sync-input-group">
            <label htmlFor="attendee-time-input">Your player time:</label>
            <div className="sync-input-wrapper">
              <input
                id="attendee-time-input"
                type="text"
                placeholder="e.g. 45:10 or 01:23:45"
                value={syncInput}
                onChange={e => setSyncInput(e.target.value)}
              />
              {syncInput && (
                <button
                  type="button"
                  className="sync-input-clear"
                  onClick={() => setSyncInput("")}
                  aria-label="Clear input"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="sync-nudge-group">
            <span className="nudge-label">Quick Nudge:</span>
            <div className="nudge-button-row">
              <button
                type="button"
                className="nudge-btn"
                onClick={() => handleNudgeOffset(-1)}
                title="Nudge your clock 1s earlier"
              >
                −1s
              </button>
              <span className="nudge-current-offset" title="Your local offset">
                {localOffset > 0 ? `+${localOffset.toFixed(1)}s` : `${(localOffset || 0).toFixed(1)}s`}
              </span>
              <button
                type="button"
                className="nudge-btn"
                onClick={() => handleNudgeOffset(1)}
                title="Nudge your clock 1s later"
              >
                +1s
              </button>
              <button
                type="button"
                className="nudge-reset-btn"
                onClick={handleResetOffset}
                title="Reset local offset back to 0"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Live Comparison Feedback */}
        {activeSyncComparison && (
          <div className={`sync-status-badge status-${activeSyncComparison.status}`}>
            <div className="badge-status-line">
              <span className="status-indicator-dot" />
              <b className="status-label">{activeSyncComparison.label}</b>
            </div>
            <p className="status-instruction">{activeSyncComparison.instruction}</p>
            <button
              type="button"
              className="sync-lock-btn"
              onClick={handleApplySyncCheck}
            >
              <Icon name="check" size={13} />
              <span>{syncReported ? "Reported to Room ✓" : "Apply offset & report to room"}</span>
            </button>
          </div>
        )}
      </section>

      {/* 5. Host "Jump / Seek together" */}
      {isHost && (
        <section className="sync-seek-card">
          <div className="sync-card-head">
            <div className="sync-card-title">
              <Icon name="swap" size={15} />
              <h3>Host: Jump / Seek Together</h3>
            </div>
            <span className="sync-card-desc">
              Change the shared timecode for everyone. All attendees will be asked to cue to this time.
            </span>
          </div>

          <form className="sync-seek-form" onSubmit={handleHostSeek}>
            <div className="seek-form-row">
              <input
                type="text"
                placeholder="Target time (e.g. 45:00 or 01:23:45)"
                value={seekInput}
                onChange={e => {
                  setSeekInput(e.target.value);
                  setSeekError("");
                }}
              />
              <button type="submit" className="seek-submit-btn">
                <span>Jump Together</span>
                <Icon name="arrow" size={13} />
              </button>
            </div>
            {seekError && <p className="seek-error-msg">{seekError}</p>}
          </form>
        </section>
      )}

      {/* 6. Readiness List & Drift Health Panel */}
      <section className="sync-health-card">
        <div className="sync-card-head">
          <div className="sync-card-title">
            <Icon name="user" size={15} />
            <h3>Room Readiness &amp; Drift Health</h3>
          </div>
          <span className="sync-card-desc">
            {readyMembers.length} of {onlineMembers.length} member(s) ready
          </span>
        </div>

        <div className="sync-members-table">
          {onlineMembers.map(member => {
            const hasCheckIn = Boolean(member.syncOffset);
            const offsetDiff = member.syncOffset?.diffSeconds;
            let offsetLabel = "not checked in yet";
            if (hasCheckIn) {
              if (member.syncOffset.status === "in-sync") {
                offsetLabel = "in sync";
              } else if (typeof offsetDiff === "number") {
                offsetLabel = offsetDiff > 0 ? `+${Math.round(offsetDiff)}s` : `${Math.round(offsetDiff)}s`;
              }
            }

            return (
              <div key={member.id} className="sync-member-row">
                <div className="member-name-cell">
                  <span className={`member-presence-dot ${member.online ? "online" : ""}`} />
                  <span className="member-name">{member.name}</span>
                  {member.id === selfId && <span className="member-self-tag">(You)</span>}
                  {member.host && <span className="member-host-tag">Host</span>}
                </div>

                <div className="member-ready-cell">
                  <span className={`ready-tag ${member.externalReady ? "is-ready" : "not-ready"}`}>
                    {member.externalReady ? "READY ✓" : "NOT READY"}
                  </span>
                </div>

                <div className="member-drift-cell">
                  <span className={`sync-status-pill ${hasCheckIn ? (member.syncOffset.status === "in-sync" ? "pill-good" : "pill-warn") : "pill-none"}`}>
                    {offsetLabel}
                  </span>
                </div>
              </div>
            );
          })}

          {!onlineMembers.length && (
            <div className="sync-empty-members">Waiting for participants to join…</div>
          )}
        </div>
      </section>

      {children}
    </div>
  );
}

export default SyncOnlyCompanion;
