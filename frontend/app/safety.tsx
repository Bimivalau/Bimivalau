import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, font } from "@/src/theme";
import { SafeScrollView, ResponsiveHeading, Card } from "@/src/ui";

/**
 * One-time safety info screen. Shown before a customer's first booking and
 * before a braider's first accepted booking. Content is placeholder — replace
 * with legal copy provided later.
 */
export default function SafetyScreen() {
  const router = useRouter();
  const { t } = useTranslation("safety");
  const { t: tCommon } = useTranslation("common");

  return (
    <SafeScrollView>
      <View style={{ paddingTop: spacing.md }}>
        <Pressable
          testID="safety-back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          hitSlop={12}
          style={{ minHeight: 44, width: 44, justifyContent: "center" }}
          accessibilityRole="button"
          accessibilityLabel={tCommon("buttons.back")}
        >
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>

        <ResponsiveHeading size={28} style={{ marginTop: spacing.sm }}>{t("title")}</ResponsiveHeading>
        <Text style={s.sub}>{t("subtitle")}</Text>

        <Card padding={spacing.lg} style={{ marginTop: spacing.lg, gap: spacing.md }}>
          <SafetyRow icon="user-check" title={t("rows.verified_studios.title")} desc={t("rows.verified_studios.desc")} />
          <SafetyRow icon="phone-off" title={t("rows.phone_privacy.title")} desc={t("rows.phone_privacy.desc")} />
          <SafetyRow icon="alert-circle" title={t("rows.report.title")} desc={t("rows.report.desc")} />
          <SafetyRow icon="dollar-sign" title={t("rows.pay_at_counter.title")} desc={t("rows.pay_at_counter.desc")} />
          <SafetyRow icon="map-pin" title={t("rows.meet_safely.title")} desc={t("rows.meet_safely.desc")} />
        </Card>

        <Text style={s.legal}>
          {t("legal")}
        </Text>

        <Pressable
          testID="safety-ack"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={s.btn}
          accessibilityRole="button"
          accessibilityLabel={t("acknowledge")}
        >
          <Text style={s.btnText}>{t("acknowledge")}</Text>
        </Pressable>
      </View>
    </SafeScrollView>
  );
}

function SafetyRow({ icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start" }}>
      <View style={s.icon}><Feather name={icon} size={16} color={colors.brand} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.desc} numberOfLines={4}>{desc}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sub: { color: colors.onSurfaceTertiary, fontFamily: font.body, fontSize: 13, marginTop: spacing.sm, lineHeight: 18 },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: font.bodyBold, color: colors.onSurface, fontSize: 14 },
  desc: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 4, lineHeight: 17 },
  legal: { textAlign: "center", marginTop: spacing.xl, fontFamily: font.body, color: colors.muted, fontSize: 11, lineHeight: 16 },
  btn: { marginTop: spacing.xxl, minHeight: 52, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 15 },
});
