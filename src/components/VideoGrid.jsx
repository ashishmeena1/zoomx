import React, { useRef, useEffect, memo } from "react";

const VideoTile = memo(function VideoTile({ stream, name, avatar, muted = false, videoOff = false, isLocal = false, screensharing = false, label }) {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current) videoRef.current.srcObject = stream ?? null;
    }, [stream]);

    const initials = name ? name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "?";
    const showVideo = stream && !videoOff;

    return (
        <div style={{
            position: "relative", background: "#0d0d18", borderRadius: 12,
            overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
            border: screensharing ? "2px solid var(--accent)" : "1px solid var(--border)",
            aspectRatio: screensharing ? "16/9" : "16/9",
        }}>
            <video
                ref={videoRef} autoPlay playsInline muted={isLocal}
                style={{
                    position: "absolute", inset: 0,
                    width: "100%", height: "100%",
                    objectFit: screensharing ? "contain" : "cover",
                    display: showVideo ? "block" : "none",
                    background: screensharing ? "#000" : "transparent",
                }}
            />

            {!showVideo && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, zIndex: 1 }}>
                    {avatar
                        ? <img src={avatar} alt={name} style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover" }} />
                        : <div style={{
                            width: 60, height: 60, borderRadius: "50%",
                            background: "var(--accent)", display: "grid", placeItems: "center",
                            fontSize: 20, fontWeight: 600, color: "#fff",
                          }}>
                            {initials}
                          </div>
                    }
                    <span style={{ fontSize: 13, color: "var(--text-2, #a0a0b8)" }}>{name}</span>
                </div>
            )}

            {/* Name badge */}
            <div style={{
                position: "absolute", bottom: 8, left: 8,
                display: "flex", alignItems: "center", gap: 4,
                background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
                borderRadius: 6, padding: "3px 10px",
            }}>
                {muted    && <span style={{ fontSize: 10 }}>🔇</span>}
                {videoOff && !screensharing && <span style={{ fontSize: 10 }}>📵</span>}
                {screensharing && <span style={{ fontSize: 10 }}>🖥️</span>}
                <span style={{ fontSize: 12, color: "#fff", fontWeight: 500 }}>
                    {label ?? (isLocal ? `${name} (You)` : name)}
                </span>
            </div>
        </div>
    );
});

export default function VideoGrid({ localStream, peers, user, muted, videoOff, screensharing }) {
    const peerList = Object.entries(peers);

    // When someone is screensharing, give their tile a larger slot
    const hasPeerScreenshare = peerList.some(([, p]) => p.screensharing);
    const anyScreenshare     = screensharing || hasPeerScreenshare;

    // Layout: if anyone is screensharing, use a big main area + sidebar strip
    // Otherwise fall back to a balanced grid
    const total = peerList.length + 1;
    const cols  = anyScreenshare ? 1 : (total === 1 ? 1 : total <= 4 ? 2 : 3);

    if (anyScreenshare) {
        // Find the screensharing tile
        const screenPeer = peerList.find(([, p]) => p.screensharing);
        const others     = peerList.filter(([, p]) => !p.screensharing);

        return (
            <div style={{ flex: 1, display: "flex", gap: 10, padding: 12, overflow: "hidden" }}>
                {/* Main screen tile */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {screensharing ? (
                        <VideoTile
                            stream={localStream} name={user?.name} avatar={user?.avatar}
                            muted={muted} videoOff={false} isLocal screensharing
                            label={`${user?.name} (You — sharing)`}
                            style={{ height: "100%" }}
                        />
                    ) : screenPeer ? (
                        <VideoTile
                            stream={screenPeer[1].stream} name={screenPeer[1].name}
                            avatar={screenPeer[1].avatar} muted={screenPeer[1].muted}
                            videoOff={false} screensharing
                            label={`${screenPeer[1].name} — sharing`}
                        />
                    ) : null}
                </div>

                {/* Sidebar: everyone else */}
                <div style={{
                    width: 180, display: "flex", flexDirection: "column",
                    gap: 8, overflowY: "auto", flexShrink: 0,
                }}>
                    {/* Local cam (small) when local is screensharing */}
                    {screensharing && (
                        <VideoTile
                            stream={localStream} name={user?.name} avatar={user?.avatar}
                            muted={muted} videoOff={videoOff} isLocal
                        />
                    )}
                    {/* Remote peers without screenshare */}
                    {(screensharing ? peerList : others).map(([socketId, peer]) => (
                        <VideoTile
                            key={socketId}
                            stream={peer.stream} name={peer.name} avatar={peer.avatar}
                            muted={peer.muted} videoOff={peer.videoOff}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // Normal grid layout
    return (
        <div style={{
            flex: 1, padding: 12, display: "grid", gap: 10,
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            alignContent: "center", overflow: "auto",
        }}>
            <VideoTile
                stream={localStream} name={user?.name} avatar={user?.avatar}
                muted={muted} videoOff={videoOff} isLocal
            />
            {peerList.map(([socketId, peer]) => (
                <VideoTile
                    key={socketId}
                    stream={peer.stream} name={peer.name} avatar={peer.avatar}
                    muted={peer.muted} videoOff={peer.videoOff}
                    screensharing={peer.screensharing}
                />
            ))}
        </div>
    );
}
