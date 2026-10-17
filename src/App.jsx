import { useEffect, useRef, useState } from "react";
import { useVisualInteractions } from "./hooks/useVisualInteractions.js";
import { CreateRoom, Identity, Lobby } from "./components/EntryScreens.jsx";
import Room from "./components/Room.jsx";
import "./themes.css";

const themes = new Set(["green", "amber", "blue"]);

function savedTheme() {
  try {
    const theme = localStorage.getItem("afterglow-theme");
    return themes.has(theme) ? theme : "green";
  } catch (error) {
    console.warn("Unable to read the saved color theme.", error);
    return "green";
  }
}

export default function App() {
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem("afterglow-profile")); } catch { return null; } })();
  const invite = useRef(new URLSearchParams(location.search).get("room")); const [profile, setProfile] = useState(saved), [view, setView] = useState(saved ? "lobby" : "identity"), [room, setRoom] = useState(null), [setup, setSetup] = useState(false), [theme, setTheme] = useState(savedTheme);
  useVisualInteractions();
  const enter = nextRoom => { setRoom(nextRoom); setSetup(false); setView("room"); };
  const changeTheme = nextTheme => {
    if (!themes.has(nextTheme)) return;
    setTheme(nextTheme);
    try {
      localStorage.setItem("afterglow-theme", nextTheme);
    } catch (error) {
      console.warn("Unable to save the color theme; it will reset when the page reloads.", error);
    }
  };
  const continueAs = nextProfile => { sessionStorage.setItem("afterglow-profile", JSON.stringify(nextProfile)); setProfile(nextProfile); if(invite.current) enter({ id: invite.current, title: "An invited room", source: "", control: "host" }); else setView("lobby"); };
  useEffect(() => { if(saved && invite.current) enter({ id: invite.current, title: "An invited room", source: "", control: "host" }); }, []);
  if(view === "identity") return <Identity theme={theme} onThemeChange={changeTheme} onContinue={continueAs}/>;
  if(view === "room" && room) return <Room profile={profile} room={room} theme={theme} onThemeChange={changeTheme} onLeave={()=>setView("lobby")}/>;
  return <><Lobby profile={profile} theme={theme} onThemeChange={changeTheme} onCreate={()=>setSetup(true)} onJoin={id=>enter({ id, title: "An invited room", source: "", control: "host" })}/>{setup&&<CreateRoom onClose={()=>setSetup(false)} onEnter={enter}/>}</>;
}
