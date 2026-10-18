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
  let isReady = false;
  let destroyed = false;
  let pendingState = {
    playback: null,
    seekPosition: null,
    playbackRate: null,
  };

  if (container?.isConnected === false) {
    onError("container-detached");
    return {
      ready: Promise.resolve(),
      currentTime: () => 0,
      duration: () => 0,
      getTitle: () => "",
      getPlayerState: () => -1,
      seek: () => {},
      setPlaybackRate: () => {},
      play: () => {},
      pause: () => {},
      destroy: () => {},
    };
  }

  const ready = loadApi().then(YT => {
    if (destroyed) return;
    if (container?.isConnected === false) {
      onError("container-detached");
      return;
    }
    instance = new YT.Player(container, {
      videoId,
      playerVars: { controls: 0, disablekb: 1, enablejsapi: 1, playsinline: 1, autoplay: 0, origin: typeof window === "undefined" ? "" : window.location.origin },
      events: {
        onReady: onReadyEvent => {
          if (destroyed) return;
          if (!instance && onReadyEvent?.target) {
            instance = onReadyEvent.target;
          }
          isReady = true;
          const iframe = onReadyEvent.target?.getIframe?.();
          if (iframe) {
            iframe.style.position = "absolute";
            iframe.style.inset = "0";
            iframe.style.width = "100%";
            iframe.style.height = "100%";
          }
          if (pendingState.playbackRate !== null) {
            instance?.setPlaybackRate?.(pendingState.playbackRate);
          }
          if (pendingState.seekPosition !== null) {
            instance?.seekTo?.(pendingState.seekPosition, true);
          }
          if (pendingState.playback === "play") {
            instance?.playVideo?.();
          } else if (pendingState.playback === "pause") {
            instance?.pauseVideo?.();
          }
          onReady(onReadyEvent);
        },
        onStateChange: onStateChangeEvent => {
          if (destroyed) return;
          if (pendingState.playback === "pause" && onStateChangeEvent.data === 1) {
            instance?.pauseVideo?.();
          }
          onStateChange(onStateChangeEvent);
        },
        onError: errorEvent => {
          if (destroyed) return;
          onError(errorEvent.data);
        },
        onAutoplayBlocked: () => {
          if (destroyed) return;
          onAutoplayBlocked?.();
        },
      },
    });
  }).catch(error => {
    if (!destroyed) onError("api-unavailable", error);
  });

  return {
    ready,
    currentTime: () => {
      if (instance?.getCurrentTime) {
        return instance.getCurrentTime() ?? 0;
      }
      return pendingState.seekPosition ?? 0;
    },
    duration: () => instance?.getDuration?.() ?? 0,
    getTitle: () => instance?.getVideoData?.()?.title || "",
    getPlayerState: () => {
      if (destroyed) return -1;
      return instance?.getPlayerState?.() ?? -1;
    },
    seek: position => {
      if (destroyed) return;
      pendingState.seekPosition = position;
      if (!instance?.seekTo) return;
      const result = instance.seekTo(position, true);
      if (pendingState.playback === "pause") {
        instance.pauseVideo?.();
      }
      return result;
    },
    setPlaybackRate: rate => {
      if (destroyed) return;
      pendingState.playbackRate = rate;
      if (!instance?.setPlaybackRate) return;
      return instance.setPlaybackRate(rate);
    },
    play: () => {
      if (destroyed) return;
      pendingState.playback = "play";
      if (!instance?.playVideo) return;
      return instance.playVideo();
    },
    pause: () => {
      if (destroyed) return;
      pendingState.playback = "pause";
      if (!instance?.pauseVideo) return;
      return instance.pauseVideo();
    },
    destroy: () => {
      destroyed = true;
      pendingState = { playback: null, seekPosition: null, playbackRate: null };
      instance?.destroy?.();
      instance = null;
    },
  };
}
