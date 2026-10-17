import { useCallback, useEffect, useRef, useState } from "react";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export function useWebRTCScreenShare({
  socket,
  selfId,
  members = [],
  screenShareState = null,
  canPublish = false,
  onNotice,
}) {
  const [stream, setStream] = useState(null);
  const [sharing, setSharing] = useState(false);
  const peerConnections = useRef(new Map());
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef(new Map());

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
  }, []);

  const stopSharing = useCallback(() => {
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
    setSharing(false);
    cleanupPeers();
    if (socket?.connected) {
      socket.emit("webrtc:stop-share");
    }
  }, [socket, cleanupPeers]);

  const initiatePeerConnection = useCallback(
    async (memberId, mediaStream) => {
      if (!socket?.connected) return;
      try {
        const existing = peerConnections.current.get(memberId);
        if (existing) {
          try { existing.close(); } catch {}
          peerConnections.current.delete(memberId);
        }

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnections.current.set(memberId, pc);

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            peerConnections.current.delete(memberId);
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
    [socket]
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
        video: { cursor: "always" },
        audio: true,
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

  // Handle incoming WebRTC signals
  useEffect(() => {
    if (!socket) return;

    const handleSignal = async ({ fromMemberId, signal }) => {
      if (!signal) return;

      if (signal.type === "offer") {
        try {
          const existing = peerConnections.current.get(fromMemberId);
          if (existing) {
            try { existing.close(); } catch {}
            peerConnections.current.delete(fromMemberId);
          }

          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          peerConnections.current.set(fromMemberId, pc);

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed" || pc.connectionState === "closed") {
              peerConnections.current.delete(fromMemberId);
            }
          };

          pc.ontrack = event => {
            if (event.streams && event.streams[0]) {
              setStream(event.streams[0]);
            } else if (event.track) {
              setStream(new MediaStream([event.track]));
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
  }, [screenShareState, cleanupPeers]);

  // If sharing and a new member arrives, send an offer to them
  useEffect(() => {
    if (!isSharer || !localStreamRef.current) return;
    const mediaStream = localStreamRef.current;
    const onlineOthers = members.filter(m => m.online && m.id !== selfId);
    for (const member of onlineOthers) {
      if (!peerConnections.current.has(member.id)) {
        initiatePeerConnection(member.id, mediaStream);
      }
    }
  }, [isSharer, members, selfId, initiatePeerConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
  }, [cleanupPeers]);

  return {
    stream,
    isSharing: isSharer || sharing,
    activeShare: screenShareState,
    startSharing,
    stopSharing,
  };
}
