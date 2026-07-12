/**
 * RevenueCat provider stub. Wired when the platform owner installs
 * `react-native-purchases` and configures Apple/Google keys.
 *
 * IMPORTANT: this file is intentionally not importing `react-native-purchases`
 * so that the app runs without the SDK installed. When the SDK is added:
 *   1. `yarn expo install react-native-purchases`
 *   2. Uncomment the lines below and delete this comment.
 *   3. Provide EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY.
 */
import type { PurchaseProvider, PurchaseResult, PlanSlug, Cycle, Offering } from "./provider";

// import Purchases from "react-native-purchases";

export const RevenueCatProvider: PurchaseProvider = {
  name: "revenuecat",
  isMock: false,

  async getOfferings(): Promise<Offering[]> {
    throw new Error("RevenueCat provider not wired yet");
  },

  async purchase(_plan: PlanSlug, _cycle: Cycle, _trial: boolean): Promise<PurchaseResult> {
    return { ok: false, message: "RevenueCat provider not activated." };
  },

  async cancel(): Promise<PurchaseResult> {
    return { ok: false, message: "Manage subscription from your device Settings." };
  },

  async restore(): Promise<PurchaseResult> {
    return { ok: false, message: "RevenueCat provider not activated." };
  },
};
