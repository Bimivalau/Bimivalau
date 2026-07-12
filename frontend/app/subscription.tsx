/**
 * Subscription screen — aspirational, elegant, launch-mode-aware.
 *
 * Uses /api/subscription/me + /api/subscription/config as single source of truth.
 * Purchase flows go through the abstracted PurchaseProvider (mock today,
 * RevenueCat when keys are activated at Store submission time).
 */
import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { useEntitlements } from "@/src/entitlements";
import { purchaseProvider, type PlanSlug, type Cycle } from "@/src/purchase";
import { colors, spacing, font, radii } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, Badge, LoadingState } from "@/src/ui";

type PlanDef = {
  slug: PlanSlug | "free";
  name: string;
  tagline: string;
  benefits: string[];
  price_monthly?: number;
  price_yearly?: number;
  trial_days?: number;
  highlight?: boolean;
};

const CUSTOMER_PLANS: PlanDef[] = [
  {
    slug: "free",
    name: "Free",
    tagline: "Discover every braid, everywhere. Forever.",
    benefits: [
      "Browse every hairstyle & Studio",
      "Compare unlimited professionals",
      "Save favorites & inspiration boards",
      "Book any Studio worldwide",
      "Read every review",
    ],
  },
  {
    slug: "customer_unlimited",
    name: "Unlimited",
    tagline: "Your personal beauty assistant.",
    benefits: [
      "AI Style Match from a selfie",
      "Recreate This Look from any photo",
      "Beauty Journal — growth & touch-up reminders",
      "Travel Planning — braiders in every city",
      "Price alerts on your dream styles",
      "Premium filters · VIP support",
    ],
    highlight: true,
  },
];

const BRAIDER_PLANS: PlanDef[] = [
  {
    slug: "free",
    name: "Free",
    tagline: "Start your Studio and begin accepting bookings.",
    benefits: [
      "Studio profile · availability · calendar",
      "Bookings & reviews",
      "Business Success Score & Braider DNA",
      "Basic dashboard",
      "Up to 10 portfolio photos",
    ],
  },
  {
    slug: "braider_standard",
    name: "Standard",
    tagline: "Grow your visibility and attract more customers.",
    benefits: [
      "Up to 25 portfolio photos",
      "Business analytics & health dashboard",
      "Weekly business report",
      "Trending reports",
      "Priority ranking",
      "Growth recommendations",
    ],
  },
  {
    slug: "braider_unlimited",
    name: "Unlimited",
    tagline: "Build a premium beauty business powered by AI.",
    benefits: [
      "Up to 40 portfolio photos",
      "Featured placement · homepage recommendations",
      "AI Business Coach",
      "Marketing assistant · seasonal campaigns",
      "Revenue & retention analytics",
      "Appointment forecasting",
      "Website · online store · inventory · payroll",
    ],
    highlight: true,
  },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { snapshot, refresh } = useEntitlements();
  const [config, setConfig] = useState<any>(null);
  const [cycle, setCycle] = useState<Cycle>("yearly");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const cfg = await api("/subscription/config");
      setConfig(cfg);
    } catch {}
    await refresh();
  }, [refresh]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!config || !snapshot) return <LoadingState label="Loading your plans…" />;

  const role = user?.role || "customer";
  const isBraider = role === "hairdresser";
  const plans: PlanDef[] = (isBraider ? BRAIDER_PLANS : CUSTOMER_PLANS).map(p => {
    if (p.slug === "free") return p;
    const key = p.slug as string;
    const pricing = config.pricing?.[key] || { monthly: 0, yearly: 0 };
    const trials = config.trials || {};
    return { ...p, price_monthly: pricing.monthly, price_yearly: pricing.yearly, trial_days: trials[key] || 0 };
  });

  const currentSlug = snapshot.plan_slug;
  const isCurrent = (p: PlanDef) => {
    if (p.slug === "free") return currentSlug === "customer_free" || currentSlug === "braider_free";
    return p.slug === currentSlug || (currentSlug === "founding_pro" && p.slug === "braider_unlimited");
  };

  const buy = async (p: PlanDef) => {
    if (p.slug === "free") {
      Alert.alert("Downgrade to Free?", "You&apos;ll keep everything you built. Paid features will pause at the end of your billing period.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Downgrade",
          style: "destructive",
          onPress: async () => {
            setBusy(p.slug);
            try {
              await purchaseProvider.cancel();
              await refresh();
            } finally { setBusy(null); }
          },
        },
      ]);
      return;
    }
    setBusy(p.slug);
    try {
      const useTrial = (p.trial_days || 0) > 0 && !isCurrent(p);
      const r = await purchaseProvider.purchase(p.slug as PlanSlug, cycle, useTrial);
      if (!r.ok) throw new Error(r.message || "Purchase failed");
      await refresh();
      Alert.alert(useTrial ? "Trial started ✨" : "You're in ✨", useTrial ? `Enjoy your ${p.trial_days}-day free trial.` : `Welcome to ${p.name}.`);
    } catch (e: any) {
      Alert.alert("We couldn't complete the upgrade", e?.message || "Please try again.");
    } finally { setBusy(null); }
  };

  const yearlySavingsPct = (p: PlanDef): number | null => {
    const m = p.price_monthly || 0;
    const y = p.price_yearly || 0;
    if (!m || !y) return null;
    const perMonthYearly = y / 12;
    return Math.max(0, Math.round(100 - (perMonthYearly / m) * 100));
  };

  const launchMode = !!config.launch_mode && !isBraider;
  const foundingPro = config.founding_pro || { spots_remaining: 100, slots: 100 };

  return (
    <SafeScrollView>
      <View style={{ paddingTop: spacing.md }}>
        <Pressable
          testID="sub-back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          hitSlop={12}
          style={{ minHeight: 44, width: 44, justifyContent: "center" }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.eyebrow}>{isBraider ? "PROFESSIONAL PLANS" : "PERSONAL PLANS"}</Text>
        <ResponsiveHeading size={30} style={{ marginTop: spacing.xs }}>
          {isBraider ? "Invest in your growth" : "Unlock the world of braids"}
        </ResponsiveHeading>
        <Text style={s.sub}>
          {isBraider
            ? "The complete platform to run and grow a professional braiding business."
            : "Free forever discovery. Upgrade later to unlock your personal beauty assistant."}
        </Text>

        {launchMode && (
          <Card variant="outline" padding={spacing.md} style={{ marginTop: spacing.lg, borderColor: colors.success, backgroundColor: "#EFFDF5" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Feather name="gift" size={20} color={colors.success} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.launchTitle}>All premium customer features are free during launch</Text>
                <Text style={s.launchMsg} numberOfLines={3}>Enjoy AI Style Match, Recreate This Look, Beauty Journal, Travel Planning and more — no charge, no card required.</Text>
              </View>
            </View>
          </Card>
        )}

        {isBraider && foundingPro.spots_remaining > 0 && !snapshot.founding_pro && (
          <Pressable
            testID="founding-pro-cta"
            onPress={() => router.push("/pro/founding")}
            style={{ marginTop: spacing.lg }}
          >
            <LinearGradient colors={["#F5C77E", "#B78141"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.foundingCard}>
              <Feather name="award" size={20} color="#fff" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.foundingTitle}>Founding Studio spots</Text>
                <Text style={s.foundingMsg} numberOfLines={2}>
                  {foundingPro.spots_remaining} of {foundingPro.slots} remaining · 1 year of Unlimited free
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color="#fff" />
            </LinearGradient>
          </Pressable>
        )}

        {snapshot.founding_pro && snapshot.founding_pro_days_left != null && (
          <Card variant="outline" padding={spacing.md} style={{ marginTop: spacing.lg, borderColor: colors.brand, backgroundColor: colors.brandTertiary }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Feather name="award" size={20} color={colors.brand} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.launchTitle}>You&apos;re a Founding Pro ✨</Text>
                <Text style={s.launchMsg}>{snapshot.founding_pro_days_left} days of Unlimited remaining — everything on us.</Text>
              </View>
            </View>
          </Card>
        )}

        <View style={s.toggleRow}>
          <Pressable testID="toggle-monthly" onPress={() => setCycle("monthly")} style={[s.toggle, cycle === "monthly" && s.toggleActive]} accessibilityRole="radio" accessibilityState={{ checked: cycle === "monthly" }}>
            <Text style={[s.toggleText, cycle === "monthly" && s.toggleTextActive]}>Monthly</Text>
          </Pressable>
          <Pressable testID="toggle-yearly" onPress={() => setCycle("yearly")} style={[s.toggle, cycle === "yearly" && s.toggleActive]} accessibilityRole="radio" accessibilityState={{ checked: cycle === "yearly" }}>
            <Text style={[s.toggleText, cycle === "yearly" && s.toggleTextActive]}>Yearly</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: spacing.lg, gap: spacing.lg }}>
          {plans.map((p) => {
            const price = cycle === "monthly" ? p.price_monthly : p.price_yearly;
            const cur = isCurrent(p);
            const savings = cycle === "yearly" ? yearlySavingsPct(p) : null;
            const forceUnlockedByLaunch = launchMode && p.slug === "customer_unlimited";
            return (
              <Card
                key={p.slug}
                padding={spacing.lg}
                style={[
                  s.tierCard,
                  cur && s.tierCurrent,
                  p.highlight && !cur && s.tierHighlight,
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md, flexWrap: "wrap" }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", rowGap: 4 }}>
                      <Text style={s.tierName}>{p.name}</Text>
                      {cur && <Badge label="CURRENT" tone="brand" />}
                      {p.highlight && !cur && <Badge label="MOST POPULAR" tone="warning" />}
                      {forceUnlockedByLaunch && <Badge label="FREE DURING LAUNCH" tone="success" />}
                    </View>
                    <Text style={s.tierTag} numberOfLines={3}>{p.tagline}</Text>
                  </View>
                  {p.slug !== "free" ? (
                    <View style={{ alignItems: "flex-end", minWidth: 90 }}>
                      <Text style={s.price}>${(price || 0).toFixed(2)}</Text>
                      <Text style={s.priceUnit}>/{cycle === "monthly" ? "month" : "year"}</Text>
                      {savings != null && savings > 0 && <Badge label={`SAVE ${savings}%`} tone="brand" style={{ marginTop: 4 }} />}
                    </View>
                  ) : (
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={s.priceFree}>Free</Text>
                    </View>
                  )}
                </View>

                <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                  {p.benefits.map((b) => (
                    <View key={b} style={s.benefit}>
                      <View style={s.check}><Feather name="check" size={12} color="#fff" /></View>
                      <Text style={s.benefitText} numberOfLines={3}>{b}</Text>
                    </View>
                  ))}
                </View>

                {p.trial_days && p.trial_days > 0 && !cur ? (
                  <Text style={s.trialLine}>
                    <Feather name="clock" size={12} color={colors.brand} />  {p.trial_days}-day free trial included
                  </Text>
                ) : null}

                {cur ? (
                  <View style={s.currentBtn}>
                    <Text style={s.currentBtnText}>Your current plan</Text>
                  </View>
                ) : forceUnlockedByLaunch ? (
                  <View style={[s.currentBtn, { borderColor: colors.success }]}>
                    <Text style={[s.currentBtnText, { color: colors.success }]}>Already unlocked for you</Text>
                  </View>
                ) : (
                  <Pressable
                    testID={`sub-${p.slug}`}
                    disabled={busy === p.slug}
                    onPress={() => buy(p)}
                    style={[
                      s.action,
                      p.highlight && s.actionPrimary,
                      busy === p.slug && { opacity: 0.5 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={p.slug === "free" ? "Switch to Free" : `Choose ${p.name}`}
                  >
                    {busy === p.slug ? <ActivityIndicator color="#fff" /> : (
                      <Text style={[s.actionText, !p.highlight && p.slug !== "free" && { color: colors.onSurface }, p.slug === "free" && { color: colors.error }]}>
                        {p.slug === "free" ? "Switch to Free" : (p.trial_days ? `Start ${p.trial_days}-day free trial` : `Choose ${p.name}`)}
                      </Text>
                    )}
                  </Pressable>
                )}
              </Card>
            );
          })}
        </View>

        <Pressable testID="restore-purchases" onPress={async () => { await purchaseProvider.restore(); await refresh(); }} style={{ marginTop: spacing.xl, alignSelf: "center", padding: spacing.md }}>
          <Text style={{ fontFamily: font.bodyMed, color: colors.brand, fontSize: 13 }}>Restore purchases</Text>
        </Pressable>

        <Text style={s.legal} numberOfLines={5}>
          Your data — Studio, portfolio, saves, bookings — is always yours. We never delete portfolio photos when your plan changes. Payments are handled by the App Store, Google Play or Stripe. Cancel anytime.
        </Text>
      </View>
    </SafeScrollView>
  );
}

const s = StyleSheet.create({
  eyebrow: { color: colors.brand, letterSpacing: 3, fontSize: 10, fontFamily: font.bodyMed, marginTop: spacing.sm },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.onSurfaceTertiary, marginTop: spacing.sm, lineHeight: 20 },
  launchTitle: { fontFamily: font.bodyBold, fontSize: 14, color: "#207449" },
  launchMsg: { fontFamily: font.body, fontSize: 12, color: "#38875D", marginTop: 2, lineHeight: 17 },
  foundingCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radii.lg },
  foundingTitle: { color: "#fff", fontFamily: font.bodyBold, fontSize: 14 },
  foundingMsg: { color: "#fff", fontFamily: font.body, fontSize: 12, marginTop: 2, opacity: 0.95 },
  toggleRow: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radii.pill, padding: 4, marginTop: spacing.xl, gap: 4 },
  toggle: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radii.pill },
  toggleActive: { backgroundColor: "#fff" },
  toggleText: { fontFamily: font.bodyMed, fontSize: 13, color: colors.onSurfaceTertiary },
  toggleTextActive: { color: colors.onSurface },
  tierCard: { borderWidth: 1, borderColor: colors.border },
  tierCurrent: { borderColor: colors.brand, borderWidth: 2 },
  tierHighlight: { borderColor: colors.brandSecondary },
  tierName: { fontFamily: font.display, fontSize: 24, color: colors.onSurface },
  tierTag: { fontFamily: font.body, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 4, lineHeight: 16 },
  price: { fontFamily: font.display, fontSize: 26, color: colors.onSurface },
  priceUnit: { fontFamily: font.body, fontSize: 11, color: colors.onSurfaceTertiary, marginTop: -2 },
  priceFree: { fontFamily: font.display, fontSize: 22, color: colors.success },
  benefit: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  check: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginTop: 1 },
  benefitText: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 18 },
  trialLine: { marginTop: spacing.md, fontFamily: font.bodyMed, fontSize: 12, color: colors.brand },
  action: { marginTop: spacing.lg, minHeight: 48, borderRadius: radii.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  actionPrimary: { backgroundColor: colors.brand },
  actionText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 14 },
  currentBtn: { marginTop: spacing.lg, minHeight: 48, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.brand, alignItems: "center", justifyContent: "center" },
  currentBtnText: { color: colors.brand, fontFamily: font.bodyBold, fontSize: 14 },
  legal: { textAlign: "center", marginTop: spacing.xl, fontFamily: font.body, fontSize: 11, color: colors.muted, lineHeight: 15 },
});
