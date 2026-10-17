import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { createMemberId, desiredPosition } from "../utils/watchParty.js";
import { applyLocalClockOffset, clampLocalClockOffset, correctionZone, createClockOffsetEstimator } from "../utils/playbackSync.js";
import { createHtmlVideoPlayer } from "../player/htmlVideoPlayer.js";
import { createYoutubePlayer, youtubeErrorMessage } from "../player/youtubePlayer.js";
import { createHlsPlayer, hlsErrorMessage, mediaErrorMessage } from "../player/hlsPlayer.js";
import { isMixedContent, mediaProvider, streamingPlatform, youtubeVideoId } from "../data/catalog.js";
import { serverUrl } from "../utils/serverUrl.js";

export function useRoomSession(profile, room) {
  const [state, setState] = useState({ playing: false, position: 0, updatedAt: Date.now(), version: 0, config: room, playlist: [], poll: { question: "What should we watch next?", options: ["Keep the current pick", "Choose from the queue"], votes: {} }, mood: { current: null, counts: {}, voters: 0 }, telemetry: { commands: 0, averageDrift: null, maxDrift: 0, averageDeliveryRoundTripMs: null, deliverySamples: 0, deliveryTimeouts: 0 } });
  const [connected, setConnected] = useState(false), [selfId, setSelfId] = useState(null), [members, setMembers] = useState([]), [messages, setMessages] = useState([]), [reaction, setReaction] = useState(null), [copied, setCopied] = useState(false), [latency, setLatency] = useState(null), [clockOffset, setClockOffset] = useState(0), [notice, setNotice] = useState(""), [localOffset, setLocalOffsetState] = useState(0), [externalReady, setExternalReady] = useState(false);
  const socket = useRef(null), video = useRef(null), youtube = useRef(null), player = useRef(null), bufferingRef = useRef(false), clockOffsetRef = useRef(clockOffset), localOffsetRef = useRef(localOffset), clockEstimator = useRef(createClockOffsetEstimator()), lastHeartbeat = useRef(0), lastDriftSample = useRef(0), createOnNextConnect = useRef(Boolean(room.create)), memberId = useRef(createMemberId()), stateRef = useRef(state);
  stateRef.current = state;
  clockOffsetRef.current = clockOffset;
  localOffsetRef.current = localOffset;
  const config = state.config || room;
  const provider = mediaProvider(config.source);
  const hasRemote = provider === "external"
    ? state.hostId === selfId
    : state.config?.control === "shared" || state.hostId === selfId;
  const applyState = next => setState(previous => ({ ...previous, ...next, config: next.config ? { ...previous.config, ...next.config } : previous.config, playlist: next.playlist || previous.playlist, poll: next.poll || previous.poll }));
  const getPlayer = () => player.current;
  const getDesiredPosition = playbackState => {
    const desired = getCanonicalPosition(playbackState);
    return provider === "external" ? applyLocalClockOffset(desired, localOffsetRef.current) : desired;
  };
  const getCanonicalPosition = playbackState => desiredPosition(playbackState || state, Date.now(), clockOffsetRef.current);
  const updateLocalOffset = offset => {
    const nextOffset = clampLocalClockOffset(offset);
    localOffsetRef.current = nextOffset;
    setLocalOffsetState(nextOffset);
  };
  const reportBuffering = buffering => {
    if (bufferingRef.current === buffering) return;
    bufferingRef.current = buffering;
    socket.current?.emit("media:buffering", { buffering });
  };
  const reportMediaFailure = code => socket.current?.emit("media:failure", { code });

  useEffect(() => {
    const client = io(serverUrl, { transports: ["websocket", "polling"], reconnection: true });
    socket.current = client;
    const join = () => {
      setConnected(true);
      const identity = { roomId: room.id, name: profile.name, memberId: memberId.current };
      if (createOnNextConnect.current) {
        client.emit("room:create", { ...identity, title: room.title, source: room.source, control: room.control });
      } else client.emit("room:join", identity);
    };
    client.on("connect", join); client.on("disconnect", () => { setConnected(false); setExternalReady(false); });
    client.on("room:joined", ({ selfId: id, state: serverState, messages: history }) => { createOnNextConnect.current = false; setSelfId(id); setMessages(history); applyState(serverState); });
    client.on("room:state", applyState);
    client.on("playback:state", (next, acknowledge) => { applyState(next); if (typeof acknowledge === "function") acknowledge(); });
    client.on("room:config", configUpdate => setState(previous => ({ ...previous, config: { ...previous.config, ...configUpdate } })));
    client.on("room:presence", nextMembers => {
      setMembers(nextMembers);
      setExternalReady(Boolean(nextMembers.find(member => member.id === memberId.current)?.externalReady));
    }); client.on("playlist:state", playlist => setState(previous => ({ ...previous, playlist })));
    client.on("chat:message", message => setMessages(previous => [...previous, message])); client.on("reaction", ({ emoji }) => setReaction(emoji)); client.on("poll:update", poll => setState(previous => ({ ...previous, poll })));
    client.on("mood:update", mood => setState(previous => ({ ...previous, mood })));
    client.on("room:telemetry", telemetry => setState(previous => ({ ...previous, telemetry })));
    client.on("room:error", error => setNotice(error.message));
    client.on("media:failure", ({ name, code }) => setNotice(`${name} could not play this video: ${mediaErrorMessage(code)}`));
    return () => client.close();
  }, [profile.name, room.id]);

  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(""), 3600); return () => clearTimeout(timeout); }, [notice]);
  useEffect(() => { if (!reaction) return; const timeout = setTimeout(() => setReaction(null), 900); return () => clearTimeout(timeout); }, [reaction]);
  useEffect(() => {
    const probe = () => {
      const clientSentAt = Date.now();
      socket.current?.emit("latency:ping", { clientSentAt }, reply => {
        const clientReceivedAt = Date.now();
        if (reply?.clientSentAt) setLatency(clientReceivedAt - reply.clientSentAt);
        const offset = clockEstimator.current.add({ ...reply, clientSentAt, clientReceivedAt });
        if (offset !== null) setClockOffset(offset);
      });
    };
    probe();
    const interval = setInterval(probe, 5000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    player.current = null;
    bufferingRef.current = false;
    if (provider === "youtube" && youtube.current) {
      const mediaPlayer = createYoutubePlayer(youtube.current, youtubeVideoId(config.source), {
        onReady: () => {
          mediaPlayer.seek(getDesiredPosition(stateRef.current));
          if (stateRef.current.playing) mediaPlayer.play();
          else mediaPlayer.pause();
        },
        onStateChange: event => {
          const buffering = event.data === 3;
          reportBuffering(buffering);
          if (event.data === 0) sendPlayback(false, mediaPlayer.currentTime());
        },
        onError: code => {
          reportBuffering(false);
          reportMediaFailure(code);
          setNotice(youtubeErrorMessage(code));
        },
        onAutoplayBlocked: () => setNotice("Tap play once to allow this browser to start the YouTube video."),
      });
      player.current = mediaPlayer;
      return () => {
        reportBuffering(false);
        mediaPlayer.destroy();
        if (player.current === mediaPlayer) player.current = null;
      };
    }
    if ((provider === "url" || provider === "hls") && video.current) {
      if (provider === "hls" && isMixedContent(config.source, window.location.protocol)) {
        setNotice(hlsErrorMessage("mixed-content"));
        reportMediaFailure("mixed-content");
        return;
      }
      const mediaPlayer = provider === "hls"
        ? createHlsPlayer(video.current, config.source, {
          onError: code => {
            reportBuffering(false);
            reportMediaFailure(code);
            setNotice(hlsErrorMessage(code));
          },
          onBuffering: reportBuffering,
        })
        : createHtmlVideoPlayer(video.current);
      player.current = mediaPlayer;
      if (provider === "hls") {
        mediaPlayer.ready.then(() => {
          if (player.current !== mediaPlayer) return;
          mediaPlayer.seek(getDesiredPosition(stateRef.current));
          if (stateRef.current.playing) {
            const result = mediaPlayer.play();
            result?.catch?.(() => setNotice("Tap play once to allow this browser to start media."));
          }
        });
      }
      return () => {
        if (provider === "hls") mediaPlayer.destroy();
        if (player.current === mediaPlayer) player.current = null;
      };
    }
  }, [config.source, provider]);

  useEffect(() => {
    const mediaPlayer = getPlayer(); if (!mediaPlayer) return;
    if (state.playing) {
      const result = mediaPlayer.play();
      result?.catch?.(() => setNotice("Tap play once to allow this browser to start media."));
    } else mediaPlayer.pause();
  }, [state.playing, config.source, provider]);
  useEffect(() => {
    const correctPlayback = () => {
      const mediaPlayer = getPlayer(); if (!mediaPlayer) return;
      const drift = getDesiredPosition() - mediaPlayer.currentTime();
      if (!Number.isFinite(drift)) return;
      const zone = correctionZone(drift, { supportsPlaybackRate: provider !== "youtube" });
      if (zone === "seek") {
        mediaPlayer.seek(getDesiredPosition());
        if (provider !== "youtube") mediaPlayer.setPlaybackRate?.(1);
      } else if (zone === "rate") {
        mediaPlayer.setPlaybackRate?.(Math.max(0.95, Math.min(1.05, 1 + drift * 0.1)));
      } else if (provider !== "youtube") {
        mediaPlayer.setPlaybackRate?.(1);
      }
    };
    correctPlayback();
    const interval = setInterval(correctPlayback, 250);
    return () => clearInterval(interval);
  }, [state.playing, state.position, state.updatedAt, config.source, provider, clockOffset]);

  const send = (event, payload) => socket.current?.emit(event, payload);
  const requestScreenTicket = useCallback(() => new Promise((resolve, reject) => {
    if (!socket.current?.connected) {
      reject(new Error("Reconnect to the room before starting screen sharing."));
      return;
    }
    socket.current.timeout(5_000).emit("screen:ticket", {}, (timeoutError, response) => {
      if (timeoutError) {
        reject(new Error("The room did not respond to the screen-share request."));
      } else if (!response?.ticket) {
        reject(new Error(response?.error || "The room could not authorize screen sharing."));
      } else {
        resolve(response.ticket);
      }
    });
  }), []);
  const sendPlayback = (playing, position) => { if (!hasRemote) return setNotice("The host has the remote."); socket.current?.emit("playback:update", { playing, position, version: stateRef.current.version, sentAt: Date.now() }); };
  const togglePlayback = () => {
    const playing = !stateRef.current.playing;
    if (playing) {
      const result = getPlayer()?.play();
      result?.catch?.(() => setNotice("Tap play once to allow this browser to start media."));
    }
    const position = provider === "external"
      ? getCanonicalPosition(stateRef.current)
      : getPlayer()?.currentTime() || getDesiredPosition(stateRef.current);
    sendPlayback(playing, position);
  };
  const onTime = () => {
    const timestamp = Date.now();
    const mediaPlayer = getPlayer();
    if (!mediaPlayer) return;
    if (timestamp - lastDriftSample.current >= 2000) {
      lastDriftSample.current = timestamp;
      socket.current?.emit("sync:drift", { drift: getDesiredPosition(stateRef.current) - mediaPlayer.currentTime() });
    }
    if (!hasRemote || !stateRef.current.playing || timestamp - lastHeartbeat.current < 2000) return;
    lastHeartbeat.current = timestamp;
    sendPlayback(true, mediaPlayer.currentTime());
  };
  useEffect(() => {
    if (provider !== "youtube") return;
    const interval = setInterval(onTime, 1000);
    return () => clearInterval(interval);
  }, [provider, config.source, hasRemote]);
  const share = async () => { await navigator.clipboard?.writeText(`${location.origin}/?room=${room.id}`); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  return { state, connected, selfId, members, messages, reaction, copied, latency, notice, video, youtube, provider, platform: streamingPlatform(config.source), reportBuffering, reportMediaFailure, getPlayer, getDesiredPosition, getCanonicalPosition, hasRemote, config, send, sendPlayback, togglePlayback, onTime, share, requestScreenTicket, externalReady, setExternalReady: ready => { setExternalReady(ready); send("external:ready", { ready }); }, localOffset, updateLocalOffset, getServerNow: () => Date.now() + clockOffsetRef.current };
}
