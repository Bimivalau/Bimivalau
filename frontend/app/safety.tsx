import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
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

  return (
    <SafeScrollView>
      <View style={{ paddingTop: spacing.md }}>
        <Pressable
          testID="safety-back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          hitSlop={12}
          style={{ minHeight: 44, width: 44, justifyContent: "center" }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>

        <ResponsiveHeading size={28} style={{ marginTop: spacing.sm }}>Safety on BraidsCommunity</ResponsiveHeading>
        <Text style={s.sub}>Community guidelines for a safe experience for everyone.</Text>

        <Card padding={spacing.lg} style={{ marginTop: spacing.lg, gap: spacing.md }}>
          <SafetyRow icon="user-check" title="Verified Studios" desc="Look for the Verified Pro badge, but every Studio is welcome to serve customers." />
          <SafetyRow icon="phone-off" title="Phone numbers stay private" desc="We never share your number with the other party until you agree." />
          <SafetyRow icon="alert-circle" title="Report anything that feels wrong" desc="Use the Report button on any profile. Three flags from different braiders restricts a customer's ability to book." />
          <SafetyRow icon="dollar-sign" title="Pay at the counter" desc="Payment happens in person between you and the braider. BraidsCommunity does not process payments." />
          <SafetyRow icon="map-pin" title="Meet in professional locations" desc="Braiders should list a Studio address or agree on a safe public location before the appointment." />
        </Card>

        <Text style={s.legal}>
          By using BraidsCommunity, you agree to treat every member with respect. Discrimination, harassment, and unsafe behavior are grounds for immediate removal.
        </Text>

        <Pressable
          testID="safety-ack"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={s.btn}
          accessibilityRole="button"
          accessibilityLabel="Got it"
        >
          <Text style={s.btnText}>Got it</Text>
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
