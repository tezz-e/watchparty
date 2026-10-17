import { roomSnapshot } from "./rooms.js";

const MAX_LATENCY_SAMPLES = 10_000;
const deliveryLatenciesMs = [];
let deliverySampleCount = 0;
let deliveryTimeouts = 0;

export function recordDeliveryLatency(elapsedMs, timedOut = false) {
  if (timedOut) {
    deliveryTimeouts += 1;
    return;
  }

  deliverySampleCount += 1;
  deliveryLatenciesMs.push(Math.max(0, elapsedMs));
  if (deliveryLatenciesMs.length > MAX_LATENCY_SAMPLES) deliveryLatenciesMs.shift();
}

export function percentile(sortedValues, percentage) {
  if (sortedValues.length === 0) return null;
  return sortedValues[Math.ceil(percentage * sortedValues.length) - 1];
}

export function serverLatencyMetrics() {
  const sortedValues = [...deliveryLatenciesMs].sort((a, b) => a - b);
  return {
    sampleCount: deliverySampleCount,
    windowSampleCount: sortedValues.length,
    timeoutCount: deliveryTimeouts,
    p50Ms: percentile(sortedValues, 0.5),
    p95Ms: percentile(sortedValues, 0.95),
    p99Ms: percentile(sortedValues, 0.99),
  };
}

export function publishPlayback(io, room, payload) {
  const startedAt = process.hrtime.bigint();
  io.to(room.id).timeout(5_000).emit("playback:state", payload, error => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    recordDeliveryLatency(elapsedMs, Boolean(error));
    if (error) {
      room.telemetry.deliveryTimeouts += 1;
    } else {
      room.telemetry.deliverySamples += 1;
      room.telemetry.deliveryTotal += elapsedMs;
    }
    io.to(room.id).emit("room:telemetry", roomSnapshot(room).telemetry);
  });
}

export function serverTelemetry(rooms) {
  return [...rooms.values()].reduce((total, room) => {
    total.playbackCommands += room.telemetry.commands;
    total.driftSamples += room.telemetry.driftSamples;
    total.deliveryTimeouts += room.telemetry.deliveryTimeouts;
    return total;
  }, { playbackCommands: 0, driftSamples: 0, deliveryTimeouts: 0 });
}
