import { useState } from "react";
import { catalog, demoSource, tints, validMediaUrl } from "../data/catalog.js";
import { fuzzyMatch, roomId } from "../utils/watchParty.js";
import { Avatar, Icon, SoftField, Wordmark } from "./Primitives.jsx";

export function Identity({ onContinue }) {
  const [name, setName] = useState("");
  const [tint, setTint] = useState("lime");

  return (
    <SoftField className="identity-page">
      <div className="identity-nav"><Wordmark/><span className="nav-note">SYNCED VIEWING, WITHOUT THE FUSS</span></div>
      <div className="identity-grid">
        <section className="identity-copy">
          <p className="eyebrow"><span/>YOUR REMOTE, EVERYWHERE</p>
          <h1>Better nights<br/>start together.</h1>
          <p className="lede">A shared screen with a server held playhead. Your browser only stores a name and a local room identity.</p>
          <div className="principles"><span><i>01</i> no account required</span><span><i>02</i> direct media, locally loaded</span><span><i>03</i> everybody stays in sync</span></div>
        </section>
        <section className="identity-card signal-border">
          <div className="identity-card-head"><span className="eyebrow">SET YOUR PRESENCE</span><h2>What should we call you?</h2><p>You’ll use this local identity to reconnect to rooms after a drop.</p></div>
          <label className="field-label">DISPLAY NAME<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Manee" maxLength="28"/></label>
          <div className="tint-row"><span>YOUR SIGNAL COLOUR</span><div>{tints.map(color => <button type="button" key={color} className={`tint-dot ${color} ${tint === color ? "selected" : ""}`} onClick={() => setTint(color)} aria-label={`Choose ${color}`}>{tint === color && <Icon name="check" size={12}/>}</button>)}</div></div>
          <button className="primary-action" disabled={!name.trim()} onClick={() => onContinue({ name: name.trim(), tint })}>Enter the control room <Icon name="arrow"/></button>
          <p className="quiet-note">No account, password, or video is uploaded to Afterglow.</p>
        </section>
      </div>
    </SoftField>
  );
}

export function Lobby({ profile, onCreate, onJoin }) {
  const [join, setJoin] = useState(false);
  const [code, setCode] = useState("");

  return (
    <SoftField className="lobby-page">
      <header className="lobby-nav"><Wordmark/><div className="nav-center"><span className="live-pulse"/>REALTIME READY</div><div className="profile-pill"><Avatar name={profile.name} tint={profile.tint} small/><span>{profile.name}</span></div></header>
      <main className="lobby-main">
        <section className="lobby-hero">
          <p className="eyebrow"><span/>CONTROL ROOM</p>
          <h1>Good evening,<br/><em>{profile.name}.</em></h1>
          <p>Create a room with an open playable URL, or join an invitation someone has already shared.</p>
          <div className="lobby-actions"><button className="primary-action" onClick={onCreate}><Icon name="plus"/> Start a room</button><button className="secondary-action" onClick={() => setJoin(!join)}><Icon name="link"/> Join with a code</button></div>
          {join && <form className="join-tray" onSubmit={event => { event.preventDefault(); if (code.trim()) onJoin(code.trim().toLowerCase()); }}><input autoFocus value={code} onChange={event => setCode(event.target.value.replace(/\s/g, ""))} placeholder="room-code"/><button>Join <Icon name="arrow" size={16}/></button></form>}
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

export function Discovery({ query, setQuery, category, setCategory, onSelect, action = "Add to queue" }) {
  const categories = ["All", ...new Set(catalog.map(item => item.category))];
  const picks = catalog.filter(item => (category === "All" || item.category === category) && fuzzyMatch(`${item.title} ${item.category}`, query));

  return (
    <section className="discovery">
      <div className="discovery-head"><div><span className="eyebrow"><span/>OPEN MEDIA LIBRARY</span><h3>Choose a test-ready title.</h3></div><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Fuzzy search titles"/></div>
      <div className="category-row">{categories.map(item => <button type="button" key={item} onClick={() => setCategory(item)} className={category === item ? "active" : ""}>{item}</button>)}</div>
      <div className="catalog-grid">
        {picks.map(item => <button type="button" className={`catalog-card ${item.tone}`} key={item.id} onClick={() => onSelect(item)} aria-label={`${action}: ${item.title}`}><span className="catalog-art"><span>{item.category}</span><b>{item.duration}</b></span><span className="catalog-info"><small>{item.note}</small><strong>{item.title}</strong><span className="catalog-select"><Icon name="plus" size={14}/>{action}</span></span></button>)}
        {!picks.length && <p className="catalog-empty">No close matches. Try another title or category.</p>}
      </div>
    </section>
  );
}

export function CreateRoom({ onClose, onEnter }) {
  const [title, setTitle] = useState("Friday, but make it quiet");
  const [source, setSource] = useState(demoSource);
  const [control, setControl] = useState("host");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  return (
    <div className="modal-backdrop">
      <form className="setup-modal setup-modal-wide" onSubmit={event => { event.preventDefault(); onEnter({ id: roomId(), title, source, control, create: true }); }}>
        <button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button>
        <div className="setup-head"><span className="eyebrow"><span/>NEW SESSION</span><h2>Pick the signal first.</h2><p>Every viewer loads the same direct video URL locally. Afterglow distributes timing and room activity, never the video file.</p></div>
        <label className="field-label">ROOM NAME<input value={title} onChange={event => setTitle(event.target.value)} maxLength="56"/></label>
        <label className="field-label">DIRECT VIDEO URL<input value={source} onChange={event => setSource(event.target.value)} placeholder="https://…/video.mp4" aria-invalid={!validMediaUrl(source)}/></label>
        {!validMediaUrl(source) && <p className="source-error">Enter a direct HTTP(S) URL ending in .mp4 or .webm.</p>}
        <Discovery query={query} setQuery={setQuery} category={category} setCategory={setCategory} action="Use this" onSelect={item => { setTitle(item.title); setSource(item.source); }}/>
        <fieldset><legend>WHO HOLDS THE REMOTE?</legend><div className="control-choices"><button type="button" className={control === "host" ? "chosen" : ""} onClick={() => setControl("host")}><Icon name="user"/><b>Host control</b><span>One person keeps the pace.</span></button><button type="button" className={control === "shared" ? "chosen" : ""} onClick={() => setControl("shared")}><Icon name="globe"/><b>Shared control</b><span>Everyone can steer.</span></button></div></fieldset>
        <button className="primary-action" disabled={!validMediaUrl(source) || !title.trim()}>Create the room <Icon name="arrow"/></button>
      </form>
    </div>
  );
}

export function Queue({ playlist, isHost, onPlay, onRemove, onAdd, mood }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const recommendations = mood?.current ? catalog.filter(item => item.moods.includes(mood.current) && !playlist.some(queued => queued.source === item.source)).slice(0, 2) : [];

  return (
    <div className="queue-pane">
      <div className="drawer-head"><span className="eyebrow"><span/>SHARED PLAYLIST</span><h3>{playlist.length ? `${playlist.length} picks on deck.` : "Add the next thing."}</h3></div>
      {mood?.current && <section className="mood-signal"><span className="eyebrow"><span/>ROOM MOOD · {mood.voters} SIGNAL{mood.voters === 1 ? "" : "S"}</span><b>The room feels {mood.current}.</b><small>Reactions are turning into shared picks.</small>{recommendations.map(item => <button key={item.id} onClick={() => onAdd(item)}>{item.title}<Icon name="plus" size={13}/></button>)}</section>}
      <div className="queue-list">{playlist.map(item => <article key={item.id}><div><small>{item.category} · {item.duration}</small><b>{item.title}</b></div>{isHost && <span><button onClick={() => onPlay(item.id)} title="Play this item"><Icon name="play" size={14}/></button><button onClick={() => onRemove(item.id)} title="Remove"><Icon name="close" size={14}/></button></span>}</article>)}</div>
      <Discovery query={query} setQuery={setQuery} category={category} setCategory={setCategory} onSelect={onAdd}/>
    </div>
  );
}
