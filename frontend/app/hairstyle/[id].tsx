import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";

export default function HairstyleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [style, setStyle] = useState<any>(null);
  const [hds, setHds] = useState<any[]>([]);
  const [gated, setGated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [st, res] = await Promise.all([api(`/hairstyles/${id}`), api(`/hairstyles/${id}/hairdressers`)]);
      setStyle(st); setHds(res.results); setGated(res.gated); setLoading(false);
    })();
  }, [id]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />;
  if (!style) return null;

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={{ height: 460 }}>
        <Image source={{ uri: style.cover_photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={["rgba(0,0,0,0.35)", "transparent", "rgba(0,0,0,0.75)"]} style={StyleSheet.absoluteFill} />
        <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flexDirection: "row" }}>
          <Pressable testID="back" onPress={() => router.back()} style={s.iconBtn}><Feather name="arrow-left" size={22} color="#fff" /></Pressable>
        </View>
        <View style={{ position: "absolute", left: spacing.xl, right: spacing.xl, bottom: spacing.xl }}>
          <Text style={s.cat}>{style.category.toUpperCase()}</Text>
          <Text testID="style-name" style={s.title}>{style.name}</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.xl }}>
          <View><Text style={s.metaLabel}>FROM</Text><Text style={s.metaValue}>${style.avg_price}</Text></View>
          <View><Text style={s.metaLabel}>DURATION</Text><Text style={s.metaValue}>{Math.round(style.avg_duration_min / 60)}h</Text></View>
        </View>
        <Text style={s.desc}>{style.description}</Text>
        <Text style={s.section}>Stylists who braid this</Text>
        {gated && (
          <View testID="gated-banner" style={s.gated}>
            <Text style={s.gatedText}>Showing top 3 · location blurred. Upgrade for full access.</Text>
            <Pressable onPress={() => router.push("/subscription")}><Text style={s.gatedLink}>Upgrade →</Text></Pressable>
          </View>
        )}
        {hds.map(h => (
          <Pressable key={h.id} testID={`hd-${h.id}`} onPress={() => router.push(`/hairdresser/${h.id}`)} style={s.hdRow}>
            <Image source={{ uri: h.cover_photo }} style={s.hdImg} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={s.hdName}>{h.name}</Text>
              <Text style={s.hdSalon}>{h.salon_name}</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: 2 }}>
                <Feather name="star" size={12} color={colors.brand} />
                <Text style={s.hdMeta}>{h.rating_avg?.toFixed(1)} ({h.reviews_count})</Text>
              </View>
              <Text style={s.hdAddr}>{h.address}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        ))}
        {hds.length === 0 && <Text style={{ fontFamily: font.body, color: colors.muted }}>No stylists match this style yet.</Text>}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  cat: { color: "#E8CBBF", letterSpacing: 3, fontSize: 11, fontFamily: font.bodyMed },
  title: { color: "#F9F6F0", fontFamily: font.display, fontSize: 44, lineHeight: 48, marginTop: spacing.sm },
  metaLabel: { fontFamily: font.bodyMed, color: colors.muted, letterSpacing: 2, fontSize: 10 },
  metaValue: { fontFamily: font.display, fontSize: 24, color: colors.onSurface, marginTop: 2 },
  desc: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
  section: { fontFamily: font.display, fontSize: 22, color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.sm },
  gated: { padding: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radii.md, flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  gatedText: { flex: 1, fontFamily: font.bodyMed, color: colors.onBrandTertiary, fontSize: 12 },
  gatedLink: { fontFamily: font.bodyBold, color: colors.brandSecondary, fontSize: 13 },
  hdRow: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginBottom: spacing.sm },
  hdImg: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.surfaceSecondary },
  hdName: { fontFamily: font.display, fontSize: 17, color: colors.onSurface },
  hdSalon: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12 },
  hdMeta: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12 },
  hdAddr: { fontFamily: font.body, color: colors.muted, fontSize: 11, marginTop: 2 },
});
