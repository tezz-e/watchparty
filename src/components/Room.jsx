import { useEffect, useState } from "react";
import { Icon, Wordmark, Avatar, SoftField } from "./Primitives.jsx";
import { Queue } from "./EntryScreens.jsx";
import { tints } from "../data/catalog.js";
import { formatTime } from "../utils/watchParty.js";
import { useRoomSession } from "../hooks/useRoomSession.js";
import "./YoutubePlayer.css";

export default function Room({ profile, room, onLeave }) {
  const [draft, setDraft] = useState("");
  const [drawer, setDrawer] = useState("chat");
  const [, setCountdownTick] = useState(0);
  const {
    state, connected, selfId, members, messages, reaction, copied, latency, notice,
    video, youtube, provider, platform, reportBuffering, reportMediaFailure,
    getPlayer, getDesiredPosition, hasRemote, config, send, sendPlayback,
    togglePlayback, onTime, share, externalReady, setExternalReady,
    localOffset, updateLocalOffset, getServerNow,
  } = useRoomSession(profile, room);
  const poll = state.poll || { options: [], votes: {} };
  const votes = Object.values(poll.votes || {});
  const voteCount = votes.length;
  const player = getPlayer();
  const duration = provider === "external" ? 86_400 : player?.duration() || Math.max(1, getDesiredPosition() + 1);
  const position = getDesiredPosition();
  const telemetry = state.telemetry || {};
  const onlineMembers = members.filter(member => member.online);
  const readyMembers = onlineMembers.filter(member => member.externalReady);
  const countdownSeconds = state.externalCountdown
    ? Math.max(0, (state.externalCountdown.startsAt - getServerNow()) / 1000)
    : null;

  useEffect(() => {
    if (provider !== "external" || !state.externalCountdown) return undefined;
    const interval = setInterval(() => setCountdownTick(value => value + 1), 100);
    return () => clearInterval(interval);
  }, [provider, state.externalCountdown?.startsAt]);

  return (
    <SoftField className="room-page">
      <header className="room-nav">
        <button className="back-button" onClick={onLeave}>← Lobby</button>
        <Wordmark/>
        <div className="room-status">
          <span className={connected ? "status-led" : "status-led dim"}/>
          <span>{connected ? "LIVE SYNC" : "RECONNECTING"}</span>
          <b>{latency === null ? "— ms" : `${latency} ms`}</b>
        </div>
        <button className="invite-compact" onClick={share}>
          {copied ? "LINK COPIED" : "INVITE"}<Icon name="share" size={15}/>
        </button>
      </header>
      {notice && <div className="room-notice">{notice}</div>}
      <main className="room-layout">
        <section className="view-deck">
          <div className="now-line">
            <span>NOW PLAYING</span><b>{config.title}</b><i/>
            <span>{provider === "external" ? "SHARED CLOCK ONLY" : hasRemote ? "YOU HAVE THE REMOTE" : "HOST HAS THE REMOTE"}</span>
          </div>
          <div className="screen-chassis">
            <div className="screen-beam"/>
            {provider === "youtube" && <div className="youtube-player"><div ref={youtube}/></div>}
            {(provider === "url" || provider === "hls") && (
              <video
                ref={video}
                src={provider === "url" ? config.source : undefined}
                onTimeUpdate={onTime}
                onWaiting={() => reportBuffering(true)}
                onPlaying={() => reportBuffering(false)}
                onError={() => reportMediaFailure(provider === "hls" ? "hls-cors" : "media-load")}
                onEnded={() => sendPlayback(false, getPlayer()?.currentTime() || 0)}
                playsInline
                preload="metadata"
              />
            )}
            {provider === "external" && (
              <div className="external-sync-panel">
                <span className="eyebrow"><span/>SYNC-ONLY MODE · {platform?.name}</span>
                <h2>Open your stream separately.</h2>
                <p>Afterglow shares a room clock; it cannot control or inspect playback on another site.</p>
                <a href={config.source} target="_blank" rel="noreferrer">Open {platform?.name}<Icon name="arrow" size={15}/></a>
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
              <button className="transport-play" disabled={!hasRemote || (provider === "external" && !state.externalStarted)} onClick={togglePlayback}>
                <Icon name={state.playing ? "pause" : "play"} size={18}/>
              </button>
              <span>{formatTime(position)}</span>
              <input
                disabled={!hasRemote || (provider === "external" && !state.externalStarted)}
                type="range"
                min="0"
                max={duration}
                step={provider === "external" ? "1" : ".1"}
                value={Math.min(position, duration)}
                onChange={event => {
                  const nextPosition = Number(event.target.value);
                  player?.seek(nextPosition);
                  sendPlayback(state.playing, provider === "external"
                    ? Math.max(0, nextPosition - localOffset)
                    : nextPosition);
                }}
                style={{ "--track": `${Math.min(position / duration * 100, 100)}%` }}
              />
              <span>{provider === "external" ? "ROOM CLOCK" : Number.isFinite(player?.duration()) ? formatTime(player.duration()) : "--:--"}</span>
              <button className="plain-icon"><Icon name="sound"/></button>
              <button className="plain-icon"><Icon name="expand"/></button>
            </div>
          </div>
          {provider === "external" && (
            <section className="external-room-controls">
              <div className="external-controls-copy">
                <span className="eyebrow"><span/>SYNC-ONLY READY CHECK</span>
                <p>Afterglow cannot control or inspect the streaming service. Open the title in your own account, then mark yourself ready.</p>
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
              mood={state.mood}
              onAdd={item => send("playlist:add", item)}
              onPlay={id => send("playlist:play", { id })}
              onRemove={id => send("playlist:remove", { id })}
            />
          )}
          {drawer === "people" && (
            <>
              <div className="drawer-head"><span className="eyebrow"><span/>IN THIS ROOM</span><h3>{members.filter(member => member.online).length || 1} presence detected.</h3></div>
              <div className="member-list">
                {members.map((member, index) => (
                  <div key={member.id} className={!member.online ? "offline" : ""}>
                    <Avatar name={member.name} tint={tints[index % 4]}/>
                    <span>{member.name}{member.id === state.hostId && <small>HOST</small>}{member.buffering && <small>BUFFERING</small>}{!member.online && <small>RECONNECTING</small>}</span>
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
              <span className="eyebrow"><span/>GROUP DECISION</span><h3>{poll.question}</h3>
              {poll.options.map(option => {
                const count = votes.filter(vote => vote === option).length;
                const percentage = voteCount ? count / voteCount * 100 : 0;
                return (
                  <button key={option} onClick={() => send("poll:vote", { option })}>
                    <span>{option}</span><b>{Math.round(percentage)}%</b><i style={{ width: `${percentage}%` }}/>
                  </button>
                );
              })}
              <small>{voteCount} votes · live for everyone</small>
            </div>
          )}
        </aside>
      </main>
    </SoftField>
  );
}
