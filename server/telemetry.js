import { roomSnapshot } from "./rooms.js";

export function publishPlayback(io, room, payload) {
  const startedAt = process.hrtime.bigint();
  io.to(room.id).timeout(5_000).emit("playback:state", payload, error => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    if (error) room.telemetry.deliveryTimeouts += 1;
    else {
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
