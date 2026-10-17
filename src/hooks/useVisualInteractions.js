import { useEffect } from "react";

export function useVisualInteractions() {
  useEffect(() => {
    let pinching = null;
    const selector = "button,.identity-card,.lobby-instrument,.profile-pill,.setup-modal,.screen-chassis,.room-drawer";
    const paint = event => {
      const element = event.target.closest(selector);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      element.dataset.glass = "";
      element.style.setProperty("--glass-x", `${((event.clientX - rect.left) / rect.width * 100).toFixed(2)}%`);
      element.style.setProperty("--glass-y", `${((event.clientY - rect.top) / rect.height * 100).toFixed(2)}%`);
    };
    const touchStart = event => {
      if (event.touches.length !== 2) return;
      const [a, b] = event.touches;
      pinching = {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        surface: document.elementFromPoint((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)?.closest(".screen-chassis"),
      };
    };
    const touchMove = event => {
      if (!pinching?.surface || event.touches.length !== 2) return;
      const [a, b] = event.touches;
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinching.surface.style.setProperty("--pinch", String(Math.max(.96, Math.min(1.08, distance / pinching.distance))));
    };
    const touchEnd = () => {
      if (pinching?.surface) pinching.surface.style.setProperty("--pinch", "1");
      pinching = null;
    };

    document.addEventListener("pointermove", paint, { passive: true });
    document.addEventListener("touchstart", touchStart, { passive: true });
    document.addEventListener("touchmove", touchMove, { passive: true });
    document.addEventListener("touchend", touchEnd, { passive: true });
    return () => {
      document.removeEventListener("pointermove", paint);
      document.removeEventListener("touchstart", touchStart);
      document.removeEventListener("touchmove", touchMove);
      document.removeEventListener("touchend", touchEnd);
    };
  }, []);
}
