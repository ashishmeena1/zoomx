import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Dashboard() {
  const { user, logout, API } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchRooms = async () => {
    const res = await fetch(`${API}/api/rooms`, { credentials: "include" });
    const data = await res.json();
    setRooms(Array.isArray(data) ? data : []);
  };

  useEffect(() => { fetchRooms(); }, []);

  const createRoom = async () => {
    if (!roomName.trim()) return;
    setCreating(true);
    const res = await fetch(`${API}/api/rooms`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: roomName }),
    });
    const room = await res.json();
    setCreating(false);
    setRoomName("");
    navigate(`/room/${room.code}`);
  };

  const joinRoom = async () => {
    const code = joinCode.trim();
    if (!code) return;
    const res = await fetch(`${API}/api/rooms/${code}`, { credentials: "include" });
    if (!res.ok) return alert("Room not found or closed.");
    navigate(`/room/${code}`);
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>⬡</span>
          <span style={{ fontWeight: 600, fontSize: 18 }}>MeetSpace</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {user?.avatar && <img src={user.avatar} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />}
          <span style={{ fontSize: 14, color: "var(--muted)" }}>{user?.name}</span>
          <button onClick={logout} style={{
            background: "transparent", color: "var(--muted)", fontSize: 13,
            padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 8
          }}>Sign out</button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 48 }}>
        {/* Create */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>New Meeting</h2>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createRoom()}
            placeholder="Meeting name..."
            style={{
              width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "10px 14px", color: "var(--text)", fontSize: 14, marginBottom: 12
            }}
          />
          <button onClick={createRoom} disabled={creating || !roomName.trim()} style={{
            width: "100%", background: "var(--accent)", color: "#fff",
            padding: "10px 0", borderRadius: 8, fontWeight: 500, fontSize: 14,
            opacity: creating || !roomName.trim() ? 0.6 : 1
          }}>
            {creating ? "Creating..." : "Start Meeting"}
          </button>
        </div>

        {/* Join */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Join Meeting</h2>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            placeholder="Enter room code..."
            style={{
              width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "10px 14px", color: "var(--text)", fontSize: 14,
              marginBottom: 12, fontFamily: "var(--mono)"
            }}
          />
          <button onClick={joinRoom} disabled={!joinCode.trim()} style={{
            width: "100%", background: "transparent", color: "var(--text)",
            padding: "10px 0", borderRadius: 8, fontWeight: 500, fontSize: 14,
            border: "1px solid var(--border)", opacity: !joinCode.trim() ? 0.6 : 1
          }}>
            Join
          </button>
        </div>
      </div>

      {/* My Rooms */}
      {rooms.length > 0 && (
        <div>
          <h2 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            My Rooms
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rooms.map((room) => (
              <div key={room.id} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "14px 20px", display: "flex",
                alignItems: "center", justifyContent: "space-between"
              }}>
                <div>
                  <p style={{ fontWeight: 500, fontSize: 14 }}>{room.name}</p>
                  <p style={{ color: "var(--muted)", fontSize: 12, fontFamily: "var(--mono)", marginTop: 2 }}>
                    {room.code}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {room.active && (
                    <button onClick={() => navigate(`/room/${room.code}`)} style={{
                      background: "var(--accent)", color: "#fff",
                      padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500
                    }}>Rejoin</button>
                  )}
                  <span style={{ fontSize: 12, color: room.active ? "var(--success)" : "var(--muted)", padding: "6px 10px" }}>
                    {room.active ? "● Active" : "Closed"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
