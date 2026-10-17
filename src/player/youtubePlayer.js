const API_URL = "https://www.youtube.com/iframe_api";
let apiPromise;

function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube's player API did not initialize."));
    };

    let script = document.querySelector(`script[src="${API_URL}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = API_URL;
      script.async = true;
      document.head.append(script);
    }
    script.addEventListener("error", () => reject(new Error("YouTube's player API could not be loaded.")), { once: true });
  }).catch(error => {
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}

export function youtubeErrorMessage(code) {
  if (code === 101 || code === 150) return "This video’s owner has disabled playback on other websites.";
  if (code === 100) return "This YouTube video is unavailable, private, or removed.";
  if (code === 153) return "YouTube could not verify this embed request. Check the site’s referrer settings.";
  if (code === 2) return "YouTube rejected this video ID.";
  if (code === 5) return "YouTube’s HTML5 player could not play this video.";
  if (code === "api-unavailable") return "YouTube’s player API could not be loaded. Check network access and try again.";
  return "The YouTube player could not be loaded.";
}

export function createYoutubePlayer(container, videoId, {
  onReady = () => {},
  onStateChange = () => {},
  onError = () => {},
  onAutoplayBlocked = () => {},
  loadApi = loadYouTubeIframeApi,
} = {}) {
  let instance = null;
  let destroyed = false;

  const ready = loadApi().then(YT => {
    if (destroyed) return;
    instance = new YT.Player(container, {
      videoId,
      playerVars: { controls: 0, disablekb: 1, enablejsapi: 1, playsinline: 1, origin: typeof window === "undefined" ? "" : window.location.origin },
      events: {
        onReady: onReadyEvent => {
          const iframe = onReadyEvent.target?.getIframe?.();
          if (iframe) {
            iframe.style.position = "absolute";
            iframe.style.inset = "0";
            iframe.style.width = "100%";
            iframe.style.height = "100%";
          }
          onReady(onReadyEvent);
        },
        onStateChange: onStateChangeEvent => onStateChange(onStateChangeEvent),
        onError: errorEvent => onError(errorEvent.data),
        onAutoplayBlocked: onAutoplayBlocked,
      },
    });
  }).catch(error => {
    if (!destroyed) onError("api-unavailable", error);
  });

  return {
    ready,
    currentTime: () => instance?.getCurrentTime?.() ?? 0,
    duration: () => instance?.getDuration?.() ?? 0,
    seek: position => instance?.seekTo?.(position, true),
    setPlaybackRate: rate => instance?.setPlaybackRate?.(rate),
    play: () => instance?.playVideo?.(),
    pause: () => instance?.pauseVideo?.(),
    destroy: () => {
      destroyed = true;
      instance?.destroy?.();
      instance = null;
    },
  };
}
