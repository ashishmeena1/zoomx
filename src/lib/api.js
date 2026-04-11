const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

const TOKEN_KEY = "ms_token";

/** Read JWT from sessionStorage — set on login, used on every request. */
function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name    = "ApiError";
    this.status  = status;
    this.details = details ?? {};
  }
}

async function request(path, options = {}) {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Always send Authorization header when token is available.
  // This works on ALL browsers, cross-origin, no cookie issues.
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include", // still send cookie as fallback
    headers,
  });

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) {
    throw new ApiError(data.error ?? `HTTP ${res.status}`, res.status, data.details);
  }

  return data;
}

export const api = {
  get:    (path)       => request(path),
  post:   (path, body) => request(path, { method: "POST",   body: JSON.stringify(body) }),
  delete: (path)       => request(path, { method: "DELETE" }),
};

export default api;
