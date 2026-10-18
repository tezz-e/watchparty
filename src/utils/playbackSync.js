export function estimateClockOffset({ clientSentAt, serverReceivedAt, serverSentAt, clientReceivedAt }) {
  const timestamps = [clientSentAt, serverReceivedAt, serverSentAt, clientReceivedAt];
  if (!timestamps.every(Number.isFinite)) return null;

  return ((serverReceivedAt - clientSentAt) + (serverSentAt - clientReceivedAt)) / 2;
}

export function createClockOffsetEstimator({ maxSamples = 20, lowestRttCount = 5 } = {}) {
  const samples = [];

  return {
    add(sample) {
      const timestamps = [sample.clientSentAt, sample.serverReceivedAt, sample.serverSentAt, sample.clientReceivedAt];
      if (!timestamps.every(Number.isFinite)) return null;

      const roundTripMs = (sample.clientReceivedAt - sample.clientSentAt)
        - (sample.serverSentAt - sample.serverReceivedAt);
      const offsetMs = estimateClockOffset(sample);
      if (roundTripMs < 0 || offsetMs === null) return null;

      samples.push({ roundTripMs, offsetMs });
      if (samples.length > maxSamples) samples.shift();

      const bestSamples = [...samples]
        .sort((left, right) => left.roundTripMs - right.roundTripMs)
        .slice(0, lowestRttCount)
        .map(candidate => candidate.offsetMs)
        .sort((left, right) => left - right);
      const middle = Math.floor(bestSamples.length / 2);
      return bestSamples.length % 2
        ? bestSamples[middle]
        : (bestSamples[middle - 1] + bestSamples[middle]) / 2;
    },
  };
}

export function correctionZone(drift, { supportsPlaybackRate = true, seekThreshold = 0.5 } = {}) {
  if (!Number.isFinite(drift)) return "steady";

  const absoluteDrift = Math.abs(drift);
  if (absoluteDrift <= 0.08) return "steady";
  if (!supportsPlaybackRate) return absoluteDrift <= seekThreshold ? "steady" : "seek";
  if (absoluteDrift <= 0.5) return "rate";
  return "seek";
}

export const clampLocalClockOffset = offset => Math.max(-15, Math.min(15, Math.round(offset * 4) / 4));
export const applyLocalClockOffset = (position, offset) => Math.max(0, position + offset);

export function shouldSendHeartbeat({
  hasRemote,
  playing,
  ready,
  buffering,
  drift,
  isHost,
  lastHeartbeatAt = 0,
  now = Date.now(),
  intervalMs = 2000,
  maxDrift = 2,
} = {}) {
  if (!isHost) return false;
  if (!hasRemote) return false;
  if (!playing) return false;
  if (!ready) return false;
  if (buffering) return false;
  if (typeof drift === "number" && Math.abs(drift) > maxDrift) return false;
  if (now - lastHeartbeatAt < intervalMs) return false;
  return true;
}

export function enforcePausedPlayback(player, roomPosition) {
  if (!player) return;
  const ytState = player.getPlayerState?.();
  const isPlayingOrBuffering = typeof ytState === "number"
    ? (ytState === 1 || ytState === 3)
    : (typeof player.isPaused === "function" ? !player.isPaused() : (typeof player.paused === "boolean" ? !player.paused : false));
  if (isPlayingOrBuffering) {
    player.pause();
  }
  const current = player.currentTime?.() ?? 0;
  if (Number.isFinite(current) && Number.isFinite(roomPosition) && Math.abs(roomPosition - current) > 1.0) {
    player.seek(roomPosition);
    player.pause();
  }
}

const USER_GESTURE_MIN_MS = 1200;

export function handlePlayerStateChange({
  eventState,
  roomPlaying,
  roomPosition,
  hasRemote,
  player,
  onRemotePlay,
  onRemotePause,
}) {
  // A player event long after our last programmatic command is a click inside the embed.
  const userGesture = Boolean(hasRemote) && (player?.msSinceCommand?.() ?? Infinity) > USER_GESTURE_MIN_MS;

  if (eventState === 1) {
    if (!roomPlaying) {
      if (userGesture) {
        onRemotePlay?.(player?.currentTime?.() ?? roomPosition);
        return;
      }
      player?.pause();
      const current = player?.currentTime?.() ?? 0;
      if (Number.isFinite(roomPosition) && Math.abs(current - roomPosition) > 1.0) {
        player?.seek(roomPosition);
        player?.pause();
      }
    }
  } else if (eventState === 3) {
    if (!roomPlaying && !userGesture) {
      player?.pause();
    }
  } else if (eventState === 2) {
    if (hasRemote && roomPlaying) {
      onRemotePause?.(player?.currentTime?.() ?? roomPosition);
    } else if (!hasRemote && roomPlaying) {
      player?.play();
    }
  }
}


