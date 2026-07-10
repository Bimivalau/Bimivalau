import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function ProOnboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await api("/hairdressers/me/onboarding-status");
    setStatus(s);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const finish = async () => {
    setErr(null); setBusy(true);
    try {
      await api("/hairdressers/me/onboarding-complete", { method: "POST" });
      router.replace("/pro/dashboard");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (!status) return <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brand} /></View>;

  const steps: { key: string; testID: string; title: string; desc: string; done: boolean; onPress: () => void; required: boolean }[] = [
    { key: "avail", testID: "onb-availability", title: "Set your weekly hours", desc: "Tell customers when you're available.", done: status.has_availability, onPress: () => router.push("/pro/availability"), required: true },
    { key: "port", testID: "onb-portfolio", title: "Upload your first photos", desc: "At least one photo helps customers trust you.", done: status.has_portfolio, onPress: () => router.push("/pro/portfolio"), required: false },
    { key: "verify", testID: "onb-verify", title: "Earn the Verified Pro badge", desc: "Optional — submit ID/license to build extra trust.", done: false, onPress: () => router.push("/pro/verification"), required: false },
  ];

  const canFinish = status.has_specialty && status.has_availability;

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl }}>
        <Text style={s.eyebrow}>WELCOME TO BRAIDSCOMMUNITY</Text>
        <Text testID="onb-title" style={s.title}>Let's set up{"\n"}your chair, {user?.name?.split(" ")[0]}.</Text>
        <Text style={s.sub}>You're live in customer search already — finish these to unlock bookings.</Text>

        {steps.map((st, i) => (
          <Pressable key={st.key} testID={st.testID} onPress={st.onPress} style={s.step}>
            <View style={[s.stepBadge, st.done && s.stepBadgeDone]}>
              {st.done ? <Feather name="check" size={16} color="#fff" /> : <Text style={s.stepBadgeNum}>{i + 1}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={s.stepTitle}>{st.title}</Text>
                {st.required && !st.done && <Text style={s.required}>REQUIRED</Text>}
              </View>
              <Text style={s.stepDesc}>{st.desc}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        ))}

        {err && <Text testID="onb-err" style={{ color: colors.error, marginTop: spacing.md, fontFamily: font.body }}>{err}</Text>}
        <Pressable testID="onb-finish" disabled={!canFinish || busy} onPress={finish} style={[s.finishBtn, (!canFinish || busy) && { opacity: 0.4 }]}>
          <Text style={s.finishText}>{busy ? "Finishing…" : "Finish setup — take me to my chair"}</Text>
        </Pressable>
        {!canFinish && (
          <Text style={{ color: colors.muted, fontFamily: font.body, fontSize: 12, textAlign: "center", marginTop: spacing.sm }}>
            Availability is required to receive bookings.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  eyebrow: { color: colors.brand, letterSpacing: 3, fontSize: 10, fontFamily: font.bodyMed },
  title: { fontFamily: font.display, fontSize: 32, lineHeight: 38, color: colors.onSurface, marginTop: spacing.sm },
  sub: { fontFamily: font.body, color: colors.onSurfaceTertiary, marginTop: spacing.md, marginBottom: spacing.xl },
  step: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginBottom: spacing.sm },
  stepBadge: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  stepBadgeDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepBadgeNum: { fontFamily: font.bodyBold, color: colors.onSurface },
  stepTitle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 15 },
  stepDesc: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  required: { fontFamily: font.bodyBold, color: colors.warning, fontSize: 9, letterSpacing: 1 },
  finishBtn: { backgroundColor: colors.brand, padding: spacing.lg, borderRadius: radii.md, alignItems: "center", marginTop: spacing.xl },
  finishText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 15 },
});
