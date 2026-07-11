import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { api, setToken } from "./api";

// Emergent-managed Google Auth entry point
const AUTH_URL = "https://auth.emergentagent.com/";

function getRedirectUrl(): string {
  if (Platform.OS === "web") {
    // must be an existing route; our root re-routes to /welcome or /(tabs)/home
    return window.location.origin + "/";
  }
  return Linking.createURL("");
}

function parseSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    // Handle hash fragment first (Emergent puts it in the fragment on success)
    const hashIdx = url.indexOf("#");
    if (hashIdx !== -1) {
      const frag = url.slice(hashIdx + 1);
      const params = new URLSearchParams(frag);
      const sid = params.get("session_id");
      if (sid) return sid;
    }
    // Fallback to query string
    const u = new URL(url);
    return u.searchParams.get("session_id");
  } catch {
    return null;
  }
}

async function exchangeSessionId(sessionId: string) {
  // Backend does the Emergent-side lookup, upserts the user, and issues our JWT.
  const res = await api("/auth/google", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
  await setToken(res.access_token);
  return res as { access_token: string; user: any; is_new_user: boolean; needs_pro_completion: boolean };
}

/** Kick off the Google Sign-In flow. Returns the exchanged auth response, or null if the user cancelled. */
export async function signInWithGoogle(): Promise<Awaited<ReturnType<typeof exchangeSessionId>> | null> {
  const redirectUrl = getRedirectUrl();
  const authUrl = `${AUTH_URL}?redirect=${encodeURIComponent(redirectUrl)}`;

  if (Platform.OS === "web") {
    // Full-page redirect on web; captureSessionIdFromUrl() picks it up on the way back
    window.location.href = authUrl;
    return null;
  }

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
  if (result.type !== "success" || !result.url) return null;
  const sid = parseSessionId(result.url);
  if (!sid) return null;
  return exchangeSessionId(sid);
}

/** Called on web at app mount — if we came back from Google, exchange the session_id in the URL. */
export async function captureSessionIdFromUrl(): Promise<Awaited<ReturnType<typeof exchangeSessionId>> | null> {
  if (Platform.OS !== "web") {
    // On mobile, cold-start deep links land here via Linking.getInitialURL()
    const initial = await Linking.getInitialURL();
    const sid = parseSessionId(initial);
    if (!sid) return null;
    return exchangeSessionId(sid);
  }
  const sid = parseSessionId(window.location.hash || window.location.search);
  if (!sid) return null;
  const exchanged = await exchangeSessionId(sid);
  // Clean the hash/query so a page reload doesn't retry
  try { window.history.replaceState(null, "", window.location.pathname); } catch {}
  return exchanged;
}
