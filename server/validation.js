export const cleanText = (value, fallback = "", max = 120) => {
  if (typeof value !== "string") return fallback;
  return value.replace(/[<>]/g, "").trim().slice(0, max) || fallback;
};

export const validRoomId = value => typeof value === "string" && /^[a-z0-9-]{3,40}$/i.test(value);
export const validMemberId = value => typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value);

export function validMediaUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:")
      && /\.(mp4|webm)$/i.test(url.pathname);
  } catch {
    return false;
  }
}
