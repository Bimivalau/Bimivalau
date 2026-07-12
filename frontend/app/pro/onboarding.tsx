import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, BackHandler, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

// Pro Onboarding — only Weekly Availability is required to activate bookings.
// Portfolio, Verified Pro, License, Bio, Salon name are all OPTIONAL and never
// block the "Start Receiving Bookings" button.
//
// Navigation contract:
// - If backend says onboarding is already `completed`, this screen auto-redirects
//   to /pro/dashboard so returning users are never trapped here.
// - Back arrow + Android hardware Back always route to /pro/dashboard (never a
//   dead-end). If the user hasn't completed yet, dashboard's own guard will
//   bounce them back — but only ONCE per app session, giving them a clear path.
// - "Start Receiving Bookings" replaces the stack with /pro/dashboard on success.
export default function ProOnboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const redirectedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setLoadErr(null);
      const s = await api("/hairdressers/me/onboarding-status");
      setStatus(s);
      // Self-heal: if backend already says completed, don't trap the user here.
      if (s?.completed && !redirectedRef.current) {
        redirectedRef.current = true;
        router.replace("/pro/dashboard");
      }
    } catch (e: any) {
      setLoadErr(e?.message || "Could not load setup status. Check your connection and try again.");
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Android hardware Back — never dead-end; go to dashboard.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      router.replace("/pro/dashboard");
      return true;
    });
    return () => sub.remove();
  }, [router]);

  const finish = async () => {
    setErr(null); setBusy(true);
    try {
      const res = await api("/hairdressers/me/onboarding-complete", { method: "POST" });
      if (res?.completed !== false) {
        redirectedRef.current = true;
        router.replace("/pro/dashboard");
      }
    } catch (e: any) {
      setErr(e?.message || "Could not activate bookings. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!status && !loadErr) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (loadErr && !status) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl }}>
        <Feather name="wifi-off" size={28} color={colors.muted} />
        <Text style={{ fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 16, marginTop: spacing.md, textAlign: "center" }}>
          Couldn&apos;t load your setup
        </Text>
        <Text style={{ fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: spacing.xs, textAlign: "center", lineHeight: 18 }}>
          {loadErr}
        </Text>
        <Pressable testID="onb-retry" onPress={load} style={[s.finishBtn, { marginTop: spacing.lg, paddingHorizontal: spacing.xl }]}>
          <Text style={s.finishText}>Try again</Text>
        </Pressable>
        <Pressable testID="onb-skip-to-dash" onPress={() => router.replace("/pro/dashboard")} style={{ marginTop: spacing.md }}>
          <Text style={{ fontFamily: font.bodyMed, color: colors.brand, fontSize: 13 }}>Go to Dashboard</Text>
        </Pressable>
      </View>
    );
  }

  const canFinish = !!status?.has_availability;

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
          <Pressable
            testID="onb-back"
            hitSlop={12}
            onPress={() => router.replace("/pro/dashboard")}
          >
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={s.liveBadge}>
          <View style={s.dot} />
          <Text style={s.liveBadgeText}>YOUR STUDIO IS LIVE</Text>
        </View>
        <Text testID="onb-title" style={s.title}>Your Studio is live.</Text>
        <Text style={s.sub}>Customers can already discover your Studio. Complete these recommendations to attract even more bookings.</Text>

        {/* ---- REQUIRED ---- */}
        <Text style={s.sectionTitle}>Required</Text>
        <Pressable
          testID="onb-availability"
          onPress={() => router.push("/pro/availability")}
          style={[s.item, status.has_availability && s.itemDone]}
        >
          <View style={[s.check, status.has_availability && s.checkDone]}>
            {status.has_availability ? <Feather name="check" size={14} color="#fff" /> : <Feather name="clock" size={14} color={colors.brand} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.itemTitle}>Set Weekly Availability</Text>
            <Text style={s.itemDesc}>
              {status.has_availability
                ? "You're accepting bookings on your weekly hours."
                : "Tell customers when you're available so they can book you."}
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.muted} />
        </Pressable>

        {/* ---- RECOMMENDED ---- */}
        <Text style={s.sectionTitle}>Recommended</Text>
        <Pressable testID="onb-portfolio" onPress={() => router.push("/pro/portfolio")} style={s.item}>
          <View style={s.bullet}>
            {status.has_portfolio
              ? <Feather name="check" size={14} color={colors.success} />
              : <Feather name="image" size={14} color={colors.brand} />}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={s.itemTitle}>Showcase Your Work</Text>
              <Text style={s.optionalTag}>OPTIONAL</Text>
            </View>
            <Text style={s.itemDesc}>Upload portfolio photos — improves customer trust and ranking.</Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.muted} />
        </Pressable>

        <Pressable testID="onb-verify" onPress={() => router.push("/pro/verification")} style={s.item}>
          <View style={s.bullet}>
            <Feather name="award" size={14} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={s.itemTitle}>Apply for Verified Pro</Text>
              <Text style={s.optionalTag}>OPTIONAL</Text>
            </View>
            <Text style={s.itemDesc}>Submit ID or license — earns the Verified badge and stronger visibility.</Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.muted} />
        </Pressable>

        {err && <Text testID="onb-err" style={{ color: colors.error, marginTop: spacing.md, fontFamily: font.body }}>{err}</Text>}

        <Pressable
          testID="onb-finish"
          disabled={!canFinish || busy}
          onPress={finish}
          style={[s.finishBtn, (!canFinish || busy) && s.finishBtnDisabled]}
        >
          <Text style={[s.finishText, (!canFinish || busy) && { color: colors.muted }]}>
            {busy ? "Finishing…" : "Start Receiving Bookings"}
          </Text>
        </Pressable>
        {!canFinish && (
          <Text testID="onb-hint" style={s.hint}>Set your weekly hours to start receiving bookings.</Text>
        )}
        {canFinish && (
          <Text testID="onb-recs" style={s.recs}>
            You&apos;re all set. Add portfolio photos or apply for Verified Pro anytime from the <Text style={{ fontFamily: font.bodyBold, color: colors.brand }}>My Studio</Text> tab.
          </Text>
        )}

        {/* Escape hatch: always let the user go to the dashboard, even mid-setup. */}
        <Pressable
          testID="onb-skip"
          onPress={() => router.replace("/pro/dashboard")}
          style={{ marginTop: spacing.lg, alignSelf: "center", paddingVertical: spacing.sm }}
        >
          <Text style={{ fontFamily: font.bodyMed, color: colors.brand, fontSize: 13 }}>
            Skip for now — go to Dashboard
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  liveBadge: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.brandTertiary, borderRadius: radii.pill },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveBadgeText: { fontFamily: font.bodyBold, color: colors.brand, fontSize: 10, letterSpacing: 1.5 },
  title: { fontFamily: font.display, fontSize: 32, lineHeight: 38, color: colors.onSurface, marginTop: spacing.md },
  sub: { fontFamily: font.body, color: colors.onSurfaceTertiary, marginTop: spacing.md, fontSize: 14, lineHeight: 20 },
  sectionTitle: { fontFamily: font.bodyBold, color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, marginTop: spacing.xl, marginBottom: spacing.sm },
  item: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginBottom: spacing.sm },
  itemDone: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  check: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.brand, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  checkDone: { backgroundColor: colors.success, borderColor: colors.success },
  bullet: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  itemTitle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 15 },
  itemDesc: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, lineHeight: 17 },
  optionalTag: { fontFamily: font.bodyMed, color: colors.onSurfaceTertiary, fontSize: 9, letterSpacing: 1.5, paddingHorizontal: spacing.xs, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.surfaceSecondary },
  finishBtn: { backgroundColor: colors.brand, padding: spacing.lg, borderRadius: radii.md, alignItems: "center", marginTop: spacing.xxl },
  finishBtnDisabled: { backgroundColor: colors.surfaceSecondary },
  finishText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 15 },
  hint: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: 13, textAlign: "center", marginTop: spacing.md },
  recs: { color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 12, textAlign: "center", marginTop: spacing.md, lineHeight: 18 },
});
