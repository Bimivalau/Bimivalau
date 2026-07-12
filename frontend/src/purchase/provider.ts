/**
 * Purchase provider abstraction.
 *
 * Today: the `MockProvider` calls `/api/subscription/mock-purchase` — no real
 * money moves. Tomorrow: `RevenueCatProvider` is dropped in when Apple/Google
 * keys are provided (EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY).
 *
 * The rest of the app talks only to this interface — one line change swaps
 * providers.
 */
export type PlanSlug =
  | "customer_unlimited"
  | "braider_standard"
  | "braider_unlimited";

export type Cycle = "monthly" | "yearly";

export interface Offering {
  plan: PlanSlug;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  trial_days: number;
}

export interface PurchaseResult {
  ok: boolean;
  plan_slug?: string;
  trial?: boolean;
  message?: string;
}

export interface PurchaseProvider {
  name: string;
  isMock: boolean;
  getOfferings(): Promise<Offering[]>;
  purchase(plan: PlanSlug, cycle: Cycle, startTrial: boolean): Promise<PurchaseResult>;
  cancel(): Promise<PurchaseResult>;
  restore(): Promise<PurchaseResult>;
}
