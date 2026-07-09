import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function ProDashboard() {
  const { user, signOut } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [d, ver] = await Promise.all([api("/hairdressers/me/dashboard"), api("/hairdressers/me/verification")]);
    setData(d);
    setVerification(ver);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />;
  const upcoming = data?.upcoming || [];
  const today = new Date().toDateString();
  const todays = upcoming.filter((b: any) => new Date(b.appointment_datetime).toDateString() === today);

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl }}>
        <Text style={s.eyebrow}>PRO WORKSPACE</Text>
        <Text style={s.title}>Hello, {user?.name?.split(" ")[0]}.</Text>
        <Text style={s.sub}>{todays.length > 0 ? `${todays.length} appointment${todays.length > 1 ? "s" : ""} today.` : "No appointments today."}</Text>

        {verification && verification.status !== "approved" && (
          <Pressable
            testID="ver-banner"
            onPress={() => router.push("/pro/verification")}
            style={[s.verBanner, verification.status === "rejected" && s.verBannerRejected]}
          >
            <Feather
              name={verification.status === "rejected" ? "alert-triangle" : "alert-circle"}
              size={20}
              color={verification.status === "rejected" ? colors.error : colors.warning}
            />
            <View style={{ flex: 1 }}>
              <Text style={[s.verBannerTitle, verification.status === "rejected" && { color: colors.error }]}>
                {verification.status === "rejected"
                  ? "Action required — application rejected"
                  : verification.submitted_at
                    ? "Verification under review"
                    : "Verification required"}
              </Text>
              <Text style={s.verBannerMsg}>
                {verification.status === "rejected"
                  ? "Tap to see the admin's feedback and resubmit."
                  : verification.submitted_at
                    ? "Typically completed within 3 business days. Your profile is hidden from customer search until approved."
                    : "Submit your ID or license to appear in customer search."}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        )}

        <View style={s.actions}>
          <Pressable testID="pro-availability" onPress={() => router.push("/pro/availability")} style={s.actionCard}>
            <Feather name="clock" size={22} color={colors.brand} />
            <Text style={s.actionText}>Availability</Text>
          </Pressable>
          <Pressable testID="pro-portfolio" onPress={() => router.push("/pro/portfolio")} style={s.actionCard}>
            <Feather name="image" size={22} color={colors.brand} />
            <Text style={s.actionText}>Portfolio</Text>
          </Pressable>
          <Pressable testID="pro-verification" onPress={() => router.push("/pro/verification")} style={s.actionCard}>
            <Feather name="shield" size={22} color={colors.brand} />
            <Text style={s.actionText}>Verify</Text>
          </Pressable>
        </View>

        <Text style={s.section}>Today's schedule</Text>
        {todays.length === 0 && <Text style={{ color: colors.muted, fontFamily: font.body }}>Free day. Enjoy it.</Text>}
        {todays.map((b: any) => (
          <Pressable key={b.id} testID={`pro-booking-${b.id}`} onPress={() => router.push(`/booking/${b.id}`)} style={s.appt}>
            <Text style={s.apptTime}>{new Date(b.appointment_datetime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.apptStyle}>{b.hairstyle_name}</Text>
              <Text style={s.apptCust}>{b.customer_name}</Text>
            </View>
            <Text style={s.apptStatus}>{b.status.replace("_", " ")}</Text>
          </Pressable>
        ))}

        <Text style={s.section}>Upcoming</Text>
        {upcoming.filter((b: any) => new Date(b.appointment_datetime).toDateString() !== today).slice(0, 5).map((b: any) => (
          <Pressable key={b.id} onPress={() => router.push(`/booking/${b.id}`)} style={s.appt}>
            <Text style={s.apptTime}>{new Date(b.appointment_datetime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.apptStyle}>{b.hairstyle_name}</Text>
              <Text style={s.apptCust}>{b.customer_name}</Text>
            </View>
          </Pressable>
        ))}

        <Pressable testID="pro-signout" onPress={signOut} style={s.signOut}>
          <Text style={{ color: colors.error, fontFamily: font.bodyBold }}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  eyebrow: { color: colors.brand, letterSpacing: 3, fontSize: 10, fontFamily: font.bodyMed },
  title: { fontFamily: font.display, fontSize: 34, color: colors.onSurface, marginTop: spacing.sm },
  sub: { fontFamily: font.body, color: colors.onSurfaceTertiary, marginTop: spacing.xs, marginBottom: spacing.xl },
  actions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  actionCard: { flex: 1, aspectRatio: 1, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, alignItems: "flex-start", justifyContent: "space-between" },
  actionText: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 14 },
  section: { fontFamily: font.display, fontSize: 22, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.md },
  appt: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderColor: colors.divider },
  apptTime: { fontFamily: font.display, fontSize: 18, color: colors.brand, width: 70 },
  apptStyle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 15 },
  apptCust: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13 },
  apptStatus: { fontFamily: font.bodyMed, color: colors.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 },
  signOut: { marginTop: spacing.xxl, padding: spacing.lg, alignItems: "center", borderWidth: 1, borderColor: colors.error, borderRadius: radii.md },
  verBanner: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.warning, backgroundColor: "#FFF6E6", borderRadius: radii.md, marginBottom: spacing.lg },
  verBannerRejected: { borderColor: colors.error, backgroundColor: "#FFF3F2" },
  verBannerTitle: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 14 },
  verBannerMsg: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
});
