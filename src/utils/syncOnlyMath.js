/**
 * Utilities for Sync-Only shared clock calculations and timecode parsing.
 */

/**
 * Formats a duration in seconds into a timecode string.
 * Default is mm:ss (or hh:mm:ss if >= 1 hour).
 * If forceHours is true, always outputs hh:mm:ss.
 *
 * @param {number} seconds
 * @param {boolean|{ forceHours?: boolean, standard?: boolean }} [forceHoursOrOptions=false]
 * @returns {string}
 */
export function formatTimecode(seconds = 0, forceHoursOrOptions = false) {
  const forceHours = typeof forceHoursOrOptions === "boolean"
    ? forceHoursOrOptions
    : Boolean(forceHoursOrOptions?.forceHours || forceHoursOrOptions?.standard);
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (forceHours || h > 0) {
    const hh = String(h).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Parses a timecode input string or number into seconds.
 * Accepts:
 * - seconds as number or string (e.g. 120, "120", "120s")
 * - mm:ss (e.g. "45:00", "01:05")
 * - hh:mm:ss (e.g. "01:15:30")
 * Returns null if invalid.
 *
 * @param {string|number} input
 * @returns {number|null}
 */
export function parseTimecodeInput(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  }
  if (typeof input !== "string") return null;
  const str = input.trim();
  if (!str) return null;

  // Single number with optional 's' suffix
  const secMatch = str.match(/^(\d+(?:\.\d+)?)\s*s?$/i);
  if (secMatch) {
    const val = parseFloat(secMatch[1]);
    return Number.isFinite(val) && val >= 0 ? Math.round(val) : null;
  }

  // Colon-separated parts
  const parts = str.split(":").map(p => p.trim());
  if (parts.some(p => !/^\d+(?:\.\d+)?$/.test(p))) return null;

  if (parts.length === 2) {
    const [m, s] = parts.map(Number);
    if (!Number.isFinite(m) || !Number.isFinite(s) || m < 0 || s < 0 || s >= 60) return null;
    return Math.round(m * 60 + s);
  }

  if (parts.length === 3) {
    const [h, m, s] = parts.map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s) || h < 0 || m < 0 || s < 0 || m >= 60 || s >= 60) return null;
    return Math.round(h * 3600 + m * 60 + s);
  }

  return null;
}

/**
 * Compares an attendee's local playback time with the canonical shared clock time.
 *
 * @param {number} mySeconds - Current playback position of attendee's player
 * @param {number} sharedSeconds - Authoritative shared clock position
 * @returns {{ diff: number, diffAbs: number, status: "in-sync"|"behind"|"ahead", label: string, instruction: string }}
 */
export function compareSyncOffset(mySeconds = 0, sharedSeconds = 0) {
  const my = Number.isFinite(Number(mySeconds)) ? Number(mySeconds) : 0;
  const shared = Number.isFinite(Number(sharedSeconds)) ? Number(sharedSeconds) : 0;
  const diff = my - shared;
  const diffAbs = Math.abs(diff);
  const targetTimecode = formatTimecode(shared);
  const diffText = Number.isInteger(diffAbs) ? `${diffAbs}s` : `${Number(diffAbs.toFixed(1))}s`;

  if (diff < -1) {
    return {
      diff,
      diffAbs,
      status: "behind",
      label: `You're ${diffText} behind`,
      instruction: `Skip forward ${diffText} or seek to ${targetTimecode}`,
    };
  }

  if (diff > 1) {
    return {
      diff,
      diffAbs,
      status: "ahead",
      label: `You're ${diffText} ahead`,
      instruction: `Pause for ${diffText} or seek to ${targetTimecode}`,
    };
  }

  return {
    diff,
    diffAbs,
    status: "in-sync",
    label: "In sync (±1s)",
    instruction: "You are locked with the shared clock.",
  };
}
