import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "braids_token";

export async function getToken(): Promise<string | null> {
  const t = await storage.secureGet<string>(TOKEN_KEY, "");
  return t ? t : null;
}
export async function setToken(t: string) {
  return storage.secureSet(TOKEN_KEY, t);
}
export async function clearToken() {
  return storage.secureRemove(TOKEN_KEY);
}

export async function api(path: string, opts: RequestInit = {}) {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.detail || `HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return data;
}
