export function estimateClockOffset({ clientSentAt, serverReceivedAt, serverSentAt, clientReceivedAt }) {
  const timestamps = [clientSentAt, serverReceivedAt, serverSentAt, clientReceivedAt];
  if (!timestamps.every(Number.isFinite)) return null;

  return ((serverReceivedAt - clientSentAt) + (serverSentAt - clientReceivedAt)) / 2;
}

export function correctionZone(drift) {
  if (!Number.isFinite(drift)) return "steady";

  const absoluteDrift = Math.abs(drift);
  if (absoluteDrift <= 0.08) return "steady";
  if (absoluteDrift <= 0.5) return "rate";
  return "seek";
}
