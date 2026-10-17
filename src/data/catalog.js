export const tints = ["lime", "coral", "violet", "sky"];

export const demoSource = "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

export const catalog = [
  { id: "blazes", title: "For Bigger Blazes", category: "Adventure", duration: "0:15", source: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", note: "Open media sample", tone: "sunset", moods: ["energetic", "thrilling"] },
  { id: "escapes", title: "For Bigger Escapes", category: "Travel", duration: "0:15", source: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4", note: "Open media sample", tone: "ocean", moods: ["cozy", "uplifting"] },
  { id: "joyrides", title: "For Bigger Joyrides", category: "Road trip", duration: "0:15", source: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4", note: "Open media sample", tone: "lime", moods: ["playful", "energetic"] },
  { id: "meltdowns", title: "For Bigger Meltdowns", category: "Drama", duration: "0:15", source: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4", note: "Open media sample", tone: "violet", moods: ["cozy", "thrilling"] },
  { id: "bunny", title: "Big Buck Bunny", category: "Animation", duration: "9:56", source: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", note: "Blender open movie", tone: "amber", moods: ["playful", "uplifting"] },
];

export { isMixedContent, mediaProvider, streamingPlatform, validMediaUrl, youtubeVideoId } from "../../shared/media.js";
