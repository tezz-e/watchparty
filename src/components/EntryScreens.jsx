import { useEffect, useRef, useState } from "react";
import { isMixedContent, mediaProvider, streamingPlatform, tints, validMediaUrl, youtubeVideoId } from "../data/catalog.js";
import { catalog, catalogAvailability, catalogCategories, catalogGenres, catalogSnapshot, externalPlatformUrl, getCatalogBadge, searchCatalog, syncServices } from "../data/localCatalog.js";
import { parseRoomCode, roomId } from "../utils/watchParty.js";
import { serverUrl } from "../utils/serverUrl.js";
import { fetchMediaTitle } from "../utils/mediaTitle.js";
import { Avatar, Icon, SoftField, ThemeSelect, Wordmark } from "./Primitives.jsx";

export function Identity({ onContinue, theme, onThemeChange }) {
  const [name, setName] = useState("");
  const [tint, setTint] = useState("lime");

  return (
    <SoftField className="identity-page" theme={theme}>
      <div className="identity-nav"><Wordmark/><span className="nav-note">SYNCED VIEWING, WITHOUT THE FUSS</span><ThemeSelect theme={theme} onChange={onThemeChange}/></div>
      <div className="identity-grid">
        <section className="identity-copy">
          <p className="eyebrow"><span/>YOUR REMOTE, EVERYWHERE</p>
          <h1>Better nights<br/>start together.</h1>
          <p className="lede">A shared screen with a server held playhead. Your browser only stores a name and a local room identity.</p>
          <div className="principles"><span><i>01</i> no account required</span><span><i>02</i> direct media, locally loaded</span><span><i>03</i> everybody stays in sync</span></div>
        </section>
        <section className="identity-card signal-border">
          <div className="identity-card-head"><span className="eyebrow">SET YOUR PRESENCE</span><h2>What should we call you?</h2><p>You’ll use this local identity to reconnect to rooms after a drop.</p></div>
          <label className="field-label">DISPLAY NAME<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Your name or nickname" maxLength="28"/></label>
          <div className="tint-row"><span>YOUR SIGNAL COLOUR</span><div>{tints.map(color => <button type="button" key={color} className={`tint-dot ${color} ${tint === color ? "selected" : ""}`} onClick={() => setTint(color)} aria-label={`Choose ${color}`}>{tint === color && <Icon name="check" size={12}/>}</button>)}</div></div>
          <button className="primary-action" disabled={!name.trim()} onClick={() => onContinue({ name: name.trim(), tint })}>Enter the control room <Icon name="arrow"/></button>
          <p className="quiet-note">No account, password, or video is uploaded to Afterglow.</p>
        </section>
      </div>
    </SoftField>
  );
}

export function Lobby({ profile, onCreate, onJoin, theme, onThemeChange, recentRoom }) {
  const [join, setJoin] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleJoinSubmit = async event => {
    event.preventDefault();
    const raw = code;
    if (!raw.trim()) return;

    const parsedId = parseRoomCode(raw);
    if (!parsedId) {
      setError("Invalid room code format. Enter a 6-character code, room-xxxxxx, or invite link.");
      return;
    }

    setChecking(true);
    setError("");

    try {
      const response = await fetch(`${serverUrl}/api/rooms/${encodeURIComponent(parsedId)}`);
      if (response.status === 404) {
        setError("That room does not exist or has expired.");
        return;
      }
      if (!response.ok) {
        setError("That room does not exist or has expired.");
        return;
      }
      const data = await response.json();
      if (data?.exists) {
        onJoin(parsedId);
      } else {
        setError("That room does not exist or has expired.");
      }
    } catch {
      setError("That room does not exist or has expired.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <SoftField className="lobby-page" theme={theme}>
      <header className="lobby-nav"><Wordmark/><div className="nav-center"><span className="live-pulse"/>REALTIME READY</div><div className="lobby-profile-actions"><ThemeSelect theme={theme} onChange={onThemeChange}/><div className="profile-pill"><Avatar name={profile.name} tint={profile.tint} small/><span>{profile.name}</span></div></div></header>
      <main className="lobby-main">
        <section className="lobby-hero">
          <p className="eyebrow"><span/>CONTROL ROOM</p>
          <h1>Good evening,<br/><em>{profile.name}.</em></h1>
          <p>Create a room with an open playable URL, or join an invitation someone has already shared.</p>
          <div className="lobby-actions">
            <button className="primary-action" onClick={onCreate}><Icon name="plus"/> Start a room</button>
            <button className="secondary-action" onClick={() => { setJoin(!join); setError(""); }}><Icon name="link"/> Join with a code</button>
            {recentRoom?.id && (
              <button
                type="button"
                className="secondary-action"
                style={{ borderColor: "var(--theme-border, #94bb60)", color: "var(--theme-highlight, #d7ff9a)" }}
                onClick={() => onJoin(recentRoom.id)}
                title="Rejoin the room you were recently in"
              >
                <Icon name="play" size={14} /> Rejoin {recentRoom.title ? `"${recentRoom.title}"` : "Room"}
              </button>
            )}
          </div>
          {join && (
            <div className="join-container" style={{ width: "min(390px, 100%)", marginTop: "14px" }}>
              <form className="join-tray" onSubmit={handleJoinSubmit} style={{ marginTop: 0 }}>
                <input
                  autoFocus
                  value={code}
                  onChange={event => {
                    setCode(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder="room-xxxxxx, code, or invite URL"
                  disabled={checking}
                />
                <button type="submit" disabled={checking || !code.trim()}>
                  {checking ? "Checking..." : <>Join <Icon name="arrow" size={16}/></>}
                </button>
              </form>
              {error && (
                <p
                  className="join-error"
                  role="alert"
                  style={{
                    color: "#ff7b7b",
                    fontSize: "11px",
                    fontFamily: "'DM Mono', monospace",
                    marginTop: "8px",
                    letterSpacing: "0.5px",
                  }}
                >
                  {error}
                </p>
              )}
            </div>
          )}
        </section>
        <section className="lobby-instrument">
          <div className="instrument-top"><span>HOW A ROOM WORKS</span><b>01: SERVER CLOCK</b></div>
          <div className="oscilloscope">{Array.from({ length: 12 }, (_, index) => <i key={index}/>)}</div>
          <div className="instrument-readout"><div><span>CONTROL</span><b><i/> host or shared</b></div><div><span>REJOIN WINDOW</span><b>15 sec</b></div><div><span>CAPACITY</span><b>20 people</b></div></div>
        </section>
      </main>
      <section className="flow-strip"><div><b>01</b><span>Pick a name once</span></div><i/><div><b>02</b><span>Choose media</span></div><i/><div><b>03</b><span>Send one link</span></div><i/><div><b>04</b><span>Press play together</span></div></section>
    </SoftField>
  );
}

function useLocalLibrary() {
  const [localItems, setLocalItems] = useState([]);
  const [libraryError, setLibraryError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const loadLibrary = async () => {
      try {
        const response = await fetch(`${serverUrl}/api/library`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Library request failed with HTTP ${response.status}.`);
        const items = await response.json();
        if (!Array.isArray(items)) throw new Error("Library response was not a list.");
        setLocalItems(items.map(item => ({ ...item, source: `${serverUrl}${item.source}` })));
        setLibraryError("");
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Unable to load the local media library.", error);
        setLibraryError("The local media library could not be loaded. Check that the watch-party server is running.");
      }
    };
    loadLibrary();
    return () => controller.abort();
  }, []);

  return { localItems, libraryError };
}

export function Discovery({ query, setQuery, category, setCategory, onSelect, onSyncOnly, action = "Add to queue" }) {
  const { localItems, libraryError } = useLocalLibrary();
  const [genre, setGenre] = useState("All");
  const [sort, setSort] = useState("title");
  const [syncService, setSyncService] = useState(syncServices[0]);
  const localFilenames = new Set(localItems.map(item => decodeURIComponent(item.source.split("/").pop())));
  const catalogItems = catalog.map(item => {
    const hasLocal = Boolean(item.filename && localFilenames.has(item.filename));
    const hasRemote = Boolean(item.source);
    const isAvailable = hasLocal || hasRemote;
    const effectiveSource = hasLocal
      ? `${serverUrl}/media/${encodeURIComponent(item.filename)}`
      : (item.source || "");

    let effectiveAvailability;
    if (hasLocal) {
      effectiveAvailability = ["Available in this room's local library"];
    } else if (hasRemote) {
      effectiveAvailability = item.availability?.length ? item.availability : ["Direct public stream"];
    } else {
      effectiveAvailability = catalogAvailability(item, localFilenames);
    }

    return {
      ...item,
      available: isAvailable,
      source: effectiveSource,
      hasPlayableSource: isAvailable,
      availability: effectiveAvailability,
      note: `${item.year}${item.rating === null ? "" : ` · ${item.rating.toFixed(1)}/10`} · ${(item.genres || []).join(", ")}`,
    };
  });
  const catalogFileNames = new Set(catalog.map(item => item.filename));
  const extraLibraryItems = localItems
    .filter(item => !catalogFileNames.has(decodeURIComponent(item.source.split("/").pop())))
    .map(item => ({ ...item, available: true, hasPlayableSource: true, availability: ["Available in this room's local library"] }));
  const availableItems = [...catalogItems, ...extraLibraryItems];
  const categories = ["All", ...new Set([...catalogCategories(), ...extraLibraryItems.map(item => item.category)])];
  const genres = ["All", ...new Set([...catalogGenres(), ...extraLibraryItems.flatMap(item => item.genres || [])])];
  const picks = searchCatalog(availableItems, { query, category, genre, sort });

  return (
    <section className="discovery">
      <div className="discovery-head"><div><span className="eyebrow"><span/>OFFLINE-FIRST DISCOVERY</span><h3>Find the room’s next story.</h3></div><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search titles, genres, typos"/></div>
      <div className="category-row">{categories.map(item => <button type="button" key={item} onClick={() => setCategory(item)} className={category === item ? "active" : ""}>{item}</button>)}</div>
      <div className="discovery-filters">
        <label>GENRE<select value={genre} onChange={event => setGenre(event.target.value)}>{genres.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>SORT<select value={sort} onChange={event => setSort(event.target.value)}><option value="title">Title A–Z</option><option value="year">Newest first</option><option value="rating">Rating</option></select></label>
        {onSyncOnly && <label>SYNC SERVICE<select value={syncService} onChange={event => setSyncService(event.target.value)}>{syncServices.map(item => <option key={item}>{item}</option>)}</select></label>}
      </div>
      <div className="catalog-grid">
        {picks.map(item => {
          const syncLink = externalPlatformUrl(syncService);
          const hasPlayableSource = item.available;
          const hasTrailer = Boolean(item.trailerKey);
          const trailerSource = hasTrailer ? `https://www.youtube.com/watch?v=${item.trailerKey}` : "";
          const badge = getCatalogBadge(item, localFilenames);

          const availableSyncOptions = (item.availability || [])
            .map(name => ({ name, url: externalPlatformUrl(name) }))
            .filter(s => Boolean(s.url));
          const syncOptions = availableSyncOptions.length > 0
            ? availableSyncOptions
            : (syncLink ? [{ name: syncService, url: syncLink }] : []);

          const handleCardClick = () => {
            if (hasPlayableSource) {
              onSelect(item);
            } else if (hasTrailer) {
              onSelect({
                ...item,
                title: `${item.title} (Trailer)`,
                source: trailerSource,
                category: item.category,
                duration: "--:--",
              });
            }
          };

          return (
            <article className="catalog-entry" key={item.id}>
              <button
                type="button"
                className={`catalog-card ${item.tone}`}
                onClick={handleCardClick}
                disabled={!hasPlayableSource && !hasTrailer}
                aria-label={
                  hasPlayableSource
                    ? `${action}: ${item.title}`
                    : hasTrailer
                      ? `Watch trailer together: ${item.title}`
                      : `${item.title}: Full movie requires subscription`
                }
              >
                <span className="catalog-art">
                  <img src={item.poster || "/catalog/posters/big-buck-bunny.svg"} alt="" loading="lazy"/>
                  <span>{item.category}</span>
                  <b>{item.year || item.duration}</b>
                  <span className={`catalog-pill-badge ${badge.className}`}>{badge.label}</span>
                </span>
                <span className="catalog-info">
                  <small>{item.note}</small>
                  <strong>{item.title}</strong>
                  <span className="catalog-overview">{item.overview}</span>
                  <span className={hasPlayableSource ? "catalog-availability available" : "catalog-availability"}>
                    {hasPlayableSource
                      ? item.availability?.join(" · ")
                      : `Streaming on: ${(item.availability || []).join(", ") || "Subscription services"}`}
                  </span>
                  {!hasPlayableSource && (
                    <span
                      className="catalog-subscription-notice"
                      style={{
                        display: "block",
                        color: "var(--theme-highlight, #d7ff9a)",
                        fontSize: "8.5px",
                        fontFamily: "'DM Mono', monospace",
                        lineHeight: "1.3",
                        margin: "2px 0 6px"
                      }}
                    >
                      Full movie requires a streaming subscription; trailer plays directly here.
                    </span>
                  )}
                  {item.attribution && (
                    <small
                      className="catalog-entry-attribution"
                      style={{
                        display: "block",
                        color: "var(--theme-dim, #7f8a7c)",
                        fontSize: "7.5px",
                        fontFamily: "'DM Mono', monospace",
                        margin: "2px 0 4px",
                        opacity: 0.8
                      }}
                    >
                      {item.attribution} {item.license ? `· ${item.license}` : ""}
                    </small>
                  )}
                  <span className="catalog-select">
                    {hasPlayableSource ? (
                      <><Icon name="plus" size={14}/>{action}</>
                    ) : hasTrailer ? (
                      <><Icon name="play" size={14}/>Watch trailer together</>
                    ) : (
                      "Subscription required · No trailer"
                    )}
                  </span>
                </span>
              </button>
              {onSyncOnly && (
                <div className="catalog-service-actions">
                  {!hasPlayableSource && syncOptions.length > 0 ? (
                    syncOptions.slice(0, 2).map(service => (
                      <button
                        type="button"
                        key={service.name}
                        onClick={() => onSyncOnly(item, service)}
                        title={`Start sync-only room with countdown for ${service.name} (plays on your own subscription)`}
                      >
                        <Icon name="external" size={12}/>Sync-only room (countdown) · {service.name}
                      </button>
                    ))
                  ) : (
                    syncLink && (
                      <button type="button" onClick={() => onSyncOnly(item, { name: syncService })}>
                        <Icon name="external" size={12}/>Start sync-only with {syncService}
                      </button>
                    )
                  )}
                </div>
              )}
            </article>
          );
        })}
        {libraryError && <p className="catalog-empty">{libraryError}</p>}
        {!picks.length && <p className="catalog-empty">No close matches. Try another title or category.</p>}
      </div>
      <p className="catalog-attribution">
        <a href="https://www.themoviedb.org/about/logos-attribution" target="_blank" rel="noreferrer" aria-label="TMDB logos and attribution">
          <img src="/catalog/tmdb-blue-long-2.svg" alt="TMDB"/>
        </a>
        <span>Snapshot: {catalogSnapshot.region} · {catalogSnapshot.snapshotDate}. This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB. Streaming availability data by JustWatch.</span>
      </p>
    </section>
  );
}

export function CreateRoom({ onClose, onEnter, theme = "green" }) {
  const [title, setTitle] = useState("Friday, but make it quiet");
  const [source, setSource] = useState("");
  const [control, setControl] = useState("host");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const userEditedTitle = useRef(false);
  const titleEditCountRef = useRef(0);
  const currentSourceRef = useRef("");
  const validSource = validMediaUrl(source);
  const provider = mediaProvider(source);
  const platform = streamingPlatform(source);
  const mixedContent = isMixedContent(source, window.location.protocol);
  const canCreate = validSource && !mixedContent && Boolean(title.trim());
  const providerLabel = provider === "youtube" ? "YOUTUBE VIDEO URL" : provider === "hls" ? "HLS STREAM URL" : provider === "external" ? `${platform?.name.toUpperCase()} LINK` : "VIDEO URL";

  const handleSourceChange = async event => {
    const nextSource = event.target.value;
    setSource(nextSource);
    currentSourceRef.current = nextSource;
    if (youtubeVideoId(nextSource)) {
      const defaultTitles = new Set(["Friday, but make it quiet", "Blender Nature Short", "Blender Foundation - Big Buck Bunny 4K", "YouTube Video"]);
      if (!userEditedTitle.current || defaultTitles.has(title) || !title.trim()) {
        const initialTitleEdits = titleEditCountRef.current;
        setIsFetchingTitle(true);
        const resolved = await fetchMediaTitle(nextSource);
        setIsFetchingTitle(false);
        if (currentSourceRef.current !== nextSource) return;
        if (titleEditCountRef.current !== initialTitleEdits) return;
        if (resolved) setTitle(resolved);
      }
    }
  };

  return (
    <div className="modal-backdrop" data-theme={theme}>
      <form className="setup-modal setup-modal-wide" onSubmit={event => { event.preventDefault(); if (canCreate) onEnter({ id: roomId(), title, source, control, kind: provider, create: true }); }}>
        <button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button>
        <div className="setup-head"><span className="eyebrow"><span/>NEW SESSION</span><h2>Pick the signal first.</h2><p>Each viewer plays the same source locally. Afterglow synchronizes timing and room activity, never the video file.</p></div>
        <label className="field-label">ROOM NAME<input value={title} onChange={event => { userEditedTitle.current = true; titleEditCountRef.current += 1; setTitle(event.target.value); }} maxLength="56"/></label>
        <label className="field-label">
          <span>{providerLabel}</span>
          {isFetchingTitle && <small style={{ float: "right", color: "var(--theme-highlight, #d7ff9a)", font: "9px DM Mono" }}>Fetching video title…</small>}
          <input value={source} onChange={handleSourceChange} placeholder="Paste a video, YouTube, or streaming URL" aria-invalid={Boolean(source) && !validSource}/>
        </label>
        <div className="quick-source-pills">
          <span>Quick try:</span>
          <button type="button" onClick={() => { setTitle("Blender Foundation - Big Buck Bunny 4K"); setSource("https://www.youtube.com/watch?v=aqz-KE-bpKQ"); userEditedTitle.current = false; }}>
            ▶️ YouTube Video
          </button>
          <button type="button" onClick={() => { setTitle("Big Buck Bunny"); setSource("https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4"); userEditedTitle.current = false; }}>
            🎬 Direct MP4
          </button>
        </div>
        {source && !validSource && <p className="source-error">Use a direct HTTP(S) .mp4/.webm/.m3u8 URL, a supported YouTube link, or a recognized streaming-service link.</p>}
        {mixedContent && <p className="source-error">This HTTPS page cannot play an insecure HTTP stream. Use an HTTPS media URL.</p>}
        {provider === "youtube" && <p className="source-note">YouTube’s official embed player will be used. Some videos cannot be embedded by their owner.</p>}
        {provider === "hls" && !mixedContent && <p className="source-note">HLS plays through the browser’s native player or hls.js. The media host must allow cross-origin requests from this site.</p>}
        {provider === "external" && <p className="source-note">This is a sync-only room for {platform.name}. Everyone opens the link in their own account; Afterglow cannot control that site’s player.</p>}
        <fieldset><legend>WHO HOLDS THE REMOTE?</legend><div className="control-choices"><button type="button" className={control === "host" ? "chosen" : ""} onClick={() => setControl("host")}><Icon name="user"/><b>Host control</b><span>One person keeps the pace.</span></button><button type="button" className={control === "shared" ? "chosen" : ""} onClick={() => setControl("shared")}><Icon name="globe"/><b>Shared control</b><span>Everyone can steer.</span></button></div></fieldset>
        <button className="primary-action" disabled={!canCreate}>{provider === "external" ? "Create sync-only room" : "Create the room"} <Icon name="arrow"/></button>
        <div className="catalog-divider"><span>OR CHOOSE FROM OFFLINE CATALOG</span></div>
        <Discovery
          query={query}
          setQuery={setQuery}
          category={category}
          setCategory={setCategory}
          action="Launch room"
          onSelect={item => {
            onEnter({ id: roomId(), title: item.title, source: item.source, control, kind: mediaProvider(item.source) || "url", create: true });
          }}
          onSyncOnly={(item, service) => {
            const deepLink = externalPlatformUrl(service.name);
            if (deepLink) onEnter({ id: roomId(), title: item.title, source: deepLink, control, kind: "external", create: true });
          }}
        />
      </form>
    </div>
  );
}

export function Queue({ playlist, isHost, selfId, onPlay, onRemove, onAdd, onVote, onMove, mood }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [customLink, setCustomLink] = useState("");
  const { localItems } = useLocalLibrary();
  const availableFiles = new Set(localItems.map(item => decodeURIComponent(item.source.split("/").pop())));
  const recommendations = mood?.current
    ? catalog.filter(item => item.moods?.includes(mood.current) && (availableFiles.has(item.filename) || item.source))
      .map(item => ({ ...item, source: availableFiles.has(item.filename) ? `${serverUrl}/media/${encodeURIComponent(item.filename)}` : item.source }))
      .filter(item => !playlist.some(queued => queued.source === item.source))
      .slice(0, 2)
    : [];

  const handleAddCustom = event => {
    event.preventDefault();
    const cleanSource = customLink.trim();
    if (!cleanSource || !validMediaUrl(cleanSource)) return;
    const provider = mediaProvider(cleanSource);
    const title = provider === "youtube" ? "YouTube Clip" : "Online Video";
    onAdd({
      title,
      source: cleanSource,
      category: "Web",
      duration: "--:--",
    });
    setCustomLink("");
  };

  return (
    <div className="queue-pane">
      <div className="drawer-head"><span className="eyebrow"><span/>SHARED PLAYLIST</span><h3>{playlist.length ? `${playlist.length} picks on deck.` : "Add the next thing."}</h3></div>
      <form className="queue-custom-box" onSubmit={handleAddCustom}>
        <input
          value={customLink}
          onChange={e => setCustomLink(e.target.value)}
          placeholder="Paste YouTube or video URL..."
          aria-label="Queue media URL"
        />
        <button type="submit" disabled={!customLink.trim() || !validMediaUrl(customLink.trim())}>
          <Icon name="plus" size={13}/> Queue
        </button>
      </form>
      {mood?.current && <section className="mood-signal"><span className="eyebrow"><span/>ROOM MOOD · {mood.voters} SIGNAL{mood.voters === 1 ? "" : "S"}</span><b>The room feels {mood.current}.</b><small>Reactions are turning into shared picks.</small>{recommendations.map(item => <button key={item.id} onClick={() => onAdd(item)}>{item.title}<Icon name="plus" size={13}/></button>)}</section>}
      {playlist.length > 0 && <p className="queue-auto-advance">Next up automatically · highest-voted pick wins, then queue order.</p>}
      <div className="queue-list">{playlist.map((item, index) => {
        const voteCount = Object.keys(item.votes || {}).length;
        return (
          <article key={item.id}>
            <div><small>{item.category} · {item.duration}</small><b>{item.title}</b><small>{voteCount} upvote{voteCount === 1 ? "" : "s"}</small></div>
            <span className="queue-item-actions">
              <button className={item.votes?.[selfId] ? "voted" : ""} onClick={() => onVote(item.id)} title={item.votes?.[selfId] ? "Remove your upvote" : "Upvote this pick"} aria-label={`Upvote ${item.title}`}><Icon name="check" size={14}/></button>
              {isHost && <>
                <button onClick={() => onMove(item.id, "up")} disabled={index === 0} title="Move up" aria-label={`Move ${item.title} up`}>↑</button>
                <button onClick={() => onMove(item.id, "down")} disabled={index === playlist.length - 1} title="Move down" aria-label={`Move ${item.title} down`}>↓</button>
                <button onClick={() => onPlay(item.id)} title="Play this item" aria-label={`Play ${item.title}`}><Icon name="play" size={14}/></button>
                <button onClick={() => onRemove(item.id)} title="Remove" aria-label={`Remove ${item.title}`}><Icon name="close" size={14}/></button>
              </>}
            </span>
          </article>
        );
      })}</div>
      <Discovery
        query={query}
        setQuery={setQuery}
        category={category}
        setCategory={setCategory}
        onSelect={onAdd}
        onSyncOnly={(item, service) => {
          const deepLink = externalPlatformUrl(service.name);
          if (deepLink) onAdd({ ...item, source: deepLink, category: item.category });
        }}
      />
    </div>
  );
}
