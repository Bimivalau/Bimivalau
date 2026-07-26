import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card, EmptyState, LoadingState, ErrorState } from "@/src/ui";

/**
 * In-app notifications list. No push notifications yet — this only shows
 * server-side notifications (booking updates, reminders, admin actions).
 */
export default function Notifications() {
  const router = useRouter();
  const { t } = useTranslation("notifications");
  const { t: tCommon } = useTranslation("common");
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const d = await api("/notifications/me");
      setItems(Array.isArray(d) ? d : []);
    } catch (e: any) {
      setErr(e?.userMessage || t("load_error"));
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (err && !items) return <ErrorState message={err} onRetry={load} />;
  if (!items) return <LoadingState label={t("loading")} />;

  return (
    <SafeScrollView>
      <View style={{ paddingTop: spacing.md }}>
        <View style={s.headerRow}>
          <Pressable
            testID="notif-back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            hitSlop={12}
            style={s.backBtn}
            accessibilityRole="button"
            accessibilityLabel={tCommon("buttons.back")}
          >
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
        <ResponsiveHeading size={30} style={{ marginTop: spacing.sm }}>{t("title")}</ResponsiveHeading>
        <Text style={s.sub}>{t("subtitle")}</Text>

        {items.length === 0 ? (
          <View style={{ marginTop: spacing.xxxl }}>
            <EmptyState
              icon="bell"
              title={t("empty_title")}
              message={t("empty_message")}
            />
          </View>
        ) : (
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            {items.map((n: any) => (
              <Card key={n.id} padding={spacing.md}>
                <View style={s.item}>
                  <View style={s.iconWrap}>
                    <Feather name="bell" size={14} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.msg}>{n.message}</Text>
                    <Text style={s.date}>{new Date(n.created_at).toLocaleString()}</Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>
    </SafeScrollView>
  );
}

const s = StyleSheet.create({
  headerRow: { minHeight: 44, justifyContent: "center" },
  backBtn: { minHeight: 44, width: 44, alignItems: "flex-start", justifyContent: "center" },
  sub: { color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 13, marginTop: spacing.sm, lineHeight: 18 },
  item: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  iconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  msg: { fontFamily: font.body, color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  date: { fontFamily: font.body, color: colors.muted, fontSize: 11, marginTop: 4 },
});
