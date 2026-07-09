import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function Profile() {
  const { user, signOut } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  if (!user) return null;

  const items: { icon: any; label: string; testID: string; onPress: () => void; badge?: string }[] = [
    { icon: "heart", label: "Favorites", testID: "menu-favorites", onPress: () => router.push("/favorites") },
    { icon: "star", label: "Subscription", testID: "menu-subscription", onPress: () => router.push("/subscription"), badge: user.plan === "unlimited" ? "Unlimited" : "Standard" },
    { icon: "bell", label: "Notifications", testID: "menu-notifications", onPress: () => router.push("/notifications") },
    { icon: "briefcase", label: "Switch to Pro workspace", testID: "menu-pro", onPress: () => router.push("/pro/dashboard") },
  ];

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl }}>
        <Text style={s.header}>Profile</Text>
        <View style={s.card}>
          <View style={s.avatar}><Text style={s.avatarText}>{user.name?.charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{user.name}</Text>
            <Text style={s.email}>{user.email}</Text>
            <Text style={s.role}>{user.role.toUpperCase()} · {user.plan.toUpperCase()}</Text>
          </View>
        </View>
        <View style={{ marginTop: spacing.xl }}>
          {items.map(i => (
            <Pressable key={i.label} testID={i.testID} onPress={i.onPress} style={s.row}>
              <Feather name={i.icon} size={20} color={colors.onSurface} />
              <Text style={s.rowText}>{i.label}</Text>
              {i.badge && <Text style={s.badge}>{i.badge}</Text>}
              <Feather name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </View>
        <Pressable testID="signout-btn" onPress={signOut} style={s.signOut}>
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: { fontFamily: font.display, fontSize: 32, color: colors.onSurface, marginBottom: spacing.lg },
  card: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, alignItems: "center" },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontFamily: font.display, fontSize: 26 },
  name: { fontFamily: font.display, fontSize: 22, color: colors.onSurface },
  email: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 13 },
  role: { fontFamily: font.bodyMed, color: colors.brand, fontSize: 11, letterSpacing: 2, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: 1, borderColor: colors.divider },
  rowText: { flex: 1, fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 15 },
  badge: { fontFamily: font.bodyBold, color: colors.brand, fontSize: 11, letterSpacing: 1, marginRight: spacing.sm },
  signOut: { marginTop: spacing.xxl, padding: spacing.lg, alignItems: "center", borderWidth: 1, borderColor: colors.error, borderRadius: radii.md },
  signOutText: { fontFamily: font.bodyBold, color: colors.error },
});
