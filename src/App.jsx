import { useEffect, useRef, useState } from "react";
import { useVisualInteractions } from "./hooks/useVisualInteractions.js";
import { CreateRoom, Identity, Lobby } from "./components/EntryScreens.jsx";
import Room from "./components/Room.jsx";
import { parseRoomCode } from "./utils/watchParty.js";
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
  const rawInvite = new URLSearchParams(location.search).get("room");
  const invite = useRef(parseRoomCode(rawInvite) || rawInvite);
  const [profile, setProfile] = useState(saved);

  const [view, setView] = useState(saved ? "lobby" : "identity");
  const [room, setRoom] = useState(null);
  const [setup, setSetup] = useState(false);
  const [theme, setTheme] = useState(savedTheme);
  const [recentRoom, setRecentRoom] = useState(() => {
    try {
      const stored = sessionStorage.getItem("afterglow-last-room");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useVisualInteractions();

  const enter = nextRoom => {
    setRoom(nextRoom);
    setSetup(false);
    setView("room");
    try {
      const roomInfo = { id: nextRoom.id, title: nextRoom.title || "Watch Room" };
      sessionStorage.setItem("afterglow-last-room", JSON.stringify(roomInfo));
      setRecentRoom(roomInfo);
      const url = new URL(window.location.href);
      url.searchParams.set("room", nextRoom.id);
      window.history.replaceState({}, "", url.toString());
    } catch (e) {
      console.warn("Unable to update room URL state.", e);
    }
  };

  const leave = () => {
    setView("lobby");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      window.history.replaceState({}, "", url.pathname || "/");
    } catch (e) {
      console.warn("Unable to clear room URL state.", e);
    }
  };

  const changeTheme = nextTheme => {
    if (!themes.has(nextTheme)) return;
    setTheme(nextTheme);
    try {
      localStorage.setItem("afterglow-theme", nextTheme);
    } catch (error) {
      console.warn("Unable to save the color theme; it will reset when the page reloads.", error);
    }
  };

  const continueAs = nextProfile => {
    sessionStorage.setItem("afterglow-profile", JSON.stringify(nextProfile));
    setProfile(nextProfile);
    if (invite.current) enter({ id: invite.current, title: "An invited room", source: "", control: "host" });
    else setView("lobby");
  };

  useEffect(() => {
    if (saved && invite.current) {
      enter({ id: invite.current, title: "An invited room", source: "", control: "host" });
    }
  }, []);

  if (view === "identity") return <Identity theme={theme} onThemeChange={changeTheme} onContinue={continueAs}/>;
  if (view === "room" && room) return <Room profile={profile} room={room} theme={theme} onThemeChange={changeTheme} onLeave={leave}/>;
  return (
    <>
      <Lobby
        profile={profile}
        theme={theme}
        onThemeChange={changeTheme}
        recentRoom={recentRoom}
        onCreate={() => setSetup(true)}
        onJoin={id => enter({ id, title: "An invited room", source: "", control: "host" })}
      />
      {setup && <CreateRoom theme={theme} onClose={() => setSetup(false)} onEnter={enter}/>}
    </>
  );
}
