import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

type Interval = "monthly" | "yearly";

export default function Subscription() {
  const { user, refresh } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [interval, setInterval] = useState<Interval>("yearly");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => api("/subscriptions/me").then(setData);
  useEffect(() => { load(); }, []);

  if (!user || !data) {
    return <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brand} /></View>;
  }

  const isFoundingActive = !!data.subscription?.is_founding_pro && data.founding_pro_days_left != null;
  const sub = data.subscription;
  const currentPlan = sub ? sub.plan_type : "standard";
  const currentInterval = sub?.billing_interval;

  const subscribe = async (plan_type: "standard" | "unlimited") => {
    setBusy(true); setMsg(null);
    try {
      const res = await api("/subscriptions/subscribe", { method: "POST", body: JSON.stringify({ plan_type, billing_interval: plan_type === "unlimited" ? interval : null }) });
      await refresh();
      await load();
      setMsg(res.note || (plan_type === "standard" ? "Downgraded to Standard" : "You're on Unlimited"));
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const pricing = data.pricing;
  const chosenPrice = interval === "monthly" ? pricing.monthly : pricing.yearly;
  const monthlyIfYearly = (pricing.yearly / 12).toFixed(2);

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Pressable testID="sub-back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.title}>Subscription</Text>
        <Text style={s.sub}>Mocked billing for now — real payments coming later.</Text>

        {/* Founding-Pro banner */}
        {isFoundingActive && (
          <View testID="founding-banner" style={s.foundingCard}>
            <Feather name="award" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={s.foundingTitle}>Founding Pro · Unlimited free</Text>
              <Text style={s.foundingMeta}>
                Slot #{sub.founding_pro_slot} of 10 · {data.founding_pro_days_left} days remaining. No payment needed until then.
              </Text>
            </View>
          </View>
        )}

        {/* Billing interval toggle */}
        <View style={s.intervalWrap}>
          <View style={s.intervalRow}>
            {(["monthly", "yearly"] as Interval[]).map(i => (
              <Pressable key={i} testID={`interval-${i}`} onPress={() => setInterval(i)} style={[s.intervalTab, interval === i && s.intervalTabActive]}>
                <Text style={[s.intervalText, interval === i && s.intervalTextActive]}>
                  {i === "monthly" ? "Monthly" : `Yearly · save ${pricing.yearly_savings_pct}%`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Plans */}
        <View style={[s.plan, currentPlan === "standard" && s.planActive]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <Text style={s.planName}>Standard</Text>
            <Text style={s.planPrice}>Free</Text>
          </View>
          <Perk desc={user.role === "hairdresser" ? "Basic listing, portfolio capped at 10 photos" : "Top 3 stylists per style, blurred locations"} />
          <Perk desc={user.role === "hairdresser" ? "Verification badge available" : "Basic search"} />
          <Pressable testID="pick-standard" disabled={busy || currentPlan === "standard"} onPress={() => subscribe("standard")} style={[s.pickBtn, currentPlan === "standard" && s.pickBtnCurrent]}>
            <Text style={[s.pickText, currentPlan === "standard" && { color: colors.onSurface }]}>{currentPlan === "standard" ? "Current plan" : "Switch to Standard"}</Text>
          </Pressable>
        </View>

        <View style={[s.plan, s.planUnlimited, currentPlan === "unlimited" && s.planActive]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <Text style={s.planName}>Unlimited</Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.planPrice}>
                {isFoundingActive ? "$0" : `$${chosenPrice}`}
                <Text style={s.planPriceUnit}>{interval === "monthly" ? "/mo" : "/yr"}</Text>
              </Text>
              {!isFoundingActive && interval === "yearly" && (
                <Text style={s.planPriceHint}>${monthlyIfYearly}/mo billed yearly</Text>
              )}
            </View>
          </View>
          <Perk desc={user.role === "hairdresser" ? "Unlimited portfolio uploads" : "All stylists unlocked, no gating"} />
          <Perk desc={user.role === "hairdresser" ? "Priority search placement" : "Exact addresses, unlimited searches"} />
          <Perk desc={user.role === "hairdresser" ? "Eligible for Featured Stylist of the Week" : "Priority booking windows"} />
          <Pressable
            testID="pick-unlimited"
            disabled={busy || (currentPlan === "unlimited" && currentInterval === interval)}
            onPress={() => subscribe("unlimited")}
            style={[s.pickBtn, s.pickBtnBrand, (currentPlan === "unlimited" && currentInterval === interval) && s.pickBtnCurrent]}
          >
            <Text style={[s.pickText, currentPlan === "unlimited" && currentInterval === interval && { color: colors.onSurface }]}>
              {currentPlan === "unlimited" && currentInterval === interval
                ? "Current plan"
                : isFoundingActive
                  ? "Included in your Founding Pro promo"
                  : `Switch to Unlimited ${interval}`}
            </Text>
          </Pressable>
        </View>

        {msg && <Text testID="sub-msg" style={{ color: colors.success, marginTop: spacing.md, fontFamily: font.bodyMed, textAlign: "center" }}>{msg}</Text>}
      </View>
    </ScrollView>
  );
}

function Perk({ desc }: { desc: string }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.sm }}>
      <Feather name="check" size={16} color={colors.brand} />
      <Text style={{ fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 14, flex: 1 }}>{desc}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 34, color: colors.onSurface, marginTop: spacing.lg },
  sub: { fontFamily: font.body, color: colors.muted, marginBottom: spacing.lg },
  foundingCard: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.lg, backgroundColor: colors.surfaceInverse, borderRadius: radii.md, marginBottom: spacing.lg },
  foundingTitle: { color: "#F9F6F0", fontFamily: font.display, fontSize: 20 },
  foundingMeta: { color: "#E8CBBF", fontFamily: font.body, fontSize: 12, marginTop: 2 },
  intervalWrap: { alignItems: "center", marginBottom: spacing.lg },
  intervalRow: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radii.pill, padding: 4 },
  intervalTab: { paddingHorizontal: spacing.lg, height: 36, borderRadius: radii.pill, justifyContent: "center" },
  intervalTabActive: { backgroundColor: colors.surfaceInverse },
  intervalText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 13 },
  intervalTextActive: { color: colors.onSurfaceInverse },
  plan: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginBottom: spacing.lg },
  planActive: { borderColor: colors.brand },
  planUnlimited: { backgroundColor: colors.brandTertiary, borderColor: colors.brandTertiary },
  planName: { fontFamily: font.display, fontSize: 26, color: colors.onSurface },
  planPrice: { fontFamily: font.bodyBold, fontSize: 22, color: colors.brand },
  planPriceUnit: { fontFamily: font.body, fontSize: 12, color: colors.muted },
  planPriceHint: { fontFamily: font.body, fontSize: 10, color: colors.muted, marginTop: 2 },
  pickBtn: { marginTop: spacing.lg, backgroundColor: colors.surfaceInverse, padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  pickBtnBrand: { backgroundColor: colors.brand },
  pickBtnCurrent: { backgroundColor: colors.surfaceSecondary },
  pickText: { color: "#fff", fontFamily: font.bodyBold },
});
