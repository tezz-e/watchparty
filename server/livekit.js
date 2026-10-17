import { randomBytes } from "node:crypto";
import { AccessToken, TrackSource } from "livekit-server-sdk";

const TICKET_TTL_MS = 30_000;

export function canPublishScreen(room, memberId) {
  return room.hostId === memberId || room.config.control === "shared";
}

export function createLiveKitService(env = process.env, now = Date.now) {
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();
  const rawUrl = env.LIVEKIT_URL?.trim();
  let url = null;
  try {
    const parsedUrl = new URL(rawUrl);
    if (["ws:", "wss:"].includes(parsedUrl.protocol)) url = parsedUrl.toString().replace(/\/$/, "");
  } catch {
    url = null;
  }
  const enabled = Boolean(apiKey && apiSecret && url);
  const tickets = new Map();

  function issueTicket({ roomId, memberId, name, canPublish }) {
    if (!enabled) return null;
    for (const [ticket, data] of tickets) {
      if (data.expiresAt <= now()) tickets.delete(ticket);
    }
    const ticket = randomBytes(32).toString("base64url");
    tickets.set(ticket, {
      roomId,
      memberId,
      name,
      canPublish,
      expiresAt: now() + TICKET_TTL_MS,
    });
    return ticket;
  }

  async function createToken(ticket, authorize) {
    const data = tickets.get(ticket);
    tickets.delete(ticket);
    if (!enabled || !data || data.expiresAt <= now()) return null;
    const currentAuthorization = authorize?.(data);
    if (authorize && !currentAuthorization) return null;
    const canPublish = currentAuthorization?.canPublish ?? data.canPublish;
    const name = currentAuthorization?.name ?? data.name;

    const accessToken = new AccessToken(apiKey, apiSecret, {
      identity: data.memberId,
      name,
      ttl: "5m",
    });
    accessToken.addGrant({
      roomJoin: true,
      room: data.roomId,
      canSubscribe: true,
      canPublish,
      canPublishSources: canPublish
        ? [TrackSource.SCREEN_SHARE]
        : [],
      canPublishData: false,
    });
    return { token: await accessToken.toJwt(), url, canPublish };
  }

  return { enabled, issueTicket, createToken };
}

export const liveKitService = createLiveKitService();
