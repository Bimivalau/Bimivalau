import { useCallback, useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, font, radii, spacing } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, Badge, LoadingState, BottomCTA } from "@/src/ui";

/**
 * /pro/founding — Founding Studio program. Braiders see:
 *   • spots remaining counter (X of 100)
 *   • promo terms (1 year of Unlimited free)
 *   • apply flow with an admin approval queue
 *   • status of their application (pending / approved / rejected)
 */
export default function FoundingProScreen() {
  const router = useRouter();
  const [state, setState] = useState<any>(null);
  const [intro, setIntro] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const s = await api("/founding-pro/status"); setState(s); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!state) return <LoadingState label="Loading Founding Pro…" />;

  const app = state.application;
  const status: string = app?.status || "none";
  const spotsRemaining: number = state.spots_remaining || 0;
  const isFounder = !!state.is_founding_pro;

  const apply = async () => {
    setBusy(true);
    try {
      await api("/founding-pro/apply", { method: "POST", body: JSON.stringify({ intro }) });
      await load();
      Alert.alert("Application submitted", "An admin will review your Studio shortly. You&apos;ll get an in-app notification either way.");
    } catch (e: any) {
      Alert.alert("We couldn&apos;t submit", e?.userMessage || e?.message || "Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <SafeScrollView>
      <View style={{ paddingTop: spacing.md }}>
        <Pressable testID="fp-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/pro/studio"))} hitSlop={12} style={{ minHeight: 44, width: 44, justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>

        <LinearGradient colors={["#F5C77E", "#B78141", "#8B5A2B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroBadge}><Feather name="award" size={22} color="#fff" /></View>
          <Text style={s.eyebrow}>FOUNDING STUDIO PROGRAM</Text>
          <ResponsiveHeading size={28} color="#fff" style={{ textAlign: "center", marginTop: 6 }}>
            Be one of the first 100 Studios
          </ResponsiveHeading>
          <Text style={s.heroSub} numberOfLines={4}>
            Founding Studios get a full year of Braider Unlimited on us — plus a permanent Founding Pro badge on your profile.
          </Text>
        </LinearGradient>

        {isFounder ? (
          <Card variant="outline" padding={spacing.lg} style={{ marginTop: spacing.lg, borderColor: colors.brand, backgroundColor: colors.brandTertiary }}>
            <Text style={s.approvedTitle}>You&apos;re a Founding Studio ✨</Text>
            <Text style={s.approvedMsg}>You have {state.founding_pro_days_left} days of Unlimited remaining. All premium features are yours.</Text>
          </Card>
        ) : (
          <>
            <View style={s.counterRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.counterLabel}>SPOTS REMAINING</Text>
                <Text style={s.counterValue}>{spotsRemaining}<Text style={s.counterOf}> / {state.slots}</Text></Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.counterLabel}>PROMO DURATION</Text>
                <Text style={s.counterValue}>1<Text style={s.counterOf}> year</Text></Text>
              </View>
            </View>

            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${Math.round((1 - spotsRemaining / (state.slots || 100)) * 100)}%` }]} />
            </View>

            <Text style={s.sectionTitle}>What you get</Text>
            {[
              "1 year of Braider Unlimited — zero charge",
              "Founding Pro badge permanently on your Studio",
              "Featured placement + homepage recommendations",
              "AI Business Coach (Preview access)",
              "40 portfolio photos",
              "Priority support and product roadmap input",
            ].map((b) => (
              <View key={b} style={s.benefit}>
                <View style={s.check}><Feather name="check" size={12} color="#fff" /></View>
                <Text style={s.benefitText} numberOfLines={3}>{b}</Text>
              </View>
            ))}

            <Text style={s.sectionTitle}>How to apply</Text>
            <Text style={s.applyMsg}>
              Complete your Studio setup (availability, at least 3 portfolio photos, bio + city).
              Submit a short intro so we can prioritise the best Studios first.
            </Text>

            {status === "pending" ? (
              <Card padding={spacing.md} style={{ marginTop: spacing.lg, backgroundColor: "#FFF6E6", borderColor: colors.warning, borderWidth: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <Feather name="clock" size={18} color={colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.applyPendingTitle}>Application under review</Text>
                    <Text style={s.applyPendingSub} numberOfLines={2}>We&apos;ll notify you as soon as an admin decides.</Text>
                  </View>
                </View>
              </Card>
            ) : status === "rejected" ? (
              <Card padding={spacing.md} style={{ marginTop: spacing.lg, backgroundColor: "#FFF3F2", borderColor: colors.error, borderWidth: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
                  <Feather name="alert-triangle" size={18} color={colors.error} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.bodyBold, color: colors.error, fontSize: 14 }}>Application not approved</Text>
                    <Text style={{ fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                      {app?.reason || "Please strengthen your Studio (portfolio, availability, bio) and reapply."}
                    </Text>
                    <Pressable testID="fp-reapply" onPress={() => setIntro("")} style={{ marginTop: spacing.md, alignSelf: "flex-start", paddingVertical: spacing.sm }}>
                      <Text style={{ fontFamily: font.bodyBold, color: colors.brand }}>Reapply</Text>
                    </Pressable>
                  </View>
                </View>
              </Card>
            ) : (
              <>
                <TextInput
                  testID="fp-intro"
                  value={intro}
                  onChangeText={setIntro}
                  placeholder="Tell us about your Studio (optional but recommended)"
                  placeholderTextColor={colors.muted}
                  multiline
                  style={s.textarea}
                  maxLength={500}
                  accessibilityLabel="Introduction about your Studio"
                />
                <BottomCTA testID="fp-apply" label={busy ? "Submitting…" : "Apply for Founding Studio"} onPress={apply} loading={busy} />
              </>
            )}
          </>
        )}
      </View>
    </SafeScrollView>
  );
}

const s = StyleSheet.create({
  hero: { padding: spacing.xl, borderRadius: 28, alignItems: "center", marginTop: spacing.md },
  heroBadge: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  eyebrow: { color: "rgba(255,255,255,0.85)", fontFamily: font.bodyBold, fontSize: 10, letterSpacing: 2.5 },
  heroSub: { color: "rgba(255,255,255,0.92)", fontFamily: font.body, fontSize: 13, textAlign: "center", lineHeight: 19, marginTop: spacing.md, flexShrink: 1 },
  counterRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.xl },
  counterLabel: { fontFamily: font.bodyBold, color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.5 },
  counterValue: { fontFamily: font.display, color: colors.onSurface, fontSize: 34, marginTop: 4 },
  counterOf: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 14 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.divider, marginTop: spacing.md, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.brand },
  sectionTitle: { fontFamily: font.bodyBold, color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, marginTop: spacing.xxl, marginBottom: spacing.md, textTransform: "uppercase" },
  benefit: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.sm },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: 2 },
  benefitText: { flex: 1, fontFamily: font.body, color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  applyMsg: { fontFamily: font.body, fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 19 },
  applyPendingTitle: { fontFamily: font.bodyBold, color: colors.warning, fontSize: 14 },
  applyPendingSub: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  approvedTitle: { fontFamily: font.bodyBold, color: colors.brand, fontSize: 16 },
  approvedMsg: { fontFamily: font.body, color: colors.onSurface, fontSize: 13, marginTop: spacing.xs, lineHeight: 18 },
  textarea: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, fontFamily: font.body, textAlignVertical: "top", color: colors.onSurface, marginTop: spacing.md },
});
