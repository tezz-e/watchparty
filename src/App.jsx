import { useEffect, useRef, useState } from "react";

const members = [
  { name: "Manee", initials: "M", tone: "coral", host: true },
  { name: "Priya", initials: "P", tone: "lilac" },
  { name: "Aarav", initials: "A", tone: "mint" },
  { name: "Nico", initials: "N", tone: "sky" },
];

const initialMessages = [
  { name: "Priya", time: "9:41", text: "The colour grading in this scene is unreal.", tone: "lilac" },
  { name: "Aarav", time: "9:42", text: "Wait for the next shot ✦", tone: "mint" },
];

function Icon({ name, size = 18 }) {
  const paths = {
    play: "M8 5.6v12.8L18.8 12 8 5.6Z",
    pause: "M8 5h3.2v14H8zm4.8 0H16v14h-3.2z",
    volume: "M4 10v4h3l4 3V7l-4 3H4zm10.4 1.2a2.6 2.6 0 0 1 0 1.6m2.1-3.4a5.1 5.1 0 0 1 0 5.2",
    settings: "M12 8.4A3.6 3.6 0 1 0 12 15.6 3.6 3.6 0 0 0 12 8.4Zm0-5v2m0 13v2m8.6-8.4h-2m-13.2 0h-2m14.9-6.1-1.4 1.4M7.1 16.9l-1.4 1.4m0-12.6 1.4 1.4m9.8 9.8 1.4 1.4",
    send: "m21 3-7.4 18-3.1-7.4L3 10.5 21 3Zm-10.5 10.5L21 3",
    link: "M9.5 14.5 14.5 9.5m-7.2 7.7-1.2 1.2a3.1 3.1 0 0 1-4.4-4.4l3-3a3.1 3.1 0 0 1 4.4 0m7.6 2.4a3.1 3.1 0 0 1 0 4.4l-3 3a3.1 3.1 0 0 1-4.4 0",
    fullscreen: "M8.7 4H4v4.7m11.3 0V4H20v4.7M4 15.3V20h4.7m6.6 0H20v-4.7",
    spark: "m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z",
    chevron: "m8 10 4 4 4-4",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(288);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [reaction, setReaction] = useState(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [selectedPoll, setSelectedPoll] = useState(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const timer = useRef();

  useEffect(() => {
    if (playing) timer.current = setInterval(() => setPosition((value) => Math.min(value + 1, 744)), 1000);
    return () => clearInterval(timer.current);
  }, [playing]);

  useEffect(() => {
    if (!reaction) return;
    const timeout = setTimeout(() => setReaction(null), 850);
    return () => clearTimeout(timeout);
  }, [reaction]);

  const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const sendMessage = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [...current, { name: "Manee", time: "now", text, tone: "coral" }]);
    setDraft("");
  };
  const copyInvite = async () => {
    await navigator.clipboard?.writeText(`${window.location.origin}/room/afterglow-26`);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1600);
  };

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top"><span className="brand-mark"><i></i><i></i><i></i></span><span>afterglow</span></a>
      <div className="room-chip"><span className="live-dot"></span><span>ROOM</span><b>afterglow-26</b><button className="icon-button subtle" onClick={copyInvite} aria-label="Copy invite link"><Icon name="link" size={15}/></button></div>
      <div className="top-actions"><span className="sync-state"><span className="sync-orbit"></span>synced</span><button className="invite-button" onClick={copyInvite}>{inviteCopied ? "Invite copied" : "Invite friends"}<Icon name="link" size={16}/></button><button className="profile" aria-label="Your profile">M</button></div>
    </header>

    <section className="content-grid" id="top">
      <section className="stage-column">
        <div className="eyebrow-row"><span>NOW WATCHING</span><span className="episode">S01 · E04</span></div>
        <div className="video-frame">
          <div className="film-grain"></div><div className="aurora aurora-one"></div><div className="aurora aurora-two"></div>
          <div className="scene-copy"><span>Original short film</span><h1>THE<br/>IN-BETWEEN</h1><p>Somewhere between here and there, we learned how to stay.</p></div>
          <div className="scene-credit">A FILM BY ALEX MORGAN<br/><span>2025</span></div>
          {reaction && <span className="reaction-burst">{reaction}</span>}
          <div className="member-pips">{members.slice(0, 3).map((member) => <span key={member.name} className={`mini-avatar ${member.tone}`}>{member.initials}</span>)}<span className="watching-now">4 watching</span></div>
          <div className="player-controls">
            <button className="play-button" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}><Icon name={playing ? "pause" : "play"} size={20}/></button>
            <span className="time">{formatTime(position)} <i>/</i> 12:24</span>
            <input aria-label="Video timeline" type="range" min="0" max="744" value={position} onChange={(event) => setPosition(Number(event.target.value))} style={{ "--progress": `${(position / 744) * 100}%` }} />
            <button className="control-button" aria-label="Volume"><Icon name="volume"/></button><button className="control-button" aria-label="Settings"><Icon name="settings"/></button><button className="control-button" aria-label="Fullscreen"><Icon name="fullscreen"/></button>
          </div>
        </div>
        <div className="meta-row"><div><h2>The In-Between</h2><p>Tonight's pick · 12 min</p></div><div className="reaction-row"><button onClick={() => setReaction("♡")} aria-label="Love">♡</button><button onClick={() => setReaction("✦")} aria-label="Spark">✦</button><button onClick={() => setReaction("⚡")} aria-label="Excited">⚡</button><button onClick={() => setReaction("😮")} aria-label="Surprised">😮</button></div></div>
        <section className="queue-section"><div className="section-title"><span>UP NEXT</span><button>View queue <Icon name="chevron" size={15}/></button></div><div className="queue-card"><div className="queue-poster"><span>01</span></div><div><h3>Moonlit Drive</h3><p>Short film · 08:31</p></div><button className="queue-play"><Icon name="play" size={15}/></button></div><div className="queue-card"><div className="queue-poster second"><span>02</span></div><div><h3>Stay for the credits</h3><p>Music video · 03:48</p></div><button className="queue-play"><Icon name="play" size={15}/></button></div></section>
      </section>

      <aside className="side-panel">
        <section className="people-card"><div className="panel-heading"><div><span className="section-kicker">IN THE ROOM</span><h2>4 friends watching</h2></div><button className="more-button">•••</button></div><div className="people-list">{members.map((member) => <div className="person" key={member.name}><span className={`avatar ${member.tone}`}>{member.initials}<i className="online"></i></span><span>{member.name} {member.host && <small>HOST</small>}</span>{member.name === "Aarav" && <span className="speaking-bars"><i></i><i></i><i></i></span>}</div>)}</div></section>

        <section className="chat-card"><div className="chat-top"><div><span className="section-kicker">LIVE CHAT</span><h2>Keep the moment going</h2></div><button className={`poll-button ${pollOpen ? "active" : ""}`} onClick={() => setPollOpen(!pollOpen)}><Icon name="spark" size={15}/> Poll</button></div>
          {pollOpen && <div className="poll-card"><span className="poll-label">YOUR TURN</span><h3>What should we watch next?</h3>{["Moonlit Drive", "Stay for the credits"].map((option, index) => <button key={option} className={selectedPoll === index ? "selected" : ""} onClick={() => setSelectedPoll(index)}><span>{option}</span><b>{index === 0 ? "62%" : "38%"}</b></button>)}<small>{selectedPoll === null ? "3 votes so far" : "Vote saved · updates everyone"}</small></div>}
          <div className="messages">{messages.map((message, index) => <div className="message" key={`${message.name}-${index}`}><span className={`message-avatar ${message.tone}`}>{message.name[0]}</span><p><b>{message.name}</b><time>{message.time}</time><span>{message.text}</span></p></div>)}</div>
          <form className="chat-input" onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Say something nice…"/><button type="submit" aria-label="Send message"><Icon name="send" size={17}/></button></form>
        </section>
      </aside>
    </section>
  </main>;
}
