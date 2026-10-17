import { networkInterfaces } from "node:os";
import { isIPv4 } from "node:net";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function firstLanAddress(interfaces) {
  for (const addresses of Object.values(interfaces)) {
    const address = addresses?.find(candidate =>
      candidate.family === "IPv4"
      && !candidate.internal
      && !candidate.address.startsWith("169.254.")
    );
    if (address) return address.address;
  }
  return null;
}

export function getInviteOrigin({ publicUrl, lanIp, origin, protocol, host, interfaces = networkInterfaces() }) {
  if (publicUrl) {
    const configured = new URL(publicUrl);
    if (!["http:", "https:"].includes(configured.protocol)) {
      throw new Error("AFTERGLOW_PUBLIC_URL must use HTTP or HTTPS.");
    }
    return configured.origin;
  }

  const requestOrigin = origin ? new URL(origin) : new URL(`${protocol}://${host}`);
  if (!["http:", "https:"].includes(requestOrigin.protocol)) {
    throw new Error("Invite origins must use HTTP or HTTPS.");
  }
  if (!loopbackHosts.has(requestOrigin.hostname)) return requestOrigin.origin;

  if (lanIp && (!isIPv4(lanIp) || lanIp.startsWith("127.") || lanIp.startsWith("169.254."))) {
    throw new Error("AFTERGLOW_LAN_IP must be a reachable non-loopback IPv4 address.");
  }
  const lanAddress = lanIp || firstLanAddress(interfaces);
  if (!lanAddress) return requestOrigin.origin;

  requestOrigin.hostname = lanAddress;
  return requestOrigin.origin;
}
