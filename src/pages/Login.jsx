import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { loginWithGoogle, user } = useAuth();
  const navigate = useNavigate();

  if (user) { navigate("/"); return null; }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 32,
      background: "radial-gradient(ellipse at 50% 0%, #1a1a3e 0%, var(--bg) 70%)"
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>⬡</div>
        <h1 style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.5px" }}>MeetSpace</h1>
        <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 15 }}>
          Simple, fast video meetings. No downloads.
        </p>
      </div>

      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "32px 40px", display: "flex",
        flexDirection: "column", alignItems: "center", gap: 20, minWidth: 320
      }}>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>Sign in to continue</p>
        <GoogleLogin
          onSuccess={async ({ credential }) => {
            await loginWithGoogle(credential);
            navigate("/");
          }}
          onError={() => alert("Login failed")}
          theme="filled_black"
          shape="pill"
          size="large"
          text="continue_with"
        />
      </div>
    </div>
  );
}
