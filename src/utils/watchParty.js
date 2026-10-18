export function createMemberId() {
  if (typeof window !== "undefined") {
    if (!window.name) {
      window.name = `tab-${globalThis.crypto?.randomUUID?.().replaceAll("-", "") || Math.random().toString(36).slice(2)}`;
    }
    const key = `afterglow-member-id-${window.name}`;
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.().replaceAll("-", "") || `member${Math.random().toString(36).slice(2)}${Date.now()}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  }
  return `member${Math.random().toString(36).slice(2)}${Date.now()}`;
}

export function fuzzyMatch(text, query) {
  const needle = query.toLowerCase().trim().replace(/\s+/g, " ");
  if (!needle) return true;
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const queryWords = needle.split(/[^a-z0-9]+/).filter(Boolean);
  return queryWords.every(queryWord => words.some(word => {
    if (word.includes(queryWord) || queryWord.includes(word)) return true;
    if (Math.abs(word.length - queryWord.length) > 1) return false;
    let previous = Array.from({ length: word.length + 1 }, (_, index) => index);
    for (let row = 1; row <= queryWord.length; row += 1) {
      const current = [row];
      for (let column = 1; column <= word.length; column += 1) {
        current[column] = Math.min(
          current[column - 1] + 1,
          previous[column] + 1,
          previous[column - 1] + (queryWord[row - 1] === word[column - 1] ? 0 : 1),
        );
      }
      previous = current;
    }
    return previous[word.length] <= (queryWord.length < 5 ? 1 : 2);
  }));
}

export const roomId = () => `room-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).padStart(6, "0").slice(0, 6)}`;
export const formatTime = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export const desiredPosition = (state, clientNow = Date.now(), clockOffsetMs = 0) => state.playing ? state.position + Math.max(0, clientNow + clockOffsetMs - state.updatedAt) / 1000 : state.position;

export function parseRoomCode(input) {
  if (typeof input !== "string") return null;
  let code = input.trim();
  if (!code) return null;

  if (code.includes("?") || code.includes("://") || code.includes("/") || code.includes("&")) {
    try {
      const url = new URL(code, "https://afterglow.local");
      const roomParam = url.searchParams.get("room");
      if (roomParam !== null) {
        code = roomParam.trim();
      } else {
        const lastSegment = url.pathname.split("/").filter(Boolean).pop();
        if (lastSegment && /^room-[a-z0-9]{6}$/i.test(lastSegment)) {
          code = lastSegment.trim();
        }
      }
    } catch {
      const match = code.match(/[?&]room=([^&#\s]+)/i);
      if (match) {
        code = decodeURIComponent(match[1]).trim();
      }
    }
  }

  code = code.trim().toLowerCase();

  if (/^room\b/i.test(code)) {
    const suffix = code.replace(/^room\s*[-:_]?\s*/, "");
    if (/^[a-z0-9]{6}$/.test(suffix)) {
      return `room-${suffix}`;
    }
    return null;
  }

  if (/^[a-z0-9]{6}$/.test(code)) {
    return `room-${code}`;
  }

  return null;
}

