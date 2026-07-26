import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, Badge, LoadingState } from "@/src/ui";

/**
 * Customer profile / account tab. Braiders never see this — they use their
 * own /pro tabs. v1 scope: no subscription, no collections, no inspiration.
 */
export default function Profile() {
  const { user, loading, signOut } = useSession();
  const router = useRouter();
  const { t } = useTranslation("profile");
  const { t: tCommon } = useTranslation("common");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <LoadingState label={t("tab.loading")} />;

  const name = user.name || t("tab.you_fallback");
  const email = user.email || "";
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  // Joined date — never expose phone numbers.
  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "—";

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api("/auth/me", { method: "DELETE" });
      await signOut();
      router.replace("/welcome");
    } catch (e: any) {
      Alert.alert(t("tab.delete_error_title"), e?.userMessage || t("tab.delete_error_default"));
    } finally { setDeleting(false); }
  };

  const confirmDelete = () => {
    Alert.alert(
      t("tab.delete_confirm_title"),
      t("tab.delete_confirm_message"),
      [
        { text: tCommon("buttons.cancel"), style: "cancel" },
        { text: tCommon("buttons.delete_permanently"), style: "destructive", onPress: doDelete },
      ],
    );
  };

  const items: { icon: any; label: string; testID: string; onPress: () => void }[] = [
    { icon: "bell", label: t("tab.menu.notifications"), testID: "menu-notifications", onPress: () => router.push("/notifications") },
    { icon: "shield", label: t("tab.menu.safety"), testID: "menu-safety", onPress: () => router.push("/safety") },
    { icon: "settings", label: t("tab.menu.settings"), testID: "menu-settings", onPress: () => router.push("/settings") },
    { icon: "help-circle", label: t("tab.menu.help"), testID: "menu-help", onPress: () => Alert.alert(t("tab.support_alert_title"), t("tab.support_alert_message")) },
  ];

  return (
    <SafeScrollView testID="profile-screen">
      <View style={{ paddingTop: spacing.md }}>
        <ResponsiveHeading size={30}>{t("tab.title")}</ResponsiveHeading>

        <Card padding={spacing.lg} style={s.card}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text testID="profile-name" style={s.name} numberOfLines={1}>{name}</Text>
            <Text testID="profile-email" style={s.email} numberOfLines={1}>{email}</Text>
            <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: 6, flexWrap: "wrap" }}>
              <Badge label={t("tab.joined_badge", { date: joined.toUpperCase() })} tone="neutral" />
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
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        <Pressable
          testID="signout-btn"
          onPress={async () => { await signOut(); router.replace("/welcome"); }}
          style={s.signOut}
          accessibilityRole="button"
          accessibilityLabel={tCommon("buttons.sign_out")}
        >
          <Text style={s.signOutText}>{tCommon("buttons.sign_out")}</Text>
        </Pressable>

        <Pressable
          testID="delete-account-btn"
          onPress={confirmDelete}
          disabled={deleting}
          style={s.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel={t("tab.delete_account")}
        >
          <Text style={s.deleteText}>{deleting ? tCommon("states.deleting") : t("tab.delete_account")}</Text>
        </Pressable>

        <Text style={s.legal}>{t("tab.footer")}</Text>
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
  legal: { textAlign: "center", marginTop: spacing.xxl, fontFamily: font.body, fontSize: 11, color: colors.muted },
});
