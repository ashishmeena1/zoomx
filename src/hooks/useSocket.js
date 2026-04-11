import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { getStoredToken } from "../context/AuthContext.jsx";

const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

/**
 * Creates and manages a Socket.io connection.
 *
 * FIX: transports was ["websocket"] only.
 * Render (and most reverse proxies) require an HTTP polling handshake first
 * before upgrading to WebSocket. With websocket-only, the connection silently
 * fails on Render free tier — no error, just never connects.
 * Using ["polling", "websocket"] lets Socket.io negotiate the upgrade properly.
 *
 * @param {boolean} enabled
 * @param {{ onConnect?, onDisconnect?, onError? }} [callbacks]
 * @returns {{ socketRef, connected: boolean }}
 */
export function useSocket(enabled, { onConnect, onDisconnect, onError } = {}) {
  const socketRef   = useRef(null);
  const callbackRef = useRef({ onConnect, onDisconnect, onError });
  const [connected, setConnected] = useState(false);

  // Keep callbacks fresh without re-running the effect
  callbackRef.current = { onConnect, onDisconnect, onError };

  useEffect(() => {
    if (!enabled) return;

    const token = getStoredToken();

    const socket = io(BASE_URL, {
      auth: { token },
      // FIX: start with polling so the HTTP handshake succeeds behind proxies,
      // then Socket.io upgrades to WebSocket automatically.
      transports: ["polling", "websocket"],
      reconnection:         true,
      reconnectionAttempts: 5,
      reconnectionDelay:    1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      callbackRef.current.onConnect?.();
    });
    socket.on("disconnect", (r) => {
      setConnected(false);
      callbackRef.current.onDisconnect?.(r);
    });
    socket.on("connect_error", (e) => {
      callbackRef.current.onError?.(e);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [enabled]);

  return { socketRef, connected };
}
