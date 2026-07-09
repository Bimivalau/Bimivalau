import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

export default function Subscription() {
  const { user, setPlan } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  if (!user) return null;
  const plans: { key: "standard" | "unlimited"; name: string; price: string; perks: string[] }[] = user.role === "customer"
    ? [
      { key: "standard", name: "Standard", price: "Free", perks: ["Top 3 stylists per style", "Blurred locations", "Basic search"] },
      { key: "unlimited", name: "Unlimited", price: "$8/mo", perks: ["All stylists, unlocked", "Exact addresses", "Unlimited searches", "Priority booking"] },
    ]
    : [
      { key: "standard", name: "Standard", price: "Free", perks: ["Basic listing", "Up to 10 portfolio photos"] },
      { key: "unlimited", name: "Unlimited", price: "$19/mo", perks: ["Priority placement", "Unlimited portfolio uploads", "Featured badge"] },
    ];
  const choose = async (p: "standard" | "unlimited") => { await setPlan(p); router.back(); };

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Pressable testID="sub-back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.title}>Choose your plan</Text>
        <Text style={s.sub}>Toggle plans — MOCKED for demo (no charge).</Text>
        {plans.map(p => (
          <View key={p.key} style={[s.card, user.plan === p.key && s.cardActive]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
              <Text style={s.planName}>{p.name}</Text>
              <Text style={s.price}>{p.price}</Text>
            </View>
            {p.perks.map(pk => (
              <View key={pk} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.sm }}>
                <Feather name="check" size={16} color={colors.brand} />
                <Text style={s.perk}>{pk}</Text>
              </View>
            ))}
            <Pressable testID={`select-${p.key}`} onPress={() => choose(p.key)} style={[s.btn, user.plan === p.key && s.btnCurrent]}>
              <Text style={[s.btnText, user.plan === p.key && { color: colors.onSurface }]}>{user.plan === p.key ? "Current plan" : `Switch to ${p.name}`}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 34, color: colors.onSurface, marginTop: spacing.lg },
  sub: { fontFamily: font.body, color: colors.muted, marginBottom: spacing.xl },
  card: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginBottom: spacing.lg },
  cardActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  planName: { fontFamily: font.display, fontSize: 28, color: colors.onSurface },
  price: { fontFamily: font.bodyBold, fontSize: 20, color: colors.brand },
  perk: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 14 },
  btn: { marginTop: spacing.lg, backgroundColor: colors.brand, padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  btnCurrent: { backgroundColor: colors.surfaceSecondary },
  btnText: { color: "#fff", fontFamily: font.bodyBold },
});
