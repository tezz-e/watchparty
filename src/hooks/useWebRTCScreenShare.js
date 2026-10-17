import { useCallback, useEffect, useRef, useState } from "react";

const getIceServers = () => {
  const servers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  const env = typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env
    : (typeof process !== "undefined" ? process.env : {});
  const turnUrl = env?.VITE_TURN_URL;
  if (turnUrl) {
    const turn = { urls: turnUrl };
    if (env.VITE_TURN_USERNAME) turn.username = env.VITE_TURN_USERNAME;
    if (env.VITE_TURN_CREDENTIAL) turn.credential = env.VITE_TURN_CREDENTIAL;
    servers.push(turn);
  }
  return servers;
};

export function useWebRTCScreenShare({
  socket,
  selfId,
  members = [],
  screenShareState = null,
  canPublish = false,
  onNotice,
}) {
  const [stream, setStream] = useState(null);
  const streamRef = useRef(null);
  streamRef.current = stream;
  const [sharing, setSharing] = useState(false);
  const peerConnections = useRef(new Map());
  const pcCreatedAt = useRef(new Map());
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef(new Map());
  const screenShareStateRef = useRef(screenShareState);
  screenShareStateRef.current = screenShareState;
  const prevMembersRef = useRef(new Map());
  const requestedRef = useRef({ key: null, at: 0 });
  const retryTimerRef = useRef(null);
  const retriesRef = useRef(0);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const resetRequestState = useCallback(() => {
    requestedRef.current = { key: null, at: 0 };
    retriesRef.current = 0;
    clearRetryTimer();
  }, [clearRetryTimer]);

  const isSharer = Boolean(
    localStreamRef.current || (screenShareState?.sharerMemberId && screenShareState.sharerMemberId === selfId)
  );

  const cleanupPeers = useCallback(() => {
    peerConnections.current.forEach(pc => {
      try {
        pc.close();
      } catch (err) {
        console.warn("Peer connection close error", err);
      }
    });
    peerConnections.current.clear();
    pendingCandidates.current.clear();
    pcCreatedAt.current.clear();
  }, []);

  const stopSharing = useCallback((emitStop = true) => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (err) {
          console.warn("Track stop error", err);
        }
      });
      localStreamRef.current = null;
    }
    setStream(null);
    streamRef.current = null;
    resetRequestState();
    setSharing(false);
    cleanupPeers();
    if (emitStop && socket?.connected) {
      socket.emit("webrtc:stop-share");
    }
  }, [socket, cleanupPeers, resetRequestState]);

  const initiatePeerConnection = useCallback(
    async (memberId, mediaStream) => {
      if (!socket?.connected) return;
      try {
        const existing = peerConnections.current.get(memberId);
        if (existing) {
          try { existing.close(); } catch {}
          peerConnections.current.delete(memberId);
          pcCreatedAt.current.delete(memberId);
        }

        const pc = new RTCPeerConnection({ iceServers: getIceServers() });
        peerConnections.current.set(memberId, pc);
        pcCreatedAt.current.set(memberId, Date.now());

        let disconnectTimer = null;
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "disconnected") {
            disconnectTimer = setTimeout(() => {
              if (pc.connectionState === "disconnected") {
                try { pc.close(); } catch {}
                peerConnections.current.delete(memberId);
                pcCreatedAt.current.delete(memberId);
              }
            }, 5000);
          } else if (pc.connectionState === "connected") {
            if (disconnectTimer) {
              clearTimeout(disconnectTimer);
              disconnectTimer = null;
            }
          } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            if (disconnectTimer) {
              clearTimeout(disconnectTimer);
              disconnectTimer = null;
            }
            peerConnections.current.delete(memberId);
            pcCreatedAt.current.delete(memberId);
          }
        };

        mediaStream.getTracks().forEach(track => {
          pc.addTrack(track, mediaStream);
        });

        pc.onicecandidate = event => {
          if (event.candidate && socket?.connected) {
            socket.emit("webrtc:signal", {
              toMemberId: memberId,
              signal: { type: "candidate", candidate: event.candidate },
            });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const viewerCount = members.filter(m => m.online && m.id !== selfId).length;
        const maxBitrate = viewerCount > 3 ? 1200000 : 2500000;

        for (const sender of pc.getSenders?.() || []) {
          if (sender.track?.kind === "video") {
            try {
              const p = sender.getParameters?.() || {};
              if (!p.encodings?.length) {
                p.encodings = [{}];
              }
              p.encodings[0].maxBitrate = maxBitrate;
              p.encodings[0].maxFramerate = 30;
              p.degradationPreference = "maintain-framerate";
              await sender.setParameters?.(p);
            } catch (err) {
              console.warn("Failed to set video sender parameters:", err);
            }
          }
        }

        if (socket?.connected) {
          socket.emit("webrtc:signal", {
            toMemberId: memberId,
            signal: { type: "offer", offer },
          });
        }
      } catch (e) {
        console.warn("Failed to create WebRTC offer for peer", memberId, e);
      }
    },
    [socket, members, selfId]
  );

  const startSharing = useCallback(async () => {
    if (!canPublish) {
      onNotice?.("Only the host or remote holder can share their screen.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      onNotice?.("Screen sharing is not supported by this browser.");
      return;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 30 },
          width: { max: 1920 },
          height: { max: 1080 },
        },
        audio: true,
      });

      mediaStream.getVideoTracks().forEach(track => {
        if ("contentHint" in track) {
          track.contentHint = "motion";
        }
      });

      localStreamRef.current = mediaStream;
      setStream(mediaStream);
      setSharing(true);

      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopSharing();
        };
      }

      if (socket?.connected) {
        socket.emit("webrtc:start-share", { title: "Screen Share" });
      }

      const peers = members.filter(m => m.online && m.id !== selfId);
      for (const peer of peers) {
        initiatePeerConnection(peer.id, mediaStream);
      }
    } catch (err) {
      if (err.name === "NotAllowedError") {
        return;
      }
      onNotice?.(`Screen share notice: ${err.message || "Failed to start sharing"}`);
    }
  }, [canPublish, members, onNotice, selfId, socket, stopSharing, initiatePeerConnection]);

  // Handle room error (e.g., second sharer rejected with already-sharing)
  useEffect(() => {
    if (!socket) return;
    const handleError = error => {
      if (error?.code === "already-sharing") {
        stopSharing(false);
        onNotice?.(error.message || "Another member is already sharing their screen.");
      }
    };
    socket.on("room:error", handleError);
    return () => socket.off("room:error", handleError);
  }, [socket, stopSharing, onNotice]);

  // Subscribe to socket sharing status / room events to update screenShareStateRef immediately
  useEffect(() => {
    if (!socket) return;

    const requestOffer = shareState => {
      if (
        !shareState?.sharerMemberId ||
        shareState.sharerMemberId === selfId ||
        localStreamRef.current ||
        streamRef.current
      ) {
        return;
      }

      const key = `${shareState.sharerMemberId}:${shareState.sharerSocketId || ""}`;
      const now = Date.now();

      if (requestedRef.current.key && requestedRef.current.key !== key) {
        resetRequestState();
      }

      if (requestedRef.current.key === key && now - requestedRef.current.at < 8000) {
        return;
      }

      requestedRef.current = { key, at: now };
      socket.emit("webrtc:request-offer", { toMemberId: shareState.sharerMemberId });

      clearRetryTimer();
      const scheduleRetry = () => {
        retryTimerRef.current = setTimeout(() => {
          if (!streamRef.current && requestedRef.current.key === key && retriesRef.current < 2) {
            retriesRef.current += 1;
            requestedRef.current = { key, at: Date.now() };
            socket.emit("webrtc:request-offer", { toMemberId: shareState.sharerMemberId });
            scheduleRetry();
          }
        }, 8000);
      };
      scheduleRetry();
    };

    const handleSharingStatus = status => {
      screenShareStateRef.current = status;
      if (!status) {
        resetRequestState();
        if (!localStreamRef.current) {
          setStream(null);
          streamRef.current = null;
          cleanupPeers();
        }
      } else {
        requestOffer(status);
      }
    };

    const handleRoomState = state => {
      if (state && "screenShare" in state) {
        screenShareStateRef.current = state.screenShare;
        if (!state.screenShare) {
          resetRequestState();
          if (!localStreamRef.current) {
            setStream(null);
            streamRef.current = null;
            cleanupPeers();
          }
        } else {
          requestOffer(state.screenShare);
        }
      }
    };

    const handleRoomJoined = payload => {
      const shareState = payload?.state?.screenShare;
      if (payload?.state && "screenShare" in payload.state) {
        screenShareStateRef.current = shareState;
        if (!shareState) {
          resetRequestState();
        } else {
          requestOffer(shareState);
        }
      }
    };

    socket.on("webrtc:sharing-status", handleSharingStatus);
    socket.on("room:state", handleRoomState);
    socket.on("room:joined", handleRoomJoined);

    return () => {
      socket.off("webrtc:sharing-status", handleSharingStatus);
      socket.off("room:state", handleRoomState);
      socket.off("room:joined", handleRoomJoined);
    };
  }, [socket, selfId, cleanupPeers, resetRequestState, clearRetryTimer]);

  // Sharer responds to request-offer by creating an offer to the requester
  useEffect(() => {
    if (!socket) return;
    const handleRequestOffer = ({ fromMemberId } = {}) => {
      if (!fromMemberId || fromMemberId === selfId) return;
      if (!isSharer || !localStreamRef.current) return;

      const existing = peerConnections.current.get(fromMemberId);
      if (existing) {
        const state = existing.connectionState;
        const activeStates = new Set(["new", "connecting", "connected"]);
        const createdAt = pcCreatedAt.current.get(fromMemberId) || 0;
        if (activeStates.has(state) && Date.now() - createdAt < 8000) {
          return;
        }
        try { existing.close(); } catch {}
        peerConnections.current.delete(fromMemberId);
        pcCreatedAt.current.delete(fromMemberId);
      }
      initiatePeerConnection(fromMemberId, localStreamRef.current);
    };
    socket.on("webrtc:request-offer", handleRequestOffer);
    return () => socket.off("webrtc:request-offer", handleRequestOffer);
  }, [socket, isSharer, selfId, initiatePeerConnection]);

  // Handle incoming WebRTC signals
  useEffect(() => {
    if (!socket) return;

    const handleSignal = async ({ fromMemberId, signal }) => {
      if (!signal) return;

      if (signal.type === "offer") {
        if (screenShareStateRef.current?.sharerMemberId && fromMemberId !== screenShareStateRef.current.sharerMemberId) {
          return;
        }
        try {
          const existing = peerConnections.current.get(fromMemberId);
          if (existing) {
            try { existing.close(); } catch {}
            peerConnections.current.delete(fromMemberId);
          }

          const pc = new RTCPeerConnection({ iceServers: getIceServers() });
          peerConnections.current.set(fromMemberId, pc);

          let disconnectTimer = null;
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "disconnected") {
              disconnectTimer = setTimeout(() => {
                if (pc.connectionState === "disconnected") {
                  try { pc.close(); } catch {}
                  peerConnections.current.delete(fromMemberId);
                }
              }, 5000);
            } else if (pc.connectionState === "connected") {
              if (disconnectTimer) {
                clearTimeout(disconnectTimer);
                disconnectTimer = null;
              }
            } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
              if (disconnectTimer) {
                clearTimeout(disconnectTimer);
                disconnectTimer = null;
              }
              peerConnections.current.delete(fromMemberId);
            }
          };

          pc.ontrack = event => {
            if (event.receiver && (!event.track || event.track.kind === "video")) {
              try {
                event.receiver.jitterBufferTarget = 50;
              } catch {}
            }
            if (event.streams && event.streams[0]) {
              setStream(event.streams[0]);
              streamRef.current = event.streams[0];
              resetRequestState();
            } else if (event.track) {
              const newStream = new MediaStream([event.track]);
              setStream(newStream);
              streamRef.current = newStream;
              resetRequestState();
            }
          };

          pc.onicecandidate = event => {
            if (event.candidate && socket?.connected) {
              socket.emit("webrtc:signal", {
                toMemberId: fromMemberId,
                signal: { type: "candidate", candidate: event.candidate },
              });
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
          try {
            pc.getReceivers?.().forEach(receiver => {
              if (receiver.track?.kind === "video") {
                receiver.jitterBufferTarget = 50;
              }
            });
          } catch {}

          const queued = pendingCandidates.current.get(fromMemberId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
          pendingCandidates.current.delete(fromMemberId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (socket?.connected) {
            socket.emit("webrtc:signal", {
              toMemberId: fromMemberId,
              signal: { type: "answer", answer },
            });
          }
        } catch (err) {
          console.warn("Error handling WebRTC offer from peer", fromMemberId, err);
        }
      } else if (signal.type === "answer") {
        const pc = peerConnections.current.get(fromMemberId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
            const queued = pendingCandidates.current.get(fromMemberId) || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            pendingCandidates.current.delete(fromMemberId);
          } catch (err) {
            console.warn("Error setting remote description for answer", err);
          }
        }
      } else if (signal.type === "candidate") {
        const pc = peerConnections.current.get(fromMemberId);
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            console.warn("Error adding ICE candidate", err);
          }
        } else {
          const list = pendingCandidates.current.get(fromMemberId) || [];
          list.push(signal.candidate);
          pendingCandidates.current.set(fromMemberId, list);
        }
      }
    };

    socket.on("webrtc:signal", handleSignal);
    return () => {
      socket.off("webrtc:signal", handleSignal);
    };
  }, [socket]);

  // When room screenShare state turns off
  useEffect(() => {
    if (!screenShareState) {
      resetRequestState();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => {
          try {
            t.stop();
          } catch (err) {
            console.warn("Track stop error", err);
          }
        });
        localStreamRef.current = null;
      }
      setStream(null);
      setSharing(false);
      cleanupPeers();
    }
  }, [screenShareState, cleanupPeers, resetRequestState]);

  // If sharing and a new member arrives or reconnects, manage their peer connection
  useEffect(() => {
    if (!isSharer || !localStreamRef.current) return;
    const mediaStream = localStreamRef.current;
    const prevMembers = prevMembersRef.current;
    const currentMap = new Map();

    for (const member of members) {
      if (member.id === selfId) continue;
      currentMap.set(member.id, member);
      const prev = prevMembers.get(member.id);

      if (!member.online) {
        const pc = peerConnections.current.get(member.id);
        if (pc) {
          try { pc.close(); } catch {}
          peerConnections.current.delete(member.id);
        }
      } else {
        const wasOffline = prev && !prev.online;
        const noPc = !peerConnections.current.has(member.id);

        if (wasOffline || noPc) {
          const pc = peerConnections.current.get(member.id);
          if (pc) {
            try { pc.close(); } catch {}
            peerConnections.current.delete(member.id);
          }
          initiatePeerConnection(member.id, mediaStream);
        }
      }
    }

    for (const [prevId] of prevMembers) {
      if (!currentMap.has(prevId)) {
        const pc = peerConnections.current.get(prevId);
        if (pc) {
          try { pc.close(); } catch {}
          peerConnections.current.delete(prevId);
        }
      }
    }

    prevMembersRef.current = currentMap;
  }, [isSharer, members, selfId, initiatePeerConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearRetryTimer();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => {
          try {
            t.stop();
          } catch (err) {
            console.warn("Track stop error", err);
          }
        });
      }
      cleanupPeers();
    };
  }, [cleanupPeers, clearRetryTimer]);

  return {
    stream,
    isSharing: isSharer || sharing,
    activeShare: screenShareState,
    startSharing,
    stopSharing,
  };
}
