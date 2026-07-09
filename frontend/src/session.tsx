import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, clearToken, getToken, setToken } from "./api";

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
  const setPlan = async (plan: "standard" | "unlimited") => {
    const u = await api("/auth/plan", { method: "POST", body: JSON.stringify({ plan }) });
    setUser(u);
  };

  return (
    <SessionCtx.Provider value={{ user, loading, signIn, signUp, signOut, refresh, setPlan }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession must be inside SessionProvider");
  return c;
}
