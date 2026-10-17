import { useState } from "react";
import { Icon, Wordmark, Avatar, SoftField } from "./Primitives.jsx";
import { Queue } from "./EntryScreens.jsx";
import { tints } from "../data/catalog.js";
import { formatTime } from "../utils/watchParty.js";
import { useRoomSession } from "../hooks/useRoomSession.js";
import "./YoutubePlayer.css";

export default function Room({ profile, room, onLeave }) {
  const [draft, setDraft] = useState("");
  const [drawer, setDrawer] = useState("chat");
  const {
    state, connected, selfId, members, messages, reaction, copied, latency, notice,
    video, youtube, provider, platform, reportBuffering, reportMediaFailure,
    getPlayer, getDesiredPosition, hasRemote, config, send, sendPlayback,
    togglePlayback, onTime, share,
  } = useRoomSession(profile, room);
  const poll = state.poll || { options: [], votes: {} };
  const votes = Object.values(poll.votes || {});
  const voteCount = votes.length;
  const player = getPlayer();
  const duration = provider === "external" ? 86_400 : player?.duration() || Math.max(1, getDesiredPosition() + 1);
  const position = getDesiredPosition();
  const telemetry = state.telemetry || {};

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
              <button className="transport-play" disabled={!hasRemote} onClick={togglePlayback}>
                <Icon name={state.playing ? "pause" : "play"} size={18}/>
              </button>
              <span>{formatTime(position)}</span>
              <input
                disabled={!hasRemote}
                type="range"
                min="0"
                max={duration}
                step={provider === "external" ? "1" : ".1"}
                value={Math.min(position, duration)}
                onChange={event => {
                  const nextPosition = Number(event.target.value);
                  player?.seek(nextPosition);
                  sendPlayback(state.playing, nextPosition);
                }}
                style={{ "--track": `${Math.min(position / duration * 100, 100)}%` }}
              />
              <span>{provider === "external" ? "ROOM CLOCK" : Number.isFinite(player?.duration()) ? formatTime(player.duration()) : "--:--"}</span>
              <button className="plain-icon"><Icon name="sound"/></button>
              <button className="plain-icon"><Icon name="expand"/></button>
            </div>
          </div>
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
