import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const tints = ["lime", "coral", "violet", "sky"];
const demoSource = "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
const catalog = [
  { id: "blazes", title: "For Bigger Blazes", category: "Adventure", duration: "0:15", source: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", note: "Open media sample", tone: "sunset", moods: ["energetic", "thrilling"] },
  { id: "escapes", title: "For Bigger Escapes", category: "Travel", duration: "0:15", source: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4", note: "Open media sample", tone: "ocean", moods: ["cozy", "uplifting"] },
  { id: "joyrides", title: "For Bigger Joyrides", category: "Road trip", duration: "0:15", source: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4", note: "Open media sample", tone: "lime", moods: ["playful", "energetic"] },
  { id: "meltdowns", title: "For Bigger Meltdowns", category: "Drama", duration: "0:15", source: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4", note: "Open media sample", tone: "violet", moods: ["cozy", "thrilling"] },
  { id: "bunny", title: "Big Buck Bunny", category: "Animation", duration: "9:56", source: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", note: "Blender open movie", tone: "amber", moods: ["playful", "uplifting"] },
];
const validMediaUrl = value => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && /\.(mp4|webm)$/i.test(url.pathname);
  } catch {
    return false;
  }
};

const createMemberId = () => {
  const key = "afterglow-member-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.().replaceAll("-", "") || `member${Math.random().toString(36).slice(2)}${Date.now()}`;
    sessionStorage.setItem(key, id);
  }
  return id;
};
const fuzzyMatch = (text, query) => {
  const needle = query.toLowerCase().replace(/\s/g, "");
  if (!needle) return true;
  const haystack = text.toLowerCase();
  let offset = 0;
  for (const char of needle) { offset = haystack.indexOf(char, offset); if (offset < 0) return false; offset += 1; }
  return true;
};
const roomId = () => `room-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 6)}`;
const formatTime = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const desiredPosition = state => state.playing ? state.position + Math.max(0, Date.now() - state.updatedAt) / 1000 : state.position;

function Icon({ name, size = 18 }) {
  const paths = { arrow:"M5 12h13m-5-5 5 5-5 5", plus:"M12 5v14M5 12h14", link:"m9 15 6-6m-7.5 10.5-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0m9.5-1 1-1a3.5 3.5 0 0 0-5-5l-3 3a3.5 3.5 0 0 0 0 5", play:"m9 6 10 6-10 6V6Z", pause:"M9 6h2.5v12H9zm4.5 0H16v12h-2.5z", send:"m21 3-7.3 18-3.2-7.5L3 10.4 21 3Zm-10.5 10.5L21 3", close:"m6 6 12 12M18 6 6 18", spark:"m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z", check:"m5 12 4 4L19 6", sound:"M4 10v4h3l4 3V7l-4 3m3.5.5a3 3 0 0 1 0 3m2-5a6 6 0 0 1 0 7", chevron:"m8 10 4 4 4-4", share:"M12 16V3m0 0L7 8m5-5 5 5M5 14v5h14v-5", user:"M20 21a8 8 0 0 0-16 0m12-13a4 4 0 1 1-8 0 0 1 8 0Z", globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-8-9h16M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18", expand:"M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4", queue:"M4 6h16M4 12h16M4 18h10", transfer:"M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3-3m-3 3 3 3" };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.spark} /></svg>;
}
function Wordmark(){ return <div className="wordmark"><span className="signal-logo"><i/><i/><i/></span><span>afterglow</span></div>; }
function Avatar({ name = "?", tint = "lime", small = false }){ return <span className={`avatar ${tint} ${small ? "small" : ""}`}>{name[0]?.toUpperCase()}</span>; }
function SoftField({ children, className = "" }) { const move = e => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--x", `${e.clientX-r.left}px`); e.currentTarget.style.setProperty("--y", `${e.clientY-r.top}px`); }; return <div onPointerMove={move} className={`soft-field ${className}`}>{children}</div>; }

function Identity({ onContinue }) {
  const [name, setName] = useState(""); const [tint, setTint] = useState("lime");
  return <SoftField className="identity-page"><div className="identity-nav"><Wordmark/><span className="nav-note">SYNCED VIEWING, WITHOUT THE FUSS</span></div><div className="identity-grid"><section className="identity-copy"><p className="eyebrow"><span/>YOUR REMOTE, EVERYWHERE</p><h1>Better nights<br/>start together.</h1><p className="lede">A shared screen with a server held playhead. Your browser only stores a name and a local room identity.</p><div className="principles"><span><i>01</i> no account required</span><span><i>02</i> direct media, locally loaded</span><span><i>03</i> everybody stays in sync</span></div></section><section className="identity-card signal-border"><div className="identity-card-head"><span className="eyebrow">SET YOUR PRESENCE</span><h2>What should we call you?</h2><p>You’ll use this local identity to reconnect to rooms after a drop.</p></div><label className="field-label">DISPLAY NAME<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Manee" maxLength="28"/></label><div className="tint-row"><span>YOUR SIGNAL COLOUR</span><div>{tints.map(c=><button type="button" key={c} className={`tint-dot ${c} ${tint===c?"selected":""}`} onClick={()=>setTint(c)} aria-label={`Choose ${c}`}>{tint===c&&<Icon name="check" size={12}/>}</button>)}</div></div><button className="primary-action" disabled={!name.trim()} onClick={()=>onContinue({name:name.trim(),tint})}>Enter the control room <Icon name="arrow"/></button><p className="quiet-note">No account, password, or video is uploaded to Afterglow.</p></section></div></SoftField>;
}

function Lobby({ profile, onCreate, onJoin }) {
  const [join, setJoin] = useState(false); const [code, setCode] = useState("");
  return <SoftField className="lobby-page"><header className="lobby-nav"><Wordmark/><div className="nav-center"><span className="live-pulse"/>REALTIME READY</div><div className="profile-pill"><Avatar name={profile.name} tint={profile.tint} small/><span>{profile.name}</span></div></header><main className="lobby-main"><section className="lobby-hero"><p className="eyebrow"><span/>CONTROL ROOM</p><h1>Good evening,<br/><em>{profile.name}.</em></h1><p>Create a room with an open playable URL, or join an invitation someone has already shared.</p><div className="lobby-actions"><button className="primary-action" onClick={onCreate}><Icon name="plus"/> Start a room</button><button className="secondary-action" onClick={()=>setJoin(!join)}><Icon name="link"/> Join with a code</button></div>{join&&<form className="join-tray" onSubmit={e=>{e.preventDefault(); if(code.trim()) onJoin(code.trim().toLowerCase());}}><input autoFocus value={code} onChange={e=>setCode(e.target.value.replace(/\s/g, ""))} placeholder="room-code"/><button>Join <Icon name="arrow" size={16}/></button></form>}</section><section className="lobby-instrument"><div className="instrument-top"><span>HOW A ROOM WORKS</span><b>01: SERVER CLOCK</b></div><div className="oscilloscope">{Array.from({ length: 12 }, (_, i) => <i key={i}/>)}</div><div className="instrument-readout"><div><span>CONTROL</span><b><i/> host or shared</b></div><div><span>REJOIN WINDOW</span><b>15 sec</b></div><div><span>CAPACITY</span><b>20 people</b></div></div></section></main><section className="flow-strip"><div><b>01</b><span>Pick a name once</span></div><i/><div><b>02</b><span>Choose media</span></div><i/><div><b>03</b><span>Send one link</span></div><i/><div><b>04</b><span>Press play together</span></div></section></SoftField>;
}

function Discovery({ query, setQuery, category, setCategory, onSelect, action = "Add to queue" }) {
  const categories = ["All", ...new Set(catalog.map(item => item.category))];
  const picks = catalog.filter(item => (category === "All" || item.category === category) && fuzzyMatch(`${item.title} ${item.category}`, query));
  return <section className="discovery"><div className="discovery-head"><div><span className="eyebrow"><span/>OPEN MEDIA LIBRARY</span><h3>Choose a test-ready title.</h3></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Fuzzy search titles"/></div><div className="category-row">{categories.map(item=><button type="button" key={item} onClick={()=>setCategory(item)} className={category===item?"active":""}>{item}</button>)}</div><div className="catalog-grid">{picks.map(item=><button type="button" className={`catalog-card ${item.tone}`} key={item.id} onClick={()=>onSelect(item)} aria-label={`${action}: ${item.title}`}><span className="catalog-art"><span>{item.category}</span><b>{item.duration}</b></span><span className="catalog-info"><small>{item.note}</small><strong>{item.title}</strong><span className="catalog-select"><Icon name="plus" size={14}/>{action}</span></span></button>)}{!picks.length&&<p className="catalog-empty">No close matches. Try another title or category.</p>}</div></section>;
}

function CreateRoom({ onClose, onEnter }) {
  const [title, setTitle] = useState("Friday, but make it quiet"); const [source, setSource] = useState(demoSource); const [control, setControl] = useState("host"); const [query, setQuery] = useState(""); const [category, setCategory] = useState("All");
  return <div className="modal-backdrop"><form className="setup-modal setup-modal-wide" onSubmit={e=>{ e.preventDefault(); onEnter({ id: roomId(), title, source, control, create: true }); }}><button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button><div className="setup-head"><span className="eyebrow"><span/>NEW SESSION</span><h2>Pick the signal first.</h2><p>Every viewer loads the same direct video URL locally. Afterglow distributes timing and room activity, never the video file.</p></div><label className="field-label">ROOM NAME<input value={title} onChange={e=>setTitle(e.target.value)} maxLength="56"/></label><label className="field-label">DIRECT VIDEO URL<input value={source} onChange={e=>setSource(e.target.value)} placeholder="https://…/video.mp4" aria-invalid={!validMediaUrl(source)}/></label>{!validMediaUrl(source)&&<p className="source-error">Enter a direct HTTP(S) URL ending in .mp4 or .webm.</p>}<Discovery query={query} setQuery={setQuery} category={category} setCategory={setCategory} action="Use this" onSelect={item=>{setTitle(item.title);setSource(item.source);}}/><fieldset><legend>WHO HOLDS THE REMOTE?</legend><div className="control-choices"><button type="button" className={control==="host"?"chosen":""} onClick={()=>setControl("host")}><Icon name="user"/><b>Host control</b><span>One person keeps the pace.</span></button><button type="button" className={control==="shared"?"chosen":""} onClick={()=>setControl("shared")}><Icon name="globe"/><b>Shared control</b><span>Everyone can steer.</span></button></div></fieldset><button className="primary-action" disabled={!validMediaUrl(source)||!title.trim()}>Create the room <Icon name="arrow"/></button></form></div>;
}

function Queue({ playlist, isHost, onPlay, onRemove, onAdd, mood }) {
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("All");
  const recommendations = mood?.current ? catalog.filter(item => item.moods.includes(mood.current) && !playlist.some(queued => queued.source === item.source)).slice(0, 2) : [];
  return <div className="queue-pane"><div className="drawer-head"><span className="eyebrow"><span/>SHARED PLAYLIST</span><h3>{playlist.length ? `${playlist.length} picks on deck.` : "Add the next thing."}</h3></div>{mood?.current&&<section className="mood-signal"><span className="eyebrow"><span/>ROOM MOOD · {mood.voters} SIGNAL{mood.voters===1?"":"S"}</span><b>The room feels {mood.current}.</b><small>Reactions are turning into shared picks.</small>{recommendations.map(item=><button key={item.id} onClick={()=>onAdd(item)}>{item.title}<Icon name="plus" size={13}/></button>)}</section>}<div className="queue-list">{playlist.map(item=><article key={item.id}><div><small>{item.category} · {item.duration}</small><b>{item.title}</b></div>{isHost&&<span><button onClick={()=>onPlay(item.id)} title="Play this item"><Icon name="play" size={14}/></button><button onClick={()=>onRemove(item.id)} title="Remove"><Icon name="close" size={14}/></button></span>}</article>)}</div><Discovery query={query} setQuery={setQuery} category={category} setCategory={setCategory} onSelect={onAdd}/></div>;
}

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
  useEffect(() => { let pinching = null; const selector = "button,.identity-card,.lobby-instrument,.profile-pill,.setup-modal,.screen-chassis,.room-drawer"; const paint = event => { const element = event.target.closest(selector); if(!element) return; const rect = element.getBoundingClientRect(); element.dataset.glass=""; element.style.setProperty("--glass-x", `${((event.clientX-rect.left)/rect.width*100).toFixed(2)}%`); element.style.setProperty("--glass-y", `${((event.clientY-rect.top)/rect.height*100).toFixed(2)}%`); }; const touchStart = event => { if(event.touches.length!==2) return; const [a,b]=event.touches; pinching={ distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY), surface:document.elementFromPoint((a.clientX+b.clientX)/2,(a.clientY+b.clientY)/2)?.closest(".screen-chassis") }; }; const touchMove = event => { if(!pinching?.surface||event.touches.length!==2) return; const [a,b]=event.touches; pinching.surface.style.setProperty("--pinch", String(Math.max(.96,Math.min(1.08,Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)/pinching.distance)))); }; const touchEnd=()=>{if(pinching?.surface)pinching.surface.style.setProperty("--pinch","1");pinching=null;}; document.addEventListener("pointermove",paint,{passive:true});document.addEventListener("touchstart",touchStart,{passive:true});document.addEventListener("touchmove",touchMove,{passive:true});document.addEventListener("touchend",touchEnd,{passive:true});return()=>{document.removeEventListener("pointermove",paint);document.removeEventListener("touchstart",touchStart);document.removeEventListener("touchmove",touchMove);document.removeEventListener("touchend",touchEnd);};},[]);
  const enter = nextRoom => { setRoom(nextRoom); setSetup(false); setView("room"); };
  const continueAs = nextProfile => { sessionStorage.setItem("afterglow-profile", JSON.stringify(nextProfile)); setProfile(nextProfile); if(invite.current) enter({ id: invite.current, title: "An invited room", source: "", control: "host" }); else setView("lobby"); };
  useEffect(() => { if(saved && invite.current) enter({ id: invite.current, title: "An invited room", source: "", control: "host" }); }, []);
  if(view === "identity") return <Identity onContinue={continueAs}/>;
  if(view === "room" && room) return <Room profile={profile} room={room} onLeave={()=>setView("lobby")}/>;
  return <><Lobby profile={profile} onCreate={()=>setSetup(true)} onJoin={id=>enter({ id, title: "An invited room", source: "", control: "host" })}/>{setup&&<CreateRoom onClose={()=>setSetup(false)} onEnter={enter}/>}</>;
}
