import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { createMemberId, desiredPosition } from "../utils/watchParty.js";
import { applyLocalClockOffset, clampLocalClockOffset, correctionZone, createClockOffsetEstimator, enforcePausedPlayback, handlePlayerStateChange, shouldSendHeartbeat } from "../utils/playbackSync.js";
import { createHtmlVideoPlayer } from "../player/htmlVideoPlayer.js";
import { createYoutubePlayer, youtubeErrorMessage } from "../player/youtubePlayer.js";
import { createHlsPlayer, hlsErrorMessage, mediaErrorMessage } from "../player/hlsPlayer.js";
import { isMixedContent, mediaProvider, streamingPlatform, youtubeVideoId } from "../data/catalog.js";
import { serverUrl } from "../utils/serverUrl.js";
import { fetchMediaTitle } from "../utils/mediaTitle.js";

const wpDebug = (...args) => {
  if (typeof window !== "undefined" && (window.__WP_DEBUG__ || window.localStorage?.getItem("wp-debug") === "true")) {
    console.log(...args);
  }
};

function createReactionItem(emoji, id) {
  const reactionId = id || `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const x = Math.round(20 + Math.random() * 100);
  const size = Math.round(36 + Math.random() * 12);
  const duration = +(2.5 + Math.random() * 1.0).toFixed(2);
  const sway = Math.round((Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 20));
  const floatDistPct = Math.round(60 + Math.random() * 20);
  return { id: reactionId, emoji, x, size, duration, sway, floatDistPct };
}

export function useRoomSession(profile, room) {
  const [state, setState] = useState({ playing: false, position: 0, updatedAt: Date.now(), version: 0, config: room, playlist: [], poll: null, screenShare: null, reactionHeatmap: [], reactionHighlights: null, mood: { current: null, counts: {}, voters: 0 }, telemetry: { commands: 0, averageDrift: null, maxDrift: 0, averageDeliveryRoundTripMs: null, deliverySamples: 0, deliveryTimeouts: 0 } });
  const [connected, setConnected] = useState(false), [selfId, setSelfId] = useState(null), [members, setMembers] = useState([]), [messages, setMessages] = useState([]), [reaction, setReaction] = useState(null), [reactions, setReactions] = useState([]), [copied, setCopied] = useState(false), [latency, setLatency] = useState(null), [clockOffset, setClockOffset] = useState(0), [notice, setNotice] = useState(""), [localOffset, setLocalOffsetState] = useState(0), [externalReady, setExternalReady] = useState(false), [needsGesture, setNeedsGesture] = useState(false), [sessionReplaced, setSessionReplaced] = useState(false), [lastSeek, setLastSeek] = useState(null);
  const [socketInstance, setSocketInstance] = useState(null);
  const socket = useRef(null), video = useRef(null), youtubeHost = useRef(null), youtube = youtubeHost, player = useRef(null), playerReadyRef = useRef(false), bufferingRef = useRef(false), clockOffsetRef = useRef(clockOffset), localOffsetRef = useRef(localOffset), clockEstimator = useRef(createClockOffsetEstimator()), lastHeartbeat = useRef(0), lastDriftSample = useRef(0), createOnNextConnect = useRef(Boolean(room.create)), memberId = useRef(createMemberId()), stateRef = useRef(state), reactionIdRef = useRef(0), reactionTimersRef = useRef(new Map()), seenReactionIdsRef = useRef(new Set()), clientReactionTimestampsRef = useRef([]), addReactionItemRef = useRef(null);
  stateRef.current = state;
  clockOffsetRef.current = clockOffset;
  localOffsetRef.current = localOffset;
  const config = state.config || room;
  const provider = mediaProvider(config.source);
  const isSyncOnly = provider === "external";
  const hasRemote = isSyncOnly
    ? state.hostId === selfId
    : state.config?.control === "shared" || state.hostId === selfId;
  const hasRemoteRef = useRef(hasRemote);
  hasRemoteRef.current = hasRemote;
  const applyState = next => {
    stateRef.current = {
      ...stateRef.current,
      ...next,
      config: next.config ? { ...stateRef.current.config, ...next.config } : stateRef.current.config,
      playlist: next.playlist ?? stateRef.current.playlist,
      poll: Object.hasOwn(next, "poll") ? next.poll : stateRef.current.poll,
      screenShare: Object.hasOwn(next, "screenShare") ? next.screenShare : stateRef.current.screenShare,
      reactionHeatmap: next.reactionHeatmap ?? stateRef.current.reactionHeatmap,
      reactionHighlights: Object.hasOwn(next, "reactionHighlights") ? next.reactionHighlights : stateRef.current.reactionHighlights,
    };
    setState(previous => ({
      ...previous,
      ...next,
      config: next.config ? { ...previous.config, ...next.config } : previous.config,
      playlist: next.playlist ?? previous.playlist,
      poll: Object.hasOwn(next, "poll") ? next.poll : previous.poll,
      screenShare: Object.hasOwn(next, "screenShare") ? next.screenShare : previous.screenShare,
      reactionHeatmap: next.reactionHeatmap ?? previous.reactionHeatmap,
      reactionHighlights: Object.hasOwn(next, "reactionHighlights") ? next.reactionHighlights : previous.reactionHighlights,
    }));
  };
  const getPlayer = () => player.current;
  const getDesiredPosition = playbackState => {
    const desired = getCanonicalPosition(playbackState);
    return isSyncOnly ? applyLocalClockOffset(desired, localOffsetRef.current) : desired;
  };
  const getCanonicalPosition = playbackState => desiredPosition(playbackState || state, Date.now(), clockOffsetRef.current);
  const updateLocalOffset = offset => {
    const nextOffset = clampLocalClockOffset(offset);
    localOffsetRef.current = nextOffset;
    setLocalOffsetState(nextOffset);
  };

  const removeReaction = useCallback((id) => {
    if (reactionTimersRef.current.has(id)) {
      clearTimeout(reactionTimersRef.current.get(id));
      reactionTimersRef.current.delete(id);
    }
    setReactions(previous => previous.filter(r => r.id !== id));
  }, []);

  const addReactionItem = useCallback((item) => {
    setReaction(item.emoji);
    setReactions(previous => {
      if (previous.some(r => r.id === item.id)) return previous;
      if (previous.length >= 40) {
        const dropped = previous.slice(0, previous.length - 39);
        dropped.forEach(d => {
          if (reactionTimersRef.current.has(d.id)) {
            clearTimeout(reactionTimersRef.current.get(d.id));
            reactionTimersRef.current.delete(d.id);
          }
        });
      }
      return [...previous.slice(-39), item];
    });

    const isReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const cleanupMs = isReduced ? 1600 : Math.ceil((item.duration + 1.5) * 1000);
    const timer = setTimeout(() => {
      removeReaction(item.id);
    }, cleanupMs);
    reactionTimersRef.current.set(item.id, timer);
  }, [removeReaction]);
  addReactionItemRef.current = addReactionItem;

  const sendReaction = useCallback((emoji) => {
    if (!emoji) return;
    const nowTime = Date.now();
    clientReactionTimestampsRef.current = clientReactionTimestampsRef.current.filter(t => nowTime - t < 1000);
    if (clientReactionTimestampsRef.current.length >= 5) {
      return;
    }
    clientReactionTimestampsRef.current.push(nowTime);

    const localId = `r-${nowTime}-${Math.random().toString(36).slice(2, 9)}`;
    const item = createReactionItem(emoji, localId);
    seenReactionIdsRef.current.add(localId);

    addReactionItem(item);
    socket.current?.emit("reaction:send", { emoji, id: localId });
  }, [addReactionItem]);

  const reportBuffering = buffering => {
    if (bufferingRef.current === buffering) return;
    bufferingRef.current = buffering;
    socket.current?.emit("media:buffering", { buffering });
  };
  const reportMediaFailure = code => socket.current?.emit("media:failure", { code });

  useEffect(() => {
    const client = io(serverUrl, { transports: ["websocket", "polling"], reconnection: true });
    socket.current = client;
    setSocketInstance(client);
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
    client.on("playback:state", (next, acknowledge) => {
      wpDebug("[wp-debug] attendee playback:state received", {
        playing: next.playing,
        version: next.version,
        position: next.position,
        hasPlayer: Boolean(getPlayer()),
        playerReady: playerReadyRef.current,
      });
      applyState(next);
      if (!next.playing) {
        setNeedsGesture(false);
        const activePlayer = getPlayer();
        if (activePlayer) {
          activePlayer.pause();
          const current = activePlayer.currentTime?.() ?? 0;
          if (Number.isFinite(current) && Number.isFinite(next.position) && Math.abs(next.position - current) > 1.0) {
            activePlayer.seek(next.position);
            activePlayer.pause();
          }
        }
      }
      if (typeof acknowledge === "function") acknowledge();
    });
    client.on("room:config", configUpdate => setState(previous => ({ ...previous, config: { ...previous.config, ...configUpdate } })));
    client.on("webrtc:sharing-status", screenShare => setState(previous => ({ ...previous, screenShare })));
    client.on("room:presence", nextMembers => {
      setMembers(nextMembers);
      setExternalReady(Boolean(nextMembers.find(member => member.id === memberId.current)?.externalReady));
    }); client.on("playlist:state", playlist => setState(previous => ({ ...previous, playlist })));
    client.on("chat:message", message => setMessages(previous => [...previous, message]));
    client.on("reaction", data => {
      const emoji = data?.emoji;
      const id = data?.id;
      if (!emoji) return;
      if (id && seenReactionIdsRef.current.has(id)) {
        return;
      }
      if (id) {
        seenReactionIdsRef.current.add(id);
        if (seenReactionIdsRef.current.size > 200) {
          const oldest = Array.from(seenReactionIdsRef.current).slice(0, 50);
          oldest.forEach(k => seenReactionIdsRef.current.delete(k));
        }
      }
      const item = createReactionItem(emoji, id);
      addReactionItemRef.current?.(item);
    });
    client.on("reaction:heatmap", reactionHeatmap => setState(previous => ({ ...previous, reactionHeatmap })));
    client.on("poll:update", poll => setState(previous => ({ ...previous, poll })));
    client.on("mood:update", mood => setState(previous => ({ ...previous, mood })));
    client.on("room:telemetry", telemetry => setState(previous => ({ ...previous, telemetry })));
    client.on("external:seek", data => {
      setLastSeek(data);
      const timeStr = data?.formatted || "target time";
      setNotice(`${data?.hostName || "Host"} jumped the shared clock to ${timeStr}. Seek your player to ${timeStr}.`);
    });
    client.on("room:error", error => {
      wpDebug("[wp-debug] server rejection error", error);
      if (error?.code === "session-replaced") {
        setSessionReplaced(true);
        client.disconnect();
        return;
      }
      setNotice(error.message);
    });
    client.on("media:failure", ({ name, code }) => setNotice(`${name} could not play this video: ${mediaErrorMessage(code)}`));
    return () => {
      setSocketInstance(null);
      client.close();
    };
  }, [profile.name, room.id]);

  useEffect(() => {
    return () => {
      reactionTimersRef.current.forEach(timer => clearTimeout(timer));
      reactionTimersRef.current.clear();
    };
  }, []);

  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(""), 3600); return () => clearTimeout(timeout); }, [notice]);
  useEffect(() => { if (!reaction) return; const timeout = setTimeout(() => setReaction(null), 900); return () => clearTimeout(timeout); }, [reaction]);
  useEffect(() => {
    const probe = () => {
      const clientSentAt = Date.now();
      socket.current?.emit("latency:ping", { clientSentAt }, reply => {
        const clientReceivedAt = Date.now();
        if (!reply?.clientSentAt) return;
        const rttMs = clientReceivedAt - reply.clientSentAt;
        setLatency(rttMs);
        const nextOffset = clockEstimator.current.add({ ...reply, clientSentAt, clientReceivedAt });
        if (nextOffset !== null) setClockOffset(nextOffset);
        socket.current?.emit("sync:health", {
          rttMs,
          clockOffsetMs: nextOffset ?? clockOffsetRef.current,
        });
      });
    };
    probe();
    const interval = setInterval(probe, 5000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    player.current = null;
    playerReadyRef.current = false;
    bufferingRef.current = false;
    setNeedsGesture(false);
    if (provider === "youtube" && youtubeHost.current) {
      if (!youtubeHost.current.isConnected) return;
      const mount = document.createElement("div");
      youtubeHost.current.appendChild(mount);
      const mediaPlayer = createYoutubePlayer(mount, youtubeVideoId(config.source), {
        onReady: async () => {
          if (player.current !== mediaPlayer) return;
          mediaPlayer.seek(stateRef.current.position);
          if (stateRef.current.playing) {
            const result = mediaPlayer.play();
            result?.then?.(() => setNeedsGesture(false))?.catch?.(error => {
              if (error?.name === "NotAllowedError") {
                setNeedsGesture(true);
              }
            });
          } else {
            mediaPlayer.pause();
          }
          playerReadyRef.current = true;

          const defaultTitles = new Set(["Friday, but make it quiet", "Blender Nature Short", "Blender Foundation - Big Buck Bunny 4K", "YouTube Video", "An invited room", "Shared Video"]);
          const currentTitle = stateRef.current.config?.title || "";
          if (hasRemoteRef.current && (defaultTitles.has(currentTitle) || !currentTitle.trim())) {
            const actualTitle = await fetchMediaTitle(config.source);
            if (actualTitle && actualTitle !== currentTitle) {
              socket.current?.emit("room:set-title", { title: actualTitle, source: config.source });
            }
          }
        },
        onStateChange: event => {
          wpDebug("[wp-debug] YT onStateChange", {
            data: event.data,
            roomPlaying: stateRef.current.playing,
            hasRemote: hasRemoteRef.current,
          });
          const buffering = event.data === 3;
          reportBuffering(buffering);
          if (event.data === 0) {
            endPlayback();
            return;
          }
          if (event.data === 1) {
            setNeedsGesture(false);
          }
          handlePlayerStateChange({
            eventState: event.data,
            roomPlaying: stateRef.current.playing,
            roomPosition: stateRef.current.position,
            hasRemote: hasRemoteRef.current,
            player: mediaPlayer,
            onRemotePlay: pos => sendPlayback(true, pos),
            onRemotePause: pos => sendPlayback(false, pos),
          });
        },
        onError: code => {
          reportBuffering(false);
          reportMediaFailure(code);
          setNotice(youtubeErrorMessage(code));
        },
        onAutoplayBlocked: () => {
          if (!stateRef.current.playing) return;
          setNeedsGesture(true);
          setNotice("Tap play once to allow this browser to start the YouTube video.");
        },
      });
      player.current = mediaPlayer;
      return () => {
        playerReadyRef.current = false;
        reportBuffering(false);
        mediaPlayer.destroy();
        youtubeHost.current?.replaceChildren();
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
            result?.then?.(() => setNeedsGesture(false))?.catch?.(error => {
              if (error?.name === "NotAllowedError") {
                setNeedsGesture(true);
                setNotice("Tap play once to allow this browser to start media.");
              }
            });
          }
          playerReadyRef.current = true;
        });
      } else {
        if (video.current.readyState >= 1) {
          playerReadyRef.current = true;
        } else {
          const onLoaded = () => {
            playerReadyRef.current = true;
            video.current?.removeEventListener("loadedmetadata", onLoaded);
          };
          video.current.addEventListener("loadedmetadata", onLoaded);
        }
      }
      return () => {
        playerReadyRef.current = false;
        if (provider === "hls") mediaPlayer.destroy();
        if (player.current === mediaPlayer) player.current = null;
      };
    }
  }, [config.source, provider]);

  useEffect(() => {
    const mediaPlayer = getPlayer(); if (!mediaPlayer) return;
    if (state.playing) {
      const result = mediaPlayer.play();
      result?.then?.(() => setNeedsGesture(false))?.catch?.(error => {
        if (error?.name === "NotAllowedError") {
          setNeedsGesture(true);
          setNotice("Tap play once to allow this browser to start media.");
        }
      });
    } else {
      mediaPlayer.pause();
      setNeedsGesture(false);
    }
  }, [state.playing, config.source, provider]);
  useEffect(() => {
    const mediaPlayer = getPlayer(); if (!mediaPlayer) return;
    if (!state.playing) {
      const enforce = () => {
        const activePlayer = getPlayer();
        if (!activePlayer) return;
        enforcePausedPlayback(activePlayer, state.position);
      };
      enforce();
      const interval = setInterval(enforce, 500);
      return () => clearInterval(interval);
    }
    const correctPlayback = () => {
      const player = getPlayer(); if (!player) return;
      const drift = getDesiredPosition() - player.currentTime();
      if (!Number.isFinite(drift)) return;
      const zone = correctionZone(drift, { supportsPlaybackRate: provider !== "youtube" });
      if (zone === "seek") {
        player.seek(getDesiredPosition());
        if (provider !== "youtube") player.setPlaybackRate?.(1);
      } else if (zone === "rate") {
        player.setPlaybackRate?.(Math.max(0.95, Math.min(1.05, 1 + drift * 0.1)));
      } else if (provider !== "youtube") {
        player.setPlaybackRate?.(1);
      }
    };
    correctPlayback();
    const interval = setInterval(correctPlayback, 250);
    return () => clearInterval(interval);
  }, [state.playing, state.position, state.updatedAt, config.source, provider, clockOffset]);

  const send = (event, payload) => {
    if (event === "reaction:send") {
      sendReaction(payload?.emoji);
      return;
    }
    socket.current?.emit(event, payload);
  };
  const endPlayback = () => send("playback:ended", { version: stateRef.current.version });
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
  const sendPlayback = (playing, position, { heartbeat } = {}) => {
    wpDebug("[wp-debug] host emitted playback:update", {
      playing,
      position,
      version: stateRef.current.version,
      heartbeat: Boolean(heartbeat),
      hasRemote,
    });
    if (!hasRemote) return setNotice("The host has the remote.");
    stateRef.current = { ...stateRef.current, playing: Boolean(playing), position };
    socket.current?.emit("playback:update", {
      playing,
      position,
      version: stateRef.current.version,
      sentAt: Date.now(),
      heartbeat: Boolean(heartbeat),
    });
  };
  const togglePlayback = () => {
    if (isSyncOnly) {
      if (!hasRemote) return setNotice("The host has the remote.");
      if (stateRef.current.playing) {
        send("external:pause");
      } else {
        send("external:countdown");
      }
      return;
    }
    const nextPlaying = !stateRef.current.playing;
    const activePlayer = getPlayer();
    if (nextPlaying) {
      const result = activePlayer?.play();
      result?.then?.(() => setNeedsGesture(false))?.catch?.(error => {
        if (error?.name === "NotAllowedError") {
          setNeedsGesture(true);
          setNotice("Tap play once to allow this browser to start media.");
        }
      });
    } else {
      activePlayer?.pause();
      setNeedsGesture(false);
    }
    const position = isSyncOnly
      ? getCanonicalPosition(stateRef.current)
      : activePlayer?.currentTime() || getDesiredPosition(stateRef.current);
    stateRef.current = { ...stateRef.current, playing: nextPlaying, position };
    setState(previous => ({ ...previous, playing: nextPlaying, position }));
    sendPlayback(nextPlaying, position);
  };
  const handleJoinPlayback = () => {
    if (!stateRef.current.playing) return;
    const mediaPlayer = getPlayer();
    if (mediaPlayer) {
      const result = mediaPlayer.play();
      setNeedsGesture(false);
      result?.then?.(() => setNeedsGesture(false))?.catch?.(error => {
        if (error?.name === "NotAllowedError") {
          setNeedsGesture(true);
        }
      });
    } else {
      setNeedsGesture(false);
    }
  };
  const resyncPlayback = useCallback(() => {
    const mediaPlayer = getPlayer();
    if (!mediaPlayer) return;
    const currentState = stateRef.current;
    if (currentState.playing) {
      const targetPos = getDesiredPosition(currentState);
      mediaPlayer.seek(targetPos);
      const result = mediaPlayer.play();
      result?.then?.(() => setNeedsGesture(false))?.catch?.(error => {
        if (error?.name === "NotAllowedError") {
          setNeedsGesture(true);
        }
      });
    } else {
      mediaPlayer.pause();
      mediaPlayer.seek(currentState.position);
      mediaPlayer.pause();
      setNeedsGesture(false);
    }
  }, []);
  const reconnectThisTab = () => {
    setSessionReplaced(false);
    socket.current?.connect();
  };
  const onTime = () => {
    const timestamp = Date.now();
    if (!stateRef.current.playing) return;
    const mediaPlayer = getPlayer();
    if (!mediaPlayer) return;
    const currentTime = mediaPlayer.currentTime();
    const desired = getDesiredPosition(stateRef.current);
    const drift = currentTime - desired;
    if (timestamp - lastDriftSample.current >= 2000) {
      lastDriftSample.current = timestamp;
      socket.current?.emit("sync:drift", { drift: desired - currentTime });
    }
    const isHost = stateRef.current.hostId === memberId.current;
    if (!shouldSendHeartbeat({
      hasRemote,
      playing: stateRef.current.playing,
      ready: playerReadyRef.current,
      buffering: bufferingRef.current,
      drift,
      isHost,
      lastHeartbeatAt: lastHeartbeat.current,
      now: timestamp,
    })) return;
    lastHeartbeat.current = timestamp;
    sendPlayback(true, currentTime, { heartbeat: true });
  };
  useEffect(() => {
    if (provider !== "youtube") return;
    const interval = setInterval(onTime, 1000);
    return () => clearInterval(interval);
  }, [provider, config.source, hasRemote]);
  const share = async () => {
    try {
      const response = await fetch(`${serverUrl}/api/invite-origin?pageOrigin=${encodeURIComponent(location.origin)}`);
      if (!response.ok) throw new Error(`Invite origin request failed with HTTP ${response.status}.`);
      const { origin } = await response.json();
      const inviteUrl = new URL(origin);
      inviteUrl.pathname = "/";
      inviteUrl.searchParams.set("room", room.id);
      await navigator.clipboard.writeText(inviteUrl.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error("Unable to copy the room invite link.", error);
      setNotice("Could not create or copy the invite link. Check server connectivity and clipboard permissions.");
    }
  };

  return { socket: socketInstance, state, connected, selfId, members, messages, reaction: reactions[reactions.length - 1]?.emoji || null, reactions, sendReaction, removeReaction, copied, latency, notice, setNotice, video, youtube: youtubeHost, youtubeHost, provider, platform: streamingPlatform(config.source), reportBuffering, reportMediaFailure, getPlayer, getDesiredPosition, getCanonicalPosition, hasRemote, config, send, sendPlayback, endPlayback, togglePlayback, onTime, share, requestScreenTicket, externalReady, setExternalReady: ready => { setExternalReady(ready); send("external:ready", { ready }); }, localOffset, updateLocalOffset, getServerNow: () => Date.now() + clockOffsetRef.current, needsGesture, setNeedsGesture, handleJoinPlayback, resyncPlayback, sessionReplaced, reconnectThisTab, lastSeek, setLastSeek };
}
