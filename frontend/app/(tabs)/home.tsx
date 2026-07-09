import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useSession } from "@/src/session";
import { colors, spacing, font, radii } from "@/src/theme";

type Style = { id: string; name: string; category: string; description: string; avg_price: number; avg_duration_min: number; cover_photo: string };

export default function Home() {
  const { user } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [styles_, setStyles] = useState<Style[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (c: string | null) => {
    const q = c ? `?category=${encodeURIComponent(c)}` : "";
    const [list, catRes] = await Promise.all([api(`/hairstyles${q}`), api(`/hairstyles/categories`)]);
    setStyles(list);
    setCats(catRes.categories);
  }, []);

  useEffect(() => { (async () => { setLoading(true); await load(cat); setLoading(false); })(); }, [cat, load]);

  const onRefresh = async () => { setRefreshing(true); await load(cat); setRefreshing(false); };

  const [hero, ...rest] = styles_;

  return (
    <ScrollView
      testID="home-screen"
      style={{ backgroundColor: colors.surface }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
    >
      <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl }}>
        <Text style={s.eyebrow}>THE EDIT · {new Date().toLocaleDateString("en", { weekday: "long" }).toUpperCase()}</Text>
        <Text style={s.title}>Hello, {user?.name?.split(" ")[0] || "friend"}.</Text>
        <Text style={s.subtitle}>Discover braid artists in your city.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        <Pressable testID="cat-chip-all" onPress={() => setCat(null)} style={[s.chip, cat === null && s.chipActive]}>
          <Text style={[s.chipText, cat === null && s.chipTextActive]}>All</Text>
        </Pressable>
        {cats.map(c => (
          <Pressable key={c} testID={`cat-chip-${c}`} onPress={() => setCat(c)} style={[s.chip, cat === c && s.chipActive]}>
            <Text style={[s.chipText, cat === c && s.chipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.brand} />
      ) : (
        <>
          {hero && (
            <Pressable testID={`style-hero-${hero.id}`} onPress={() => router.push(`/hairstyle/${hero.id}`)} style={s.hero}>
              <Image source={{ uri: hero.cover_photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={StyleSheet.absoluteFill} />
              <View style={s.heroContent}>
                <Text style={s.heroCat}>{hero.category.toUpperCase()}</Text>
                <Text style={s.heroTitle}>{hero.name}</Text>
                <Text style={s.heroMeta}>from ${hero.avg_price} · {Math.round(hero.avg_duration_min / 60)}h</Text>
              </View>
            </Pressable>
          )}

          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xxl }}>
            <Text style={s.sectionTitle}>Trending styles</Text>
          </View>
          <View style={s.grid}>
            {rest.map(st => (
              <Pressable key={st.id} testID={`style-card-${st.id}`} onPress={() => router.push(`/hairstyle/${st.id}`)} style={s.card}>
                <Image source={{ uri: st.cover_photo }} style={s.cardImg} contentFit="cover" transition={200} />
                <Text style={s.cardTitle}>{st.name}</Text>
                <Text style={s.cardMeta}>from ${st.avg_price}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  eyebrow: { fontFamily: font.bodyMed, color: colors.brand, letterSpacing: 2.5, fontSize: 10 },
  title: { fontFamily: font.display, fontSize: 34, lineHeight: 38, color: colors.onSurface, marginTop: spacing.sm },
  subtitle: { fontFamily: font.body, color: colors.onSurfaceTertiary, fontSize: 15, marginTop: spacing.xs, marginBottom: spacing.lg },
  chipRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md },
  chip: { paddingHorizontal: spacing.lg, height: 36, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: font.bodyMed, color: colors.onSurface, fontSize: 13 },
  chipTextActive: { color: colors.onSurfaceInverse },
  hero: { height: 420, marginTop: spacing.md, marginHorizontal: spacing.xl, borderRadius: radii.lg, overflow: "hidden" },
  heroContent: { flex: 1, justifyContent: "flex-end", padding: spacing.xl },
  heroCat: { color: "#E8CBBF", letterSpacing: 3, fontSize: 10, fontFamily: font.bodyMed },
  heroTitle: { color: "#F9F6F0", fontFamily: font.display, fontSize: 38, lineHeight: 42, marginTop: spacing.sm },
  heroMeta: { color: "#F9F6F0", fontFamily: font.body, fontSize: 13, marginTop: spacing.sm, opacity: 0.9 },
  sectionTitle: { fontFamily: font.display, fontSize: 22, color: colors.onSurface, marginBottom: spacing.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, gap: spacing.md, justifyContent: "space-between" },
  card: { width: "47%", marginBottom: spacing.lg },
  cardImg: { width: "100%", aspectRatio: 0.8, backgroundColor: colors.surfaceSecondary, borderRadius: radii.md },
  cardTitle: { fontFamily: font.display, fontSize: 18, color: colors.onSurface, marginTop: spacing.sm },
  cardMeta: { fontFamily: font.body, fontSize: 12, color: colors.muted, marginTop: 2 },
});
