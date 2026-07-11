import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "braids_token";

// ------------------- Token helpers -------------------
export async function getToken(): Promise<string | null> {
  const t = await storage.secureGet<string>(TOKEN_KEY, "");
  return t ? t : null;
}
export async function setToken(t: string) { return storage.secureSet(TOKEN_KEY, t); }
export async function clearToken() { return storage.secureRemove(TOKEN_KEY); }


// ------------------- Error class -------------------
/**
 * Controlled error thrown by the API helper. Frontend components should
 * inspect `.status` (HTTP code) and `.userMessage` (safe copy) — never render
 * the raw `.message`, which may contain server-side detail.
 */
export class ApiError extends Error {
  status: number;
  endpoint: string;
  serverMessage: string;
  userMessage: string;
  constructor(opts: { status: number; endpoint: string; serverMessage: string; userMessage: string }) {
    super(opts.serverMessage || opts.userMessage);
    this.name = "ApiError";
    this.status = opts.status;
    this.endpoint = opts.endpoint;
    this.serverMessage = opts.serverMessage;
    this.userMessage = opts.userMessage;
  }
}

function friendlyMessage(status: number, endpoint: string): string {
  if (status === 0) return "You're offline. Please check your connection and try again.";
  if (status === 401 || status === 403) return "Please sign in again to continue.";
  if (status === 402) return "This feature requires an upgrade to your plan.";
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) {
    if (endpoint.includes("/hairstyles")) return "We couldn't load braid styles. Please try again.";
    return "Something went wrong on our end. Please try again in a moment.";
  }
  return "Something went wrong. Please try again.";
}


// ------------------- Core fetch wrapper -------------------
/**
 * Safe API caller that:
 *   - Always inspects Content-Type before parsing JSON (never blindly parses)
 *   - Emits an `ApiError` with a status + user-safe message on failure
 *   - Never leaks server internals or stack traces
 */
export async function api(path: string, opts: RequestInit = {}) {
  const endpoint = path.startsWith("/") ? path : `/${path}`;
  const url = `${BASE}/api${endpoint}`;

  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Network / fetch-level failure (no HTTP response at all)
  let res: Response;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (e: any) {
    if (__DEV__) console.warn("[api] network error", url, e?.message);
    throw new ApiError({
      status: 0,
      endpoint,
      serverMessage: e?.message || "Network error",
      userMessage: friendlyMessage(0, endpoint),
    });
  }

  // 204 / empty body: nothing to parse
  if (res.status === 204) return null;

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const isJson = contentType.includes("application/json");

  // Read body once. Guard against extremely large / malformed payloads.
  let raw = "";
  try { raw = await res.text(); } catch { raw = ""; }

  let data: any = null;
  if (raw) {
    if (isJson) {
      try { data = JSON.parse(raw); }
      catch (e: any) {
        // JSON header said JSON but body is malformed — treat as server error
        if (__DEV__) console.warn("[api] malformed JSON from", url, raw.slice(0, 200));
        throw new ApiError({
          status: res.status || 500,
          endpoint,
          serverMessage: "Malformed JSON response",
          userMessage: friendlyMessage(500, endpoint),
        });
      }
    } else {
      // Server returned HTML/plain-text (e.g., "Internal Server Error")
      // Do NOT parse. Just capture a short snippet for dev logging.
      data = { rawText: raw.slice(0, 300) };
    }
  }

  if (!res.ok) {
    const serverMessage =
      (data && typeof data === "object" && (data.detail || data.message)) ||
      (data && data.rawText) ||
      `HTTP ${res.status}`;
    if (__DEV__) console.warn(`[api ${res.status}]`, endpoint, serverMessage);
    throw new ApiError({
      status: res.status,
      endpoint,
      serverMessage: String(serverMessage).slice(0, 400),
      userMessage: friendlyMessage(res.status, endpoint),
    });
  }

  // Success but non-JSON body — return raw text under a stable key
  if (!isJson) return { rawText: raw };
  return data;
}
