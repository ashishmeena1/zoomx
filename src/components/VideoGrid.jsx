import React, { useRef, useEffect } from "react";

function VideoTile({ stream, name, avatar, muted = false, videoOff = false, isLocal = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div style={{
      position: "relative",
      background: "#0d0d18",
      borderRadius: 12,
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid var(--border)",
      minHeight: 180,
      aspectRatio: "16/9",
    }}>
      {stream && !videoOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          {avatar ? (
            <img src={avatar} alt={name} style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "var(--accent)", display: "grid",
              placeItems: "center", fontSize: 24, fontWeight: 600, color: "#fff"
            }}>
              {name?.[0]?.toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{name}</span>
        </div>
      )}

      {/* Name badge */}
      <div style={{
        position: "absolute", bottom: 8, left: 8,
        display: "flex", alignItems: "center", gap: 5,
        background: "rgba(0,0,0,0.65)", borderRadius: 6, padding: "3px 10px",
        backdropFilter: "blur(4px)"
      }}>
        {muted && <span style={{ fontSize: 10 }}>🔇</span>}
        {videoOff && <span style={{ fontSize: 10 }}>📵</span>}
        <span style={{ fontSize: 12, color: "#fff", fontWeight: 500 }}>
          {isLocal ? `${name} (You)` : name}
        </span>
      </div>
    </div>
  );
}

export default function VideoGrid({ localStream, peers, user, muted, videoOff }) {
  const peerList = Object.entries(peers);
  const total = peerList.length + 1;
  const cols = total === 1 ? 1 : total <= 4 ? 2 : 3;

  return (
    <div style={{
      flex: 1,
      padding: 16,
      display: "grid",
      gap: 12,
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      alignContent: "center",
      overflow: "auto",
    }}>
      <VideoTile
        stream={localStream}
        name={user?.name}
        avatar={user?.avatar}
        muted={muted}
        videoOff={videoOff}
        isLocal
      />
      {peerList.map(([socketId, peer]) => (
        <VideoTile
          key={socketId}
          stream={peer.stream}
          name={peer.name}
          avatar={peer.avatar}
          muted={peer.muted}
          videoOff={peer.videoOff}
        />
      ))}
    </div>
  );
}
