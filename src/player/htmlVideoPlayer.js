export function createHtmlVideoPlayer(element) {
  return {
    currentTime: () => element.currentTime,
    duration: () => element.duration,
    isPaused: () => element.paused,
    seek: position => { element.currentTime = position; },
    setPlaybackRate: rate => { element.playbackRate = rate; },
    play: () => element.play(),
    pause: () => element.pause(),
  };
}
