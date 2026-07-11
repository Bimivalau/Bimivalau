import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, clearToken, getToken, setToken } from "./api";
import { signInWithGoogle as _signInWithGoogle, captureSessionIdFromUrl } from "./google-auth";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "customer" | "hairdresser" | "admin";
  plan: "standard" | "unlimited";
  phone?: string | null;
  profile_photo?: string | null;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, role: "customer" | "hairdresser") => Promise<void>;
  signInWithGoogle: () => Promise<{ is_new_user: boolean; needs_pro_completion: boolean } | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setPlan: (plan: "standard" | "unlimited") => Promise<void>;
};

const SessionCtx = createContext<Ctx | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const tk = await getToken();
    if (!tk) { setUser(null); return; }
    try {
      const me = await api("/auth/me");
      setUser(me);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      // If we're coming back from Google auth (web hash or mobile deep link), exchange first.
      try {
        const exchanged = await captureSessionIdFromUrl();
        if (exchanged) {
          setUser(exchanged.user);
          setLoading(false);
          return;
        }
      } catch { /* fall through to normal session hydrate */ }
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = async (email: string, password: string) => {
    const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    await setToken(res.access_token);
    setUser(res.user);
  };
  const signUp = async (email: string, password: string, name: string, role: "customer" | "hairdresser") => {
    const res = await api("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name, role }) });
    await setToken(res.access_token);
    setUser(res.user);
  };
  const signOut = async () => {
    await clearToken();
    setUser(null);
  };
  const signInWithGoogle = async () => {
    const res = await _signInWithGoogle();
    if (!res) return null;
    setUser(res.user);
    return { is_new_user: res.is_new_user, needs_pro_completion: res.needs_pro_completion };
  };
  const setPlan = async (plan: "standard" | "unlimited") => {
    const u = await api("/auth/plan", { method: "POST", body: JSON.stringify({ plan }) });
    setUser(u);
  };

  return (
    <SessionCtx.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, signOut, refresh, setPlan }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession must be inside SessionProvider");
  return c;
}
