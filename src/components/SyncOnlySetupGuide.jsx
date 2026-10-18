import { useEffect, useState } from "react";
import { Icon } from "./Primitives.jsx";
import { getSyncGuideDismissed, setSyncGuideDismissed } from "../utils/companionCues.js";
export { getSyncGuideDismissed, setSyncGuideDismissed };
export function SyncOnlySetupGuide({
  isOpen,
  onClose,
  roomId,
  platformName = "Commercial Streaming",
  theme = "green",
}) {
  if (!isOpen) return null;

  const handleDismiss = () => {
    if (roomId) {
      setSyncGuideDismissed(roomId);
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" data-theme={theme} onClick={handleDismiss}>
      <div
        className="setup-modal sync-guide-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="sync-guide-title"
      >
        <div className="setup-head">
          <span className="eyebrow">
            <span />
            SYNC-ONLY SETUP GUIDE
          </span>
          <h2 id="sync-guide-title">How to Watch with {platformName}</h2>
          <p>
            Because commercial streaming services prohibit external player embedding, everyone plays
            the video in their own account. Pick the setup that fits your viewing style:
          </p>
        </div>

        <div className="sync-guide-cards">
          <div className="sync-guide-card">
            <div className="guide-card-header">
              <span className="guide-card-icon">📱</span>
              <span className="guide-card-badge">RECOMMENDATION A</span>
            </div>
            <h3>Second Device: Phone Remote</h3>
            <p>
              Open Afterglow on your phone as a handheld remote. The screen stays awake without dimming,
              and gives you vibration cues and huge one-thumb pause/resume and nudge buttons from your couch.
            </p>
          </div>

          <div className="sync-guide-card">
            <div className="guide-card-header">
              <span className="guide-card-icon">🪟</span>
              <span className="guide-card-badge">RECOMMENDATION B</span>
            </div>
            <h3>Floating Timer (PiP)</h3>
            <p>
              Pop out our always-on-top Document Picture-in-Picture timer. It floats right above your full-screen
              movie with live timecode, 3-2-1 countdown, and ±1s nudge buttons.
            </p>
          </div>

          <div className="sync-guide-card">
            <div className="guide-card-header">
              <span className="guide-card-icon">🗂</span>
              <span className="guide-card-badge">RECOMMENDATION C</span>
            </div>
            <h3>Side-by-Side Windows</h3>
            <p>
              Snap your browser with {platformName} on the left half of your screen and Afterglow on the
              right half to keep an eye on the room clock, live emoji reactions, and chat without missing a scene.
            </p>
          </div>
        </div>

        <div className="sync-guide-footer">
          <button type="button" className="primary-action sync-guide-got-it" onClick={handleDismiss}>
            Got it! <Icon name="check" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
