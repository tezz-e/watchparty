export const MAX_MEMBERS = 20;
export const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 15_000;
export const rooms = new Map();
export const disconnectTimers = new Map();

const moodOrder = ["uplifting", "cozy", "energetic", "thrilling", "playful"];

export const now = () => Date.now();

export function makeRoom(id) {
  return {
    id,
    version: 0,
    playing: false,
    position: 0,
    updatedAt: now(),
    hostId: null,
    members: new Map(),
    messages: [],
    config: { title: "Untitled watch party", source: "", control: "host" },
    playlist: [],
    poll: { question: "What should we watch next?", options: ["Keep the current pick", "Choose from the queue"], votes: {} },
    moods: {},
    telemetry: { commands: 0, driftSamples: 0, driftTotal: 0, maxDrift: 0, deliverySamples: 0, deliveryTotal: 0, deliveryTimeouts: 0 },
  };
}

export function currentPosition(room) {
  if (!room.playing) return room.position;
  return Math.max(0, room.position + (now() - room.updatedAt) / 1000);
}

export function roomSnapshot(room) {
  const moodCounts = Object.values(room.moods).reduce((counts, mood) => {
    counts[mood] = (counts[mood] || 0) + 1;
    return counts;
  }, {});
  const mood = moodOrder.reduce((leading, candidate) => {
    if ((moodCounts[candidate] || 0) > (moodCounts[leading] || 0)) return candidate;
    return leading;
  }, null);
  return {
    version: room.version,
    playing: room.playing,
    position: currentPosition(room),
    updatedAt: now(),
    hostId: room.hostId,
    config: room.config,
    playlist: room.playlist,
    poll: room.poll,
    mood: { current: mood, counts: moodCounts, voters: Object.keys(room.moods).length },
    telemetry: {
      commands: room.telemetry.commands,
      driftSamples: room.telemetry.driftSamples,
      averageDrift: room.telemetry.driftSamples ? room.telemetry.driftTotal / room.telemetry.driftSamples : null,
      maxDrift: room.telemetry.maxDrift,
      averageDeliveryRoundTripMs: room.telemetry.deliverySamples ? room.telemetry.deliveryTotal / room.telemetry.deliverySamples : null,
      deliverySamples: room.telemetry.deliverySamples,
      deliveryTimeouts: room.telemetry.deliveryTimeouts,
    },
  };
}

export function memberList(room) {
  return [...room.members.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(({ id, name, joinedAt, online, buffering }) => ({ id, name, joinedAt, online, buffering: Boolean(buffering), host: id === room.hostId }));
}

export const onlineMembers = room => [...room.members.values()].filter(member => member.online);

export function electHost(room) {
  const next = onlineMembers(room).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  room.hostId = next?.id ?? null;
}

export function clearDisconnectTimer(roomId, memberId) {
  const key = `${roomId}:${memberId}`;
  const timer = disconnectTimers.get(key);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(key);
}
