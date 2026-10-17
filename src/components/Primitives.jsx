export function Icon({ name, size = 18 }) {
  const paths = {
    arrow: "M5 12h13m-5-5 5 5-5 5",
    plus: "M12 5v14M5 12h14",
    link: "m9 15 6-6m-7.5 10.5-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0m9.5-1 1-1a3.5 3.5 0 0 0-5-5l-3 3a3.5 3.5 0 0 0 0 5",
    play: "m9 6 10 6-10 6V6Z",
    pause: "M9 6h2.5v12H9zm4.5 0H16v12h-2.5z",
    send: "m21 3-7.3 18-3.2-7.5L3 10.4 21 3Zm-10.5 10.5L21 3",
    close: "m6 6 12 12M18 6 6 18",
    spark: "m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z",
    check: "m5 12 4 4L19 6",
    sound: "M4 10v4h3l4 3V7l-4 3m3.5.5a3 3 0 0 1 0 3m2-5a6 6 0 0 1 0 7",
    chevron: "m8 10 4 4 4-4",
    share: "M12 16V3m0 0L7 8m5-5 5 5M5 14v5h14v-5",
    user: "M20 21a8 8 0 0 0-16 0m12-13a4 4 0 1 1-8 0 0 1 8 0Z",
    globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-8-9h16M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
    expand: "M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4",
    queue: "M4 6h16M4 12h16M4 18h10",
    transfer: "M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3-3m-3 3 3 3",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.spark} /></svg>;
}

export function Wordmark() {
  return <div className="wordmark"><span className="signal-logo"><i/><i/><i/></span><span>afterglow</span></div>;
}

export function Avatar({ name = "?", tint = "lime", small = false }) {
  return <span className={`avatar ${tint} ${small ? "small" : ""}`}>{name[0]?.toUpperCase()}</span>;
}

export function SoftField({ children, className = "" }) {
  const move = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--y", `${event.clientY - rect.top}px`);
  };
  return <div onPointerMove={move} className={`soft-field ${className}`}>{children}</div>;
}
