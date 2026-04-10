import React from "react";

function Btn({ onClick, active, danger, emoji, label }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        background: danger
          ? "var(--danger)"
          : active
          ? "#1e1e30"
          : "var(--surface)",
        border: `1px solid ${danger ? "var(--danger)" : active ? "var(--border)" : "var(--border)"}`,
        color: "var(--text)",
        padding: "12px 24px",
        borderRadius: 12,
        fontSize: 22,
        minWidth: 72,
        transition: "all 0.15s",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
    >
      <span>{emoji}</span>
      <span style={{ fontSize: 11, color: danger ? "#fff" : "var(--muted)", fontWeight: 500 }}>{label}</span>
    </button>
  );
}

export default function Controls({ muted, videoOff, onToggleMute, onToggleVideo, onLeave }) {
  return (
    <div style={{
      padding: "16px 24px",
      display: "flex",
      justifyContent: "center",
      gap: 12,
      borderTop: "1px solid var(--border)",
      flexShrink: 0,
      background: "var(--surface)",
    }}>
      <Btn
        onClick={onToggleMute}
        active={muted}
        emoji={muted ? "🔇" : "🎙️"}
        label={muted ? "Unmute" : "Mute"}
      />
      <Btn
        onClick={onToggleVideo}
        active={videoOff}
        emoji={videoOff ? "📵" : "🎥"}
        label={videoOff ? "Start Video" : "Stop Video"}
      />
      <Btn
        onClick={onLeave}
        danger
        emoji="📞"
        label="Leave"
      />
    </div>
  );
}
