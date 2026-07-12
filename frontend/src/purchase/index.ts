import { MockProvider } from "./mockProvider";
import { RevenueCatProvider } from "./revenuecatProvider";
import type { PurchaseProvider } from "./provider";

/**
 * Provider selector. When RevenueCat env keys are present AND we're on a
 * device build (not Expo Go), pick RevenueCat. Otherwise MockProvider.
 *
 * Keeping this behind a single accessor means every call site remains
 * unchanged when the switch flips.
 */
const hasRC =
  !!process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ||
  !!process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

export const purchaseProvider: PurchaseProvider = hasRC ? RevenueCatProvider : MockProvider;

export type { PurchaseProvider, PlanSlug, Cycle, Offering, PurchaseResult } from "./provider";
