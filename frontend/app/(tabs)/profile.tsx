import { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, Badge, LoadingState } from "@/src/ui";

/**
 * Customer profile / account tab. Braiders never see this — they use My Studio.
 */
export default function Profile() {
  const { user, loading, signOut } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <LoadingState label="Loading your account…" />;

  const name = user.name || "You";
  const email = user.email || "";
  const role = (user.role || "customer").toString();
  const plan = (user.plan || "free").toString();
  const initial = (name.trim().charAt(0) || "?").toUpperCase();

  const items: { icon: any; label: string; testID: string; onPress: () => void; badge?: string }[] = [
    { icon: "bookmark", label: "My Saved Styles", testID: "menu-saves", onPress: () => router.push("/collections") },
    { icon: "image", label: "My Inspiration Photos", testID: "menu-inspiration", onPress: () => router.push("/inspiration") },
    { icon: "heart", label: "Favorite Braiders", testID: "menu-favorites", onPress: () => router.push("/favorites") },
    {
      icon: "star",
      label: "Subscription",
      testID: "menu-subscription",
      onPress: () => router.push("/subscription"),
      badge: plan === "unlimited" ? "UNLIMITED" : "FREE",
    },
    { icon: "bell", label: "Notifications", testID: "menu-notifications", onPress: () => router.push("/notifications") },
  ];

  return (
    <SafeScrollView testID="profile-screen">
      <View style={{ paddingTop: spacing.md }}>
        <ResponsiveHeading size={30}>Profile</ResponsiveHeading>

        <Card padding={spacing.lg} style={s.card}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text testID="profile-name" style={s.name} numberOfLines={1}>{name}</Text>
            <Text testID="profile-email" style={s.email} numberOfLines={1}>{email}</Text>
            <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: 6, flexWrap: "wrap" }}>
              <Badge label={role.toUpperCase()} tone="brand" />
              <Badge label={plan.toUpperCase()} tone={plan === "unlimited" ? "success" : "neutral"} />
            </View>
          </View>
        </Card>

        <View style={{ marginTop: spacing.xl }}>
          {items.map((i, idx) => (
            <Pressable
              key={i.label}
              testID={i.testID}
              onPress={i.onPress}
              style={[s.row, idx === items.length - 1 && { borderBottomWidth: 0 }]}
              accessibilityRole="button"
              accessibilityLabel={i.label}
              android_ripple={{ color: "rgba(0,0,0,0.04)" }}
            >
              <View style={s.rowIcon}><Feather name={i.icon} size={16} color={colors.brand} /></View>
              <Text style={s.rowText} numberOfLines={1}>{i.label}</Text>
              {i.badge ? <Badge label={i.badge} tone="brand" variant="soft" /> : null}
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        <Pressable
          testID="signout-btn"
          onPress={async () => { await signOut(); router.replace("/welcome"); }}
          style={s.signOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>

        <Text style={s.legal}>BraidsCommunity · Built for braid lovers.</Text>
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
  signOut: { marginTop: spacing.xxl, minHeight: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.error },
  signOutText: { fontFamily: font.bodyBold, color: colors.error, fontSize: 14 },
  legal: { textAlign: "center", marginTop: spacing.xxl, fontFamily: font.body, fontSize: 11, color: colors.muted },
});
