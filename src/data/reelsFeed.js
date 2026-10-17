import { instagramReelId } from "../../shared/media.js";

export const DEFAULT_REELS = [
  { id: "BsOGulcndj-", title: "World Record Egg", source: "https://www.instagram.com/reel/BsOGulcndj-/" },
  { id: "C2A_8yGLc3n", title: "Street Photography in Tokyo", source: "https://www.instagram.com/reel/C2A_8yGLc3n/" },
  { id: "C7c5aL8P9eO", title: "Northern Lights Magic", source: "https://www.instagram.com/reel/C7c5aL8P9eO/" },
  { id: "C-dF-3lMQ3x", title: "Blender 3D Animation Showcase", source: "https://www.instagram.com/reel/C-dF-3lMQ3x/" },
  { id: "C0n8_pSLzQf", title: "Satisfying Coffee Art Pour", source: "https://www.instagram.com/reel/C0n8_pSLzQf/" },
  { id: "DAi3eY1ovs_", title: "Nature Wildlife Moments", source: "https://www.instagram.com/reel/DAi3eY1ovs_/" },
  { id: "DB3kYq-sH9U", title: "Epic Mountain Sunset", source: "https://www.instagram.com/reel/DB3kYq-sH9U/" },
];

export function getReelsFeed(currentSource, playlist = []) {
  const currentId = currentSource ? instagramReelId(currentSource) : null;
  const feed = [];
  const seenIds = new Set();

  if (currentId) {
    seenIds.add(currentId);
    feed.push({
      id: currentId,
      title: "Active Reel",
      source: currentSource,
    });
  }

  // Include any reels from the room playlist
  for (const item of playlist) {
    const itemReelId = item.source ? instagramReelId(item.source) : null;
    if (itemReelId && !seenIds.has(itemReelId)) {
      seenIds.add(itemReelId);
      feed.push({
        id: itemReelId,
        title: item.title || "Queued Reel",
        source: item.source,
      });
    }
  }

  // Include default curated reels to ensure there's always a scrollable stream
  for (const item of DEFAULT_REELS) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      feed.push(item);
    }
  }

  return feed;
}
