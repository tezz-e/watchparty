export function createMemberId() {
  const key = "afterglow-member-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.().replaceAll("-", "") || `member${Math.random().toString(36).slice(2)}${Date.now()}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function fuzzyMatch(text, query) {
  const needle = query.toLowerCase().replace(/\s/g, "");
  if (!needle) return true;
  const haystack = text.toLowerCase();
  let offset = 0;
  for (const char of needle) {
    offset = haystack.indexOf(char, offset);
    if (offset < 0) return false;
    offset += 1;
  }
  return true;
}

export const roomId = () => `room-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 6)}`;
export const formatTime = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export const desiredPosition = (state, clientNow = Date.now(), clockOffsetMs = 0) => state.playing ? state.position + Math.max(0, clientNow + clockOffsetMs - state.updatedAt) / 1000 : state.position;
