import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Icon, Wordmark, Avatar, SoftField, ThemeSelect } from "./Primitives.jsx";
import { Queue } from "./EntryScreens.jsx";
import { instagramReelId, tints } from "../data/catalog.js";
import { getReelsFeed } from "../data/reelsFeed.js";
import { formatTime } from "../utils/watchParty.js";
import { useRoomSession } from "../hooks/useRoomSession.js";
import { ChangeMediaModal } from "./ChangeMediaModal.jsx";
import { getMediaPoster } from "../utils/mediaPoster.js";
import { useWebRTCScreenShare } from "../hooks/useWebRTCScreenShare.js";
import "./YoutubePlayer.css";
import "./RoomFeatures.css";

const LiveKitScreen = lazy(() => import("./LiveKitScreen.jsx"));

export default function Room({ profile, room, onLeave, theme, onThemeChange }) {
  const [draft, setDraft] = useState("");
  const [drawer, setDrawer] = useState("chat");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState([{ label: "", source: "" }, { label: "", source: "" }]);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [changeMediaOpen, setChangeMediaOpen] = useState(false);
  const [, setCountdownTick] = useState(0);
  const {
    socket,
    state, connected, selfId, members, messages, reaction, copied, latency, notice,
    video, youtube, provider, platform, reportBuffering, reportMediaFailure,
    getPlayer, getDesiredPosition, hasRemote, config, send, sendPlayback,
    togglePlayback, onTime, endPlayback, share, externalReady, setExternalReady,
    localOffset, updateLocalOffset, getServerNow,
    requestScreenTicket,
  } = useRoomSession(profile, room);

  const {
    stream: screenStream,
    isSharing: isSharingScreen,
    activeShare: activeScreenShare,
    startSharing: startScreenShare,
    stopSharing: stopScreenShare,
  } = useWebRTCScreenShare({
    socket,
    selfId,
    members,
    screenShareState: state.screenShare,
    canPublish: hasRemote,
    onNotice: () => {},
  });

  const screenVideoRef = useRef(null);
  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  const poll = state.poll;
  const votes = Object.values(poll?.votes || {});
  const voteCount = votes.length;
  const player = getPlayer();
  const isSyncOnly = provider === "external" || provider === "instagram";
  const duration = isSyncOnly ? 86_400 : player?.duration() || Math.max(1, getDesiredPosition() + 1);
  const position = getDesiredPosition();
  const posterUrl = getMediaPoster(config.source, config.title);
  const isStartingPlayback = !state.playing && position < 1 && !screenStream && provider !== "external";
  const telemetry = state.telemetry || {};
  const onlineMembers = members.filter(member => member.online);
  const readyMembers = onlineMembers.filter(member => member.externalReady);
  const countdownSeconds = state.externalCountdown
    ? Math.max(0, (state.externalCountdown.startsAt - getServerNow()) / 1000)
    : null;
  const reelId = provider === "instagram" ? instagramReelId(config.source) : null;
  const reelsFeed = getReelsFeed(config.source, state.playlist || []);
  const currentReelIndex = Math.max(0, reelsFeed.findIndex(item => item.id === reelId));
  const canPrevReel = currentReelIndex > 0;
  const canNextReel = currentReelIndex < reelsFeed.length - 1;

  const navigateReel = useCallback((direction) => {
    if (!hasRemote) return;
    const targetIndex = currentReelIndex + direction;
    if (targetIndex >= 0 && targetIndex < reelsFeed.length) {
      const nextReel = reelsFeed[targetIndex];
      send("room:change-source", { title: nextReel.title, source: nextReel.source });
    }
  }, [currentReelIndex, hasRemote, reelsFeed, send]);

  const lastWheelTime = useRef(0);
  const handleReelWheel = e => {
    if (provider !== "instagram") return;
    const timestamp = Date.now();
    if (timestamp - lastWheelTime.current < 450) return;
    if (e.deltaY > 25) {
      lastWheelTime.current = timestamp;
      navigateReel(1);
    } else if (e.deltaY < -25) {
      lastWheelTime.current = timestamp;
      navigateReel(-1);
    }
  };

  useEffect(() => {
    if (provider !== "instagram") return;
    const handleKeyDown = e => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        navigateReel(1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        navigateReel(-1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [provider, navigateReel]);

  useEffect(() => {
    if (!isSyncOnly || !state.externalCountdown) return undefined;
    const interval = setInterval(() => setCountdownTick(value => value + 1), 100);
    return () => clearInterval(interval);
  }, [isSyncOnly, state.externalCountdown?.startsAt]);

  return (
    <SoftField className="room-page" theme={theme}>
      <header className="room-nav">
        <button className="back-button" onClick={onLeave}>← Lobby</button>
        <Wordmark/>
        <div className="room-actions">
          {hasRemote && (
            <button
              type="button"
              className="change-video-nav-pill"
              onClick={() => setChangeMediaOpen(true)}
              title="Change video or switch media for the room"
            >
              <Icon name="swap" size={14} />
              <span>Change Video</span>
            </button>
          )}
          <ThemeSelect theme={theme} onChange={onThemeChange}/>
          <div className="room-status" title={`${latency ?? "—"}ms latency · ${onlineMembers.length} member(s) online`}>
            <span className={connected ? "status-led" : "status-led dim"}/>
            <span>{connected ? "LIVE SYNC" : "RECONNECTING"}</span>
            <b>{latency === null ? "— ms" : `${latency} ms`}</b>
          </div>
          <button className="invite-compact" onClick={share}>
            {copied ? "LINK COPIED" : "INVITE"}<Icon name="share" size={15}/>
          </button>
        </div>
      </header>
      {notice && <div className="room-notice">{notice}</div>}
      <main className="room-layout">
        <section className="view-deck">
          <div className="now-line">
            <div className="now-line-title">
              <span>NOW PLAYING</span><b>{config.title}</b><i/>
              <span>{provider === "external" ? "SHARED CLOCK ONLY" : provider === "instagram" ? "INSTAGRAM REELS SYNC" : hasRemote ? "YOU HAVE THE REMOTE" : "HOST HAS THE REMOTE"}</span>
            </div>
            <div className="now-line-actions">
              {hasRemote && (
                <button
                  type="button"
                  className="now-action-pill"
                  onClick={() => setChangeMediaOpen(true)}
                  title="Change current video"
                >
                  <Icon name="swap" size={13}/>
                  <span>Change Video</span>
                </button>
              )}
              <button
                type="button"
                className={`now-action-pill ${isSharingScreen ? "active-share" : ""}`}
                onClick={isSharingScreen ? stopScreenShare : startScreenShare}
                title={isSharingScreen ? "Stop sharing screen" : "Share screen with room"}
              >
                <Icon name="device" size={13}/>
                <span>{isSharingScreen ? "Stop Sharing" : "Screen Share"}</span>
              </button>
            </div>
          </div>
          <div className={`screen-chassis ${provider === "instagram" ? "instagram-active" : ""}`}>
            {provider === "youtube" && <div className="youtube-player"><div ref={youtube}/></div>}
            {(provider === "url" || provider === "hls") && (
              <video
                ref={video}
                src={provider === "url" ? config.source : undefined}
                poster={posterUrl || undefined}
                onTimeUpdate={onTime}
                onWaiting={() => reportBuffering(true)}
                onPlaying={() => {
                  reportBuffering(false);
                  if (hasRemote && !state.playing) {
                    sendPlayback(true, video.current?.currentTime || 0);
                  }
                }}
                onPause={() => {
                  if (hasRemote && state.playing) {
                    sendPlayback(false, video.current?.currentTime || 0);
                  }
                }}
                onError={() => reportMediaFailure(provider === "hls" ? "hls-cors" : "media-load")}
                onEnded={endPlayback}
                playsInline
                preload="metadata"
              />
            )}
            {screenStream && (
              <div className="screenshare-stage">
                <video
                  ref={screenVideoRef}
                  className="livekit-video screenshare-video"
                  autoPlay
                  playsInline
                  muted={isSharingScreen}
                />
                <div className="screenshare-bar">
                  <span className="live-badge">🔴 SCREEN SHARE</span>
                  <span className="screenshare-title">{activeScreenShare?.title || "Live Screen Share"}</span>
                  {isSharingScreen ? (
                    <button type="button" className="screenshare-stop-btn" onClick={stopScreenShare}>
                      Stop Sharing
                    </button>
                  ) : (
                    <span className="screenshare-sharer-tag">
                      Shared by {members.find(m => m.id === activeScreenShare?.sharerMemberId)?.name || "Participant"}
                    </span>
                  )}
                </div>
              </div>
            )}
            {isStartingPlayback && (
              <div
                className="center-play-overlay"
                onClick={hasRemote ? togglePlayback : undefined}
                title={hasRemote ? "Click to play for everyone" : "Host has the remote"}
              >
                {posterUrl && (
                  <img
                    src={posterUrl}
                    alt={config.title}
                    className="center-play-poster"
                    onError={e => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <div className="center-play-scrim" />
                <div className="center-play-content">
                  <button
                    type="button"
                    className="center-play-glow-btn"
                    onClick={e => {
                      e.stopPropagation();
                      togglePlayback();
                    }}
                    aria-label="Start playback for everyone"
                  >
                    <Icon name="play" size={32} />
                  </button>
                  <div className="center-play-badge">
                    <span className="badge-dot" />
                    <span>READY TO WATCH</span>
                  </div>
                  <h2 className="center-play-title">{config.title || "Untitled Video"}</h2>
                  <p className="center-play-hint">
                    {hasRemote
                      ? "Click anywhere or press play to start playback for everyone"
                      : "Waiting for host to press play"}
                  </p>
                </div>
              </div>
            )}
            {provider === "external" && (
              <div className="external-sync-panel">
                <div className="external-sync-header">
                  <span className="eyebrow"><span/>SYNC-ONLY COMPANION · {platform?.name || "STREAMING"}</span>
                  <h2>Synchronized Watch Party for {platform?.name || "Streaming"}</h2>
                  <p>Because commercial streaming services prohibit external player embedding, Afterglow acts as your shared room clock, ready check, and social companion.</p>
                </div>
                <div className="external-sync-steps">
                  <div className="sync-step">
                    <span className="step-num">01</span>
                    <div>
                      <b>Open {platform?.name || "Stream"}</b>
                      <p>Launch the movie in your own account in another tab, split-window, or TV.</p>
                      <a href={config.source} target="_blank" rel="noreferrer" className="external-launch-link">
                        Open on {platform?.name || "Stream"}<Icon name="external" size={12}/>
                      </a>
                    </div>
                  </div>
                  <div className="sync-step">
                    <span className="step-num">02</span>
                    <div>
                      <b>Cue to 00:00 &amp; Ready Up</b>
                      <p>Pause at the start of the title, then click <em>Mark me ready</em> below.</p>
                    </div>
                  </div>
                  <div className="sync-step">
                    <span className="step-num">03</span>
                    <div>
                      <b>3-2-1 Countdown</b>
                      <p>Once all members are ready, host fires the 3-2-1 countdown. Press play together at zero!</p>
                    </div>
                  </div>
                  <div className="sync-step">
                    <span className="step-num">04</span>
                    <div>
                      <b>Social &amp; Clock Sync</b>
                      <p>Keep this tab open for synchronized pauses, live reactions, chat, and room polls.</p>
                    </div>
                  </div>
                </div>
                <div className="external-screen-share-tip">
                  <Icon name="device" size={14}/>
                  <span><strong>Want everyone watching one screen?</strong> Use <em>Screen Share</em> at the top right to broadcast your window directly to the room!</span>
                </div>
              </div>
            )}
            {provider === "instagram" && (
              <div className="instagram-reel-stage" onWheel={handleReelWheel}>
                <div className="instagram-reel-card">
                  <iframe
                    key={reelId}
                    className="instagram-reel-frame"
                    src={`https://www.instagram.com/reel/${reelId || "reel"}/embed/`}
                    title={config.title || "Instagram Reel"}
                    scrolling="no"
                    allowFullScreen
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                  />
                </div>
                <div className="reel-scroll-sidebar">
                  <button
                    type="button"
                    className="reel-nav-btn prev"
                    disabled={!hasRemote || !canPrevReel}
                    onClick={() => navigateReel(-1)}
                    title={hasRemote ? "Previous reel (↑ or scroll up)" : "Host controls scrolling"}
                    aria-label="Previous reel"
                  >
                    <Icon name="chevron" size={18}/>
                  </button>
                  <div className="reel-counter-badge" title="Current reel in feed">
                    <span>{currentReelIndex + 1}</span>
                    <small>/{reelsFeed.length}</small>
                  </div>
                  <button
                    type="button"
                    className="reel-nav-btn next"
                    disabled={!hasRemote || !canNextReel}
                    onClick={() => navigateReel(1)}
                    title={hasRemote ? "Next reel (↓ or scroll down)" : "Host controls scrolling"}
                    aria-label="Next reel"
                  >
                    <Icon name="chevron" size={18}/>
                  </button>
                  {hasRemote && (
                    <button
                      type="button"
                      className="reel-add-btn"
                      onClick={() => setChangeMediaOpen(true)}
                      title="Paste or queue a new Reel"
                      aria-label="Add or switch Reel"
                    >
                      <Icon name="plus" size={16}/>
                    </button>
                  )}
                </div>
                <div className="reel-scroll-hint">
                  {hasRemote ? "Scroll wheel or ↑ / ↓ arrow keys to flip reels for everyone" : "Host is scrolling through reels"}
                </div>
                <div className="instagram-meta-overlay">
                  <div className="instagram-badge">
                    <span className="live-pulse"/>
                    <span>INSTAGRAM REEL · FEED SYNC</span>
                  </div>
                  <a href={config.source} target="_blank" rel="noreferrer" className="instagram-open-btn">
                    <span>Open on Instagram</span>
                    <Icon name="external" size={13}/>
                  </a>
                </div>
              </div>
            )}
            <div className="screen-fallback">
              <span>{config.source ? "READY TO SYNCHRONIZE" : "CHOOSE A VIDEO FROM THE QUEUE"}</span>
              <div className="orbital-art"><i/><i/><i/></div>
            </div>
            {reaction && <div className="reaction-pop">{reaction}</div>}
            <div className="watching-rack">
              {members.slice(0, 5).map((member, index) => (
                <Avatar key={member.id} name={member.name} tint={tints[index % 4]} small/>
              ))}
              <span>{members.filter(member => member.online).length || 1} IN ROOM</span>
            </div>
            <div className="transport">
              <button className="transport-play" disabled={!hasRemote || (isSyncOnly && !state.externalStarted)} onClick={togglePlayback}>
                <Icon name={state.playing ? "pause" : "play"} size={18}/>
              </button>
              <span>{formatTime(position)}</span>
              <div className="timeline-control">
                <div className="reaction-heatmap" aria-label="Room reactions on the timeline">
                  {(state.reactionHeatmap || []).map(item => (
                    <span
                      key={item.id}
                      style={{ left: `${Math.max(0, Math.min(100, item.position / duration * 100))}%` }}
                      title={`${item.name} reacted ${item.emoji} at ${formatTime(item.position)}`}
                    >{item.emoji}</span>
                  ))}
                </div>
                <input
                  disabled={!hasRemote || (isSyncOnly && !state.externalStarted)}
                  type="range"
                  min="0"
                  max={duration}
                  step={isSyncOnly ? "1" : ".1"}
                  value={Math.min(position, duration)}
                  onChange={event => {
                    const nextPosition = Number(event.target.value);
                    player?.seek(nextPosition);
                    sendPlayback(state.playing, isSyncOnly
                      ? Math.max(0, nextPosition - localOffset)
                      : nextPosition);
                  }}
                  style={{ "--track": `${Math.min(position / duration * 100, 100)}%` }}
                />
              </div>
              <span>{isSyncOnly ? (provider === "instagram" ? "REEL CLOCK" : "ROOM CLOCK") : Number.isFinite(player?.duration()) ? formatTime(player.duration()) : "--:--"}</span>
              <button className="plain-icon"><Icon name="sound"/></button>
              <button className="plain-icon"><Icon name="expand"/></button>
              {hasRemote && (
                <button
                  type="button"
                  className="transport-change-pill"
                  onClick={() => setChangeMediaOpen(true)}
                  title="Switch video for the room"
                >
                  <Icon name="swap" size={12}/>
                  <span>Switch Video</span>
                </button>
              )}
            </div>
            {!state.playing && state.reactionHighlights?.items?.length > 0 && (
              <section className="reaction-highlights" aria-label="Popular room reactions">
                <span className="eyebrow">REACTION HIGHLIGHTS · {state.reactionHighlights.title}</span>
                {state.reactionHighlights.items.map(item => (
                  <button key={`${item.emoji}-${item.position}`} onClick={() => player?.seek(item.position)}>
                    <b>{item.emoji} ×{item.count}</b><span>{formatTime(item.position)}</span>
                  </button>
                ))}
              </section>
            )}
            {provider !== "instagram" && (
              <Suspense fallback={null}>
                <LiveKitScreen roomId={room.id} connected={connected} canPublish={hasRemote} requestTicket={requestScreenTicket} hasSource={Boolean(room.source)}/>
              </Suspense>
            )}
          </div>
          {isSyncOnly && (
            <section className="external-room-controls">
              <div className="external-controls-copy">
                <span className="eyebrow"><span/>{provider === "instagram" ? "REELS PLAYBACK SYNC" : "SYNC-ONLY READY CHECK"}</span>
                <p>{provider === "instagram" ? "Everyone gets ready together. When the host fires the 3-2-1 countdown, everyone starts watching together at 0s. If this creator has disabled iframe embedding, tap 'Open on Instagram' and use the shared countdown below." : "Afterglow coordinates the shared room clock, ready check, and social reactions. Open the title in your own account, cue to 00:00, then mark yourself ready."}</p>
                <div className="external-ready-list">
                  {onlineMembers.map(member => <span key={member.id} className={member.externalReady ? "ready" : ""}>{member.name} · {member.externalReady ? "READY" : "NOT READY"}</span>)}
                  {!onlineMembers.length && <span>Waiting for participants…</span>}
                </div>
              </div>
              <div className="external-controls-actions">
                <button className={externalReady ? "external-ready-toggle ready" : "external-ready-toggle"} onClick={() => setExternalReady(!externalReady)}>
                  {externalReady ? "I’m ready" : "Mark me ready"}
                </button>
                {state.hostId === selfId && !state.externalStarted && (
                  <button
                    className="external-countdown-button"
                    disabled={!onlineMembers.length || readyMembers.length !== onlineMembers.length}
                    onClick={() => send("external:countdown")}
                  >
                    {countdownSeconds !== null && countdownSeconds > 0 ? `Starting in ${Math.ceil(countdownSeconds)}…` : "Start 3-2-1"}
                  </button>
                )}
                {state.hostId === selfId && countdownSeconds !== null && countdownSeconds > 0 && (
                  <button className="external-cancel-button" onClick={() => send("external:countdown-cancel")}>Cancel countdown</button>
                )}
                {state.externalStarted && <span className="external-clock-status">{state.playing ? "Shared clock running" : "Shared clock paused"}</span>}
              </div>
              <div className="external-offset">
                <span>YOUR CLOCK NUDGE</span>
                <button aria-label="Nudge my clock earlier" onClick={() => updateLocalOffset(localOffset - 0.25)}>−</button>
                <b>{localOffset > 0 ? "+" : ""}{localOffset.toFixed(2)}s</b>
                <button aria-label="Nudge my clock later" onClick={() => updateLocalOffset(localOffset + 0.25)}>+</button>
                <button className="offset-reset" onClick={() => updateLocalOffset(0)}>Reset</button>
                <small>{provider === "instagram" ? "Nudge your local clock if your device video started slightly ahead or behind." : "Only your shared clock changes, not the streaming player."}</small>
              </div>
            </section>
          )}
          <div className="room-notes">
            <div>
              <span>SYNC STATUS</span>
              <b>{latency === null ? "Measuring route…" : `${latency} ms round trip`}</b>
              <small>{telemetry.averageDrift === null ? "Collecting local player drift samples…" : `avg drift ${telemetry.averageDrift.toFixed(2)}s · max ${telemetry.maxDrift.toFixed(2)}s`}</small>
              <small>{telemetry.commands || 0} playback commands · {telemetry.deliverySamples || 0} delivery acknowledgements · {telemetry.deliveryTimeouts || 0} timeouts</small>
            </div>
            <div className="reaction-dock">
              {["✨", "♥", "⚡", "👏", "😂"].map(emoji => (
                <button key={emoji} title={`Signal ${emoji} mood`} onClick={() => send("reaction:send", { emoji })}>{emoji}</button>
              ))}
            </div>
          </div>
        </section>
        <aside className="room-drawer">
          <div className="drawer-tabs">
            <button className={drawer === "chat" ? "active" : ""} onClick={() => setDrawer("chat")}>Chat <b>{messages.length}</b></button>
            <button className={drawer === "queue" ? "active" : ""} onClick={() => setDrawer("queue")}><Icon name="queue" size={14}/> Queue <b>{state.playlist?.length || 0}</b></button>
            <button className={drawer === "people" ? "active" : ""} onClick={() => setDrawer("people")}>People <b>{members.filter(member => member.online).length}</b></button>
            <button className={drawer === "poll" ? "active" : ""} onClick={() => setDrawer("poll")}>Poll</button>
          </div>
          {drawer === "chat" && (
            <>
              <div className="drawer-head"><span className="eyebrow"><span/>LIVE THREAD</span><h3>Leave a thought.</h3></div>
              <div className="message-list">
                {messages.length ? messages.map(message => (
                  <article key={message.id}><Avatar name={message.name} tint="violet" small/><p><b>{message.name}</b><span>{message.text}</span></p></article>
                )) : <div className="empty-thread">The room is quiet.<br/>Say something worth keeping.</div>}
              </div>
              <form className="message-box" onSubmit={event => {
                event.preventDefault();
                if (draft.trim()) {
                  send("chat:send", { text: draft.trim() });
                  setDraft("");
                }
              }}>
                <input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Say something…"/>
                <button><Icon name="send"/></button>
              </form>
            </>
          )}
          {drawer === "queue" && (
            <Queue
              playlist={state.playlist || []}
              isHost={state.hostId === selfId}
              selfId={selfId}
              mood={state.mood}
              onAdd={item => send("playlist:add", item)}
              onPlay={id => send("playlist:play", { id })}
              onRemove={id => send("playlist:remove", { id })}
              onVote={id => send("playlist:vote", { id })}
              onMove={(id, direction) => send("playlist:move", { id, direction })}
            />
          )}
          {drawer === "people" && (
            <>
              <div className="drawer-head"><span className="eyebrow"><span/>IN THIS ROOM</span><h3>{members.filter(member => member.online).length || 1} presence detected.</h3></div>
              <div className="member-list">
                {members.map((member, index) => (
                  <div key={member.id} className={!member.online ? "offline" : ""}>
                    <Avatar name={member.name} tint={tints[index % 4]}/>
                    <span className="member-health">
                      {member.name}{member.id === state.hostId && <small>HOST</small>}
                      {member.buffering && <small>BUFFERING</small>}{!member.online && <small>RECONNECTING</small>}
                      <small>{member.rttMs === null || member.rttMs === undefined ? "RTT —" : `RTT ${Math.round(member.rttMs)}ms`}</small>
                      <small>{member.drift === null || member.drift === undefined ? "DRIFT —" : `DRIFT ${member.drift.toFixed(2)}s`}</small>
                      <small>{member.clockOffsetMs === null || member.clockOffsetMs === undefined ? "OFFSET —" : `OFFSET ${Math.round(member.clockOffsetMs)}ms`}</small>
                    </span>
                    <i/>
                    {state.hostId === selfId && member.id !== selfId && member.online && (
                      <button className="member-transfer" title={`Make ${member.name} host`} onClick={() => send("host:transfer", { memberId: member.id })}>
                        <Icon name="transfer" size={15}/>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {drawer === "poll" && (
            <div className="poll-pane">
              {(!poll || creatingPoll) && (
                <form className="poll-create" onSubmit={event => {
                  event.preventDefault();
                  send("poll:create", {
                    question: pollQuestion,
                    options: pollOptions.map(option => ({
                      label: option.label,
                      item: option.source.trim() ? { title: option.label, source: option.source, category: "Poll pick" } : null,
                    })),
                  });
                  setCreatingPoll(false);
                }}>
                  <span className="eyebrow"><span/>GROUP DECISION</span><h3>Create a poll.</h3>
                  <label>QUESTION<input value={pollQuestion} onChange={event => setPollQuestion(event.target.value)} maxLength={120} placeholder="What should we watch?"/></label>
                  {pollOptions.map((option, index) => (
                    <fieldset key={index}>
                      <input aria-label={`Poll option ${index + 1}`} value={option.label} onChange={event => setPollOptions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} maxLength={80} placeholder={`Option ${index + 1}`}/>
                      <input aria-label={`Option ${index + 1} media URL`} value={option.source} onChange={event => setPollOptions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, source: event.target.value } : item))} placeholder="Optional supported media URL"/>
                    </fieldset>
                  ))}
                  <button type="button" className="poll-add-option" disabled={pollOptions.length >= 6} onClick={() => setPollOptions(current => [...current, { label: "", source: "" }])}>Add option</button>
                  <button className="poll-submit" disabled={pollOptions.some(option => !option.label.trim())}>Start poll</button>
                </form>
              )}
              {poll && !creatingPoll && (
                <>
                  <span className="eyebrow"><span/>GROUP DECISION{poll.closed ? " · CLOSED" : ""}</span><h3>{poll.question}</h3>
                  {poll.options.map(option => {
                    const count = votes.filter(vote => vote === option.id).length;
                    const percentage = voteCount ? count / voteCount * 100 : 0;
                    return (
                      <button key={option.id} className={poll.votes?.[selfId] === option.id ? "selected" : ""} disabled={poll.closed} onClick={() => send("poll:vote", { optionId: option.id })}>
                        <span>{option.label}</span><b>{Math.round(percentage)}%</b><i style={{ width: `${percentage}%` }}/>
                      </button>
                    );
                  })}
                  <small>{voteCount} votes · {poll.closed ? "results are final" : "one changeable vote per person"}</small>
                  <div className="poll-actions">
                    {!poll.closed && state.hostId === selfId && <button onClick={() => send("poll:close")}>Close poll</button>}
                    {poll.closed && state.hostId === selfId && <button onClick={() => send("poll:queue-winner")}>Queue winning pick</button>}
                    {poll.closed && <button onClick={() => {
                      setPollQuestion("");
                      setPollOptions([{ label: "", source: "" }, { label: "", source: "" }]);
                      setCreatingPoll(true);
                    }}>New poll</button>}
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </main>
      <ChangeMediaModal
        isOpen={changeMediaOpen}
        onClose={() => setChangeMediaOpen(false)}
        currentSource={config.source}
        currentTitle={config.title}
        onUpdate={({ title, source }) => send("room:change-source", { title, source })}
        theme={theme}
      />
    </SoftField>
  );
}
