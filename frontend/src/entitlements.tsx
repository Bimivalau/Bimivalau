import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/src/api";
import { useSession } from "@/src/session";

/**
 * useEntitlements — the single point where the frontend asks "can this user
 * do X?". Powered by /api/subscription/me which returns a full entitlement
 * map in one round-trip.
 *
 * NEVER hardcode `user.plan === 'unlimited'` anywhere in the app. Always call
 * `has(featureKey)` so business rules can move at runtime.
 */
export type Snapshot = {
  plan_slug: string;
  plan: string;
  role: string;
  plan_source: string | null;
  plan_status: string;
  plan_cycle: string | null;
  plan_renewal_at: string | null;
  plan_cancel_at_period_end: boolean;
  trial_plan: string | null;
  trial_ends_at: string | null;
  trial_days_left: number | null;
  founding_pro: boolean;
  founding_pro_expires_at: string | null;
  founding_pro_days_left: number | null;
  launch_mode: boolean;
  portfolio_cap: number;
  entitlements: Record<string, boolean>;
};

type Ctx = {
  loading: boolean;
  snapshot: Snapshot | null;
  has: (key: string) => boolean;
  refresh: () => Promise<void>;
};

const EntitlementsContext = createContext<Ctx | null>(null);

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) { setSnapshot(null); setLoading(false); return; }
    if (inflight.current) return;
    inflight.current = true;
    try {
      const s = await api("/subscription/me");
      setSnapshot(s);
    } catch {
      // Non-fatal — keep whatever we had.
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (sessionLoading) return;
    setLoading(true);
    refresh();
  }, [user?.id, sessionLoading, refresh]);

  const has = useCallback(
    (key: string) => !!snapshot?.entitlements?.[key],
    [snapshot],
  );

  const value = useMemo(() => ({ loading, snapshot, has, refresh }), [loading, snapshot, has, refresh]);
  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements(): Ctx {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error("useEntitlements must be used inside EntitlementsProvider");
  return ctx;
}
