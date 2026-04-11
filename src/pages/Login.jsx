import React, { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { ApiError } from "../lib/api.js";

export default function Login() {
  const { loginWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(false);

  if (user) { navigate("/", { replace: true }); return null; }

  async function handleSuccess({ credential }) {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle(credential);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Sign-in failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 32,
      background: "radial-gradient(ellipse at 50% 0%, #1a1a3e 0%, var(--bg) 70%)",
      padding: 24,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>⬡</div>
        <h1 style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.5px" }}>zoomx</h1>
        <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 15 }}>
          Simple, fast video meetings. No downloads.
        </p>
      </div>

      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "32px 40px", display: "flex",
        flexDirection: "column", alignItems: "center", gap: 20, minWidth: 320,
        maxWidth: 400, width: "100%",
      }}>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>Sign in to continue</p>

        {error && (
          <div style={{
            width: "100%", padding: "10px 14px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 8, fontSize: 13,
            color: "#fca5a5", textAlign: "center",
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Signing in…</p>
        ) : (
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => setError("Google sign-in failed. Check your browser settings and ensure pop-ups are allowed.")}
            theme="filled_black"
            shape="pill"
            size="large"
            text="continue_with"
          />
        )}
      </div>
    </div>
  );
}
