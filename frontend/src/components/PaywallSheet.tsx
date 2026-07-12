import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { colors, font, radii, spacing } from "@/src/theme";
import { Badge, useResponsive } from "@/src/ui";
import { api } from "@/src/api";
import { purchaseProvider, type PlanSlug, type Cycle } from "@/src/purchase";
import { useEntitlements } from "@/src/entitlements";

/**
 * PaywallSheet — the single premium upgrade experience used app-wide.
 *
 * Design goals:
 *   - Benefits first, price last.
 *   - Monthly / Yearly toggle with savings badge.
 *   - Trial-first CTA when the plan has a trial (Braider Standard/Unlimited).
 *   - Restore purchases hook (no-op on mock provider, real on RevenueCat).
 *   - Feels aspirational, never punitive.
 */

export type PaywallCtx = {
  targetPlan: PlanSlug;
  eyebrow?: string;
  title?: string;
  value?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onPurchased?: () => void;
  ctx: PaywallCtx;
};

const COPY: Record<PlanSlug, { title: string; eyebrow: string; value: string; benefits: string[]; gradient: [string, string, string]; emoji: string }> = {
  customer_unlimited: {
    eyebrow: "YOUR PERSONAL BEAUTY ASSISTANT",
    title: "Unlock BraidsCommunity Unlimited",
    value: "AI intelligence & convenience — every appointment feels effortless.",
    benefits: [
      "AI Style Match — upload a selfie, get personal recommendations",
      "Recreate This Look from any inspiration photo",
      "Beauty Journal — appointments, growth & touch-up reminders",
      "Travel Planning — braiders in every city you visit",
      "Price Alerts on your dream styles",
      "Premium filters & VIP support",
    ],
    gradient: ["#F5C77E", "#B78141", "#4E2E86"],
    emoji: "✨",
  },
  braider_standard: {
    eyebrow: "BRAIDER STANDARD",
    title: "Grow your visibility",
    value: "Understand your customers and attract more bookings.",
    benefits: [
      "25 portfolio photos",
      "Business analytics & customer insights",
      "Priority search ranking",
      "Trending & weekly business reports",
      "Growth recommendations",
    ],
    gradient: ["#D4A574", "#8B6B47", "#3D2A1A"],
    emoji: "📈",
  },
  braider_unlimited: {
    eyebrow: "BRAIDER UNLIMITED",
    title: "Build a premium beauty business",
    value: "The complete AI-powered platform for elite braiders.",
    benefits: [
      "40 portfolio photos",
      "Featured placement & homepage recommendations",
      "AI Business Coach",
      "Marketing assistant & seasonal campaigns",
      "Revenue & retention analytics",
      "Appointment forecasting",
      "Website, online store, inventory & payroll",
    ],
    gradient: ["#8B5A2B", "#4E2E86", "#1A0F3D"],
    emoji: "👑",
  },
};

export function PaywallSheet({ visible, onClose, onPurchased, ctx }: Props) {
  const insets = useSafeAreaInsets();
  const { scaleFont } = useResponsive();
  const { refresh } = useEntitlements();
  const [cycle, setCycle] = useState<Cycle>("yearly");
  const [busy, setBusy] = useState(false);
  const [pricing, setPricing] = useState<any>(null);
  const [trialDays, setTrialDays] = useState(0);
  const [launchMode, setLaunchMode] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const copy = COPY[ctx.targetPlan];

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const cfg = await api("/subscription/config");
        setPricing(cfg.pricing);
        setTrialDays(cfg.trials?.[ctx.targetPlan] || 0);
        setLaunchMode(!!cfg.launch_mode);
      } catch {} finally { setLoaded(true); }
    })();
  }, [visible, ctx.targetPlan]);

  const purchase = async () => {
    setBusy(true);
    try {
      const res = await purchaseProvider.purchase(ctx.targetPlan, cycle, trialDays > 0);
      if (!res.ok) throw new Error(res.message || "Purchase failed");
      await refresh();
      onPurchased?.();
      onClose();
    } catch (e: any) {
      Alert.alert("We couldn't complete the upgrade", e?.message || "Please try again in a moment.");
    } finally { setBusy(false); }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const r = await purchaseProvider.restore();
      await refresh();
      Alert.alert(r.ok ? "Restored" : "Nothing to restore", r.ok ? "Your subscription is active." : "We couldn't find an active subscription for this account.");
    } catch {} finally { setBusy(false); }
  };

  const prices = pricing?.[ctx.targetPlan] || { monthly: 0, yearly: 0 };
  const monthly = prices.monthly || 0;
  const yearly = prices.yearly || 0;
  const yearlyPerMonth = useMemo(() => (yearly ? Math.round((yearly / 12) * 100) / 100 : 0), [yearly]);
  const savePct = useMemo(() => (monthly > 0 && yearly > 0 ? Math.round(100 - (yearlyPerMonth / monthly) * 100) : 0), [monthly, yearly, yearlyPerMonth]);
  const isCustomerLaunch = ctx.targetPlan === "customer_unlimited" && launchMode;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={[s.closeBar, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable testID="paywall-close" onPress={onClose} style={s.closeBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Feather name="x" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={copy.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
            <View style={s.heroEmoji}><Text style={{ fontSize: scaleFont(34), lineHeight: scaleFont(40) }}>{copy.emoji}</Text></View>
            <Text style={s.eyebrow}>{ctx.eyebrow || copy.eyebrow}</Text>
            <Text style={s.title} numberOfLines={3}>{ctx.title || copy.title}</Text>
            <Text style={s.value} numberOfLines={4}>{ctx.value || copy.value}</Text>
            {isCustomerLaunch && (
              <View style={{ marginTop: spacing.md }}>
                <Badge label="INCLUDED FREE DURING LAUNCH" tone="brand" variant="solid" size="md" style={{ backgroundColor: "rgba(255,255,255,0.25)" }} />
              </View>
            )}
          </LinearGradient>

          <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl }}>
            <Text style={s.sectionTitle}>What&apos;s included</Text>
            <View style={{ gap: spacing.sm }}>
              {copy.benefits.map((b) => (
                <View key={b} style={s.benefit}>
                  <View style={s.check}><Feather name="check" size={12} color={colors.brand} /></View>
                  <Text style={s.benefitText} numberOfLines={3}>{b}</Text>
                </View>
              ))}
            </View>

            {!isCustomerLaunch && loaded && (
              <>
                <Text style={s.sectionTitle}>Choose your plan</Text>
                <View style={s.cycleRow}>
                  <CycleOption
                    testID="cycle-yearly"
                    label="Yearly"
                    price={yearly}
                    sub={yearly ? `$${yearlyPerMonth.toFixed(2)}/mo billed annually` : ""}
                    active={cycle === "yearly"}
                    onPress={() => setCycle("yearly")}
                    badge={savePct > 0 ? `SAVE ${savePct}%` : undefined}
                  />
                  <CycleOption
                    testID="cycle-monthly"
                    label="Monthly"
                    price={monthly}
                    sub={monthly ? `Billed monthly` : ""}
                    active={cycle === "monthly"}
                    onPress={() => setCycle("monthly")}
                  />
                </View>
              </>
            )}

            {trialDays > 0 && !isCustomerLaunch && (
              <View style={s.trialCard}>
                <Feather name="clock" size={16} color={colors.brand} />
                <Text style={s.trialText}>Start with a <Text style={{ fontFamily: font.bodyBold }}>{trialDays}-day free trial</Text>. Cancel anytime, no charge.</Text>
              </View>
            )}

            <Pressable
              testID="paywall-buy"
              onPress={purchase}
              disabled={busy}
              style={[s.buy, busy && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel={isCustomerLaunch ? "Continue with free unlock" : trialDays > 0 ? "Start free trial" : "Upgrade now"}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={s.buyText}>
                  {isCustomerLaunch
                    ? "Continue — free during launch"
                    : trialDays > 0
                      ? `Start ${trialDays}-day free trial`
                      : "Upgrade now"}
                </Text>
              )}
            </Pressable>

            <Pressable testID="paywall-restore" onPress={restore} disabled={busy} style={{ marginTop: spacing.md, alignSelf: "center", padding: spacing.sm }} accessibilityRole="button">
              <Text style={s.restore}>Restore purchases</Text>
            </Pressable>

            <Text style={s.legal} numberOfLines={4}>
              {isCustomerLaunch
                ? "All premium customer features are unlocked free during BraidsCommunity's launch. When paid plans begin, you'll be asked before any charge."
                : `Payments are processed by the App Store, Google Play, or Stripe. Cancel anytime from your device Settings. Your data and Studio are always yours — never deleted.`}
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function CycleOption({ testID, label, price, sub, active, onPress, badge }: { testID: string; label: string; price: number; sub: string; active: boolean; onPress: () => void; badge?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[s.cycle, active && s.cycleActive]} accessibilityRole="radio" accessibilityState={{ checked: active }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
        <Text style={[s.cycleLabel, active && { color: "#fff" }]}>{label}</Text>
        {badge ? <Badge label={badge} tone="brand" variant={active ? "solid" : "soft"} /> : null}
      </View>
      <Text style={[s.cyclePrice, active && { color: "#fff" }]} numberOfLines={1}>${price.toFixed(2)}</Text>
      <Text style={[s.cycleSub, active && { color: "rgba(255,255,255,0.75)" }]} numberOfLines={2}>{sub}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  closeBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, backgroundColor: colors.surface },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hero: { padding: spacing.xl, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, alignItems: "center" },
  heroEmoji: { width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  eyebrow: { color: "rgba(255,255,255,0.85)", fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 2.5 },
  title: { color: "#fff", fontFamily: font.display, fontSize: 28, lineHeight: 32, textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.md, flexShrink: 1 },
  value: { color: "rgba(255,255,255,0.9)", fontFamily: font.body, fontSize: 13, textAlign: "center", marginTop: spacing.md, lineHeight: 19, paddingHorizontal: spacing.sm, flexShrink: 1 },
  sectionTitle: { fontFamily: font.bodyBold, color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, marginTop: spacing.xxl, marginBottom: spacing.md, textTransform: "uppercase" },
  benefit: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.xs },
  check: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginTop: 2 },
  benefitText: { flex: 1, fontFamily: font.body, color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  cycleRow: { flexDirection: "row", gap: spacing.md },
  cycle: { flex: 1, minWidth: 0, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, minHeight: 88 },
  cycleActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  cycleLabel: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 13, flexShrink: 1 },
  cyclePrice: { fontFamily: font.display, color: colors.brand, fontSize: 22, marginTop: 4 },
  cycleSub: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 4 },
  trialCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.brandTertiary },
  trialText: { flex: 1, fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  buy: { marginTop: spacing.xxl, backgroundColor: colors.brand, minHeight: 56, borderRadius: radii.md, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  buyText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 15 },
  restore: { fontFamily: font.bodyMed, color: colors.brand, fontSize: 13 },
  legal: { textAlign: "center", marginTop: spacing.lg, fontFamily: font.body, color: colors.muted, fontSize: 11, lineHeight: 16 },
});
