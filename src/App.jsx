import { useEffect, useRef, useState } from "react";
import { useVisualInteractions } from "./hooks/useVisualInteractions.js";
import { CreateRoom, Identity, Lobby } from "./components/EntryScreens.jsx";
import Room from "./components/Room.jsx";

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
