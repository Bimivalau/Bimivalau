/**
 * Subscription — the "invest in growth" screen.
 * Renders the full plan catalog per role (customer / braider), with:
 *   - Current plan highlight
 *   - Monthly / Yearly toggle (with yearly savings pill)
 *   - Founding Pro promo strip for eligible braiders
 *   - Feature checklists per tier
 *   - Subscribe / Manage / Downgrade actions
 */
import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api, ApiError } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

type Tier = {
  name: string;
  price_monthly: number;
  price_yearly: number;
  tagline: string;
  features: string[];
  limits?: string[];
};

type Interval = "monthly" | "yearly";

export default function Subscription() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refresh } = useSession();
  const [state, setState] = useState<any>(null);
  const [interval, setIntervalState] = useState<Interval>("yearly");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await api("/subscriptions/me");
        setState(d);
      } catch (e: any) {
        setError(e instanceof ApiError ? e.userMessage : "Couldn't load plans.");
      }
    })();
  }, []);

  if (!state) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        {error ? <Text style={{ color: colors.error, fontFamily: font.body }}>{error}</Text> : <ActivityIndicator color={colors.brand} />}
      </View>
    );
  }

  const role = user?.role || "customer";
  const isBraider = role === "hairdresser";
  const catalog: Record<string, Tier> = state.catalog;
  const currentPlan = state.subscription?.plan_type || "free";
  const yearlyPct = state.yearly_savings_pct;
  const promoDays = state.founding_pro_days_left;

  const subscribe = async (planType: string) => {
    setBusy(planType);
    try {
      const body: any = { plan_type: planType };
      if (planType !== "free") body.billing_interval = interval;
      const d = await api("/subscriptions/subscribe", { method: "POST", body: JSON.stringify(body) });
      await refresh();
      const d2 = await api("/subscriptions/me");
      setState(d2);
      Alert.alert(planType === "free" ? "Plan updated" : "You're in ✨", d.note || `Welcome to ${(catalog[planType]?.name || planType)}.`);
    } catch (e: any) {
      Alert.alert("Couldn't update plan", e instanceof ApiError ? e.userMessage : "Please try again.");
    } finally { setBusy(null); }
  };

  const tierOrder = isBraider ? ["free", "standard", "unlimited"] : ["free", "unlimited"];

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl + insets.bottom }}>
      {/* ---- Header ---- */}
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="sub-back" onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing.xl }}>
        <Text style={s.title}>{isBraider ? "Invest in your growth" : "Unlock the world of braids"}</Text>
        <Text style={s.sub}>
          {isBraider
            ? "BraidsCommunity is the world's first AI-powered growth platform built exclusively for professional braiders."
            : "Free forever discovery. Upgrade for worldwide search, advanced filters and AI recommendations."}
        </Text>

        {/* Founding Pro promo strip */}
        {isBraider && promoDays != null && promoDays > 0 && (
          <LinearGradient colors={["#F5C77E", "#B78141"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.promo}>
            <Feather name="award" size={16} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={s.promoTitle}>Founding Pro — Unlimited free for {promoDays} more days</Text>
              <Text style={s.promoDesc}>You keep every Unlimited perk until your promo ends.</Text>
            </View>
          </LinearGradient>
        )}

        {/* Interval toggle */}
        <View style={s.toggleRow}>
          <Pressable testID="toggle-monthly" onPress={() => setIntervalState("monthly")} style={[s.toggle, interval === "monthly" && s.toggleActive]}>
            <Text style={[s.toggleText, interval === "monthly" && s.toggleTextActive]}>Monthly</Text>
          </Pressable>
          <Pressable testID="toggle-yearly" onPress={() => setIntervalState("yearly")} style={[s.toggle, interval === "yearly" && s.toggleActive]}>
            <Text style={[s.toggleText, interval === "yearly" && s.toggleTextActive]}>Yearly</Text>
            {yearlyPct ? <Text style={s.savePill}>SAVE {yearlyPct}%</Text> : null}
          </Pressable>
        </View>
      </View>

      {/* ---- Tier cards ---- */}
      <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: spacing.lg }}>
        {tierOrder.map((key) => {
          const t = catalog[key];
          if (!t) return null;
          const isCurrent = currentPlan === key;
          const isPaidUnlimitedBraider = isBraider && key === "unlimited";
          const price = interval === "monthly" ? t.price_monthly : t.price_yearly;

          return (
            <View key={key} style={[s.card, isCurrent && s.cardCurrent, key === "unlimited" && s.cardUnlimited]}>
              {/* Header row */}
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text style={s.tierName}>{t.name}</Text>
                    {isCurrent && <View style={s.currentPill}><Text style={s.currentPillText}>CURRENT</Text></View>}
                    {isPaidUnlimitedBraider && <Text style={s.recommend}>Most popular</Text>}
                  </View>
                  <Text style={s.tierTag}>{t.tagline}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {price > 0 ? (
                    <>
                      <Text style={s.price}>${price.toFixed(2)}</Text>
                      <Text style={s.priceUnit}>/{interval === "monthly" ? "mo" : "yr"}</Text>
                    </>
                  ) : (
                    <Text style={s.priceFree}>Free</Text>
                  )}
                </View>
              </View>

              {/* Features */}
              <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                {t.features.map((f, i) => (
                  <View key={i} style={s.featureRow}>
                    <View style={s.checkDot}><Feather name="check" size={11} color="#fff" /></View>
                    <Text style={s.featureText}>{f}</Text>
                  </View>
                ))}
                {(t.limits || []).map((f, i) => (
                  <View key={`l${i}`} style={s.featureRow}>
                    <View style={s.lockDot}><Feather name="lock" size={10} color={colors.muted} /></View>
                    <Text style={[s.featureText, { color: colors.onSurfaceTertiary }]}>{f}</Text>
                  </View>
                ))}
              </View>

              {/* Action */}
              {isCurrent ? (
                <View style={s.currentBtn}>
                  <Text style={s.currentBtnText}>Your current plan</Text>
                </View>
              ) : (
                <Pressable
                  testID={`sub-${key}`}
                  disabled={busy === key}
                  onPress={() => {
                    if (key === "free") {
                      Alert.alert("Downgrade to Free?", "You'll lose access to your paid perks at the end of your billing period.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Downgrade", style: "destructive", onPress: () => subscribe("free") },
                      ]);
                    } else {
                      subscribe(key);
                    }
                  }}
                  style={[s.action, key === "unlimited" && s.actionUnlimited, busy === key && { opacity: 0.5 }]}
                >
                  {busy === key ? <ActivityIndicator color="#fff" /> : (
                    <Text style={[s.actionText, key !== "unlimited" && { color: colors.onSurface }]}>
                      {key === "free" ? "Switch to Free" : `Choose ${t.name}`}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      <Text style={s.footer}>Cancel anytime. Payment is mocked in this build — no card required.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  title: { fontFamily: font.display, fontSize: 32, lineHeight: 36, color: colors.onSurface, marginTop: spacing.md },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.onSurfaceTertiary, marginTop: spacing.sm, lineHeight: 20 },
  promo: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, marginTop: spacing.lg },
  promoTitle: { color: "#fff", fontFamily: font.bodyBold, fontSize: 13 },
  promoDesc: { color: "#fff", fontFamily: font.body, fontSize: 11, marginTop: 2, opacity: 0.9 },

  toggleRow: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radii.pill, padding: 4, marginTop: spacing.xl },
  toggle: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radii.pill, flexDirection: "row", gap: spacing.xs },
  toggleActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  toggleText: { fontFamily: font.bodyMed, fontSize: 13, color: colors.onSurfaceTertiary },
  toggleTextActive: { color: colors.onSurface },
  savePill: { fontFamily: font.bodyBold, fontSize: 9, color: colors.brand, backgroundColor: colors.brandTertiary, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginLeft: 4, letterSpacing: 0.8 },

  card: { padding: spacing.xl, borderRadius: 24, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  cardCurrent: { borderColor: colors.brand, borderWidth: 2 },
  cardUnlimited: { backgroundColor: "#FAF6EF", borderColor: "#EBDEC5" },

  tierName: { fontFamily: font.display, fontSize: 24, color: colors.onSurface },
  tierTag: { fontFamily: font.body, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 4, lineHeight: 16 },
  currentPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: colors.brandTertiary },
  currentPillText: { fontFamily: font.bodyBold, fontSize: 9, color: colors.brandSecondary, letterSpacing: 1 },
  recommend: { fontFamily: font.bodyBold, fontSize: 10, color: colors.brand, letterSpacing: 1 },

  price: { fontFamily: font.display, fontSize: 28, color: colors.onSurface },
  priceUnit: { fontFamily: font.body, fontSize: 11, color: colors.onSurfaceTertiary, marginTop: -2 },
  priceFree: { fontFamily: font.display, fontSize: 22, color: colors.success },

  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  checkDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginTop: 1 },
  lockDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.divider, alignItems: "center", justifyContent: "center", marginTop: 1 },
  featureText: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 18 },

  action: { marginTop: spacing.xl, height: 48, borderRadius: 24, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  actionUnlimited: { backgroundColor: colors.brand },
  actionText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 14 },
  currentBtn: { marginTop: spacing.xl, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.brand, alignItems: "center", justifyContent: "center" },
  currentBtnText: { color: colors.brand, fontFamily: font.bodyBold, fontSize: 14 },

  footer: { textAlign: "center", marginTop: spacing.xl, fontFamily: font.body, fontSize: 11, color: colors.muted, paddingHorizontal: spacing.xl },
});
