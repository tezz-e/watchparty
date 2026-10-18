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
    user: "M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-8-9h16M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
    expand: "M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4",
    queue: "M4 6h16M4 12h16M4 18h10",
    transfer: "M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3-3m-3 3 3 3",
    external: "M14 4h6v6m-10 4L20 4M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6",
    device: "M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zm6 16h8m-4-4v4",
    swap: "M4 7h16m0 0-4-4m4 4-4 4M20 17H4m0 0 4 4m-4-4 4-4",
    sync: "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8m0-5v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16m0 5v-5h-5",
    search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    film: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 4h16M4 16h16M8 4v4m8-4v4M8 16v4m8-4v4",
    pip: "M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z",
    mobile: "M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-5 18a1 1 0 1 1 0-2 1 1 0 0 1 0 2z",
    help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-6v-.5m0-4.5a2 2 0 1 1 2 2c-.5.5-1 1-1 2m-.01 5h.02",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.spark} /></svg>;
}

export function Wordmark() {
  return <div className="wordmark"><span className="signal-logo"><i/><i/><i/></span><span>afterglow</span></div>;
}

export function Avatar({ name = "?", tint = "lime", small = false }) {
  return <span className={`avatar ${tint} ${small ? "small" : ""}`}>{name[0]?.toUpperCase()}</span>;
}

export function ThemeSelect({ theme, onChange }) {
  return (
    <label className="theme-select">
      <span>THEME</span>
      <select aria-label="Color theme" value={theme} onChange={event => onChange(event.target.value)}>
        <option value="green">Moss glow</option>
        <option value="amber">Amber lamp</option>
        <option value="blue">Blue hour</option>
      </select>
    </label>
  );
}

export function SoftField({ children, className = "", theme = "green" }) {
  const move = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--y", `${event.clientY - rect.top}px`);
  };
  return (
    <div onPointerMove={move} className={`soft-field ${className}`} data-theme={theme}>
      <svg style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden="true">
        <defs>
          <filter id="liquid-gooey">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      {children}
    </div>
  );
}
