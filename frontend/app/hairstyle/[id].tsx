/**
 * Style Detail — Sprint 2 premium redesign.
 *
 * DOES NOT show a booking CTA. Instead shows "Professionals near you who
 * specialize in this style" + similar styles + full metadata (difficulty,
 * hair length, maintenance, lasts, recommended for).
 */
import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, font, radii } from "@/src/theme";
import StyleCard, { Hairstyle } from "@/src/components/StyleCard";
import { cldTransform } from "@/src/utils/cloudinary";
const durationLabel = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

export default function HairstyleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [style, setStyle] = useState<any>(null);
  const [hds, setHds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [st, res] = await Promise.all([api(`/hairstyles/${id}`), api(`/hairstyles/${id}/hairdressers`)]);
        setStyle(st); setHds(res.results);
        api(`/hairstyles/${id}/view`, { method: "POST" }).catch(() => {});
      } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><ActivityIndicator color={colors.brand} /></View>;
  if (!style) return null;

  const isSaved = !!style.is_saved;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* ---------- Hero ---------- */}
        <View style={{ height: 520 }}>
          <Image
            source={{ uri: cldTransform(style.cover_photo, { w: 900, q: "auto" }) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={220}
            placeholder={{ blurhash: "L6PZfSjE.AyE_3t7t7Rj~qofbHof" }}
          />
          <LinearGradient colors={["rgba(0,0,0,0.35)", "transparent", "rgba(0,0,0,0.75)"]} style={StyleSheet.absoluteFill} />

          {/* Nav row */}
          <View style={[s.navRow, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable testID="hs-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={s.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
              <Feather name="arrow-left" size={20} color="#fff" />
            </Pressable>
            <View style={{ flex: 1 }} />
          </View>

          {/* Hero text */}
          <View style={s.heroText}>
            {(style.tags || []).includes("trending") && (
              <View style={s.heroBadge}>
                <Feather name="trending-up" size={10} color="#fff" />
                <Text style={s.heroBadgeText}>TRENDING</Text>
              </View>
            )}
            <Text style={s.cat}>{(style.category || "").toUpperCase()}</Text>
            <Text testID="style-name" style={s.title}>{style.name}</Text>
            <View style={s.heroMetaRow}>
              <View style={s.heroMeta}>
                <Feather name="users" size={11} color="#F5EFE7" />
                <Text style={s.heroMetaText}>{style.nearby_pros_count || 0} pros nearby</Text>
              </View>
              <View style={s.heroMeta}>
                <Feather name="heart" size={11} color="#F5EFE7" />
                <Text style={s.heroMetaText}>{(style.saves_count || 0).toLocaleString()} saves</Text>
              </View>
              <View style={s.heroMeta}>
                <Feather name="award" size={11} color="#F5EFE7" />
                <Text style={s.heroMetaText}>Style Score {Math.round(style.style_score || 0)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ---------- Facts grid ---------- */}
        <View style={s.factGrid}>
          <Fact icon="dollar-sign" label="From" value={`$${Math.round(style.avg_price)}`} />
          <Fact icon="clock" label="Duration" value={durationLabel(style.avg_duration_min)} />
          <Fact icon="bar-chart-2" label="Difficulty" value={style.difficulty || "Medium"} />
          <Fact icon="scissors" label="Hair length" value={style.hair_length || "Long"} />
          <Fact icon="calendar" label="Lasts" value={`~${style.lasts_weeks || 6} wks`} />
          <Fact icon="droplet" label="Maintenance" value={style.maintenance || "Low"} />
        </View>

        {/* ---------- Style Intelligence ---------- */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xxl }}>
          <View style={si.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <LinearGradient colors={["#F5C77E", "#B78141", "#8B5A2B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={si.badge}>
                <Text style={si.badgeScore}>{Math.round(style.style_score || 0)}</Text>
                <Text style={si.badgeMax}>/100</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={si.title}>Style Intelligence</Text>
                <Text style={si.desc}>BraidsCommunity&apos;s proprietary score — powered by real customer signals.</Text>
              </View>
            </View>
            <View style={si.chipRow}>
              {(style.tags || []).includes("trending") && <SIChip emoji="🔥" text="Trending" />}
              {(style.saves_count || 0) > 2000 && <SIChip emoji="❤️" text="Loved by the community" />}
              {(style.style_score || 0) >= 90 && <SIChip emoji="⭐" text="Highly rated" />}
              {(style.lasts_weeks || 0) >= 8 && <SIChip emoji="⏳" text="Long lasting" />}
              {(style.tags || []).includes("protective") && <SIChip emoji="💪" text="Protective style" />}
              <SIChip emoji="👩🏿" text="Suitable for most hair types" />
            </View>
            <Text style={si.formula}>
              Score blends popularity, saves, ratings, appointments, professional recommendations, 30-day trend growth, difficulty, maintenance and average longevity.
            </Text>
          </View>
        </View>

        {/* ---------- Description ---------- */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.md }}>
          <Text style={s.section}>About this style</Text>
          <Text style={s.desc}>{style.description}</Text>
        </View>

        {/* ---------- Recommended for ---------- */}
        {(style.recommended_for || []).length > 0 && (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <Text style={s.section}>Recommended for</Text>
            <View style={s.chipRow}>
              {(style.recommended_for || []).map((r: string) => (
                <View key={r} style={s.recChip}><Text style={s.recChipText}>{r}</Text></View>
              ))}
            </View>
          </View>
        )}

        {/* ---------- Pros near you ---------- */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xxl }}>
          <Text style={s.section}>Professionals near you</Text>
          <Text style={s.sub}>Braiders who specialize in {style.name}.</Text>

          <Pressable testID="compare-cta" onPress={() => router.push(`/compare/${style.id}`)} style={s.compareCta}>
            <Feather name="git-compare" size={15} color="#fff" />
            <Text style={s.compareCtaText}>Compare all braiders side-by-side</Text>
          </Pressable>

          {hds.length === 0 && <Text style={s.empty}>No specialists have added this style yet. Check back soon.</Text>}
          {hds.map((h) => (
            <Pressable key={h.id} testID={`hd-${h.id}`} onPress={() => router.push(`/hairdresser/${h.id}`)} style={s.hdRow}>
              <Image source={{ uri: h.cover_photo }} style={s.hdImg} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                  <Text style={s.hdName}>{h.name}</Text>
                  {h.verification_status === "approved" && (
                    <Feather name="check-circle" size={12} color={colors.brand} />
                  )}
                </View>
                <Text style={s.hdSalon}>{h.salon_name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                  <Feather name="star" size={11} color={colors.brand} />
                  <Text style={s.hdMeta}>{h.rating_avg?.toFixed(1) || "—"} ({h.reviews_count || 0})</Text>
                  <Text style={s.dot}>·</Text>
                  <Text style={s.hdMeta}>{h.address}</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        {/* ---------- Similar styles ---------- */}
        {(style.similar || []).length > 0 && (
          <View style={{ marginTop: spacing.xxl }}>
            <Text style={[s.section, { paddingHorizontal: spacing.xl }]}>You&apos;ll also love</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}
            >
              {(style.similar as Hairstyle[]).map((sim) => (
                <StyleCard key={sim.id} style={sim} variant="compact" onPress={() => router.replace({ pathname: "/hairstyle/[id]", params: { id: sim.id } })} />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}


function Fact({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.fact}>
      <Feather name={icon} size={14} color={colors.brand} />
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{value}</Text>
    </View>
  );
}


function SIChip({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={si.chip}>
      <Text style={{ fontSize: 12 }}>{emoji}</Text>
      <Text style={si.chipText}>{text}</Text>
    </View>
  );
}


const si = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: 22, backgroundColor: "#FAF6EF", borderWidth: 1, borderColor: "#EBDEC5" },
  badge: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.6)" },
  badgeScore: { color: "#fff", fontFamily: font.display, fontSize: 22, lineHeight: 24 },
  badgeMax: { color: "#fff", fontFamily: font.body, fontSize: 9, opacity: 0.9, marginTop: -2 },
  title: { fontFamily: font.display, fontSize: 20, color: colors.onSurface },
  desc: { fontFamily: font.body, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2, lineHeight: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.md },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: "#fff", borderWidth: 1, borderColor: "#EBDEC5" },
  chipText: { fontFamily: font.bodyMed, fontSize: 11, color: colors.onSurfaceSecondary },
  formula: { fontFamily: font.body, fontSize: 10, color: colors.onSurfaceTertiary, marginTop: spacing.md, lineHeight: 15 },
});


const s = StyleSheet.create({
  navRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  heroText: { position: "absolute", bottom: spacing.xl, left: spacing.xl, right: spacing.xl },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.pill, alignSelf: "flex-start", marginBottom: spacing.sm },
  heroBadgeText: { color: "#fff", fontFamily: font.bodyBold, fontSize: 9, letterSpacing: 1 },
  cat: { color: "#E8CBBF", letterSpacing: 3, fontSize: 11, fontFamily: font.bodyMed },
  title: { color: "#F9F6F0", fontFamily: font.display, fontSize: 42, lineHeight: 46, marginTop: spacing.xs },
  heroMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroMetaText: { color: "#F5EFE7", fontFamily: font.bodyMed, fontSize: 11 },

  factGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.xl - spacing.xs, paddingTop: spacing.xl },
  fact: { width: "33.33%", paddingHorizontal: spacing.xs, marginBottom: spacing.md },
  factLabel: { fontFamily: font.bodyMed, fontSize: 10, color: colors.onSurfaceTertiary, letterSpacing: 1, marginTop: 4 },
  factValue: { fontFamily: font.bodyBold, fontSize: 14, color: colors.onSurface, marginTop: 2 },

  section: { fontFamily: font.display, fontSize: 22, color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.xs },
  sub: { fontFamily: font.body, fontSize: 12, color: colors.onSurfaceTertiary, marginBottom: spacing.md },
  desc: { fontFamily: font.body, color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  recChip: { paddingHorizontal: spacing.md, height: 30, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center" },
  recChipText: { fontFamily: font.bodyMed, fontSize: 11, color: colors.onSurfaceSecondary },

  compareCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceInverse, borderRadius: radii.md, marginBottom: spacing.md, marginTop: spacing.sm },
  compareCtaText: { color: colors.onSurfaceInverse, fontFamily: font.bodyBold, fontSize: 14 },

  gated: { padding: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radii.md, flexDirection: "row", gap: spacing.sm, alignItems: "center", marginBottom: spacing.sm },
  gatedText: { flex: 1, fontFamily: font.bodyMed, color: colors.onBrandTertiary, fontSize: 12 },
  gatedLink: { fontFamily: font.bodyBold, color: colors.brandSecondary, fontSize: 13 },

  hdRow: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginBottom: spacing.sm },
  hdImg: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surfaceSecondary },
  hdName: { fontFamily: font.bodyBold, fontSize: 15, color: colors.onSurface },
  hdSalon: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 1 },
  hdMeta: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 11 },
  dot: { color: colors.muted, marginHorizontal: 2, fontSize: 10 },
  empty: { fontFamily: font.body, color: colors.muted, textAlign: "center", padding: spacing.xl },
});
