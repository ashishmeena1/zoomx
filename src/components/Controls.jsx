import React from "react";

function Btn({ onClick, active, danger, emoji, label, disabled }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={label}
            style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                background: danger ? "var(--danger)" : active ? "#1e1e35" : "var(--surface)",
                border: `1px solid ${danger ? "var(--danger)" : "var(--border)"}`,
                color: danger ? "#fff" : "var(--text)",
                padding: "12px 20px", borderRadius: 12, fontSize: 20, minWidth: 72,
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "all 0.15s",
            }}
        >
            <span>{emoji}</span>
            <span style={{ fontSize: 11, color: danger ? "rgba(255,255,255,0.8)" : "var(--muted)", fontWeight: 500 }}>
                {label}
            </span>
        </button>
    );
}

export default function Controls({ muted, videoOff, screensharing, onToggleMute, onToggleVideo, onToggleScreensharing, onLeave }) {
    return (
        <div style={{
            padding: "16px 24px", display: "flex", justifyContent: "center",
            gap: 10, borderTop: "1px solid var(--border)",
            background: "var(--surface)", flexShrink: 0,
        }}>
            <Btn onClick={onToggleMute}            label={muted         ? "Unmute"       : "Mute"}        emoji={muted         ? "🔇" : "🎙️"} active={muted} />
            <Btn onClick={onToggleVideo}           label={videoOff      ? "Start Camera" : "Stop Camera"}  emoji={videoOff      ? "📵" : "🎥"} active={videoOff} />
            <Btn onClick={onToggleScreensharing}   label={screensharing ? "Stop Share"  : "Share Screen"} emoji={screensharing ? "🖥️" : "📺"} active={screensharing} />
            <Btn onClick={onLeave}                 label="Leave"        emoji="📞" danger />
        </div>
    );
}
