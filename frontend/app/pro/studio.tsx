import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, font, radii, spacing } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, Badge, LoadingState } from "@/src/ui";

/**
 * Pro Profile tab — the permanent home for pros' account settings.
 * v1 scope: no subscription, no growth, no business score. Just the essentials.
 */
export default function ProProfile() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const [hd, setHd] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try { const me = await api("/hairdressers/me"); setHd(me); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user) return <LoadingState label="Loading…" />;

  const name = user.name || "You";
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "—";
  const verified = hd?.verification_status === "approved";

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api("/auth/me", { method: "DELETE" });
      await signOut();
      router.replace("/welcome");
    } catch (e: any) {
      Alert.alert("Couldn't delete", e?.userMessage || "Please try again.");
    } finally { setDeleting(false); }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete your account?",
      "This permanently removes your Studio, portfolio, bookings and reviews. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete permanently", style: "destructive", onPress: doDelete },
      ],
    );
  };

  const rows: { icon: any; label: string; testID: string; onPress: () => void }[] = [
    { icon: "user", label: "Studio Information", testID: "studio-info", onPress: () => router.push("/pro/studio-info") },
    { icon: "clock", label: "Weekly Availability", testID: "studio-availability", onPress: () => router.push("/pro/availability") },
    { icon: "image", label: "Portfolio", testID: "studio-portfolio", onPress: () => router.push("/pro/portfolio") },
    { icon: "tag", label: "Services & Pricing", testID: "studio-services", onPress: () => router.push("/pro/services") },
    { icon: "shield", label: "Verification", testID: "studio-verification", onPress: () => router.push("/pro/verification") },
    { icon: "bell", label: "Notifications", testID: "menu-notifications", onPress: () => router.push("/notifications") },
    { icon: "shield", label: "Safety & Community Guidelines", testID: "menu-safety", onPress: () => router.push("/safety") },
  ];

  return (
    <SafeScrollView>
      <View style={{ paddingTop: spacing.md }}>
        <ResponsiveHeading size={30}>Profile</ResponsiveHeading>

        <Card padding={spacing.lg} style={s.card}>
          <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>{name}</Text>
            <Text style={s.email} numberOfLines={1}>{user.email}</Text>
            <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: 6, flexWrap: "wrap" }}>
              <Badge label={`JOINED ${joined.toUpperCase()}`} tone="neutral" />
              {verified && <Badge label="VERIFIED PRO" tone="success" />}
            </View>
          </View>
        </Card>

        <View style={{ marginTop: spacing.xl }}>
          {rows.map((r, idx) => (
            <Pressable
              key={r.label}
              testID={r.testID}
              onPress={r.onPress}
              style={[s.row, idx === rows.length - 1 && { borderBottomWidth: 0 }]}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              android_ripple={{ color: "rgba(0,0,0,0.04)" }}
            >
              <View style={s.rowIcon}><Feather name={r.icon} size={16} color={colors.brand} /></View>
              <Text style={s.rowText} numberOfLines={1}>{r.label}</Text>
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        <Pressable testID="signout-btn" onPress={async () => { await signOut(); router.replace("/welcome"); }} style={s.signOut} accessibilityRole="button">
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>

        <Pressable testID="delete-account-btn" onPress={confirmDelete} disabled={deleting} style={s.deleteBtn} accessibilityRole="button">
          <Text style={s.deleteText}>{deleting ? "Deleting…" : "Delete account"}</Text>
        </Pressable>
      </View>
    </SafeScrollView>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: "row", gap: spacing.md, alignItems: "center", marginTop: spacing.lg },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontFamily: font.display, fontSize: 26 },
  name: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  email: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, borderBottomWidth: 1, borderColor: colors.divider, paddingVertical: spacing.sm },
  rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 15, flexShrink: 1 },
  signOut: { marginTop: spacing.xxl, minHeight: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong },
  signOutText: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 14 },
  deleteBtn: { marginTop: spacing.md, minHeight: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.error },
  deleteText: { fontFamily: font.bodyBold, color: colors.error, fontSize: 14 },
});
