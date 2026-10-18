import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Wordmark, Avatar, SoftField, ThemeSelect } from "./Primitives.jsx";
import { Queue } from "./EntryScreens.jsx";
import { tints } from "../data/catalog.js";
import { formatTime } from "../utils/watchParty.js";
import { useRoomSession } from "../hooks/useRoomSession.js";
import { ChangeMediaModal } from "./ChangeMediaModal.jsx";
import { getMediaPoster } from "../utils/mediaPoster.js";
import { useWebRTCScreenShare } from "../hooks/useWebRTCScreenShare.js";
import "./YoutubePlayer.css";
import "./RoomFeatures.css";

export default function Room({ profile, room, onLeave, theme, onThemeChange }) {
  const [draft, setDraft] = useState("");
  const [drawer, setDrawer] = useState("chat");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState([{ label: "", source: "" }, { label: "", source: "" }]);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [changeMediaOpen, setChangeMediaOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [, setCountdownTick] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);

  const copyRoomCode = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(room.id);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = room.id;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1600);
    } catch (err) {
      console.error("Unable to copy room code:", err);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1600);
    }
  };

  const {
    socket,
    state, connected, selfId, members, messages, reaction, reactions, sendReaction, removeReaction, copied, latency, notice, setNotice,
    video, youtubeHost, provider, platform, reportBuffering, reportMediaFailure,
    getPlayer, getDesiredPosition, hasRemote, config, send, sendPlayback,
    togglePlayback, onTime, endPlayback, share, externalReady, setExternalReady,
    localOffset, updateLocalOffset, getServerNow,
    requestScreenTicket,
    needsGesture, setNeedsGesture, handleJoinPlayback, resyncPlayback, sessionReplaced, reconnectThisTab,
  } = useRoomSession(profile, room);

  const canPublishScreen = state.hostId === selfId || state.config?.control === "shared";
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
    canPublish: canPublishScreen,
    onNotice: setNotice,
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
  const isSyncOnly = provider === "external";
  const duration = isSyncOnly ? 86_400 : player?.duration() || Math.max(1, getDesiredPosition() + 1);
  const position = getDesiredPosition();
  const posterUrl = getMediaPoster(config.source, config.title);
  const isStartingPlayback = !state.playing && position < 1 && !screenStream && !activeScreenShare && !isSyncOnly;
  const telemetry = state.telemetry || {};
  const onlineMembers = members.filter(member => member.online);
  const readyMembers = onlineMembers.filter(member => member.externalReady);
  const countdownSeconds = state.externalCountdown
    ? Math.max(0, (state.externalCountdown.startsAt - getServerNow()) / 1000)
    : null;


  useEffect(() => {
    if (!isSyncOnly || !state.externalCountdown) return undefined;
    const interval = setInterval(() => setCountdownTick(value => value + 1), 100);
    return () => clearInterval(interval);
  }, [isSyncOnly, state.externalCountdown?.startsAt]);

  return (
    <SoftField className="room-page" theme={theme}>
      <header className="room-nav">
        <button className="back-button" onClick={() => setConfirmLeave(true)}>← Lobby</button>
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
          <button
            type="button"
            className="room-code-badge"
            onClick={copyRoomCode}
            title="Click to copy room code"
            aria-label="Copy room code"
          >
            <span>{codeCopied ? "COPIED" : (room?.id?.toUpperCase() || "")}</span>
            <Icon name={codeCopied ? "check" : "link"} size={13} />
          </button>
          <button className="invite-compact" onClick={share}>
            {copied ? "LINK COPIED" : "INVITE"}<Icon name="share" size={15}/>
          </button>
        </div>
      </header>
      {sessionReplaced && (
        <div className="session-replaced-banner" role="alert">
          <div className="session-replaced-content">
            <Icon name="device" size={16} />
            <span>This room was opened in another tab.</span>
          </div>
          <button
            type="button"
            className="session-reconnect-btn"
            onClick={reconnectThisTab}
          >
            Use this tab again
          </button>
        </div>
      )}
      {confirmLeave && (
        <div className="modal-backdrop" data-theme={theme} onClick={() => setConfirmLeave(false)}>
          <div className="setup-modal leave-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="setup-head">
              <span className="eyebrow"><span />LEAVE ROOM</span>
              <h2>Leave this watch party?</h2>
              <p>
                {state.hostId === selfId && onlineMembers.length > 1
                  ? "You are currently the room host. If you leave, another member will be chosen to steer the room."
                  : "You can rejoin at any time using your room code or the rejoin button in the lobby."}
              </p>
            </div>
            <div className="modal-actions" style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
              <button type="button" className="secondary-action" onClick={() => setConfirmLeave(false)}>
                Stay in Room
              </button>
              <button
                type="button"
                className="primary-action"
                style={{ background: "#dc2626", borderColor: "#b91c1c", color: "#fff" }}
                onClick={() => {
                  setConfirmLeave(false);
                  onLeave();
                }}
              >
                Leave to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && <div className="room-notice">{notice}</div>}
      <main className="room-layout">
        <section className="view-deck">
          <div className="now-line">
            <div className="now-line-title">
              <span>NOW PLAYING</span><b>{config.title}</b><i/>
              <span>{provider === "external" ? "SHARED CLOCK ONLY" : hasRemote ? "YOU HAVE THE REMOTE" : "HOST HAS THE REMOTE"}</span>
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
          <div className="screen-chassis">
            {provider === "youtube" && <div ref={youtubeHost} className="youtube-player"/>}
            {(provider === "url" || provider === "hls") && (
              <video
                ref={video}
                src={provider === "url" ? config.source : undefined}
                poster={posterUrl || undefined}
                onTimeUpdate={onTime}
                onWaiting={() => reportBuffering(true)}
                onPlaying={() => {
                  reportBuffering(false);
                  setNeedsGesture?.(false);
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
            {(screenStream || activeScreenShare) && (
              <div className="screenshare-stage">
                {screenStream ? (
                  <video
                    ref={node => {
                      screenVideoRef.current = node;
                      if (node && screenStream && node.srcObject !== screenStream) {
                        node.srcObject = screenStream;
                        node.play().catch(() => {
                          node.muted = true;
                          node.play().catch(() => {});
                        });
                      }
                    }}
                    className="livekit-video screenshare-video"
                    autoPlay
                    playsInline
                    muted={isSharingScreen}
                  />
                ) : (
                  <div className="screenshare-connecting">
                    <span className="signal-led" />
                    <b>Connecting live screen share…</b>
                    <small>Receiving feed from {members.find(m => m.id === activeScreenShare?.sharerMemberId)?.name || "Host"}</small>
                  </div>
                )}
                <div className="screenshare-bar">
                  <span className="live-badge">SCREEN SHARE · LIVE</span>
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

            <div className="screen-fallback">
              <span>{config.source ? "READY TO SYNCHRONIZE" : "CHOOSE A VIDEO FROM THE QUEUE"}</span>
              <div className="orbital-art"><i/><i/><i/></div>
            </div>
            <div className="reaction-stream-overlay" aria-hidden="true">
              {reactions.map(r => (
                <div
                  key={r.id}
                  className="reaction-stream-item reaction-pop"
                  style={{
                    right: `${r.x}px`,
                    fontSize: `${r.size}px`,
                    animationDuration: `${r.duration}s`,
                    '--sway-x': `${r.sway}px`,
                    '--float-target': `-${r.floatDistPct}cqh`,
                    '--float-fallback': `-${Math.round((r.floatDistPct / 100) * 360)}px`,
                  }}
                  onAnimationEnd={() => removeReaction?.(r.id)}
                >
                  {r.emoji}
                </div>
              ))}
            </div>
            {needsGesture && (
              <button
                type="button"
                className="full-stage-gesture-btn"
                onClick={handleJoinPlayback}
                aria-label="Tap to join playback"
              >
                <Icon name="play" size={32} />
                <span>Tap to join playback</span>
              </button>
            )}
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
              <span>{isSyncOnly ? "ROOM CLOCK" : Number.isFinite(player?.duration()) ? formatTime(player.duration()) : "--:--"}</span>
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
              {!hasRemote && (
                <button
                  type="button"
                  className="transport-resync-btn"
                  onClick={resyncPlayback}
                  title="Resync your player to room playback"
                >
                  <Icon name="sync" size={12}/>
                  <span>Resync</span>
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
          </div>
          {isSyncOnly && (
            <section className="external-room-controls">
              <div className="external-controls-copy">
                <span className="eyebrow"><span/>SYNC-ONLY READY CHECK</span>
                <p>Afterglow coordinates the shared room clock, ready check, and social reactions. Open the title in your own account, cue to 00:00, then mark yourself ready.</p>
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
                <small>Only your shared clock changes, not the streaming player.</small>
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
            <div className="reaction-dock" aria-label="Live reactions">
              {["✨", "♥", "⚡", "👏", "😂"].map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  title={`Signal ${emoji} mood`}
                  onClick={() => sendReaction ? sendReaction(emoji) : send("reaction:send", { emoji })}
                >
                  {emoji}
                </button>
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
