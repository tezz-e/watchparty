import { formatTime } from "./watchParty.js";

export const FALLBACK_PIP_EXPLANATION =
  "Floating timer requires Chrome or Edge 111+ on desktop. Tip: use a side-by-side window or open Afterglow on your phone as a remote!";

export function isDocumentPipSupported() {
  return (
    typeof window !== "undefined" &&
    "documentPictureInPicture" in window &&
    typeof window.documentPictureInPicture?.requestWindow === "function"
  );
}

export async function openDocumentPictureInPicture({ width = 340, height = 260 } = {}) {
  if (!isDocumentPipSupported()) {
    throw new Error(FALLBACK_PIP_EXPLANATION);
  }
  return await window.documentPictureInPicture.requestWindow({ width, height });
}

export function getSyncGuideDismissed(roomId) {
  if (typeof window === "undefined" || !roomId) return true;
  try {
    return localStorage.getItem(`afterglow:sync-guide-dismissed:${roomId}`) === "true";
  } catch (e) {
    return false;
  }
}

export function setSyncGuideDismissed(roomId) {
  if (typeof window === "undefined" || !roomId) return;
  try {
    localStorage.setItem(`afterglow:sync-guide-dismissed:${roomId}`, "true");
  } catch (e) {}
}

export function formatTimecodeSpeech(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const parts = [];
  if (hrs > 0) parts.push(`${hrs} hour${hrs === 1 ? "" : "s"}`);
  if (mins > 0) parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} second${secs === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export function getSyncRoomTabTitle({ isSyncOnly = false, isCountdown = false, isPlaying = false, position = 0 } = {}) {
  if (!isSyncOnly) {
    return "Afterglow — Watch together";
  }
  if (isCountdown) {
    return "3… 2… 1… GO! · Afterglow";
  }
  const timecode = formatTime(position);
  if (!isPlaying) {
    return `⏸ PAUSED ${timecode} · Afterglow`;
  }
  return `▶ ${timecode} · Afterglow`;
}

export class CompanionCueManager {
  constructor() {
    this.audioCtx = null;
    this.countdownMasterGain = null;
    this.countdownTimeoutId = null;
    this.vibrateTimeoutIds = [];
    this.soundEnabled = false;
  }

  getAudioContext() {
    if (typeof window === "undefined") return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    return this.audioCtx;
  }

  async unlock() {
    this.soundEnabled = true;
    const ctx = this.getAudioContext();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn("Failed to resume AudioContext", err);
      }
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.resume?.();
        const testUtterance = new SpeechSynthesisUtterance("");
        testUtterance.volume = 0.01;
        window.speechSynthesis.speak(testUtterance);
      } catch (err) {
        console.warn("Failed to unlock SpeechSynthesis", err);
      }
    }
    return true;
  }

  disableSound() {
    this.soundEnabled = false;
    this.cancelCountdownCues();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
  }

  toggleSound() {
    if (this.soundEnabled) {
      this.disableSound();
      return false;
    }
    this.unlock();
    return true;
  }

  playTone(frequency, startTime, duration = 0.15, gainVal = 0.25, destination = null) {
    const ctx = this.getAudioContext();
    if (!ctx || !this.soundEnabled) return null;
    const dest = destination || ctx.destination;
    const now = ctx.currentTime;
    const when = Math.max(now, startTime);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, when);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(gainVal, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(when);
    osc.stop(when + duration + 0.05);
    return osc;
  }

  playChime(startTime, destination = null) {
    const ctx = this.getAudioContext();
    if (!ctx || !this.soundEnabled) return;
    const dest = destination || ctx.destination;
    const now = ctx.currentTime;
    const when = Math.max(now, startTime);

    // Triumphant chime at 880Hz primary with rich harmonics
    const notes = [
      { freq: 880, delay: 0, duration: 0.75, vol: 0.32 },
      { freq: 1320, delay: 0.03, duration: 0.65, vol: 0.22 },
      { freq: 1760, delay: 0.06, duration: 0.55, vol: 0.16 },
    ];

    notes.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = when + note.delay;

      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(note.vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + note.duration);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(t);
      osc.stop(t + note.duration + 0.05);
    });
  }

  scheduleCountdownCues({ startsAt, getServerNow }) {
    if (!this.soundEnabled) return;
    this.cancelCountdownCues();

    const ctx = this.getAudioContext();
    const nowServer = getServerNow ? getServerNow() : Date.now();
    const delayMs = startsAt - nowServer;
    const delaySec = delayMs / 1000;

    if (delaySec < 0) return;

    if (ctx) {
      this.countdownMasterGain = ctx.createGain();
      this.countdownMasterGain.gain.setValueAtTime(1, ctx.currentTime);
      this.countdownMasterGain.connect(ctx.destination);

      const targetAudioTime = ctx.currentTime + delaySec;

      // 3: 440 Hz
      const t3 = targetAudioTime - 3.0;
      if (t3 >= ctx.currentTime) {
        this.playTone(440, t3, 0.18, 0.25, this.countdownMasterGain);
      }

      // 2: 550 Hz
      const t2 = targetAudioTime - 2.0;
      if (t2 >= ctx.currentTime) {
        this.playTone(550, t2, 0.18, 0.25, this.countdownMasterGain);
      }

      // 1: 660 Hz
      const t1 = targetAudioTime - 1.0;
      if (t1 >= ctx.currentTime) {
        this.playTone(660, t1, 0.18, 0.25, this.countdownMasterGain);
      }

      // 0 / GO: 880 Hz triumphant chime
      const t0 = targetAudioTime;
      if (t0 >= ctx.currentTime) {
        this.playChime(t0, this.countdownMasterGain);
      }
    }

    // Web Speech API
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        if (delaySec >= 2.0) {
          const resumingUtterance = new SpeechSynthesisUtterance("Resuming in 3, 2, 1");
          resumingUtterance.rate = 1.05;
          window.speechSynthesis.speak(resumingUtterance);
        }

        const goDelayMs = Math.max(0, delayMs);
        this.countdownTimeoutId = setTimeout(() => {
          try {
            const goUtterance = new SpeechSynthesisUtterance("Go!");
            goUtterance.rate = 1.1;
            window.speechSynthesis.speak(goUtterance);
          } catch (e) {}

          // Vibration on 0 / GO
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate?.([100, 50, 100]);
          }
        }, goDelayMs);
      } catch (e) {}
    }

    // Vibration on 3, 2, 1
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      [3, 2, 1].forEach(sec => {
        const stepDelay = delayMs - sec * 1000;
        if (stepDelay >= 0) {
          const id = setTimeout(() => {
            navigator.vibrate?.(60);
          }, stepDelay);
          this.vibrateTimeoutIds.push(id);
        }
      });
    }
  }

  cancelCountdownCues() {
    if (this.countdownMasterGain) {
      try {
        const ctx = this.getAudioContext();
        if (ctx) {
          this.countdownMasterGain.gain.setValueAtTime(0, ctx.currentTime);
          this.countdownMasterGain.disconnect();
        }
      } catch (e) {}
      this.countdownMasterGain = null;
    }

    if (this.countdownTimeoutId) {
      clearTimeout(this.countdownTimeoutId);
      this.countdownTimeoutId = null;
    }

    if (this.vibrateTimeoutIds.length > 0) {
      this.vibrateTimeoutIds.forEach(id => clearTimeout(id));
      this.vibrateTimeoutIds = [];
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
  }

  playPauseCue(formattedTimecode) {
    if (!this.soundEnabled) return;
    const ctx = this.getAudioContext();
    if (ctx) {
      const now = ctx.currentTime;
      this.playTone(480, now, 0.12, 0.2);
      this.playTone(360, now + 0.14, 0.18, 0.2);
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const text = `Paused at ${formattedTimecode}`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (e) {}
    }
  }
}

export function triggerVibration(pattern = [100, 50, 100]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

export function createWakeLockController() {
  let wakeLock = null;
  let active = false;

  async function acquire() {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return null;
    if (document.visibilityState !== "visible" || !active) return null;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      return wakeLock;
    } catch (err) {
      return null;
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible" && active) {
      acquire();
    }
  }

  return {
    start() {
      active = true;
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibilityChange);
      }
      return acquire();
    },
    stop() {
      active = false;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
      }
    },
    isActive() {
      return Boolean(wakeLock && !wakeLock.released);
    },
  };
}
