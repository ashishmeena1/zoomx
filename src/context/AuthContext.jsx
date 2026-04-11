import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { ApiError } from "../lib/api.js";

const AuthContext = createContext(null);

export const TOKEN_KEY = "ms_token";

export function getStoredToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function saveToken(t)  { try { sessionStorage.setItem(TOKEN_KEY, t); }    catch {} }
function clearToken()  { try { sessionStorage.removeItem(TOKEN_KEY); }     catch {} }

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: restore user via /api/auth/me
  // api.js will automatically send the Bearer token from sessionStorage
  useEffect(() => {
    api.get("/api/auth/me")
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    // /api/auth/google does NOT require auth — no token needed yet
    const data = await api.post("/api/auth/google", { credential });
    // Save token BEFORE setting user so any subsequent calls have it
    if (data.token) saveToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout", {}).catch(() => {});
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
