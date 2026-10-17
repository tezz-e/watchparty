import { youtubeErrorMessage } from "./youtubePlayer.js";

export function hlsErrorMessage(code) {
  if (code === "hls-network" || code === "hls-cors") return "The HLS stream could not be fetched. Check that the host is online and sends CORS headers allowing this site.";
  if (code === "hls-media") return "The HLS stream was fetched, but this browser could not decode it.";
  if (code === "hls-unsupported") return "This browser does not support HLS playback.";
  if (code === "mixed-content") return "This HTTPS page cannot play an insecure HTTP video. Use an HTTPS media URL.";
  if (code === "api-unavailable") return "The HLS playback library could not be initialized.";
  return "The HLS stream could not be played.";
}

export function mediaErrorMessage(code) {
  if (code === "media-load") return "This participant’s browser could not load the media source.";
  if (typeof code === "number") return youtubeErrorMessage(code);
  if (code === "api-unavailable") return "The media player API could not be loaded. Check network access and try again.";
  return hlsErrorMessage(code);
}

function reportHlsFailure(error, onError, HlsConstructor) {
  const code = error.type === HlsConstructor.ErrorTypes.NETWORK_ERROR ? "hls-cors" :
    error.type === HlsConstructor.ErrorTypes.MEDIA_ERROR ? "hls-media" : "hls-network";
  onError(code, error);
}

export function createHlsPlayer(element, source, {
  onError = () => {},
  onBuffering = () => {},
  HlsConstructor,
} = {}) {
  let hls = null;
  let destroyed = false;
  const onWaiting = () => onBuffering(true);
  const onPlaying = () => onBuffering(false);
  element.addEventListener("waiting", onWaiting);
  element.addEventListener("playing", onPlaying);

  const nativeHls = element.canPlayType("application/vnd.apple.mpegurl");
  if (nativeHls) {
    element.src = source;
    element.load();
  }

  const ready = nativeHls ? Promise.resolve() : (HlsConstructor ? Promise.resolve(HlsConstructor) : import("hls.js").then(module => module.default))
    .then(Hls => {
      if (destroyed || nativeHls) return;
      if (!Hls.isSupported()) {
        onError("hls-unsupported");
        return;
      }
      hls = new Hls();
      hls.on(Hls.Events.ERROR, (_event, error) => {
        if (error.fatal && !destroyed) reportHlsFailure(error, onError, Hls);
      });
      hls.attachMedia(element);
      hls.loadSource(source);
    })
    .catch(error => {
      if (!destroyed) onError("api-unavailable", error);
    });

  return {
    ready,
    currentTime: () => element.currentTime,
    duration: () => element.duration,
    seek: position => { element.currentTime = position; },
    setPlaybackRate: rate => { element.playbackRate = rate; },
    play: () => element.play(),
    pause: () => element.pause(),
    destroy: () => {
      destroyed = true;
      element.removeEventListener("waiting", onWaiting);
      element.removeEventListener("playing", onPlaying);
      if (hls) hls.destroy();
      else {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
    },
  };
}
