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

export function correctionZone(drift) {
  if (!Number.isFinite(drift)) return "steady";

  const absoluteDrift = Math.abs(drift);
  if (absoluteDrift <= 0.08) return "steady";
  if (absoluteDrift <= 0.5) return "rate";
  return "seek";
}
