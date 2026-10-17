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

export const roomId = () => `room-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 6)}`;
export const formatTime = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export const desiredPosition = (state, clientNow = Date.now(), clockOffsetMs = 0) => state.playing ? state.position + Math.max(0, clientNow + clockOffsetMs - state.updatedAt) / 1000 : state.position;
