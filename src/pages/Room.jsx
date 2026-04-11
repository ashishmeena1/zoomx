import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { useMedia } from "../hooks/useMedia.js";
import api, { ApiError } from "../lib/api.js";
import VideoGrid from "../components/VideoGrid.jsx";
import Controls from "../components/Controls.jsx";

const Spinner = ({ fullscreen = false }) => (
    <div style={{
        display: "grid", placeItems: "center",
        height: fullscreen ? "100svh" : 80,
    }}>
        <div className="spinner" />
    </div>
);

// ICE servers configuration for RTCPeerConnection
const ICE_SERVERS = {
    iceServers: [
        // STUN (always keep)
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },

        {
            urls: "stun:stun.relay.metered.ca:80",
        },
        {
            urls: "turn:global.relay.metered.ca:80",
            username: "3a7f1bda7ecd86ca77bfe990",
            credential: "XQ24Ivfsb2mB/g/1",
        },
        {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: "3a7f1bda7ecd86ca77bfe990",
            credential: "XQ24Ivfsb2mB/g/1",
        },
        {
            urls: "turn:global.relay.metered.ca:443",
            username: "3a7f1bda7ecd86ca77bfe990",
            credential: "XQ24Ivfsb2mB/g/1",
        },
        {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: "3a7f1bda7ecd86ca77bfe990",
            credential: "XQ24Ivfsb2mB/g/1",
        },
    ]
};


export default function Room() {
    const { code } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();

    // ── UI state ────────────────────────────────────────────────────────────────
    const [room, setRoom] = useState(null);
    /** @type {[Record<string, PeerState>, React.Dispatch<any>]} */
    const [peers, setPeers] = useState({});
    const [status, setStatus] = useState("loading"); // "loading" | "ready" | "error"
    const [errorMsg, setErrorMsg] = useState("");
    const [copied, setCopied] = useState(false);

    // ── Refs ────────────────────────────────────────────────────────────────────
    /** @type {React.MutableRefObject<Record<string, RTCPeerConnection>>} */
    const pcsRef = useRef({});
    /** @type {React.MutableRefObject<Record<string, RTCRtpSender>>} */
    const videoSendersRef = useRef({});
    const screenStreamRef = useRef(null);

    // ── Media (camera + mic) ────────────────────────────────────────────────────
    const {
        stream, streamRef,
        muted, videoOff,
        mediaError,
        startMedia, stopMedia,
        toggleMute, toggleVideo,
    } = useMedia();

    // Screen-share state lives here (not in useMedia) because it involves
    // replacing tracks on all peer connections
    const [screensharing, setScreensharing] = useState(false);
    // localDisplay is what we pass to the local VideoTile —
    // either the camera stream or the screen stream
    const [localDisplay, setLocalDisplay] = useState(null);

    // ── Socket ──────────────────────────────────────────────────────────────────
    // Only connect once media is acquired and room is validated.
    // FIX: destructure `connected` from useSocket — it flips to true only
    // after the socket handshake completes. We pass it as a dependency to the
    // WebRTC listener effect below so that effect re-runs once the socket is
    // actually live (previously socketRef.current was still null when the
    // effect first ran, so socket.on(...) was never called).
    const socketReady = status === "ready";
    const { socketRef, connected: socketConnected } = useSocket(socketReady, {
        onConnect: () => socketRef.current?.emit("join-room", code),
        onDisconnect: (reason) => {
            if (reason === "io server disconnect") {
                setErrorMsg("Disconnected by server.");
            }
        },
        onError: (err) => setErrorMsg("Connection error: " + err.message),
    });

    // ── Init: validate room + acquire media ─────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                const roomData = await api.get(`/api/rooms/${code}`);
                if (cancelled) return;
                setRoom(roomData);

                const s = await startMedia();
                if (cancelled) return;

                if (!s) {
                    setErrorMsg(mediaError ?? "Could not access camera/microphone.");
                    setStatus("error");
                    return;
                }

                setLocalDisplay(s);
                setStatus("ready");
            } catch (err) {
                if (cancelled) return;
                if (err instanceof ApiError && err.status === 404) {
                    setErrorMsg("This room does not exist or has been closed.");
                } else {
                    setErrorMsg("Failed to join: " + err.message);
                }
                setStatus("error");
            }
        }

        init();
        return () => {
            cancelled = true;
            Object.values(pcsRef.current).forEach((pc) => pc.close());
            stopMedia();
            screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        };
    }, [code]);

    // ── WebRTC helpers ──────────────────────────────────────────────────────────

    /** Create a PeerConnection for a given remote socket, add local tracks. */
    const createPc = useCallback((socketId) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);

        // Add camera + audio tracks; track the video sender for later replacement
        streamRef.current?.getTracks().forEach((track) => {
            const sender = pc.addTrack(track, streamRef.current);
            if (track.kind === "video") videoSendersRef.current[socketId] = sender;
        });

        // Remote track → update peer stream in state
        pc.ontrack = (e) => {
            setPeers((prev) => ({
                ...prev,
                [socketId]: { ...prev[socketId], stream: e.streams[0] },
            }));
        };

        // ICE candidate → relay via socket
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socketRef.current?.emit("ice-candidate", { to: socketId, candidate: e.candidate });
            }
        };

        pcsRef.current[socketId] = pc;
        return pc;
    }, [streamRef, socketRef]);

    /** Close and clean up a peer connection. */
    const closePc = useCallback((socketId) => {
        pcsRef.current[socketId]?.close();
        delete pcsRef.current[socketId];
        delete videoSendersRef.current[socketId];
        setPeers((prev) => { const n = { ...prev }; delete n[socketId]; return n; });
    }, []);

    /** Replace the video track on all existing RTCRtpSenders. */
    const replaceVideoOnAllPeers = useCallback(async (newTrack) => {
        const fallback = streamRef.current?.getVideoTracks()[0] ?? null;
        const track = newTrack ?? fallback;
        await Promise.all(
            Object.entries(videoSendersRef.current).map(async ([sid, sender]) => {
                try { await sender.replaceTrack(track); }
                catch (e) { console.warn("replaceTrack failed for", sid, e); }
            })
        );
    }, [streamRef]);

    // ── Socket event listeners ──────────────────────────────────────────────────
    // FIX: `socketConnected` (not just `status`) is used as a dependency so
    // this effect re-runs once the socket handshake is complete. Before this
    // fix, the effect ran with socketRef.current === null and all .on() calls
    // were no-ops, so offers/answers/ICE were never exchanged.
    useEffect(() => {
        const socket = socketRef.current;
        if (!socket || !socketConnected || status !== "ready") return;

        /**
         * Helper: build initial peer state from the server payload.
         * Backend now sends muted/videoOff/screensharing with peer-joined
         * and existing-peers, so we initialise correctly from the start.
         *
         * @param {object} p  peer payload from server
         * @returns {PeerState}
         */
        function peerFromPayload(p) {
            return {
                stream: null,
                name: p.name,
                avatar: p.avatar ?? null,
                muted: Boolean(p.muted),
                videoOff: Boolean(p.videoOff),
                screensharing: Boolean(p.screensharing),
            };
        }

        async function onExistingPeers(existingPeers) {
            for (const peer of existingPeers) {
                // Seed state with initial media flags from server
                setPeers((prev) => ({
                    ...prev,
                    [peer.socketId]: peerFromPayload(peer),
                }));
                const pc = createPc(peer.socketId);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit("offer", { to: peer.socketId, offer });
            }
        }

        function onPeerJoined(peer) {
            // peer now includes muted/videoOff/screensharing from backend
            setPeers((prev) => ({
                ...prev,
                [peer.socketId]: peerFromPayload(peer),
            }));
        }

        async function onOffer({ from, offer }) {
            const pc = createPc(from);
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("answer", { to: from, answer });
        }

        async function onAnswer({ from, answer }) {
            const pc = pcsRef.current[from];
            if (pc?.signalingState !== "closed") {
                try { await pc?.setRemoteDescription(new RTCSessionDescription(answer)); } catch { }
            }
        }

        async function onIceCandidate({ from, candidate }) {
            const pc = pcsRef.current[from];
            if (pc?.remoteDescription && pc?.signalingState !== "closed") {
                try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { }
            }
        }

        // ── peer-media-state ──────────────────────────────────────────────────────
        // Backend sends: { socketId, muted, videoOff, screensharing }
        // (renamed from old "screenOff" → "screensharing")
        function onPeerMediaState({ socketId, muted, videoOff, screensharing }) {
            setPeers((prev) => ({
                ...prev,
                [socketId]: {
                    ...prev[socketId],
                    muted,
                    videoOff,
                    screensharing,
                },
            }));
        }

        function onPeerLeft({ socketId }) {
            closePc(socketId);
        }

        socket.on("existing-peers", onExistingPeers);
        socket.on("peer-joined", onPeerJoined);
        socket.on("offer", onOffer);
        socket.on("answer", onAnswer);
        socket.on("ice-candidate", onIceCandidate);
        socket.on("peer-media-state", onPeerMediaState);
        socket.on("peer-left", onPeerLeft);

        return () => {
            socket.off("existing-peers", onExistingPeers);
            socket.off("peer-joined", onPeerJoined);
            socket.off("offer", onOffer);
            socket.off("answer", onAnswer);
            socket.off("ice-candidate", onIceCandidate);
            socket.off("peer-media-state", onPeerMediaState);
            socket.off("peer-left", onPeerLeft);
        };
    }, [status, socketConnected, createPc, closePc, socketRef]);

    // ── Media toggles ───────────────────────────────────────────────────────────

    const handleToggleMute = useCallback(() => {
        toggleMute();
        socketRef.current?.emit("media-state", {
            muted: !muted,
            videoOff,
            screensharing,
        });
    }, [toggleMute, muted, videoOff, screensharing, socketRef]);

    const handleToggleVideo = useCallback(() => {
        toggleVideo();
        socketRef.current?.emit("media-state", {
            muted,
            videoOff: !videoOff,
            screensharing,
        });
    }, [toggleVideo, muted, videoOff, screensharing, socketRef]);

    // ── Screen share ─────────────────────────────────────────────────────────────

    const stopScreenshare = useCallback(async () => {
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        await replaceVideoOnAllPeers(null);   // restore camera
        setLocalDisplay(streamRef.current);
        setScreensharing(false);
        socketRef.current?.emit("media-state", { muted, videoOff, screensharing: false });
    }, [muted, videoOff, replaceVideoOnAllPeers, streamRef, socketRef]);

    const handleToggleScreenshare = useCallback(async () => {
        if (screensharing) {
            await stopScreenshare();
            return;
        }

        let screenStream;
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: false,
            });
        } catch {
            return; // user cancelled or permission denied
        }

        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        // Hot-swap track on all existing peer connections (no renegotiation needed)
        await replaceVideoOnAllPeers(screenTrack);

        // Update local preview to show screen
        const displayStream = new MediaStream([
            ...streamRef.current.getAudioTracks(),
            screenTrack,
        ]);
        setLocalDisplay(displayStream);
        setScreensharing(true);
        socketRef.current?.emit("media-state", { muted, videoOff, screensharing: true });

        // Handle user clicking browser "Stop sharing" button
        screenTrack.addEventListener("ended", stopScreenshare);
    }, [screensharing, muted, videoOff, replaceVideoOnAllPeers, streamRef, socketRef, stopScreenshare]);

    // ── Leave ────────────────────────────────────────────────────────────────────

    const leaveRoom = useCallback(async () => {
        const isAdmin = room?.admin?.id === user?.id;
        if (isAdmin && window.confirm("You're the admin. End meeting for everyone?")) {
            try { await api.delete(`/api/rooms/${code}`); } catch { }
        }
        navigate("/");
    }, [room, user, code, navigate]);

    const copyLink = useCallback(() => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, []);

    // ── Render ───────────────────────────────────────────────────────────────────

    if (status === "loading") return <Spinner fullscreen />;

    if (status === "error") {
        return (
            <div style={{
                display: "grid", placeItems: "center",
                height: "100svh", background: "var(--bg)", textAlign: "center", padding: 24,
            }}>
                <div>
                    <p style={{ fontSize: 36, marginBottom: 12 }}>⚠️</p>
                    <p style={{ color: "var(--danger)", marginBottom: 20, maxWidth: 360 }}>{errorMsg}</p>
                    <button
                        onClick={() => navigate("/")}
                        style={{ background: "var(--accent)", color: "#fff", padding: "10px 28px", borderRadius: 8, fontWeight: 500 }}
                    >
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    const participantCount = Object.keys(peers).length + 1;

    return (
        <div style={{ height: "100svh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>

            {/* ── Top bar ──────────────────────────────────────────────────────────── */}
            <header style={{
                padding: "12px 20px", display: "flex", alignItems: "center",
                justifyContent: "space-between", borderBottom: "1px solid var(--border)",
                flexShrink: 0, background: "var(--surface)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 18 }}>⬡</span>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{room?.name ?? "Meeting"}</span>
                    <span style={{
                        fontSize: 12, color: "var(--success)", background: "rgba(34,197,94,0.12)",
                        padding: "2px 9px", borderRadius: 20, fontWeight: 500,
                    }}>
                        ● {participantCount} participant{participantCount !== 1 ? "s" : ""}
                    </span>
                    {screensharing && (
                        <span style={{
                            fontSize: 12, color: "var(--accent)", background: "rgba(99,102,241,0.12)",
                            padding: "2px 9px", borderRadius: 20, fontWeight: 500,
                        }}>
                            🖥️ Sharing screen
                        </span>
                    )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <code style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{code}</code>
                    <button
                        onClick={copyLink}
                        style={{
                            background: copied ? "rgba(99,102,241,0.12)" : "var(--bg)",
                            border: "1px solid var(--border)",
                            color: copied ? "var(--accent)" : "var(--text-2, #a0a0b8)",
                            padding: "6px 14px", borderRadius: 8, fontSize: 13, transition: "all 0.2s",
                        }}
                    >
                        {copied ? "✓ Copied!" : "Copy Link"}
                    </button>
                </div>
            </header>

            {/* ── Video grid ───────────────────────────────────────────────────────── */}
            <VideoGrid
                localStream={localDisplay}
                peers={peers}
                user={user}
                muted={muted}
                videoOff={videoOff && !screensharing}
                screensharing={screensharing}
            />

            {/* ── Controls ─────────────────────────────────────────────────────────── */}
            <Controls
                muted={muted}
                videoOff={videoOff}
                screensharing={screensharing}
                onToggleMute={handleToggleMute}
                onToggleVideo={handleToggleVideo}
                onToggleScreensharing={handleToggleScreenshare}
                onLeave={leaveRoom}
            />
        </div>
    );
}
