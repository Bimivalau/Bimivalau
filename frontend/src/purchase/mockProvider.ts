import { api } from "@/src/api";
import type { Cycle, Offering, PlanSlug, PurchaseProvider, PurchaseResult } from "./provider";

/**
 * MockProvider — hits our backend `/api/subscription/mock-*` endpoints. No
 * money moves. Used until RevenueCat keys are activated at App Store /
 * Play Store submission time.
 */
export const MockProvider: PurchaseProvider = {
  name: "mock",
  isMock: true,

  async getOfferings(): Promise<Offering[]> {
    const cfg = await api("/subscription/config");
    const trials = cfg.trials || {};
    const price = cfg.pricing || {};
    const build = (plan: PlanSlug): Offering => ({
      plan,
      monthly_price: price[plan]?.monthly ?? 0,
      yearly_price: price[plan]?.yearly ?? 0,
      currency: "USD",
      trial_days: trials[plan] ?? 0,
    });
    return [build("customer_unlimited"), build("braider_standard"), build("braider_unlimited")];
  },

  async purchase(plan: PlanSlug, cycle: Cycle, startTrial: boolean): Promise<PurchaseResult> {
    try {
      const res = await api("/subscription/mock-purchase", {
        method: "POST",
        body: JSON.stringify({ plan, cycle, start_trial: startTrial }),
      });
      return { ok: !!res.ok, trial: res.plan_status === "trialing", plan_slug: plan };
    } catch (e: any) {
      return { ok: false, message: e?.userMessage || e?.message || "Purchase failed" };
    }
  },

  async cancel(): Promise<PurchaseResult> {
    try { const r = await api("/subscription/mock-cancel", { method: "POST" }); return { ok: !!r.ok }; }
    catch (e: any) { return { ok: false, message: e?.userMessage || "Cancel failed" }; }
  },

  async restore(): Promise<PurchaseResult> {
    try { await api("/subscription/mock-restore", { method: "POST" }); return { ok: true }; }
    catch (e: any) { return { ok: false, message: e?.userMessage || "Restore failed" }; }
  },
};
