import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext.jsx";
import VideoGrid from "../components/VideoGrid.jsx";
import Controls from "../components/Controls.jsx";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function Room() {
  const { code } = useParams();
  const { user, API } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [peers, setPeers] = useState({});
  const [localStream, setLocalStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const peerConnections = useRef({});
  const localStreamRef = useRef(null);

  const getToken = () => document.cookie.match(/token=([^;]+)/)?.[1];

  const createPeerConnection = useCallback((socketId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) =>
        pc.addTrack(track, localStreamRef.current)
      );
    }

    pc.ontrack = (event) => {
      setPeers((prev) => ({
        ...prev,
        [socketId]: { ...prev[socketId], stream: event.streams[0] },
      }));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("ice-candidate", { to: socketId, candidate: event.candidate });
      }
    };

    peerConnections.current[socketId] = pc;
    return pc;
  }, []);

  useEffect(() => {
    let socket;

    const init = async () => {
      try {
        // Validate room
        const res = await fetch(`${API}/api/rooms/${code}`, { credentials: "include" });
        if (!res.ok) { alert("Room not found or closed."); navigate("/"); return; }
        const roomData = await res.json();
        setRoom(roomData);

        // Get media
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        setLocalStream(stream);

        // Connect socket
        socket = io(API, {
          auth: { token: getToken() },
          transports: ["websocket"],
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          socket.emit("join-room", code);
        });

        socket.on("connect_error", (err) => {
          setError("Could not connect to server: " + err.message);
        });

        // Existing peers — send offer to each
        socket.on("existing-peers", async (existingPeers) => {
          for (const peer of existingPeers) {
            setPeers((prev) => ({
              ...prev,
              [peer.socketId]: { name: peer.name, avatar: peer.avatar, stream: null },
            }));
            const pc = createPeerConnection(peer.socketId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("offer", { to: peer.socketId, offer });
          }
        });

        // New peer joined
        socket.on("peer-joined", ({ socketId, name, avatar }) => {
          setPeers((prev) => ({ ...prev, [socketId]: { name, avatar, stream: null } }));
        });

        // Receive offer → send answer
        socket.on("offer", async ({ from, offer }) => {
          const pc = createPeerConnection(from);
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { to: from, answer });
        });

        // Receive answer
        socket.on("answer", async ({ from, answer }) => {
          const pc = peerConnections.current[from];
          if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
        });

        // ICE candidate
        socket.on("ice-candidate", async ({ from, candidate }) => {
          const pc = peerConnections.current[from];
          if (pc) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
          }
        });

        // Peer media state change
        socket.on("peer-media-state", ({ socketId, muted, videoOff }) => {
          setPeers((prev) => ({
            ...prev,
            [socketId]: { ...prev[socketId], muted, videoOff },
          }));
        });

        // Peer left
        socket.on("peer-left", ({ socketId }) => {
          if (peerConnections.current[socketId]) {
            peerConnections.current[socketId].close();
            delete peerConnections.current[socketId];
          }
          setPeers((prev) => {
            const n = { ...prev };
            delete n[socketId];
            return n;
          });
        });
      } catch (err) {
        console.error(err);
        setError("Failed to access camera/microphone. Please allow permissions.");
      }
    };

    init();

    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      socket?.disconnect();
    };
  }, [code]);

  const toggleMute = () => {
    const audio = localStreamRef.current?.getAudioTracks()[0];
    if (audio) {
      audio.enabled = !audio.enabled;
      const next = !muted;
      setMuted(next);
      socketRef.current?.emit("media-state", { muted: next, videoOff });
    }
  };

  const toggleVideo = () => {
    const video = localStreamRef.current?.getVideoTracks()[0];
    if (video) {
      video.enabled = !video.enabled;
      const next = !videoOff;
      setVideoOff(next);
      socketRef.current?.emit("media-state", { muted, videoOff: next });
    }
  };

  const leaveRoom = async () => {
    if (room?.admin?.id === user?.id) {
      const confirmed = window.confirm("You're the admin. End meeting for everyone?");
      if (confirmed) {
        await fetch(`${API}/api/rooms/${code}`, { method: "DELETE", credentials: "include" });
      }
    }
    navigate("/");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", textAlign: "center", gap: 16 }}>
        <div>
          <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>
          <button onClick={() => navigate("/")} style={{
            background: "var(--accent)", color: "#fff",
            padding: "10px 24px", borderRadius: 8, fontWeight: 500
          }}>Go Home</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Top bar */}
      <div style={{
        padding: "12px 24px", display: "flex", alignItems: "center",
        justifyContent: "space-between", borderBottom: "1px solid var(--border)",
        flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>⬡</span>
          <span style={{ fontWeight: 600 }}>{room?.name || "Meeting"}</span>
          <span style={{ fontSize: 12, color: "var(--success)", background: "rgba(34,197,94,0.1)", padding: "2px 8px", borderRadius: 20 }}>
            ● {Object.keys(peers).length + 1} participant{Object.keys(peers).length !== 0 ? "s" : ""}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)" }}>{code}</span>
          <button onClick={copyLink} style={{
            background: copied ? "rgba(99,102,241,0.15)" : "var(--surface)",
            border: "1px solid var(--border)", color: copied ? "var(--accent)" : "var(--text)",
            padding: "6px 14px", borderRadius: 8, fontSize: 13, transition: "all 0.2s"
          }}>
            {copied ? "✓ Copied!" : "Copy Link"}
          </button>
        </div>
      </div>

      {/* Video Grid */}
      <VideoGrid
        localStream={localStream}
        peers={peers}
        user={user}
        muted={muted}
        videoOff={videoOff}
      />

      {/* Controls */}
      <Controls
        muted={muted}
        videoOff={videoOff}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onLeave={leaveRoom}
      />
    </div>
  );
}
