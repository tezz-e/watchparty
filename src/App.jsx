import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Icon, Wordmark, Avatar, SoftField } from "./components/Primitives.jsx";
import { tints } from "./data/catalog.js";
import { createMemberId, desiredPosition, formatTime } from "./utils/watchParty.js";
import { useVisualInteractions } from "./hooks/useVisualInteractions.js";
import { CreateRoom, Identity, Lobby, Queue } from "./components/EntryScreens.jsx";

function Room({ profile, room, onLeave }) {
  const [state, setState] = useState({ playing: false, position: 0, updatedAt: Date.now(), version: 0, config: room, playlist: [], poll: { question: "What should we watch next?", options: ["Keep the current pick", "Choose from the queue"], votes: {} }, mood: { current: null, counts: {}, voters: 0 }, telemetry: { commands: 0, averageDrift: null, maxDrift: 0, averageDeliveryRoundTripMs: null, deliverySamples: 0, deliveryTimeouts: 0 } });
  const [connected, setConnected] = useState(false), [selfId, setSelfId] = useState(null), [members, setMembers] = useState([]), [messages, setMessages] = useState([]), [draft, setDraft] = useState(""), [reaction, setReaction] = useState(null), [drawer, setDrawer] = useState("chat"), [copied, setCopied] = useState(false), [latency, setLatency] = useState(null), [notice, setNotice] = useState("");
  const socket = useRef(null), video = useRef(null), lastHeartbeat = useRef(0), lastDriftSample = useRef(0), createOnNextConnect = useRef(Boolean(room.create)), memberId = useRef(createMemberId()), stateRef = useRef(state);
  stateRef.current = state;
  const hasRemote = state.config?.control === "shared" || state.hostId === selfId;
  const config = state.config || room;
  const applyState = next => setState(previous => ({ ...previous, ...next, config: next.config ? { ...previous.config, ...next.config } : previous.config, playlist: next.playlist || previous.playlist, poll: next.poll || previous.poll }));
  useEffect(() => {
    const client = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:3001", { transports: ["websocket", "polling"], reconnection: true });
    socket.current = client;
    const join = () => {
      setConnected(true);
      const identity = { roomId: room.id, name: profile.name, memberId: memberId.current };
      if (createOnNextConnect.current) {
        client.emit("room:create", { ...identity, title: room.title, source: room.source, control: room.control });
      } else client.emit("room:join", identity);
    };
    client.on("connect", join); client.on("disconnect", () => setConnected(false));
    client.on("room:joined", ({ selfId: id, state: serverState, messages: history }) => { createOnNextConnect.current = false; setSelfId(id); setMessages(history); applyState(serverState); });
    client.on("room:state", applyState);
    client.on("playback:state", (next, acknowledge) => { applyState(next); if (typeof acknowledge === "function") acknowledge(); });
    client.on("room:config", configUpdate => setState(previous => ({ ...previous, config: { ...previous.config, ...configUpdate } })));
    client.on("room:presence", setMembers); client.on("playlist:state", playlist => setState(previous => ({ ...previous, playlist })));
    client.on("chat:message", message => setMessages(previous => [...previous, message])); client.on("reaction", ({ emoji }) => setReaction(emoji)); client.on("poll:update", poll => setState(previous => ({ ...previous, poll })));
    client.on("mood:update", mood => setState(previous => ({ ...previous, mood })));
    client.on("room:telemetry", telemetry => setState(previous => ({ ...previous, telemetry })));
    client.on("room:error", error => setNotice(error.message));
    return () => client.close();
  }, [profile.name, room.id]);
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(""), 3600); return () => clearTimeout(timeout); }, [notice]);
  useEffect(() => { if (!reaction) return; const timeout = setTimeout(() => setReaction(null), 900); return () => clearTimeout(timeout); }, [reaction]);
  useEffect(() => { const probe = () => socket.current?.emit("latency:ping", { clientSentAt: Date.now() }, reply => { if (reply?.clientSentAt) setLatency(Date.now() - reply.clientSentAt); }); probe(); const interval = setInterval(probe, 5000); return () => clearInterval(interval); }, []);
  useEffect(() => {
    const player = video.current; if (!player) return;
    const target = desiredPosition(state); const drift = target - player.currentTime;
    if (Math.abs(drift) > .5) player.currentTime = target;
    if (state.playing) player.play().catch(() => setNotice("Tap play once to allow this browser to start media.")); else player.pause();
  }, [state.playing, state.position, state.updatedAt, config.source]);
  const sendPlayback = (playing, position) => { if (!hasRemote) return setNotice("The host has the remote."); socket.current?.emit("playback:update", { playing, position, version: stateRef.current.version, sentAt: Date.now() }); };
  const onTime = event => {
    const timestamp = Date.now();
    if (timestamp - lastDriftSample.current >= 2000) {
      lastDriftSample.current = timestamp;
      socket.current?.emit("sync:drift", { drift: desiredPosition(stateRef.current) - event.currentTarget.currentTime });
    }
    if (!hasRemote || !stateRef.current.playing || timestamp - lastHeartbeat.current < 2000) return;
    lastHeartbeat.current = timestamp;
    sendPlayback(true, event.currentTarget.currentTime);
  };
  const share = async () => { await navigator.clipboard?.writeText(`${location.origin}/?room=${room.id}`); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const poll = state.poll || { options: [], votes: {} }; const votes = Object.values(poll.votes || {}); const voteCount = votes.length; const duration = video.current?.duration || Math.max(1, desiredPosition(state) + 1); const telemetry = state.telemetry || {};
  return <SoftField className="room-page"><header className="room-nav"><button className="back-button" onClick={onLeave}>← Lobby</button><Wordmark/><div className="room-status"><span className={connected?"status-led":"status-led dim"}/><span>{connected ? "LIVE SYNC" : "RECONNECTING"}</span><b>{latency === null ? "— ms" : `${latency} ms`}</b></div><button className="invite-compact" onClick={share}>{copied ? "LINK COPIED" : "INVITE"}<Icon name="share" size={15}/></button></header>{notice&&<div className="room-notice">{notice}</div>}<main className="room-layout"><section className="view-deck"><div className="now-line"><span>NOW PLAYING</span><b>{config.title}</b><i/><span>{hasRemote ? "YOU HAVE THE REMOTE" : "HOST HAS THE REMOTE"}</span></div><div className="screen-chassis"><div className="screen-beam"/><video ref={video} src={config.source} onTimeUpdate={onTime} onEnded={()=>sendPlayback(false, video.current?.currentTime || 0)} playsInline preload="metadata"/><div className="screen-fallback"><span>{config.source ? "READY TO SYNCHRONIZE" : "CHOOSE A VIDEO FROM THE QUEUE"}</span><div className="orbital-art"><i/><i/><i/></div></div>{reaction&&<div className="reaction-pop">{reaction}</div>}<div className="watching-rack">{members.slice(0,5).map((member, index)=><Avatar key={member.id} name={member.name} tint={tints[index%4]} small/>)}<span>{members.filter(member=>member.online).length || 1} IN ROOM</span></div><div className="transport"><button className="transport-play" disabled={!hasRemote} onClick={()=>sendPlayback(!state.playing, video.current?.currentTime || desiredPosition(state))}><Icon name={state.playing ? "pause" : "play"} size={18}/></button><span>{formatTime(desiredPosition(state))}</span><input disabled={!hasRemote} type="range" min="0" max={duration} step=".1" value={Math.min(desiredPosition(state), duration)} onChange={event=>{ const position = Number(event.target.value); if(video.current) video.current.currentTime = position; sendPlayback(state.playing, position); }} style={{ "--track": `${Math.min(desiredPosition(state) / duration * 100, 100)}%` }}/><span>{Number.isFinite(video.current?.duration) ? formatTime(video.current.duration) : "--:--"}</span><button className="plain-icon"><Icon name="sound"/></button><button className="plain-icon"><Icon name="expand"/></button></div></div><div className="room-notes"><div><span>SYNC STATUS</span><b>{latency === null ? "Measuring route…" : `${latency} ms round trip`}</b><small>{telemetry.averageDrift === null ? "Collecting local player drift samples…" : `avg drift ${telemetry.averageDrift.toFixed(2)}s · max ${telemetry.maxDrift.toFixed(2)}s`}</small><small>{telemetry.commands || 0} playback commands · {telemetry.deliverySamples || 0} delivery acknowledgements · {telemetry.deliveryTimeouts || 0} timeouts</small></div><div className="reaction-dock">{["✨", "♥", "⚡", "👏", "😂"].map(emoji=><button key={emoji} title={`Signal ${emoji} mood`} onClick={()=>socket.current?.emit("reaction:send", { emoji })}>{emoji}</button>)}</div></div></section><aside className="room-drawer"><div className="drawer-tabs"><button className={drawer==="chat"?"active":""} onClick={()=>setDrawer("chat")}>Chat <b>{messages.length}</b></button><button className={drawer==="queue"?"active":""} onClick={()=>setDrawer("queue")}><Icon name="queue" size={14}/> Queue <b>{state.playlist?.length || 0}</b></button><button className={drawer==="people"?"active":""} onClick={()=>setDrawer("people")}>People <b>{members.filter(m=>m.online).length}</b></button><button className={drawer==="poll"?"active":""} onClick={()=>setDrawer("poll")}>Poll</button></div>{drawer==="chat"&&<><div className="drawer-head"><span className="eyebrow"><span/>LIVE THREAD</span><h3>Leave a thought.</h3></div><div className="message-list">{messages.length?messages.map(message=><article key={message.id}><Avatar name={message.name} tint="violet" small/><p><b>{message.name}</b><span>{message.text}</span></p></article>):<div className="empty-thread">The room is quiet.<br/>Say something worth keeping.</div>}</div><form className="message-box" onSubmit={event=>{event.preventDefault(); if(draft.trim()){socket.current?.emit("chat:send", { text: draft.trim() }); setDraft("");}}}><input value={draft} onChange={event=>setDraft(event.target.value)} placeholder="Say something…"/><button><Icon name="send"/></button></form></>}{drawer==="queue"&&<Queue playlist={state.playlist || []} isHost={state.hostId===selfId} mood={state.mood} onAdd={item=>socket.current?.emit("playlist:add", item)} onPlay={id=>socket.current?.emit("playlist:play", { id })} onRemove={id=>socket.current?.emit("playlist:remove", { id })}/>} {drawer==="people"&&<><div className="drawer-head"><span className="eyebrow"><span/>IN THIS ROOM</span><h3>{members.filter(m=>m.online).length || 1} presence detected.</h3></div><div className="member-list">{members.map((member,index)=><div key={member.id} className={!member.online ? "offline" : ""}><Avatar name={member.name} tint={tints[index%4]}/><span>{member.name}{member.id===state.hostId&&<small>HOST</small>}{!member.online&&<small>RECONNECTING</small>}</span><i/>{state.hostId===selfId && member.id!==selfId && member.online&&<button className="member-transfer" title={`Make ${member.name} host`} onClick={()=>socket.current?.emit("host:transfer", { memberId: member.id })}><Icon name="transfer" size={15}/></button>}</div>)}</div></>} {drawer==="poll"&&<div className="poll-pane"><span className="eyebrow"><span/>GROUP DECISION</span><h3>{poll.question}</h3>{poll.options.map(option=>{const count=votes.filter(vote=>vote===option).length;return <button key={option} onClick={()=>socket.current?.emit("poll:vote", { option })}><span>{option}</span><b>{voteCount ? Math.round(count / voteCount * 100) : 0}%</b><i style={{width:`${voteCount ? count / voteCount * 100 : 0}%`}}/></button>;})}<small>{voteCount} votes · live for everyone</small></div>}</aside></main></SoftField>;
}

export default function App() {
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem("afterglow-profile")); } catch { return null; } })();
  const invite = useRef(new URLSearchParams(location.search).get("room")); const [profile, setProfile] = useState(saved), [view, setView] = useState(saved ? "lobby" : "identity"), [room, setRoom] = useState(null), [setup, setSetup] = useState(false);
  useVisualInteractions();
  const enter = nextRoom => { setRoom(nextRoom); setSetup(false); setView("room"); };
  const continueAs = nextProfile => { sessionStorage.setItem("afterglow-profile", JSON.stringify(nextProfile)); setProfile(nextProfile); if(invite.current) enter({ id: invite.current, title: "An invited room", source: "", control: "host" }); else setView("lobby"); };
  useEffect(() => { if(saved && invite.current) enter({ id: invite.current, title: "An invited room", source: "", control: "host" }); }, []);
  if(view === "identity") return <Identity onContinue={continueAs}/>;
  if(view === "room" && room) return <Room profile={profile} room={room} onLeave={()=>setView("lobby")}/>;
  return <><Lobby profile={profile} onCreate={()=>setSetup(true)} onJoin={id=>enter({ id, title: "An invited room", source: "", control: "host" })}/>{setup&&<CreateRoom onClose={()=>setSetup(false)} onEnter={enter}/>}</>;
}
